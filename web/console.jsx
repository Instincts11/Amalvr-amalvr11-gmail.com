import React, { useEffect, useMemo, useState } from 'react';
import { api, explain, refresh, setAccessToken } from './api.js';

const THEME_COLOR = {
  cobalt: '#0e1c36',
  amber: '#2a1c0a',
  moss: '#10241a',
  plum: '#241028',
  rust: '#2a140e',
  teal: '#062428',
  pine: '#0d2418',
  iris: '#16142e',
};

function themeColor(theme) {
  if (THEME_COLOR[theme]) return THEME_COLOR[theme];
  let hash = 0;
  for (const ch of String(theme ?? '')) hash = (hash * 33 + ch.charCodeAt(0)) >>> 0;
  return `hsl(${hash % 360} 42% 14%)`;
}

function held(perms, key) {
  return perms?.[key]?.effect === 'allow';
}

function Action({ perms, permission, testid, children, onClick }) {
  if (!held(perms, permission)) return null;
  return (
    <button type="button" data-testid={testid} data-permission={permission} data-state="unlocked" onClick={onClick}>
      {children}
    </button>
  );
}

function LoginForm({ onSuccess, heading = 'Sign in' }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);

  async function submit(event) {
    event.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError({ message: 'Enter an email and a password.', code: 'VALIDATION' });
      return;
    }
    try {
      const session = await api('POST', '/v1/auth/login', { email: email.trim(), password });
      setAccessToken(session.token);
      onSuccess(session);
    } catch (err) {
      setError({ message: err.message, code: err.code || 'UNAUTHENTICATED' });
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" data-testid="login-form" onSubmit={submit}>
        <p className="eyebrow">RemoteOps</p>
        <h1>{heading}</h1>
        <p className="eyebrow">Control plane · sessions are records, not streams</p>
        <label htmlFor="login-email">Email</label>
        <input id="login-email" data-testid="login-email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label htmlFor="login-password">Password</label>
        <input id="login-password" data-testid="login-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button data-testid="login-submit" type="submit">Sign in</button>
        {error && (
          <div data-testid="login-error" data-error-code={error.code} role="alert" aria-live="assertive" className="alert">
            {error.message}
          </div>
        )}
      </form>
    </div>
  );
}

function InvitePage({ token }) {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    let cancel = false;
    api('GET', `/v1/invites/${encodeURIComponent(token)}`)
      .then((body) => { if (!cancel) setInfo(body); })
      .catch((err) => { if (!cancel) setError(explain(err) || 'This invite link is not valid.'); });
    return () => { cancel = true; };
  }, [token]);

  if (done) return <LoginForm heading="Invite accepted" onSuccess={() => {}} />;

  async function submit(event) {
    event.preventDefault();
    setError('');
    try {
      await api('POST', `/v1/invites/${encodeURIComponent(token)}/accept`, { name, password });
      setDone(true);
    } catch (err) {
      setError(explain(err));
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <p className="eyebrow">Invitation</p>
        <h1>Join an organization</h1>
        {error && <div data-testid="invite-error" role="alert" className="alert">{error}</div>}
        {info && (
          <>
            <p>You have been invited to <strong>{info.orgName}</strong>.</p>
            <p data-testid="invite-role">{info.role}</p>
            <label htmlFor="invite-email">Email</label>
            <input id="invite-email" data-testid="invite-email" value={info.email} readOnly />
            <label htmlFor="invite-name">Your name</label>
            <input id="invite-name" data-testid="invite-name" value={name} onChange={(e) => setName(e.target.value)} />
            <label htmlFor="invite-password">Password</label>
            <input id="invite-password" data-testid="invite-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button data-testid="invite-submit" type="submit">Accept invite</button>
          </>
        )}
      </form>
    </div>
  );
}

const NAV = [
  ['devices', 'Devices', 'device:list'],
  ['people', 'People', 'user:read'],
  ['grants', 'Grants', 'user:read'],
  ['sessions', 'Sessions', 'session:view'],
  ['audit', 'Audit', 'audit:read'],
];

function Console({ session, setSession }) {
  const [view, setView] = useState('devices');
  const [devices, setDevices] = useState([]);
  const [devicesReady, setDevicesReady] = useState(false);
  const [members, setMembers] = useState([]);
  const [roles, setRoles] = useState(session.roles ?? []);
  const [grants, setGrants] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [events, setEvents] = useState([]);
  const [notice, setNotice] = useState('');
  const [grantOpen, setGrantOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  const perms = session.permissions;
  const org = session.org;

  useEffect(() => {
    setDevices([]);
    setGrants([]);
    setMembers([]);
    setSessions([]);
    setEvents([]);
    setGrantOpen(false);
    setInviteOpen(false);
    setNotice('');
    setView('devices');
  }, [org.id]);

  useEffect(() => {
    let cancel = false;
    const path = `/v1/orgs/${org.id}`;
    const fail = (err) => { if (!cancel) setNotice(explain(err)); };
    if (view === 'devices') {
      setDevicesReady(false);
      api('GET', `${path}/devices`).then((body) => {
        if (cancel) return;
        setDevices(body.devices);
        setDevicesReady(true);
      }).catch(fail);
    } else if (view === 'people') {
      api('GET', `${path}/members`).then((body) => {
        if (cancel) return;
        setMembers(body.members);
        setRoles(body.roles);
      }).catch(fail);
    } else if (view === 'grants') {
      api('GET', `${path}/grants`).then((body) => { if (!cancel) setGrants(body.grants); }).catch(fail);
    } else if (view === 'sessions') {
      api('GET', `${path}/sessions`).then((body) => { if (!cancel) setSessions(body.sessions); }).catch(fail);
    } else if (view === 'audit') {
      api('GET', `${path}/audit?limit=50`).then((body) => { if (!cancel) setEvents(body.events); }).catch(fail);
    }
    return () => { cancel = true; };
  }, [view, org.id, session.token]);

  async function switchOrg(orgId) {
    if (orgId === org.id) return;
    setNotice('');
    const next = await api('POST', '/v1/auth/token', { orgId });
    setDevices([]);
    setDevicesReady(false);
    setGrants([]);
    setMembers([]);
    setSessions([]);
    setEvents([]);
    setAccessToken(next.token);
    setSession(next);
  }

  async function createOrg() {
    const name = window.prompt('Organization name');
    if (!name || !name.trim()) return;
    setNotice('');
    try {
      const created = await api('POST', '/v1/orgs', { name: name.trim() });
      const next = await api('POST', '/v1/auth/token', { orgId: created.id });
      setDevices([]);
      setDevicesReady(false);
      setGrants([]);
      setMembers([]);
      setSessions([]);
      setEvents([]);
      setAccessToken(next.token);
      setSession(next);
    } catch (err) {
      setNotice(explain(err));
    }
  }

  async function signOut() {
    await api('POST', '/v1/auth/logout').catch(() => {});
    setAccessToken(null);
    setSession(null);
  }

  async function run(fn) {
    setNotice('');
    try {
      await fn();
    } catch (err) {
      setNotice(explain(err));
    }
  }

  const catalogue = useMemo(() => Object.keys(perms ?? {}).sort(), [perms]);
  const showAdmin = held(perms, 'org:update') || held(perms, 'org:delete');
  const suspended = Object.values(perms ?? {}).some((item) => item.reason === 'suspended');

  return (
    <div className="app-shell" data-testid="app-shell" data-org-id={org.id} data-org-theme={org.theme} style={{ backgroundColor: themeColor(org.theme) }}>
      <aside className="rail">
        <p className="brand">RemoteOps</p>
        <h1 className="org-name">{org.name}</h1>
        <p className="role-line">Role <span data-testid="active-role">{session.role}</span></p>
        <div className="org-switch">
          {session.orgs.map((item) => (
            <button
              key={item.id}
              type="button"
              data-testid="org-option"
              data-org-id={item.id}
              aria-current={item.id === org.id ? 'true' : undefined}
              onClick={() => switchOrg(item.id)}
            >
              {item.name}
            </button>
          ))}
          <button type="button" data-testid="create-org" onClick={createOrg}>New organization</button>
        </div>
        <nav className="nav">
          {NAV.map(([key, label, permission]) => held(perms, permission) && (
            <button key={key} type="button" data-testid={`nav-${key}`} data-permission={permission} data-state="unlocked" aria-current={view === key ? 'true' : undefined} onClick={() => setView(key)}>
              {label}
            </button>
          ))}
          {showAdmin && (
            <button type="button" data-testid="nav-admin" data-permission={held(perms, 'org:update') ? 'org:update' : 'org:delete'} data-state="unlocked" aria-current={view === 'admin' ? 'true' : undefined} onClick={() => setView('admin')}>
              Admin
            </button>
          )}
        </nav>
        <button type="button" className="ghost" data-testid="sign-out" onClick={signOut} style={{ marginTop: 22 }}>Sign out</button>
      </aside>
      <main className="main">
        {suspended && <p className="banner" role="status">This membership is suspended. Permissioned actions are hidden; the server still refuses them.</p>}
        {notice && <p className="banner" role="alert">{notice}</p>}
        {view === 'devices' && (
          <section>
            <div className="toolbar">
              <h2>Devices</h2>
              <Action perms={perms} permission="device:provision" testid="add-device" onClick={() => run(async () => {
                const name = window.prompt('Device name');
                if (!name) return;
                const kind = window.prompt('Kind: macos, windows, linux, android, ios', 'linux');
                if (!kind) return;
                await api('POST', `/v1/orgs/${org.id}/devices`, { name, kind });
                setView('people');
                setView('devices');
              })}>Add device</Action>
            </div>
            {devicesReady && devices.length === 0 && <p className="empty" data-testid="devices-empty">No devices in this organization yet.</p>}
            {devices.length > 0 && (
              <table>
                <thead>
                  <tr><th>Name</th><th>Kind</th><th>State</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {devices.map((device) => (
                    <tr key={device.id} data-testid="device-row" data-device-id={device.id}>
                      <td>{device.name}</td>
                      <td className="mono">{device.kind}</td>
                      <td>{device.online ? 'online' : 'offline'}</td>
                      <td className="row-actions">
                        <Action perms={device.permissions} permission="device:view" testid="start-view" onClick={() => run(() => api('POST', `/v1/orgs/${org.id}/sessions`, { deviceId: device.id, mode: 'view' }))}>View</Action>
                        <Action perms={device.permissions} permission="device:control" testid="start-control" onClick={() => run(() => api('POST', `/v1/orgs/${org.id}/sessions`, { deviceId: device.id, mode: 'control' }))}>Control</Action>
                        <Action perms={device.permissions} permission="device:terminal" testid="start-terminal" onClick={() => run(() => api('POST', `/v1/orgs/${org.id}/sessions`, { deviceId: device.id, mode: 'terminal' }))}>Terminal</Action>
                        <Action perms={device.permissions} permission="device:file_transfer" testid="transfer-files" onClick={() => run(async () => {
                          await api('POST', `/v1/orgs/${org.id}/devices/${device.id}/file-transfer`, {});
                          setNotice('Authorisation recorded. RemoteOps does not move bytes.');
                        })}>Transfer files</Action>
                        <Action perms={device.permissions} permission="device:update" testid="rename-device" onClick={() => run(async () => {
                          const name = window.prompt('Rename device', device.name);
                          if (!name) return;
                          await api('PATCH', `/v1/orgs/${org.id}/devices/${device.id}`, { name });
                          setDevices((rows) => rows.map((row) => row.id === device.id ? { ...row, name } : row));
                        })}>Rename</Action>
                        <Action perms={device.permissions} permission="device:provision" testid="decommission-device" onClick={() => run(async () => {
                          if (!window.confirm(`Decommission ${device.name}?`)) return;
                          await api('DELETE', `/v1/orgs/${org.id}/devices/${device.id}`);
                          setDevices((rows) => rows.filter((row) => row.id !== device.id));
                        })}>Decommission</Action>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}
        {view === 'people' && (
          <People orgId={org.id} members={members} roles={roles} perms={perms} selfId={session.user.id} inviteOpen={inviteOpen} setInviteOpen={setInviteOpen} run={run} reload={() => setView('devices') || setTimeout(() => setView('people'), 0)} />
        )}
        {view === 'grants' && (
          <Grants
            orgId={org.id}
            grants={grants}
            perms={perms}
            catalogue={catalogue}
            open={grantOpen}
            setOpen={setGrantOpen}
            run={run}
            onChanged={async () => {
              const body = await api('GET', `/v1/orgs/${org.id}/grants`);
              setGrants(body.grants);
              setGrantOpen(false);
            }}
          />
        )}
        {view === 'sessions' && (
          <section>
            <div className="toolbar">
              <h2>Sessions</h2>
              <Action perms={perms} permission="session:start" testid="new-session" onClick={() => setView('devices')}>Start from a device</Action>
            </div>
            <p className="muted">A live session keeps the authority it started with. Hiding a button does not end it.</p>
            <table>
              <thead><tr><th>Device</th><th>Mode</th><th>State</th><th></th></tr></thead>
              <tbody>
                {sessions.map((row) => (
                  <tr key={row.id} data-testid="session-row">
                    <td className="mono">{row.device_id}</td>
                    <td>{row.mode}</td>
                    <td>{row.state}{row.end_reason ? ` · ${row.end_reason}` : ''}</td>
                    <td>
                      {row.state === 'active' && (row.user_id === session.user.id || held(perms, 'session:terminate')) && (
                        <button
                          type="button"
                          data-testid="stop-session"
                          {...(held(perms, 'session:terminate') && row.user_id !== session.user.id ? { 'data-permission': 'session:terminate', 'data-state': 'unlocked' } : {})}
                          onClick={() => run(async () => {
                            await api('DELETE', `/v1/sessions/${row.id}`);
                            const body = await api('GET', `/v1/orgs/${org.id}/sessions`);
                            setSessions(body.sessions);
                          })}
                        >Stop</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
        {view === 'audit' && (
          <section>
            <h2>Audit</h2>
            <table>
              <thead><tr><th>When</th><th>Action</th><th>Result</th><th>Reason</th></tr></thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id} data-testid="audit-row">
                    <td className="mono">{event.at}</td>
                    <td>{event.action}</td>
                    <td>{event.result}</td>
                    <td>{event.reason_code ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
        {view === 'admin' && (
          <section>
            <h2>Admin</h2>
            <div className="toolbar">
              <Action perms={perms} permission="org:update" testid="rename-org" onClick={() => run(async () => {
                const name = window.prompt('Organization name', org.name);
                if (!name || !name.trim()) return;
                await api('PATCH', `/v1/orgs/${org.id}`, { name: name.trim() });
                const me = await api('GET', '/v1/auth/me');
                setSession({ ...me, token: session.token });
              })}>Rename organization</Action>
              <Action perms={perms} permission="org:delete" testid="delete-org" onClick={() => run(async () => {
                if (!window.confirm(`Delete ${org.name}?`)) return;
                await api('DELETE', `/v1/orgs/${org.id}`);
                const remaining = session.orgs.filter((item) => item.id !== org.id);
                if (!remaining.length) {
                  setAccessToken(null);
                  setSession(null);
                  return;
                }
                const next = await api('POST', '/v1/auth/token', { orgId: remaining[0].id });
                setAccessToken(next.token);
                setSession(next);
              })}>Delete organization</Action>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function People({ orgId, members, roles, perms, selfId, inviteOpen, setInviteOpen, run, reload }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState(roles[0]?.key ?? 'viewer');
  return (
    <section>
      <div className="toolbar">
        <h2>People</h2>
        <Action perms={perms} permission="user:invite" testid="invite-user" onClick={() => setInviteOpen((open) => !open)}>Invite</Action>
      </div>
      {inviteOpen && (
        <form className="panel-card inline" onSubmit={(event) => {
          event.preventDefault();
          run(async () => {
            const created = await api('POST', `/v1/orgs/${orgId}/invites`, { email, role });
            setInviteOpen(false);
            window.prompt('Invite token — copy it now. It will not be shown again.', created.inviteToken);
          });
        }}>
          <input aria-label="Invite email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" />
          <select aria-label="Invite role" value={role} onChange={(e) => setRole(e.target.value)}>
            {roles.map((item) => <option key={item.key} value={item.key}>{item.key}</option>)}
          </select>
          <button type="submit">Send invite</button>
        </form>
      )}
      <table>
        <thead><tr><th>Person</th><th>Role</th><th></th></tr></thead>
        <tbody>
          {members.map((member) => (
            <tr key={member.id} data-testid="user-row" data-user-id={member.id}>
              <td>{member.name}<div className="muted">{member.email}</div><div className="mono">{member.status}</div></td>
              <td>
                {held(perms, 'user:role:update') ? (
                  <select
                    data-testid="role-select"
                    value={member.role}
                    onChange={(event) => run(async () => {
                      await api('PATCH', `/v1/orgs/${orgId}/members/${member.id}`, { role: event.target.value });
                      reload();
                    })}
                  >
                    {roles.map((item) => <option key={item.key} value={item.key}>{item.key}</option>)}
                  </select>
                ) : member.role}
              </td>
              <td className="row-actions">
                {member.id !== selfId && (
                  <>
                    <Action perms={perms} permission="user:remove" testid="suspend-user" onClick={() => run(async () => {
                      const path = `/v1/orgs/${orgId}/members/${member.id}/suspend`;
                      if (member.status === 'suspended') await api('DELETE', path);
                      else await api('POST', path, {});
                      reload();
                    })}>{member.status === 'suspended' ? 'Reinstate' : 'Suspend'}</Action>
                    <Action perms={perms} permission="user:remove" testid="remove-user" onClick={() => run(async () => {
                      if (!window.confirm(`Remove ${member.email}?`)) return;
                      await api('DELETE', `/v1/orgs/${orgId}/members/${member.id}`);
                      reload();
                    })}>Remove</Action>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Grants({ orgId, grants, perms, catalogue, open, setOpen, run, onChanged }) {
  const [userId, setUserId] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [effect, setEffect] = useState('allow');
  const [picked, setPicked] = useState({});
  const [users, setUsers] = useState([]);
  const [devices, setDevices] = useState([]);

  async function openForm() {
    const [memberBody, deviceBody] = await Promise.all([
      api('GET', `/v1/orgs/${orgId}/members`),
      api('GET', `/v1/orgs/${orgId}/devices`),
    ]);
    setUsers(memberBody.members);
    setDevices(deviceBody.devices);
    setUserId(memberBody.members[0]?.id ?? '');
    setDeviceId(deviceBody.devices[0]?.id ?? '');
    setPicked({});
    setOpen(true);
  }

  return (
    <section>
      <div className="toolbar">
        <h2>Grants</h2>
        <Action perms={perms} permission="grant:create" testid="new-grant" onClick={() => run(openForm)}>New grant</Action>
      </div>
      {open && (
        <form className="panel-card" onSubmit={(event) => {
          event.preventDefault();
          const permissions = Object.entries(picked).filter(([, on]) => on).map(([key]) => key);
          run(async () => {
            await api('POST', `/v1/orgs/${orgId}/grants`, { userId, deviceId: deviceId || null, effect, permissions });
            await onChanged();
          });
        }}>
          <label htmlFor="grant-user">Person</label>
          <select id="grant-user" data-testid="grant-user" value={userId} onChange={(e) => setUserId(e.target.value)}>
            {users.map((user) => <option key={user.id} value={user.id}>{user.email}</option>)}
          </select>
          <label htmlFor="grant-device">Device</label>
          <select id="grant-device" data-testid="grant-device" value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
            <option value="">Entire organization</option>
            {devices.map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}
          </select>
          <label htmlFor="grant-effect">Effect</label>
          <select id="grant-effect" data-testid="grant-effect" value={effect} onChange={(e) => setEffect(e.target.value)}>
            <option value="allow">allow</option>
            <option value="deny">deny</option>
          </select>
          <div className="checks">
            {catalogue.map((key) => (
              <label key={key}>
                <input type="checkbox" data-permission-key={key} checked={!!picked[key]} onChange={(e) => setPicked((prev) => ({ ...prev, [key]: e.target.checked }))} />
                {key}
              </label>
            ))}
          </div>
          <button data-testid="grant-submit" type="submit">Create grant</button>
        </form>
      )}
      <table>
        <thead><tr><th>Person</th><th>Effect</th><th>Scope</th><th>Permissions</th><th></th></tr></thead>
        <tbody>
          {grants.map((grant) => (
            <tr key={grant.id} data-testid="grant-row" data-effect={grant.effect}>
              <td className="mono">{grant.user_id}</td>
              <td>{grant.effect}</td>
              <td className="mono">{grant.device_id ?? 'org'}</td>
              <td className="mono">{grant.permissions.join(', ')}</td>
              <td>
                <Action perms={perms} permission="grant:revoke" testid="revoke-grant" onClick={() => run(async () => {
                  await api('DELETE', `/v1/orgs/${orgId}/grants/${grant.id}`);
                  await onChanged();
                })}>Revoke</Action>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function App() {
  const inviteToken = useMemo(() => {
    const match = window.location.pathname.match(/^\/invite\/([^/]+)/);
    return match ? decodeURIComponent(match[1]) : '';
  }, []);
  const [session, setSession] = useState(null);
  const [booting, setBooting] = useState(!inviteToken);

  useEffect(() => {
    if (inviteToken) return undefined;
    let cancel = false;
    refresh()
      .then((body) => { if (!cancel) setSession(body); })
      .finally(() => { if (!cancel) setBooting(false); });
    return () => { cancel = true; };
  }, [inviteToken]);

  if (inviteToken) return <InvitePage token={inviteToken} />;
  if (booting) return <div className="login-wrap"><p>Restoring session…</p></div>;
  if (!session) return <LoginForm onSuccess={setSession} />;
  return <Console session={session} setSession={setSession} />;
}
