import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useGithubStore, type GithubUser } from '@/stores/github-store';
import { getValidAccessToken } from './token';

vi.mock('./oauth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./oauth')>();
  return {
    ...actual,
    refreshAccessToken: vi.fn(),
  };
});

import { refreshAccessToken } from './oauth';

const testUser: GithubUser = { login: 'octocat', avatarUrl: 'https://example.com/a.png' };

const CLIENT_ID_ENV = 'NEXT_PUBLIC_GITHUB_CLIENT_ID';
const TOKEN_ENDPOINT_ENV = 'NEXT_PUBLIC_GITHUB_DEVICE_TOKEN_ENDPOINT';

function resetGithubStore() {
  useGithubStore.setState({
    accessToken: null,
    refreshToken: null,
    tokenExpiresAt: null,
    refreshTokenExpiresAt: null,
    user: null,
    linkedRepo: null,
    isConnecting: false,
    isSyncing: false,
    error: null,
    deviceCode: null,
  });
  localStorage.removeItem('scxml-github-store');
}

describe('getValidAccessToken', () => {
  beforeEach(() => {
    vi.stubEnv(CLIENT_ID_ENV, 'test-client-id');
    vi.stubEnv(TOKEN_ENDPOINT_ENV, 'https://relay.example.com/device/token');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetAllMocks();
    resetGithubStore();
  });

  it('returns null when there is no access token at all', async () => {
    expect(await getValidAccessToken()).toBeNull();
    expect(refreshAccessToken).not.toHaveBeenCalled();
  });

  it('returns the current token unchanged when tokenExpiresAt is null (non-expiring config)', async () => {
    useGithubStore.getState().setAuth('tok-1', testUser);

    expect(await getValidAccessToken()).toBe('tok-1');
    expect(refreshAccessToken).not.toHaveBeenCalled();
  });

  it('returns the current token unchanged when it is not yet near expiry', async () => {
    useGithubStore.getState().setAuth('tok-1', testUser, 'refresh-1', 28800, 15897600);

    expect(await getValidAccessToken()).toBe('tok-1');
    expect(refreshAccessToken).not.toHaveBeenCalled();
  });

  it('refreshes and updates the store when the token is within the skew window of expiry', async () => {
    // expiresIn: 30s puts tokenExpiresAt inside the 60s refresh skew immediately.
    useGithubStore.getState().setAuth('tok-1', testUser, 'refresh-1', 30, 15897600);
    (refreshAccessToken as ReturnType<typeof vi.fn>).mockResolvedValue({
      accessToken: 'tok-2',
      refreshToken: 'refresh-2',
      expiresIn: 28800,
      refreshTokenExpiresIn: 15897600,
    });

    const token = await getValidAccessToken();

    expect(refreshAccessToken).toHaveBeenCalledWith('test-client-id', 'refresh-1', 'https://relay.example.com/device/token');
    expect(token).toBe('tok-2');
    expect(useGithubStore.getState().accessToken).toBe('tok-2');
    expect(useGithubStore.getState().refreshToken).toBe('refresh-2');
  });

  it('refreshes when already past expiry', async () => {
    useGithubStore.getState().setAuth('tok-1', testUser, 'refresh-1', -10, 15897600);
    (refreshAccessToken as ReturnType<typeof vi.fn>).mockResolvedValue({
      accessToken: 'tok-2',
      refreshToken: 'refresh-2',
      expiresIn: 28800,
      refreshTokenExpiresIn: 15897600,
    });

    expect(await getValidAccessToken()).toBe('tok-2');
  });

  it('signs out and returns null when the refresh token itself has expired', async () => {
    useGithubStore.getState().setAuth('tok-1', testUser, 'refresh-1', 30, -10);

    const token = await getValidAccessToken();

    expect(token).toBeNull();
    expect(refreshAccessToken).not.toHaveBeenCalled();
    expect(useGithubStore.getState().accessToken).toBeNull();
  });

  it('signs out and returns null when GitHub rejects the refresh', async () => {
    useGithubStore.getState().setAuth('tok-1', testUser, 'refresh-1', 30, 15897600);
    (refreshAccessToken as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('bad refresh token'));

    const token = await getValidAccessToken();

    expect(token).toBeNull();
    expect(useGithubStore.getState().accessToken).toBeNull();
    expect(useGithubStore.getState().refreshToken).toBeNull();
  });

  it('coalesces concurrent calls into a single refresh request', async () => {
    useGithubStore.getState().setAuth('tok-1', testUser, 'refresh-1', 30, 15897600);
    let resolveRefresh!: (tokens: {
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
      refreshTokenExpiresIn: number;
    }) => void;
    (refreshAccessToken as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      })
    );

    const call1 = getValidAccessToken();
    const call2 = getValidAccessToken();

    resolveRefresh({
      accessToken: 'tok-2',
      refreshToken: 'refresh-2',
      expiresIn: 28800,
      refreshTokenExpiresIn: 15897600,
    });
    const [token1, token2] = await Promise.all([call1, call2]);

    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(token1).toBe('tok-2');
    expect(token2).toBe('tok-2');
  });
});
