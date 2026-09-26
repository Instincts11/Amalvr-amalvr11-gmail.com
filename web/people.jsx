import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { Action, held } from './action.jsx';
import { AreaSeries, Columns, Donut, HBars, SplitBar, Stacked } from './charts.jsx';
import { btnPrimary, field, kicker, pageTitle } from './ui.js';
import { Pager, usePaged } from './pager.jsx';

function tally(items, key) {
  const map = new Map();
  for (const item of items) {
    const label = item?.[key] || 'none';
    map.set(label, (map.get(label) || 0) + 1);
  }
  return [...map.entries()].map(([label, value]) => ({ label, value }));
}

export function People({ orgId, members, roles, perms, selfId, grants = [], sessions = [], events = [], inviteOpen, setInviteOpen, run, onOpen, reload }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState(roles[0]?.key ?? 'viewer');
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('all');
  const [rolePill, setRolePill] = useState('');
  const [selectedId, setSelectedId] = useState(members[0]?.id ?? '');
  const [invites, setInvites] = useState([]);
  useEffect(() => {
    if (!members.some((member) => member.id === selectedId)) setSelectedId(members[0]?.id ?? '');
  }, [members, selectedId]);
  useEffect(() => {
    if (!held(perms, 'user:invite')) return undefined;
    let cancel = false;
    api('GET', `/v1/orgs/${orgId}/invites`)
      .then((body) => { if (!cancel) setInvites(body.invites ?? []); })
      .catch(() => { if (!cancel) setInvites([]); });
    return () => { cancel = true; };
  }, [orgId, perms, inviteOpen]);
  const needle = query.trim().toLowerCase();
  const filtered = members.filter((member) => {
    if (tab !== 'all' && member.status !== tab) return false;
    if (rolePill && member.role !== rolePill) return false;
    if (!needle) return true;
    return `${member.name} ${member.email} ${member.role} ${member.status}`.toLowerCase().includes(needle);
  });
  const paged = usePaged(filtered, 12, `${orgId}:${needle}:${tab}:${rolePill}`);
  const showSessions = held(perms, 'session:view');
  const showAudit = held(perms, 'audit:read');
  const active = members.filter((member) => member.status === 'active').length;
  const suspended = members.filter((member) => member.status === 'suspended').length;
  const sessionRows = members
    .map((member) => ({ label: member.name, value: sessions.filter((row) => row.user_id === member.id).length }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value);
  const modeRows = tally(sessions, 'mode').map((row) => ({ ...row, tone: row.label === 'terminal' ? '#ff8b96' : '#39FF14' }));
  const grantRows = members
    .map((member) => {
      const mine = grants.filter((grant) => grant.user_id === member.id);
      return {
        label: member.name,
        allow: mine.filter((grant) => grant.effect === 'allow').length,
        deny: mine.filter((grant) => grant.effect === 'deny').length,
      };
    })
    .filter((row) => row.allow + row.deny > 0);
  const actionRows = tally(events, 'action').sort((a, b) => b.value - a.value);
  let running = 0;
  const auditPoints = [...events]
    .filter((event) => event.at)
    .sort((a, b) => String(a.at).localeCompare(String(b.at)))
    .map((event) => {
      const deny = event.result === 'deny';
      running += deny ? -1 : 1;
      return { label: `${event.action} · ${event.result}`, value: running, deny };
    });
  const counts = new Map(members.map((member) => [member.id, {
    sessions: sessions.filter((row) => row.user_id === member.id).length,
    grants: grants.filter((grant) => grant.user_id === member.id).length,
    audit: events.filter((event) => event.actor_id === member.id).length,
  }]));
  const grid = showSessions && showAudit
    ? 'md:grid-cols-[minmax(0,1.6fr)_8rem_7rem_5.5rem_5.5rem_5.5rem_auto]'
    : showSessions || showAudit
      ? 'md:grid-cols-[minmax(0,1.6fr)_8rem_7rem_5.5rem_5.5rem_auto]'
      : 'md:grid-cols-[minmax(0,1.6fr)_9rem_7rem_auto]';
  return (
    <section>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className={pageTitle}>People</h2>
          <div className="mt-3 w-full space-y-3 text-base leading-7 text-[#7f8c82]">
            <p>{members.length} people in this organization.</p>
            <p>Roles and ranks are read from the database. The page does not keep its own permission table.</p>
            <p>The last owner cannot leave, be removed, be suspended, or be demoted. Anyone else needs a strictly higher rank to change a membership.</p>
            <p>An invite address must already be lowercase. The token is shown once and is stored only as a hash.</p>
            <p>Open a person to see the permission set the server resolved, including every deny.</p>
            <p>{filtered.length} results in this view. Each row counts that person's sessions, grants, and audit events from the lists the server returned.</p>
          </div>
        </div>
        <Action className={btnPrimary} perms={perms} permission="user:invite" testid="invite-user" onClick={() => setInviteOpen((open) => !open)}>Invite</Action>
      </div>
      <div className="mb-8 grid grid-cols-2 gap-4 border border-[#1a2420] px-5 py-4 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ['People', members.length],
          ['Active', active],
          ['Suspended', suspended],
          ['Grants', grants.length],
          showSessions && ['Sessions', sessions.length],
          showAudit && ['Audit', events.length],
        ].filter(Boolean).map(([label, value]) => (
          <div key={label}>
            <p className="text-[2rem] leading-none tracking-[-0.04em] text-[#39FF14]">{value}</p>
            <p className={`mt-2 ${kicker}`}>{label}</p>
          </div>
        ))}
      </div>
      <div className="mb-8 grid gap-4 lg:grid-cols-2">
        <Donut title="People by role" hint="Every membership in this organization, grouped by the role stored on it." rows={tally(members, 'role')} />
        <SplitBar
          title="Membership status"
          hint="Active memberships can act. Suspended ones stay in the directory and the server still refuses them."
          parts={[
            { label: 'active', value: active, color: '#39FF14' },
            { label: 'suspended', value: suspended, color: '#ff8b96' },
          ]}
        />
        <Stacked title="Grants by person" hint="Live grants on each person. Green is allow. Rose is deny." rows={grantRows} />
        {showSessions && <Columns title="Sessions by person" hint="Session records for each person, including ones that have already ended." rows={sessionRows} />}
        {showSessions && <Columns title="Sessions by mode" hint="View, control, and terminal are separate records." rows={modeRows} />}
        {showAudit && <HBars title="Audit by action" hint="How often each action appears in the newest 200 events." rows={actionRows} />}
        {showAudit && (
          <div className="lg:col-span-2">
            <AreaSeries title="Audit tape" hint="A running allow-minus-deny line across the newest events. Move across it to read each step." points={auditPoints} />
          </div>
        )}
      </div>
      <div>
          <div className="mb-4 inline-flex overflow-hidden rounded-full border border-[#1a2420]">
            {['all', 'active', 'suspended'].map((item) => (
              <button key={item} type="button" className={tab === item ? 'bg-[#39FF14] px-4 py-1.5 text-sm capitalize text-[#050505]' : 'px-4 py-1.5 text-sm capitalize text-[#7f8c82]'} onClick={() => setTab(item)}>{item}</button>
            ))}
          </div>
          <div className="mb-4 flex flex-wrap gap-2">
            <button type="button" className={rolePill === '' ? 'rounded-full bg-[#39FF14] px-3 py-1 text-xs text-[#050505]' : 'rounded-full border border-[#1a2420] px-3 py-1 text-xs text-[#7f8c82]'} onClick={() => setRolePill('')}>All roles</button>
            {roles.map((item) => (
              <button key={item.key} type="button" className={rolePill === item.key ? 'rounded-full bg-[#39FF14] px-3 py-1 text-xs text-[#050505]' : 'rounded-full border border-[#1a2420] px-3 py-1 text-xs text-[#7f8c82]'} onClick={() => setRolePill(item.key)}>{item.key}</button>
            ))}
          </div>
          <input
            className="mb-3 w-full border-0 bg-transparent py-1 text-sm outline-none placeholder:text-[#7f8c82]"
            aria-label="Filter people"
            placeholder="Filter people"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {inviteOpen && (
            <form className="mb-6 border-b border-[#1a2420] pb-6" onSubmit={(event) => {
              event.preventDefault();
              run(async () => {
                const created = await api('POST', `/v1/orgs/${orgId}/invites`, { email, role });
                setInviteOpen(false);
                window.prompt('Invite token — copy it now. It will not be shown again.', created.inviteToken);
              });
            }}>
              <label className="mb-1 block text-[13px]" htmlFor="people-invite-email">Email</label>
              <input id="people-invite-email" className={field} aria-label="Invite email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" />
              <label className="mt-4 mb-1 block text-[13px]" htmlFor="people-invite-role">Role</label>
              <select id="people-invite-role" className={field} aria-label="Invite role" value={role} onChange={(e) => setRole(e.target.value)}>
                {roles.map((item) => <option key={item.key} value={item.key}>{item.key}</option>)}
              </select>
              <button className={`${btnPrimary} mt-3`} type="submit">Send invite</button>
            </form>
          )}
          <div className={`hidden gap-3 border-b border-[#1a2420] py-2 text-[11px] tracking-[0.16em] text-[#7f8c82] uppercase md:grid ${grid}`}>
            <span>Person</span>
            <span>Role</span>
            <span>Status</span>
            {showSessions && <span>Sessions</span>}
            <span>Grants</span>
            {showAudit && <span>Audit</span>}
            <span />
          </div>
          {paged.slice.map((member) => {
            const on = member.id === selectedId;
            return (
              <article
                key={member.id}
                data-testid="user-row"
                data-user-id={member.id}
                className={on
                  ? `grid cursor-pointer items-center gap-3 border-b border-[#1a2420] bg-[#39FF14]/[0.04] py-3 ${grid}`
                  : `grid cursor-pointer items-center gap-3 border-b border-[#1a2420] py-3 hover:bg-[#39FF14]/[0.04] ${grid}`}
                onClick={() => { setSelectedId(member.id); onOpen(member.id); }}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[#39FF14] text-sm text-[#39FF14]" aria-hidden="true">{(member.name || '?').slice(0, 1)}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-base text-[#f4fff2]">{member.name}</span>
                    <span className="block truncate text-xs text-[#7f8c82]">{member.email}</span>
                  </span>
                </div>
                {held(perms, 'user:role:update') ? (
                  <select
                    className={field}
                    data-testid="role-select"
                    value={member.role}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => run(async () => {
                      await api('PATCH', `/v1/orgs/${orgId}/members/${member.id}`, { role: event.target.value });
                      reload();
                    })}
                  >
                    {roles.map((item) => <option key={item.key} value={item.key}>{item.key}</option>)}
                  </select>
                ) : <span className={kicker}>{member.role}</span>}
                <span className={member.status === 'suspended' ? 'w-fit rounded-full border border-[#ff8b96] px-2 py-0.5 text-xs text-[#ff8b96]' : 'w-fit rounded-full border border-[#39FF14] px-2 py-0.5 text-xs text-[#39FF14]'}>{member.status}</span>
                {showSessions && <span className="text-sm text-[#f4fff2]">{counts.get(member.id)?.sessions ?? 0}</span>}
                <span className="text-sm text-[#f4fff2]">{counts.get(member.id)?.grants ?? 0}</span>
                {showAudit && <span className="text-sm text-[#f4fff2]">{counts.get(member.id)?.audit ?? 0}</span>}
                <div className="flex flex-wrap gap-1.5" onClick={(event) => event.stopPropagation()}>
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
                </div>
              </article>
            );
          })}
          {members.length > 0 && filtered.length === 0 && <p className="py-4 text-sm text-[#7f8c82]">Nothing matches that filter.</p>}
          <Pager {...paged} />
          {held(perms, 'user:invite') && invites.some((invite) => !invite.accepted_at && !invite.revoked_at) && (
            <div className="mt-8 border-t border-[#1a2420] pt-4">
              <p className={kicker}>Open invites</p>
              <ul className="mt-3 space-y-2 text-sm">
                {invites.filter((invite) => !invite.accepted_at && !invite.revoked_at).map((invite) => (
                  <li key={invite.id} className="flex items-center justify-between gap-3">
                    <span>{invite.email} · {invite.role}</span>
                    <button type="button" className="text-xs text-[#ff8b96]" onClick={() => run(async () => {
                      await api('DELETE', `/v1/orgs/${orgId}/invites/${invite.id}`);
                      setInvites((rows) => rows.map((row) => row.id === invite.id ? { ...row, revoked_at: new Date().toISOString() } : row));
                    })}>Revoke</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
      </div>
    </section>
  );
}
