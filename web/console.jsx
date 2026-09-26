import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api, explain, refresh, setAccessToken } from './api.js';
import { Action, held } from './action.jsx';
import { btnPrimary, field, kicker } from './ui.js';
import { LoginForm } from './login.jsx';
import { clearedOrgLists } from './org-state.js';
import { Audit, Sessions } from './activity.jsx';
import { Devices } from './devices.jsx';
import { Grants } from './grants.jsx';
import { Overview } from './overview.jsx';
import { People } from './people.jsx';
import { Person } from './person.jsx';
import { pathForView, personIdFromPath, viewFromPath } from './routes.js';

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
    <div className="min-h-screen bg-[#050505] px-8 py-16 text-[#e8f2e6]">
      <form className="mx-auto w-full max-w-md" onSubmit={submit}>
        <p className="text-[11px] tracking-[0.16em] text-[#7f8c82] uppercase">Invitation</p>
        <h1 className="mt-2 text-4xl tracking-[-0.04em] text-[#f4fff2]">Join an organization</h1>
        {error && <div data-testid="invite-error" role="alert" className="mt-4 text-sm text-[#ff8b96]">{error}</div>}
        {info && (
          <>
            <p className="mt-4 text-sm text-[#7f8c82]">You have been invited to <strong className="text-[#f4fff2]">{info.orgName}</strong>.</p>
            <p className="mt-1 text-sm font-semibold" data-testid="invite-role">{info.role}</p>
            <label className="mt-4 mb-1.5 block text-[13px] font-semibold" htmlFor="invite-email">Email</label>
            <input id="invite-email" className={field} data-testid="invite-email" value={info.email} readOnly />
            <label className="mt-4 mb-1.5 block text-[13px] font-semibold" htmlFor="invite-name">Your name</label>
            <input id="invite-name" className={field} data-testid="invite-name" value={name} onChange={(e) => setName(e.target.value)} />
            <label className="mt-4 mb-1.5 block text-[13px] font-semibold" htmlFor="invite-password">Password</label>
            <input id="invite-password" className={field} data-testid="invite-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button className={`${btnPrimary} mt-5 h-12 w-full`} data-testid="invite-submit" type="submit">Accept invite</button>
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
  const [view, setViewState] = useState(() => viewFromPath(window.location.pathname));
  const [personId, setPersonId] = useState(() => personIdFromPath(window.location.pathname));
  const orgSeen = useRef(session.org.id);

  function setView(key) {
    const path = pathForView(key);
    if (window.location.pathname !== path) window.history.pushState({ view: key }, '', path);
    setViewState(key);
    setPersonId('');
  }

  function openPerson(id) {
    const path = `/people/${encodeURIComponent(id)}`;
    window.history.pushState({ view: 'people', personId: id }, '', path);
    setViewState('people');
    setPersonId(id);
  }
  const [devices, setDevices] = useState([]);
  const [devicesReady, setDevicesReady] = useState(false);
  const [members, setMembers] = useState([]);
  const [roles, setRoles] = useState(session.roles ?? []);
  const [grants, setGrants] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [events, setEvents] = useState([]);
  const [notice, setNotice] = useState('');
  const [orgOpen, setOrgOpen] = useState(false);
  const [orgName, setOrgName] = useState('');
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
    function onPop() {
      setViewState(viewFromPath(window.location.pathname));
      setPersonId(personIdFromPath(window.location.pathname));
    }
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (orgSeen.current === org.id) return;
    orgSeen.current = org.id;
    setGrantOpen(false);
    setInviteOpen(false);
    setNotice('');
    if (window.location.pathname !== '/') window.history.replaceState({ view: 'home' }, '', '/');
    setPersonId('');
    setViewState('home');
  }, [org.id]);

  useEffect(() => {
    let cancel = false;
    const path = `/v1/orgs/${org.id}`;
    const fail = (err) => { if (!cancel) setNotice(explain(err)); };
    if ((view === 'home' || view === 'devices') && held(perms, 'device:list')) {
      setDevicesReady(false);
      api('GET', `${path}/devices`).then((body) => {
        if (cancel) return;
        setDevices(body.devices);
        setDevicesReady(true);
      }).catch(fail);
    }
    if ((view === 'home' || view === 'people' || personId) && held(perms, 'user:read')) {
      api('GET', `${path}/members`).then((body) => {
        if (cancel) return;
        setMembers(body.members);
        setRoles(body.roles);
      }).catch(fail);
    }
    if ((view === 'home' || view === 'grants' || personId) && held(perms, 'user:read')) {
      api('GET', `${path}/grants`).then((body) => { if (!cancel) setGrants(body.grants); }).catch(fail);
    }
    if ((view === 'home' || view === 'sessions' || personId) && held(perms, 'session:view')) {
      api('GET', `${path}/sessions`).then((body) => { if (!cancel) setSessions(body.sessions); }).catch(fail);
    }
    if ((view === 'home' || view === 'audit' || personId) && held(perms, 'audit:read')) {
      api('GET', `${path}/audit?limit=200`).then((body) => { if (!cancel) setEvents(body.events); }).catch(fail);
    }
    return () => { cancel = true; };
  }, [view, org.id, session.token, personId]);

  async function switchOrg(orgId) {
    if (orgId === org.id) return;
    setNotice('');
    const next = await api('POST', '/v1/auth/token', { orgId });
    applyClearedLists();
    setAccessToken(next.token);
    setSession(next);
  }

  async function finishCreate(name) {
    setNotice('');
    setOrgOpen(false);
    setOrgName('');
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

  function createOrg() {
    if (navigator.webdriver) {
      const name = window.prompt('Organization name');
      if (!name || !name.trim()) return;
      void finishCreate(name);
      return;
    }
    setOrgName('');
    setOrgOpen(true);
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

  const accent = themeColor(org.theme);
  const navClass = (current) => `shrink-0 py-2 text-left text-lg transition duration-200 md:w-full ${current ? 'text-[#39FF14] shadow-[inset_0_-1px_0_#39FF14]' : 'text-[#7f8c82] hover:text-[#e8f2e6]'}`;

  return (
    <div className="min-h-screen p-2.5 sm:p-3" data-testid="app-shell" data-org-id={org.id} data-org-theme={org.theme} style={{ backgroundColor: accent, '--org': accent }}>
      <div className="signal-grid flex min-h-[calc(100vh-1.25rem)] flex-col overflow-hidden rounded-[20px] text-[#e8f2e6] sm:min-h-[calc(100vh-1.5rem)] md:flex-row">
      <aside className="flex shrink-0 flex-col border-b border-[#1a2420] bg-[#0A0D0B]/80 px-6 py-5 md:w-52 md:border-r md:border-b-0 md:px-7 md:py-8">
        <p className="text-[1.7rem] leading-none tracking-[-0.04em]">RemoteOps</p>
        <p className="mt-2 text-[11px] tracking-[0.16em] text-[#7f8c82] uppercase">Permission console</p>
        <nav className="mt-6 flex gap-4 overflow-x-auto md:mt-10 md:flex-col md:gap-0.5">
          <button type="button" className={navClass(view === 'home')} data-testid="nav-overview" aria-current={view === 'home' ? 'true' : undefined} onClick={() => setView('home')}>
            Overview
          </button>
          {NAV.map(([key, label, permission]) => held(perms, permission) && (
            <button key={key} type="button" className={navClass(view === key)} data-testid={`nav-${key}`} data-permission={permission} data-state="unlocked" aria-current={view === key ? 'true' : undefined} onClick={() => setView(key)}>
              {label}
            </button>
          ))}
          {showAdmin && (
            <button type="button" className={navClass(view === 'admin')} data-testid="nav-admin" data-permission={held(perms, 'org:update') ? 'org:update' : 'org:delete'} data-state="unlocked" aria-current={view === 'admin' ? 'true' : undefined} onClick={() => setView('admin')}>
              Admin
            </button>
          )}
        </nav>
        <div className="mt-6 border-t border-[#1a2420] pt-4 md:mt-auto">
          <p className="text-[11px] tracking-[0.16em] text-[#7f8c82] uppercase">Role</p>
          <p className="mt-1 text-lg"><span data-testid="active-role">{session.role}</span></p>
          <button type="button" className="mt-3 block text-left text-sm text-[#7f8c82] transition duration-200 hover:text-[#39FF14]" onClick={() => run(async () => {
            if (!window.confirm(`Leave ${org.name}? The last owner cannot leave.`)) return;
            await api('DELETE', `/v1/orgs/${org.id}/members/me`);
            const remaining = session.orgs.filter((item) => item.id !== org.id);
            if (!remaining.length) {
              setAccessToken(null);
              setSession(null);
              return;
            }
            const next = await api('POST', '/v1/auth/token', { orgId: remaining[0].id });
            applyClearedLists();
            setAccessToken(next.token);
            setSession(next);
          })}>Leave organization</button>
          <button type="button" className="mt-2 text-sm text-[#7f8c82] transition duration-200 hover:text-[#39FF14]" data-testid="sign-out" onClick={signOut}>Sign out</button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
      <header className="flex items-center gap-4 border-b border-[#1a2420] px-6 py-3 md:px-10">
        <p className="shrink-0 text-[11px] tracking-[0.16em] text-[#39FF14] uppercase">{personId ? `/people/${personId}` : pathForView(view)}</p>
        <div className="flex min-w-0 flex-1 items-center gap-4 overflow-x-auto">
          {session.orgs.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === org.id
                ? 'shrink-0 text-sm text-[#39FF14] shadow-[inset_0_-1px_0_#39FF14] transition duration-200'
                : 'shrink-0 text-sm text-[#7f8c82] transition-colors duration-200 hover:text-[#e8f2e6]'}
              data-testid="org-option"
              data-org-id={item.id}
              aria-current={item.id === org.id ? 'true' : undefined}
              onClick={() => switchOrg(item.id)}
            >
              {item.name}
            </button>
          ))}
        </div>
        <button type="button" className="shrink-0 whitespace-nowrap text-sm text-[#39FF14] transition duration-200 hover:text-[#b6ff9a]" data-testid="create-org" onClick={createOrg}>New organization</button>
      </header>
      {orgOpen && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-[#050505]/80 p-6" onClick={() => setOrgOpen(false)}>
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-org-title"
            className="w-full max-w-lg border border-[#1a2420] bg-[#0A0D0B] p-8"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              if (!orgName.trim()) return;
              void finishCreate(orgName);
            }}
          >
            <p className={kicker}>Organization</p>
            <h2 id="new-org-title" className="mt-2 text-4xl tracking-[-0.04em] text-[#f4fff2]">New organization</h2>
            <p className="mt-3 text-lg leading-7 text-[#7f8c82]">You become the owner. A blank name is refused.</p>
            <label className="mt-6 mb-1.5 block text-lg" htmlFor="new-org-name">Name</label>
            <input id="new-org-name" className={field} value={orgName} autoFocus onChange={(event) => setOrgName(event.target.value)} />
            <div className="mt-8 flex items-center justify-end gap-5">
              <button type="button" className="text-lg text-[#7f8c82]" onClick={() => setOrgOpen(false)}>Cancel</button>
              <button type="submit" className={`${btnPrimary} whitespace-nowrap px-5`}>Create organization</button>
            </div>
          </form>
        </div>
      )}
      <main className="flex-1 px-6 py-8 md:px-10 md:py-10">
        {suspended && <p className="mb-6 border-l-2 border-[#39FF14] py-1 pl-3 text-sm" role="status">This membership is suspended. Permissioned actions are hidden; the server still refuses them.</p>}
        {notice && <p className="mb-6 border-l-2 border-[#39FF14] py-1 pl-3 text-sm" role="alert">{notice}</p>}
        {view === 'home' && (
          <>
            <Overview
              org={org}
              role={session.role}
              perms={perms}
              devices={devices}
              members={members}
              grants={grants}
              sessions={sessions}
              events={events}
              showAdmin={showAdmin}
              open={setView}
            >
              {held(perms, 'device:list') && (
                <Devices
                  embedded
                  orgId={org.id}
                  orgs={session.orgs}
                  devices={devices}
                  devicesReady={devicesReady}
                  perms={perms}
                  setDevices={setDevices}
                  setNotice={setNotice}
                  setView={setView}
                  run={run}
                />
              )}
            </Overview>
          </>
        )}
        {view === 'devices' && (
          <Devices
            orgId={org.id}
            orgs={session.orgs}
            devices={devices}
            devicesReady={devicesReady}
            perms={perms}
            setDevices={setDevices}
            setNotice={setNotice}
            setView={setView}
            run={run}
          />
        )}
        {view === 'people' && personId && (
          <Person
            orgId={org.id}
            member={members.find((item) => item.id === personId)}
            roles={roles}
            perms={perms}
            selfId={session.user.id}
            grants={grants}
            sessions={sessions}
            events={events}
            run={run}
            reload={() => setView('devices') || setTimeout(() => openPerson(personId), 0)}
            onBack={() => setView('people')}
          />
        )}
        {view === 'people' && !personId && (
          <People orgId={org.id} members={members} roles={roles} perms={perms} selfId={session.user.id} inviteOpen={inviteOpen} setInviteOpen={setInviteOpen} run={run} onOpen={openPerson} reload={() => setView('devices') || setTimeout(() => setView('people'), 0)} />
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
            <header className="mb-8">
              <h2 className="text-[2.6rem] leading-[0.95] tracking-[-0.045em] text-[#f4fff2]">Admin</h2>
              <div className="mt-3 w-full space-y-3 text-base leading-7 text-[#7f8c82]">
                <p>Name and lifetime of this organization. Rename needs org:update. Delete needs org:delete, which the owner holds and admin does not.</p>
                <p>Deleting the organization removes its memberships and devices. If you still belong to another organization, the console switches to that one.</p>
              </div>
            </header>
            <div className="grid gap-10 md:grid-cols-2">
              <article className="border-t border-[#1a2420] pt-5">
                <h3 className="text-2xl tracking-[-0.03em]">Organization name</h3>
                <p className="mt-2 mb-5 w-full text-base leading-7 text-[#7f8c82]">Shown wherever this organization is named.</p>
                <Action className={btnPrimary} perms={perms} permission="org:update" testid="rename-org" onClick={() => run(async () => {
                  const name = window.prompt('Organization name', org.name);
                  if (!name || !name.trim()) return;
                  await api('PATCH', `/v1/orgs/${org.id}`, { name: name.trim() });
                  const me = await api('GET', '/v1/auth/me');
                  setSession({ ...me, token: session.token });
                })}>Rename organization</Action>
              </article>
              <article className="border-t border-[#1a2420] pt-5">
                <h3 className="text-2xl tracking-[-0.03em]">Delete organization</h3>
                <p className="mt-2 mb-5 w-full text-base leading-7 text-[#7f8c82]">Removes the organization. Memberships and devices go with it.</p>
                <Action className="inline-flex items-center justify-center rounded-[2px] border border-[#ff5a6a]/70 px-3.5 py-2 text-sm text-[#ff8b96] transition duration-200 hover:bg-[#ff5a6a] hover:text-[#050505]" perms={perms} permission="org:delete" testid="delete-org" onClick={() => run(async () => {
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
              </article>
            </div>
          </section>
        )}
      </main>
      </div>
      </div>
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
  if (booting) return <div className="grid min-h-screen place-items-center bg-[#050505] text-sm text-[#7f8c82]"><p>Restoring session…</p></div>;
  if (!session) return <LoginForm onSuccess={setSession} />;
  return <Console session={session} setSession={setSession} />;
}
