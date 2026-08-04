/**
 * GitHub OAuth Device Flow.
 *
 * This editor is deployed in contexts where a fixed OAuth "redirect_uri"
 * doesn't work: e.g. embedded per-device inside LoopControl, where every
 * installation is reached at its own local IP/hostname, and a classic OAuth
 * App only supports registering a single callback URL. Device Flow needs no
 * redirect_uri at all - the user is shown a short code and opens
 * github.com/login/device (in any browser, on any device) to enter it, while
 * this app polls in the background until they do. It also needs no
 * `client_secret` (confirmed against GitHub's own docs), unlike the
 * Authorization Code Flow this replaced.
 *
 * GitHub's device-flow endpoints (`github.com/login/device/code` and
 * `github.com/login/oauth/access_token`) don't send CORS headers, so a
 * browser can't call them directly. Both calls are instead relayed through a
 * same-origin backend (the standalone `server/` auth service, or
 * LoopControl's own endpoint) that forwards the request to GitHub and
 * returns its JSON response verbatim - a dumb CORS workaround, not a secret
 * holder.
 */

export interface DeviceCodeInfo {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

/** Distinguishable reasons `requestDeviceCode`/`pollForDeviceToken` can reject with. */
export type GithubOAuthErrorReason =
  | 'access-denied'
  | 'expired'
  | 'cancelled'
  | 'device-flow-disabled'
  | 'request-failed';

/**
 * Error thrown by both device-flow functions. `reason` lets callers
 * distinguish, in particular, "the user (or caller) cancelled" (a normal way
 * to back out - show nothing) from every other failure (show an error
 * toast).
 */
export class GithubOAuthError extends Error {
  reason: GithubOAuthErrorReason;

  constructor(reason: GithubOAuthErrorReason, message: string) {
    super(message);
    this.name = 'GithubOAuthError';
    this.reason = reason;
  }
}

interface DeviceCodeResponseBody {
  device_code?: string;
  user_code?: string;
  verification_uri?: string;
  expires_in?: number;
  interval?: number;
  error?: string;
  error_description?: string;
}

interface DeviceTokenResponseBody {
  access_token?: string;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

async function parseJsonBody(response: Response): Promise<Record<string, unknown>> {
  try {
    return await response.json();
  } catch {
    // Non-JSON or empty body - callers fall back to a generic, status-based
    // message rather than letting the parse failure itself throw.
    return {};
  }
}

/**
 * Requests a device code + user code from GitHub (relayed through
 * `deviceCodeEndpoint`, a same-origin endpoint that forwards to
 * `github.com/login/device/code`).
 */
export async function requestDeviceCode(
  clientId: string,
  deviceCodeEndpoint: string
): Promise<DeviceCodeInfo> {
  const response = await fetch(deviceCodeEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, scope: 'repo' }),
  });

  const body = (await parseJsonBody(response)) as DeviceCodeResponseBody;

  if (!response.ok || body.error || !body.device_code || !body.user_code || !body.verification_uri) {
    throw new GithubOAuthError(
      'request-failed',
      body.error_description || body.error || `Failed to start GitHub sign-in (status ${response.status}).`
    );
  }

  return {
    deviceCode: body.device_code,
    userCode: body.user_code,
    verificationUri: body.verification_uri,
    expiresIn: body.expires_in ?? 900,
    interval: body.interval ?? 5,
  };
}

/** Resolves after `ms`, or immediately if `signal` aborts first. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timeoutId = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timeoutId);
        resolve();
      },
      { once: true }
    );
  });
}

/**
 * Polls the token endpoint (relayed through `tokenEndpoint`, a same-origin
 * endpoint that forwards to `github.com/login/oauth/access_token`) until the
 * user completes device authorization on GitHub, the device code expires,
 * they deny access, or `signal` aborts.
 */
export async function pollForDeviceToken(
  clientId: string,
  deviceCode: string,
  initialIntervalSeconds: number,
  tokenEndpoint: string,
  signal: AbortSignal
): Promise<{ accessToken: string }> {
  let intervalSeconds = initialIntervalSeconds;

  for (;;) {
    await sleep(intervalSeconds * 1000, signal);
    if (signal.aborted) {
      throw new GithubOAuthError('cancelled', 'GitHub sign-in was cancelled.');
    }

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    });

    const body = (await parseJsonBody(response)) as DeviceTokenResponseBody;

    if (signal.aborted) {
      throw new GithubOAuthError('cancelled', 'GitHub sign-in was cancelled.');
    }

    if (body.access_token) {
      return { accessToken: body.access_token };
    }

    switch (body.error) {
      case 'authorization_pending':
        continue;
      case 'slow_down':
        // GitHub's documented backoff: add 5s to the polling interval.
        intervalSeconds += 5;
        continue;
      case 'expired_token':
        throw new GithubOAuthError(
          'expired',
          'The GitHub sign-in code expired before it was used. Please try again.'
        );
      case 'access_denied':
        throw new GithubOAuthError('access-denied', 'GitHub sign-in was denied.');
      case 'device_flow_disabled':
        throw new GithubOAuthError(
          'device-flow-disabled',
          'Device flow is not enabled for this GitHub OAuth App.'
        );
      default:
        throw new GithubOAuthError(
          'request-failed',
          body.error_description || body.error || `GitHub sign-in failed (status ${response.status}).`
        );
    }
  }
}
