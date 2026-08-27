import { describe, it, expect, vi, afterEach } from 'vitest';
import { getCaretCoordinates } from './textarea-caret';

describe('getCaretCoordinates', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // jsdom implements the DOM but not real CSS layout, so every size/position
  // read comes back 0 regardless of content (same limitation documented in
  // src/lib/layout/measure-label-width.ts). Real pixel-accurate caret
  // coordinates can only be verified in a real browser; here we verify the
  // documented jsdom fallback and that the mirror element is always cleaned
  // up, never leaked into the document.
  it('returns null under jsdom (no real layout engine)', () => {
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    textarea.value = 'MainLight_color == conf_red';

    expect(getCaretCoordinates(textarea, 10)).toBeNull();

    document.body.removeChild(textarea);
  });

  it('creates a mirror element, appends it, and always removes it again (never leaked)', () => {
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    textarea.value = 'this_channel';

    const appendSpy = vi.spyOn(document.body, 'appendChild');
    const removeSpy = vi.spyOn(document.body, 'removeChild');

    getCaretCoordinates(textarea, 4);

    // The mirror div was genuinely appended, then genuinely removed — not
    // merely "absent afterward," which would also pass if no element were
    // ever created in the first place.
    expect(appendSpy).toHaveBeenCalledTimes(1);
    expect(removeSpy).toHaveBeenCalledTimes(1);
    const appendedNode = appendSpy.mock.calls[0][0];
    const removedNode = removeSpy.mock.calls[0][0];
    expect(appendedNode).toBe(removedNode);
    expect((appendedNode as HTMLElement).tagName).toBe('DIV');

    expect(document.querySelectorAll('div').length).toBe(0);
    document.body.removeChild(textarea);
  });

  it('returns null and still cleans up the mirror element when measuring throws', () => {
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    textarea.value = 'this_channel';

    vi.spyOn(window, 'getComputedStyle').mockImplementationOnce(() => {
      throw new Error('boom');
    });

    expect(getCaretCoordinates(textarea, 4)).toBeNull();
    expect(document.querySelectorAll('div').length).toBe(0);

    document.body.removeChild(textarea);
  });
});
