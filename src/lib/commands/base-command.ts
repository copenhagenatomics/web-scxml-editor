/**
 * Command Pattern Base Interface
 *
 * All SCXML modification operations implement this interface.
 * This enables:
 * - Unified approach to all mutations
 * - Undo/redo functionality
 * - Clean separation of business logic from UI
 */

import { VISUAL_METADATA_CONSTANTS } from '@/types/visual-metadata';

export interface CommandResult {
  /**
   * The new SCXML content after applying the command
   */
  newContent: string;

  /**
   * Whether the command executed successfully
   */
  success: boolean;

  /**
   * Error message if command failed
   */
  error?: string;

  /**
   * List of element IDs affected by this command
   * Useful for triggering selective re-renders
   */
  affectedElements?: string[];
}

export interface Command {
  /**
   * Execute the command on the given SCXML content
   * @param scxmlContent - The current SCXML XML string
   * @returns Result containing new content and success status
   */
  execute(scxmlContent: string): CommandResult;

  /**
   * Undo the command on the given SCXML content
   * @param scxmlContent - The current SCXML XML string
   * @returns Result containing reverted content and success status
   */
  undo(scxmlContent: string): CommandResult;

  /**
   * Get a human-readable description of what this command does
   * Used for history/undo UI
   */
  getDescription(): string;
}

/**
 * Base class providing common XML manipulation utilities
 */
export abstract class BaseCommand implements Command {
  /**
   * Parse XML string to DOM Document
   */
  protected parseXML(scxmlContent: string): {
    doc: Document | null;
    error?: string;
  } {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(scxmlContent, 'text/xml');

      // Check for parsing errors
      const parseError = doc.querySelector('parsererror');
      if (parseError) {
        return {
          doc: null,
          error: `XML parsing error: ${parseError.textContent}`
        };
      }

      return { doc };
    } catch (error) {
      return {
        doc: null,
        error: error instanceof Error ? error.message : 'Unknown parsing error'
      };
    }
  }

  /**
   * Serialize DOM Document to XML string
   */
  protected serializeXML(doc: Document): string {
    const serializer = new XMLSerializer();
    return serializer.serializeToString(doc);
  }

  /**
   * Find a state element by ID (works for <state>, <parallel>, <final>)
   */
  protected findStateElement(doc: Document, stateId: string): Element | null {
    return doc.querySelector(
      `state[id="${stateId}"], parallel[id="${stateId}"], final[id="${stateId}"]`
    );
  }

  /**
   * Ensure viz namespace is declared on root element
   */
  protected ensureVizNamespace(doc: Document): void {
    const root = doc.documentElement;
    if (root && !root.hasAttribute('xmlns:viz')) {
      root.setAttribute('xmlns:viz', VISUAL_METADATA_CONSTANTS.NAMESPACE_URI);
    }
  }

  /**
   * Create a success result
   */
  protected createSuccessResult(
    newContent: string,
    affectedElements?: string[]
  ): CommandResult {
    return {
      newContent,
      success: true,
      affectedElements
    };
  }

  /**
   * Create a failure result
   */
  protected createFailureResult(
    error: string,
    originalContent: string
  ): CommandResult {
    return {
      newContent: originalContent,
      success: false,
      error
    };
  }

  // Abstract methods that subclasses must implement
  abstract execute(scxmlContent: string): CommandResult;
  abstract undo(scxmlContent: string): CommandResult;
  abstract getDescription(): string;
}
