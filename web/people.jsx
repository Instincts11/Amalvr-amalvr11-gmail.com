import React, { useState } from 'react';
import { api } from './api.js';
import { Action, held } from './action.jsx';

export function People({ orgId, members, roles, perms, selfId, inviteOpen, setInviteOpen, run, reload }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState(roles[0]?.key ?? 'viewer');
  return (
    <section>
      <div className="toolbar">
        <h2>People</h2>
        <Action perms={perms} permission="user:invite" testid="invite-user" onClick={() => setInviteOpen((open) => !open)}>Invite</Action>
      </div>
      {inviteOpen && (
        <form className="panel-card inline" onSubmit={(event) => {
          event.preventDefault();
          run(async () => {
            const created = await api('POST', `/v1/orgs/${orgId}/invites`, { email, role });
            setInviteOpen(false);
            window.prompt('Invite token — copy it now. It will not be shown again.', created.inviteToken);
          });
        }}>
          <input aria-label="Invite email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" />
          <select aria-label="Invite role" value={role} onChange={(e) => setRole(e.target.value)}>
            {roles.map((item) => <option key={item.key} value={item.key}>{item.key}</option>)}
          </select>
          <button type="submit">Send invite</button>
        </form>
      )}
      <table>
        <thead><tr><th>Person</th><th>Role</th><th></th></tr></thead>
        <tbody>
          {members.map((member) => (
            <tr key={member.id} data-testid="user-row" data-user-id={member.id}>
              <td>{member.name}<div className="muted">{member.email}</div><div className="mono">{member.status}</div></td>
              <td>
                {held(perms, 'user:role:update') ? (
                  <select
                    data-testid="role-select"
                    value={member.role}
                    onChange={(event) => run(async () => {
                      await api('PATCH', `/v1/orgs/${orgId}/members/${member.id}`, { role: event.target.value });
                      reload();
                    })}
                  >
                    {roles.map((item) => <option key={item.key} value={item.key}>{item.key}</option>)}
                  </select>
                ) : member.role}
              </td>
              <td className="row-actions">
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
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
