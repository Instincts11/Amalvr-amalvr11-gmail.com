import React, { useState } from 'react';
import { api, setAccessToken } from './api.js';
import { btnPrimary, field, kicker } from './ui.js';

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
    <div className="signal-grid grid min-h-screen text-[#e8f2e6] lg:grid-cols-[1.15fr_0.85fr]">
      <section className="flex flex-col justify-between px-8 py-10 md:px-14 md:py-12">
        <p className="text-[2rem] leading-none tracking-[-0.04em] text-[#f4fff2]">RemoteOps</p>
        <h2 className="mt-16 max-w-md text-[3.1rem] leading-[0.96] tracking-[-0.045em] text-[#f4fff2] md:mt-0">
          A quiet record of who may open a machine.
        </h2>
        <p className={`${kicker} mt-10`}>One organization at a time</p>
      </section>
      <div className="flex items-center border-t border-[#1a2420] px-8 py-14 md:px-14 lg:border-t-0 lg:border-l">
        <form className="w-full max-w-sm" data-testid="login-form" onSubmit={submit}>
          <h1 className="text-3xl tracking-[-0.04em] text-[#f4fff2]">{heading}</h1>
          <label className="mt-8 mb-1 block text-[13px]" htmlFor="login-email">Email</label>
          <input id="login-email" className={field} data-testid="login-email" autoFocus autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
          <label className="mt-6 mb-1 block text-[13px]" htmlFor="login-password">Password</label>
          <input id="login-password" className={field} data-testid="login-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button className={`${btnPrimary} mt-8 h-11 w-full`} data-testid="login-submit" type="submit">Sign in</button>
          {error && (
            <div data-testid="login-error" data-error-code={error.code} role="alert" aria-live="assertive" className="mt-4 text-sm text-[#39FF14]">
              {error.message}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
