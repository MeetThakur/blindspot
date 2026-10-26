import { useEffect, useRef, useState, type ReactNode } from 'react';
import { colorHex, formatClock } from '../lib/view';
import { useGame } from '../lib/store';

export function Badge({ children, tone = 'plain' }: { children: ReactNode; tone?: 'plain' | 'host' | 'good' | 'warn' | 'you' }) {
  const tones = {
    plain: 'bg-surface text-ink',
    host: 'bg-amber text-[#241f3d]',
    good: 'bg-lime/80 text-[#12301c]',
    warn: 'bg-blush text-[#451612]',
    you: 'bg-sky/80 text-[#0c2f47]',
  };
  return (
    <span className={`inline-flex items-center rounded-full border border-border px-2.5 py-0.5 text-xs font-black ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Avatar({ name, color, size = 36 }: { name: string; color: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-full border-2 border-ink font-extrabold text-ink"
      style={{ background: colorHex(color), width: size, height: size, fontSize: size * 0.45 }}
    >
      {(Array.from(name)[0] ?? '?').toUpperCase()}
    </span>
  );
}

export function Dialog({
  title,
  children,
  confirmLabel,
  onConfirm,
  onCancel,
  danger,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/50 p-4" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="card w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-extrabold">{title}</h2>
        <div className="mt-2 text-ink-soft">{children}</div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            ref={ref}
            className={danger ? 'btn-primary' : 'btn-primary'}
            onClick={() => {
              onConfirm();
              onCancel();
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Button that asks for confirmation in a dialog instead of window.confirm. */
export function ConfirmButton({
  label,
  title,
  body,
  confirmLabel,
  onConfirm,
  className = 'btn-danger',
  disabled,
}: {
  label: string;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} disabled={disabled} onClick={() => setOpen(true)}>
        {label}
      </button>
      {open && (
        <Dialog title={title} confirmLabel={confirmLabel} onConfirm={onConfirm} onCancel={() => setOpen(false)} danger>
          {body}
        </Dialog>
      )}
    </>
  );
}

export function CopyButton({ text, label, className = 'btn-secondary' }: { text: string; label: string; className?: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } catch {
        /* nothing else to try */
      }
      ta.remove();
    }
    setDone(true);
    setTimeout(() => setDone(false), 1600);
  };
  return (
    <button type="button" className={className} onClick={copy}>
      {done ? 'Copied!' : label}
    </button>
  );
}

export function Toasts() {
  const { state, client } = useGame();
  useEffect(() => {
    if (!state.toasts.length) return;
    const t = setTimeout(() => client.dismissToast(state.toasts[0]!.id), 4500);
    return () => clearTimeout(t);
  }, [state.toasts, client]);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-4" aria-live="polite">
      {state.toasts.map((t) => (
        <div
          key={t.id}
          role={t.kind === 'error' ? 'alert' : 'status'}
          className={`pointer-events-auto flex max-w-md items-start gap-3 rounded-xl border-2 border-ink px-4 py-2 font-bold shadow-[0_3px_0_0_var(--color-ink)] ${
            t.kind === 'error' ? 'bg-blush' : t.kind === 'success' ? 'bg-lime/70' : 'bg-surface'
          }`}
        >
          <span>{t.text}</span>
          <button type="button" aria-label="Dismiss" className="-mr-1 px-1 text-lg leading-none" onClick={() => client.dismissToast(t.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

export function ConnectionBanner() {
  const { state } = useGame();
  if (state.conn === 'connected' || !state.everConnected) return null;
  return (
    <div role="status" className="border-b-2 border-ink bg-amber px-4 py-2 text-center text-sm font-bold">
      Connection lost. Reconnecting… your seat is saved.
    </div>
  );
}

/** Live countdown to a server-provided deadline (corrected for client clock skew). */
export function Countdown({ deadline, paused, label }: { deadline: number | null; paused?: boolean; label?: string }) {
  const { state } = useGame();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (deadline === null) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [deadline]);
  if (deadline === null) {
    return paused ? <Badge tone="warn">Timer paused</Badge> : null;
  }
  const left = deadline - (now + state.clockOffset);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border-2 border-ink px-3 py-1 font-extrabold tabular-nums ${
        left < 6000 ? 'bg-blush' : 'bg-surface'
      }`}
      role="timer"
      aria-label={`${label ?? 'Time left'}: ${formatClock(left)}`}
    >
      {label && <span className="text-xs font-bold text-ink-soft">{label}</span>}
      {formatClock(left)}
    </span>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-ink border-t-transparent ${className}`}
    />
  );
}

function SunIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </svg>
  );
}

function MoonIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

function MonitorIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="20" height="14" x="2" y="3" rx="2" />
      <line x1="8" x2="16" y1="21" y2="21" />
      <line x1="12" x2="12" y1="17" y2="21" />
    </svg>
  );
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('blindspot.theme');
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {}
    return 'system';
  });

  const applyTheme = (next: 'system' | 'light' | 'dark') => {
    setTheme(next);
    try {
      const meta = document.querySelector('meta[name="color-scheme"]');
      if (next === 'system') {
        localStorage.removeItem('blindspot.theme');
        if (meta) meta.setAttribute('content', 'light dark');
      } else {
        localStorage.setItem('blindspot.theme', next);
        if (meta) meta.setAttribute('content', next);
      }
    } catch {}
  };

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'blindspot.theme') {
        const val = e.newValue;
        if (val === 'light' || val === 'dark') setTheme(val);
        else setTheme('system');
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return (
    <div
      role="radiogroup"
      aria-label="Theme preference"
      className="h-9 inline-flex items-center gap-0.5 rounded-xl border-2 border-border bg-surface p-1 shadow-[0_2px_0_0_var(--color-shadow)]"
    >
      <button
        type="button"
        role="radio"
        aria-checked={theme === 'light'}
        onClick={() => applyTheme('light')}
        className={`flex h-full items-center justify-center rounded-lg px-2 text-xs font-black transition ${
          theme === 'light'
            ? 'bg-amber text-[#241f3d] shadow-[0_1px_0_0_var(--color-shadow)]'
            : 'text-ink-soft hover:text-ink hover:bg-surface-hover'
        }`}
        title="Light theme"
      >
        <SunIcon className="w-4 h-4" />
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={theme === 'dark'}
        onClick={() => applyTheme('dark')}
        className={`flex h-full items-center justify-center rounded-lg px-2 text-xs font-black transition ${
          theme === 'dark'
            ? 'bg-violet text-white shadow-[0_1px_0_0_var(--color-shadow)]'
            : 'text-ink-soft hover:text-ink hover:bg-surface-hover'
        }`}
        title="Dark theme"
      >
        <MoonIcon className="w-4 h-4" />
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={theme === 'system'}
        onClick={() => applyTheme('system')}
        className={`flex h-full items-center justify-center rounded-lg px-2 text-xs font-black transition ${
          theme === 'system'
            ? 'bg-surface-subtle text-ink shadow-[0_1px_0_0_var(--color-shadow)]'
            : 'text-ink-soft hover:text-ink hover:bg-surface-hover'
        }`}
        title="Follow system theme"
      >
        <MonitorIcon className="w-4 h-4" />
      </button>
    </div>
  );
}
