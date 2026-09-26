import { useState } from 'react';
import { held } from './action.jsx';
import { kicker, pageTitle } from './ui.js';
import { pathForView } from './routes.js';
import { Pager, usePaged } from './pager.jsx';

const PAGE_SIZE = 4;

function Block({ pageKey, title, open, children }) {
  return (
    <section className="mt-8 border-t border-[#1a2420] pt-5">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <div>
          <p className={kicker}>{pathForView(pageKey)}</p>
          <h3 className="mt-1 text-2xl tracking-[-0.03em] text-[#f4fff2]">{title}</h3>
        </div>
        <button type="button" className="text-sm text-[#39FF14]" onClick={() => open(pageKey)}>Open page</button>
      </div>
      {children}
    </section>
  );
}

function PagedList({ items, resetKey, label, empty, textOf, render }) {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const filtered = needle ? items.filter((item) => textOf(item).toLowerCase().includes(needle)) : items;
  const paged = usePaged(filtered, PAGE_SIZE, `${resetKey}:${needle}`);
  return (
    <>
      <input
        className="mb-2 w-full max-w-xs border-0 bg-transparent py-1 text-sm outline-none placeholder:text-[#7f8c82]"
        aria-label={label}
        placeholder={label}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {items.length === 0 && <p className="text-sm text-[#7f8c82]">{empty}</p>}
      {items.length > 0 && filtered.length === 0 && <p className="text-sm text-[#7f8c82]">Nothing matches that filter.</p>}
      {paged.slice.length > 0 && (
        <ul className="divide-y divide-[#1a2420] border-y border-[#1a2420]">
          {paged.slice.map(render)}
        </ul>
      )}
      <Pager {...paged} />
    </>
  );
}

export function Overview({ org, role, perms, devices, members, grants, sessions, events, showAdmin, open, children }) {
  const deviceName = Object.fromEntries(devices.map((device) => [device.id, device.name]));
  const personName = Object.fromEntries(members.map((member) => [member.id, member.name || member.email]));
  const showDevices = held(perms, 'device:list');
  const showPeople = held(perms, 'user:read');
  const showSessions = held(perms, 'session:view');
  const showAudit = held(perms, 'audit:read');
  const activeSessions = sessions.filter((row) => row.state === 'active').length;
  const stats = [
    showDevices && { label: 'Devices', value: devices.length },
    showDevices && { label: 'Live', value: devices.filter((device) => device.online).length },
    showPeople && { label: 'People', value: members.length },
    showPeople && { label: 'Grants', value: grants.length },
    showSessions && { label: 'Active', value: activeSessions },
    showAudit && { label: 'Audit', value: events.length },
  ].filter(Boolean);

  return (
    <div>
      <p className={kicker}>Start</p>
      <h2 className={pageTitle}>{org.name}</h2>
      <p className="mt-3 w-full text-xl leading-8 text-[#7f8c82]">{role}. Sessions are records. This role cannot see another organization.</p>
      <section className="mt-6 border border-[#1a2420] bg-[#0A0D0B]/80 px-5 py-4">
        <p className={kicker}>Organization</p>
        <div className={`mt-4 grid grid-cols-2 gap-6 sm:grid-cols-3 ${stats.length > 3 ? 'lg:grid-cols-6' : ''}`}>
          {stats.map((stat) => (
            <div key={stat.label}>
              <p className="text-[2.4rem] leading-none tracking-[-0.04em] text-[#39FF14]">{stat.value}</p>
              <p className={`mt-2 ${kicker}`}>{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {showDevices && (
        <Block pageKey="devices" title="Devices" open={open}>
          {children}
        </Block>
      )}

      {showPeople && (
        <Block pageKey="people" title="People" open={open}>
          <PagedList
            items={members}
            resetKey={org.id}
            label="Filter people"
            empty="No people in this organization."
            textOf={(member) => `${member.name} ${member.email} ${member.role} ${member.status}`}
            render={(member) => (
              <li key={member.id} className="flex flex-wrap items-baseline justify-between gap-3 py-2.5">
                <span>
                  <span className="text-[#f4fff2]">{member.name}</span>
                  <span className="ml-3 text-lg text-[#7f8c82]">{member.email}</span>
                </span>
                <span className={kicker}>{member.role} · {member.status}</span>
              </li>
            )}
          />
        </Block>
      )}

      {showPeople && (
        <Block pageKey="grants" title="Grants" open={open}>
          <PagedList
            items={grants}
            resetKey={org.id}
            label="Filter grants"
            empty="No live grants."
            textOf={(grant) => `${personName[grant.user_id] || grant.user_id} ${grant.effect} ${deviceName[grant.device_id] || grant.device_id || 'organization'} ${(grant.permissions || []).join(' ')}`}
            render={(grant) => (
              <li key={grant.id} className="flex flex-wrap items-baseline justify-between gap-3 py-2.5">
                <span>
                  <span className="text-[#f4fff2]">{personName[grant.user_id] || grant.user_id}</span>
                  <span className="ml-3 text-lg text-[#7f8c82]">{deviceName[grant.device_id] || (grant.device_id ? grant.device_id : 'Entire organization')}</span>
                </span>
                <span className={grant.effect === 'deny' ? 'text-xs tracking-[0.12em] text-[#ff8b96] uppercase' : 'text-xs tracking-[0.12em] text-[#39FF14] uppercase'}>
                  {grant.effect}
                  <span className="mt-1 block font-normal tracking-normal text-[#7f8c82] normal-case">{(grant.permissions || []).join(', ')}</span>
                </span>
              </li>
            )}
          />
        </Block>
      )}

      {showSessions && (
        <Block pageKey="sessions" title="Sessions" open={open}>
          <PagedList
            items={sessions}
            resetKey={org.id}
            label="Filter sessions"
            empty="No sessions."
            textOf={(row) => `${deviceName[row.device_id] || row.device_id} ${row.mode} ${row.state} ${row.end_reason || ''}`}
            render={(row) => (
              <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-3 py-2.5">
                <span className="text-[#f4fff2]">{deviceName[row.device_id] || row.device_id}</span>
                <span className={kicker}>{row.mode} · {row.state}{row.end_reason ? ` · ${row.end_reason}` : ''}</span>
              </li>
            )}
          />
        </Block>
      )}

      {showAudit && (
        <Block pageKey="audit" title="Audit" open={open}>
          <PagedList
            items={events}
            resetKey={org.id}
            label="Filter audit"
            empty="No audit events."
            textOf={(event) => `${event.action} ${event.result} ${event.reason_code || ''} ${event.at}`}
            render={(event) => (
              <li key={event.id} className="flex flex-wrap items-baseline justify-between gap-3 py-2.5">
                <span>
                  <span className="text-[#f4fff2]">{event.action}</span>
                  <span className="ml-3 text-lg text-[#7f8c82]">{event.at}</span>
                </span>
                <span className={kicker}>{event.result}{event.reason_code ? ` · ${event.reason_code}` : ''}</span>
              </li>
            )}
          />
        </Block>
      )}

      {showAdmin && (
        <Block pageKey="admin" title="Admin" open={open}>
          <p className="w-full text-xl leading-8 text-[#7f8c82]">{org.name} · {org.theme}. Rename and delete stay on the admin page.</p>
        </Block>
      )}
    </div>
  );
}
