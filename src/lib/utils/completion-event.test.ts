import { describe, it, expect } from 'vitest';
import { renameCompletionEventTokens } from './completion-event';

describe('renameCompletionEventTokens', () => {
  it('renames a lone done.state.<oldId> event', () => {
    expect(renameCompletionEventTokens('done.state.C', 'C', 'Work')).toBe('done.state.Work');
  });

  it('renames only the matching token in a comma- or space-separated list, preserving separators', () => {
    expect(renameCompletionEventTokens('done.state.C, clicked', 'C', 'Work')).toBe('done.state.Work, clicked');
    expect(renameCompletionEventTokens('clicked done.state.C', 'C', 'Work')).toBe('clicked done.state.Work');
  });

  it('does not touch a different state\'s completion event that merely starts with the old id', () => {
    expect(renameCompletionEventTokens('done.state.CC', 'C', 'Work')).toBe('done.state.CC');
    expect(renameCompletionEventTokens('done.state.C.sub', 'C', 'Work')).toBe('done.state.C.sub');
  });

  it('treats regex characters in the id literally', () => {
    expect(renameCompletionEventTokens('done.state.aXb', 'a.b', 'Z')).toBe('done.state.aXb');
    expect(renameCompletionEventTokens('done.state.a.b', 'a.b', 'Z')).toBe('done.state.Z');
  });

  it('returns undefined / unchanged input when there is nothing to rename', () => {
    expect(renameCompletionEventTokens(undefined, 'C', 'Work')).toBeUndefined();
    expect(renameCompletionEventTokens('clicked', 'C', 'Work')).toBe('clicked');
  });
});
