import { BaseCommand, type CommandResult } from './base-command';
import { VISUAL_METADATA_CONSTANTS } from '@/types/visual-metadata';

const NOTE = VISUAL_METADATA_CONSTANTS.NOTE;

/**
 * AddNoteCommand
 *
 * Appends a <viz:note> annotation element as a child of the SCXML root, or
 * of a specific state when parentStateId is given. The containing element
 * determines the note's hierarchy level in the diagram (same mechanism as
 * regular child states), so a note added while drilled into a state stays
 * visible only at that level.
 * Notes live in the viz namespace so SCXML engines ignore them.
 * New notes start at the default NOTE.WIDTH × NOTE.HEIGHT; the user can
 * resize them afterwards (UpdatePositionAndDimensionsCommand).
 */
export class AddNoteCommand extends BaseCommand {
  constructor(
    private noteId: string,
    private x: number,
    private y: number,
    private text: string = '',
    private parentStateId?: string
  ) {
    super();
  }

  execute(scxmlContent: string): CommandResult {
    const { doc, error } = this.parseXML(scxmlContent);
    if (!doc) {
      return this.createFailureResult(
        error || 'Failed to parse XML',
        scxmlContent
      );
    }

    this.ensureVizNamespace(doc);

    const parentElement = this.parentStateId
      ? this.findStateElement(doc, this.parentStateId)
      : doc.documentElement;
    if (!parentElement) {
      return this.createFailureResult(
        `Parent state element not found: ${this.parentStateId}`,
        scxmlContent
      );
    }

    // createElementNS guarantees the serializer emits a valid prefix binding
    const noteElement = doc.createElementNS(
      VISUAL_METADATA_CONSTANTS.NAMESPACE_URI,
      NOTE.ELEMENT_NAME
    );
    noteElement.setAttribute('viz:id', this.noteId);
    noteElement.setAttribute(
      'viz:xywh',
      `${Math.round(this.x)},${Math.round(this.y)},${NOTE.WIDTH},${NOTE.HEIGHT}`
    );
    noteElement.textContent = this.text;
    parentElement.appendChild(noteElement);

    const newContent = this.serializeXML(doc);
    return this.createSuccessResult(newContent, [this.noteId]);
  }

  undo(scxmlContent: string): CommandResult {
    const inverseCommand = new DeleteNoteCommand(this.noteId);
    return inverseCommand.execute(scxmlContent);
  }

  getDescription(): string {
    return `Add note at (${Math.round(this.x)}, ${Math.round(this.y)})`;
  }
}

/**
 * UpdateNoteTextCommand
 *
 * Replaces the text content of a <viz:note> element.
 * XMLSerializer handles escaping of &, <, > etc.
 */
export class UpdateNoteTextCommand extends BaseCommand {
  private oldText?: string;

  constructor(
    private noteId: string,
    private newText: string
  ) {
    super();
  }

  execute(scxmlContent: string): CommandResult {
    const { doc, error } = this.parseXML(scxmlContent);
    if (!doc) {
      return this.createFailureResult(
        error || 'Failed to parse XML',
        scxmlContent
      );
    }

    const noteElement = this.findNoteElement(doc, this.noteId);
    if (!noteElement) {
      return this.createFailureResult(
        `Note element not found: ${this.noteId}`,
        scxmlContent
      );
    }

    this.oldText = noteElement.textContent ?? '';
    noteElement.textContent = this.newText;

    const newContent = this.serializeXML(doc);
    return this.createSuccessResult(newContent, [this.noteId]);
  }

  undo(scxmlContent: string): CommandResult {
    if (this.oldText === undefined) {
      return this.createFailureResult(
        'No previous note text to restore',
        scxmlContent
      );
    }

    const inverseCommand = new UpdateNoteTextCommand(this.noteId, this.oldText);
    return inverseCommand.execute(scxmlContent);
  }

  getDescription(): string {
    return `Edit note "${this.noteId}"`;
  }
}

/**
 * DeleteNoteCommand
 *
 * Removes one or more <viz:note> elements.
 * Undo restores a full-content backup (same approach as DeleteNodeCommand).
 */
export class DeleteNoteCommand extends BaseCommand {
  private deletedNotesBackup?: string;
  private noteIds: string[];

  constructor(noteIds: string | string[]) {
    super();
    this.noteIds = Array.isArray(noteIds) ? noteIds : [noteIds];
  }

  execute(scxmlContent: string): CommandResult {
    const { doc, error } = this.parseXML(scxmlContent);
    if (!doc) {
      return this.createFailureResult(
        error || 'Failed to parse XML',
        scxmlContent
      );
    }

    this.deletedNotesBackup = scxmlContent;

    for (const noteId of this.noteIds) {
      const noteElement = this.findNoteElement(doc, noteId);
      if (!noteElement) {
        console.warn(`Note element not found for deletion: ${noteId}`);
        continue;
      }
      noteElement.parentNode?.removeChild(noteElement);
    }

    const newContent = this.serializeXML(doc);
    return this.createSuccessResult(newContent, this.noteIds);
  }

  undo(scxmlContent: string): CommandResult {
    if (!this.deletedNotesBackup) {
      return this.createFailureResult(
        'No deleted notes backup available for undo',
        scxmlContent
      );
    }

    return this.createSuccessResult(this.deletedNotesBackup, this.noteIds);
  }

  getDescription(): string {
    if (this.noteIds.length === 1) {
      return `Delete note "${this.noteIds[0]}"`;
    }
    return `Delete ${this.noteIds.length} notes`;
  }
}
