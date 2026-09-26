// Token to caller. The org claim is the only org this request may name.
// A path org that differs is 404 before any permission check runs.

import { verifyAccessToken } from './auth.js';
import { notFound, tokenStale, unauthenticated } from './http.js';

export function authenticate(db, secret) {
  return function buildContext(req, params) {
    const header = req.headers.authorization ?? '';
    const match = /^Bearer\s+(\S+)/i.exec(header);
    if (!match) throw unauthenticated('missing bearer token');

    const claims = verifyAccessToken(match[1], secret);
    if (params?.org && params.org !== claims.org) throw notFound();

    const membership = db.prepare(
      `SELECT id, org_id, user_id, role, status, perm_version
         FROM memberships WHERE user_id = ? AND org_id = ?`
    ).get(claims.sub, claims.org);

    if (!membership || membership.status === 'removed' || membership.status === 'invited') {
      throw unauthenticated('not a member of this org');
    }

    const org = db.prepare(
      `SELECT id, name, theme, max_session_minutes, deleted_at
         FROM organizations WHERE id = ?`
    ).get(claims.org);
    if (!org || org.deleted_at) throw unauthenticated('not a member of this org');

    // Compare with !==. A newer pv and an older pv are both stale.
    // Suspension bumps pv, so a token minted before the suspension dies here
    // as TOKEN_STALE. A token minted after it reaches the route, which then
    // refuses with reason suspended.
    if (membership.perm_version !== claims.pv) throw tokenStale();

    return {
      userId: claims.sub,
      orgId: claims.org,
      role: membership.role,
      membership,
      claims,
      org,
    };
  };
}
