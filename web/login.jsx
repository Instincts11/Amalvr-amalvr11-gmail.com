import React, { useState } from 'react';
import { api, setAccessToken } from './api.js';

export function LoginForm({ onSuccess, heading = 'Sign in' }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);

  async function submit(event) {
    event.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError({ message: 'Enter an email and a password.', code: 'VALIDATION' });
      return;
    }
    try {
      const session = await api('POST', '/v1/auth/login', { email: email.trim(), password });
      setAccessToken(session.token);
      onSuccess(session);
    } catch (err) {
      setError({ message: err.message, code: err.code || 'UNAUTHENTICATED' });
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" data-testid="login-form" onSubmit={submit}>
        <p className="eyebrow">RemoteOps</p>
        <h1>{heading}</h1>
        <p className="eyebrow">Control plane · sessions are records, not streams</p>
        <label htmlFor="login-email">Email</label>
        <input id="login-email" data-testid="login-email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label htmlFor="login-password">Password</label>
        <input id="login-password" data-testid="login-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button data-testid="login-submit" type="submit">Sign in</button>
        {error && (
          <div data-testid="login-error" data-error-code={error.code} role="alert" aria-live="assertive" className="alert">
            {error.message}
          </div>
        )}
      </form>
    </div>
  );
}
