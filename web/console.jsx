import React, { useEffect, useMemo, useState } from 'react';
import { api, explain, refresh, setAccessToken } from './api.js';
import { Action, held } from './action.jsx';
import { LoginForm } from './login.jsx';
import { clearedOrgLists } from './org-state.js';
import { Audit, Sessions } from './activity.jsx';
import { Devices } from './devices.jsx';
import { Grants } from './grants.jsx';
import { People } from './people.jsx';

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

  function applyClearedLists() {
    const blank = clearedOrgLists();
    setDevices(blank.devices);
    setDevicesReady(false);
    setGrants(blank.grants);
    setMembers(blank.members);
    setSessions(blank.sessions);
    setEvents(blank.events);
  }

  useEffect(() => {
    applyClearedLists();
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
    applyClearedLists();
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
      applyClearedLists();
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
          <Devices
            orgId={org.id}
            devices={devices}
            devicesReady={devicesReady}
            perms={perms}
            setDevices={setDevices}
            setNotice={setNotice}
            setView={setView}
            run={run}
          />
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
          <Sessions
            orgId={org.id}
            sessions={sessions}
            perms={perms}
            selfId={session.user.id}
            setSessions={setSessions}
            setView={setView}
            run={run}
          />
        )}
        {view === 'audit' && <Audit events={events} />}
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
