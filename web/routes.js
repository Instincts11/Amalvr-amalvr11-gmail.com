const PAGES = ['devices', 'people', 'grants', 'sessions', 'audit', 'admin'];

export function viewFromPath(pathname) {
  const key = String(pathname || '/').replace(/\/+$/, '').split('/').filter(Boolean)[0] || '';
  return PAGES.includes(key) ? key : 'home';
}

export function pathForView(view) {
  return view === 'home' ? '/' : `/${view}`;
}

export function personIdFromPath(pathname) {
  const parts = String(pathname || '/').split('/').filter(Boolean);
  return parts[0] === 'people' && parts[1] ? decodeURIComponent(parts[1]) : '';
}
