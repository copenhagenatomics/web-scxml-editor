import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useGithubPull } from './use-github-pull';
import { useGithubStore, type GithubLinkedRepo, type GithubUser } from '@/stores/github-store';
import { useHostAPIStore } from '@/stores/host-api-store';
import { useEditorStore } from '@/stores/editor-store';
import { HistoryManager } from '@/lib/history/history-manager';
import { GithubApiError } from '@/lib/github/types';

vi.mock('@/lib/github/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/github/api')>();
  return {
    ...actual,
    getFileContent: vi.fn(),
  };
});

// Mocked (with an identity default set in beforeEach below) so most tests
// can assert on the raw fetched content unchanged, while one dedicated test
// overrides the implementations to confirm pull() actually threads content
// through all three in the same order handleFileLoad does.
vi.mock('@/lib/utils/datamodel-extractor', () => ({
  annotateLegacyConfTypes: vi.fn(),
}));

vi.mock('@/lib/utils/transition-merge-utils', () => ({
  mergeDuplicateTransitionsInDocument: vi.fn(),
  mergeDuplicateTransitionsByEventInDocument: vi.fn(),
}));

import { getFileContent } from '@/lib/github/api';
import { annotateLegacyConfTypes } from '@/lib/utils/datamodel-extractor';
import {
  mergeDuplicateTransitionsInDocument,
  mergeDuplicateTransitionsByEventInDocument,
} from '@/lib/utils/transition-merge-utils';

const testUser: GithubUser = { login: 'octocat', avatarUrl: 'https://example.com/a.png' };
const testRepo: GithubLinkedRepo = {
  owner: 'octocat',
  repo: 'hello-world',
  branch: 'main',
  path: 'flows/main.scxml',
  lastKnownSha: 'oldsha123',
};

function resetGithubStore() {
  useGithubStore.setState({
    accessToken: null,
    user: null,
    linkedRepo: null,
    isConnecting: false,
    isSyncing: false,
    error: null,
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
 * "update not wrapped in act" warning - the hook under test fully
 * destructures `useHostAPIStore()` (the established convention in this
 * codebase), so the rendered test component re-renders on that dismiss too.
 */
async function runAndFlush(fn: () => Promise<void>) {
  await act(async () => {
    await fn();
  });
}

describe('useGithubPull', () => {
  beforeEach(() => {
    useGithubStore.getState().setAuth('tok-1', testUser);
    useGithubStore.getState().setLinkedRepo(testRepo);
    vi.useFakeTimers();

    // Identity defaults so every test other than the dedicated
    // "normalization pipeline" test below sees content pass through
    // unchanged, matching what a simple fixture with no legacy conf-types
    // or duplicate transitions would actually do.
    (annotateLegacyConfTypes as ReturnType<typeof vi.fn>).mockImplementation((c: string) => c);
    (mergeDuplicateTransitionsByEventInDocument as ReturnType<typeof vi.fn>).mockImplementation((c: string) => c);
    (mergeDuplicateTransitionsInDocument as ReturnType<typeof vi.fn>).mockImplementation((c: string) => c);
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
    vi.resetAllMocks();
    resetGithubStore();
    useHostAPIStore.setState({ feedbackQueue: [] });
    useEditorStore.getState().reset();
  });

  it('guards defensively when not connected: shows an error and never calls getFileContent', async () => {
    useGithubStore.getState().clearAuth();

    const { result } = renderHook(() => useGithubPull());
    await runAndFlush(() => result.current.pull());

    expect(getFileContent).not.toHaveBeenCalled();
    expect(getFeedback()).toHaveLength(1);
    expect(getFeedback()[0].level).toBe('error');
    expect(useGithubStore.getState().isSyncing).toBe(false);
  });

  it('guards defensively when there is no linked repo', async () => {
    useGithubStore.getState().clearLinkedRepo();

    const { result } = renderHook(() => useGithubPull());
    await runAndFlush(() => result.current.pull());

    expect(getFileContent).not.toHaveBeenCalled();
    expect(getFeedback()).toHaveLength(1);
  });

  it('happy path: applies the pulled content as a full-document replacement and updates the sha', async () => {
    const historyInitSpy = vi.spyOn(HistoryManager.getInstance(), 'initialize');

    // Put the hierarchy navigation somewhere non-root first, so we can
    // observe that pull() genuinely calls navigateToRoot() rather than just
    // happening to already be at root.
    useEditorStore.getState().navigateIntoState('someState');
    expect(useEditorStore.getState().hierarchyState.currentPath).toEqual(['someState']);

    (getFileContent as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: '<scxml>new content</scxml>',
      sha: 'newsha456',
    });

    const { result } = renderHook(() => useGithubPull());
    await runAndFlush(() => result.current.pull());

    expect(getFileContent).toHaveBeenCalledWith('tok-1', 'octocat', 'hello-world', 'main', 'flows/main.scxml');

    const fileInfo = useEditorStore.getState().fileInfo;
    expect(fileInfo).toEqual({
      name: 'main.scxml',
      size: '<scxml>new content</scxml>'.length,
      lastModified: expect.any(Date),
      content: '<scxml>new content</scxml>',
    });
    expect(useEditorStore.getState().content).toBe('<scxml>new content</scxml>');
    expect(useEditorStore.getState().isDirty).toBe(false);

    expect(historyInitSpy).toHaveBeenCalledWith('<scxml>new content</scxml>', 'Pulled from GitHub');
    expect(useEditorStore.getState().hierarchyState.currentPath).toEqual([]);
    expect(useEditorStore.getState().hierarchyState.currentParentId).toBeNull();

    expect(useGithubStore.getState().linkedRepo?.lastKnownSha).toBe('newsha456');
    expect(useGithubStore.getState().isSyncing).toBe(false);

    const feedback = getFeedback();
    expect(feedback).toHaveLength(1);
    expect(feedback[0].level).toBe('info');
    expect(feedback[0].message).toContain('Pulled latest content from GitHub');

    historyInitSpy.mockRestore();
  });

  it('runs fetched content through the same normalization pipeline handleFileLoad uses, in the same order, before applying or storing it', async () => {
    const raw = '<scxml>raw</scxml>';
    (getFileContent as ReturnType<typeof vi.fn>).mockResolvedValue({ content: raw, sha: 'sha-from-github' });

    (annotateLegacyConfTypes as ReturnType<typeof vi.fn>).mockImplementationOnce(
      (c: string) => `${c}<!--annotated-->`
    );
    (mergeDuplicateTransitionsByEventInDocument as ReturnType<typeof vi.fn>).mockImplementationOnce(
      (c: string) => `${c}<!--merged-by-event-->`
    );
    (mergeDuplicateTransitionsInDocument as ReturnType<typeof vi.fn>).mockImplementationOnce(
      (c: string) => `${c}<!--merged-->`
    );

    const historyInitSpy = vi.spyOn(HistoryManager.getInstance(), 'initialize');

    const { result } = renderHook(() => useGithubPull());
    await runAndFlush(() => result.current.pull());

    // Exact chaining order per the spec:
    // mergeDuplicateTransitionsInDocument(mergeDuplicateTransitionsByEventInDocument(annotateLegacyConfTypes(raw)))
    expect(annotateLegacyConfTypes).toHaveBeenCalledWith(raw);
    expect(mergeDuplicateTransitionsByEventInDocument).toHaveBeenCalledWith(`${raw}<!--annotated-->`);
    expect(mergeDuplicateTransitionsInDocument).toHaveBeenCalledWith(
      `${raw}<!--annotated--><!--merged-by-event-->`
    );

    const expected = `${raw}<!--annotated--><!--merged-by-event--><!--merged-->`;

    const fileInfo = useEditorStore.getState().fileInfo;
    expect(fileInfo?.content).toBe(expected);
    expect(fileInfo?.content).not.toBe(raw);
    expect(fileInfo?.size).toBe(expected.length);
    expect(useEditorStore.getState().content).toBe(expected);
    expect(historyInitSpy).toHaveBeenCalledWith(expected, 'Pulled from GitHub');

    // The sha tracked for future pushes must stay coupled to GitHub's raw
    // blob sha, not to any locally-normalized content.
    expect(useGithubStore.getState().linkedRepo?.lastKnownSha).toBe('sha-from-github');

    historyInitSpy.mockRestore();
  });

  it('404/null case: shows an error, does not touch fileInfo or the linked sha', async () => {
    (getFileContent as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const { result } = renderHook(() => useGithubPull());
    await runAndFlush(() => result.current.pull());

    expect(useEditorStore.getState().fileInfo).toBeNull();
    expect(useGithubStore.getState().linkedRepo?.lastKnownSha).toBe('oldsha123');
    expect(useGithubStore.getState().isSyncing).toBe(false);

    const feedback = getFeedback();
    expect(feedback).toHaveLength(1);
    expect(feedback[0].level).toBe('error');
    expect(feedback[0].message).toContain('no longer exists on GitHub');
  });

  it('401 case: clears auth (including linkedRepo) and shows a reconnect message', async () => {
    (getFileContent as ReturnType<typeof vi.fn>).mockRejectedValue(
      new GithubApiError(401, 'Bad credentials')
    );

    const { result } = renderHook(() => useGithubPull());
    await runAndFlush(() => result.current.pull());

    expect(useGithubStore.getState().accessToken).toBeNull();
    expect(useGithubStore.getState().user).toBeNull();
    expect(useGithubStore.getState().linkedRepo).toBeNull();
    expect(useGithubStore.getState().isSyncing).toBe(false);

    const feedback = getFeedback();
    expect(feedback).toHaveLength(1);
    expect(feedback[0].level).toBe('error');
    expect(feedback[0].message).toContain('expired or was revoked');
  });

  it('generic error case: shows a wrapped error message without clearing auth', async () => {
    (getFileContent as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network unreachable'));

    const { result } = renderHook(() => useGithubPull());
    await runAndFlush(() => result.current.pull());

    expect(useGithubStore.getState().accessToken).toBe('tok-1');
    expect(useGithubStore.getState().linkedRepo).toEqual(testRepo);
    expect(useGithubStore.getState().isSyncing).toBe(false);

    const feedback = getFeedback();
    expect(feedback).toHaveLength(1);
    expect(feedback[0].message).toBe('Failed to pull from GitHub: network unreachable');
  });
});
