import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { Action, held } from './action.jsx';
import { btnPrimary, field, kicker, pageTitle } from './ui.js';
import { Pager, usePaged } from './pager.jsx';

export function People({ orgId, members, roles, perms, selfId, inviteOpen, setInviteOpen, run, reload }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState(roles[0]?.key ?? 'viewer');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(members[0]?.id ?? '');
  const [effective, setEffective] = useState(null);
  const [invites, setInvites] = useState([]);
  useEffect(() => {
    if (!members.some((member) => member.id === selectedId)) setSelectedId(members[0]?.id ?? '');
  }, [members, selectedId]);
  const selected = members.find((member) => member.id === selectedId) ?? members[0];
  useEffect(() => {
    if (!selected) return undefined;
    let cancel = false;
    api('GET', `/v1/orgs/${orgId}/users/${selected.id}/effective`)
      .then((body) => { if (!cancel) setEffective(body); })
      .catch(() => { if (!cancel) setEffective(null); });
    return () => { cancel = true; };
  }, [orgId, selected]);
  useEffect(() => {
    if (!held(perms, 'user:invite')) return undefined;
    let cancel = false;
    api('GET', `/v1/orgs/${orgId}/invites`)
      .then((body) => { if (!cancel) setInvites(body.invites ?? []); })
      .catch(() => { if (!cancel) setInvites([]); });
    return () => { cancel = true; };
  }, [orgId, perms, inviteOpen]);
  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? members.filter((member) => `${member.name} ${member.email} ${member.role} ${member.status}`.toLowerCase().includes(needle))
    : members;
  const paged = usePaged(filtered, 8, `${orgId}:${needle}`);
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
            <p>The panel on the right is the permission set the server resolved for the selected person, including every deny.</p>
          </div>
        </div>
        <Action className={btnPrimary} perms={perms} permission="user:invite" testid="invite-user" onClick={() => setInviteOpen((open) => !open)}>Invite</Action>
      </div>
      <div className="grid items-start gap-x-6 gap-y-4 lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)]">
        <div>
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
          {paged.slice.map((member) => {
            const on = member.id === selected?.id;
            return (
              <article
                key={member.id}
                data-testid="user-row"
                data-user-id={member.id}
                className={on
                  ? 'cursor-pointer border-t border-[#1a2420] border-l-2 border-l-[#39FF14] py-2.5 pr-2 pl-2 transition-colors duration-200'
                  : 'cursor-pointer border-t border-[#1a2420] py-2.5 pr-2 pl-2 transition-colors duration-200 hover:bg-[#39FF14]/[0.04]'}
                onClick={() => setSelectedId(member.id)}
              >
                <div className="mb-1.5 flex gap-2">
                  <span className="text-xl leading-none text-[#39FF14]" aria-hidden="true">{(member.name || '?').slice(0, 1)}</span>
                  <span>
                    <span className="block text-lg">{member.name}</span>
                    <span className="block text-xs text-[#7f8c82]">{member.email}</span>
                    <span className="block text-xs text-[#7f8c82]">{member.status}</span>
                  </span>
                </div>
                {held(perms, 'user:role:update') ? (
                  <select
                    className={`${field} mb-1.5`}
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
                ) : <span className={`mb-3 inline-flex ${kicker}`}>{member.role}</span>}
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
        </div>
        <aside className="lg:sticky lg:top-8">
          {selected && (
            <>
              <p className={kicker}>Selected</p>
              <h3 className="mt-3 text-4xl leading-[0.95] tracking-[-0.045em] text-[#f4fff2]">{selected.name}</h3>
              <p className="mt-3 text-base text-[#7f8c82]">{selected.email}</p>
              <p className="mt-6 flex gap-6">
                <span className={kicker}>{effective?.role ?? selected.role}</span>
                <span className={kicker}>{selected.status}</span>
              </p>
              {effective && (
                <div className="mt-8 w-full border-t border-[#1a2420] pt-4">
                  <p className={kicker}>Resolved by the server</p>
                  <ul className="mt-3 w-full">
                    {Object.entries(effective.permissions ?? {}).map(([key, item]) => (
                      <li key={key} className="flex w-full items-baseline justify-between gap-8 border-b border-[#1a2420] py-2 text-sm">
                        <span className={item.effect === 'allow' ? 'text-[#39FF14]' : 'text-[#ff8b96]'}>{key}</span>
                        <span className="text-right text-[#7f8c82]">{item.effect}{item.reason ? ` · ${item.reason}` : ''}{item.source ? ` · ${item.source}` : ''}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
          {held(perms, 'user:invite') && invites.some((invite) => !invite.accepted_at && !invite.revoked_at) && (
            <div className="mt-10 border-t border-[#1a2420] pt-4">
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
        </aside>
      </div>
    </section>
  );
}
