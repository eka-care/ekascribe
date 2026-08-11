'use client';

/**
 * Login / signup page (cookie-session auth, AUTH_MODE=jwt).
 *
 * Same-origin POSTs to /connect-auth/v1/login|signup — the API sets the
 * HttpOnly session cookies itself; on success we hard-navigate to '/' so the
 * app boots with a fresh whoami. Logout redirects land here (HOSTS.LOGIN_URL).
 */

import { useState } from 'react';
import { Button } from '@ui/src';
import { Mic } from 'lucide-react';

type Mode = 'login' | 'signup';

const FIELD_CLS =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm ' +
  'outline-none focus:ring-2 focus:ring-ring focus:border-transparent';

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const body: Record<string, string> = { username: username.trim(), password };
      if (mode === 'signup' && displayName.trim()) body.display_name = displayName.trim();

      const res = await fetch(`/connect-auth/v1/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'client-id': 'doc-web' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data?.status === 'success') {
        window.location.href = '/';
        return;
      }
      setError(
        data?.error?.message ||
          data?.message ||
          (mode === 'login' ? 'Invalid username or password' : 'Signup failed')
      );
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full flex-1 items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
            <Mic className="h-5 w-5 text-primary" />
          </div>
          <h1 className="text-xl font-semibold">vaarta</h1>
          <p className="text-xs text-muted-foreground">powered by @eka.care</p>
          <p className="text-sm text-muted-foreground">
            {mode === 'login' ? 'Sign in to continue' : 'Create your account'}
          </p>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3">
          {mode === 'signup' && (
            <input
              className={FIELD_CLS}
              placeholder="Display name (optional)"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoComplete="name"
            />
          )}
          <input
            className={FIELD_CLS}
            placeholder="Username or email"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            minLength={3}
          />
          <input
            className={FIELD_CLS}
            type="password"
            placeholder={mode === 'signup' ? 'Password (min 8 characters)' : 'Password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
            minLength={mode === 'signup' ? 8 : 1}
          />

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" disabled={submitting || !username || !password} className="mt-1 w-full">
            {submitting ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-muted-foreground">
          {mode === 'login' ? (
            <>
              New here?{' '}
              <button
                type="button"
                className="cursor-pointer font-medium text-primary hover:underline"
                onClick={() => { setMode('signup'); setError(''); }}
              >
                Create an account
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                type="button"
                className="cursor-pointer font-medium text-primary hover:underline"
                onClick={() => { setMode('login'); setError(''); }}
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
