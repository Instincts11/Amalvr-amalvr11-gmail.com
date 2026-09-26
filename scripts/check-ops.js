// Operational checks that the public suites do not cover: health, response headers,
// a non-JSON body, an empty POST, and the 1 MB cap.
//
//   node scripts/check-ops.js

import { spawn, execFileSync } from 'node:child_process';
import { rmSync, existsSync } from 'node:fs';
import { clearedOrgLists } from '../web/org-state.js';

const PORT = 8126;
const ORIGIN = `http://localhost:${PORT}`;
const DB = 'check-ops.db';

for (const suffix of ['', '-wal', '-shm']) {
  if (existsSync(DB + suffix)) rmSync(DB + suffix);
}
execFileSync(process.execPath, ['scripts/load-db.js'], {
  env: { ...process.env, DATABASE_FILE: DB },
  stdio: 'ignore',
});

const server = spawn(process.execPath, ['server/index.js'], {
  env: {
    ...process.env,
    DATABASE_FILE: DB,
    PORT: String(PORT),
    NODE_ENV: 'production',
    JWT_SECRET: 'test-secret',
  },
  stdio: 'ignore',
});

let pass = 0;
let fail = 0;
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${ok ? '' : ` got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`}`);
};

async function ready() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const res = await fetch(`${ORIGIN}/healthz`);
      if (res.status === 200) return res;
    } catch {
      // the process is still binding the port
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('server did not become ready');
}

try {
  const blank = clearedOrgLists();
  check(
    'org switch clears five lists',
    Object.keys(blank).sort(),
    ['devices', 'events', 'grants', 'members', 'sessions'],
  );
  check('cleared lists are empty', Object.values(blank).map((list) => list.length), [0, 0, 0, 0, 0]);

  const health = await ready();
  const healthBody = await health.json();
  check('health is ok', healthBody, { ok: true });
  check('nosniff', health.headers.get('x-content-type-options'), 'nosniff');
  check('no framing', health.headers.get('x-frame-options'), 'DENY');
  check('no referrer', health.headers.get('referrer-policy'), 'no-referrer');

  const plain = await fetch(`${ORIGIN}/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: '{"email":"dana@example.test","password":"demo1234"}',
  });
  const plainBody = await plain.json();
  check('text body is 400', plain.status, 400);
  check('text body is VALIDATION', plainBody.error.code, 'VALIDATION');

  const logout = await fetch(`${ORIGIN}/v1/auth/logout`, { method: 'POST' });
  const logoutBody = await logout.json();
  check('empty logout is 200', logout.status, 200);
  check('empty logout is not a validation error', logoutBody, { ok: true });

  const login = await fetch(`${ORIGIN}/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'dana@example.test', password: 'demo1234' }),
  });
  check('json login still works', login.status, 200);

  const huge = await fetch(`${ORIGIN}/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'a@b.c', password: 'x'.repeat(1_000_001) }),
  });
  const hugeBody = await huge.json();
  check('oversized body is 400', huge.status, 400);
  check('oversized body is VALIDATION', hugeBody.error.code, 'VALIDATION');
} finally {
  await new Promise((resolve) => {
    if (server.exitCode !== null) return resolve();
    server.once('exit', resolve);
    server.kill();
    setTimeout(resolve, 2000);
  });
  for (const suffix of ['', '-wal', '-shm']) {
    if (!existsSync(DB + suffix)) continue;
    try {
      rmSync(DB + suffix);
    } catch {
      // Windows can keep the handle for a moment after the process exits.
    }
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
