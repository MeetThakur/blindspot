import type { ReactNode } from 'react';
import { inviteLink } from '../lib/view';
import { CopyButton } from './ui';

/** Title row shared by every game's lobby. */
export function LobbyHeader({ title, onLeave }: { title: string; onLeave: () => void }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-black sm:text-3xl">{title}</h1>
      <button type="button" className="btn-secondary" onClick={onLeave}>
        Leave room
      </button>
    </header>
  );
}

/** Big room code plus copy buttons: the one thing a host needs to find fast. */
export function InviteCard({ code }: { code: string }) {
  const link = inviteLink(window.location.origin, code);
  return (
    <section className="card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" aria-label="Invite friends">
      <div>
        <p className="label !mb-0">Room code</p>
        <p className="text-4xl font-black tracking-[0.25em]" data-testid="room-code">
          {code}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <CopyButton text={code} label="Copy code" />
        <CopyButton text={link} label="Copy invite link" className="btn-primary" />
      </div>
      <p className="w-full break-all text-sm text-ink-soft sm:hidden">{link}</p>
    </section>
  );
}

/** What non-hosts see instead of a wall of disabled controls. */
export function SettingsSummary({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm" data-testid="settings-summary">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="font-extrabold text-ink-soft">{k}</dt>
          <dd className="font-bold">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Collapsed how-to-play block so rules don't crowd the lobby. */
export function HowToPlay({ children }: { children: ReactNode }) {
  return (
    <details className="group rounded-xl border-2 border-border/50 bg-surface-subtle">
      <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 font-extrabold">
        <span>How to play</span>
        <span aria-hidden="true" className="inline-block text-ink-soft transition group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="px-3 pb-3 text-sm text-ink-soft">{children}</div>
    </details>
  );
}
