import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { requestDeviceCode, pollForDeviceToken, refreshAccessToken, GithubOAuthError } from './oauth';

const DEVICE_CODE_ENDPOINT = 'https://relay.example.com/device/code';
const TOKEN_ENDPOINT = 'https://relay.example.com/device/token';

function mockJsonResponse(body: unknown, ok = true, status = ok ? 200 : 400) {
  return { ok, status, json: async () => body };
}

describe('requestDeviceCode', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts client_id and scope to the relay endpoint and maps the response to camelCase', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonResponse({
        device_code: 'dc-1',
        user_code: 'ABCD-1234',
        verification_uri: 'https://github.com/login/device',
        expires_in: 900,
        interval: 5,
      })
    );

    const info = await requestDeviceCode('client-1', DEVICE_CODE_ENDPOINT);

    expect(fetch).toHaveBeenCalledWith(
      DEVICE_CODE_ENDPOINT,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ client_id: 'client-1', scope: 'repo' }),
      })
    );
    expect(info).toEqual({
      deviceCode: 'dc-1',
      userCode: 'ABCD-1234',
      verificationUri: 'https://github.com/login/device',
      expiresIn: 900,
      interval: 5,
    });
  });

  it('defaults expiresIn/interval when the relay response omits them', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonResponse({
        device_code: 'dc-1',
        user_code: 'ABCD-1234',
        verification_uri: 'https://github.com/login/device',
      })
    );

    const info = await requestDeviceCode('client-1', DEVICE_CODE_ENDPOINT);
    expect(info.expiresIn).toBe(900);
    expect(info.interval).toBe(5);
  });

  it('throws a request-failed GithubOAuthError with GitHub error_description on failure', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonResponse({ error: 'bad_verification_code', error_description: 'invalid client_id' }, false)
    );

    await expect(requestDeviceCode('bad-client', DEVICE_CODE_ENDPOINT)).rejects.toMatchObject({
      reason: 'request-failed',
      message: 'invalid client_id',
    });
  });

  it('falls back to a generic status-based message when the error body is unparseable', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error('not json');
      },
    });

    await expect(requestDeviceCode('client-1', DEVICE_CODE_ENDPOINT)).rejects.toMatchObject({
      reason: 'request-failed',
      message: expect.stringContaining('502'),
    });
  });
});

describe('pollForDeviceToken', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('polls at the given interval and resolves once GitHub returns an access_token', async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(mockJsonResponse({ error: 'authorization_pending' }))
      .mockResolvedValueOnce(mockJsonResponse({ access_token: 'tok-1', token_type: 'bearer', scope: 'repo' }));

    const controller = new AbortController();
    const resultPromise = pollForDeviceToken('client-1', 'dc-1', 5, TOKEN_ENDPOINT, controller.signal);

    await vi.advanceTimersByTimeAsync(5000);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      TOKEN_ENDPOINT,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          client_id: 'client-1',
          device_code: 'dc-1',
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }),
      })
    );

    await vi.advanceTimersByTimeAsync(5000);
    await expect(resultPromise).resolves.toEqual({
      accessToken: 'tok-1',
      refreshToken: undefined,
      expiresIn: undefined,
      refreshTokenExpiresIn: undefined,
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('passes through refresh_token/expires_in/refresh_token_expires_in when GitHub (a GitHub App with expiring tokens) includes them', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonResponse({
        access_token: 'tok-1',
        refresh_token: 'refresh-1',
        expires_in: 28800,
        refresh_token_expires_in: 15897600,
      })
    );

    const controller = new AbortController();
    const resultPromise = pollForDeviceToken('client-1', 'dc-1', 5, TOKEN_ENDPOINT, controller.signal);
    await vi.advanceTimersByTimeAsync(5000);

    await expect(resultPromise).resolves.toEqual({
      accessToken: 'tok-1',
      refreshToken: 'refresh-1',
      expiresIn: 28800,
      refreshTokenExpiresIn: 15897600,
    });
  });

  it('applies the slow_down backoff (adds 5s) before the next poll', async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(mockJsonResponse({ error: 'slow_down' }))
      .mockResolvedValueOnce(mockJsonResponse({ access_token: 'tok-1' }));

    const controller = new AbortController();
    const resultPromise = pollForDeviceToken('client-1', 'dc-1', 5, TOKEN_ENDPOINT, controller.signal);

    await vi.advanceTimersByTimeAsync(5000);
    expect(fetch).toHaveBeenCalledTimes(1);

    // Interval should now be 10s (5 + 5 backoff), not 5s - advancing only the
    // original 5s must NOT trigger a second poll yet.
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5000);
    expect(fetch).toHaveBeenCalledTimes(2);
    await expect(resultPromise).resolves.toEqual({ accessToken: 'tok-1' });
  });

  it('throws reason "expired" on expired_token', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockJsonResponse({ error: 'expired_token' }));
    const controller = new AbortController();
    const resultPromise = pollForDeviceToken('client-1', 'dc-1', 5, TOKEN_ENDPOINT, controller.signal);
    const assertion = expect(resultPromise).rejects.toMatchObject({ reason: 'expired' });
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;
  });

  it('throws reason "access-denied" on access_denied', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockJsonResponse({ error: 'access_denied' }));
    const controller = new AbortController();
    const resultPromise = pollForDeviceToken('client-1', 'dc-1', 5, TOKEN_ENDPOINT, controller.signal);
    const assertion = expect(resultPromise).rejects.toMatchObject({ reason: 'access-denied' });
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;
  });

  it('throws reason "device-flow-disabled" on device_flow_disabled', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockJsonResponse({ error: 'device_flow_disabled' }));
    const controller = new AbortController();
    const resultPromise = pollForDeviceToken('client-1', 'dc-1', 5, TOKEN_ENDPOINT, controller.signal);
    const assertion = expect(resultPromise).rejects.toMatchObject({ reason: 'device-flow-disabled' });
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;
  });

  it('throws reason "request-failed" for an unrecognized error/status', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockJsonResponse({ error: 'incorrect_device_code' }, false));
    const controller = new AbortController();
    const resultPromise = pollForDeviceToken('client-1', 'dc-1', 5, TOKEN_ENDPOINT, controller.signal);
    const assertion = expect(resultPromise).rejects.toMatchObject({ reason: 'request-failed' });
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;
  });

  it('resolves to cancelled immediately if the signal is already aborted, without ever calling fetch', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      pollForDeviceToken('client-1', 'dc-1', 5, TOKEN_ENDPOINT, controller.signal)
    ).rejects.toMatchObject({ reason: 'cancelled' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects with cancelled if the signal aborts while a poll request is in flight', async () => {
    let resolveFetch!: (value: unknown) => void;
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise(resolve => {
        resolveFetch = resolve;
      })
    );

    const controller = new AbortController();
    const resultPromise = pollForDeviceToken('client-1', 'dc-1', 5, TOKEN_ENDPOINT, controller.signal);

    await vi.advanceTimersByTimeAsync(5000);
    expect(fetch).toHaveBeenCalledTimes(1);

    controller.abort();
    resolveFetch(mockJsonResponse({ access_token: 'tok-1' }));

    await expect(resultPromise).rejects.toMatchObject({ reason: 'cancelled' });
  });

  it('is an instance of GithubOAuthError with a .reason field on every rejection', async () => {
    const controller = new AbortController();
    controller.abort();
    try {
      await pollForDeviceToken('client-1', 'dc-1', 5, TOKEN_ENDPOINT, controller.signal);
      throw new Error('expected pollForDeviceToken to reject');
    } catch (err) {
      expect(err).toBeInstanceOf(GithubOAuthError);
      expect((err as GithubOAuthError).reason).toBe('cancelled');
    }
  });
});

describe('refreshAccessToken', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts client_id/refresh_token/grant_type to the relay endpoint and maps the response', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonResponse({
        access_token: 'tok-2',
        refresh_token: 'refresh-2',
        expires_in: 28800,
        refresh_token_expires_in: 15897600,
      })
    );

    const tokens = await refreshAccessToken('client-1', 'refresh-1', TOKEN_ENDPOINT);

    expect(fetch).toHaveBeenCalledWith(
      TOKEN_ENDPOINT,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          client_id: 'client-1',
          refresh_token: 'refresh-1',
          grant_type: 'refresh_token',
        }),
      })
    );
    expect(tokens).toEqual({
      accessToken: 'tok-2',
      refreshToken: 'refresh-2',
      expiresIn: 28800,
      refreshTokenExpiresIn: 15897600,
    });
  });

  it('throws a request-failed GithubOAuthError with GitHub error_description when the refresh token is rejected', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonResponse({ error: 'bad_refresh_token', error_description: 'The refresh token expired' }, false)
    );

    await expect(refreshAccessToken('client-1', 'stale-refresh', TOKEN_ENDPOINT)).rejects.toMatchObject({
      reason: 'request-failed',
      message: 'The refresh token expired',
    });
  });

  it('falls back to a generic status-based message when the error body is unparseable', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error('not json');
      },
    });

    await expect(refreshAccessToken('client-1', 'refresh-1', TOKEN_ENDPOINT)).rejects.toMatchObject({
      reason: 'request-failed',
      message: expect.stringContaining('502'),
    });
  });
});
