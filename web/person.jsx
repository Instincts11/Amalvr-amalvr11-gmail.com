import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { Action, held } from './action.jsx';
import { field, kicker, pageTitle } from './ui.js';

const SECTIONS = [
  ['Profile', '01'],
  ['Permissions', '02'],
  ['Record', '03'],
];

function Pill({ on, children, onClick }) {
  return (
    <button type="button" className={on ? 'rounded-full bg-[#39FF14] px-3 py-1 text-xs text-[#050505]' : 'rounded-full border border-[#1a2420] px-3 py-1 text-xs text-[#7f8c82]'} onClick={onClick}>
      {children}
    </button>
  );
}

function Share({ allows, denies }) {
  const total = allows + denies;
  const allowPct = total > 0 ? (allows / total) * 100 : 0;
  const denyPct = total > 0 ? 100 - allowPct : 0;
  return (
    <div className="w-full">
      <div className="relative h-72 w-72">
        <div className="h-full w-full rounded-full" style={{ background: `conic-gradient(#39FF14 0% ${allowPct}%, #ff8b96 ${allowPct}% 100%)` }} />
        <div className="absolute inset-12 grid place-items-center rounded-full bg-[#050505] text-5xl text-[#f4fff2]">{total}</div>
      </div>
      <div className="mt-8 flex w-full items-baseline justify-between gap-8 text-lg">
        <span className="text-[#39FF14]">{allows} allow</span>
        <span className="text-[#ff8b96]">{denies} deny</span>
      </div>
      <div className="mt-3 flex h-40 w-full">
        <div className="h-full bg-[#39FF14]" style={{ width: `${allowPct}%` }} />
        <div className="h-full bg-[#ff8b96]" style={{ width: `${denyPct}%` }} />
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

  const groups = new Map();
  for (const [key, item] of entries) {
    const name = key.split(':')[0];
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push([key, item]);
  }

  return (
    <section>
      <button type="button" className="text-sm text-[#39FF14]" onClick={onBack}>Back to people</button>
      <div className="mt-6 grid items-start gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="border border-[#1a2420] p-4">
          <div className="flex items-center gap-3">
            <span className="grid h-14 w-14 place-items-center rounded-full border border-[#39FF14] text-2xl text-[#39FF14]" aria-hidden="true">{(member.name || '?').slice(0, 1)}</span>
            <div className="min-w-0">
              <p className="truncate text-lg text-[#f4fff2]">{member.name}</p>
              <p className="truncate text-xs text-[#7f8c82]">{member.email}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full bg-[#39FF14] px-3 py-1 text-xs text-[#050505]">{effective?.role ?? member.role}</span>
            <span className={member.status === 'suspended' ? 'rounded-full border border-[#ff8b96] px-3 py-1 text-xs text-[#ff8b96]' : 'rounded-full border border-[#1a2420] px-3 py-1 text-xs text-[#7f8c82]'}>{member.status}</span>
            {rank && <span className="rounded-full border border-[#1a2420] px-3 py-1 text-xs text-[#7f8c82]">rank {rank.rank}</span>}
          </div>
          <nav className="mt-6 grid gap-1">
            {SECTIONS.map(([item, index]) => (
              <button key={item} type="button" className={tab === item ? 'flex items-baseline gap-3 bg-[#39FF14] px-3 py-2 text-left text-sm text-[#050505]' : 'flex items-baseline gap-3 px-3 py-2 text-left text-sm text-[#7f8c82]'} onClick={() => setTab(item)}>
                <span className="text-[11px] tracking-[0.16em]">{index}</span>
                {item}
              </button>
            ))}
          </nav>
        </aside>

        <div className="min-w-0">
          <p className={kicker}>{tab}</p>
          <h2 className={`mt-1 ${pageTitle}`}>{member.name}</h2>

          <div className="mt-8 w-full">
            <Share allows={allows} denies={denies} />
          </div>

          {tab === 'Profile' && (
            <div className="mt-8 w-full space-y-3 text-base leading-7 text-[#7f8c82]">
              <p>This membership is {member.status}. The role {member.role}{rank ? ` has rank ${rank.rank}` : ''} and is read from the database, not from a table in the page.</p>
              <p>A deny beats every allow. Changing this role bumps the permission version, so the next token is fresh. A session already running keeps the authority it started with.</p>
              <p>The last owner cannot leave, be removed, be suspended, or be demoted. Anyone else needs a strictly higher rank to change this membership.</p>
              <p>The ring counts the permission set the server resolved for this person. Green is allow. Rose is deny, including an implicit deny where no grant and no role baseline apply.</p>
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
              <div className="mt-4 grid w-full gap-4">
                {[...groups.entries()].map(([name, rows]) => (
                  <section key={name} className="border border-[#1a2420] p-4">
                    <p className={kicker}>{name}</p>
                    <ul className="mt-3">
                      {rows.map(([key, item]) => (
                        <li key={key} className="border-b border-[#1a2420] py-2 text-sm last:border-0">
                          <div className="flex items-baseline justify-between gap-4">
                            <span className={item.effect === 'allow' ? 'text-[#39FF14]' : 'text-[#ff8b96]'}>{key}</span>
                            <span className="text-[#7f8c82]">{item.effect}</span>
                          </div>
                          {item.source && <p className="mt-0.5 text-xs text-[#7f8c82]">{item.source}</p>}
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            </div>
          )}

          {tab === 'Record' && (
            <ol className="mt-6 border-l border-[#1a2420] pl-6">
              <li className="relative pb-8">
                <span className="absolute top-1.5 -left-[29px] h-2.5 w-2.5 rounded-full bg-[#39FF14]" />
                <p className={kicker}>Grants · {mineGrants.length}</p>
                <p className="mt-2 w-full text-base leading-7 text-[#7f8c82]">A grant on this person overrides the role. A deny still wins over every allow.</p>
                <ul className="mt-3 space-y-2 text-sm">
                  {mineGrants.map((grant) => (
                    <li key={grant.id} className={grant.effect === 'deny' ? 'text-[#ff8b96]' : 'text-[#39FF14]'}>{grant.effect} · {(grant.permissions || []).join(', ') || 'grant'}</li>
                  ))}
                  {mineGrants.length === 0 && <li className="text-[#7f8c82]">No live grants on this person.</li>}
                </ul>
              </li>
              <li className="relative pb-8">
                <span className="absolute top-1.5 -left-[29px] h-2.5 w-2.5 rounded-full bg-[#39FF14]" />
                <p className={kicker}>Sessions · {mineSessions.length}</p>
                <p className="mt-2 w-full text-base leading-7 text-[#7f8c82]">Each session is a record of view, control, terminal, or file transfer. None of them open the other computer.</p>
                <ul className="mt-3 space-y-2 text-sm text-[#7f8c82]">
                  {mineSessions.slice(0, 6).map((row) => (
                    <li key={row.id}>{row.mode} · {row.state}</li>
                  ))}
                  {mineSessions.length === 0 && <li>No sessions recorded for this person.</li>}
                </ul>
              </li>
              <li className="relative">
                <span className="absolute top-1.5 -left-[29px] h-2.5 w-2.5 rounded-full bg-[#39FF14]" />
                <p className={kicker}>Audit · {mineEvents.length}</p>
                <p className="mt-2 w-full text-base leading-7 text-[#7f8c82]">These are the newest events in which this person is the actor.</p>
                <ul className="mt-3 space-y-2 text-sm text-[#7f8c82]">
                  {mineEvents.slice(0, 6).map((event) => (
                    <li key={event.id}>{event.action} · {event.result}</li>
                  ))}
                  {mineEvents.length === 0 && <li>No audit rows for this actor in the newest 200.</li>}
                </ul>
              </li>
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}
