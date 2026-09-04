import { describe, it, expect } from 'vitest';
import { getHandleAnchor, parseHandleId, type Rect } from './edge-obstacle-utils';

const rect: Rect = { x: 0, y: 0, width: 100, height: 50 };

function expectPointCloseTo(actual: { x: number; y: number }, expected: { x: number; y: number }) {
  expect(actual.x).toBeCloseTo(expected.x);
  expect(actual.y).toBeCloseTo(expected.y);
}

describe('getHandleAnchor', () => {
  it('defaults to the midpoint of each side (single-handle backward compatibility)', () => {
    expect(getHandleAnchor(rect, 'top')).toEqual({ x: 50, y: 0 });
    expect(getHandleAnchor(rect, 'bottom')).toEqual({ x: 50, y: 50 });
    expect(getHandleAnchor(rect, 'left')).toEqual({ x: 0, y: 25 });
    expect(getHandleAnchor(rect, 'right')).toEqual({ x: 100, y: 25 });
  });

  it('places 2 anchors on a side at the 1/3 and 2/3 marks', () => {
    expectPointCloseTo(getHandleAnchor(rect, 'top', 0, 2), { x: 100 / 3, y: 0 });
    expectPointCloseTo(getHandleAnchor(rect, 'top', 1, 2), { x: 200 / 3, y: 0 });
  });

  it('places 3 anchors on a side at the quarter marks, matching the single-handle midpoint at index 1', () => {
    expect(getHandleAnchor(rect, 'bottom', 0, 3)).toEqual({ x: 25, y: 50 });
    expect(getHandleAnchor(rect, 'bottom', 1, 3)).toEqual({ x: 50, y: 50 });
    expect(getHandleAnchor(rect, 'bottom', 2, 3)).toEqual({ x: 75, y: 50 });
  });

  it('spaces vertical-side anchors along height', () => {
    expectPointCloseTo(getHandleAnchor(rect, 'left', 0, 2), { x: 0, y: 50 / 3 });
    expectPointCloseTo(getHandleAnchor(rect, 'right', 1, 2), { x: 100, y: 100 / 3 });
  });
});

describe('parseHandleId', () => {
  it('parses a bare side name as index 0', () => {
    expect(parseHandleId('top')).toEqual({ side: 'top', index: 0 });
    expect(parseHandleId('bottom')).toEqual({ side: 'bottom', index: 0 });
  });

  it('parses an indexed handle id', () => {
    expect(parseHandleId('top-1')).toEqual({ side: 'top', index: 1 });
    expect(parseHandleId('right-2')).toEqual({ side: 'right', index: 2 });
  });
});
