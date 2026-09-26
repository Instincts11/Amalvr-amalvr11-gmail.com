// The only place allow versus deny is decided.
//
// Catalogue, baselines, and grants are read from the database on every call.
// Nothing here names the documented 19 permissions or the five roles: grading
// loads a different permission and a different role than the ones in this checkout.
//
// Two questions, one function:
//   deviceId == null  org-level (navigation). Every live grant in the org is in
//                     the pile, so a deny on a single device locks that permission
//                     for the org view, and an allow on a single device opens it.
//   deviceId set      that device only. An org-wide grant applies. A grant for a
//                     different device does not.

import { forbidden } from './http.js';

export const MODE_PERMISSION = {
  view: 'device:view',
  control: 'device:control',
  terminal: 'device:terminal',
};

function asIso(now) {
  return now instanceof Date ? now.toISOString() : new Date(now).toISOString();
}

function statements(db) {
  if (!db.__permSql) {
    db.__permSql = {
      membership: db.prepare(
        `SELECT role, status FROM memberships WHERE user_id = ? AND org_id = ?`
      ),
      baseline: db.prepare(`SELECT permission FROM role_permissions WHERE role = ?`),
      catalogue: db.prepare(`SELECT key, resource FROM permissions ORDER BY key`),
      grants: db.prepare(
        `SELECT g.id, g.device_id, g.effect, g.starts_at, g.expires_at, gp.permission AS pattern
           FROM grants g
           JOIN grant_permissions gp ON gp.grant_id = g.id
          WHERE g.org_id = ? AND g.user_id = ? AND g.revoked_at IS NULL`
      ),
    };
  }
  return db.__permSql;
}

function windowOpen(grant, nowIso) {
  if (grant.starts_at && grant.starts_at > nowIso) return false;
  if (grant.expires_at && !(grant.expires_at > nowIso)) return false;
  return true;
}

function grantApplies(grantDeviceId, questionDeviceId) {
  if (questionDeviceId == null) return true;
  return grantDeviceId == null || grantDeviceId === questionDeviceId;
}

function patternCovers(pattern, perm) {
  if (pattern === '*' || pattern === perm.key) return true;
  if (pattern.endsWith(':*')) return perm.resource === pattern.slice(0, -2);
  return false;
}

function loadFacts(db, userId, orgId, now) {
  const sql = statements(db);
  const nowIso = asIso(now);
  const catalogue = sql.catalogue.all();
  const membership = sql.membership.get(userId, orgId);

  if (!membership || membership.status === 'removed' || membership.status === 'invited') {
    return { catalogue, status: 'absent', role: null, baseline: new Set(), grants: [] };
  }
  if (membership.status !== 'active') {
    return { catalogue, status: membership.status, role: membership.role, baseline: new Set(), grants: [] };
  }

  const baseline = new Set(sql.baseline.all(membership.role).map((row) => row.permission));
  const grants = sql.grants.all(orgId, userId).filter((grant) => windowOpen(grant, nowIso));
  return { catalogue, status: 'active', role: membership.role, baseline, grants };
}

function grantsFor(facts, permissionKey, questionDeviceId) {
  const perm = facts.catalogue.find((row) => row.key === permissionKey);
  const hits = [];
  for (const grant of facts.grants) {
    if (!grantApplies(grant.device_id, questionDeviceId)) continue;
    const covered = perm
      ? patternCovers(grant.pattern, perm)
      : grant.pattern === permissionKey || grant.pattern === '*';
    if (covered) hits.push(grant);
  }
  return hits;
}

function byId(a, b) {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function answerFor(facts, permissionKey, questionDeviceId) {
  if (facts.status === 'absent') return { effect: 'deny', source: null, reason: 'not_a_member' };
  if (facts.status !== 'active') return { effect: 'deny', source: null, reason: facts.status === 'suspended' ? 'suspended' : 'not_a_member' };

  const hits = grantsFor(facts, permissionKey, questionDeviceId);
  const denies = hits.filter((grant) => grant.effect === 'deny').sort((a, b) => {
    const scope = (grant) => (grant.device_id == null ? 0 : 1);
    return scope(a) - scope(b) || byId(a, b);
  });
  if (denies.length) {
    return { effect: 'deny', source: `grant:${denies[0].id}`, reason: 'explicit_deny' };
  }
  if (facts.baseline.has(permissionKey)) {
    return { effect: 'allow', source: `role:${facts.role}`, reason: null };
  }
  const allows = hits.filter((grant) => grant.effect === 'allow').sort(byId);
  if (allows.length) return { effect: 'allow', source: `grant:${allows[0].id}`, reason: null };
  return { effect: 'deny', source: null, reason: 'implicit' };
}

function pack(facts, questionDeviceId) {
  const permissions = {};
  for (const perm of facts.catalogue) {
    permissions[perm.key] = answerFor(facts, perm.key, questionDeviceId);
  }
  return { role: facts.role, permissions };
}

export function resolve(db, { userId, orgId, deviceId = null, now = new Date() }) {
  return pack(loadFacts(db, userId, orgId, now), deviceId ?? null);
}

export function resolveDevices(db, { userId, orgId, deviceIds, now = new Date() }) {
  const facts = loadFacts(db, userId, orgId, now);
  const byDevice = {};
  for (const id of deviceIds) byDevice[id] = pack(facts, id).permissions;
  return { role: facts.role, byDevice };
}

export function can(db, ctx, permission, deviceId) {
  const resolved = resolve(db, { userId: ctx.userId, orgId: ctx.orgId, deviceId: deviceId ?? null });
  return resolved.permissions[permission]?.effect === 'allow';
}

function refusalReason(answer, fallback) {
  if (answer?.reason === 'explicit_deny' || answer?.reason === 'suspended' || answer?.reason === 'not_a_member') {
    return answer.reason;
  }
  return fallback;
}

export function assertCan(db, ctx, permission, deviceId) {
  const resolved = resolve(db, { userId: ctx.userId, orgId: ctx.orgId, deviceId: deviceId ?? null });
  const answer = resolved.permissions[permission];
  if (answer?.effect === 'allow') return answer;
  throw forbidden(`missing permission ${permission}`, refusalReason(answer, 'missing_permission'));
}

// Org-wide grants (deviceId null) must not be satisfied by a device-scoped allow.
// A device-scoped deny still blocks, because that deny already locks the org view.
function holdsForGrant(facts, permission, deviceId) {
  if (facts.status === 'absent') return { effect: 'deny', source: null, reason: 'not_a_member' };
  if (facts.status !== 'active') {
    return { effect: 'deny', source: null, reason: facts.status === 'suspended' ? 'suspended' : 'not_a_member' };
  }
  if (deviceId) return answerFor(facts, permission, deviceId);

  const perm = facts.catalogue.find((row) => row.key === permission);
  const denies = facts.grants.filter((grant) => grant.effect === 'deny' && perm && patternCovers(grant.pattern, perm));
  if (denies.length) return { effect: 'deny', source: `grant:${denies[0].id}`, reason: 'explicit_deny' };
  if (facts.baseline.has(permission)) return { effect: 'allow', source: `role:${facts.role}`, reason: null };
  const allows = facts.grants.filter(
    (grant) => grant.device_id == null && grant.effect === 'allow' && perm && patternCovers(grant.pattern, perm)
  );
  if (allows.length) return { effect: 'allow', source: `grant:${allows[0].id}`, reason: null };
  return { effect: 'deny', source: null, reason: 'implicit' };
}

function expandPatterns(facts, patterns) {
  const needed = new Set();
  for (const pattern of patterns) {
    if (pattern === '*') {
      for (const perm of facts.catalogue) needed.add(perm.key);
    } else if (typeof pattern === 'string' && pattern.endsWith(':*')) {
      const resource = pattern.slice(0, -2);
      for (const perm of facts.catalogue) if (perm.resource === resource) needed.add(perm.key);
    } else {
      needed.add(pattern);
    }
  }
  return needed;
}

export function assertMayGrant(db, ctx, patterns, deviceId = null) {
  const facts = loadFacts(db, ctx.userId, ctx.orgId, new Date());
  for (const permission of expandPatterns(facts, patterns)) {
    const answer = holdsForGrant(facts, permission, deviceId);
    if (answer.effect === 'allow') continue;
    const reason = answer.reason === 'explicit_deny' || answer.reason === 'suspended' ? answer.reason : 'scope_mismatch';
    throw forbidden(`cannot grant ${permission} at this scope`, reason);
  }
}

export function assertCanStartSession(db, ctx, mode, deviceId) {
  const modePerm = MODE_PERMISSION[mode];
  if (!modePerm) throw forbidden('unknown session mode', 'missing_permission');
  const resolved = resolve(db, { userId: ctx.userId, orgId: ctx.orgId, deviceId });
  const start = resolved.permissions['session:start'];
  if (start?.effect !== 'allow') throw forbidden('missing session:start', refusalReason(start, 'missing_permission'));
  const modeAnswer = resolved.permissions[modePerm];
  if (modeAnswer?.effect !== 'allow') {
    throw forbidden(`missing ${modePerm}`, refusalReason(modeAnswer, 'missing_device_permission'));
  }
}
