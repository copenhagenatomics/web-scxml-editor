import { describe, it, expect } from 'vitest';
import { generateDefaultCommitMessage } from './commit-message';

describe('generateDefaultCommitMessage', () => {
  it('formats a simple filename', () => {
    expect(generateDefaultCommitMessage('main.scxml')).toBe(
      'Update main.scxml via SCXML Editor'
    );
  });

  it('formats a filename with a path-like or unusual name unchanged', () => {
    expect(generateDefaultCommitMessage('flows/robot-controller.scxml')).toBe(
      'Update flows/robot-controller.scxml via SCXML Editor'
    );
  });

  it('is stable/deterministic for the same input (no embedded timestamp)', () => {
    const a = generateDefaultCommitMessage('main.scxml');
    const b = generateDefaultCommitMessage('main.scxml');
    expect(a).toBe(b);
  });
});
