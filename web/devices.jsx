import React from 'react';
import { api } from './api.js';
import { Action } from './action.jsx';

export function Devices({ orgId, devices, devicesReady, perms, setDevices, setNotice, setView, run }) {
  return (
    <section>
      <div className="toolbar">
        <h2>Devices</h2>
        <Action perms={perms} permission="device:provision" testid="add-device" onClick={() => run(async () => {
          const name = window.prompt('Device name');
          if (!name) return;
          const kind = window.prompt('Kind: macos, windows, linux, android, ios', 'linux');
          if (!kind) return;
          await api('POST', `/v1/orgs/${orgId}/devices`, { name, kind });
          setView('people');
          setView('devices');
        })}>Add device</Action>
      </div>
      {devicesReady && devices.length === 0 && <p className="empty" data-testid="devices-empty">No devices in this organization yet.</p>}
      {devices.length > 0 && (
        <table>
          <thead>
            <tr><th>Name</th><th>Kind</th><th>State</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {devices.map((device) => (
              <tr key={device.id} data-testid="device-row" data-device-id={device.id}>
                <td>{device.name}</td>
                <td className="mono">{device.kind}</td>
                <td>{device.online ? 'online' : 'offline'}</td>
                <td className="row-actions">
                  <Action perms={device.permissions} permission="device:view" testid="start-view" onClick={() => run(() => api('POST', `/v1/orgs/${orgId}/sessions`, { deviceId: device.id, mode: 'view' }))}>View</Action>
                  <Action perms={device.permissions} permission="device:control" testid="start-control" onClick={() => run(() => api('POST', `/v1/orgs/${orgId}/sessions`, { deviceId: device.id, mode: 'control' }))}>Control</Action>
                  <Action perms={device.permissions} permission="device:terminal" testid="start-terminal" onClick={() => run(() => api('POST', `/v1/orgs/${orgId}/sessions`, { deviceId: device.id, mode: 'terminal' }))}>Terminal</Action>
                  <Action perms={device.permissions} permission="device:file_transfer" testid="transfer-files" onClick={() => run(async () => {
                    await api('POST', `/v1/orgs/${orgId}/devices/${device.id}/file-transfer`, {});
                    setNotice('Authorisation recorded. RemoteOps does not move bytes.');
                  })}>Transfer files</Action>
                  <Action perms={device.permissions} permission="device:update" testid="rename-device" onClick={() => run(async () => {
                    const name = window.prompt('Rename device', device.name);
                    if (!name) return;
                    await api('PATCH', `/v1/orgs/${orgId}/devices/${device.id}`, { name });
                    setDevices((rows) => rows.map((row) => row.id === device.id ? { ...row, name } : row));
                  })}>Rename</Action>
                  <Action perms={device.permissions} permission="device:provision" testid="decommission-device" onClick={() => run(async () => {
                    if (!window.confirm(`Decommission ${device.name}?`)) return;
                    await api('DELETE', `/v1/orgs/${orgId}/devices/${device.id}`);
                    setDevices((rows) => rows.filter((row) => row.id !== device.id));
                  })}>Decommission</Action>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
