import { registerAuth } from './auth.js';
import { registerDevices } from './devices.js';
import { registerInvites } from './invites.js';
import { registerOrgs } from './orgs.js';
import { registerSessions } from './sessions.js';

export function registerRoutes(router, deps) {
  registerAuth(router, deps);
  registerOrgs(router, deps);
  registerInvites(router, deps);
  registerDevices(router, deps);
  registerSessions(router, deps);
}
