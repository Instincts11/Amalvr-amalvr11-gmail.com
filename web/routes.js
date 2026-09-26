const PAGES = ['devices', 'people', 'grants', 'sessions', 'audit', 'admin'];

export function viewFromPath(pathname) {
  const key = String(pathname || '/').replace(/\/+$/, '').split('/').filter(Boolean)[0] || '';
  return PAGES.includes(key) ? key : 'home';
}

export function pathForView(view) {
  return view === 'home' ? '/' : `/${view}`;
}
