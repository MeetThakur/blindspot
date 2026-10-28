import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../lib/authContext';
import { ThemeToggle } from './ui';

function UsersIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function LogOutIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" x2="9" y1="12" y2="12" />
    </svg>
  );
}

export function HeaderNav() {
  const {
    isConfigured,
    user,
    profile,
    signOut,
    setAuthModalOpen,
    setFriendsModalOpen,
    friends,
  } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Incoming pending requests badge
  const pendingCount = friends.filter((f) => f.status === 'pending' && f.friend_id === user?.id).length;

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleOutside);
      return () => document.removeEventListener('mousedown', handleOutside);
    }
  }, [dropdownOpen]);

  return (
    <div className="flex items-center gap-2">
      {isConfigured && (
        <>
          {/* Friends Button */}
          <button
            type="button"
            className="relative h-9 px-3 flex items-center gap-1.5 rounded-xl border-2 border-border bg-surface hover:bg-surface-hover text-xs font-black shadow-[0_2px_0_0_var(--color-shadow)] transition-all active:translate-y-[1px] active:shadow-none"
            onClick={() => setFriendsModalOpen(true)}
            title="Friends & Invites"
          >
            <UsersIcon className="w-3.5 h-3.5 text-ink-soft" />
            <span className="hidden sm:inline">Friends</span>
            {pendingCount > 0 && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-coral text-[10px] font-black text-white animate-pulse">
                {pendingCount}
              </span>
            )}
          </button>

          {user && profile ? (
            /* Logged In User Profile Menu */
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                className="h-9 px-2.5 flex items-center gap-2 rounded-xl border-2 border-border bg-surface hover:bg-surface-hover text-xs font-black shadow-[0_2px_0_0_var(--color-shadow)] transition-all active:translate-y-[1px] active:shadow-none"
                onClick={() => setDropdownOpen((prev) => !prev)}
                title="Account Menu"
              >
                <div className="flex h-5 w-5 items-center justify-center rounded-md bg-amber border border-ink text-[10px] font-black text-ink shadow-[0_1px_0_0_var(--color-shadow)]">
                  {profile.display_name.slice(0, 1).toUpperCase()}
                </div>
                <span className="max-w-[110px] truncate">{profile.display_name}</span>
                <span className="text-[10px] text-ink-soft">▾</span>
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 mt-1.5 w-48 rounded-xl border-2 border-border bg-surface p-2 shadow-xl z-50 animate-in fade-in">
                  <div className="border-b border-border pb-2 px-2">
                    <p className="text-xs font-black truncate">{profile.display_name}</p>
                    <p className="font-mono text-[11px] text-ink-soft truncate">@{profile.username}</p>
                  </div>

                  <div className="pt-2 flex flex-col gap-1">
                    <button
                      type="button"
                      className="rounded-lg px-2.5 py-1.5 text-left text-xs font-bold text-ink hover:bg-surface-subtle transition-all flex items-center justify-between"
                      onClick={() => {
                        setDropdownOpen(false);
                        setFriendsModalOpen(true);
                      }}
                    >
                      <span className="flex items-center gap-1.5">
                        <UsersIcon className="w-3.5 h-3.5" />
                        <span>Friends List</span>
                      </span>
                      {pendingCount > 0 && (
                        <span className="rounded bg-coral px-1 text-[9px] font-black text-white">
                          {pendingCount}
                        </span>
                      )}
                    </button>

                    <button
                      type="button"
                      className="rounded-lg px-2.5 py-1.5 text-left text-xs font-bold text-blush hover:bg-blush/10 transition-all flex items-center gap-1.5"
                      onClick={() => {
                        setDropdownOpen(false);
                        void signOut();
                      }}
                    >
                      <LogOutIcon className="w-3.5 h-3.5" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Log In CTA Button */
            <button
              type="button"
              className="h-9 px-3.5 flex items-center gap-1.5 whitespace-nowrap rounded-xl border-2 border-border bg-surface-subtle hover:bg-surface-hover text-xs font-black text-ink shadow-[0_2px_0_0_var(--color-shadow)] transition-all active:translate-y-[1px] active:shadow-none hover:border-coral"
              onClick={() => setAuthModalOpen(true)}
            >
              <span>Log In</span>
            </button>
          )}
        </>
      )}

      <ThemeToggle />
    </div>
  );
}
