import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { Action, held } from './action.jsx';
import { field, kicker, pageTitle } from './ui.js';

const TABS = ['Profile', 'Permissions', 'Record'];

function Pill({ on, children, onClick }) {
  return (
    <button type="button" className={on ? 'rounded-full bg-[#39FF14] px-3 py-1 text-xs text-[#050505]' : 'rounded-full border border-[#1a2420] px-3 py-1 text-xs text-[#7f8c82]'} onClick={onClick}>
      {children}
    </button>
  );
}

function Split({ label, value, max, tone }) {
  const width = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-[#f4fff2]">{label}</span>
        <span className={tone}>{value}</span>
      </div>
      <div className="mt-1 h-1.5 bg-[#1a2420]">
        <div className={`h-1.5 ${tone === 'text-[#ff8b96]' ? 'bg-[#ff8b96]' : 'bg-[#39FF14]'}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export function Person({ orgId, member, roles, perms, selfId, grants, sessions, events, run, reload, onBack }) {
  const [tab, setTab] = useState('Profile');
  const [filter, setFilter] = useState('all');
  const [effective, setEffective] = useState(null);

  useEffect(() => {
    if (!member) return undefined;
    let cancel = false;
    api('GET', `/v1/orgs/${orgId}/users/${member.id}/effective`)
      .then((body) => { if (!cancel) setEffective(body); })
      .catch(() => { if (!cancel) setEffective(null); });
    return () => { cancel = true; };
  }, [orgId, member]);

  if (!member) {
    return (
      <section>
        <button type="button" className="text-sm text-[#39FF14]" onClick={onBack}>Back to people</button>
        <p className="mt-6 text-base text-[#7f8c82]">This person is not in the current organization.</p>
      </section>
    );
  }

  const rank = roles.find((item) => item.key === member.role);
  const entries = Object.entries(effective?.permissions ?? {}).filter(([, item]) => filter === 'all' || item.effect === filter);
  const allows = Object.values(effective?.permissions ?? {}).filter((item) => item.effect === 'allow').length;
  const denies = Object.values(effective?.permissions ?? {}).filter((item) => item.effect === 'deny').length;
  const mineGrants = grants.filter((grant) => grant.user_id === member.id);
  const mineSessions = sessions.filter((row) => row.user_id === member.id);
  const mineEvents = events.filter((event) => event.actor_id === member.id);

  return (
    <section>
      <button type="button" className="text-sm text-[#39FF14]" onClick={onBack}>Back to people</button>
      <h2 className={`mt-4 ${pageTitle}`}>{member.name}</h2>
      <p className="mt-2 text-base text-[#7f8c82]">{member.email}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <span className="rounded-full bg-[#39FF14] px-3 py-1 text-xs text-[#050505]">{effective?.role ?? member.role}</span>
        <span className="rounded-full border border-[#1a2420] px-3 py-1 text-xs text-[#7f8c82]">{member.status}</span>
        {rank && <span className="rounded-full border border-[#1a2420] px-3 py-1 text-xs text-[#7f8c82]">rank {rank.rank}</span>}
        <span className="rounded-full border border-[#1a2420] px-3 py-1 text-xs text-[#39FF14]">{allows} allow</span>
        <span className="rounded-full border border-[#1a2420] px-3 py-1 text-xs text-[#ff8b96]">{denies} deny</span>
      </div>
      <div className="mt-6 flex gap-6 border-b border-[#1a2420]">
        {TABS.map((item) => (
          <button key={item} type="button" className={tab === item ? 'border-b border-[#39FF14] pb-2 text-sm text-[#39FF14]' : 'pb-2 text-sm text-[#7f8c82]'} onClick={() => setTab(item)}>{item}</button>
        ))}
      </div>

      {tab === 'Profile' && (
        <div className="mt-6 max-w-3xl space-y-3 text-base leading-7 text-[#7f8c82]">
          <p>This membership is {member.status}. The role {member.role}{rank ? ` has rank ${rank.rank}` : ''} and is read from the database, not from a table in the page.</p>
          <p>A deny beats every allow. Changing this role bumps the permission version, so the next token is fresh. A session already running keeps the authority it started with.</p>
          <p>The last owner cannot leave, be removed, be suspended, or be demoted. Anyone else needs a strictly higher rank to change this membership.</p>
          <div className="mt-4 grid max-w-md gap-3">
            <Split label="Allows" value={allows} max={allows + denies} tone="text-[#39FF14]" />
            <Split label="Denies" value={denies} max={allows + denies} tone="text-[#ff8b96]" />
          </div>
          {member.id !== selfId && (
            <div className="flex flex-wrap items-center gap-3 pt-2">
              {held(perms, 'user:role:update') && (
                <select
                  className={`${field} max-w-xs`}
                  data-testid="role-select"
                  value={member.role}
                  onChange={(event) => run(async () => {
                    await api('PATCH', `/v1/orgs/${orgId}/members/${member.id}`, { role: event.target.value });
                    reload();
                  })}
                >
                  {roles.map((item) => <option key={item.key} value={item.key}>{item.key}</option>)}
                </select>
              )}
              <Action perms={perms} permission="user:remove" testid="suspend-user" onClick={() => run(async () => {
                const path = `/v1/orgs/${orgId}/members/${member.id}/suspend`;
                if (member.status === 'suspended') await api('DELETE', path);
                else await api('POST', path, {});
                reload();
              })}>{member.status === 'suspended' ? 'Reinstate' : 'Suspend'}</Action>
              <Action perms={perms} permission="user:remove" testid="remove-user" onClick={() => run(async () => {
                if (!window.confirm(`Remove ${member.email}?`)) return;
                await api('DELETE', `/v1/orgs/${orgId}/members/${member.id}`);
                onBack();
              })}>Remove</Action>
            </div>
          )}
        </div>
      )}

      {tab === 'Permissions' && (
        <div className="mt-6">
          <div className="flex gap-2">
            {['all', 'allow', 'deny'].map((item) => (
              <Pill key={item} on={filter === item} onClick={() => setFilter(item)}>{item}</Pill>
            ))}
          </div>
          <ul className="mt-4 w-full">
            {entries.map(([key, item]) => (
              <li key={key} className="flex w-full items-baseline justify-between gap-8 border-b border-[#1a2420] py-2 text-sm">
                <span className={item.effect === 'allow' ? 'text-[#39FF14]' : 'text-[#ff8b96]'}>{key}</span>
                <span className="text-[#7f8c82]">{item.effect}{item.reason ? ` · ${item.reason}` : ''}{item.source ? ` · ${item.source}` : ''}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'Record' && (
        <div className="mt-6 grid gap-8 md:grid-cols-3">
          <div>
            <p className={kicker}>Grants</p>
            <p className="mt-2 text-3xl text-[#f4fff2]">{mineGrants.length}</p>
            <p className="mt-2 text-sm leading-6 text-[#7f8c82]">A grant on this person overrides the role. A deny still wins over every allow.</p>
            <ul className="mt-3 space-y-2 text-sm text-[#7f8c82]">
              {mineGrants.map((grant) => (
                <li key={grant.id} className={grant.effect === 'deny' ? 'text-[#ff8b96]' : 'text-[#39FF14]'}>{grant.effect} · {(grant.permissions || []).join(', ') || 'grant'}</li>
              ))}
              {mineGrants.length === 0 && <li>No live grants on this person.</li>}
            </ul>
          </div>
          <div>
            <p className={kicker}>Sessions</p>
            <p className="mt-2 text-3xl text-[#f4fff2]">{mineSessions.length}</p>
            <p className="mt-2 text-sm leading-6 text-[#7f8c82]">Each session is a record of view, control, terminal, or file transfer. None of them open the other computer.</p>
            <ul className="mt-3 space-y-2 text-sm text-[#7f8c82]">
              {mineSessions.slice(0, 6).map((row) => (
                <li key={row.id}>{row.mode} · {row.state}</li>
              ))}
              {mineSessions.length === 0 && <li>No sessions recorded for this person.</li>}
            </ul>
          </div>
          <div>
            <p className={kicker}>Audit</p>
            <p className="mt-2 text-3xl text-[#f4fff2]">{mineEvents.length}</p>
            <p className="mt-2 text-sm leading-6 text-[#7f8c82]">These are the newest events in which this person is the actor.</p>
            <ul className="mt-3 space-y-2 text-sm text-[#7f8c82]">
              {mineEvents.slice(0, 6).map((event) => (
                <li key={event.id}>{event.action} · {event.result}</li>
              ))}
              {mineEvents.length === 0 && <li>No audit rows for this actor in the newest 200.</li>}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
