import { BaseCommand, type CommandResult } from './base-command';

/**
 * UpdateActionsCommand
 *
 * Updates onentry and onexit actions for a state element
 * Handles creating/removing onentry and onexit elements based on action arrays
 */
export class UpdateActionsCommand extends BaseCommand {
  private oldEntryActions?: string[];
  private oldExitActions?: string[];

  constructor(
    private nodeId: string,
    private entryActions: string[],
    private exitActions: string[]
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

    // Find the state element
    const stateElement = this.findStateElement(doc, this.nodeId);
    if (!stateElement) {
      return this.createFailureResult(
        `State element not found: ${this.nodeId}`,
        scxmlContent
      );
    }

    // Store old actions for undo
    // Use direct child selector to avoid finding nested onentry elements
    const existingOnentry = Array.from(stateElement.children).find(
      child => child.tagName.toLowerCase() === 'onentry'
    ) as Element | undefined;
    if (existingOnentry) {
      this.oldEntryActions = this.extractActionsFromElement(existingOnentry);
    } else {
      this.oldEntryActions = [];
    }

    const existingOnexit = Array.from(stateElement.children).find(
      child => child.tagName.toLowerCase() === 'onexit'
    ) as Element | undefined;
    if (existingOnexit) {
      this.oldExitActions = this.extractActionsFromElement(existingOnexit);
    } else {
      this.oldExitActions = [];
    }

    // Update onentry actions
    if (existingOnentry) {
      stateElement.removeChild(existingOnentry);
    }

    if (this.entryActions.length > 0) {
      // Get the namespace from the root element
      const scxmlNamespace = doc.documentElement.namespaceURI || 'http://www.w3.org/2005/07/scxml';
      const onentry = doc.createElementNS(scxmlNamespace, 'onentry');

      this.entryActions.forEach((action) => {
        // Parse action format: "assign|location|expr" or simple string
        if (action.startsWith('assign|')) {
          const parts = action.split('|');
          const location = parts[1] || '';
          const expr = parts[2] || '';
          const assignElement = doc.createElementNS(scxmlNamespace, 'assign');
          if (location) assignElement.setAttribute('location', location);
          if (expr) assignElement.setAttribute('expr', expr);
          onentry.appendChild(assignElement);
        } else if (action.startsWith('log')) {
          // Handle log actions
          const logElement = doc.createElementNS(scxmlNamespace, 'log');
          logElement.setAttribute('label', 'Action');
          logElement.setAttribute('expr', action);
          onentry.appendChild(logElement);
        } else {
          // Fallback for legacy format
          const executable = doc.createElementNS(scxmlNamespace, 'executable');
          executable.setAttribute('label', 'Action');
          executable.setAttribute('expr', action);
          onentry.appendChild(executable);
        }
      });
      stateElement.appendChild(onentry);
    }

    // Update onexit actions
    if (existingOnexit) {
      stateElement.removeChild(existingOnexit);
    }

    if (this.exitActions.length > 0) {
      // Get the namespace from the root element
      const scxmlNamespace = doc.documentElement.namespaceURI || 'http://www.w3.org/2005/07/scxml';
      const onexit = doc.createElementNS(scxmlNamespace, 'onexit');

      this.exitActions.forEach((action) => {
        // Parse action format: "assign|location|expr" or simple string
        if (action.startsWith('assign|')) {
          const parts = action.split('|');
          const location = parts[1] || '';
          const expr = parts[2] || '';
          const assignElement = doc.createElementNS(scxmlNamespace, 'assign');
          if (location) assignElement.setAttribute('location', location);
          if (expr) assignElement.setAttribute('expr', expr);
          onexit.appendChild(assignElement);
        } else if (action.startsWith('log')) {
          // Handle log actions
          const logElement = doc.createElementNS(scxmlNamespace, 'log');
          logElement.setAttribute('label', 'Action');
          logElement.setAttribute('expr', action);
          onexit.appendChild(logElement);
        } else {
          // Fallback for legacy format
          const executable = doc.createElementNS(scxmlNamespace, 'executable');
          executable.setAttribute('label', 'Action');
          executable.setAttribute('expr', action);
          onexit.appendChild(executable);
        }
      });
      stateElement.appendChild(onexit);
    }

    // Serialize and return
    const newContent = this.serializeXML(doc);
    return this.createSuccessResult(newContent, [this.nodeId]);
  }

  undo(scxmlContent: string): CommandResult {
    if (this.oldEntryActions === undefined || this.oldExitActions === undefined) {
      return this.createFailureResult(
        'No previous actions to restore',
        scxmlContent
      );
    }

    // Create inverse command with old actions
    const inverseCommand = new UpdateActionsCommand(
      this.nodeId,
      this.oldEntryActions,
      this.oldExitActions
    );

    return inverseCommand.execute(scxmlContent);
  }

  getDescription(): string {
    const entryCount = this.entryActions.length;
    const exitCount = this.exitActions.length;
    const parts = [];
    if (entryCount > 0) parts.push(`${entryCount} entry action${entryCount > 1 ? 's' : ''}`);
    if (exitCount > 0) parts.push(`${exitCount} exit action${exitCount > 1 ? 's' : ''}`);
    return `Update actions: ${parts.join(', ') || 'no actions'}`;
  }

  /**
   * Extract actions from onentry/onexit element, preserving format
   */
  private extractActionsFromElement(element: Element): string[] {
    const actions: string[] = [];
    const children = Array.from(element.children);

    for (const child of children) {
      const tagName = child.tagName.toLowerCase();

      if (tagName === 'assign') {
        const location = child.getAttribute('location') || '';
        const expr = child.getAttribute('expr') || '';
        actions.push(`assign|${location}|${expr}`);
      } else if (tagName === 'log') {
        const label = child.getAttribute('label') || '';
        const expr = child.getAttribute('expr') || '';
        actions.push(`log|${label}|${expr}`);
      } else if (tagName === 'executable') {
        // Legacy format
        const expr = child.getAttribute('expr') || '';
        actions.push(expr);
      }
    }

    return actions;
  }
}
