import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useGithubConnect } from './use-github-connect';
import { useGithubStore } from '@/stores/github-store';
import { useHostAPIStore } from '@/stores/host-api-store';
import { GithubOAuthError } from '@/lib/github/oauth';

vi.mock('@/lib/github/oauth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/github/oauth')>();
  return {
    ...actual,
    requestDeviceCode: vi.fn(),
    pollForDeviceToken: vi.fn(),
  };
});

vi.mock('@/lib/github/api', () => ({
  getAuthenticatedUser: vi.fn(),
}));

import { requestDeviceCode, pollForDeviceToken } from '@/lib/github/oauth';
import { getAuthenticatedUser } from '@/lib/github/api';

const CLIENT_ID_ENV = 'NEXT_PUBLIC_GITHUB_CLIENT_ID';
const DEVICE_CODE_ENDPOINT_ENV = 'NEXT_PUBLIC_GITHUB_DEVICE_CODE_ENDPOINT';
const TOKEN_ENDPOINT_ENV = 'NEXT_PUBLIC_GITHUB_DEVICE_TOKEN_ENDPOINT';

const DEVICE_CODE_INFO = {
  deviceCode: 'dc-1',
  userCode: 'ABCD-1234',
  verificationUri: 'https://github.com/login/device',
  expiresIn: 900,
  interval: 5,
};

function resetGithubStore() {
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

function getFeedback() {
  return useHostAPIStore.getState().feedbackQueue;
}

/**
 * Invokes an async hook callback inside `act`. Timers are faked for the
 * duration of each test (see `beforeEach`/`afterEach` below) purely so the
 * `showFeedback` auto-dismiss timer (a real `setTimeout(4000)`) never fires
 * mid-test or leaks a background store update into a later test as an
 * "update not wrapped in act" warning - the hooks under test fully
 * destructure `useHostAPIStore()` (the established convention in this
 * codebase), so the rendered test component re-renders on that dismiss too.
 */
async function runAndFlush(fn: () => Promise<void>) {
  await act(async () => {
    await fn();
  });
}

describe('useGithubConnect', () => {
  beforeEach(() => {
    vi.stubEnv(CLIENT_ID_ENV, 'test-client-id');
    vi.stubEnv(DEVICE_CODE_ENDPOINT_ENV, 'https://relay.example.com/device/code');
    vi.stubEnv(TOKEN_ENDPOINT_ENV, 'https://relay.example.com/device/token');
    vi.useFakeTimers();
  });

  afterEach(() => {
    // Unmount the renderHook wrapper and flush the pending auto-dismiss
    // timer (both wrapped in act) before switching back to real timers, so
    // neither fires unbounded later and touches a store a subsequent
    // test/component isn't expecting.
    act(() => {
      cleanup();
      vi.runOnlyPendingTimers();
    });
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.resetAllMocks();
    resetGithubStore();
    useHostAPIStore.setState({ feedbackQueue: [] });
  });

  it('fails fast with a config error when the client id env var is missing, without touching the store or requesting a device code', async () => {
    vi.stubEnv(CLIENT_ID_ENV, '');

    const { result } = renderHook(() => useGithubConnect());
    await runAndFlush(() => result.current.connect());

    expect(requestDeviceCode).not.toHaveBeenCalled();
    expect(useGithubStore.getState().isConnecting).toBe(false);
    expect(useGithubStore.getState().accessToken).toBeNull();
    const feedback = getFeedback();
    expect(feedback).toHaveLength(1);
    expect(feedback[0].level).toBe('error');
    expect(feedback[0].message).toContain('not configured');
  });

  it('fails fast with a config error when the device code endpoint env var is missing', async () => {
    vi.stubEnv(DEVICE_CODE_ENDPOINT_ENV, '');

    const { result } = renderHook(() => useGithubConnect());
    await runAndFlush(() => result.current.connect());

    expect(requestDeviceCode).not.toHaveBeenCalled();
    expect(getFeedback()).toHaveLength(1);
    expect(getFeedback()[0].message).toContain('not configured');
  });

  it('fails fast with a config error when the token endpoint env var is missing', async () => {
    vi.stubEnv(TOKEN_ENDPOINT_ENV, '');

    const { result } = renderHook(() => useGithubConnect());
    await runAndFlush(() => result.current.connect());

    expect(requestDeviceCode).not.toHaveBeenCalled();
    expect(getFeedback()).toHaveLength(1);
    expect(getFeedback()[0].message).toContain('not configured');
  });

  it('happy path: requests a device code, surfaces it via the store, polls for the token, fetches the user, and stores auth', async () => {
    (requestDeviceCode as ReturnType<typeof vi.fn>).mockResolvedValue(DEVICE_CODE_INFO);

    let deviceCodeAtPollTime: unknown;
    (pollForDeviceToken as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      // Captured mid-flow, before the hook's `finally` clears it - proves
      // the store is populated for the UI to show *during* polling, not
      // just briefly set and immediately cleared.
      deviceCodeAtPollTime = useGithubStore.getState().deviceCode;
      return { accessToken: 'tok-1' };
    });
    (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      login: 'octocat',
      avatarUrl: 'https://example.com/a.png',
    });

    const { result } = renderHook(() => useGithubConnect());
    await runAndFlush(() => result.current.connect());

    expect(requestDeviceCode).toHaveBeenCalledWith('test-client-id', 'https://relay.example.com/device/code');
    expect(deviceCodeAtPollTime).toEqual({
      userCode: 'ABCD-1234',
      verificationUri: 'https://github.com/login/device',
    });
    expect(pollForDeviceToken).toHaveBeenCalledWith(
      'test-client-id',
      'dc-1',
      5,
      'https://relay.example.com/device/token',
      expect.any(AbortSignal)
    );
    expect(getAuthenticatedUser).toHaveBeenCalledWith('tok-1');
    expect(useGithubStore.getState().accessToken).toBe('tok-1');
    expect(useGithubStore.getState().user).toEqual({
      login: 'octocat',
      avatarUrl: 'https://example.com/a.png',
    });
    expect(useGithubStore.getState().isConnecting).toBe(false);
    // Cleared once the flow settles - the UI shouldn't keep showing a code
    // that's no longer relevant.
    expect(useGithubStore.getState().deviceCode).toBeNull();
    expect(getFeedback()).toHaveLength(0);
  });

  it('cancelled is silent: no feedback, isConnecting resets, deviceCode clears, no auth stored', async () => {
    (requestDeviceCode as ReturnType<typeof vi.fn>).mockResolvedValue(DEVICE_CODE_INFO);
    (pollForDeviceToken as ReturnType<typeof vi.fn>).mockRejectedValue(
      new GithubOAuthError('cancelled', 'GitHub sign-in was cancelled.')
    );

    const { result } = renderHook(() => useGithubConnect());
    await runAndFlush(() => result.current.connect());

    expect(getFeedback()).toHaveLength(0);
    expect(useGithubStore.getState().isConnecting).toBe(false);
    expect(useGithubStore.getState().deviceCode).toBeNull();
    expect(useGithubStore.getState().accessToken).toBeNull();
  });

  it.each([
    ['expired', 'The GitHub sign-in code expired before it was used. Please try again.'],
    ['access-denied', 'GitHub sign-in was denied.'],
    ['device-flow-disabled', 'Device flow is not enabled for this GitHub OAuth App.'],
    ['request-failed', 'Failed to start GitHub sign-in (status 400).'],
  ] as const)('%s shows the GithubOAuthError message verbatim as an error toast', async (reason, message) => {
    (requestDeviceCode as ReturnType<typeof vi.fn>).mockResolvedValue(DEVICE_CODE_INFO);
    (pollForDeviceToken as ReturnType<typeof vi.fn>).mockRejectedValue(new GithubOAuthError(reason, message));

    const { result } = renderHook(() => useGithubConnect());
    await runAndFlush(() => result.current.connect());

    expect(getFeedback()).toHaveLength(1);
    expect(getFeedback()[0].level).toBe('error');
    expect(getFeedback()[0].message).toBe(message);
    expect(useGithubStore.getState().isConnecting).toBe(false);
    expect(useGithubStore.getState().deviceCode).toBeNull();
  });

  it('a GithubOAuthError thrown by requestDeviceCode itself (before any device code exists) is handled the same way', async () => {
    (requestDeviceCode as ReturnType<typeof vi.fn>).mockRejectedValue(
      new GithubOAuthError('request-failed', 'Failed to start GitHub sign-in (status 502).')
    );

    const { result } = renderHook(() => useGithubConnect());
    await runAndFlush(() => result.current.connect());

    expect(pollForDeviceToken).not.toHaveBeenCalled();
    expect(getFeedback()).toHaveLength(1);
    expect(getFeedback()[0].message).toBe('Failed to start GitHub sign-in (status 502).');
    expect(useGithubStore.getState().deviceCode).toBeNull();
  });

  it('generic failure (getAuthenticatedUser throws a plain Error) wraps the message and resets isConnecting', async () => {
    (requestDeviceCode as ReturnType<typeof vi.fn>).mockResolvedValue(DEVICE_CODE_INFO);
    (pollForDeviceToken as ReturnType<typeof vi.fn>).mockResolvedValue({ accessToken: 'tok-1' });
    (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => useGithubConnect());
    await runAndFlush(() => result.current.connect());

    expect(useGithubStore.getState().accessToken).toBeNull();
    expect(useGithubStore.getState().isConnecting).toBe(false);
    expect(useGithubStore.getState().deviceCode).toBeNull();
    expect(getFeedback()).toHaveLength(1);
    expect(getFeedback()[0].message).toBe('Failed to connect to GitHub: network down');
  });

  it('cancel() aborts the signal passed to pollForDeviceToken and produces no feedback', async () => {
    (requestDeviceCode as ReturnType<typeof vi.fn>).mockResolvedValue(DEVICE_CODE_INFO);

    let capturedSignal: AbortSignal | undefined;
    (pollForDeviceToken as ReturnType<typeof vi.fn>).mockImplementation(
      (_clientId: string, _deviceCode: string, _interval: number, _tokenEndpoint: string, signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          capturedSignal = signal;
          signal.addEventListener('abort', () => {
            reject(new GithubOAuthError('cancelled', 'GitHub sign-in was cancelled.'));
          });
        })
    );

    const { result } = renderHook(() => useGithubConnect());

    let connectPromise!: Promise<void>;
    await act(async () => {
      connectPromise = result.current.connect();
      // Flush microtasks so requestDeviceCode's mocked promise resolves and
      // execution reaches the pollForDeviceToken call - fake timers (active
      // for this whole suite) only affect macrotasks like setTimeout, not
      // native Promise scheduling, so this doesn't need real timers.
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(capturedSignal).toBeDefined();
    expect(capturedSignal!.aborted).toBe(false);

    await act(async () => {
      result.current.cancel();
      await connectPromise;
    });

    expect(capturedSignal!.aborted).toBe(true);
    expect(getFeedback()).toHaveLength(0);
    expect(useGithubStore.getState().isConnecting).toBe(false);
    expect(useGithubStore.getState().deviceCode).toBeNull();
    expect(useGithubStore.getState().accessToken).toBeNull();
  });
});
