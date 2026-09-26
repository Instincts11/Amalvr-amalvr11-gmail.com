import React, { useState } from 'react';
import { api } from './api.js';
import { Action } from './action.jsx';
import { btnPrimary, field } from './ui.js';
import { Pager, usePaged } from './pager.jsx';

export function Grants({ orgId, grants, perms, catalogue, open, setOpen, run, onChanged }) {
  const [userId, setUserId] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [effect, setEffect] = useState('allow');
  const [picked, setPicked] = useState({});
  const [query, setQuery] = useState('');
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

  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? grants.filter((grant) => `${grant.user_id} ${grant.device_id || 'org'} ${grant.effect} ${(grant.permissions || []).join(' ')}`.toLowerCase().includes(needle))
    : grants;
  const paged = usePaged(filtered, 8, `${orgId}:${needle}`);

  return (
    <section>
      <header className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-[3.25rem] leading-[0.95] tracking-[-0.045em] text-[#f4fff2]">Grants</h2>
          <div className="mt-3 w-full space-y-3 text-xl leading-8 text-[#7f8c82]">
            <p>Allow or deny on top of the role. A deny beats every allow, including a grant that names one device.</p>
            <p>A grant is live from its start until, and not including, its end. After that it no longer applies.</p>
            <p>A wildcard such as device:* covers every permission on that resource, including ones added after the grant was written.</p>
          </div>
        </div>
        <Action className={btnPrimary} perms={perms} permission="grant:create" testid="new-grant" onClick={() => run(openForm)}>New grant</Action>
      </header>
      {open && (
        <form className="mb-8 border-t border-[#1a2420] pt-5" onSubmit={(event) => {
          event.preventDefault();
          const permissions = Object.entries(picked).filter(([, on]) => on).map(([key]) => key);
          run(async () => {
            await api('POST', `/v1/orgs/${orgId}/grants`, { userId, deviceId: deviceId || null, effect, permissions });
            await onChanged();
          });
        }}>
          <label className="mb-1.5 block text-[13px] font-semibold" htmlFor="grant-user">Person</label>
          <select id="grant-user" className={field} data-testid="grant-user" value={userId} onChange={(e) => setUserId(e.target.value)}>
            {users.map((user) => <option key={user.id} value={user.id}>{user.email}</option>)}
          </select>
          <label className="mt-3 mb-1.5 block text-[13px] font-semibold" htmlFor="grant-device">Device</label>
          <select id="grant-device" className={field} data-testid="grant-device" value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
            <option value="">Entire organization</option>
            {devices.map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}
          </select>
          <label className="mt-3 mb-1.5 block text-[13px] font-semibold" htmlFor="grant-effect">Effect</label>
          <select id="grant-effect" className={field} data-testid="grant-effect" value={effect} onChange={(e) => setEffect(e.target.value)}>
            <option value="allow">allow</option>
            <option value="deny">deny</option>
          </select>
          <div className="my-4 grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2">
            {catalogue.map((key) => (
              <label key={key} className="flex items-center gap-2 text-sm font-medium">
                <input className="h-4 w-4" type="checkbox" data-permission-key={key} checked={!!picked[key]} onChange={(e) => setPicked((prev) => ({ ...prev, [key]: e.target.checked }))} />
                {key}
              </label>
            ))}
          </div>
          <button className={btnPrimary} data-testid="grant-submit" type="submit">Create grant</button>
        </form>
      )}
      <input
        className="mb-3 w-full max-w-xs border-0 bg-transparent py-1 text-sm outline-none placeholder:text-[#7f8c82]"
        aria-label="Filter grants"
        placeholder="Filter grants"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {grants.length > 0 && filtered.length === 0 && <p className="py-4 text-sm text-[#7f8c82]">Nothing matches that filter.</p>}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-lg">
          <thead>
            <tr className="text-left text-[11px] tracking-[0.16em] text-[#7f8c82] uppercase">
              <th className="px-4 py-3 font-semibold">Person</th>
              <th className="px-4 py-3 font-semibold">Effect</th>
              <th className="px-4 py-3 font-semibold">Scope</th>
              <th className="px-4 py-3 font-semibold">Permissions</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {paged.slice.map((grant) => (
              <tr key={grant.id} className="border-t border-[#1a2420] transition-colors duration-200 hover:bg-[#39FF14]/[0.04]" data-testid="grant-row" data-effect={grant.effect}>
                <td className="px-4 py-3 font-mono text-xs">{grant.user_id}</td>
                <td className="px-4 py-3">
                  <span className={grant.effect === 'deny' ? 'text-xs tracking-[0.12em] text-[#ff8b96] uppercase' : 'text-xs tracking-[0.12em] text-[#39FF14] uppercase'}>{grant.effect}</span>
                </td>
                <td className="px-4 py-3 font-mono text-xs">{grant.device_id ?? 'org'}</td>
                <td className="px-4 py-3 font-mono text-xs">{grant.permissions.join(', ')}</td>
                <td className="px-4 py-3">
                  <Action perms={perms} permission="grant:revoke" testid="revoke-grant" onClick={() => run(async () => {
                    await api('DELETE', `/v1/orgs/${orgId}/grants/${grant.id}`);
                    await onChanged();
                  })}>Revoke</Action>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager {...paged} />
    </section>
  );
}
