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

function tapePoints(permissions, events) {
  const entries = Object.entries(permissions ?? {});
  if (entries.length >= 2) {
    let value = 0;
    return entries.map(([key, item]) => {
      const deny = item.effect === 'deny';
      value += deny ? -1 : 1;
      return { label: key, value, deny };
    });
  }
  const audit = [...(events || [])]
    .filter((event) => event?.at)
    .sort((a, b) => String(a.at).localeCompare(String(b.at)));
  let value = 0;
  return audit.map((event) => {
    const deny = event.result === 'deny';
    value += deny ? -1 : 1;
    const stamp = String(event.at);
    const label = stamp.length >= 16 ? stamp.slice(5, 16).replace('T', ' ') : stamp;
    return { label, value, deny };
  });
}

function StockTape({ allows, denies, permissions, events }) {
  const points = tapePoints(permissions, events);
  const values = points.map((point) => point.value);
  const min = values.length ? Math.min(...values, 0) : 0;
  const max = values.length ? Math.max(...values, 1) : 1;
  const span = max - min || 1;
  const width = 1000;
  const plotRight = 940;
  const top = 16;
  const bottom = 268;
  const volTop = 292;
  const volBottom = 360;
  const xAt = (index) => (points.length <= 1 ? plotRight / 2 : (index / (points.length - 1)) * plotRight);
  const yAt = (value) => bottom - ((value - min) / span) * (bottom - top);
  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${xAt(index).toFixed(1)} ${yAt(point.value).toFixed(1)}`).join(' ');
  const area = points.length
    ? `${line} L ${xAt(points.length - 1).toFixed(1)} ${bottom} L ${xAt(0).toFixed(1)} ${bottom} Z`
    : '';
  const rising = points.length < 2 || points[points.length - 1].value >= points[0].value;
  const stroke = rising ? '#39FF14' : '#ff8b96';
  const net = allows - denies;
  const ticks = [max, min + span / 2, min];
  const marks = [...new Set(points.length <= 5
    ? points.map((_, index) => index)
    : [0, 0.25, 0.5, 0.75, 1].map((step) => Math.round((points.length - 1) * step)))];
  const last = points.length - 1;
  const slot = points.length <= 1 ? 14 : plotRight / points.length;
  const barW = Math.min(16, Math.max(2, slot * 0.62));
  const [hover, setHover] = useState(null);
  const focus = hover == null ? null : points[hover];

  function track(event) {
    if (!points.length) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * width;
    if (x < 0 || x > plotRight) {
      setHover(null);
      return;
    }
    let nearest = 0;
    let best = Infinity;
    for (let index = 0; index < points.length; index += 1) {
      const distance = Math.abs(xAt(index) - x);
      if (distance < best) {
        best = distance;
        nearest = index;
      }
    }
    setHover((current) => (current === nearest ? current : nearest));
  }

  return (
    <figure className="w-full">
      <figcaption className="mb-4 flex w-full items-end justify-between gap-8">
        <div>
          <p className={kicker}>Permission tape</p>
          <p className="mt-1 text-5xl tracking-[-0.04em] text-[#f4fff2]">
            {allows}
            <span className="ml-3 align-middle text-lg text-[#39FF14]">allow</span>
          </p>
        </div>
        <div className="text-right">
          <p className={net >= 0 ? 'text-3xl tracking-[-0.03em] text-[#39FF14]' : 'text-3xl tracking-[-0.03em] text-[#ff8b96]'}>
            {net >= 0 ? '+' : ''}{net}
          </p>
          <p className="text-lg text-[#ff8b96]">{denies} deny</p>
        </div>
      </figcaption>
      <div
        className="relative h-[32rem] w-full cursor-crosshair border border-[#1a2420]"
        data-testid="permission-tape"
        onPointerMove={track}
        onPointerLeave={() => setHover(null)}
      >
        <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${width} 400`} preserveAspectRatio="none" role="img" aria-label="Permission tape, allow minus deny">
          <defs>
            <linearGradient id="tape-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity="0.38" />
              <stop offset="100%" stopColor={stroke} stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0, 0.25, 0.5, 0.75, 1].map((step) => {
            const y = top + (bottom - top) * step;
            return <line key={step} x1="0" x2={plotRight} y1={y} y2={y} stroke="#1a2420" strokeWidth="1" vectorEffect="non-scaling-stroke" />;
          })}
          {marks.map((index) => (
            <line key={`v-${index}`} x1={xAt(index)} x2={xAt(index)} y1={top} y2={volBottom} stroke="#1a2420" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ))}
          {points.length > 0 && (
            <line x1="0" x2={plotRight} y1={yAt(points[last].value)} y2={yAt(points[last].value)} stroke={stroke} strokeWidth="1" strokeDasharray="4 6" vectorEffect="non-scaling-stroke" opacity="0.7" />
          )}
          {points.map((point, index) => {
            const barH = point.deny ? (volBottom - volTop) * 0.42 : (volBottom - volTop) * 0.86;
            return (
              <rect
                key={index}
                x={xAt(index) - barW / 2}
                y={volBottom - barH}
                width={barW}
                height={barH}
                fill={point.deny ? '#ff8b96' : '#39FF14'}
                opacity={hover == null || index === hover ? 0.9 : 0.28}
              />
            );
          })}
          {area && <path d={area} fill="url(#tape-fill)" />}
          {line && <path d={line} fill="none" stroke={stroke} strokeWidth="2.25" vectorEffect="non-scaling-stroke" />}
        </svg>
        {last >= 0 && (
          <span
            className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: `${(xAt(last) / width) * 100}%`,
              top: `${(yAt(points[last].value) / 400) * 100}%`,
              background: stroke,
              boxShadow: `0 0 12px ${stroke}`,
            }}
          />
        )}
        <div className="pointer-events-none absolute right-3 flex flex-col justify-between text-right text-xs text-[#7f8c82]" style={{ top: '4%', height: '63%' }}>
          {ticks.map((tick, index) => <span key={`${tick}-${index}`}>{Math.round(tick)}</span>)}
        </div>
        {marks.map((index, mark) => {
          const left = (xAt(index) / width) * 100;
          const align = mark === 0 ? 'translateX(0)' : mark === marks.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)';
          const active = index === hover;
          return (
            <span key={index} className={active ? 'pointer-events-none absolute bottom-3 max-w-[9rem] truncate text-xs text-[#f4fff2]' : 'pointer-events-none absolute bottom-3 max-w-[9rem] truncate text-xs text-[#7f8c82]'} style={{ left: `${left}%`, transform: align }}>
              {points[index]?.label}
            </span>
          );
        })}
        {focus && (
          <>
            <span className="pointer-events-none absolute top-0 bottom-8 w-px bg-[#e8f2e6]/35" style={{ left: `${(xAt(hover) / width) * 100}%` }} />
            <span className="pointer-events-none absolute right-[6%] left-0 h-px bg-[#e8f2e6]/35" style={{ top: `${(yAt(focus.value) / 400) * 100}%` }} />
            <span
              className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#050505]"
              style={{
                left: `${(xAt(hover) / width) * 100}%`,
                top: `${(yAt(focus.value) / 400) * 100}%`,
                background: focus.deny ? '#ff8b96' : '#39FF14',
              }}
            />
            <div
              className="pointer-events-none absolute z-10 border border-[#1a2420] bg-[#0A0D0B] px-3 py-2"
              data-testid="tape-tip"
              style={{
                left: `${(xAt(hover) / width) * 100}%`,
                top: `${(yAt(focus.value) / 400) * 100}%`,
                transform: (xAt(hover) / width) > 0.55 ? 'translate(calc(-100% - 14px), -120%)' : 'translate(14px, -120%)',
              }}
            >
              <p className="max-w-[16rem] truncate text-sm text-[#f4fff2]">{focus.label}</p>
              <p className={focus.deny ? 'text-sm text-[#ff8b96]' : 'text-sm text-[#39FF14]'}>
                {focus.deny ? 'deny' : 'allow'} · {focus.value >= 0 ? '+' : ''}{focus.value}
              </p>
            </div>
          </>
        )}
      </div>
    </figure>
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
        </div>
      </div>

      <div className="mt-8 w-full">
        <StockTape allows={allows} denies={denies} permissions={effective?.permissions} events={mineEvents} />
      </div>

      <div className="mt-8 w-full">
          {tab === 'Profile' && (
            <div className="w-full space-y-4 text-justify text-base leading-7 text-[#7f8c82]">
              <p>This membership is {member.status}. The role {member.role}{rank ? ` has rank ${rank.rank}` : ''} and is read from the database, not from a table in the page.</p>
              <p>A deny beats every allow. Changing this role bumps the permission version, so the next token is fresh. A session already running keeps the authority it started with.</p>
              <p>The last owner cannot leave, be removed, be suspended, or be demoted. Anyone else needs a strictly higher rank to change this membership.</p>
              <p>The tape is a running allow-minus-deny line for this person. Green rises on allow. Rose falls on deny, including an implicit deny where no grant and no role baseline apply. Bars under the line are the same steps.</p>
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
                <p className="mt-2 w-full text-justify text-base leading-7 text-[#7f8c82]">A grant on this person overrides the role. A deny still wins over every allow.</p>
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
                <p className="mt-2 w-full text-justify text-base leading-7 text-[#7f8c82]">Each session is a record of view, control, terminal, or file transfer. None of them open the other computer.</p>
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
                <p className="mt-2 w-full text-justify text-base leading-7 text-[#7f8c82]">These are the newest events in which this person is the actor.</p>
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
    </section>
  );
}
