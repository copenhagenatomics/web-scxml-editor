import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface GithubLinkedRepo {
  owner: string;
  repo: string;
  branch: string;
  path: string;          // file path within the repo, e.g. "flows/main.scxml"
  lastKnownSha: string | null; // blob sha from the last successful pull/push; null = file doesn't exist yet, push will create it
}

export interface GithubUser {
  login: string;
  avatarUrl: string;
}

/** The user/verification-URL pair shown while a Device Flow sign-in is in progress. */
export interface GithubDeviceCode {
  userCode: string;
  verificationUri: string;
}

interface GithubState {
  accessToken: string | null;
  user: GithubUser | null;
  linkedRepo: GithubLinkedRepo | null;
  isConnecting: boolean;   // true while a Device Flow sign-in is being requested/polled
  isSyncing: boolean;      // true while a push or pull is in flight
  error: string | null;
  deviceCode: GithubDeviceCode | null; // set once a device code has been requested; shown to the user to complete sign-in
}

interface GithubActions {
  setAuth: (token: string, user: GithubUser) => void;
  clearAuth: () => void;
  setLinkedRepo: (repo: GithubLinkedRepo) => void;
  updateLinkedRepoSha: (sha: string) => void;
  clearLinkedRepo: () => void;
  setConnecting: (v: boolean) => void;
  setSyncing: (v: boolean) => void;
  setError: (message: string | null) => void;
  setDeviceCode: (deviceCode: GithubDeviceCode | null) => void;
}

const initialState: GithubState = {
  accessToken: null,
  user: null,
  linkedRepo: null,
  isConnecting: false,
  isSyncing: false,
  error: null,
  deviceCode: null,
};

export const useGithubStore = create<GithubState & GithubActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      setAuth: (token: string, user: GithubUser) => {
        set({ accessToken: token, user });
      },

      // Clears accessToken + user + linkedRepo (no auth => no valid link).
      // Used both for a manual "Sign out" action and for the 401
      // expired/revoked-token handler.
      clearAuth: () => {
        set({ accessToken: null, user: null, linkedRepo: null });
      },

      setLinkedRepo: (repo: GithubLinkedRepo) => {
        set({ linkedRepo: repo });
      },

      // Updates linkedRepo.lastKnownSha after a successful push or pull.
      // No-op if linkedRepo is currently null, since that shouldn't happen
      // in practice.
      updateLinkedRepoSha: (sha: string) => {
        const { linkedRepo } = get();
        if (!linkedRepo) return;
        set({ linkedRepo: { ...linkedRepo, lastKnownSha: sha } });
      },

      // "Disconnect" - clears ONLY linkedRepo, keeps accessToken/user.
      clearLinkedRepo: () => {
        set({ linkedRepo: null });
      },

      setConnecting: (v: boolean) => {
        set({ isConnecting: v });
      },

      setSyncing: (v: boolean) => {
        set({ isSyncing: v });
      },

      setError: (message: string | null) => {
        set({ error: message });
      },

      setDeviceCode: (deviceCode: GithubDeviceCode | null) => {
        set({ deviceCode });
      },
    }),
    {
      name: 'scxml-github-store',
      version: 1,
      // Only persist durable identity/link state. isConnecting, isSyncing,
      // and error are transient and must reset to their defaults on every
      // page load - a stale "isSyncing: true" surviving a reload would be a
      // real bug, since the sync it referred to is definitely not still
      // running.
      partialize: (state) => ({
        accessToken: state.accessToken,
        user: state.user,
        linkedRepo: state.linkedRepo,
      }),
    }
  )
);
