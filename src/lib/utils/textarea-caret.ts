/**
 * Pixel position of the caret at `offset` within `textarea`, relative to the
 * textarea's own top-left corner — or `null` when no real layout engine is
 * available to measure with (jsdom: every size/position read comes back 0
 * regardless of content, same limitation as measure-label-width.ts). Callers
 * should fall back to anchoring the dropdown below the field in that case.
 *
 * Technique: clone the textarea's relevant computed styles into a hidden
 * mirror <div>, insert the text up to `offset` followed by a marker <span>,
 * measure the marker's offset, then remove the mirror. This is the standard
 * "mirror div" approach for caret coordinates (no native browser API exists
 * for this on a plain <textarea>).
 */
export function getCaretCoordinates(
  textarea: HTMLTextAreaElement,
  offset: number
): { top: number; left: number; height: number } | null {
  if (typeof document === 'undefined') return null;

  const mirror = document.createElement('div');
  const marker = document.createElement('span');

  try {
    const style = getComputedStyle(textarea);
    const props: (keyof CSSStyleDeclaration)[] = [
      'boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
      'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
      'fontFamily', 'fontSize', 'fontWeight', 'letterSpacing', 'lineHeight', 'textIndent',
    ];
    for (const prop of props) {
      // style[prop] is always a string for these CSS-text properties.
      (mirror.style as unknown as Record<string, string>)[prop as string] = style[prop] as string;
    }
    mirror.style.position = 'absolute';
    mirror.style.top = '-9999px';
    mirror.style.left = '-9999px';
    mirror.style.visibility = 'hidden';
    mirror.style.whiteSpace = 'pre-wrap';
    mirror.style.wordWrap = 'break-word';

    mirror.textContent = textarea.value.slice(0, offset);
    marker.textContent = textarea.value.slice(offset) || '.';
    mirror.appendChild(marker);
    document.body.appendChild(mirror);

    const top = marker.offsetTop - textarea.scrollTop;
    const left = marker.offsetLeft - textarea.scrollLeft;
    const height = marker.offsetHeight;

    if (top === 0 && left === 0 && height === 0) return null;
    return { top, left, height };
  } catch {
    return null;
  } finally {
    if (mirror.isConnected) document.body.removeChild(mirror);
  }
}
