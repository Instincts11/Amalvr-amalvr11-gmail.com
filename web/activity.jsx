import React from 'react';
import { api } from './api.js';
import { Action, held } from './action.jsx';

function expiryLabel(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.toISOString().replace('T', ' ').slice(0, 16)} UTC`;
}

export function Sessions({ orgId, sessions, perms, selfId, setSessions, setView, run }) {
  return (
    <section>
      <div className="toolbar">
        <h2>Sessions</h2>
        <Action perms={perms} permission="session:start" testid="new-session" onClick={() => setView('devices')}>Start from a device</Action>
      </div>
      <p className="muted">A live session keeps the authority it started with. Hiding a button does not end it.</p>
      <table>
        <thead><tr><th>Device</th><th>Mode</th><th>State</th><th>Expires</th><th></th></tr></thead>
        <tbody>
          {sessions.map((row) => (
            <tr key={row.id} data-testid="session-row">
              <td className="mono">{row.device_id}</td>
              <td>{row.mode}</td>
              <td>{row.state}{row.end_reason ? ` · ${row.end_reason}` : ''}</td>
              <td className="mono">{expiryLabel(row.expires_at)}</td>
              <td>
                {row.state === 'active' && (row.user_id === selfId || held(perms, 'session:terminate')) && (
                  <button
                    type="button"
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
    </section>
  );
}

export function Audit({ events }) {
  return (
    <section>
      <h2>Audit</h2>
      <table>
        <thead><tr><th>When</th><th>Action</th><th>Result</th><th>Reason</th></tr></thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id} data-testid="audit-row">
              <td className="mono">{event.at}</td>
              <td>{event.action}</td>
              <td>{event.result}</td>
              <td>{event.reason_code ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
