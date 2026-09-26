import React from 'react';

export function held(perms, key) {
  return perms?.[key]?.effect === 'allow';
}

export function Action({ perms, permission, testid, children, onClick }) {
  if (!held(perms, permission)) return null;
  return (
    <button type="button" data-testid={testid} data-permission={permission} data-state="unlocked" onClick={onClick}>
      {children}
    </button>
  );
}
