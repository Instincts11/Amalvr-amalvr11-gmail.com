import {
  REFRESH_TTL_SECONDS,
  hashPassword,
  hashRefreshToken,
  issueAccessToken,
  newRefreshToken,
  verifyPassword,
} from '../auth.js';
import { newId, nowIso } from '../db.js';
import { badRequest, forbidden, notFound, send, unauthenticated } from '../http.js';
import { resolve } from '../permissions.js';

const DUMMY_HASH = hashPassword('not-a-real-password');

function readCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    out[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

function refreshCookie(raw) {
  const clearing = raw == null;
  return [
    `rt=${clearing ? '' : raw}`,
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    'Path=/',
    `Max-Age=${clearing ? 0 : REFRESH_TTL_SECONDS}`,
  ].join('; ');
}

function orgCookie(orgId) {
  return [
    `ro_org=${encodeURIComponent(orgId)}`,
    'Secure',
    'SameSite=Strict',
    'Path=/',
    `Max-Age=${REFRESH_TTL_SECONDS}`,
  ].join('; ');
}

function membershipsFor(db, userId) {
  return db.prepare(
    `SELECT m.org_id, m.role, m.status, m.perm_version, o.name AS org_name, o.theme
       FROM memberships m
       JOIN organizations o ON o.id = m.org_id
      WHERE m.user_id = ?
        AND m.status IN ('active', 'suspended')
        AND o.deleted_at IS NULL
      ORDER BY CASE m.status WHEN 'active' THEN 0 ELSE 1 END, o.name COLLATE NOCASE`
  ).all(userId);
}

function chooseMembership(rows, orgId) {
  if (orgId) return rows.find((row) => row.org_id === orgId) ?? null;
  return rows.find((row) => row.status === 'active') ?? rows[0] ?? null;
}

function sessionPayload(db, user, membership, token) {
  const resolved = resolve(db, { userId: user.id, orgId: membership.org_id });
  const roles = db.prepare('SELECT key, rank, label FROM roles ORDER BY rank DESC').all();
  const body = {
    role: membership.role,
    user: { id: user.id, email: user.email, name: user.name },
    org: { id: membership.org_id, name: membership.org_name, theme: membership.theme },
    orgs: membershipsFor(db, user.id)
      .filter((row) => row.status === 'active')
      .map((row) => ({ id: row.org_id, name: row.org_name, theme: row.theme, role: row.role })),
    permissions: resolved.permissions,
    roles,
  };
  if (token) body.token = token;
  return body;
}

function issue(secret, user, membership) {
  return issueAccessToken(
    {
      userId: user.id,
      orgId: membership.org_id,
      role: membership.role,
      permVersion: membership.perm_version,
    },
    secret
  );
}

function storeRefresh(db, userId, familyId) {
  const raw = newRefreshToken();
  const expires = new Date(Date.now() + REFRESH_TTL_SECONDS * 1000).toISOString();
  db.prepare(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, family_id, expires_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(newId('rft'), userId, hashRefreshToken(raw), familyId, expires);
  return raw;
}

const INVALID_LOGIN = () => unauthenticated('invalid email or password');

export function registerAuth(router, { db, secret }) {
  router.post('/v1/auth/login', (ctx, _params, res) => {
    const email = String(ctx.body.email ?? '').trim().toLowerCase();
    const password = String(ctx.body.password ?? '');
    const orgId = ctx.body.orgId ? String(ctx.body.orgId) : null;
    if (!email || !password) throw badRequest('email and password are required');

    const user = db.prepare('SELECT id, email, name, password_hash FROM users WHERE email = ?').get(email);
    const passwordOk = verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
    if (!user || !passwordOk) throw INVALID_LOGIN();

    const membership = chooseMembership(membershipsFor(db, user.id), orgId);
    if (!membership) throw INVALID_LOGIN();

    const token = issue(secret, user, membership);
    const raw = storeRefresh(db, user.id, newId('fam'));
    res.setHeader('set-cookie', [refreshCookie(raw), orgCookie(membership.org_id)]);
    send(res, 200, sessionPayload(db, user, membership, token));
  });

  router.post('/v1/auth/refresh', (ctx, _params, res) => {
    const raw = readCookies(ctx.req).rt;
    if (!raw) throw unauthenticated('missing refresh token');
    const row = db.prepare('SELECT * FROM refresh_tokens WHERE token_hash = ?').get(hashRefreshToken(raw));
    const now = nowIso();
    if (!row) throw unauthenticated('invalid refresh token');

    const killFamily = () => {
      db.prepare(
        `UPDATE refresh_tokens SET revoked_at = ? WHERE family_id = ? AND revoked_at IS NULL`
      ).run(now, row.family_id);
    };

    if (row.revoked_at || row.expires_at <= now) {
      if (row.revoked_at) killFamily();
      throw unauthenticated('invalid refresh token');
    }

    const claimed = db.prepare(
      `UPDATE refresh_tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL`
    ).run(now, row.id);
    if (claimed.changes !== 1) {
      killFamily();
      throw unauthenticated('invalid refresh token');
    }

    const rows = membershipsFor(db, row.user_id);
    const preferred = readCookies(ctx.req).ro_org;
    const membership = chooseMembership(rows, preferred) ?? chooseMembership(rows, null);
    if (!membership) throw unauthenticated('not a member of this org');

    const next = storeRefresh(db, row.user_id, row.family_id);
    const user = db.prepare('SELECT id, email, name FROM users WHERE id = ?').get(row.user_id);
    const token = issue(secret, user, membership);
    res.setHeader('set-cookie', [refreshCookie(next), orgCookie(membership.org_id)]);
    send(res, 200, sessionPayload(db, user, membership, token));
  });

  router.post('/v1/auth/logout', (ctx, _params, res) => {
    const raw = readCookies(ctx.req).rt;
    if (raw) {
      const row = db.prepare('SELECT * FROM refresh_tokens WHERE token_hash = ?').get(hashRefreshToken(raw));
      if (row) {
        db.prepare(
          `UPDATE refresh_tokens SET revoked_at = ? WHERE family_id = ? AND revoked_at IS NULL`
        ).run(nowIso(), row.family_id);
      }
    }
    res.setHeader('set-cookie', refreshCookie(null));
    send(res, 200, { ok: true });
  });

  router.post('/v1/auth/token', (ctx, _params, res) => {
    const orgId = String(ctx.body.orgId ?? '');
    if (!orgId) throw badRequest('orgId is required');
    const membership = membershipsFor(db, ctx.userId).find((row) => row.org_id === orgId);
    if (!membership) throw notFound();
    if (membership.status !== 'active') throw forbidden('membership is suspended', 'suspended');
    const user = db.prepare('SELECT id, email, name FROM users WHERE id = ?').get(ctx.userId);
    const token = issue(secret, user, membership);
    res.setHeader('set-cookie', orgCookie(orgId));
    send(res, 200, sessionPayload(db, user, membership, token));
  });

  router.get('/v1/auth/me', (ctx, _params, res) => {
    const user = db.prepare('SELECT id, email, name FROM users WHERE id = ?').get(ctx.userId);
    const membership = membershipsFor(db, ctx.userId).find((row) => row.org_id === ctx.orgId);
    if (!membership) throw unauthenticated('not a member of this org');
    send(res, 200, sessionPayload(db, user, membership));
  });
}
