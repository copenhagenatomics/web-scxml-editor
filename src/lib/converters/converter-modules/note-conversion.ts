/**
 * Post-it Note Conversion for SCXML Converter
 *
 * Converts <viz:note> annotation elements into React Flow nodes and
 * back-fills persisted ids for legacy notes. A note may be a child of
 * <scxml> (root level) or of any <state>/<parallel>/<final> element; its
 * container determines the hierarchy level it appears at in the diagram,
 * the same mechanism regular child states use.
 * Notes bypass ELK layout entirely: they always carry an explicit position
 * and their stored (user-resizable) base size.
 */

import type { Node } from 'reactflow';
import { v4 as uuidv4 } from 'uuid';
import { VISUAL_METADATA_CONSTANTS, clampNoteSize } from '@/types/visual-metadata';
import { getAttribute } from './visual-metadata';

const NOTE = VISUAL_METADATA_CONSTANTS.NOTE;

function toNoteArray(element: any): any[] {
  const raw = element?.[NOTE.ELEMENT_NAME];
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

/**
 * Recursively collect <viz:note> elements from the scxml root and every
 * nested state, recording the id of the state that contains each note.
 * The containing state becomes the note's hierarchy level in the editor.
 */
function collectNotes(
  element: any,
  parentStateId: string | undefined,
  out: Array<{ note: any; parentId?: string }>
): void {
  toNoteArray(element).forEach((note) => out.push({ note, parentId: parentStateId }));

  for (const childKey of ['state', 'parallel', 'final']) {
    const children = element?.[childKey];
    if (!children) continue;
    const childArray = Array.isArray(children) ? children : [children];
    for (const child of childArray) {
      const childId = getAttribute(child, 'id');
      collectNotes(child, childId ?? parentStateId, out);
    }
  }
}

/**
 * Extract React Flow nodes for all <viz:note> elements (any hierarchy level).
 * Notes without a persisted viz:id get a transient positional id
 * ("note:idx-N") that survives exactly one render cycle — ensureNoteIds
 * persists real ids immediately via the initialization write-back.
 */
export function extractNoteNodes(scxml: any): Node[] {
  const collected: Array<{ note: any; parentId?: string }> = [];
  collectNotes(scxml, undefined, collected);

  return collected.map(({ note, parentId }, index) => {
    const id =
      getAttribute(note, 'viz:id') || `${NOTE.ID_PREFIX}idx-${index}`;

    let x = 100;
    let y = 100;
    let storedWidth: number | undefined;
    let storedHeight: number | undefined;
    const vizXywh = getAttribute(note, 'viz:xywh');
    if (vizXywh && typeof vizXywh === 'string') {
      const parts = vizXywh
        .trim()
        .split(',')
        .map((p) => parseFloat(p.trim()));
      if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        x = parts[0];
        y = parts[1];
      }
      if (parts.length >= 4) {
        storedWidth = parts[2];
        storedHeight = parts[3];
      }
    }
    // The stored size is the note's base box (user-resizable); it's clamped
    // to the resize bounds so legacy or hand-edited sizes stay sane.
    const { width, height } = clampNoteSize(storedWidth, storedHeight);

    // fast-xml-parser coerces digit-only text content to a number
    const text = note?.['#text'] != null ? String(note['#text']) : '';

    return {
      id,
      type: 'scxmlNote',
      position: { x, y },
      // Notes nest under whichever state contains their <viz:note> element,
      // so they only appear at that hierarchy level in the diagram — same
      // mechanism regular child states use (hierarchy nav filters on this).
      parentId,
      zIndex: -1,
      data: { text, width, height },
    };
  });
}

/**
 * Whether any <viz:note> element (root or nested) lacks a persisted viz:id
 */
export function notesNeedIds(scxml: any): boolean {
  const collected: Array<{ note: any; parentId?: string }> = [];
  collectNotes(scxml, undefined, collected);
  return collected.some(({ note }) => !getAttribute(note, 'viz:id'));
}

/**
 * Assign persisted viz:id attributes to notes that lack one.
 * Returns the updated SCXML string, or '' when nothing changed or on error.
 */
export function ensureNoteIds(scxmlContent: string): string {
  if (!scxmlContent) return '';

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(scxmlContent, 'text/xml');
    if (doc.querySelector('parsererror')) {
      console.error('XML parsing error in ensureNoteIds');
      return '';
    }

    // getElementsByTagName because CSS selectors cannot match the
    // qualified name of a namespaced element
    const notes = doc.getElementsByTagName(NOTE.ELEMENT_NAME);
    let changed = false;
    for (let i = 0; i < notes.length; i++) {
      if (!notes[i].getAttribute('viz:id')) {
        notes[i].setAttribute(
          'viz:id',
          `${NOTE.ID_PREFIX}${uuidv4().slice(0, 8)}`
        );
        changed = true;
      }
    }

    if (!changed) return '';

    const serializer = new XMLSerializer();
    return serializer.serializeToString(doc);
  } catch (error) {
    console.error('Error in ensureNoteIds:', error);
    return '';
  }
}
