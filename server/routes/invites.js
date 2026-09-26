import { audit } from '../audit.js';
import { hashInviteToken, hashPassword, newInviteToken } from '../auth.js';
import { bumpPermVersion, newId, nowIso } from '../db.js';
import { badRequest, conflict, gone, notFound, send } from '../http.js';
import { assertCanAssignRole, assertRoleExists } from '../lifecycle.js';
import { allow } from './guard.js';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function findInvite(db, raw) {
  return db.prepare(
    `SELECT i.id, i.org_id, i.email, i.role, i.expires_at, i.accepted_at, i.revoked_at, i.invited_by,
            o.name AS org_name
       FROM invites i
       JOIN organizations o ON o.id = i.org_id
      WHERE i.token_hash = ?`
  ).get(hashInviteToken(raw));
}

function assertInviteOpen(row) {
  if (!row) throw notFound();
  if (row.accepted_at) throw conflict('invite already accepted');
  if (row.revoked_at || row.expires_at <= nowIso()) throw gone();
}

export function registerInvites(router, { db }) {
  router.post('/v1/orgs/:org/invites', (ctx, params, res) => {
    const email = String(ctx.body.email ?? '').trim().toLowerCase();
    const role = String(ctx.body.role ?? '');
    if (!email || !email.includes('@') || email.length > 254) throw badRequest('email is required');
    assertRoleExists(db, role);
    allow(db, ctx, 'user:invite', null, { action: 'invite.create', targetType: 'invite', targetId: email });
    assertCanAssignRole(db, ctx.role, role);

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      const membership = db.prepare(
        `SELECT status FROM memberships WHERE org_id = ? AND user_id = ?`
      ).get(params.org, existing.id);
      if (membership?.status === 'active' || membership?.status === 'suspended') {
        throw conflict('that email already belongs to this organization');
      }
    }

    const raw = newInviteToken();
    const id = newId('inv');
    const expires = new Date(Date.now() + INVITE_TTL_MS).toISOString();
    try {
      const write = db.transaction(() => {
        db.prepare(
          `INSERT INTO invites (id, org_id, email, role, token_hash, invited_by, expires_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(id, params.org, email, role, hashInviteToken(raw), ctx.userId, expires);
        audit(db, {
          orgId: params.org,
          actorId: ctx.userId,
          action: 'invite.create',
          targetType: 'invite',
          targetId: id,
          result: 'allow',
          requestId: ctx.requestId,
        });
      });
      write();
    } catch (err) {
      if (String(err?.code ?? '').startsWith('SQLITE_CONSTRAINT')) {
        throw conflict('a live invite already exists for that email');
      }
      throw err;
    }
    send(res, 201, { id, email, role, expiresAt: expires, inviteToken: raw });
  });

  router.get('/v1/orgs/:org/invites', (ctx, params, res) => {
    allow(db, ctx, 'user:invite', null, { action: 'invite.list', targetType: 'org', targetId: params.org });
    const invites = db.prepare(
      `SELECT id, email, role, expires_at, accepted_at, revoked_at, created_at
         FROM invites
        WHERE org_id = ?
        ORDER BY created_at DESC`
    ).all(params.org);
    send(res, 200, { invites });
  });

  router.delete('/v1/orgs/:org/invites/:id', (ctx, params, res) => {
    allow(db, ctx, 'user:invite', null, { action: 'invite.revoke', targetType: 'invite', targetId: params.id });
    const row = db.prepare(
      `SELECT id FROM invites
        WHERE id = ? AND org_id = ? AND accepted_at IS NULL AND revoked_at IS NULL`
    ).get(params.id, params.org);
    if (!row) throw notFound();
    const write = db.transaction(() => {
      db.prepare(`UPDATE invites SET revoked_at = ? WHERE id = ?`).run(nowIso(), params.id);
      audit(db, {
        orgId: params.org,
        actorId: ctx.userId,
        action: 'invite.revoke',
        targetType: 'invite',
        targetId: params.id,
        result: 'allow',
        requestId: ctx.requestId,
      });
    });
    write();
    send(res, 200, { id: params.id, revoked: true });
  });

  router.get('/v1/invites/:token', (_ctx, params, res) => {
    const row = findInvite(db, params.token);
    assertInviteOpen(row);
    send(res, 200, {
      orgName: row.org_name,
      role: row.role,
      email: row.email,
      expiresAt: row.expires_at,
    });
  });

  router.post('/v1/invites/:token/accept', (ctx, params, res) => {
    const name = String(ctx.body.name ?? '').trim();
    const password = String(ctx.body.password ?? '');
    if (!name || name.length > 80) throw badRequest('name is required');
    if (password.length < 8) throw badRequest('password must be at least 8 characters');

    const row = findInvite(db, params.token);
    assertInviteOpen(row);

    const accept = db.transaction(() => {
      let user = db.prepare('SELECT id, email, name FROM users WHERE email = ?').get(row.email);
      if (!user) {
        const id = newId('usr');
        db.prepare(`INSERT INTO users (id, email, name, password_hash) VALUES (?, ?, ?, ?)`).run(
          id,
          row.email,
          name,
          hashPassword(password)
        );
        user = { id, email: row.email, name };
      }

      const membership = db.prepare(
        `SELECT id, status FROM memberships WHERE org_id = ? AND user_id = ?`
      ).get(row.org_id, user.id);
      if (membership?.status === 'active') throw conflict('already a member');

      if (membership) {
        db.prepare(
          `UPDATE memberships
              SET role = ?, status = 'active', perm_version = perm_version + 1, joined_at = ?, invited_by = ?
            WHERE id = ?`
        ).run(row.role, nowIso(), row.invited_by, membership.id);
      } else {
        db.prepare(
          `INSERT INTO memberships (id, org_id, user_id, role, status, invited_by, joined_at)
           VALUES (?, ?, ?, ?, 'active', ?, ?)`
        ).run(newId('mem'), row.org_id, user.id, row.role, row.invited_by, nowIso());
      }
      bumpPermVersion(db, { orgId: row.org_id, userId: user.id });

      const marked = db.prepare(
        `UPDATE invites SET accepted_at = ?, accepted_by = ? WHERE id = ? AND accepted_at IS NULL`
      ).run(nowIso(), user.id, row.id);
      if (marked.changes !== 1) throw conflict('invite already accepted');

      audit(db, {
        orgId: row.org_id,
        actorId: user.id,
        action: 'invite.accept',
        targetType: 'invite',
        targetId: row.id,
        result: 'allow',
        requestId: ctx.requestId,
      });
      return user;
    });

    accept();
    send(res, 200, { role: row.role, email: row.email });
  });
}
