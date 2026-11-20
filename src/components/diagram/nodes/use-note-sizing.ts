'use client';

import React from 'react';
import { VISUAL_METADATA_CONSTANTS } from '@/types/visual-metadata';

const NOTE = VISUAL_METADATA_CONSTANTS.NOTE;

/**
 * These must match the note component's content box exactly so the hidden
 * measurer reproduces the real text layout (same width, padding, line-height).
 */
export const NOTE_CONTENT_PADDING = 12; // px, matches p-3
export const NOTE_BORDER_WIDTH = 1; // px
export const NOTE_LINE_HEIGHT = 1.4;

const CONTENT_INSET = NOTE_CONTENT_PADDING + NOTE_BORDER_WIDTH;

export interface NoteSizing {
  /** Font size in px: large until text overflows, then small */
  fontSize: number;
  /** Rendered note height: base, or base × expansion factor when small font overflows */
  height: number;
  /** True when text overflows even at small font and expanded height */
  isFull: boolean;
  /** Whether a candidate text would fit within the maximum capacity */
  fits: (candidateText: string) => boolean;
}

/**
 * Off-screen singleton div used to measure wrapped text height synchronously.
 * A detached mirror (instead of the live element) lets the textarea test a
 * candidate keystroke before accepting it, without layout flicker.
 */
let measurer: HTMLDivElement | null = null;

function getMeasurer(): HTMLDivElement {
  if (!measurer || !measurer.isConnected) {
    measurer = document.createElement('div');
    const style = measurer.style;
    style.position = 'absolute';
    style.top = '-9999px';
    style.left = '-9999px';
    style.visibility = 'hidden';
    style.pointerEvents = 'none';
    style.whiteSpace = 'pre-wrap';
    style.overflowWrap = 'break-word';
    style.wordBreak = 'break-word';
    style.lineHeight = String(NOTE_LINE_HEIGHT);
    document.body.appendChild(measurer);
  }
  return measurer;
}

function measureTextHeight(
  text: string,
  fontSize: number,
  contentWidth: number
): number {
  const el = getMeasurer();
  el.style.width = `${contentWidth}px`;
  el.style.fontSize = `${fontSize}px`;
  // A trailing newline adds no height in pre-wrap measurement; pad it so the
  // caret's new line counts as occupied space.
  el.textContent = text.endsWith('\n') ? `${text} ` : text;
  return el.scrollHeight;
}

/**
 * Sizing cascade for a note's text (all sizing decisions live here), relative
 * to the note's (user-resizable) base width × height:
 * 1. large font @ base height
 * 2. small font @ base height
 * 3. small font @ expanded height (base × HEIGHT_EXPANSION_FACTOR)
 * 4. still overflowing → isFull
 *
 * With `allowExpansion` false (live resize drag), step 3 is skipped so the
 * note renders exactly the box under the user's cursor.
 */
function computeSizing(
  text: string,
  width: number,
  baseHeight: number,
  allowExpansion: boolean
): Omit<NoteSizing, 'fits'> {
  const contentWidth = Math.max(1, width - 2 * CONTENT_INSET);
  const baseContentHeight = baseHeight - 2 * CONTENT_INSET;
  const expandedHeight = allowExpansion
    ? baseHeight * NOTE.HEIGHT_EXPANSION_FACTOR
    : baseHeight;
  const expandedContentHeight = expandedHeight - 2 * CONTENT_INSET;

  if (
    measureTextHeight(text, NOTE.FONT_SIZE_LARGE, contentWidth) <=
    baseContentHeight
  ) {
    return { fontSize: NOTE.FONT_SIZE_LARGE, height: baseHeight, isFull: false };
  }

  const smallHeight = measureTextHeight(text, NOTE.FONT_SIZE_SMALL, contentWidth);
  if (smallHeight <= baseContentHeight) {
    return { fontSize: NOTE.FONT_SIZE_SMALL, height: baseHeight, isFull: false };
  }
  if (smallHeight <= expandedContentHeight) {
    return { fontSize: NOTE.FONT_SIZE_SMALL, height: expandedHeight, isFull: false };
  }
  return { fontSize: NOTE.FONT_SIZE_SMALL, height: expandedHeight, isFull: true };
}

export function useNoteSizing(
  text: string,
  width: number = NOTE.WIDTH,
  baseHeight: number = NOTE.HEIGHT,
  allowExpansion: boolean = true
): NoteSizing {
  // Default to the un-measured base look; the layout effect corrects it
  // before paint. Measuring lives in an effect so SSR never touches the DOM.
  const [sizing, setSizing] = React.useState<Omit<NoteSizing, 'fits'>>({
    fontSize: NOTE.FONT_SIZE_LARGE,
    height: baseHeight,
    isFull: false,
  });

  React.useLayoutEffect(() => {
    const next = computeSizing(text, width, baseHeight, allowExpansion);
    setSizing((prev) =>
      prev.fontSize === next.fontSize &&
      prev.height === next.height &&
      prev.isFull === next.isFull
        ? prev
        : next
    );
  }, [text, width, baseHeight, allowExpansion]);

  const fits = React.useCallback(
    (candidateText: string) =>
      !computeSizing(candidateText, width, baseHeight, true).isFull,
    [width, baseHeight]
  );

  return { ...sizing, fits };
}
