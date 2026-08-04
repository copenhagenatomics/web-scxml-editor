import { describe, it, expect, afterEach } from 'vitest';
import { useGithubStore, type GithubLinkedRepo, type GithubUser } from './github-store';

const testUser: GithubUser = { login: 'octocat', avatarUrl: 'https://example.com/a.png' };
const testRepo: GithubLinkedRepo = {
  owner: 'octocat',
  repo: 'hello-world',
  branch: 'main',
  path: 'flows/main.scxml',
  lastKnownSha: 'abc123',
};

function resetStore() {
  useGithubStore.setState({
    accessToken: null,
    user: null,
    linkedRepo: null,
    isConnecting: false,
    isSyncing: false,
    error: null,
    deviceCode: null,
  });
  localStorage.removeItem('scxml-github-store');
}

describe('github-store', () => {
  afterEach(() => {
    resetStore();
  });

  it('has the expected default state', () => {
    const state = useGithubStore.getState();
    expect(state.accessToken).toBeNull();
    expect(state.user).toBeNull();
    expect(state.linkedRepo).toBeNull();
    expect(state.isConnecting).toBe(false);
    expect(state.isSyncing).toBe(false);
    expect(state.error).toBeNull();
    expect(state.deviceCode).toBeNull();
  });

  it('setAuth sets both accessToken and user', () => {
    useGithubStore.getState().setAuth('token-123', testUser);
    expect(useGithubStore.getState().accessToken).toBe('token-123');
    expect(useGithubStore.getState().user).toEqual(testUser);
  });

  it('clearAuth clears accessToken, user, and linkedRepo', () => {
    useGithubStore.getState().setAuth('token-123', testUser);
    useGithubStore.getState().setLinkedRepo(testRepo);

    useGithubStore.getState().clearAuth();

    expect(useGithubStore.getState().accessToken).toBeNull();
    expect(useGithubStore.getState().user).toBeNull();
    expect(useGithubStore.getState().linkedRepo).toBeNull();
  });

  it('setLinkedRepo sets the linked repo', () => {
    useGithubStore.getState().setLinkedRepo(testRepo);
    expect(useGithubStore.getState().linkedRepo).toEqual(testRepo);
  });

  it('clearLinkedRepo clears only linkedRepo, not accessToken/user', () => {
    useGithubStore.getState().setAuth('token-123', testUser);
    useGithubStore.getState().setLinkedRepo(testRepo);

    useGithubStore.getState().clearLinkedRepo();

    expect(useGithubStore.getState().linkedRepo).toBeNull();
    expect(useGithubStore.getState().accessToken).toBe('token-123');
    expect(useGithubStore.getState().user).toEqual(testUser);
  });

  it('updateLinkedRepoSha updates only lastKnownSha, leaving the rest unchanged', () => {
    useGithubStore.getState().setLinkedRepo(testRepo);

    useGithubStore.getState().updateLinkedRepoSha('newsha456');

    expect(useGithubStore.getState().linkedRepo).toEqual({
      ...testRepo,
      lastKnownSha: 'newsha456',
    });
  });

  it('updateLinkedRepoSha is a no-op when linkedRepo is null', () => {
    expect(useGithubStore.getState().linkedRepo).toBeNull();
    useGithubStore.getState().updateLinkedRepoSha('newsha456');
    expect(useGithubStore.getState().linkedRepo).toBeNull();
  });

  it('setConnecting sets isConnecting', () => {
    useGithubStore.getState().setConnecting(true);
    expect(useGithubStore.getState().isConnecting).toBe(true);
    useGithubStore.getState().setConnecting(false);
    expect(useGithubStore.getState().isConnecting).toBe(false);
  });

  it('setSyncing sets isSyncing', () => {
    useGithubStore.getState().setSyncing(true);
    expect(useGithubStore.getState().isSyncing).toBe(true);
    useGithubStore.getState().setSyncing(false);
    expect(useGithubStore.getState().isSyncing).toBe(false);
  });

  it('setError sets and clears the error message', () => {
    useGithubStore.getState().setError('something went wrong');
    expect(useGithubStore.getState().error).toBe('something went wrong');
    useGithubStore.getState().setError(null);
    expect(useGithubStore.getState().error).toBeNull();
  });

  it('setDeviceCode sets and clears the device code info', () => {
    useGithubStore.getState().setDeviceCode({
      userCode: 'ABCD-1234',
      verificationUri: 'https://github.com/login/device',
    });
    expect(useGithubStore.getState().deviceCode).toEqual({
      userCode: 'ABCD-1234',
      verificationUri: 'https://github.com/login/device',
    });
    useGithubStore.getState().setDeviceCode(null);
    expect(useGithubStore.getState().deviceCode).toBeNull();
  });

  describe('persistence', () => {
    function getPersistedPayload(): Record<string, unknown> {
      const raw = localStorage.getItem('scxml-github-store');
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw as string);
      return parsed.state as Record<string, unknown>;
    }

    it('persists accessToken, user, and linkedRepo but not the transient fields', () => {
      useGithubStore.getState().setAuth('token-123', testUser);
      useGithubStore.getState().setLinkedRepo(testRepo);
      useGithubStore.getState().setConnecting(true);
      useGithubStore.getState().setSyncing(true);
      useGithubStore.getState().setError('some error');
      useGithubStore.getState().setDeviceCode({
        userCode: 'ABCD-1234',
        verificationUri: 'https://github.com/login/device',
      });

      const persisted = getPersistedPayload();

      // Durable fields are present and correct.
      expect(persisted.accessToken).toBe('token-123');
      expect(persisted.user).toEqual(testUser);
      expect(persisted.linkedRepo).toEqual(testRepo);

      // Transient fields must never be written to localStorage.
      expect(persisted.isConnecting).toBeUndefined();
      expect(persisted.isSyncing).toBeUndefined();
      expect(persisted.error).toBeUndefined();
      expect('isConnecting' in persisted).toBe(false);
      expect('isSyncing' in persisted).toBe(false);
      expect('error' in persisted).toBe(false);
      expect('deviceCode' in persisted).toBe(false);
    });

    it('does not persist transient-only changes as anything other than defaults', () => {
      useGithubStore.getState().setConnecting(true);
      useGithubStore.getState().setSyncing(true);
      useGithubStore.getState().setError('boom');
      useGithubStore.getState().setDeviceCode({
        userCode: 'ABCD-1234',
        verificationUri: 'https://github.com/login/device',
      });

      const persisted = getPersistedPayload();

      expect(persisted.accessToken).toBeNull();
      expect(persisted.user).toBeNull();
      expect(persisted.linkedRepo).toBeNull();
      expect('isConnecting' in persisted).toBe(false);
      expect('isSyncing' in persisted).toBe(false);
      expect('error' in persisted).toBe(false);
      expect('deviceCode' in persisted).toBe(false);
    });
  });
});
