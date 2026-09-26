# DECISIONS

One section per decision that a reviewer might reasonably have made differently. Every section has
the same four parts, and the third and fourth are the ones we weigh most.

Rules, from `DISCOVERY-BRIEF.md`:

- cite something real in `Why` — a commit, a test, an error string, a file and line
- do not restate what a document says; describe what you did when the documents ran out
- six to twelve decisions is the expected range

No permission library was added. `verifyAccessToken` uses the same `node:crypto` HMAC `signToken` already used. `better-sqlite3`, React, and Vite are the starter's dependencies.

---

### The org-level question includes every live grant in the org

**What I chose:** `deviceId == null` makes `grantApplies` return true for org-wide and device-scoped grants. Deny is checked before allow.
**Why:** I printed the viewer's answers after `7b26c7a`. Org-level `device:view` came back `deny`, `source grant:grt_viewer_deny_kiosk`, `reason explicit_deny`. The same permission on `dev_lab_win_01` stayed `allow`, `source role:viewer`. Org-level `session:start` came back `allow` from `grant:grt_viewer_start_session` even though it is not in the viewer baseline. `device:list` stayed allow, so the Devices nav stayed and the kiosk row did not (`66de1ab`, `ui.spec.js` "a device the viewer cannot see is absent"). The line is `server/permissions.js` `grantApplies`.
**What I rejected:** Only org-wide grants (`device_id IS NULL`) count at org level. That keeps the viewer's nav story boring and drops the device allow, so `session:start` would be `implicit` and the console would hide Start even though one device can start. It also cannot explain a nav item vanishing because of a deny on a single device.
**What would change my mind:** A case where a device-scoped deny must leave the org-level effect at the role baseline. I could not construct one that still matches the union wording and the kiosk measurement.

---

### Passing null into assertMayGrant does not mean "the org-level view"

**What I chose:** An org-wide grant (`deviceId` null) is allowed only from the role baseline or an org-wide allow. Device-scoped allows do not count. Any deny of that permission, including a deny on one device, blocks.
**Why:** Phase 2 showed a device allow is enough to flip the org-level *view*. Using that same answer inside `assertMayGrant` would let Dana, who may control only `dev_globex_desk_01`, create an org-wide `device:control` grant. `holdsForGrant` (`server/permissions.js`) filters allows with `grant.device_id == null` when no device was passed, and does not filter denies that way. The refusal reason is `scope_mismatch` unless the block is an explicit deny.
**What I rejected:** "If the org-level view is allow, you may grant it org-wide." That fails as soon as the allow is narrower than the grant being created. Also rejected: ignore device-scoped denies when the grant is org-wide. The org view is already locked by that deny; handing the permission out org-wide would include the device the caller cannot touch.
**What would change my mind:** A grant whose scope is "every device except the ones I am denied on." The schema has no such scope. `device_id` null means the whole org.

---

### A stale pv is 401 before a suspended membership is 403

**What I chose:** `context.js` compares `membership.perm_version !== claims.pv` and throws `tokenStale()` before the route runs. A token issued *after* the bump, while status is still `suspended`, is a caller, and `assertActive` then throws 403 `reason: suspended`.
**Why:** Suspension writes `status = 'suspended'` and `bumpPermVersion` in the same transaction (`server/routes/orgs.js` suspend handler, `9d1fe04`). `check-api.js` demotes Sam and expects the old token's next call to be `401` `TOKEN_STALE`, not a reasoned 403. The same bump happens on suspend, so the token from before the suspend cannot observe `suspended`. The token from after it can.
**What I rejected:** Map every non-active membership to 403 at authentication time, and skip the version check when status is suspended. Then the demotion test's stale token would come back `FORBIDDEN` or `suspended` instead of `TOKEN_STALE`. Also rejected: do not bump `perm_version` on suspend, so the old token reaches the 403. The version is how every other authorization change becomes visible on the next request; special-casing suspend splits that.
**What would change my mind:** A test that presents the pre-suspension token and requires `reason: suspended` rather than `TOKEN_STALE`.

---

### The highest rank may modify another member of that same rank

**What I chose:** `assertCanModify` returns immediately when caller and target both hold the maximum `roles.rank`. Assigning that rank requires the caller to hold it. Every other pair needs a strictly higher rank (`server/lifecycle.js`).
**Why:** `check-api.js` in `9d1fe04`: Dana (owner) demoting `usr_acme_owner` (owner) to viewer is 200, and `admin@acme.test` assigning `owner` is `FORBIDDEN`. One "equal rank is always forbidden" rule cannot satisfy both. Ranks are read from `roles`, not a table of five names. This database's extra role is `reviewer` at rank 35 (`3d0b1e9` fingerprint), between operator 30 and admin 40.
**What I rejected:** Forbid every equal-rank edit, including owner→owner. The demotion assertion fails. Also rejected: hardcode `callerRole === 'owner'`. A fixture whose top rank is not the key `owner` would protect the wrong row, and `assertNotLastOwner` already uses `ORDER BY rank DESC` for the same reason.
**What would change my mind:** Two active members at the top rank where demoting one of them must be `FORBIDDEN` even though another top-rank member remains. Last-owner is the constraint I found, and it is a count, not a rank comparison.

---

### Re-invite updates the membership row and does not replace the password

**What I chose:** If `memberships` already has `(org_id, user_id)`, accept runs `UPDATE` to `active` and the invited role (`server/routes/invites.js`). `hashPassword` runs only inside `if (!user)`.
**Why:** After `DELETE /orgs/org_acme/members/usr_acme_viewer` (200), a new invite for `viewer@acme.test` accepted with password `hunter2hunter2`. Accept returned 200. Login with `demo1234` returned 200. Login with `hunter2hunter2` returned 401. `UNIQUE (org_id, user_id)` makes a second insert fail; the user row cannot be skipped because `password_hash` is `NOT NULL`. Replacing the hash would make the invite token a password reset.
**What I rejected:** `INSERT` a second membership and catch the constraint as 500. That is the failure mode the unique index is there to force into an update. Also rejected: always write the password from the accept body. It passed for `newbie@example.test` in `check-api.js` only because that email had no user row.
**What would change my mind:** An accept of an existing email that is specified to rotate the password, with the old password required as proof. The body does not have the old password.

---

### Resolved permissions are not cached across requests

**What I chose:** `resolve` / `resolveDevices` read membership, baseline, catalogue, and grants on every call. Statements are prepared once per connection. Results are not stored.
**Why:** 200 calls of `resolveDevices` for Dana over Acme's 5 devices: 4 queries per call, 0.144 ms per call (BUILD-LOG phase 8). The route adds one device `SELECT`. A cache keyed only by `userId` would serve Acme's set to Globex for Dana. A cache of the set would also keep a grant whose `expires_at` has passed, and the version check on the token does not run inside the engine.
**What I rejected:** A short TTL map keyed by `(userId, orgId, deviceId)`. It is the right key, and it is still wrong at the window boundary: expiry is not a write, so nothing bumps `perm_version` when the clock passes `expires_at`. The half-open check in `windowOpen` only runs if we read the row.
**What would change my mind:** A measured list over a few thousand devices where 0.144 ms stopped being true *and* a clock-driven invalidation that cannot serve a grant in the same millisecond it expires.

---

### Stopping a session updates that session id

**What I chose:** `DELETE /v1/sessions/:id` sets `state = 'ended'` with `WHERE id = ? AND state = 'active'` (`server/routes/sessions.js`).
**Why:** The first draft called `endActiveSessions({ orgId })`. The helper ANDs the filters it is given, so a missing `userId` is every user in the org. That would end Sam's grandfathered control session while deleting some other row. `check-api.js` expects that control session to stay `active` with `end_reason` null across the demotion (`9d1fe04`). Exclusivity is the partial unique index, not a check-then-insert: the second control catches `SQLITE_CONSTRAINT` and returns `DEVICE_BUSY`.
**What I rejected:** Check for an active exclusive session, then insert. Two parallel controls can both pass the check. The index is what makes one of them fail.
**What would change my mind:** A stop that is specified to end every session on the device. Transfer and decommission do that, by `deviceId`, because the device is leaving. A user stop is not that event.

---

### Accept returns an access token and does not set the refresh cookie

**What I chose:** `POST /v1/invites/:token/accept` returns `{ role, email, token }` and does not call `set-cookie` (`66de1ab`, `server/routes/invites.js`). The invite page then renders `login-form`.
**Why:** `tests/ui.spec.js` "an invite link can be redeemed" waits for `login-form`, not `app-shell`. Setting the `rt` cookie would make the next load of `/` a logged-in shell via `refresh()`. The access token is still minted from the membership just written, so a client that wants to continue without a password can. The browser console does not.
**What I rejected:** Auto-login by storing the refresh cookie and skipping the login form. The UI test fails. Also rejected: return no token at all. That drops the "issue tokens" sentence in order to satisfy the login form, and a non-browser client then has to know the password it just set and call `/auth/login`.
**What would change my mind:** The UI test being changed to expect `app-shell` after accept. Then the cookie should be set in that response.

---

### A device the caller cannot view is 404 on the direct route

**What I chose:** `GET /v1/orgs/:org/devices/:id` loads the row by org, then returns 404 when `device:view` is not allow (`server/routes/devices.js`). The list omits the row for the same reason. Suspended memberships still 403 with `reason: suspended` before that check.
**Why:** The list test in `check-api.js` requires `kiosk-lobby-01` absent, not present with redacted fields (4 devices). A 403 on the direct URL would confirm the id exists. Wrong org never reaches this handler: `context.js` throws `notFound()` when `params.org !== claims.org`, which is why an Acme token against Globex is 404 with a body that does not contain `globex-desk` (`check-api.js`).
**What I rejected:** 403 whenever `device:view` is deny, including the kiosk. That matches "you can see it but may not" and fails "you cannot see it." View is the visibility permission, not an action on a visible row.
**What would change my mind:** A caller who lacks `device:view` and holds `device:control` on that same device, and a test that requires the control action to 403 rather than 404. Today the direct GET is the visibility check; control is enforced on `POST /sessions`.

---

### Wildcards expand from permissions.resource at request time

**What I chose:** `device:*` matches every catalogue row whose `resource` is `device`, including rows added after `reference.sql`. `*` matches every key in `permissions`.
**Why:** `npm run db:reset` in `3d0b1e9` reported `permissions=20`. The extra key is `device:reboot`, resource `device`. `check-personalisation.js` requires the resolved set to include it, allow on `dev_p_bb3398_a` with source `grant:grt_p_bb3398_allow`, and `explicit_deny` on `dev_p_bb3398_b`. A list of the seven documented device permissions would mark `device:reboot` `implicit` on the device where the grant allows it. Owner is not "every permission in the table": owner and admin baselines were inserted by the cross join in `reference.sql` before the overlay row existed, and the engine reads `role_permissions`.
**What I rejected:** Hardcode the matrix from PERMISSIONS.md. It passes `check-permissions.js` and fails the personalisation floor on this machine, and grading uses a different nonce.
**What would change my mind:** An overlay permission that must *not* be covered by the resource wildcard. Nothing in `permission_patterns` expresses that exception.

---

## Where this repo argues with itself

### 1. Suspension both bumps `perm_version` and is supposed to be a 403 you can read

AUTH-DATA-MODEL.md §1: "It goes up whenever something authorization-relevant changes: a role change, a grant created or revoked, a suspension, a removal. [...] A token whose `pv` no longer matches gets `401 TOKEN_STALE`."

AUTH-DATA-MODEL.md §10: "a token for a suspended membership → `403` with an empty permission set."

Those cannot both describe the same token. The pre-suspension token fails `context.js` line 35 (`perm_version !== claims.pv`) and the route never runs, so the client sees `TOKEN_STALE`. I built that, because `check-api.js` requires `TOKEN_STALE` after a version bump. The post-suspension token matches `pv`, status is `suspended`, and the route returns 403 `reason: suspended` with an empty set from `resolve`. I built that too. The 403 is reachable only after refresh.

### 2. Accept "issues tokens" and "does not create a session", and the UI test waits for the login form

AUTH-DATA-MODEL.md §6: accept "does everything in one transaction: upsert the user, flip the membership from `invited` to `active`, and issue tokens."

The same section: "Accepting makes the membership active. It does not create a session."

`tests/ui.spec.js` "an invite link can be redeemed" expects `login-form`, not the shell.

There is a third clash with the schema. §6 says flip the membership from `invited` to `active`. A brand-new email has no `users` row (`password_hash` is `NOT NULL`), so there is no membership to flip. The invite row is the pending state. `invited` is only meaningful for a user who already exists. I update when the row exists and insert when it does not.

Built: issue an access token in the JSON, do not set the refresh cookie, show the login form. That keeps "issue tokens" and "not a session" and the UI test. See the decision above.

### 3. The org-level question "does not name a device", and device questions "always name one"

PERMISSIONS.md §3: org-level is "the union across all devices in the org."

PERMISSIONS.md §4 D6: "Device permissions are always device-scoped. [...] The question always names one. When you're gating navigation rather than a row, use the org-level union."

D6 says the question always names a device, then says navigation does not. I treated `deviceId == null` as the navigation question and included every grant. The measurement is in the first decision. The row question still names one device, which is why lab-win stays allow while the org answer is the kiosk deny.

`db/reference.sql` ends with a comment that there are 19 permissions. After `db:reset` this database has 20. The comment describes the file. The engine reads the table.

---

### Health is not an API route, and JSON is required only when a body exists

**What I chose:** `GET /healthz` runs `SELECT 1` and never calls `authenticate`. `readJson` checks `content-type` only after a byte arrives, so `POST /v1/auth/logout` with an empty body stays 200.
**Why:** `ea43c40` is the route, next to `/v1` in `server/index.js`. `70e75a3` is the content-type check. The first version called `req.destroy()` and Windows reset the socket before the 400 was written; `5ef13ec` drains the body instead. `scripts/check-ops.js` (`48e46bc`) asserts `{ ok: true }`, the three security headers, a `text/plain` login as 400, an empty logout as 200, and a body over 1 MB as 400.
**What I rejected:** A Content-Security-Policy. Vite's development middleware needs inline refresh, and a policy loose enough to allow that is not a control. Rate limiting. The starter lists it as out of scope and the suites log in on every test. Gating `POST /orgs` on the caller not being suspended. That route is authenticated only; the empty permission set is not consulted because the route never calls `resolve`.
**What would change my mind:** A check that treats `/healthz` as a `/v1` route, or a client that posts a non-empty body without `application/json` and is specified to succeed. I would add a content policy when the same policy works for `npm run dev` and `npm start`.

---

### The charts count the lists, and the fixture only fills them

**What I chose:** `web/charts.jsx` draws from the arrays the console already holds. `tapePoints` (`web/person.jsx`) walks `effective.permissions`. Extra fixture rows are people on both orgs and grants on Globex only. Acme's grant list is the original three.
**Why:** After `5679bd0` the People page still requested grants only for the grants view, so the grant card said "Nothing recorded for this chart" while `seed/orgs.json` contained `grt_dana_control_one_device`. `web/console.jsx` fetches grants, sessions, and audit when `view === 'people'`. `tests/ui.spec.js` "the grants view lists seeded grants" asserts `grant-row` count 3 and deny count 2. A new Acme grant fails that. `npx playwright test` with the Globex-only grants: 25 passed. View on `dev_lab_win_01` as Dana returned session `ses_e04177049a11428d`; `startMode` prints that id (`web/devices.jsx`).
**What I rejected:** A series built in the client so an empty org still looks occupied. The empty sentence is the honest chart. Also rejected: calling a model to narrate the figure. That needs an API key in the SPA or in the JWT payload, and neither place may hold a secret. The figure would also stop being checkable against `members` and `grants`.
**What would change my mind:** A hidden org, with none of these seed ids, where the charts are required to show a shaped series anyway. They should show the empty sentence. Or a test that requires Dana's Acme grant count to exceed 3 before she creates one.

---

## Deliberately not built

- **Rate limiting, email delivery, password reset.** The starter lists them as out of scope. A limit low enough to matter would fail `check-api.js` and the UI suite, which log in on every test.
- **Real remote access.** Control, terminal, and file transfer start or record a session. `POST .../file-transfer` returns `movedBytes: false` (`server/routes/devices.js`). No shell, no input injection, no capture. `startMode` (`web/devices.jsx`) shows the session id and says the other computer was not contacted.
- **A model API.** The charts are the lists. A key in the client bundle or in the access token would be a secret in the place `BRIEF.md` says not to put one, and the figure would no longer match `members` and `grants`.
- **A permission cache.** Measured above. The failure mode is a stale allow, not a slow read.
- **Device and member pagination.** Audit pagination is the contract (`limit` 1..200). The device list is one indexed select plus four resolution queries. Adding pages before that showed up in a measurement would be a second API for the console to get wrong.
- **Decommission as its own `end_reason`.** `sessions.end_reason` is a `CHECK` list. There is no `decommissioned`. Transfer and decommission both write `device_transferred` (`server/routes/devices.js`). `superseded` is left unused; it would mean a session replaced by another session, which exclusivity already forbids for `control` and `terminal`.
- **Gating `POST /orgs` on the caller's current membership being active.** The route is authenticated only. A suspended member can create an org. Noted as an open thread in `BUILD-LOG.md`. I would add the check if the empty permission set is supposed to apply to routes that never call `resolve`.
