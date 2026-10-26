import { useState } from 'react';
import { useAuth } from '../../lib/authContext';

export function AuthModal() {
  const { authModalOpen, setAuthModalOpen, signIn, signUp } = useAuth();
  const [tab, setTab] = useState<'signin' | 'signup'>('signin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!authModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);

    try {
      if (tab === 'signin') {
        const res = await signIn(username, password);
        if (!res.ok) {
          setErrorMsg(res.error || 'Failed to sign in. Please check your credentials.');
        }
      } else {
        const res = await signUp(username, password, displayName || username);
        if (!res.ok) {
          setErrorMsg(res.error || 'Failed to create account.');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in">
      <div className="card relative w-full max-w-md bg-surface p-6 shadow-2xl border-3 border-border">
        {/* Close Button */}
        <button
          type="button"
          className="absolute right-4 top-4 h-8 w-8 rounded-lg border-2 border-border text-ink hover:bg-surface-subtle flex items-center justify-center font-bold text-lg"
          onClick={() => setAuthModalOpen(false)}
        >
          ✕
        </button>

        {/* Modal Header */}
        <div className="text-center mb-6">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber border-2 border-border shadow-[0_2px_0_0_var(--color-shadow)] text-xl font-black mb-2">
            👤
          </div>
          <h2 className="text-2xl font-black">
            {tab === 'signin' ? 'Sign In' : 'Create Account'}
          </h2>
          <p className="mt-1 text-xs text-ink-soft">
            Save custom word decks to the cloud and play with friends anywhere.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex rounded-xl border-2 border-border p-1 bg-surface-subtle mb-5">
          <button
            type="button"
            className={`flex-1 py-1.5 rounded-lg text-xs font-black transition-all ${
              tab === 'signin'
                ? 'bg-ink text-paper shadow-[0_2px_0_0_var(--color-shadow)]'
                : 'text-ink-soft hover:text-ink'
            }`}
            onClick={() => {
              setTab('signin');
              setErrorMsg(null);
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`flex-1 py-1.5 rounded-lg text-xs font-black transition-all ${
              tab === 'signup'
                ? 'bg-ink text-paper shadow-[0_2px_0_0_var(--color-shadow)]'
                : 'text-ink-soft hover:text-ink'
            }`}
            onClick={() => {
              setTab('signup');
              setErrorMsg(null);
            }}
          >
            Create Account
          </button>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="mb-4 rounded-xl border-2 border-blush bg-blush/10 p-3 text-xs font-bold text-blush">
            ⚠️ {errorMsg}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          <div>
            <label className="text-xs font-black uppercase tracking-wider text-ink-soft">
              Username
            </label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono font-bold text-ink-soft">
                @
              </span>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                placeholder="your_username"
                maxLength={20}
                className="field pl-7 w-full text-sm font-bold"
              />
            </div>
            <p className="mt-1 text-[10px] text-ink-soft">
              {tab === 'signup' ? 'Letters, numbers, underscores (3-20 chars).' : 'Enter your registered username.'}
            </p>
          </div>

          {tab === 'signup' && (
            <div>
              <label className="text-xs font-black uppercase tracking-wider text-ink-soft">
                Display Name (Optional)
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Alex"
                maxLength={24}
                className="field mt-1 w-full text-sm font-bold"
              />
            </div>
          )}

          <div>
            <label className="text-xs font-black uppercase tracking-wider text-ink-soft">
              Password
            </label>
            <input
              type="password"
              required
              minLength={4}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="field mt-1 w-full text-sm font-bold"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary mt-2 py-3 text-sm font-black w-full"
          >
            {loading
              ? 'Please wait…'
              : tab === 'signin'
                ? 'Sign In'
                : 'Create Account & Play'}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-ink-soft">
          Playing as a guest? You can still join rooms with just a nickname!
        </p>
      </div>
    </div>
  );
}
