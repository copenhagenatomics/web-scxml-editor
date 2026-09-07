import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { GithubPanel } from './github-panel';
import { useGithubStore, type GithubUser, type GithubLinkedRepo } from '@/stores/github-store';
import { useHostAPIStore } from '@/stores/host-api-store';
import { useEditorStore } from '@/stores/editor-store';
import { GithubApiError } from '@/lib/github/types';

vi.mock('@/lib/github/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/github/api')>();
  return {
    ...actual,
    listInstalledRepos: vi.fn(),
    listBranches: vi.fn(),
    getFileContent: vi.fn(),
    createOrUpdateFile: vi.fn(),
  };
});

const mockConnect = vi.fn();
const mockCancel = vi.fn();
vi.mock('@/app/_hooks/use-github-connect', () => ({
  useGithubConnect: () => ({ connect: mockConnect, cancel: mockCancel }),
}));

const mockPull = vi.fn();
vi.mock('@/app/_hooks/use-github-pull', () => ({
  useGithubPull: () => ({ pull: mockPull }),
}));

import {
  listInstalledRepos,
  listBranches,
  getFileContent,
  createOrUpdateFile,
} from '@/lib/github/api';

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

function noop() {}

describe('GithubPanel', () => {
  beforeEach(() => {
    (listInstalledRepos as ReturnType<typeof vi.fn>).mockResolvedValue({ repos: [], hasInstallation: true });
    (listBranches as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (getFileContent as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (createOrUpdateFile as ReturnType<typeof vi.fn>).mockResolvedValue('newsha');
    mockConnect.mockReset();
    mockCancel.mockReset();
    mockPull.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.resetAllMocks();
    resetGithubStore();
    useHostAPIStore.setState({ feedbackQueue: [] });
    useEditorStore.getState().reset();
  });

  function getFeedback() {
    return useHostAPIStore.getState().feedbackQueue;
  }

  describe('disconnected state', () => {
    it('renders the Connect to GitHub button and calls connect() on click', () => {
      render(<GithubPanel isVisible onClose={noop} />);

      expect(screen.getByText(/connect this scxml file/i)).toBeInTheDocument();
      const btn = screen.getByRole('button', { name: /connect to github/i });
      fireEvent.click(btn);

      expect(mockConnect).toHaveBeenCalledTimes(1);
    });

    it('does not render when isVisible is false', () => {
      const { container } = render(<GithubPanel isVisible={false} onClose={noop} />);
      expect(container).toBeEmptyDOMElement();
    });

    it('shows a "starting sign-in" state while isConnecting is true but no device code has arrived yet', () => {
      useGithubStore.setState({ isConnecting: true });
      render(<GithubPanel isVisible onClose={noop} />);

      expect(screen.getByText(/starting github sign-in/i)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /connect to github/i })).not.toBeInTheDocument();
    });

    it('shows the device user code and verification link once the device code arrives, and Cancel calls cancel()', () => {
      useGithubStore.setState({
        isConnecting: true,
        deviceCode: { userCode: 'ABCD-1234', verificationUri: 'https://github.com/login/device' },
      });
      render(<GithubPanel isVisible onClose={noop} />);

      expect(screen.getByText('ABCD-1234')).toBeInTheDocument();
      const link = screen.getByRole('link', { name: /github\.com\/login\/device/i });
      expect(link).toHaveAttribute('href', 'https://github.com/login/device');

      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
      expect(mockCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe('connected, not linked', () => {
    beforeEach(() => {
      useGithubStore.getState().setAuth('tok-1', testUser);
    });

    it('shows the header (avatar/login/sign out) and loads the repo list', async () => {
      (listInstalledRepos as ReturnType<typeof vi.fn>).mockResolvedValue({
        hasInstallation: true,
        repos: [
          { owner: 'octocat', name: 'hello-world', fullName: 'octocat/hello-world', defaultBranch: 'main', private: false },
          { owner: 'octocat', name: 'other-repo', fullName: 'octocat/other-repo', defaultBranch: 'develop', private: true },
        ],
      });

      render(<GithubPanel isVisible onClose={noop} />);

      expect(screen.getByText('octocat')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();

      await waitFor(() => expect(listInstalledRepos).toHaveBeenCalledWith('tok-1'));

      // Open the repo picker and confirm both repos are offered as options.
      fireEvent.click(await screen.findByText('Select a repository…'));
      expect(await screen.findByText('octocat/hello-world')).toBeInTheDocument();
      expect(screen.getByText('octocat/other-repo')).toBeInTheDocument();
    });

    it('sign out calls clearAuth()', () => {
      render(<GithubPanel isVisible onClose={noop} />);
      fireEvent.click(screen.getByRole('button', { name: /sign out/i }));
      expect(useGithubStore.getState().accessToken).toBeNull();
    });

    it('selecting a repo loads branches, and confirming an existing path shows the "exists" note', async () => {
      (listInstalledRepos as ReturnType<typeof vi.fn>).mockResolvedValue({
        hasInstallation: true,
        repos: [
          { owner: 'octocat', name: 'hello-world', fullName: 'octocat/hello-world', defaultBranch: 'main', private: false },
        ],
      });
      (listBranches as ReturnType<typeof vi.fn>).mockResolvedValue([{ name: 'main' }, { name: 'dev' }]);
      (getFileContent as ReturnType<typeof vi.fn>).mockResolvedValue({ content: '<scxml/>', sha: 'file-sha-1' });

      render(<GithubPanel isVisible onClose={noop} />);
      await waitFor(() => expect(listInstalledRepos).toHaveBeenCalled());

      fireEvent.click(await screen.findByText('Select a repository…'));
      fireEvent.click(await screen.findByText('octocat/hello-world'));

      await waitFor(() => expect(listBranches).toHaveBeenCalledWith('tok-1', 'octocat', 'hello-world'));
      // Defaults to the repo's default branch once branches load.
      await screen.findByText('main');

      const pathInput = screen.getByPlaceholderText('flows/main.scxml');
      fireEvent.change(pathInput, { target: { value: 'flows/main.scxml' } });
      fireEvent.blur(pathInput);

      await waitFor(() =>
        expect(getFileContent).toHaveBeenCalledWith('tok-1', 'octocat', 'hello-world', 'main', 'flows/main.scxml')
      );
      expect(await screen.findByText(/existing file found/i)).toBeInTheDocument();

      const linkBtn = screen.getByRole('button', { name: /^link$/i });
      expect(linkBtn).not.toBeDisabled();
      fireEvent.click(linkBtn);

      expect(useGithubStore.getState().linkedRepo).toEqual({
        owner: 'octocat',
        repo: 'hello-world',
        branch: 'main',
        path: 'flows/main.scxml',
        lastKnownSha: 'file-sha-1',
      });
    });

    it('shows the "will create" note when the path does not exist (404 -> null)', async () => {
      (listInstalledRepos as ReturnType<typeof vi.fn>).mockResolvedValue({
        hasInstallation: true,
        repos: [
          { owner: 'octocat', name: 'hello-world', fullName: 'octocat/hello-world', defaultBranch: 'main', private: false },
        ],
      });
      (listBranches as ReturnType<typeof vi.fn>).mockResolvedValue([{ name: 'main' }]);
      (getFileContent as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      render(<GithubPanel isVisible onClose={noop} />);
      await waitFor(() => expect(listInstalledRepos).toHaveBeenCalled());

      fireEvent.click(await screen.findByText('Select a repository…'));
      fireEvent.click(await screen.findByText('octocat/hello-world'));
      await waitFor(() => expect(listBranches).toHaveBeenCalled());
      await screen.findByText('main');

      const pathInput = screen.getByPlaceholderText('flows/main.scxml');
      fireEvent.change(pathInput, { target: { value: 'flows/new.scxml' } });
      fireEvent.blur(pathInput);

      expect(await screen.findByText(/doesn't exist yet/i)).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /^link$/i }));
      expect(useGithubStore.getState().linkedRepo).toEqual({
        owner: 'octocat',
        repo: 'hello-world',
        branch: 'main',
        path: 'flows/new.scxml',
        lastKnownSha: null,
      });
    });

    it('Link stays disabled until the existence check for the current path resolves - no linking with a stale/unchecked sha', async () => {
      (listInstalledRepos as ReturnType<typeof vi.fn>).mockResolvedValue({
        hasInstallation: true,
        repos: [
          { owner: 'octocat', name: 'hello-world', fullName: 'octocat/hello-world', defaultBranch: 'main', private: false },
        ],
      });
      (listBranches as ReturnType<typeof vi.fn>).mockResolvedValue([{ name: 'main' }]);

      // Keep getFileContent pending so we can observe the state while the
      // check is still in flight (simulating clicking Link immediately
      // after typing/blurring, before the async check resolves).
      let resolveFileContent!: (value: { content: string; sha: string } | null) => void;
      (getFileContent as ReturnType<typeof vi.fn>).mockReturnValue(
        new Promise(resolve => {
          resolveFileContent = resolve;
        })
      );

      render(<GithubPanel isVisible onClose={noop} />);
      await waitFor(() => expect(listInstalledRepos).toHaveBeenCalled());

      fireEvent.click(await screen.findByText('Select a repository…'));
      fireEvent.click(await screen.findByText('octocat/hello-world'));
      await waitFor(() => expect(listBranches).toHaveBeenCalled());
      await screen.findByText('main');

      // Before ever touching the path field, Link is disabled (empty path).
      expect(screen.getByRole('button', { name: /^link$/i })).toBeDisabled();

      const pathInput = screen.getByPlaceholderText('flows/main.scxml');
      fireEvent.change(pathInput, { target: { value: 'flows/main.scxml' } });
      fireEvent.blur(pathInput);

      await waitFor(() => expect(getFileContent).toHaveBeenCalled());

      // The check is still pending - Link must remain disabled (and a
      // click, even if it somehow fired, must not link anything) rather
      // than being clickable with whatever stale lastKnownSha happened to
      // be in state.
      const linkBtn = screen.getByRole('button', { name: /^link$/i });
      expect(linkBtn).toBeDisabled();
      fireEvent.click(linkBtn);
      expect(useGithubStore.getState().linkedRepo).toBeNull();

      // Once the check resolves, Link becomes enabled and links with the
      // sha the check actually found - never a stale/null placeholder.
      resolveFileContent({ content: '<scxml/>', sha: 'real-sha-999' });
      await waitFor(() => expect(linkBtn).not.toBeDisabled());

      fireEvent.click(linkBtn);
      expect(useGithubStore.getState().linkedRepo).toEqual({
        owner: 'octocat',
        repo: 'hello-world',
        branch: 'main',
        path: 'flows/main.scxml',
        lastKnownSha: 'real-sha-999',
      });
    });

    it('401 while loading repos clears auth and shows the reconnect message', async () => {
      (listInstalledRepos as ReturnType<typeof vi.fn>).mockRejectedValue(new GithubApiError(401, 'Bad credentials'));

      render(<GithubPanel isVisible onClose={noop} />);

      await waitFor(() => expect(useGithubStore.getState().accessToken).toBeNull());
      const feedback = getFeedback();
      expect(feedback.some(f => f.message.includes('expired or was revoked'))).toBe(true);
    });

    it('shows an install prompt (not the repo picker) when the account has no installation, and refresh re-fetches', async () => {
      vi.stubEnv('NEXT_PUBLIC_GITHUB_INSTALL_URL', 'https://github.com/apps/scxml-editor/installations/new');
      (listInstalledRepos as ReturnType<typeof vi.fn>).mockResolvedValue({ hasInstallation: false, repos: [] });

      render(<GithubPanel isVisible onClose={noop} />);
      await waitFor(() => expect(listInstalledRepos).toHaveBeenCalledTimes(1));

      expect(screen.queryByText('Select a repository…')).not.toBeInTheDocument();
      const installLink = screen.getByRole('button', { name: /install on github/i });
      expect(installLink).toBeInTheDocument();

      (listInstalledRepos as ReturnType<typeof vi.fn>).mockResolvedValue({
        hasInstallation: true,
        repos: [{ owner: 'octocat', name: 'hello-world', fullName: 'octocat/hello-world', defaultBranch: 'main', private: false }],
      });
      fireEvent.click(screen.getByRole('button', { name: /i've installed it/i }));

      await waitFor(() => expect(listInstalledRepos).toHaveBeenCalledTimes(2));
      expect(await screen.findByText('Select a repository…')).toBeInTheDocument();

      vi.unstubAllEnvs();
    });
  });

  describe('connected and linked', () => {
    beforeEach(() => {
      useGithubStore.getState().setAuth('tok-1', testUser);
      useGithubStore.getState().setLinkedRepo(testRepo);
    });

    it('shows the repo/branch/path summary', () => {
      render(<GithubPanel isVisible onClose={noop} />);
      expect(screen.getByText('octocat/hello-world')).toBeInTheDocument();
      expect(screen.getByText('main')).toBeInTheDocument();
      expect(screen.getByText('flows/main.scxml')).toBeInTheDocument();
    });

    it('disconnect calls clearLinkedRepo()', async () => {
      render(<GithubPanel isVisible onClose={noop} />);
      fireEvent.click(screen.getByRole('button', { name: /disconnect/i }));
      expect(useGithubStore.getState().linkedRepo).toBeNull();

      // Disconnecting drops back to "connected, not linked", which kicks off
      // the repo-list fetch effect - wait for it to settle so its state
      // update doesn't land after the test (and this file's `cleanup()` in
      // `afterEach`) as an unwrapped act() warning.
      await waitFor(() => expect(listInstalledRepos).toHaveBeenCalled());
    });

    it('push reads editor content, calls createOrUpdateFile, updates sha, and shows success feedback', async () => {
      useEditorStore.getState().setFileInfo({
        name: 'main.scxml',
        size: 10,
        lastModified: new Date(),
        content: '<scxml>hello</scxml>',
      });
      (createOrUpdateFile as ReturnType<typeof vi.fn>).mockResolvedValue('brand-new-sha');

      render(<GithubPanel isVisible onClose={noop} />);
      fireEvent.click(screen.getByRole('button', { name: /^push$/i }));

      await waitFor(() =>
        expect(createOrUpdateFile).toHaveBeenCalledWith(
          'tok-1',
          'octocat',
          'hello-world',
          'main',
          'flows/main.scxml',
          '<scxml>hello</scxml>',
          expect.stringContaining('main.scxml'),
          'oldsha123'
        )
      );

      await waitFor(() => expect(useGithubStore.getState().linkedRepo?.lastKnownSha).toBe('brand-new-sha'));
      const feedback = getFeedback();
      expect(feedback.some(f => f.message === 'Pushed to GitHub.' && f.level === 'info')).toBe(true);
    });

    it('push falls back to the generated default commit message when left empty', async () => {
      useEditorStore.getState().setFileInfo({
        name: 'main.scxml',
        size: 5,
        lastModified: new Date(),
        content: '<scxml/>',
      });

      render(<GithubPanel isVisible onClose={noop} />);
      fireEvent.click(screen.getByRole('button', { name: /^push$/i }));

      await waitFor(() => expect(createOrUpdateFile).toHaveBeenCalled());
      const call = (createOrUpdateFile as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(call[6]).toBe('Update main.scxml via SCXML Editor');
      expect(call[6]).not.toBe('');
    });

    it('passes undefined (not null) as sha when lastKnownSha is null', async () => {
      useGithubStore.getState().setLinkedRepo({ ...testRepo, lastKnownSha: null });
      useEditorStore.getState().setFileInfo({
        name: 'main.scxml',
        size: 5,
        lastModified: new Date(),
        content: '<scxml/>',
      });

      render(<GithubPanel isVisible onClose={noop} />);
      fireEvent.click(screen.getByRole('button', { name: /^push$/i }));

      await waitFor(() => expect(createOrUpdateFile).toHaveBeenCalled());
      const call = (createOrUpdateFile as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(call[7]).toBeUndefined();
    });

    it('disables Pull and Disconnect while a push is still in flight (isSyncing gates the whole action row, not just Push)', async () => {
      useEditorStore.getState().setFileInfo({
        name: 'main.scxml',
        size: 5,
        lastModified: new Date(),
        content: '<scxml/>',
      });

      let resolvePush!: (sha: string) => void;
      (createOrUpdateFile as ReturnType<typeof vi.fn>).mockReturnValue(
        new Promise(resolve => {
          resolvePush = resolve;
        })
      );

      render(<GithubPanel isVisible onClose={noop} />);

      // Before pushing, Pull/Disconnect are available as normal.
      expect(screen.getByRole('button', { name: /^pull$/i })).not.toBeDisabled();
      expect(screen.getByRole('button', { name: /disconnect/i })).not.toBeDisabled();

      fireEvent.click(screen.getByRole('button', { name: /^push$/i }));
      await waitFor(() => expect(useGithubStore.getState().isSyncing).toBe(true));

      // While the push promise is still pending, Pull and Disconnect must
      // be disabled - otherwise the user could confirm a Pull (or
      // disconnect) concurrently with the in-flight push, and the two
      // isSyncing writes/effects would clobber each other (see the code
      // review that flagged this).
      expect(screen.getByRole('button', { name: /^pull$/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /disconnect/i })).toBeDisabled();

      // A click on the (disabled) Pull button must not open the confirm UI.
      fireEvent.click(screen.getByRole('button', { name: /^pull$/i }));
      expect(screen.queryByText(/replace your current editor content/i)).not.toBeInTheDocument();
      expect(mockPull).not.toHaveBeenCalled();

      resolvePush('resolved-sha');
      await waitFor(() => expect(useGithubStore.getState().isSyncing).toBe(false));

      // Once the push settles, both buttons are re-enabled.
      await waitFor(() => expect(screen.getByRole('button', { name: /^pull$/i })).not.toBeDisabled());
      expect(screen.getByRole('button', { name: /disconnect/i })).not.toBeDisabled();
    });

    it('disables Sign out while a push is in flight (same isSyncing hazard as Pull/Disconnect)', async () => {
      useEditorStore.getState().setFileInfo({
        name: 'main.scxml',
        size: 5,
        lastModified: new Date(),
        content: '<scxml/>',
      });

      let resolvePush!: (sha: string) => void;
      (createOrUpdateFile as ReturnType<typeof vi.fn>).mockReturnValue(
        new Promise(resolve => {
          resolvePush = resolve;
        })
      );

      render(<GithubPanel isVisible onClose={noop} />);

      expect(screen.getByRole('button', { name: /sign out/i })).not.toBeDisabled();

      fireEvent.click(screen.getByRole('button', { name: /^push$/i }));
      await waitFor(() => expect(useGithubStore.getState().isSyncing).toBe(true));

      // Signing out mid-push must not be possible: clearAuth() would wipe
      // accessToken/user/linkedRepo synchronously while the in-flight
      // push's closure still holds its own captured token/repo params and
      // runs to completion regardless, later calling updateLinkedRepoSha
      // on a store the user believes they've signed out of.
      expect(screen.getByRole('button', { name: /sign out/i })).toBeDisabled();
      fireEvent.click(screen.getByRole('button', { name: /sign out/i }));
      expect(useGithubStore.getState().accessToken).not.toBeNull();

      resolvePush('resolved-sha');
      await waitFor(() => expect(useGithubStore.getState().isSyncing).toBe(false));
      expect(screen.getByRole('button', { name: /sign out/i })).not.toBeDisabled();
    });

    it('shows the "pull first" message on a 409 conflict', async () => {
      (createOrUpdateFile as ReturnType<typeof vi.fn>).mockRejectedValue(new GithubApiError(409, 'Conflict'));

      render(<GithubPanel isVisible onClose={noop} />);
      fireEvent.click(screen.getByRole('button', { name: /^push$/i }));

      await waitFor(() =>
        expect(getFeedback().some(f => f.message.includes('pull first'))).toBe(true)
      );
      // A 409 is not an auth failure - must not clear auth/linkedRepo.
      expect(useGithubStore.getState().accessToken).toBe('tok-1');
      expect(useGithubStore.getState().linkedRepo).not.toBeNull();
    });

    it('401 on push clears auth and shows the reconnect message', async () => {
      (createOrUpdateFile as ReturnType<typeof vi.fn>).mockRejectedValue(new GithubApiError(401, 'Bad credentials'));

      render(<GithubPanel isVisible onClose={noop} />);
      fireEvent.click(screen.getByRole('button', { name: /^push$/i }));

      await waitFor(() => expect(useGithubStore.getState().accessToken).toBeNull());
      expect(getFeedback().some(f => f.message.includes('expired or was revoked'))).toBe(true);
    });

    it('generic push error shows a wrapped error message', async () => {
      (createOrUpdateFile as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network down'));

      render(<GithubPanel isVisible onClose={noop} />);
      fireEvent.click(screen.getByRole('button', { name: /^push$/i }));

      await waitFor(() =>
        expect(getFeedback().some(f => f.message === 'Failed to push to GitHub: network down')).toBe(true)
      );
    });

    it('pull shows an inline confirmation first and does not call pull() before confirming', () => {
      render(<GithubPanel isVisible onClose={noop} />);
      fireEvent.click(screen.getByRole('button', { name: /^pull$/i }));

      expect(mockPull).not.toHaveBeenCalled();
      expect(screen.getByText(/replace your current editor content/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /confirm/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });

    it('pull calls pull() only after confirming', async () => {
      render(<GithubPanel isVisible onClose={noop} />);
      fireEvent.click(screen.getByRole('button', { name: /^pull$/i }));
      fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

      await waitFor(() => expect(mockPull).toHaveBeenCalledTimes(1));
    });

    it('cancelling the pull confirmation never calls pull()', () => {
      render(<GithubPanel isVisible onClose={noop} />);
      fireEvent.click(screen.getByRole('button', { name: /^pull$/i }));
      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

      expect(mockPull).not.toHaveBeenCalled();
      expect(screen.queryByText(/replace your current editor content/i)).not.toBeInTheDocument();
    });
  });
});
