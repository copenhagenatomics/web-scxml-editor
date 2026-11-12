import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useDraftAutosave, DRAFT_SAVE_DEBOUNCE_MS } from './use-draft-autosave';
import { useEditorStore } from '@/stores/editor-store';
import { HistoryManager } from '@/lib/history/history-manager';
import { readDraft, writeDraft, type Draft } from '@/lib/draft';

const doc = (id: string) =>
  `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="${id}"><state id="${id}"/></scxml>`;

const BASE = doc('Base');
const EDITED = doc('Edited');
const OTHER = doc('Other');

// jsdom runs the hook top-level (window.self === window.top), i.e. standalone mode.
const storedDraft = () => readDraft(window.localStorage, 'standalone');

function load(content: string, name = 'machine.scxml') {
  act(() => {
    useEditorStore.getState().setFileInfo({ name, content, size: content.length, lastModified: new Date() });
    HistoryManager.getInstance().initialize(useEditorStore.getState().content, 'Loaded');
  });
}

// The automatic restore is deferred to a microtask (after the load path's own
// history.initialize()); vitest's fake timers leave queueMicrotask real.
async function flushMicrotasks() {
  await act(async () => {});
}

function edit(content: string) {
  act(() => {
    useEditorStore.getState().setContent(content);
  });
}

function seedDraft(overrides: Partial<Draft> = {}) {
  writeDraft(window.localStorage, 'standalone', {
    version: 1,
    content: EDITED,
    baseContent: BASE,
    fileName: 'machine.scxml',
    savedAt: Date.now(),
    ...overrides,
  });
}

describe('useDraftAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    useEditorStore.getState().reset();
    HistoryManager.getInstance().clear();
  });

  afterEach(() => {
    act(() => {
      cleanup();
      vi.runOnlyPendingTimers();
    });
    vi.useRealTimers();
    window.localStorage.clear();
    useEditorStore.getState().reset();
    HistoryManager.getInstance().clear();
  });

  describe('saving', () => {
    it('saves a draft of unsaved edits after the debounce, with the baseline it was made on', () => {
      renderHook(() => useDraftAutosave());
      load(BASE);
      edit(EDITED);

      expect(storedDraft()).toBeNull();
      act(() => vi.advanceTimersByTime(DRAFT_SAVE_DEBOUNCE_MS));

      expect(storedDraft()).toMatchObject({ content: EDITED, baseContent: BASE, fileName: 'machine.scxml' });
    });

    it('removes the draft once the content is back to the baseline or saved', () => {
      renderHook(() => useDraftAutosave());
      load(BASE);
      edit(EDITED);
      act(() => vi.advanceTimersByTime(DRAFT_SAVE_DEBOUNCE_MS));
      expect(storedDraft()).not.toBeNull();

      act(() => useEditorStore.getState().markSaved());
      act(() => vi.advanceTimersByTime(DRAFT_SAVE_DEBOUNCE_MS));
      expect(storedDraft()).toBeNull();
    });

    it('does not save a freshly loaded, unedited document', () => {
      renderHook(() => useDraftAutosave());
      load(BASE);
      act(() => vi.advanceTimersByTime(DRAFT_SAVE_DEBOUNCE_MS));
      expect(storedDraft()).toBeNull();
    });

    it('flushes immediately on pagehide (e.g. the host removing the iframe), without waiting for the debounce', () => {
      renderHook(() => useDraftAutosave());
      load(BASE);
      edit(EDITED);

      act(() => {
        window.dispatchEvent(new Event('pagehide'));
      });
      expect(storedDraft()?.content).toBe(EDITED);
    });

    it('asks the browser to confirm leaving only while there are unsaved edits', () => {
      renderHook(() => useDraftAutosave());
      load(BASE);

      const clean = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(clean);
      expect(clean.defaultPrevented).toBe(false);

      edit(EDITED);
      const dirty = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(dirty);
      expect(dirty.defaultPrevented).toBe(true);
      // Saved on the way out too.
      expect(storedDraft()?.content).toBe(EDITED);
    });
  });

  describe('automatic restore onto the same version', () => {
    it('restores a draft made on the version that gets loaded, as an undoable step, and shows a notice', async () => {
      const savedAt = Date.now() - 60_000;
      seedDraft({ savedAt });
      const { result } = renderHook(() => useDraftAutosave());
      load(BASE);
      await flushMicrotasks();

      const state = useEditorStore.getState();
      expect(state.content).toBe(EDITED);
      expect(state.isDirty).toBe(true);
      expect(state.fileInfo?.content).toBe(BASE);
      expect(result.current.draftBanner).toEqual({ kind: 'restored', savedAt });
      expect(storedDraft()?.content).toBe(EDITED);

      // The load's history.initialize() ran before the restore, so Undo reaches the loaded version.
      expect(HistoryManager.getInstance().undo()?.content).toBe(BASE);
    });

    it('Discard on the notice goes back to the loaded version, deletes the draft, and can itself be undone', async () => {
      seedDraft();
      const { result } = renderHook(() => useDraftAutosave());
      load(BASE);
      await flushMicrotasks();

      act(() => result.current.discardRestoredChanges());

      expect(useEditorStore.getState().content).toBe(BASE);
      expect(useEditorStore.getState().isDirty).toBe(false);
      expect(result.current.draftBanner).toBeNull();
      expect(storedDraft()).toBeNull();
      expect(HistoryManager.getInstance().undo()?.content).toBe(EDITED);
    });

    it('dismissing the notice keeps the restored changes', async () => {
      seedDraft();
      const { result } = renderHook(() => useDraftAutosave());
      load(BASE);
      await flushMicrotasks();

      act(() => result.current.dismissRestoredNotice());

      expect(result.current.draftBanner).toBeNull();
      expect(useEditorStore.getState().content).toBe(EDITED);
      expect(storedDraft()?.content).toBe(EDITED);
    });

    it('skips the restore if another document is loaded before it runs, and evaluates against that one', async () => {
      seedDraft();
      const { result } = renderHook(() => useDraftAutosave());
      load(BASE);
      load(OTHER);
      await flushMicrotasks();

      expect(useEditorStore.getState().content).toBe(OTHER);
      expect(result.current.draftBanner).toMatchObject({ kind: 'offer', baseChanged: true });
    });
  });

  describe('offering a stored draft', () => {
    it('asks (baseChanged) when a different version is loaded than the draft was made on', async () => {
      seedDraft();
      const { result } = renderHook(() => useDraftAutosave());
      load(OTHER);
      await flushMicrotasks();

      expect(result.current.draftBanner).toMatchObject({ kind: 'offer', baseChanged: true });
      expect(useEditorStore.getState().content).toBe(OTHER);
    });

    it('asks on mount when nothing is loaded (standalone Welcome screen)', () => {
      seedDraft();
      const { result } = renderHook(() => useDraftAutosave());
      expect(result.current.draftBanner).toMatchObject({ kind: 'offer', baseChanged: false });
    });

    it('silently drops a draft the loaded document already contains (e.g. it was applied)', async () => {
      seedDraft();
      const { result } = renderHook(() => useDraftAutosave());
      load(EDITED);
      await flushMicrotasks();

      expect(result.current.draftBanner).toBeNull();
      expect(storedDraft()).toBeNull();
    });

    it('leaves the stored draft untouched while the offer is pending, even if the user edits', () => {
      seedDraft();
      renderHook(() => useDraftAutosave());
      load(OTHER);
      edit(doc('Typing'));
      act(() => vi.advanceTimersByTime(DRAFT_SAVE_DEBOUNCE_MS));

      expect(storedDraft()?.content).toBe(EDITED);
    });

    it('does not re-evaluate the offer when the baseline only moves via markSaved', () => {
      seedDraft();
      const { result } = renderHook(() => useDraftAutosave());
      load(OTHER);
      // e.g. the diagram's automatic first layout being folded into the baseline. A
      // re-evaluation here would see the draft as already contained and drop it.
      edit(EDITED);
      act(() => useEditorStore.getState().markSaved());

      expect(result.current.draftBanner).toMatchObject({ kind: 'offer' });
      expect(storedDraft()?.content).toBe(EDITED);
    });

    it('Restore replaces the open version with the draft, keeps it unsaved, and Undo returns to it', () => {
      seedDraft();
      const { result } = renderHook(() => useDraftAutosave());
      load(OTHER);

      act(() => result.current.restoreDraft());

      const state = useEditorStore.getState();
      expect(state.content).toBe(EDITED);
      expect(state.isDirty).toBe(true);
      expect(state.fileInfo?.content).toBe(OTHER);
      expect(result.current.draftBanner).toBeNull();
      expect(storedDraft()?.content).toBe(EDITED);
      expect(HistoryManager.getInstance().undo()?.content).toBe(OTHER);
    });

    it('Restore from the Welcome screen loads the draft baseline first, so the edits still count as unsaved', () => {
      seedDraft({ fileName: 'from-draft.scxml' });
      const { result } = renderHook(() => useDraftAutosave());

      act(() => result.current.restoreDraft());

      const state = useEditorStore.getState();
      expect(state.fileInfo).toMatchObject({ name: 'from-draft.scxml', content: BASE });
      expect(state.content).toBe(EDITED);
      expect(state.isDirty).toBe(true);
      expect(result.current.draftBanner).toBeNull();
    });

    it('Discard deletes the draft and resumes saving edits made while the banner was showing', () => {
      seedDraft();
      const { result } = renderHook(() => useDraftAutosave());
      load(OTHER);
      const typed = doc('Typing');
      edit(typed);

      act(() => result.current.discardDraft());

      expect(result.current.draftBanner).toBeNull();
      expect(storedDraft()?.content).toBe(typed);
      expect(useEditorStore.getState().content).toBe(typed);
    });
  });
});
