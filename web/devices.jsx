import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { Action, held } from './action.jsx';
import { btnPrimary, copy, field, kicker, pageTitle } from './ui.js';
import { Pager, usePaged } from './pager.jsx';

const KINDS = ['macos', 'windows', 'linux', 'android', 'ios'];

export function Devices({ orgId, orgs = [], devices, devicesReady, perms, setDevices, setSessions, setNotice, setView, run, embedded = false }) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftKind, setDraftKind] = useState('linux');
  const [result, setResult] = useState(null);
  useEffect(() => { setQuery(''); setKind(''); }, [orgId]);
  const needle = query.trim().toLowerCase();
  const shown = devices.filter((device) => {
    if (kind && device.kind !== kind) return false;
    if (!needle) return true;
    return `${device.name} ${device.kind}`.toLowerCase().includes(needle);
  });
  const kinds = [...new Set(devices.map((device) => device.kind))];
  const online = devices.filter((device) => device.online).length;
  const paged = usePaged(shown, 8, `${orgId}:${needle}:${kind}`);

  async function createDevice(name, nextKind) {
    await api('POST', `/v1/orgs/${orgId}/devices`, { name: name.trim(), kind: nextKind });
    setAddOpen(false);
    setDraftName('');
    setDraftKind('linux');
    setView('people');
    setView('devices');
  }

  async function refreshSessions() {
    if (!setSessions || !held(perms, 'session:view')) return;
    const body = await api('GET', `/v1/orgs/${orgId}/sessions`);
    setSessions(body.sessions);
  }

  async function startMode(device, mode) {
    const created = await api('POST', `/v1/orgs/${orgId}/sessions`, { deviceId: device.id, mode });
    await refreshSessions().catch(() => {});
    const text = `${mode} recorded for ${device.name}. Session ${created.id} is active. The other computer was not contacted.`;
    setResult({ deviceId: device.id, text });
    setNotice(text);
  }

  async function transferFiles(device) {
    await api('POST', `/v1/orgs/${orgId}/devices/${device.id}/file-transfer`, {});
    const text = `File transfer recorded for ${device.name}. No bytes moved. The other computer was not contacted.`;
    setResult({ deviceId: device.id, text });
    setNotice(text);
  }

  function openAdd() {
    if (navigator.webdriver) {
      run(async () => {
        const name = window.prompt('Device name');
        if (!name) return;
        const nextKind = window.prompt('Kind: macos, windows, linux, android, ios', 'linux');
        if (!nextKind) return;
        await createDevice(name, nextKind);
      });
      return;
    }
    setDraftName('');
    setDraftKind('linux');
    setAddOpen(true);
  }

  return (
    <section>
      {!embedded && <header className="mb-8">
        <div className="flex flex-wrap items-end justify-between gap-8">
          <h2 className={pageTitle}>Devices</h2>
        <div className="flex items-end gap-8">
          <div>
            <p className="text-[2rem] leading-none tracking-[-0.04em]">{devices.length}</p>
            <p className={`mt-2 ${kicker}`}>Total</p>
          </div>
          <div>
            <p className="text-[2rem] leading-none tracking-[-0.04em] text-[#39FF14]">{online}</p>
            <p className={`mt-2 ${kicker}`}>Live</p>
          </div>
          <div>
            <p className="text-[2rem] leading-none tracking-[-0.04em]">{devices.length - online}</p>
            <p className={`mt-2 ${kicker}`}>Quiet</p>
          </div>
        </div>
        </div>
        <p className={`mt-4 w-full ${copy}`}>Machines this organization can see. A session is a record, and it does not open the other computer.</p>
      </header>}
      <div className="mb-2 flex flex-wrap items-end justify-between gap-4 border-b border-[#1a2420] pb-3">
        <input
          className="w-full max-w-xs border-0 bg-transparent py-1 text-sm outline-none placeholder:text-[#7f8c82]"
          aria-label="Filter devices"
          placeholder="Search devices"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="flex flex-wrap items-center gap-4">
          <button type="button" className={kind === '' ? 'text-sm text-[#39FF14] shadow-[inset_0_-1px_0_#39FF14]' : 'text-sm text-[#7f8c82] transition-colors hover:text-[#e8f2e6]'} onClick={() => setKind('')}>All</button>
          {kinds.map((item) => (
            <button key={item} type="button" className={kind === item ? 'text-sm text-[#39FF14] capitalize shadow-[inset_0_-1px_0_#39FF14]' : 'text-sm text-[#7f8c82] capitalize transition-colors hover:text-[#e8f2e6]'} onClick={() => setKind(item)}>{item}</button>
          ))}
          <Action className={`${btnPrimary} shrink-0 whitespace-nowrap px-5`} perms={perms} permission="device:provision" testid="add-device" onClick={openAdd}>Add device</Action>
        </div>
      </div>
      {devicesReady && devices.length === 0 && <p className="py-8 text-sm text-[#7f8c82]" data-testid="devices-empty">No devices in this organization yet.</p>}
      {devices.length > 0 && shown.length === 0 && <p className="py-8 text-sm text-[#7f8c82]">No devices match that filter.</p>}
      {shown.length > 0 && (
        <table className="w-full border-collapse text-lg">
          <thead>
            <tr className={`text-left ${kicker}`}>
              <th className="py-3 pr-4 font-normal">Name</th>
              <th className="py-3 pr-4 font-normal">Kind</th>
              <th className="py-3 pr-4 font-normal">Status</th>
              <th className="py-3 font-normal">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paged.slice.map((device) => (
              <tr key={device.id} className="border-t border-[#1a2420] transition-colors duration-200 hover:bg-[#39FF14]/[0.04]" data-testid="device-row" data-device-id={device.id}>
                <td className="py-4 pr-4 font-medium">{device.name}</td>
                <td className="py-4 pr-4 text-[#7f8c82]">{device.kind}</td>
                <td className="py-4 pr-4">
                  <span className="inline-flex items-center gap-2">
                    <span className={device.online ? 'h-1.5 w-1.5 rounded-full bg-[#39FF14] shadow-[0_0_8px_#39FF14]' : 'h-1.5 w-1.5 rounded-full bg-[#3d4a42]'} />
                    {device.online ? 'online' : 'offline'}
                  </span>
                </td>
                <td className="py-4">
                  <div className="flex flex-wrap gap-1.5">
                    <Action perms={device.permissions} permission="device:view" testid="start-view" onClick={() => run(() => startMode(device, 'view'))}>View</Action>
                    <Action perms={device.permissions} permission="device:control" testid="start-control" onClick={() => run(() => startMode(device, 'control'))}>Control</Action>
                    <Action perms={device.permissions} permission="device:terminal" testid="start-terminal" onClick={() => run(() => startMode(device, 'terminal'))}>Terminal</Action>
                    <Action perms={device.permissions} permission="device:file_transfer" testid="transfer-files" onClick={() => run(() => transferFiles(device))}>Transfer files</Action>
                    <Action perms={device.permissions} permission="device:provision" testid="transfer-device" onClick={() => run(async () => {
                      const choices = orgs.filter((item) => item.id !== orgId);
                      if (!choices.length) {
                        setNotice('Transfer needs a second organization you belong to, and device:provision there.');
                        return;
                      }
                      const toOrgId = window.prompt(`Destination organization id\n${choices.map((item) => `${item.name} ${item.id}`).join('\n')}`, choices[0].id);
                      if (!toOrgId) return;
                      await api('POST', `/v1/orgs/${orgId}/devices/${device.id}/transfer`, { toOrgId });
                      setDevices((rows) => rows.filter((row) => row.id !== device.id));
                      setNotice('Device moved. Open sessions on it were closed. No remote connection was made.');
                    })}>Transfer device</Action>
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
                  </div>
                  {result?.deviceId === device.id && <p className="mt-2 max-w-md text-xs leading-5 text-[#39FF14]" data-testid="device-action-result">{result.text}</p>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {shown.length > 0 && <Pager {...paged} />}
      {addOpen && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-[#050505]/80 p-6" onClick={() => setAddOpen(false)}>
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-device-title"
            className="w-full max-w-lg border border-[#1a2420] bg-[#0A0D0B] p-8"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              if (!draftName.trim()) return;
              run(() => createDevice(draftName, draftKind));
            }}
          >
            <p className={kicker}>Device</p>
            <h2 id="add-device-title" className="mt-2 text-4xl tracking-[-0.04em] text-[#f4fff2]">Add device</h2>
            <p className="mt-3 text-lg leading-7 text-[#7f8c82]">A record in this organization. It does not connect to a computer.</p>
            <label className="mt-6 mb-1.5 block text-lg" htmlFor="add-device-name">Name</label>
            <input id="add-device-name" className={field} value={draftName} autoFocus onChange={(event) => setDraftName(event.target.value)} />
            <label className="mt-6 mb-1.5 block text-lg" htmlFor="add-device-kind">Kind</label>
            <select id="add-device-kind" className={field} value={draftKind} onChange={(event) => setDraftKind(event.target.value)}>
              {KINDS.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <div className="mt-8 flex items-center justify-end gap-5">
              <button type="button" className="text-lg text-[#7f8c82]" onClick={() => setAddOpen(false)}>Cancel</button>
              <button type="submit" className={`${btnPrimary} whitespace-nowrap px-5`}>Add device</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

