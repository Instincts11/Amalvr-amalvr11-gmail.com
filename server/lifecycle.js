// Rank, last-owner, and session endings. Rank never answers a permission question.
// Ranks are read from the roles table so a role this checkout has never seen
// still sorts into the order the database assigned it.

import { badRequest, forbidden, lastOwner } from './http.js';
import { nowIso } from './db.js';
import { resolve } from './permissions.js';

export function roleRanks(db) {
  return new Map(db.prepare('SELECT key, rank FROM roles').all().map((row) => [row.key, row.rank]));
}

export function topRoleKey(db) {
  return db.prepare('SELECT key FROM roles ORDER BY rank DESC LIMIT 1').get()?.key ?? null;
}

export function assertRoleExists(db, role) {
  const row = db.prepare('SELECT key, rank, label FROM roles WHERE key = ?').get(role);
  if (!row) throw badRequest('unknown role');
  return row;
}

// Owners (the highest rank) may modify other owners. Everyone else needs a
// strictly higher rank than the target. Equal admin-to-admin is a refusal.
export function assertCanModify(db, callerRole, targetRole) {
  const ranks = roleRanks(db);
  const caller = ranks.get(callerRole);
  const target = ranks.get(targetRole);
  if (caller == null || target == null) throw badRequest('unknown role');
  const top = Math.max(...ranks.values());
  if (caller === top && target === top) return;
  if (caller <= target) throw forbidden('you can only modify a member of lower rank');
}

export function assertCanAssignRole(db, callerRole, newRole) {
  const ranks = roleRanks(db);
  const caller = ranks.get(callerRole);
  const next = ranks.get(newRole);
  if (caller == null || next == null) throw badRequest('unknown role');
  const top = Math.max(...ranks.values());
  if (next === top && caller !== top) throw forbidden('only the top role can confer the top role');
  if (caller === top) return;
  if (caller <= next) throw forbidden('you can only assign a lower role');
}

export function assertNotLastOwner(db, orgId, userId) {
  const top = topRoleKey(db);
  const row = db.prepare(
    `SELECT role, status FROM memberships WHERE org_id = ? AND user_id = ?`
  ).get(orgId, userId);
  if (!row || row.status !== 'active' || row.role !== top) return;
  const count = db.prepare(
    `SELECT COUNT(*) AS n FROM memberships WHERE org_id = ? AND role = ? AND status = 'active'`
  ).get(orgId, top).n;
  if (count <= 1) throw lastOwner();
}

export function endActiveSessions(db, { orgId, userId, deviceId, reason, exceptSessionId } = {}) {
  const now = nowIso();
  let sql = `UPDATE sessions SET state = 'ended', end_reason = ?, ended_at = ? WHERE state = 'active'`;
  const params = [reason, now];
  if (orgId) {
    sql += ' AND org_id = ?';
    params.push(orgId);
  }
  if (userId) {
    sql += ' AND user_id = ?';
    params.push(userId);
  }
  if (deviceId) {
    sql += ' AND device_id = ?';
    params.push(deviceId);
  }
  if (exceptSessionId) {
    sql += ' AND id <> ?';
    params.push(exceptSessionId);
  }
  return db.prepare(sql).run(...params);
}

export function expireDueSessions(db, orgId) {
  const now = nowIso();
  db.prepare(
    `UPDATE sessions
        SET state = 'ended', end_reason = 'session_expired', ended_at = ?
      WHERE state = 'active' AND org_id = ? AND expires_at <= ?`
  ).run(now, orgId, now);
}

export function snapshotAuthority(db, { userId, orgId, deviceId }) {
  const resolved = resolve(db, { userId, orgId, deviceId });
  return { role: resolved.role, permissions: resolved.permissions, snapshotAt: nowIso() };
}

export function sessionExpiry(db, orgId, from = new Date()) {
  const org = db.prepare('SELECT max_session_minutes FROM organizations WHERE id = ?').get(orgId);
  const minutes = org?.max_session_minutes ?? 60;
  return new Date(from.getTime() + minutes * 60_000).toISOString();
}
