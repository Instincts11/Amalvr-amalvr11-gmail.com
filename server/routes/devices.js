import { audit } from '../audit.js';
import { bumpPermVersion, newId, nowIso } from '../db.js';
import { HttpError, badRequest, forbidden, normalizeTs, notFound, send } from '../http.js';
import { endActiveSessions } from '../lifecycle.js';
import { assertMayGrant, resolve, resolveDevices } from '../permissions.js';
import { allow } from './guard.js';

const KINDS = new Set(['macos', 'windows', 'linux', 'android', 'ios']);

function visibleDevice(db, orgId, deviceId) {
  const row = db.prepare(
    `SELECT id, org_id, name, kind, online, deleted_at FROM devices WHERE id = ? AND org_id = ?`
  ).get(deviceId, orgId);
  if (!row || row.deleted_at) throw notFound();
  return row;
}

function deviceJson(row, permissions) {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    online: row.online === 1,
    permissions,
  };
}

export function registerDevices(router, { db }) {
  router.get('/v1/orgs/:org/devices', (ctx, params, res) => {
    allow(db, ctx, 'device:list', null, { action: 'device.list', targetType: 'org', targetId: params.org });
    const rows = db.prepare(
      `SELECT id, name, kind, online FROM devices WHERE org_id = ? AND deleted_at IS NULL ORDER BY name`
    ).all(params.org);
    const resolved = resolveDevices(db, {
      userId: ctx.userId,
      orgId: params.org,
      deviceIds: rows.map((row) => row.id),
    });
    const devices = [];
    for (const row of rows) {
      const permissions = resolved.byDevice[row.id];
      if (permissions['device:view']?.effect !== 'allow') continue;
      devices.push(deviceJson(row, permissions));
    }
    send(res, 200, { devices });
  });

  router.get('/v1/orgs/:org/devices/:id', (ctx, params, res) => {
    const row = db.prepare(
      `SELECT id, name, kind, online, deleted_at FROM devices WHERE id = ? AND org_id = ?`
    ).get(params.id, params.org);
    if (!row || row.deleted_at) throw notFound();
    if (ctx.membership.status !== 'active') throw forbidden('membership is not active', 'suspended');
    const resolved = resolveDevices(db, { userId: ctx.userId, orgId: params.org, deviceIds: [row.id] });
    const permissions = resolved.byDevice[row.id];
    if (permissions['device:view']?.effect !== 'allow') throw notFound();
    send(res, 200, deviceJson(row, permissions));
  });

  router.post('/v1/orgs/:org/devices', (ctx, params, res) => {
    allow(db, ctx, 'device:provision', null, { action: 'device.create', targetType: 'org', targetId: params.org });
    const name = String(ctx.body.name ?? '').trim();
    const kind = String(ctx.body.kind ?? '');
    if (!name || name.length > 80) throw badRequest('name is required');
    if (!KINDS.has(kind)) throw badRequest('kind must be macos, windows, linux, android, or ios');
    const id = newId('dev');
    const online = ctx.body.online ? 1 : 0;
    const write = db.transaction(() => {
      db.prepare(`INSERT INTO devices (id, org_id, name, kind, online) VALUES (?, ?, ?, ?, ?)`).run(
        id, params.org, name, kind, online
      );
      audit(db, {
        orgId: params.org, actorId: ctx.userId, action: 'device.create',
        targetType: 'device', targetId: id, result: 'allow', requestId: ctx.requestId,
      });
    });
    write();
    const resolved = resolveDevices(db, { userId: ctx.userId, orgId: params.org, deviceIds: [id] });
    send(res, 201, deviceJson({ id, name, kind, online }, resolved.byDevice[id]));
  });

  router.patch('/v1/orgs/:org/devices/:id', (ctx, params, res) => {
    allow(db, ctx, 'device:update', params.id, { action: 'device.update', targetType: 'device', targetId: params.id });
    const row = visibleDevice(db, params.org, params.id);
    const name = ctx.body.name === undefined ? null : String(ctx.body.name).trim();
    const kind = ctx.body.kind === undefined ? null : String(ctx.body.kind);
    if (name !== null && (!name || name.length > 80)) throw badRequest('name is required');
    if (kind !== null && !KINDS.has(kind)) throw badRequest('kind must be macos, windows, linux, android, or ios');
    const online = ctx.body.online === undefined ? null : ctx.body.online ? 1 : 0;
    const write = db.transaction(() => {
      if (name) db.prepare(`UPDATE devices SET name = ? WHERE id = ?`).run(name, row.id);
      if (kind) db.prepare(`UPDATE devices SET kind = ? WHERE id = ?`).run(kind, row.id);
      if (online !== null) db.prepare(`UPDATE devices SET online = ? WHERE id = ?`).run(online, row.id);
      audit(db, {
        orgId: params.org, actorId: ctx.userId, action: 'device.update',
        targetType: 'device', targetId: row.id, result: 'allow', requestId: ctx.requestId,
      });
    });
    write();
    const updated = db.prepare(`SELECT id, name, kind, online FROM devices WHERE id = ?`).get(row.id);
    const resolved = resolveDevices(db, { userId: ctx.userId, orgId: params.org, deviceIds: [row.id] });
    send(res, 200, deviceJson(updated, resolved.byDevice[row.id]));
  });

  router.delete('/v1/orgs/:org/devices/:id', (ctx, params, res) => {
    allow(db, ctx, 'device:provision', null, { action: 'device.delete', targetType: 'device', targetId: params.id });
    visibleDevice(db, params.org, params.id);
    const write = db.transaction(() => {
      db.prepare(`UPDATE devices SET deleted_at = ? WHERE id = ?`).run(nowIso(), params.id);
      endActiveSessions(db, { orgId: params.org, deviceId: params.id, reason: 'device_transferred' });
      audit(db, {
        orgId: params.org, actorId: ctx.userId, action: 'device.delete',
        targetType: 'device', targetId: params.id, result: 'allow', requestId: ctx.requestId,
      });
    });
    write();
    send(res, 200, { id: params.id, deleted: true });
  });

  router.post('/v1/orgs/:org/devices/:id/transfer', (ctx, params, res) => {
    allow(db, ctx, 'device:provision', null, { action: 'device.transfer', targetType: 'device', targetId: params.id });
    const toOrgId = String(ctx.body.toOrgId ?? '');
    if (!toOrgId) throw badRequest('toOrgId is required');
    if (toOrgId === params.org) throw badRequest('device is already in this organization');
    visibleDevice(db, params.org, params.id);

    const targetOrg = db.prepare(`SELECT id FROM organizations WHERE id = ? AND deleted_at IS NULL`).get(toOrgId);
    const targetMembership = db.prepare(
      `SELECT status FROM memberships WHERE org_id = ? AND user_id = ?`
    ).get(toOrgId, ctx.userId);
    if (!targetOrg || !targetMembership || targetMembership.status !== 'active') throw notFound();

    const targetPerm = resolve(db, { userId: ctx.userId, orgId: toOrgId }).permissions['device:provision'];
    if (targetPerm?.effect !== 'allow') {
      throw forbidden('missing device:provision in the destination organization', 'missing_permission');
    }

    const write = db.transaction(() => {
      db.prepare(`UPDATE devices SET org_id = ? WHERE id = ?`).run(toOrgId, params.id);
      endActiveSessions(db, { deviceId: params.id, reason: 'device_transferred' });
      const grants = db.prepare(
        `SELECT id, user_id FROM grants WHERE org_id = ? AND device_id = ? AND revoked_at IS NULL`
      ).all(params.org, params.id);
      const revoke = db.prepare(`UPDATE grants SET revoked_at = ? WHERE id = ?`);
      const now = nowIso();
      for (const grant of grants) {
        revoke.run(now, grant.id);
        bumpPermVersion(db, { orgId: params.org, userId: grant.user_id });
      }
      audit(db, {
        orgId: params.org, actorId: ctx.userId, action: 'device.transfer',
        targetType: 'device', targetId: params.id, result: 'allow', requestId: ctx.requestId,
      });
    });
    write();
    send(res, 200, { id: params.id, orgId: toOrgId });
  });

  router.post('/v1/orgs/:org/devices/:id/file-transfer', (ctx, params, res) => {
    visibleDevice(db, params.org, params.id);
    allow(db, ctx, 'device:file_transfer', params.id, {
      action: 'device.file_transfer', targetType: 'device', targetId: params.id,
    });
    audit(db, {
      orgId: params.org, actorId: ctx.userId, action: 'device.file_transfer',
      targetType: 'device', targetId: params.id, result: 'allow', requestId: ctx.requestId,
    });
    send(res, 202, { id: params.id, recorded: true, movedBytes: false });
  });

  router.post('/v1/orgs/:org/grants', (ctx, params, res) => {
    const permissions = Array.isArray(ctx.body.permissions) ? [...new Set(ctx.body.permissions.map(String))] : null;
    const effect = String(ctx.body.effect ?? '');
    const userId = String(ctx.body.userId ?? '');
    const deviceId = ctx.body.deviceId ? String(ctx.body.deviceId) : null;
    if (!permissions || permissions.length === 0) throw badRequest('permissions must be a non-empty list');
    if (effect !== 'allow' && effect !== 'deny') throw badRequest('effect must be allow or deny');
    if (!userId) throw badRequest('userId is required');

    const known = new Set(db.prepare('SELECT pattern FROM permission_patterns').all().map((row) => row.pattern));
    if (permissions.some((permission) => !known.has(permission))) {
      throw badRequest('unknown permission', 'unknown_permission');
    }

    allow(db, ctx, 'grant:create', null, { action: 'grant.create', targetType: 'user', targetId: userId });
    if (userId === ctx.userId) throw forbidden('you cannot grant to yourself', 'self_grant');

    const target = db.prepare(`SELECT status FROM memberships WHERE org_id = ? AND user_id = ?`).get(params.org, userId);
    if (!target || target.status !== 'active') throw notFound();
    if (deviceId) visibleDevice(db, params.org, deviceId);

    const startsAt = normalizeTs(ctx.body.startsAt ?? ctx.body.starts_at, 'startsAt');
    const expiresAt = normalizeTs(ctx.body.expiresAt ?? ctx.body.expires_at, 'expiresAt');
    if (expiresAt && expiresAt <= nowIso()) {
      throw new HttpError(400, 'GRANT_EXPIRED', 'grant is already expired', 'expired_grant');
    }
    if (startsAt && expiresAt && expiresAt <= startsAt) throw badRequest('expiresAt must be after startsAt');

    assertMayGrant(db, ctx, permissions, deviceId);

    const id = newId('grt');
    try {
      const write = db.transaction(() => {
        db.prepare(
          `INSERT INTO grants (id, org_id, user_id, device_id, effect, starts_at, expires_at, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(id, params.org, userId, deviceId, effect, startsAt, expiresAt, ctx.userId);
        const link = db.prepare(`INSERT INTO grant_permissions (grant_id, permission) VALUES (?, ?)`);
        for (const permission of permissions) link.run(id, permission);
        bumpPermVersion(db, { orgId: params.org, userId });
        audit(db, {
          orgId: params.org, actorId: ctx.userId, action: 'grant.create',
          targetType: 'grant', targetId: id, result: 'allow', requestId: ctx.requestId,
        });
      });
      write();
    } catch (err) {
      if (err instanceof HttpError) throw err;
      if (err?.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') throw badRequest('unknown permission', 'unknown_permission');
      throw err;
    }
    send(res, 201, { id, userId, deviceId, effect, permissions, startsAt, expiresAt });
  });

  router.get('/v1/orgs/:org/grants', (ctx, params, res) => {
    allow(db, ctx, 'user:read', null, { action: 'grant.list', targetType: 'org', targetId: params.org });
    const rows = db.prepare(
      `SELECT id, user_id, device_id, effect, starts_at, expires_at, created_by, created_at
         FROM grants WHERE org_id = ? AND revoked_at IS NULL ORDER BY created_at`
    ).all(params.org);
    const links = db.prepare(
      `SELECT gp.grant_id, gp.permission
         FROM grant_permissions gp
         JOIN grants g ON g.id = gp.grant_id
        WHERE g.org_id = ? AND g.revoked_at IS NULL`
    ).all(params.org);
    const byGrant = new Map();
    for (const link of links) {
      if (!byGrant.has(link.grant_id)) byGrant.set(link.grant_id, []);
      byGrant.get(link.grant_id).push(link.permission);
    }
    send(res, 200, {
      grants: rows.map((row) => ({ ...row, permissions: byGrant.get(row.id) ?? [] })),
    });
  });

  router.delete('/v1/orgs/:org/grants/:id', (ctx, params, res) => {
    allow(db, ctx, 'grant:revoke', null, { action: 'grant.revoke', targetType: 'grant', targetId: params.id });
    const row = db.prepare(
      `SELECT id, user_id FROM grants WHERE id = ? AND org_id = ? AND revoked_at IS NULL`
    ).get(params.id, params.org);
    if (!row) throw notFound();
    const write = db.transaction(() => {
      db.prepare(`UPDATE grants SET revoked_at = ? WHERE id = ?`).run(nowIso(), row.id);
      bumpPermVersion(db, { orgId: params.org, userId: row.user_id });
      audit(db, {
        orgId: params.org, actorId: ctx.userId, action: 'grant.revoke',
        targetType: 'grant', targetId: row.id, result: 'allow', requestId: ctx.requestId,
      });
    });
    write();
    send(res, 200, { id: row.id, revoked: true });
  });
}
