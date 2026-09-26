import React from 'react';
import { btnGhost } from './ui.js';

export function held(perms, key) {
  return perms?.[key]?.effect === 'allow';
}

export function Action({ perms, permission, testid, children, onClick, className = btnGhost }) {
  if (!held(perms, permission)) return null;
  return (
    <button type="button" data-testid={testid} data-permission={permission} data-state="unlocked" className={className} onClick={onClick}>
      {children}
    </button>
  );
}
