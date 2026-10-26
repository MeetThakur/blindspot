import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import {
  supabase,
  isSupabaseConfigured,
  type AppUser,
  type Profile,
  type CloudCustomList,
  type Friendship,
} from './supabase';

interface AuthContextType {
  isConfigured: boolean;
  user: AppUser | null;
  profile: Profile | null;
  loading: boolean;
  authModalOpen: boolean;
  setAuthModalOpen: (open: boolean) => void;
  friendsModalOpen: boolean;
  setFriendsModalOpen: (open: boolean) => void;
  signIn: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signUp: (
    username: string,
    password: string,
    displayName?: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => Promise<void>;
  // Cloud Lists
  cloudLists: CloudCustomList[];
  cloudListsLoading: boolean;
  refreshCloudLists: () => Promise<void>;
  saveCloudList: (
    title: string,
    items: string[],
    description?: string,
    isPublic?: boolean,
  ) => Promise<{ ok: boolean; error?: string }>;
  deleteCloudList: (id: string) => Promise<{ ok: boolean; error?: string }>;
  // Friends
  friends: Friendship[];
  friendsLoading: boolean;
  refreshFriends: () => Promise<void>;
  sendFriendRequest: (targetUsername: string) => Promise<{ ok: boolean; error?: string }>;
  respondFriendRequest: (
    friendshipId: string,
    accept: boolean,
  ) => Promise<{ ok: boolean; error?: string }>;
  removeFriend: (friendshipId: string) => Promise<{ ok: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [friendsModalOpen, setFriendsModalOpen] = useState(false);

  const [cloudLists, setCloudLists] = useState<CloudCustomList[]>([]);
  const [cloudListsLoading, setCloudListsLoading] = useState(false);

  const [friends, setFriends] = useState<Friendship[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);

  // Fetch saved cloud custom lists
  const refreshCloudLists = useCallback(async () => {
    if (!supabase || !user) {
      setCloudLists([]);
      return;
    }
    setCloudListsLoading(true);
    try {
      const { data, error } = await supabase
        .from('custom_lists')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });
      if (!error && data) {
        setCloudLists(
          data.map((row) => ({
            ...row,
            items: Array.isArray(row.items) ? (row.items as string[]) : [],
          })),
        );
      }
    } catch (e) {
      console.error('Error fetching cloud lists:', e);
    } finally {
      setCloudListsLoading(false);
    }
  }, [user]);

  // Fetch friends and pending requests
  const refreshFriends = useCallback(async () => {
    if (!supabase || !user) {
      setFriends([]);
      return;
    }
    setFriendsLoading(true);
    try {
      // Query friendships where user is sender or receiver
      const { data, error } = await supabase
        .from('friendships')
        .select(`
          id,
          user_id,
          friend_id,
          status,
          created_at,
          user:profiles!friendships_user_id_fkey(id, username, display_name, avatar_url, created_at),
          friend:profiles!friendships_friend_id_fkey(id, username, display_name, avatar_url, created_at)
        `)
        .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)
        .order('created_at', { ascending: false });

      if (!error && data) {
        const mapped: Friendship[] = data.map((row: any) => {
          const isSender = row.user_id === user.id;
          const otherProfile = isSender ? row.friend : row.user;
          return {
            id: row.id,
            user_id: row.user_id,
            friend_id: row.friend_id,
            status: row.status,
            created_at: row.created_at,
            friend: otherProfile,
          };
        });
        setFriends(mapped);
      }
    } catch (e) {
      console.error('Error fetching friends:', e);
    } finally {
      setFriendsLoading(false);
    }
  }, [user]);

  // Initial local session load
  useEffect(() => {
    try {
      const saved = localStorage.getItem('playdeck.user');
      if (saved) {
        const u = JSON.parse(saved);
        if (u && u.id) {
          setUser(u);
          setProfile(u);
        }
      }
    } catch {}
    setLoading(false);
  }, []);

  // Trigger lists and friends refresh when user is established
  useEffect(() => {
    if (user) {
      void refreshCloudLists();
      void refreshFriends();
    }
  }, [user, refreshCloudLists, refreshFriends]);

  const signIn = async (username: string, password: string) => {
    if (!supabase) return { ok: false, error: 'Database is not configured.' };
    const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!cleanUsername) return { ok: false, error: 'Please enter a username.' };
    if (!password) return { ok: false, error: 'Please enter a password.' };

    try {
      const { data, error } = await supabase.rpc('playdeck_login', {
        p_username: cleanUsername,
        p_password: password,
      });

      if (error) {
        return { ok: false, error: error.message };
      }

      if (!data || !data.ok) {
        return { ok: false, error: data?.error || 'Invalid username or password.' };
      }

      const loggedUser: AppUser = {
        id: data.user.id,
        username: data.user.username,
        display_name: data.user.display_name,
        avatar_url: data.user.avatar_url ?? null,
      };
      setUser(loggedUser);
      setProfile(loggedUser);
      try {
        localStorage.setItem('playdeck.user', JSON.stringify(loggedUser));
      } catch {}
      setAuthModalOpen(false);
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.message || 'Login failed.' };
    }
  };

  const signUp = async (
    username: string,
    password: string,
    displayName?: string,
  ) => {
    if (!supabase) return { ok: false, error: 'Database is not configured.' };
    const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (cleanUsername.length < 3) {
      return { ok: false, error: 'Username must be at least 3 characters.' };
    }
    if (password.length < 4) {
      return { ok: false, error: 'Password must be at least 4 characters.' };
    }

    try {
      const { data, error } = await supabase.rpc('playdeck_register', {
        p_username: cleanUsername,
        p_password: password,
        p_display_name: displayName?.trim() || cleanUsername,
      });

      if (error) {
        return { ok: false, error: error.message };
      }

      if (!data || !data.ok) {
        return { ok: false, error: data?.error || 'Failed to create account.' };
      }

      const loggedUser: AppUser = {
        id: data.user.id,
        username: data.user.username,
        display_name: data.user.display_name,
        avatar_url: data.user.avatar_url ?? null,
      };
      setUser(loggedUser);
      setProfile(loggedUser);
      try {
        localStorage.setItem('playdeck.user', JSON.stringify(loggedUser));
      } catch {}
      setAuthModalOpen(false);
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.message || 'Registration failed.' };
    }
  };

  const signOut = async () => {
    setUser(null);
    setProfile(null);
    setCloudLists([]);
    setFriends([]);
    try {
      localStorage.removeItem('playdeck.user');
    } catch {}
  };

  // Cloud list mutations
  const saveCloudList = async (
    title: string,
    items: string[],
    description = '',
    isPublic = false,
  ) => {
    if (!supabase || !user) return { ok: false, error: 'You must be logged in to save cloud lists.' };
    if (!title.trim()) return { ok: false, error: 'Please enter a list title.' };
    if (items.length === 0) return { ok: false, error: 'Cannot save an empty list.' };

    const { error } = await supabase.from('custom_lists').insert({
      user_id: user.id,
      title: title.trim(),
      description: description.trim(),
      items,
      is_public: isPublic,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      return { ok: false, error: error.message };
    }
    await refreshCloudLists();
    return { ok: true };
  };

  const deleteCloudList = async (id: string) => {
    if (!supabase || !user) return { ok: false, error: 'Not authenticated.' };
    const { error } = await supabase.from('custom_lists').delete().eq('id', id);
    if (error) {
      return { ok: false, error: error.message };
    }
    await refreshCloudLists();
    return { ok: true };
  };

  // Friend actions
  const sendFriendRequest = async (targetUsername: string) => {
    if (!supabase || !user) return { ok: false, error: 'Must be logged in to add friends.' };
    const clean = targetUsername.trim().toLowerCase().replace(/^@/, '');
    if (!clean) return { ok: false, error: 'Enter a username to add.' };
    if (profile && clean === profile.username.toLowerCase()) {
      return { ok: false, error: "You can't add yourself as a friend!" };
    }

    // Find profile
    const { data: targetProfile, error: profileErr } = await supabase
      .from('profiles')
      .select('id, username')
      .eq('username', clean)
      .maybeSingle();

    if (profileErr || !targetProfile) {
      return { ok: false, error: `User @${clean} not found.` };
    }

    // Check if relationship already exists
    const { data: existing } = await supabase
      .from('friendships')
      .select('id, status')
      .or(
        `and(user_id.eq.${user.id},friend_id.eq.${targetProfile.id}),and(user_id.eq.${targetProfile.id},friend_id.eq.${user.id})`,
      )
      .maybeSingle();

    if (existing) {
      if (existing.status === 'accepted') {
        return { ok: false, error: `You are already friends with @${clean}.` };
      }
      return { ok: false, error: 'A friend request is already pending between you two.' };
    }

    // Insert request
    const { error: insertErr } = await supabase.from('friendships').insert({
      user_id: user.id,
      friend_id: targetProfile.id,
      status: 'pending',
    });

    if (insertErr) {
      return { ok: false, error: insertErr.message };
    }

    await refreshFriends();
    return { ok: true };
  };

  const respondFriendRequest = async (friendshipId: string, accept: boolean) => {
    if (!supabase || !user) return { ok: false, error: 'Not authenticated.' };

    if (accept) {
      const { error } = await supabase
        .from('friendships')
        .update({ status: 'accepted' })
        .eq('id', friendshipId);
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await supabase.from('friendships').delete().eq('id', friendshipId);
      if (error) return { ok: false, error: error.message };
    }

    await refreshFriends();
    return { ok: true };
  };

  const removeFriend = async (friendshipId: string) => {
    if (!supabase || !user) return { ok: false, error: 'Not authenticated.' };
    const { error } = await supabase.from('friendships').delete().eq('id', friendshipId);
    if (error) return { ok: false, error: error.message };
    await refreshFriends();
    return { ok: true };
  };

  return (
    <AuthContext.Provider
      value={{
        isConfigured: isSupabaseConfigured,
        user,
        profile,
        loading,
        authModalOpen,
        setAuthModalOpen,
        friendsModalOpen,
        setFriendsModalOpen,
        signIn,
        signUp,
        signOut,
        cloudLists,
        cloudListsLoading,
        refreshCloudLists,
        saveCloudList,
        deleteCloudList,
        friends,
        friendsLoading,
        refreshFriends,
        sendFriendRequest,
        respondFriendRequest,
        removeFriend,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

const defaultAuthContext: AuthContextType = {
  isConfigured: isSupabaseConfigured,
  user: null,
  profile: null,
  loading: false,
  authModalOpen: false,
  setAuthModalOpen: () => {},
  friendsModalOpen: false,
  setFriendsModalOpen: () => {},
  signIn: async () => ({ ok: false, error: 'Auth not initialized' }),
  signUp: async () => ({ ok: false, error: 'Auth not initialized' }),
  signOut: async () => {},
  cloudLists: [],
  cloudListsLoading: false,
  refreshCloudLists: async () => {},
  saveCloudList: async () => ({ ok: false, error: 'Auth not initialized' }),
  deleteCloudList: async () => ({ ok: false, error: 'Auth not initialized' }),
  friends: [],
  friendsLoading: false,
  refreshFriends: async () => {},
  sendFriendRequest: async () => ({ ok: false, error: 'Auth not initialized' }),
  respondFriendRequest: async () => ({ ok: false, error: 'Auth not initialized' }),
  removeFriend: async () => ({ ok: false, error: 'Auth not initialized' }),
};

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  return ctx || defaultAuthContext;
}
