import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { Action, held } from './action.jsx';
import { btnPrimary, field, kicker, pageTitle } from './ui.js';
import { Pager, usePaged } from './pager.jsx';

export function People({ orgId, members, roles, perms, selfId, inviteOpen, setInviteOpen, run, onOpen, reload }) {
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
  const paged = usePaged(filtered, 8, `${orgId}:${needle}:${tab}:${rolePill}`);
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
          </div>
        </div>
        <Action className={btnPrimary} perms={perms} permission="user:invite" testid="invite-user" onClick={() => setInviteOpen((open) => !open)}>Invite</Action>
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
          <div className="hidden grid-cols-[minmax(0,1.6fr)_9rem_7rem_auto] gap-3 border-b border-[#1a2420] py-2 text-[11px] tracking-[0.16em] text-[#7f8c82] uppercase md:grid">
            <span>Person</span>
            <span>Role</span>
            <span>Status</span>
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
                  ? 'grid cursor-pointer items-center gap-3 border-b border-[#1a2420] bg-[#39FF14]/[0.04] py-3 md:grid-cols-[minmax(0,1.6fr)_9rem_7rem_auto]'
                  : 'grid cursor-pointer items-center gap-3 border-b border-[#1a2420] py-3 hover:bg-[#39FF14]/[0.04] md:grid-cols-[minmax(0,1.6fr)_9rem_7rem_auto]'}
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
