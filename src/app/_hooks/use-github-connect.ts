'use client';

import { useCallback, useRef } from 'react';
import { useGithubStore } from '@/stores/github-store';
import { useHostAPIStore } from '@/stores/host-api-store';
import { requestDeviceCode, pollForDeviceToken, GithubOAuthError } from '@/lib/github/oauth';
import { getAuthenticatedUser } from '@/lib/github/api';

/**
 * Orchestrates the "Connect to GitHub" flow using OAuth Device Flow:
 * requests a device code, surfaces the user code + verification URL to the
 * UI via `useGithubStore`'s `deviceCode` field, polls for the resulting
 * access token, fetches the authenticated user, and stores both. Exposes
 * `cancel()` so the UI can offer a way to abandon an in-progress sign-in
 * (e.g. the user closes the panel while waiting).
 */
export function useGithubConnect() {
  const { setConnecting, setAuth, setDeviceCode } = useGithubStore();
  const { showFeedback } = useHostAPIStore();
  const abortControllerRef = useRef<AbortController | null>(null);

  const connect = useCallback(async () => {
    const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID;
    const deviceCodeEndpoint = process.env.NEXT_PUBLIC_GITHUB_DEVICE_CODE_ENDPOINT;
    const tokenEndpoint = process.env.NEXT_PUBLIC_GITHUB_DEVICE_TOKEN_ENDPOINT;

    if (!clientId || !deviceCodeEndpoint || !tokenEndpoint) {
      showFeedback(
        'GitHub integration is not configured — missing NEXT_PUBLIC_GITHUB_CLIENT_ID/NEXT_PUBLIC_GITHUB_DEVICE_CODE_ENDPOINT/NEXT_PUBLIC_GITHUB_DEVICE_TOKEN_ENDPOINT',
        'error'
      );
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setConnecting(true);
    try {
      const deviceInfo = await requestDeviceCode(clientId, deviceCodeEndpoint);
      setDeviceCode({ userCode: deviceInfo.userCode, verificationUri: deviceInfo.verificationUri });

      const { accessToken } = await pollForDeviceToken(
        clientId,
        deviceInfo.deviceCode,
        deviceInfo.interval,
        tokenEndpoint,
        controller.signal
      );

      const user = await getAuthenticatedUser(accessToken);
      setAuth(accessToken, user);
    } catch (err) {
      if (err instanceof GithubOAuthError) {
        // 'cancelled' is a normal, user-initiated way to back out - show
        // nothing, matching every other cancel-shaped path in this feature.
        if (err.reason !== 'cancelled') {
          showFeedback(err.message, 'error');
        }
        return;
      }

      const message = err instanceof Error ? err.message : String(err);
      showFeedback(`Failed to connect to GitHub: ${message}`, 'error');
    } finally {
      setConnecting(false);
      setDeviceCode(null);
      abortControllerRef.current = null;
    }
  }, [setConnecting, setAuth, setDeviceCode, showFeedback]);

  /** Abandons an in-progress sign-in (device code requested and/or polling underway). */
  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  return { connect, cancel };
}
