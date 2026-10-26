import { useState } from 'react';
import { useAuth } from '../../lib/authContext';
import { useGame } from '../../lib/store';
import { inviteLink } from '../../lib/view';

export function FriendsModal() {
  const {
    friendsModalOpen,
    setFriendsModalOpen,
    setAuthModalOpen,
    user,
    profile,
    friends,
    friendsLoading,
    sendFriendRequest,
    respondFriendRequest,
    removeFriend,
  } = useAuth();
  const { state, client } = useGame();
  const currentRoomCode = state.snapshot?.code;

  const [activeTab, setActiveTab] = useState<'friends' | 'requests'>('friends');
  const [targetUsername, setTargetUsername] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  if (!friendsModalOpen) return null;

  // Split into accepted friends vs pending requests
  const acceptedFriends = friends.filter((f) => f.status === 'accepted');
  const incomingRequests = friends.filter((f) => f.status === 'pending' && f.friend_id === user?.id);
  const outgoingRequests = friends.filter((f) => f.status === 'pending' && f.user_id === user?.id);

  const handleAddFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUsername.trim()) return;
    setSubmitting(true);
    setMessage(null);

    const res = await sendFriendRequest(targetUsername);
    setSubmitting(false);
    if (res.ok) {
      setMessage({ text: `Friend request sent to @${targetUsername.trim().replace(/^@/, '')}!`, isError: false });
      setTargetUsername('');
    } else {
      setMessage({ text: res.error || 'Failed to send request.', isError: true });
    }
  };

  const handleInviteToRoom = (friendName: string) => {
    if (!currentRoomCode) {
      client.toast('info', 'Join or host a room first to invite friends!');
      return;
    }
    const link = inviteLink(window.location.origin, currentRoomCode);
    navigator.clipboard.writeText(link);
    client.toast('success', `Copied invite link for ${friendName}! (Room ${currentRoomCode})`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in">
      <div className="card relative w-full max-w-lg bg-surface p-5 sm:p-6 shadow-2xl border-3 border-border max-h-[90vh] flex flex-col">
        {/* Close Button */}
        <button
          type="button"
          className="absolute right-4 top-4 h-8 w-8 rounded-lg border-2 border-border text-ink hover:bg-surface-subtle flex items-center justify-center font-bold text-lg"
          onClick={() => setFriendsModalOpen(false)}
        >
          ✕
        </button>

        {/* Modal Title */}
        <div className="flex items-center gap-3 pb-3 border-b-2 border-border">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-border bg-coral text-white font-black text-xl shadow-[0_2px_0_0_var(--color-shadow)]">
            👥
          </div>
          <div>
            <h2 className="text-xl font-black">Friends & Invites</h2>
            {profile ? (
              <p className="text-xs text-ink-soft">
                Your handle: <strong className="text-ink">@{profile.username}</strong>
              </p>
            ) : (
              <p className="text-xs text-ink-soft">Connect with friends and invite them to game rooms</p>
            )}
          </div>
        </div>

        {!user ? (
          /* Log in CTA if not logged in */
          <div className="my-8 text-center flex flex-col items-center">
            <span className="text-4xl">🔐</span>
            <h3 className="mt-3 text-lg font-black">Log in to add friends</h3>
            <p className="mt-1 text-xs text-ink-soft max-w-xs">
              Create an account or sign in to build your friends list and send 1-click room invites!
            </p>
            <button
              type="button"
              className="btn-primary mt-5 px-6 py-2.5 text-xs font-black"
              onClick={() => {
                setFriendsModalOpen(false);
                setAuthModalOpen(true);
              }}
            >
              Sign In or Register
            </button>
          </div>
        ) : (
          /* Authenticated Friends Content */
          <div className="flex-1 overflow-y-auto mt-4 pr-1 flex flex-col gap-4">
            {/* Add Friend Form */}
            <form onSubmit={handleAddFriend} className="rounded-xl border-2 border-border p-3 bg-surface-subtle">
              <label className="text-xs font-black uppercase tracking-wider text-ink-soft">
                Add Friend by Username
              </label>
              <div className="mt-1.5 flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono font-bold text-ink-soft">
                    @
                  </span>
                  <input
                    type="text"
                    required
                    value={targetUsername}
                    onChange={(e) => setTargetUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    placeholder="friend_username"
                    className="input-field pl-7 w-full text-xs font-bold"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting || !targetUsername.trim()}
                  className="btn-primary px-4 py-2 text-xs font-black whitespace-nowrap"
                >
                  {submitting ? 'Adding…' : 'Add Friend'}
                </button>
              </div>

              {message && (
                <p className={`mt-2 text-xs font-bold ${message.isError ? 'text-blush' : 'text-mint'}`}>
                  {message.isError ? '⚠️ ' : '✓ '}
                  {message.text}
                </p>
              )}
            </form>

            {/* Navigation Tabs */}
            <div className="flex rounded-xl border-2 border-border p-1 bg-surface-subtle">
              <button
                type="button"
                className={`flex-1 py-1.5 rounded-lg text-xs font-black transition-all ${
                  activeTab === 'friends'
                    ? 'bg-ink text-paper shadow-[0_2px_0_0_var(--color-shadow)]'
                    : 'text-ink-soft hover:text-ink'
                }`}
                onClick={() => setActiveTab('friends')}
              >
                Friends ({acceptedFriends.length})
              </button>
              <button
                type="button"
                className={`flex-1 py-1.5 rounded-lg text-xs font-black transition-all ${
                  activeTab === 'requests'
                    ? 'bg-ink text-paper shadow-[0_2px_0_0_var(--color-shadow)]'
                    : 'text-ink-soft hover:text-ink'
                }`}
                onClick={() => setActiveTab('requests')}
              >
                Requests {incomingRequests.length > 0 && `(${incomingRequests.length})`}
              </button>
            </div>

            {/* Tab 1: Accepted Friends */}
            {activeTab === 'friends' && (
              <div className="flex flex-col gap-2">
                {friendsLoading ? (
                  <p className="text-center py-6 text-xs text-ink-soft">Loading friends…</p>
                ) : acceptedFriends.length === 0 ? (
                  <div className="text-center py-6 text-xs text-ink-soft">
                    <p>No friends added yet.</p>
                    <p className="mt-1">Add a friend by their username above to easily invite them to matches!</p>
                  </div>
                ) : (
                  acceptedFriends.map((f) => {
                    const friendProfile = f.friend;
                    if (!friendProfile) return null;

                    return (
                      <div
                        key={f.id}
                        className="flex items-center justify-between rounded-xl border-2 border-border p-2.5 bg-surface shadow-[0_2px_0_0_var(--color-shadow)]"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-2 border-border bg-amber font-black text-xs">
                            {friendProfile.display_name.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-xs font-black">{friendProfile.display_name}</p>
                            <p className="truncate text-[10px] font-mono text-ink-soft">@{friendProfile.username}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {currentRoomCode ? (
                            <button
                              type="button"
                              className="btn-primary px-3 py-1 text-xs font-black whitespace-nowrap"
                              onClick={() => handleInviteToRoom(friendProfile.display_name)}
                              title={`Invite to Room ${currentRoomCode}`}
                            >
                              Invite 🎮
                            </button>
                          ) : (
                            <span className="text-[10px] font-bold text-ink-soft px-2">Ready</span>
                          )}
                          <button
                            type="button"
                            className="text-[11px] font-bold text-blush hover:underline p-1"
                            onClick={() => removeFriend(f.id)}
                            title="Remove friend"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Tab 2: Pending Requests */}
            {activeTab === 'requests' && (
              <div className="flex flex-col gap-3">
                {/* Incoming Requests */}
                <div>
                  <h4 className="text-xs font-black uppercase text-ink-soft mb-2">
                    Incoming Requests ({incomingRequests.length})
                  </h4>
                  {incomingRequests.length === 0 ? (
                    <p className="text-xs text-ink-soft italic py-2">No incoming requests.</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {incomingRequests.map((req) => (
                        <div
                          key={req.id}
                          className="flex items-center justify-between rounded-xl border-2 border-border p-2.5 bg-surface"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-black">{req.friend?.display_name || req.friend?.username}</p>
                            <p className="text-[10px] font-mono text-ink-soft">@{req.friend?.username}</p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              className="btn-primary px-3 py-1 text-xs font-black"
                              onClick={() => respondFriendRequest(req.id, true)}
                            >
                              Accept
                            </button>
                            <button
                              type="button"
                              className="btn-secondary px-3 py-1 text-xs font-black"
                              onClick={() => respondFriendRequest(req.id, false)}
                            >
                              Decline
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Outgoing Requests */}
                <div className="border-t border-border pt-3">
                  <h4 className="text-xs font-black uppercase text-ink-soft mb-2">
                    Sent Requests ({outgoingRequests.length})
                  </h4>
                  {outgoingRequests.length === 0 ? (
                    <p className="text-xs text-ink-soft italic py-2">No pending sent requests.</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {outgoingRequests.map((req) => (
                        <div
                          key={req.id}
                          className="flex items-center justify-between rounded-xl border border-border p-2 bg-surface-subtle"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-bold">@{req.friend?.username}</p>
                            <p className="text-[10px] text-ink-soft">Pending response…</p>
                          </div>
                          <button
                            type="button"
                            className="text-xs font-bold text-blush hover:underline"
                            onClick={() => removeFriend(req.id)}
                          >
                            Cancel
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
