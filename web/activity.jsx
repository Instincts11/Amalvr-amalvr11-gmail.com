import React, { useState } from 'react';
import { api } from './api.js';
import { Action, held } from './action.jsx';
import { btnGhost, btnPrimary } from './ui.js';
import { Pager, usePaged } from './pager.jsx';

function expiryLabel(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.toISOString().replace('T', ' ').slice(0, 16)} UTC`;
}

function Sheet({ children }) {
  return <div className="overflow-x-auto">{children}</div>;
}

const th = 'px-4 py-3 text-left text-[13px] font-medium tracking-[0.16em] text-[#7f8c82] uppercase';
const td = 'border-t border-[#1a2420] px-4 py-3 align-middle';

export function Sessions({ orgId, sessions, perms, selfId, setSessions, setView, run }) {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? sessions.filter((row) => `${row.device_id} ${row.mode} ${row.state} ${row.end_reason || ''}`.toLowerCase().includes(needle))
    : sessions;
  const paged = usePaged(filtered, 8, `${orgId}:${needle}`);
  return (
    <section>
      <header className="mb-5 flex items-start justify-between gap-6">
        <div className="min-w-0 flex-1">
          <h2 className="text-[2.6rem] leading-[0.95] tracking-[-0.045em] text-[#f4fff2]">Sessions</h2>
          <div className="mt-3 w-full space-y-3 text-base leading-7 text-[#7f8c82]">
            <p>A live session keeps the authority it started with. Hiding a button does not end it.</p>
            <p>A later change of role or grant leaves a running session in place. Suspension, removal, transfer, and decommission end it.</p>
            <p>Control and terminal cannot both be active on one device. View can sit beside either. Stop closes that session only.</p>
          </div>
        </div>
        <Action className={`${btnPrimary} shrink-0 self-start whitespace-nowrap px-5 text-center leading-none`} perms={perms} permission="session:start" testid="new-session" onClick={() => setView('devices')}>Start from a device</Action>
      </header>
      <input
        className="mb-3 w-full max-w-xs border-0 bg-transparent py-1 text-sm outline-none placeholder:text-[#7f8c82]"
        aria-label="Filter sessions"
        placeholder="Filter sessions"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <Sheet>
        <table className="w-full border-collapse text-lg">
          <thead>
            <tr>
              <th className={th}>Device</th>
              <th className={th}>Mode</th>
              <th className={th}>State</th>
              <th className={th}>Expires</th>
              <th className={th} />
            </tr>
          </thead>
          <tbody>
            {paged.slice.map((row) => (
              <tr key={row.id} data-testid="session-row">
                <td className={`${td} font-mono text-xs`}>{row.device_id}</td>
                <td className={td}><span className="text-xs tracking-[0.12em] text-[#7f8c82] uppercase">{row.mode}</span></td>
                <td className={td}>
                  <span className={row.state === 'active' ? 'text-xs text-[#39FF14]' : 'text-xs text-[#7f8c82]'}>
                    {row.state}{row.end_reason ? ` · ${row.end_reason}` : ''}
                  </span>
                </td>
                <td className={`${td} font-mono text-xs`}>{expiryLabel(row.expires_at)}</td>
                <td className={td}>
                  {row.state === 'active' && (row.user_id === selfId || held(perms, 'session:terminate')) && (
                    <button
                      type="button"
                      className={btnGhost}
                      data-testid="stop-session"
                      {...(held(perms, 'session:terminate') && row.user_id !== selfId ? { 'data-permission': 'session:terminate', 'data-state': 'unlocked' } : {})}
                      onClick={() => run(async () => {
                        await api('DELETE', `/v1/sessions/${row.id}`);
                        const body = await api('GET', `/v1/orgs/${orgId}/sessions`);
                        setSessions(body.sessions);
                      })}
                    >Stop</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Sheet>
      {sessions.length > 0 && filtered.length === 0 && <p className="py-4 text-sm text-[#7f8c82]">Nothing matches that filter.</p>}
      <Pager {...paged} />
    </section>
  );
}

export function Audit({ events }) {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? events.filter((event) => `${event.action} ${event.result} ${event.reason_code || ''} ${event.at}`.toLowerCase().includes(needle))
    : events;
  const paged = usePaged(filtered, 8, needle);
  return (
    <section>
      <header className="mb-5">
        <h2 className="text-[2.6rem] leading-[0.95] tracking-[-0.045em] text-[#f4fff2]">Audit</h2>
        <div className="mt-3 w-full space-y-3 text-base leading-7 text-[#7f8c82]">
          <p>What was allowed, what was refused, and who asked. Each row is the action, the result, and the reason code.</p>
          <p>The server accepts a limit from 1 to 200 and an offset of zero or more. This page loads the newest 200. A filter then pages that list.</p>
        </div>
      </header>
      <input
        className="mb-3 w-full max-w-xs border-0 bg-transparent py-1 text-sm outline-none placeholder:text-[#7f8c82]"
        aria-label="Filter audit"
        placeholder="Filter audit"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <Sheet>
        <table className="w-full border-collapse text-lg">
          <thead>
            <tr>
              <th className={th}>When</th>
              <th className={th}>Action</th>
              <th className={th}>Result</th>
              <th className={th}>Reason</th>
            </tr>
          </thead>
          <tbody>
            {paged.slice.map((event) => (
              <tr key={event.id} data-testid="audit-row">
                <td className={`${td} font-mono text-xs`}>{event.at}</td>
                <td className={td}>{event.action}</td>
                <td className={td}>{event.result}</td>
                <td className={td}>{event.reason_code ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Sheet>
      {events.length > 0 && filtered.length === 0 && <p className="py-4 text-sm text-[#7f8c82]">Nothing matches that filter.</p>}
      <Pager {...paged} />
    </section>
  );
}
