import { audit } from '../audit.js';
import { newId, nowIso, bumpPermVersion } from '../db.js';
import {
  badRequest,
  conflict,
  forbidden,
  notFound,
  selfRoleChange,
  send,
} from '../http.js';
import {
  assertCanAssignRole,
  assertCanModify,
  assertNotLastOwner,
  assertRoleExists,
  endActiveSessions,
} from '../lifecycle.js';
import { resolve } from '../permissions.js';
import { allow } from './guard.js';

const THEMES = ['cobalt', 'amber', 'moss', 'plum', 'rust', 'teal', 'pine', 'iris'];

function liveOrg(db, orgId) {
  return db.prepare(
    `SELECT id, name, theme, max_session_minutes FROM organizations WHERE id = ? AND deleted_at IS NULL`
  ).get(orgId);
}

function member(db, orgId, userId) {
  return db.prepare(
    `SELECT m.*, u.email, u.name
       FROM memberships m
       JOIN users u ON u.id = m.user_id
      WHERE m.org_id = ? AND m.user_id = ?`
  ).get(orgId, userId);
}

function requireVisibleMember(db, orgId, userId) {
  const row = member(db, orgId, userId);
  if (!row || row.status === 'removed') throw notFound();
  return row;
}

export function registerOrgs(router, { db }) {
  router.get('/v1/orgs', (ctx, _params, res) => {
    const orgs = db.prepare(
      `SELECT o.id, o.name, o.theme, m.role
         FROM memberships m
         JOIN organizations o ON o.id = m.org_id
        WHERE m.user_id = ? AND m.status = 'active' AND o.deleted_at IS NULL
        ORDER BY o.name COLLATE NOCASE`
    ).all(ctx.userId);
    send(res, 200, { orgs });
  });

  router.post('/v1/orgs', (ctx, _params, res) => {
    const name = String(ctx.body.name ?? '').trim();
    if (!name || name.length > 80) throw badRequest('name is required');
    let theme = String(ctx.body.theme ?? '').trim().toLowerCase();
    if (theme && !/^[a-z][a-z0-9-]{0,20}$/.test(theme)) throw badRequest('theme must be a short slug');
    if (!theme) {
      const used = new Set(
        db.prepare(`SELECT theme FROM organizations WHERE deleted_at IS NULL`).all().map((row) => row.theme)
      );
      theme = THEMES.find((item) => !used.has(item)) ?? 'pine';
    }
    const duplicate = db.prepare(
      `SELECT id FROM organizations WHERE deleted_at IS NULL AND name = ? COLLATE NOCASE`
    ).get(name);
    if (duplicate) throw conflict('an organization with that name already exists');

    const id = newId('org');
    const write = db.transaction(() => {
      db.prepare(`INSERT INTO organizations (id, name, theme) VALUES (?, ?, ?)`).run(id, name, theme);
      db.prepare(
        `INSERT INTO memberships (id, org_id, user_id, role, status, joined_at)
         VALUES (?, ?, ?, 'owner', 'active', ?)`
      ).run(newId('mem'), id, ctx.userId, nowIso());
      audit(db, {
        orgId: id,
        actorId: ctx.userId,
        action: 'org.create',
        targetType: 'org',
        targetId: id,
        result: 'allow',
        requestId: ctx.requestId,
      });
    });
    write();
    send(res, 201, { id, name, theme, role: 'owner' });
  });

  router.patch('/v1/orgs/:org', (ctx, params, res) => {
    allow(db, ctx, 'org:update', null, { action: 'org.update', targetType: 'org', targetId: params.org });
    if (!liveOrg(db, params.org)) throw notFound();
    const name = ctx.body.name === undefined ? null : String(ctx.body.name).trim();
    const theme = ctx.body.theme === undefined ? null : String(ctx.body.theme).trim().toLowerCase();
    let minutes = ctx.body.maxSessionMinutes;
    if (name !== null && (!name || name.length > 80)) throw badRequest('name is required');
    if (theme !== null && !/^[a-z][a-z0-9-]{0,20}$/.test(theme)) throw badRequest('theme must be a short slug');
    if (minutes !== undefined) {
      minutes = Number(minutes);
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > 24 * 60) {
        throw badRequest('maxSessionMinutes must be an integer from 1 to 1440');
      }
    }
    if (name) {
      const duplicate = db.prepare(
        `SELECT id FROM organizations WHERE deleted_at IS NULL AND name = ? COLLATE NOCASE AND id <> ?`
      ).get(name, params.org);
      if (duplicate) throw conflict('an organization with that name already exists');
    }
    const write = db.transaction(() => {
      if (name) db.prepare(`UPDATE organizations SET name = ? WHERE id = ?`).run(name, params.org);
      if (theme) db.prepare(`UPDATE organizations SET theme = ? WHERE id = ?`).run(theme, params.org);
      if (minutes !== undefined) {
        db.prepare(`UPDATE organizations SET max_session_minutes = ? WHERE id = ?`).run(minutes, params.org);
      }
      audit(db, {
        orgId: params.org,
        actorId: ctx.userId,
        action: 'org.update',
        targetType: 'org',
        targetId: params.org,
        result: 'allow',
        requestId: ctx.requestId,
      });
    });
    write();
    send(res, 200, liveOrg(db, params.org));
  });

  router.delete('/v1/orgs/:org', (ctx, params, res) => {
    allow(db, ctx, 'org:delete', null, { action: 'org.delete', targetType: 'org', targetId: params.org });
    if (!liveOrg(db, params.org)) throw notFound();
    const write = db.transaction(() => {
      db.prepare(`UPDATE organizations SET deleted_at = ? WHERE id = ?`).run(nowIso(), params.org);
      endActiveSessions(db, { orgId: params.org, reason: 'admin_terminated' });
      audit(db, {
        orgId: params.org,
        actorId: ctx.userId,
        action: 'org.delete',
        targetType: 'org',
        targetId: params.org,
        result: 'allow',
        requestId: ctx.requestId,
      });
    });
    write();
    send(res, 200, { id: params.org, deleted: true });
  });

  router.get('/v1/orgs/:org/members', (ctx, params, res) => {
    allow(db, ctx, 'user:read', null, { action: 'member.list', targetType: 'org', targetId: params.org });
    const members = db.prepare(
      `SELECT u.id, u.email, u.name, m.role, m.status
         FROM memberships m
         JOIN users u ON u.id = m.user_id
        WHERE m.org_id = ? AND m.status != 'removed'
        ORDER BY u.email`
    ).all(params.org);
    const roles = db.prepare('SELECT key, rank, label FROM roles ORDER BY rank DESC').all();
    send(res, 200, { members, roles });
  });

  router.patch('/v1/orgs/:org/members/:userId', (ctx, params, res) => {
    allow(db, ctx, 'user:role:update', null, {
      action: 'member.role',
      targetType: 'user',
      targetId: params.userId,
    });
    if (params.userId === ctx.userId) throw selfRoleChange();
    const role = String(ctx.body.role ?? '');
    assertRoleExists(db, role);
    const target = requireVisibleMember(db, params.org, params.userId);
    assertCanModify(db, ctx.role, target.role);
    assertCanAssignRole(db, ctx.role, role);
    if (role !== target.role) assertNotLastOwner(db, params.org, params.userId);
    const write = db.transaction(() => {
      db.prepare(`UPDATE memberships SET role = ? WHERE org_id = ? AND user_id = ?`).run(role, params.org, params.userId);
      bumpPermVersion(db, { orgId: params.org, userId: params.userId });
      audit(db, {
        orgId: params.org,
        actorId: ctx.userId,
        action: 'member.role',
        targetType: 'user',
        targetId: params.userId,
        result: 'allow',
        requestId: ctx.requestId,
      });
    });
    write();
    send(res, 200, { id: params.userId, role });
  });

  router.post('/v1/orgs/:org/members/:userId/suspend', (ctx, params, res) => {
    if (params.userId === ctx.userId) throw forbidden('you cannot suspend yourself');
    allow(db, ctx, 'user:remove', null, { action: 'member.suspend', targetType: 'user', targetId: params.userId });
    const target = requireVisibleMember(db, params.org, params.userId);
    assertCanModify(db, ctx.role, target.role);
    assertNotLastOwner(db, params.org, params.userId);
    const write = db.transaction(() => {
      db.prepare(
        `UPDATE memberships SET status = 'suspended' WHERE org_id = ? AND user_id = ?`
      ).run(params.org, params.userId);
      bumpPermVersion(db, { orgId: params.org, userId: params.userId });
      endActiveSessions(db, { orgId: params.org, userId: params.userId, reason: 'user_suspended' });
      audit(db, {
        orgId: params.org,
        actorId: ctx.userId,
        action: 'member.suspend',
        targetType: 'user',
        targetId: params.userId,
        result: 'allow',
        requestId: ctx.requestId,
      });
    });
    write();
    send(res, 200, { id: params.userId, status: 'suspended' });
  });

  router.delete('/v1/orgs/:org/members/:userId/suspend', (ctx, params, res) => {
    allow(db, ctx, 'user:remove', null, { action: 'member.reinstate', targetType: 'user', targetId: params.userId });
    const target = requireVisibleMember(db, params.org, params.userId);
    if (target.status !== 'suspended') throw notFound();
    assertCanModify(db, ctx.role, target.role);
    const write = db.transaction(() => {
      db.prepare(`UPDATE memberships SET status = 'active' WHERE org_id = ? AND user_id = ?`).run(params.org, params.userId);
      bumpPermVersion(db, { orgId: params.org, userId: params.userId });
      audit(db, {
        orgId: params.org,
        actorId: ctx.userId,
        action: 'member.reinstate',
        targetType: 'user',
        targetId: params.userId,
        result: 'allow',
        requestId: ctx.requestId,
      });
    });
    write();
    send(res, 200, { id: params.userId, status: 'active' });
  });

  router.delete('/v1/orgs/:org/members/me', (ctx, _params, res) => {
    assertNotLastOwner(db, ctx.orgId, ctx.userId);
    const write = db.transaction(() => {
      db.prepare(
        `UPDATE memberships SET status = 'removed' WHERE org_id = ? AND user_id = ?`
      ).run(ctx.orgId, ctx.userId);
      bumpPermVersion(db, { orgId: ctx.orgId, userId: ctx.userId });
      endActiveSessions(db, { orgId: ctx.orgId, userId: ctx.userId, reason: 'membership_removed' });
      audit(db, {
        orgId: ctx.orgId,
        actorId: ctx.userId,
        action: 'member.leave',
        targetType: 'user',
        targetId: ctx.userId,
        result: 'allow',
        requestId: ctx.requestId,
      });
    });
    write();
    send(res, 200, { id: ctx.userId, status: 'removed' });
  });

  router.delete('/v1/orgs/:org/members/:userId', (ctx, params, res) => {
    if (params.userId === ctx.userId) throw forbidden('use the leave route to remove yourself');
    allow(db, ctx, 'user:remove', null, { action: 'member.remove', targetType: 'user', targetId: params.userId });
    const target = requireVisibleMember(db, params.org, params.userId);
    assertCanModify(db, ctx.role, target.role);
    assertNotLastOwner(db, params.org, params.userId);
    const write = db.transaction(() => {
      db.prepare(
        `UPDATE memberships SET status = 'removed' WHERE org_id = ? AND user_id = ?`
      ).run(params.org, params.userId);
      bumpPermVersion(db, { orgId: params.org, userId: params.userId });
      endActiveSessions(db, { orgId: params.org, userId: params.userId, reason: 'membership_removed' });
      audit(db, {
        orgId: params.org,
        actorId: ctx.userId,
        action: 'member.remove',
        targetType: 'user',
        targetId: params.userId,
        result: 'allow',
        requestId: ctx.requestId,
      });
    });
    write();
    send(res, 200, { id: params.userId, status: 'removed' });
  });

  router.get('/v1/orgs/:org/users/:userId/effective', (ctx, params, res) => {
    if (params.userId !== ctx.userId) {
      allow(db, ctx, 'user:read', null, { action: 'member.effective', targetType: 'user', targetId: params.userId });
    }
    const target = db.prepare(
      `SELECT role, status FROM memberships WHERE org_id = ? AND user_id = ?`
    ).get(params.org, params.userId);
    if (!target || target.status === 'removed' || target.status === 'invited') throw notFound();
    const resolved = resolve(db, { userId: params.userId, orgId: params.org });
    send(res, 200, { role: resolved.role, permissions: resolved.permissions });
  });

  router.get('/v1/orgs/:org/audit', (ctx, params, res) => {
    allow(db, ctx, 'audit:read', null, { action: 'audit.read', targetType: 'org', targetId: params.org });
    const limit = ctx.query.has('limit') ? Number(ctx.query.get('limit')) : 50;
    const offset = ctx.query.has('offset') ? Number(ctx.query.get('offset')) : 0;
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw badRequest('limit must be an integer from 1 to 200');
    if (!Number.isInteger(offset) || offset < 0) throw badRequest('offset must be a non-negative integer');
    const events = db.prepare(
      `SELECT id, actor_id, action, target_type, target_id, result, reason_code, request_id, at
         FROM audit_events
        WHERE org_id = ?
        ORDER BY at DESC
        LIMIT ? OFFSET ?`
    ).all(params.org, limit, offset);
    send(res, 200, { events });
  });
}
