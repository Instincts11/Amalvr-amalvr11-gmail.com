import React, { useState } from 'react';
import { api } from './api.js';
import { Action } from './action.jsx';

export function Grants({ orgId, grants, perms, catalogue, open, setOpen, run, onChanged }) {
  const [userId, setUserId] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [effect, setEffect] = useState('allow');
  const [picked, setPicked] = useState({});
  const [users, setUsers] = useState([]);
  const [devices, setDevices] = useState([]);

  async function openForm() {
    const [memberBody, deviceBody] = await Promise.all([
      api('GET', `/v1/orgs/${orgId}/members`),
      api('GET', `/v1/orgs/${orgId}/devices`),
    ]);
    setUsers(memberBody.members);
    setDevices(deviceBody.devices);
    setUserId(memberBody.members[0]?.id ?? '');
    setDeviceId(deviceBody.devices[0]?.id ?? '');
    setPicked({});
    setOpen(true);
  }

  return (
    <section>
      <div className="toolbar">
        <h2>Grants</h2>
        <Action perms={perms} permission="grant:create" testid="new-grant" onClick={() => run(openForm)}>New grant</Action>
      </div>
      {open && (
        <form className="panel-card" onSubmit={(event) => {
          event.preventDefault();
          const permissions = Object.entries(picked).filter(([, on]) => on).map(([key]) => key);
          run(async () => {
            await api('POST', `/v1/orgs/${orgId}/grants`, { userId, deviceId: deviceId || null, effect, permissions });
            await onChanged();
          });
        }}>
          <label htmlFor="grant-user">Person</label>
          <select id="grant-user" data-testid="grant-user" value={userId} onChange={(e) => setUserId(e.target.value)}>
            {users.map((user) => <option key={user.id} value={user.id}>{user.email}</option>)}
          </select>
          <label htmlFor="grant-device">Device</label>
          <select id="grant-device" data-testid="grant-device" value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
            <option value="">Entire organization</option>
            {devices.map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}
          </select>
          <label htmlFor="grant-effect">Effect</label>
          <select id="grant-effect" data-testid="grant-effect" value={effect} onChange={(e) => setEffect(e.target.value)}>
            <option value="allow">allow</option>
            <option value="deny">deny</option>
          </select>
          <div className="checks">
            {catalogue.map((key) => (
              <label key={key}>
                <input type="checkbox" data-permission-key={key} checked={!!picked[key]} onChange={(e) => setPicked((prev) => ({ ...prev, [key]: e.target.checked }))} />
                {key}
              </label>
            ))}
          </div>
          <button data-testid="grant-submit" type="submit">Create grant</button>
        </form>
      )}
      <table>
        <thead><tr><th>Person</th><th>Effect</th><th>Scope</th><th>Permissions</th><th></th></tr></thead>
        <tbody>
          {grants.map((grant) => (
            <tr key={grant.id} data-testid="grant-row" data-effect={grant.effect}>
              <td className="mono">{grant.user_id}</td>
              <td>{grant.effect}</td>
              <td className="mono">{grant.device_id ?? 'org'}</td>
              <td className="mono">{grant.permissions.join(', ')}</td>
              <td>
                <Action perms={perms} permission="grant:revoke" testid="revoke-grant" onClick={() => run(async () => {
                  await api('DELETE', `/v1/orgs/${orgId}/grants/${grant.id}`);
                  await onChanged();
                })}>Revoke</Action>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
