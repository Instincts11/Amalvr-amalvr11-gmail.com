import { forbidden } from '../http.js';
import { assertCan } from '../permissions.js';
import { auditDenials } from '../audit.js';

export function assertActive(ctx) {
  if (ctx.membership.status === 'active') return;
  const reason = ctx.membership.status === 'suspended' ? 'suspended' : 'missing_permission';
  throw forbidden('membership is not active', reason);
}

export function allow(db, ctx, permission, deviceId, meta) {
  assertActive(ctx);
  auditDenials(db, ctx, meta, () => assertCan(db, ctx, permission, deviceId));
}
