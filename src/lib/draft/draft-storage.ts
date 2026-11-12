/**
 * Browser-local draft of the document being edited, so unapplied/unsaved changes
 * survive the editor being closed or navigated away from (issue #80).
 *
 * One draft slot per mode: embedded in a host (LoopControl) or standalone. A draft
 * stores the edited content plus the baseline it was edited from, so on the next
 * load we can tell whether the incoming document is still the one the draft was
 * based on.
 *
 * All storage access is best-effort: private windows, blocked storage or a full
 * quota must never break editing, so every read/write swallows errors.
 */

export type DraftMode = 'embedded' | 'standalone';

export interface Draft {
  version: 1;
  /** The edited document. */
  content: string;
  /** The loaded/saved document the edits were made on top of. */
  baseContent: string;
  fileName?: string;
  /** Epoch milliseconds. */
  savedAt: number;
}

export type DraftDecision =
  /** No draft stored. */
  | { kind: 'none' }
  /** A draft exists but holds nothing worth restoring; delete it. */
  | { kind: 'stale' }
  /**
   * Offer to restore. `baseChanged` is true when the newly loaded document differs
   * from the one the draft was edited from (e.g. a different version was applied
   * to the system since).
   */
  | { kind: 'offer'; baseChanged: boolean };

const KEY_PREFIX = 'scxml-editor:draft:';

export function draftKey(mode: DraftMode): string {
  return `${KEY_PREFIX}${mode}`;
}

export function getDraftStorage(): Storage | undefined {
  try {
    return typeof window !== 'undefined' ? window.localStorage : undefined;
  } catch {
    return undefined;
  }
}

function isDraft(value: unknown): value is Draft {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    v.version === 1 &&
    typeof v.content === 'string' &&
    typeof v.baseContent === 'string' &&
    typeof v.savedAt === 'number' &&
    (v.fileName === undefined || typeof v.fileName === 'string')
  );
}

export function readDraft(storage: Storage | undefined, mode: DraftMode): Draft | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(draftKey(mode));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isDraft(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Returns false if the draft could not be stored (no storage, quota exceeded, …). */
export function writeDraft(storage: Storage | undefined, mode: DraftMode, draft: Draft): boolean {
  if (!storage) return false;
  try {
    storage.setItem(draftKey(mode), JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function clearDraft(storage: Storage | undefined, mode: DraftMode): void {
  if (!storage) return;
  try {
    storage.removeItem(draftKey(mode));
  } catch {
    // best-effort
  }
}

/**
 * Decides what to do with a stored draft when a document is (or isn't yet) loaded.
 * `baseline` is the newly loaded document, or null when nothing is loaded (the
 * standalone Welcome screen).
 */
export function evaluateDraft(draft: Draft | null, baseline: string | null): DraftDecision {
  if (!draft) return { kind: 'none' };
  if (!draft.content.trim()) return { kind: 'stale' };
  // Nothing was actually changed relative to what it was based on.
  if (draft.content === draft.baseContent) return { kind: 'stale' };
  // The loaded document already contains the draft (e.g. it was applied/saved).
  if (baseline !== null && draft.content === baseline) return { kind: 'stale' };
  return {
    kind: 'offer',
    baseChanged: baseline !== null && baseline !== draft.baseContent,
  };
}
