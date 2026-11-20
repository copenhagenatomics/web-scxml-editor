import { describe, it, expect } from 'vitest';
import { UpdatePositionAndDimensionsCommand } from './update-position-and-dimensions-command';
import { UpdatePositionCommand } from './update-position-command';
import { BatchUpdatePositionCommand } from './batch-update-position-command';
import { extractNoteNodes } from '@/lib/converters/converter-modules/note-conversion';
import { clampNoteSize, VISUAL_METADATA_CONSTANTS } from '@/types/visual-metadata';

const NOTE = VISUAL_METADATA_CONSTANTS.NOTE;

const withNote = (xywh: string) =>
  `<scxml xmlns="http://www.w3.org/2005/07/scxml" xmlns:viz="http://visual-scxml-editor/metadata" version="1.0"><state id="A"/><viz:note viz:id="note:n1" viz:xywh="${xywh}">hello</viz:note></scxml>`;

const xywhOf = (xml: string) => /viz:xywh="([^"]+)"[^>]*>hello/.exec(xml)?.[1];

describe('note resizing', () => {
  it('UpdatePositionAndDimensionsCommand resizes a note and undo restores it', () => {
    const xml = withNote('10,20,500,250');
    const cmd = new UpdatePositionAndDimensionsCommand('note:n1', 5, 6, 700, 400);
    const result = cmd.execute(xml);
    expect(result.success).toBe(true);
    expect(xywhOf(result.newContent)).toBe('5,6,700,400');

    const undone = cmd.undo(result.newContent);
    expect(undone.success).toBe(true);
    expect(xywhOf(undone.newContent)).toBe('10,20,500,250');
  });

  it('clamps a note resize to the allowed bounds', () => {
    const result = new UpdatePositionAndDimensionsCommand('note:n1', 0, 0, 10, 99999).execute(
      withNote('0,0,500,250')
    );
    expect(xywhOf(result.newContent)).toBe(`0,0,${NOTE.MIN_WIDTH},${NOTE.MAX_HEIGHT}`);
  });

  it('moving a note preserves its resized dimensions', () => {
    const single = new UpdatePositionCommand('note:n1', 30, 40).execute(withNote('0,0,700,400'));
    expect(xywhOf(single.newContent)).toBe('30,40,700,400');

    const batch = new BatchUpdatePositionCommand([{ nodeId: 'note:n1', x: 1, y: 2 }]).execute(
      withNote('0,0,700,400')
    );
    expect(xywhOf(batch.newContent)).toBe('1,2,700,400');
  });

  it('moving a note without a stored size falls back to the default size', () => {
    const result = new UpdatePositionCommand('note:n1', 30, 40).execute(withNote('0,0'));
    expect(xywhOf(result.newContent)).toBe(`30,40,${NOTE.WIDTH},${NOTE.HEIGHT}`);
  });

  it('extractNoteNodes reads the stored size into node data', () => {
    const [node] = extractNoteNodes({
      'viz:note': { '@_viz:id': 'note:n1', '@_viz:xywh': '1,2,640,320', '#text': 'x' },
    });
    expect(node.position).toEqual({ x: 1, y: 2 });
    expect(node.data).toMatchObject({ width: 640, height: 320 });
  });

  it('clampNoteSize falls back to defaults for missing/invalid values', () => {
    expect(clampNoteSize(undefined, NaN)).toEqual({ width: NOTE.WIDTH, height: NOTE.HEIGHT });
    expect(clampNoteSize(0, -5)).toEqual({ width: NOTE.WIDTH, height: NOTE.HEIGHT });
  });
});
