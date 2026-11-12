import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearDraft,
  draftKey,
  evaluateDraft,
  readDraft,
  writeDraft,
  type Draft,
} from './draft-storage';

const draft = (overrides: Partial<Draft> = {}): Draft => ({
  version: 1,
  content: '<scxml><state id="edited"/></scxml>',
  baseContent: '<scxml><state id="base"/></scxml>',
  fileName: 'a.scxml',
  savedAt: 1_700_000_000_000,
  ...overrides,
});

function throwingStorage(): Storage {
  const fail = () => {
    throw new Error('blocked');
  };
  return {
    length: 0,
    clear: fail,
    getItem: fail,
    key: fail,
    removeItem: fail,
    setItem: fail,
  } as Storage;
}

describe('draft storage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('round-trips a draft per mode', () => {
    const embedded = draft();
    const standalone = draft({ content: '<scxml><state id="other"/></scxml>' });
    expect(writeDraft(window.localStorage, 'embedded', embedded)).toBe(true);
    expect(writeDraft(window.localStorage, 'standalone', standalone)).toBe(true);

    expect(readDraft(window.localStorage, 'embedded')).toEqual(embedded);
    expect(readDraft(window.localStorage, 'standalone')).toEqual(standalone);

    clearDraft(window.localStorage, 'embedded');
    expect(readDraft(window.localStorage, 'embedded')).toBeNull();
    expect(readDraft(window.localStorage, 'standalone')).toEqual(standalone);
  });

  it('returns null for missing, corrupt or wrongly shaped entries', () => {
    expect(readDraft(window.localStorage, 'embedded')).toBeNull();

    window.localStorage.setItem(draftKey('embedded'), '{not json');
    expect(readDraft(window.localStorage, 'embedded')).toBeNull();

    window.localStorage.setItem(draftKey('embedded'), JSON.stringify({ version: 2, content: 'x' }));
    expect(readDraft(window.localStorage, 'embedded')).toBeNull();
  });

  it('never throws when storage is unavailable or blocked', () => {
    expect(readDraft(undefined, 'embedded')).toBeNull();
    expect(writeDraft(undefined, 'embedded', draft())).toBe(false);
    expect(() => clearDraft(undefined, 'embedded')).not.toThrow();

    const blocked = throwingStorage();
    expect(readDraft(blocked, 'embedded')).toBeNull();
    expect(writeDraft(blocked, 'embedded', draft())).toBe(false);
    expect(() => clearDraft(blocked, 'embedded')).not.toThrow();
  });
});

describe('evaluateDraft', () => {
  it('reports none when there is no draft', () => {
    expect(evaluateDraft(null, 'anything')).toEqual({ kind: 'none' });
  });

  it('treats an empty draft or one identical to its own base as stale', () => {
    expect(evaluateDraft(draft({ content: '  ' }), null)).toEqual({ kind: 'stale' });
    const same = draft({ content: 'x', baseContent: 'x' });
    expect(evaluateDraft(same, null)).toEqual({ kind: 'stale' });
  });

  it('treats a draft already contained in the loaded document as stale (e.g. applied since)', () => {
    const d = draft();
    expect(evaluateDraft(d, d.content)).toEqual({ kind: 'stale' });
  });

  it('offers a draft made on the document that is loaded now', () => {
    const d = draft();
    expect(evaluateDraft(d, d.baseContent)).toEqual({ kind: 'offer', baseChanged: false });
  });

  it('offers a draft with baseChanged when a different document is loaded now', () => {
    expect(evaluateDraft(draft(), '<scxml><state id="new-version"/></scxml>')).toEqual({
      kind: 'offer',
      baseChanged: true,
    });
  });

  it('offers without baseChanged when nothing is loaded yet', () => {
    expect(evaluateDraft(draft(), null)).toEqual({ kind: 'offer', baseChanged: false });
  });
});
