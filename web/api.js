let accessToken = null;

export function setAccessToken(token) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

async function parse(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function api(method, path, body, attempt = 0) {
  const headers = {};
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  if (body !== undefined) headers['content-type'] = 'application/json';

  let res;
  try {
    res = await fetch(path, {
      method,
      headers,
      credentials: 'include',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    const err = new Error('The server is not responding. Check that RemoteOps is running, then try again.');
    err.code = 'UNREACHABLE';
    throw err;
  }

  const json = await parse(res);
  if (res.status === 401 && json?.error?.code === 'TOKEN_STALE' && attempt === 0) {
    const refreshed = await refresh();
    if (refreshed?.token) return api(method, path, body, 1);
  }
  if (!res.ok) {
    const err = new Error(json?.error?.message || `Request failed (${res.status}).`);
    err.code = json?.error?.code || 'HTTP';
    err.reason = json?.error?.reason ?? null;
    err.status = res.status;
    throw err;
  }
  return json;
}

export async function refresh() {
  const res = await fetch('/v1/auth/refresh', { method: 'POST', credentials: 'include' });
  const json = await parse(res);
  if (!res.ok) return null;
  accessToken = json.token;
  return json;
}

export function explain(err) {
  if (!err) return '';
  const note = {
    explicit_deny: 'Someone denied this.',
    implicit: 'Nobody granted this.',
    missing_permission: 'Nobody granted this.',
    missing_device_permission: 'Opening a session is allowed, but not this mode on this device.',
    suspended: 'This membership is suspended.',
    scope_mismatch: 'You do not hold that permission at this scope.',
    self_grant: 'Grants cannot be given to yourself.',
  }[err.reason];
  return [err.message, note].filter(Boolean).join(' ');
}
