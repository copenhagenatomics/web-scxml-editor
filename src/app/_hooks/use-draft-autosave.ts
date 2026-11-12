'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HistoryManager } from '@/lib/history/history-manager';
import {
  clearDraft,
  evaluateDraft,
  getDraftStorage,
  readDraft,
  writeDraft,
  type Draft,
  type DraftMode,
} from '@/lib/draft';
import { useEditorStore } from '@/stores/editor-store';

export const DRAFT_SAVE_DEBOUNCE_MS = 500;

export interface PendingDraft {
  draft: Draft;
  baseChanged: boolean;
}

export type DraftBannerState =
  /** Ask before restoring: a different version is loaded, or nothing is loaded yet. */
  | ({ kind: 'offer' } & PendingDraft)
  /** The draft was restored automatically onto the version it was made on. */
  | { kind: 'restored'; savedAt: number };

/**
 * Auto-saves unsaved edits to a browser-local draft and brings them back on the
 * next load (issue #80). "Unsaved" means content differs from the editor store's
 * baseline (`fileInfo.content`, set by every load path, moved by `markSaved()`).
 *
 * - Saves are debounced, and flushed immediately on pagehide / tab hidden /
 *   beforeunload, so removing the iframe or closing the tab keeps the latest edits.
 * - A stored draft is evaluated on mount and after every document load (`loadGeneration`):
 *   - made on exactly the version now loaded → restored automatically (an undoable
 *     step on top of the loaded version), with a "Restored … Discard" notice;
 *   - made on a different version, or nothing loaded yet (standalone Welcome
 *     screen) → offered via a Restore/Discard banner, since restoring would replace
 *     a version the user hasn't seen the draft against.
 * - While an offer is pending the stored draft is left untouched — it is only ever
 *   replaced or deleted by an explicit Restore/Discard, or when a load shows it is
 *   already contained in the loaded document.
 * - beforeunload shows the browser's "Leave page?" prompt while there are unsaved edits.
 *
 * Must be called before useHostAPIBridge: the host may call loadScxml synchronously
 * from inside the bridge's mount effect, and this hook's subscription has to exist by then.
 */
export function useDraftAutosave() {
  const historyManager = useMemo(() => HistoryManager.getInstance(), []);
  const [pendingDraft, setPendingDraftState] = useState<PendingDraft | null>(null);
  const [restoredAt, setRestoredAt] = useState<number | null>(null);
  const pendingRef = useRef<PendingDraft | null>(null);
  const modeRef = useRef<DraftMode | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressEvaluateRef = useRef(false);

  const setPending = useCallback((next: PendingDraft | null) => {
    pendingRef.current = next;
    setPendingDraftState(next);
  }, []);

  const saveNow = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const mode = modeRef.current;
    if (!mode || pendingRef.current) return;
    const { content, isDirty, fileInfo } = useEditorStore.getState();
    // Nothing open (Welcome screen): leave any stored draft alone.
    if (!content) return;
    const storage = getDraftStorage();
    if (isDirty) {
      writeDraft(storage, mode, {
        version: 1,
        content,
        baseContent: fileInfo?.content ?? '',
        fileName: fileInfo?.name,
        savedAt: Date.now(),
      });
    } else {
      clearDraft(storage, mode);
    }
  }, []);

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(saveNow, DRAFT_SAVE_DEBOUNCE_MS);
  }, [saveNow]);

  /** Puts the draft's content in the editor as an undoable step on top of what's loaded. */
  const applyDraft = useCallback(
    (draft: Draft, description: string) => {
      const store = useEditorStore.getState();
      store.setContent(draft.content);
      historyManager.trackAction('bulk-change', useEditorStore.getState().content, description);
      store.navigateToRoot();
      saveNow();
    },
    [historyManager, saveNow]
  );

  const evaluate = useCallback(() => {
    const mode = modeRef.current;
    if (!mode) return;
    const storage = getDraftStorage();
    const draft = readDraft(storage, mode);
    const { fileInfo, loadGeneration } = useEditorStore.getState();
    const decision = evaluateDraft(draft, fileInfo ? fileInfo.content : null);
    setRestoredAt(null);

    if (decision.kind === 'offer' && draft) {
      if (fileInfo && !decision.baseChanged) {
        setPending(null);
        // Deferred until the load that triggered this has finished: load paths call
        // historyManager.initialize() right after setFileInfo(), which would otherwise
        // wipe the restore's history entry (and Undo back to the loaded version).
        queueMicrotask(() => {
          // Another document was loaded in the meantime — that load re-evaluates.
          if (useEditorStore.getState().loadGeneration !== loadGeneration) return;
          applyDraft(draft, 'Restored unsaved changes');
          setRestoredAt(draft.savedAt);
        });
        return;
      }
      setPending({ draft, baseChanged: decision.baseChanged });
      return;
    }
    if (decision.kind === 'stale') clearDraft(storage, mode);
    setPending(null);
  }, [applyDraft, setPending]);

  useEffect(() => {
    // Checked here, never during render (static export — see use-initial-load.ts).
    modeRef.current = window.self !== window.top ? 'embedded' : 'standalone';
    evaluate();

    let lastLoadGeneration = useEditorStore.getState().loadGeneration;
    const unsubscribe = useEditorStore.subscribe((state, prev) => {
      if (state.loadGeneration !== lastLoadGeneration) {
        lastLoadGeneration = state.loadGeneration;
        if (!suppressEvaluateRef.current) evaluate();
      }
      if (state.content !== prev.content || state.isDirty !== prev.isDirty) {
        scheduleSave();
      }
    });

    const onPageHide = () => saveNow();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') saveNow();
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      saveNow();
      const { content, isDirty } = useEditorStore.getState();
      if (content && isDirty) {
        event.preventDefault();
        // Legacy browsers only show the prompt when returnValue is set.
        event.returnValue = '';
      }
    };

    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      unsubscribe();
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      saveNow();
    };
  }, [evaluate, saveNow, scheduleSave]);

  /** Restore an offered draft (different version loaded, or nothing loaded yet). */
  const restoreDraft = useCallback(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    const { draft } = pending;

    // Nothing loaded yet (standalone Welcome screen, or a host that never pushed
    // content): load the draft's own baseline first so dirty tracking and undo work.
    if (!useEditorStore.getState().fileInfo) {
      suppressEvaluateRef.current = true;
      try {
        useEditorStore.getState().setFileInfo({
          name: draft.fileName ?? 'document.scxml',
          content: draft.baseContent,
          size: draft.baseContent.length,
          lastModified: new Date(draft.savedAt),
        });
      } finally {
        suppressEvaluateRef.current = false;
      }
      historyManager.initialize(useEditorStore.getState().content, 'Loaded draft baseline');
    }

    setPending(null);
    applyDraft(draft, 'Restored unsaved changes');
  }, [applyDraft, historyManager, setPending]);

  /** Decline an offered draft: delete it. */
  const discardDraft = useCallback(() => {
    if (!pendingRef.current || !modeRef.current) return;
    clearDraft(getDraftStorage(), modeRef.current);
    setPending(null);
    // Persist anything edited while the banner was showing.
    saveNow();
  }, [saveNow, setPending]);

  /** Undo an automatic restore: back to the loaded version (itself undoable). */
  const discardRestoredChanges = useCallback(() => {
    const { fileInfo } = useEditorStore.getState();
    if (!fileInfo || !modeRef.current) return;
    setRestoredAt(null);
    useEditorStore.getState().setContent(fileInfo.content);
    historyManager.trackAction('bulk-change', useEditorStore.getState().content, 'Discarded restored changes');
    clearDraft(getDraftStorage(), modeRef.current);
  }, [historyManager]);

  const dismissRestoredNotice = useCallback(() => setRestoredAt(null), []);

  const draftBanner: DraftBannerState | null = pendingDraft
    ? { kind: 'offer', ...pendingDraft }
    : restoredAt !== null
      ? { kind: 'restored', savedAt: restoredAt }
      : null;

  return { draftBanner, restoreDraft, discardDraft, discardRestoredChanges, dismissRestoredNotice };
}
