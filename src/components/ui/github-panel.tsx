'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Panel, Button, Field, Input, inputClass } from '@/components/ui/primitives';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useGithubStore, type GithubUser } from '@/stores/github-store';
import { useHostAPIStore } from '@/stores/host-api-store';
import { useEditorStore } from '@/stores/editor-store';
import { useGithubConnect } from '@/app/_hooks/use-github-connect';
import { useGithubPull } from '@/app/_hooks/use-github-pull';
import {
  listInstalledRepos,
  listBranches,
  getFileContent,
  createOrUpdateFile,
  isUnauthorizedError,
} from '@/lib/github/api';
import { getValidAccessToken } from '@/lib/github/token';
import { GithubApiError, type GithubRepoSummary, type GithubBranchSummary } from '@/lib/github/types';
import { generateDefaultCommitMessage } from '@/lib/github/commit-message';
import type { FeedbackItem } from '@/types/host-api';

interface GithubPanelProps {
  isVisible: boolean;
  onClose: () => void;
}

type ShowFeedback = (message: string, level?: FeedbackItem['level']) => void;

/**
 * Shared 401-handling for the four GitHub REST calls this panel makes
 * directly (repo listing, branch listing, path existence-check, push). A
 * 401 means the token has expired/been revoked - in that case we clear auth
 * (which also drops linkedRepo, matching clearAuth's contract) and prompt to
 * reconnect. Anything else surfaces as a generic, call-site-labeled toast.
 */
function handleGithubError(err: unknown, showFeedback: ShowFeedback, fallbackMessage: string) {
  if (isUnauthorizedError(err)) {
    useGithubStore.getState().clearAuth();
    showFeedback('Your GitHub session has expired or was revoked. Please reconnect.', 'error');
    return;
  }
  const message = err instanceof Error ? err.message : String(err);
  showFeedback(`${fallbackMessage}: ${message}`, 'error');
}

type PathCheckNote = 'exists' | 'create' | null;

function GithubUserHeader({
  user,
  onSignOut,
  disabled,
}: {
  user: GithubUser;
  onSignOut: () => void;
  disabled?: boolean;
}) {
  return (
    <div className='flex items-center gap-2 px-3 py-2 border-b border-default'>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={user.avatarUrl} alt={user.login} className='h-6 w-6 rounded-full shrink-0' />
      <span className='flex-1 text-xs font-medium text-default truncate'>{user.login}</span>
      <Button variant='ghost' size='sm' onClick={onSignOut} disabled={disabled}>
        Sign out
      </Button>
    </div>
  );
}

export function GithubPanel({ isVisible, onClose }: GithubPanelProps) {
  const accessToken = useGithubStore(state => state.accessToken);
  const user = useGithubStore(state => state.user);
  const linkedRepo = useGithubStore(state => state.linkedRepo);
  const isConnecting = useGithubStore(state => state.isConnecting);
  const isSyncing = useGithubStore(state => state.isSyncing);
  const deviceCode = useGithubStore(state => state.deviceCode);
  const showFeedback = useHostAPIStore(state => state.showFeedback);
  const { connect, cancel } = useGithubConnect();
  const { pull } = useGithubPull();

  // --- Repo picker (connected, not linked) ---
  const [repos, setRepos] = useState<GithubRepoSummary[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  // null = not checked yet; false is what drives the "install on GitHub" prompt.
  const [hasInstallation, setHasInstallation] = useState<boolean | null>(null);
  const [selectedFullName, setSelectedFullName] = useState('');
  const selectedRepo = repos.find(r => r.fullName === selectedFullName) ?? null;
  const installUrl = process.env.NEXT_PUBLIC_GITHUB_INSTALL_URL;

  // --- Branch picker ---
  const [branches, setBranches] = useState<GithubBranchSummary[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState('');

  // --- Path + existence check ---
  const [path, setPath] = useState('');
  const [pathChecking, setPathChecking] = useState(false);
  const [pathNote, setPathNote] = useState<PathCheckNote>(null);
  const [lastKnownSha, setLastKnownSha] = useState<string | null>(null);
  // Bumped by resetPathCheck() (and by every checkPath() call) so a
  // still-in-flight checkPath() from a stale repo/branch/path combination
  // can tell its own response is stale and discard it instead of
  // clobbering a newer note/sha (guards a fast blur -> edit -> blur
  // sequence, or a repo/branch change while a check is still pending).
  const pathCheckIdRef = useRef(0);

  // Invalidates whatever the existence check last found. Used whenever
  // repo/branch/path changes in a way that makes the previous check (and
  // any lastKnownSha it produced) no longer apply to the current
  // selection - centralized here so every call site invalidates the same
  // way instead of three separate copies of the same two setState calls
  // (which is exactly how the branch-change path previously ended up
  // missing this).
  function resetPathCheck() {
    pathCheckIdRef.current += 1;
    setPathNote(null);
    setLastKnownSha(null);
  }

  // --- Linked view ---
  const [commitMessage, setCommitMessage] = useState('');
  const [pullConfirming, setPullConfirming] = useState(false);

  // Fetch the repos this GitHub App installation grants access to, once
  // we're connected-but-not-linked and visible. Also re-run on demand via
  // the "I've installed it" refresh button in the install-prompt state.
  const fetchRepos = useCallback(async () => {
    setReposLoading(true);
    try {
      const token = await getValidAccessToken();
      if (!token) return;
      const { repos: list, hasInstallation: installed } = await listInstalledRepos(token);
      setRepos(list);
      setHasInstallation(installed);
    } catch (err) {
      handleGithubError(err, showFeedback, 'Failed to load repositories');
    } finally {
      setReposLoading(false);
    }
  }, [showFeedback]);

  useEffect(() => {
    if (!isVisible || !accessToken || linkedRepo) return;
    void fetchRepos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible, accessToken, linkedRepo]);

  // Fetch branches whenever the selected repo changes.
  useEffect(() => {
    if (!accessToken || !selectedRepo) {
      setBranches([]);
      return;
    }
    let cancelled = false;
    setBranchesLoading(true);
    (async () => {
      const token = await getValidAccessToken();
      if (!token || cancelled) return;
      return listBranches(token, selectedRepo.owner, selectedRepo.name);
    })()
      .then(list => {
        if (cancelled || !list) return;
        setBranches(list);
        setSelectedBranch(prev => {
          if (prev && list.some(b => b.name === prev)) return prev;
          if (list.some(b => b.name === selectedRepo.defaultBranch)) return selectedRepo.defaultBranch;
          return '';
        });
      })
      .catch(err => {
        if (!cancelled) handleGithubError(err, showFeedback, 'Failed to load branches');
      })
      .finally(() => {
        if (!cancelled) setBranchesLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, selectedRepo?.fullName, showFeedback]);

  async function checkPath() {
    const trimmedPath = path.trim();
    const requestId = (pathCheckIdRef.current += 1);
    if (!accessToken || !selectedRepo || !selectedBranch || !trimmedPath) {
      setPathNote(null);
      setLastKnownSha(null);
      return;
    }
    setPathChecking(true);
    try {
      const token = await getValidAccessToken();
      if (!token) return;
      const file = await getFileContent(token, selectedRepo.owner, selectedRepo.name, selectedBranch, trimmedPath);
      // A newer check (or a repo/branch/path change via resetPathCheck())
      // superseded this one while it was in flight - discard this result
      // rather than clobbering the newer/current state.
      if (pathCheckIdRef.current !== requestId) return;
      if (file) {
        setLastKnownSha(file.sha);
        setPathNote('exists');
      } else {
        setLastKnownSha(null);
        setPathNote('create');
      }
    } catch (err) {
      if (pathCheckIdRef.current !== requestId) return;
      // Path existence-checking is a nicety, not a hard gate - don't block
      // linking on a failure unrelated to auth (e.g. a transient network
      // error). A 401 still clears auth via the shared helper.
      handleGithubError(err, showFeedback, 'Failed to check the file path');
    } finally {
      if (pathCheckIdRef.current === requestId) setPathChecking(false);
    }
  }

  function handleLink() {
    if (!canLink || !selectedRepo || !selectedBranch) return;
    useGithubStore.getState().setLinkedRepo({
      owner: selectedRepo.owner,
      repo: selectedRepo.name,
      branch: selectedBranch,
      path: path.trim(),
      lastKnownSha,
    });
  }

  // Requires a *completed* existence check for the current repo/branch/path
  // combination, not just that the fields are non-empty - otherwise Link is
  // clickable immediately after typing a path (before its on-blur
  // checkPath() resolves), which would persist whatever stale lastKnownSha
  // happened to be in state rather than the real one for what's about to be
  // linked. pathNote and lastKnownSha are always set together (see
  // checkPath/resetPathCheck above), so gating on pathNote !== null is
  // equivalent to gating on "lastKnownSha reflects the current selection".
  const canLink = !!selectedRepo && !!selectedBranch && !!path.trim() && !pathChecking && pathNote !== null;

  const fileName = linkedRepo ? linkedRepo.path.split('/').pop() ?? linkedRepo.path : '';
  const commitPlaceholder = generateDefaultCommitMessage(fileName);

  async function handlePush() {
    if (!accessToken || !linkedRepo) return;
    const content = useEditorStore.getState().content;
    const message = commitMessage.trim() || commitPlaceholder;
    useGithubStore.getState().setSyncing(true);
    try {
      const token = await getValidAccessToken();
      if (!token) return;
      const newSha = await createOrUpdateFile(
        token,
        linkedRepo.owner,
        linkedRepo.repo,
        linkedRepo.branch,
        linkedRepo.path,
        content,
        message,
        linkedRepo.lastKnownSha ?? undefined,
      );
      useGithubStore.getState().updateLinkedRepoSha(newSha);
      showFeedback('Pushed to GitHub.', 'info');
    } catch (err) {
      if (err instanceof GithubApiError && err.status === 409) {
        showFeedback('The file on GitHub has changed since you last synced — pull first.', 'error');
      } else {
        handleGithubError(err, showFeedback, 'Failed to push to GitHub');
      }
    } finally {
      useGithubStore.getState().setSyncing(false);
    }
  }

  async function handleConfirmPull() {
    await pull();
    setPullConfirming(false);
  }

  if (!isVisible) return null;

  return (
    <Panel title='GitHub' onClose={onClose} widthClass='w-[380px]'>
      {!accessToken && !isConnecting && (
        <div className='p-4 space-y-3'>
          <p className='text-xs text-muted'>
            Connect this SCXML file to a GitHub repository to push and pull changes.
          </p>
          <Button variant='solid' onClick={() => connect()}>
            Connect to GitHub
          </Button>
        </div>
      )}

      {!accessToken && isConnecting && !deviceCode && (
        <div className='p-4 space-y-3'>
          <p className='text-xs text-muted'>Starting GitHub sign-in…</p>
          <Button variant='outline' size='sm' onClick={cancel}>
            Cancel
          </Button>
        </div>
      )}

      {!accessToken && isConnecting && deviceCode && (
        <div className='p-4 space-y-3'>
          <p className='text-xs text-muted'>
            To finish connecting, go to{' '}
            <a
              href={deviceCode.verificationUri}
              target='_blank'
              rel='noreferrer'
              className='text-primary underline'
            >
              {deviceCode.verificationUri}
            </a>{' '}
            and enter this code:
          </p>
          <p className='text-lg font-mono font-semibold text-default tracking-wider text-center bg-muted rounded-md py-2'>
            {deviceCode.userCode}
          </p>
          <p className='text-xs text-dimmed'>Waiting for you to complete sign-in on GitHub…</p>
          <Button variant='outline' size='sm' onClick={cancel}>
            Cancel
          </Button>
        </div>
      )}

      {accessToken && !linkedRepo && hasInstallation === false && (
        <div>
          <GithubUserHeader user={user!} onSignOut={() => useGithubStore.getState().clearAuth()} disabled={isSyncing} />
          <div className='p-4 space-y-3'>
            <p className='text-xs text-muted'>
              This GitHub account hasn&apos;t installed the SCXML Editor app yet, or hasn&apos;t
              granted it any repositories. Install it and pick which repo(s) to share.
            </p>
            {installUrl && (
              <Button variant='solid' onClick={() => window.open(installUrl, '_blank', 'noreferrer')}>
                Install on GitHub
              </Button>
            )}
            <Button variant='outline' size='sm' onClick={() => void fetchRepos()} loading={reposLoading}>
              I&apos;ve installed it — refresh
            </Button>
          </div>
        </div>
      )}

      {accessToken && !linkedRepo && hasInstallation !== false && (
        <div>
          <GithubUserHeader user={user!} onSignOut={() => useGithubStore.getState().clearAuth()} disabled={isSyncing} />
          <div className='p-3 space-y-3'>
            <Field label='Repository'>
              <SearchableSelect
                value={selectedFullName}
                options={repos.map(r => r.fullName)}
                onChange={value => {
                  setSelectedFullName(value);
                  setPath('');
                  resetPathCheck();
                }}
                placeholder={reposLoading ? 'Loading repositories…' : 'Select a repository…'}
              />
            </Field>

            {selectedRepo && (
              <Field label='Branch'>
                <SearchableSelect
                  value={selectedBranch}
                  options={branches.map(b => b.name)}
                  onChange={value => {
                    setSelectedBranch(value);
                    // The existence check (and any sha it found) is scoped
                    // to a specific branch - clear the path too (not just
                    // reset the note/sha) so the invalidation is visible to
                    // the user and forces a fresh checkPath() for the new
                    // branch before Link can be re-enabled, rather than
                    // silently leaving a path that merely looks
                    // "not yet checked".
                    setPath('');
                    resetPathCheck();
                  }}
                  placeholder={branchesLoading ? 'Loading branches…' : 'Select a branch…'}
                />
              </Field>
            )}

            {selectedRepo && selectedBranch && (
              <Field label='File path'>
                <Input
                  type='text'
                  value={path}
                  onChange={e => {
                    setPath(e.target.value);
                    // Same reasoning: an edited path invalidates whatever
                    // sha/note a previous path's existence check found.
                    resetPathCheck();
                  }}
                  onBlur={checkPath}
                  placeholder='flows/main.scxml'
                />
                {pathChecking && <p className='text-[11px] text-dimmed mt-1'>Checking…</p>}
                {!pathChecking && pathNote === 'exists' && (
                  <p className='text-[11px] text-dimmed mt-1'>
                    Existing file found — linking will let you push updates to it.
                  </p>
                )}
                {!pathChecking && pathNote === 'create' && (
                  <p className='text-[11px] text-dimmed mt-1'>
                    This file doesn&apos;t exist yet — linking will create it on your next push.
                  </p>
                )}
              </Field>
            )}

            <Button variant='solid' disabled={!canLink} onClick={handleLink}>
              Link
            </Button>
          </div>
        </div>
      )}

      {accessToken && linkedRepo && (
        <div>
          <GithubUserHeader user={user!} onSignOut={() => useGithubStore.getState().clearAuth()} disabled={isSyncing} />
          <div className='p-3 space-y-3'>
            <div className='text-xs space-y-1'>
              <p>
                <span className='text-dimmed'>Repository </span>
                <span className='font-medium text-default'>
                  {linkedRepo.owner}/{linkedRepo.repo}
                </span>
              </p>
              <p>
                <span className='text-dimmed'>Branch </span>
                <span className='font-medium text-default'>{linkedRepo.branch}</span>
              </p>
              <p>
                <span className='text-dimmed'>Path </span>
                <span className='font-medium text-default'>{linkedRepo.path}</span>
              </p>
            </div>

            <Field label='Commit message'>
              <textarea
                value={commitMessage}
                onChange={e => setCommitMessage(e.target.value)}
                placeholder={commitPlaceholder}
                rows={2}
                className={`${inputClass} resize-none`}
              />
            </Field>

            <div className='flex gap-1.5'>
              <Button variant='solid' size='sm' loading={isSyncing} onClick={handlePush}>
                Push
              </Button>
              {!pullConfirming && (
                <Button
                  variant='outline'
                  size='sm'
                  disabled={isSyncing}
                  onClick={() => setPullConfirming(true)}
                >
                  Pull
                </Button>
              )}
              <Button
                variant='outline'
                size='sm'
                disabled={isSyncing}
                onClick={() => useGithubStore.getState().clearLinkedRepo()}
              >
                Disconnect
              </Button>
            </div>

            {pullConfirming && (
              <div className='space-y-2 bg-primary-muted rounded-md p-2'>
                <p className='text-[11px] text-default'>
                  This will replace your current editor content with the latest version from
                  GitHub. Any unsaved changes will be lost. Continue?
                </p>
                <div className='flex gap-1.5 justify-end'>
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={isSyncing}
                    onClick={() => setPullConfirming(false)}
                  >
                    Cancel
                  </Button>
                  <Button variant='solid' size='sm' loading={isSyncing} onClick={() => void handleConfirmPull()}>
                    Confirm
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}
