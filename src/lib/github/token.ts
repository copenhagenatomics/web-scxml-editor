import { useGithubStore } from '@/stores/github-store';
import { refreshAccessToken } from './oauth';

// Refresh a bit before the token actually expires, so a request started
// just under the deadline doesn't race the expiry.
const REFRESH_SKEW_MS = 60_000;

/**
 * Returns a token safe to use for the next API call, transparently
 * refreshing it first if it's at/near expiry. Every direct GitHub REST call
 * site should read its token through this instead of `accessToken` off the
 * store directly.
 *
 * - `tokenExpiresAt === null` (non-expiring config) -> returns `accessToken` unchanged.
 * - Refresh token itself expired -> signs the user out (`clearAuth()`) and returns `null`,
 *   same as a 401 from GitHub itself would be handled by callers.
 * - Otherwise refreshes via the same relay endpoint the device-flow poll uses.
 */
export async function getValidAccessToken(): Promise<string | null> {
  const { accessToken, refreshToken, tokenExpiresAt, refreshTokenExpiresAt, clearAuth, updateTokens } =
    useGithubStore.getState();

  if (!accessToken) return null;
  if (tokenExpiresAt === null) return accessToken;
  if (Date.now() < tokenExpiresAt - REFRESH_SKEW_MS) return accessToken;

  if (!refreshToken || (refreshTokenExpiresAt !== null && Date.now() >= refreshTokenExpiresAt)) {
    clearAuth();
    return null;
  }

  const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID;
  const tokenEndpoint = process.env.NEXT_PUBLIC_GITHUB_DEVICE_TOKEN_ENDPOINT;
  if (!clientId || !tokenEndpoint) return accessToken;

  try {
    const tokens = await refreshAccessToken(clientId, refreshToken, tokenEndpoint);
    updateTokens(tokens.accessToken, tokens.refreshToken, tokens.expiresIn, tokens.refreshTokenExpiresIn);
    return tokens.accessToken;
  } catch {
    // The refresh token was rejected (revoked, or GitHub-side expiry disagrees
    // with our locally-tracked deadline) - treat exactly like an expired
    // refresh token: sign out and let the caller prompt to reconnect.
    clearAuth();
    return null;
  }
}
