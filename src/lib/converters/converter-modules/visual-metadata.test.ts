import { describe, it, expect } from 'vitest';
import { parseAnchorsAttribute, formatAnchorsAttribute } from './visual-metadata';

describe('parseAnchorsAttribute', () => {
  it('parses a single side:count pair', () => {
    expect(parseAnchorsAttribute('bottom:3')).toEqual({ bottom: 3 });
  });

  it('parses multiple side:count pairs', () => {
    expect(parseAnchorsAttribute('bottom:3;right:2')).toEqual({
      bottom: 3,
      right: 2,
    });
  });

  it('drops a side at count 1 (implicit default, not worth storing)', () => {
    expect(parseAnchorsAttribute('bottom:1')).toEqual({});
  });

  it('ignores an unknown side name', () => {
    expect(parseAnchorsAttribute('diagonal:2')).toEqual({});
  });

  it('ignores a non-numeric count', () => {
    expect(parseAnchorsAttribute('bottom:abc')).toEqual({});
  });

  it('ignores a count with trailing junk instead of truncating it', () => {
    expect(parseAnchorsAttribute('bottom:2junk')).toEqual({});
  });

  it('ignores a count above the per-side maximum', () => {
    expect(parseAnchorsAttribute('bottom:999999')).toEqual({});
  });

  it('accepts a count at the per-side maximum', () => {
    expect(parseAnchorsAttribute('bottom:6')).toEqual({ bottom: 6 });
  });
});

describe('formatAnchorsAttribute', () => {
  it('formats a single side', () => {
    expect(formatAnchorsAttribute({ bottom: 3 })).toBe('bottom:3');
  });

  it('formats multiple sides joined with ;', () => {
    expect(formatAnchorsAttribute({ bottom: 3, right: 2 })).toBe('bottom:3;right:2');
  });

  it('omits a side at count 1', () => {
    expect(formatAnchorsAttribute({ bottom: 1, right: 2 })).toBe('right:2');
  });

  it('returns an empty string when every side is at the default count', () => {
    expect(formatAnchorsAttribute({ bottom: 1 })).toBe('');
  });
});
