'use client';

import { useCallback, useMemo } from 'react';
import { HistoryManager } from '@/lib/history/history-manager';
import { annotateLegacyConfTypes } from '@/lib/utils/datamodel-extractor';
import {
  mergeDuplicateTransitionsInDocument,
  mergeDuplicateTransitionsByEventInDocument,
} from '@/lib/utils/transition-merge-utils';
import { useGithubStore } from '@/stores/github-store';
import { useHostAPIStore } from '@/stores/host-api-store';
import { useEditorStore } from '@/stores/editor-store';
import { getFileContent, isUnauthorizedError } from '@/lib/github/api';
import { getValidAccessToken } from '@/lib/github/token';
import type { FileInfo } from '@/types/common';

/**
 * Orchestrates the "Pull from GitHub" flow: fetches the linked file's
 * current content from GitHub and applies it as a full-document replacement,
 * mirroring `useFileOperations().handleFileLoad`'s pattern (fresh
 * `FileInfo` + fresh history baseline + navigate to root).
 */
export function useGithubPull() {
  const { setSyncing, updateLinkedRepoSha, clearAuth } = useGithubStore();
  const { showFeedback } = useHostAPIStore();
  const { setFileInfo, navigateToRoot } = useEditorStore();
  const historyManager = useMemo(() => HistoryManager.getInstance(), []);

  const pull = useCallback(async () => {
    const { accessToken, linkedRepo } = useGithubStore.getState();

    if (!accessToken || !linkedRepo) {
      showFeedback('Cannot pull from GitHub: not connected or no file linked.', 'error');
      return;
    }

    setSyncing(true);
    try {
      const token = await getValidAccessToken();
      if (!token) {
        showFeedback('Your GitHub session has expired or was revoked. Please reconnect.', 'error');
        return;
      }
      const fileContent = await getFileContent(
        token,
        linkedRepo.owner,
        linkedRepo.repo,
        linkedRepo.branch,
        linkedRepo.path
      );

      if (fileContent === null) {
        showFeedback(
          'The linked file no longer exists on GitHub. It may have been deleted or moved.',
          'error'
        );
        return;
      }

      // Normalize the fetched content the same way handleFileLoad does for a
      // locally-loaded file, so a pulled document behaves identically to one
      // loaded via upload (legacy conf-type annotation + duplicate
      // transition merging) rather than diverging based on how it arrived.
      // This only affects what's shown/edited locally - `sha` below still
      // tracks GitHub's blob sha for the raw, un-normalized content GitHub
      // actually has stored, since that's what any future push must diff
      // against.
      const annotatedContent = mergeDuplicateTransitionsInDocument(
        mergeDuplicateTransitionsByEventInDocument(
          annotateLegacyConfTypes(fileContent.content)
        )
      );

      const fileInfo: FileInfo = {
        name: linkedRepo.path.split('/').pop() ?? linkedRepo.path,
        size: annotatedContent.length,
        lastModified: new Date(),
        content: annotatedContent,
      };

      setFileInfo(fileInfo);
      historyManager.initialize(annotatedContent, 'Pulled from GitHub');
      navigateToRoot();

      updateLinkedRepoSha(fileContent.sha);
      showFeedback('Pulled latest content from GitHub.', 'info');
    } catch (err) {
      if (isUnauthorizedError(err)) {
        clearAuth();
        showFeedback('Your GitHub session has expired or was revoked. Please reconnect.', 'error');
      } else {
        const message = err instanceof Error ? err.message : String(err);
        showFeedback(`Failed to pull from GitHub: ${message}`, 'error');
      }
    } finally {
      setSyncing(false);
    }
  }, [setSyncing, updateLinkedRepoSha, clearAuth, showFeedback, setFileInfo, navigateToRoot, historyManager]);

  return { pull };
}
