import { audit, auditDenials } from '../audit.js';
import { newId } from '../db.js';
import { badRequest, deviceBusy, notFound, send } from '../http.js';
import { expireDueSessions, sessionExpiry, snapshotAuthority } from '../lifecycle.js';
import { MODE_PERMISSION, assertCanStartSession } from '../permissions.js';
import { allow, assertActive } from './guard.js';

function sessionJson(row) {
  return {
    id: row.id,
    org_id: row.org_id,
    user_id: row.user_id,
    device_id: row.device_id,
    mode: row.mode,
    state: row.state,
    end_reason: row.end_reason,
    started_at: row.started_at,
    expires_at: row.expires_at,
    ended_at: row.ended_at,
  };
}

function loadSession(db, id) {
  return db.prepare(
    `SELECT id, org_id, user_id, device_id, mode, state, end_reason, started_at, expires_at, ended_at
       FROM sessions WHERE id = ?`
  ).get(id);
}

export function registerSessions(router, { db }) {
  router.post('/v1/orgs/:org/sessions', (ctx, params, res) => {
    const deviceId = String(ctx.body.deviceId ?? '');
    const mode = String(ctx.body.mode ?? '');
    if (!deviceId) throw badRequest('deviceId is required');
    if (!MODE_PERMISSION[mode]) throw badRequest('mode must be view, control, or terminal');

    const device = db.prepare(
      `SELECT id FROM devices WHERE id = ? AND org_id = ? AND deleted_at IS NULL`
    ).get(deviceId, params.org);
    if (!device) throw notFound();

    assertActive(ctx);
    expireDueSessions(db, params.org);
    auditDenials(db, ctx, { action: 'session.start', targetType: 'device', targetId: deviceId }, () => {
      assertCanStartSession(db, ctx, mode, deviceId);
    });

    const id = newId('ses');
    const expiresAt = sessionExpiry(db, params.org);
    const authorizedBy = JSON.stringify(snapshotAuthority(db, { userId: ctx.userId, orgId: params.org, deviceId }));
    try {
      const write = db.transaction(() => {
        db.prepare(
          `INSERT INTO sessions (id, org_id, user_id, device_id, mode, state, authorized_by, expires_at)
           VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`
        ).run(id, params.org, ctx.userId, deviceId, mode, authorizedBy, expiresAt);
        audit(db, {
          orgId: params.org, actorId: ctx.userId, action: 'session.start',
          targetType: 'device', targetId: deviceId, result: 'allow', requestId: ctx.requestId,
        });
      });
      write();
    } catch (err) {
      if (String(err?.code ?? '').startsWith('SQLITE_CONSTRAINT')) {
        const holder = db.prepare(
          `SELECT id FROM sessions
            WHERE device_id = ? AND state = 'active' AND mode IN ('control', 'terminal')`
        ).get(deviceId);
        throw deviceBusy(`exclusive session ${holder?.id ?? 'unknown'} already holds this device`);
      }
      throw err;
    }
    send(res, 201, sessionJson(loadSession(db, id)));
  });

  router.get('/v1/orgs/:org/sessions', (ctx, params, res) => {
    allow(db, ctx, 'session:view', null, { action: 'session.list', targetType: 'org', targetId: params.org });
    expireDueSessions(db, params.org);
    const rows = db.prepare(
      `SELECT id, org_id, user_id, device_id, mode, state, end_reason, started_at, expires_at, ended_at
         FROM sessions WHERE org_id = ? ORDER BY started_at DESC`
    ).all(params.org);
    send(res, 200, { sessions: rows.map(sessionJson) });
  });

  router.get('/v1/sessions/:id', (ctx, params, res) => {
    expireDueSessions(db, ctx.orgId);
    const row = loadSession(db, params.id);
    if (!row || row.org_id !== ctx.orgId) throw notFound();
    if (row.user_id !== ctx.userId) {
      allow(db, ctx, 'session:view', null, { action: 'session.view', targetType: 'session', targetId: row.id });
    } else {
      assertActive(ctx);
    }
    send(res, 200, sessionJson(loadSession(db, row.id)));
  });

  router.delete('/v1/sessions/:id', (ctx, params, res) => {
    const row = loadSession(db, params.id);
    if (!row || row.org_id !== ctx.orgId || row.state !== 'active') throw notFound();
    const own = row.user_id === ctx.userId;
    if (!own) {
      allow(db, ctx, 'session:terminate', null, {
        action: 'session.stop', targetType: 'session', targetId: row.id,
      });
    } else {
      assertActive(ctx);
    }
    const reason = own ? 'user_stopped' : 'admin_terminated';
    const write = db.transaction(() => {
      db.prepare(
        `UPDATE sessions SET state = 'ended', end_reason = ?, ended_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
          WHERE id = ? AND state = 'active'`
      ).run(reason, row.id);
      audit(db, {
        orgId: row.org_id, actorId: ctx.userId, action: 'session.stop',
        targetType: 'session', targetId: row.id, result: 'allow', requestId: ctx.requestId,
      });
    });
    write();
    send(res, 200, sessionJson(loadSession(db, row.id)));
  });
}
