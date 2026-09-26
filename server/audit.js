import { HttpError } from './http.js';
import { newId, nowIso } from './db.js';

export function audit(db, { orgId, actorId, action, targetType, targetId, result, reasonCode, requestId }) {
  db.prepare(
    `INSERT INTO audit_events
       (id, org_id, actor_id, action, target_type, target_id, result, reason_code, request_id, at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    newId('aud'),
    orgId,
    actorId ?? null,
    action,
    targetType ?? null,
    targetId ?? null,
    result,
    reasonCode ?? null,
    requestId ?? null,
    nowIso()
  );
}

// One denial row, then the original error. Success rows are written by the
// route inside the same transaction as the change — not from here.
export function auditDenials(db, ctx, meta, fn) {
  try {
    return fn();
  } catch (err) {
    if (err instanceof HttpError && err.status === 403 && ctx?.orgId) {
      audit(db, {
        orgId: ctx.orgId,
        actorId: ctx.userId ?? null,
        action: meta.action,
        targetType: meta.targetType ?? null,
        targetId: meta.targetId ?? null,
        result: 'deny',
        reasonCode: err.reason ?? err.code,
        requestId: ctx.requestId ?? null,
      });
    }
    throw err;
  }
}
