# BUILD-LOG

Append to this as you go. Commit it with the code it describes — the timestamps are part of the
evidence, and a log that arrives in one commit at the end reads as what it is.

Five lines is a real entry. Short and dated is better than long and reconstructed.

The categories we look for are listed in `DISCOVERY-BRIEF.md`. The example below shows the
*shape* of a good entry; it is a recreation of something already printed in `README.md`, so it
gives nothing away.

---

<!-- EXAMPLE — delete this block, keep the shape.

## 2026-03-04 · Phase 0 — orientation

Expected the unknown-permission test to fail on my validation code.
Observed: it passed, with foreign_keys ON, and *also* passed with the pragma removed — so the
check was never running, and the "pass" was the schema loading fine while enforcing nothing.
Changed: moved `foreign_keys = ON` to connection open and re-ran; now it raises
`FOREIGN KEY constraint failed` as the README said it would.
Note: this is the failure mode where a passing test is worse than a failing one.

-->

## Phase 0 — orientation

### 2026-09-26 — the loader path, then the starting line

Expected `npm run db:reset` to fail on `rm -f` under PowerShell. It got past that (npm's script shell has `rm`) and died in `scripts/load-db.js` instead:

`ENOENT open 'C:\C:\Users\AMAL%20V%20R\...\db\schema.sql'`

`new URL(...).pathname` on Windows is `/C:/Users/AMAL%20V%20R/...`. Concatenating that onto a drive produces `C:\C:\...` and leaves `%20` encoded, so the schema file "exists" and still cannot be opened. `fileURLToPath` is the one that decodes it. Same bug is latent in `server/index.js` for `dist/` once `NODE_ENV=production`. Fixed both, and pointed `db:reset` at `load-db.js` directly because that script already deletes the sqlite files — the `rm` prefix is not what makes the reset safe.

After the fix, `npm run db:reset` seeded 3 orgs, 20 permissions, 27 patterns. The third org is not in any document: role `reviewer` (rank 35), permission `device:reboot`. That permission's resource is `device`, so a wildcard written as the seven names in PERMISSIONS.md §2 would miss it, and `device:*` has to cover it. Starting line, re-run against the stubs:

- `check-jwt.js` — 0 passed, 43 failed. Every case, including the valid token, reports `Error: TODO: server/auth.js...`, not `401 UNAUTHENTICATED`. The harness only counts an `HttpError`. A stub that throws a plain `Error`, and a verifier that lets `JSON.parse` escape, both fail the rejection cases. Throwing the wrong type does not get partial credit.
- `check-permissions.js` — aborted on `resolve()` `NOT_IMPLEMENTED` before any assertion.
- `check-personalisation.js` — `could not resolve at all` for `device:reboot` on Ironside Labs. The fingerprint command is `bb339819425c`.

`db:reset` counts are the evidence the overlay is in the database the engine has to read: permissions=20, not 19.

## Phase 1 — token verification

### 2026-09-26 — alg:none keeps a valid signature

Expected an HMAC check alone to kill `alg: none`, because `none` has an empty signature. `check-jwt.js` also builds `alg: none, original signature kept`: the header says `none`, the signature is the real HS256 over the same payload. If the verifier ignores `header.alg` and only checks the HMAC, that token is accepted. Pinning `header.alg === 'HS256'` and `header.typ === 'JWT'` before `timingSafeEqual` is what rejects it. The algorithm is never taken from the header; HS256 is the only computation.

`exp <= now` (not `<`) is the other boundary. `exp exactly now` is in the suite and is a 401.

A parse failure has to be caught inside the function. Phase 0 showed the harness printing `Error: ...` rather than `401 UNAUTHENTICATED` for the stub, so a `JSON.parse` exception would fail the malformed-header cases the same way.

`node scripts/check-jwt.js` — ALL PASS, 43 passed, 0 failed.

## Phase 2 — caller context and the resolution engine

### 2026-09-26 — specificity felt right, and it is wrong

First sketch was "the narrower grant wins": an org-wide deny, then a device allow, and the device allow carves a hole. That is how most ACL editors are explained. `check-permissions.js` has a case inserted at runtime (`g_carve`, allow `device:terminal` on `dev_lab_win_01` on top of Sam's org-wide deny) whose label is the result, not the rule. Checked denies before allows. The case passed: effect stays `deny`. A narrower allow does not survive a broader refusal. Same order also keeps Sam's `device:control` allow on `dev_lab_win_01`, because nothing denies that one.

### 2026-09-26 — the org view counts a single device

Expected the viewer's org-level `device:view` to stay `allow`. The role baseline contains it, and the deny is only on `dev_kiosk_lobby_01`. Printed both:

```
org device:view      deny  source grant:grt_viewer_deny_kiosk  reason explicit_deny
lab-win device:view  allow source role:viewer
org session:start    allow source grant:grt_viewer_start_session
org device:list      allow source role:viewer
```

The org question takes every live grant in the org. One device deny locks that permission for navigation. One device allow opens it (`session:start` is not in the viewer baseline and still comes back allow). The row question does not: lab-win still allows `device:view`. `device:list` is untouched, so the Devices nav stays while a permission that *is* the nav gate would disappear. That split is what the console has to render, not reconcile.

`device:*` is expanded from `permissions.resource`, not from a list of seven names. The overlay permission in this database is `device:reboot` (resource `device`). A hardcoded device list would report it implicit on the device where the grant allows it.

`check-permissions.js` — 35 passed. `check-personalisation.js` — 18 passed, role `reviewer`, source strings `grant:grt_p_bb3398_allow` and `grant:grt_p_bb3398_deny`. No cache. A cache keyed by user id would hand Acme's answer to Globex for Dana inside one TTL, and a cache of the resolved set would keep an expired window alive until restart. The membership lookup is the indexed one the schema already has (`memberships_by_user`).

Freshness in `context.js` uses `!==` against `memberships.perm_version`, and a path `:org` that is not the token's `org` throws `notFound()` before that lookup's result is used for the other org. Suspended with a *matching* pv still builds a caller; the route then refuses. A token from before the suspension fails freshness first and never gets a `suspended` reason. Those two outcomes are both in AUTH-DATA-MODEL.md and they cannot happen on the same token.

## Phase 3 — orgs, members, invites

_Anything you had to work out that no document states. Invite lifecycle states are a common
source of this._

## Phase 4 — devices and grants

_What happens at the boundary where two grants disagree, or where a grant's scope and the
question's scope differ? Say what you predicted and what you got._

## Phase 5 — sessions

_Two permissions, one device. What did you have to resolve, and in what order, to keep the two
failure reasons distinguishable?_

## Phase 6 — audit

_What did you decide counts as an auditable event, and what pushed you to that line?_

## Phase 7 — the console

_Where did the server's answer and your instinct disagree about what should be on screen?_

## Phase 8 — hardening

_What did you measure, what did you fix, and what did you deliberately leave alone? Anything you
chose not to build belongs here with its reason._

## Open threads

_Things you know are wrong, unfinished, or that you would do differently with another day. Listing
these honestly is worth more than pretending they do not exist — we will find them anyway._
