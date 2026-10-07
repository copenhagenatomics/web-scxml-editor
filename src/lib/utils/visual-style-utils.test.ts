import { describe, it, expect } from 'vitest';
import { computeVisualStyles } from './visual-style-utils';

describe('computeVisualStyles — final state', () => {
  it('gives a final state a double border (wide enough to draw) and a muted fill', () => {
    const styles = computeVisualStyles(undefined, 'final');
    expect(styles.borderStyle).toBe('double');
    expect(styles.borderWidth).toBeGreaterThanOrEqual(3);
    expect(styles.backgroundColor).toBe('#f1f5f9');
  });

  it('keeps the double border when only the stroke color is customized', () => {
    const styles = computeVisualStyles({ style: { stroke: '#123456' } } as any, 'final');
    expect(styles.borderColor).toBe('#123456');
    expect(styles.borderStyle).toBe('double');
  });

  it('leaves simple states unchanged', () => {
    expect(computeVisualStyles(undefined, 'simple')).toEqual({
      borderColor: '#64748b',
      borderStyle: 'solid',
      backgroundColor: '#f8fafc',
      borderWidth: 1,
      borderRadius: 12,
    });
  });
});
