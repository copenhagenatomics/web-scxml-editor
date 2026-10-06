import { describe, expect, it } from 'vitest';
import {
  capturePixelRatio,
  computeExportLevels,
  contentBounds,
  levelTitle,
  planLevelPage,
  usableArea,
  MAX_SCALE,
  type Rect,
} from './diagram-pdf-layout';

/** The scaled level must lie entirely inside its page's printable area. */
function expectInsideUsableArea(bounds: Rect) {
  const plan = planLevelPage(bounds);
  const area = usableArea(plan.orientation);
  const eps = 0.01;
  expect(plan.offset.x).toBeGreaterThanOrEqual(area.x - eps);
  expect(plan.offset.y).toBeGreaterThanOrEqual(area.y - eps);
  expect(plan.offset.x + bounds.width * plan.scale).toBeLessThanOrEqual(area.x + area.width + eps);
  expect(plan.offset.y + bounds.height * plan.scale).toBeLessThanOrEqual(area.y + area.height + eps);
  return plan;
}

describe('contentBounds', () => {
  it('returns null for no content', () => {
    expect(contentBounds([])).toBeNull();
  });

  it('unions rects and applies padding', () => {
    const rects: Rect[] = [
      { x: 10, y: 20, width: 100, height: 50 },
      { x: -40, y: 100, width: 20, height: 20 },
    ];
    expect(contentBounds(rects, 10)).toEqual({ x: -50, y: 10, width: 170, height: 120 });
  });
});

describe('planLevelPage', () => {
  it('uses landscape for a wide level', () => {
    expect(planLevelPage({ x: 0, y: 0, width: 3000, height: 1000 }).orientation).toBe('landscape');
  });

  it('uses portrait for a tall level', () => {
    expect(planLevelPage({ x: 0, y: 0, width: 1000, height: 3000 }).orientation).toBe('portrait');
  });

  it('picks the orientation that allows the larger scale', () => {
    const bounds = { x: 0, y: 0, width: 1200, height: 1000 };
    const plan = planLevelPage(bounds);
    const fit = (o: 'portrait' | 'landscape') => {
      const area = usableArea(o);
      return Math.min(area.width / bounds.width, area.height / bounds.height);
    };
    expect(plan.scale).toBeCloseTo(Math.max(fit('portrait'), fit('landscape')));
    expect(plan.orientation).toBe(fit('landscape') > fit('portrait') ? 'landscape' : 'portrait');
  });

  it('fits huge levels on the page, however much they must shrink', () => {
    for (const bounds of [
      { x: -500, y: 200, width: 20000, height: 3000 },
      { x: 0, y: 0, width: 2500, height: 18000 },
      { x: 10, y: 10, width: 9000, height: 9000 },
    ]) {
      const plan = expectInsideUsableArea(bounds);
      expect(plan.scale).toBeLessThan(0.2);
    }
  });

  it('centers the level on the page', () => {
    const bounds = { x: 100, y: 100, width: 3000, height: 1000 };
    const plan = planLevelPage(bounds);
    const area = usableArea(plan.orientation);
    const left = plan.offset.x - area.x;
    const right = area.x + area.width - (plan.offset.x + bounds.width * plan.scale);
    const top = plan.offset.y - area.y;
    const bottom = area.y + area.height - (plan.offset.y + bounds.height * plan.scale);
    expect(left).toBeCloseTo(right);
    expect(top).toBeCloseTo(bottom);
  });

  it('enlarges small levels, but not beyond MAX_SCALE', () => {
    const plan = expectInsideUsableArea({ x: 0, y: 0, width: 200, height: 100 });
    expect(plan.scale).toBe(MAX_SCALE);
  });

  it('handles degenerate (zero-size) bounds', () => {
    const plan = planLevelPage({ x: 0, y: 0, width: 0, height: 0 });
    expect(Number.isFinite(plan.scale)).toBe(true);
    expect(Number.isFinite(plan.offset.x)).toBe(true);
  });
});

describe('capturePixelRatio', () => {
  it('captures at least 2 image pixels per canvas pixel for normal levels', () => {
    const bounds = { x: 0, y: 0, width: 1500, height: 900 };
    expect(capturePixelRatio(bounds, planLevelPage(bounds).scale)).toBeGreaterThanOrEqual(2);
  });

  it('captures enough for 300 dpi when a small level is enlarged', () => {
    const bounds = { x: 0, y: 0, width: 200, height: 100 };
    expect(capturePixelRatio(bounds, MAX_SCALE)).toBeCloseTo((MAX_SCALE * 300) / 72);
  });

  it('stays within browser canvas limits for huge levels', () => {
    for (const bounds of [
      { x: 0, y: 0, width: 20000, height: 3000 },
      { x: 0, y: 0, width: 9000, height: 9000 },
    ]) {
      const ratio = capturePixelRatio(bounds, planLevelPage(bounds).scale);
      expect(bounds.width * ratio).toBeLessThanOrEqual(16384);
      expect(bounds.height * ratio).toBeLessThanOrEqual(16384);
      expect(bounds.width * ratio * bounds.height * ratio).toBeLessThanOrEqual(32_000_000 + 1);
    }
  });
});

describe('computeExportLevels', () => {
  const isNote = (id: string) => id.startsWith('note_');

  it('always includes the top level', () => {
    expect(computeExportLevels([], isNote)).toEqual([{ parentId: null, path: [] }]);
  });

  it('lists every state with children, depth-first in document order', () => {
    const nodes = [
      { id: 'A' },
      { id: 'A1', parentId: 'A' },
      { id: 'A1a', parentId: 'A1' },
      { id: 'B' },
      { id: 'B1', parentId: 'B' },
      { id: 'C' },
    ];
    expect(computeExportLevels(nodes, isNote)).toEqual([
      { parentId: null, path: [] },
      { parentId: 'A', path: ['A'] },
      { parentId: 'A1', path: ['A', 'A1'] },
      { parentId: 'B', path: ['B'] },
    ]);
  });

  it('does not treat a state containing only notes as a level', () => {
    const nodes = [{ id: 'A' }, { id: 'note_1', parentId: 'A' }];
    expect(computeExportLevels(nodes, isNote)).toEqual([{ parentId: null, path: [] }]);
  });
});

describe('levelTitle', () => {
  it('names the top level and nested paths', () => {
    expect(levelTitle({ parentId: null, path: [] })).toBe('Top level');
    expect(levelTitle({ parentId: 'A1', path: ['A', 'A1'] })).toBe('A / A1');
  });
});
