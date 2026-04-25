import { BaseCommand, type CommandResult } from './base-command';

/**
 * DeleteNodeCommand
 *
 * Deletes state nodes from the SCXML document
 * Supports single or multiple node deletion
 * Handles cleanup:
 * - Removes transitions targeting the deleted states
 * - Updates initial state if needed
 */
export class DeleteNodeCommand extends BaseCommand {
  private deletedStatesBackup?: string; // Store full deleted state elements as XML for undo
  private nodeIds: string[];

  constructor(nodeIds: string | string[]) {
    super();
    this.nodeIds = Array.isArray(nodeIds) ? nodeIds : [nodeIds];
  }

  execute(scxmlContent: string): CommandResult {
    const { doc, error } = this.parseXML(scxmlContent);
    if (!doc) {
      return this.createFailureResult(
        error || 'Failed to parse XML',
        scxmlContent
      );
    }

    // Store deleted states for potential undo (would need full implementation)
    // For now, we'll create a simple backup of the entire SCXML for undo
    this.deletedStatesBackup = scxmlContent;

    // Delete all specified nodes
    for (const nodeId of this.nodeIds) {
      const stateElement = this.findStateElement(doc, nodeId);
      if (!stateElement) {
        console.warn(`State element not found for deletion: ${nodeId}`);
        continue;
      }

      // Remove the state from its parent
      this.removeStateFromParent(doc, nodeId);

      // Remove any transitions targeting this state
      this.removeTransitionsTargeting(doc, nodeId);
    }

    // Update initial state if any deleted state was the initial state
    const scxmlRoot = doc.documentElement;
    const initialStateId = scxmlRoot.getAttribute('initial');
    if (initialStateId && this.nodeIds.includes(initialStateId)) {
      // Find the first available state as new initial
      const firstState = this.findFirstAvailableState(doc);
      if (firstState) {
        scxmlRoot.setAttribute('initial', firstState);
      } else {
        scxmlRoot.removeAttribute('initial');
      }
    }

    // Serialize and return
    const newContent = this.serializeXML(doc);
    return this.createSuccessResult(newContent, this.nodeIds);
  }

  /**
   * Remove a state element from its parent
   */
  private removeStateFromParent(doc: Document, stateId: string): boolean {
    const stateElement = this.findStateElement(doc, stateId);
    if (!stateElement || !stateElement.parentNode) {
      return false;
    }

    stateElement.parentNode.removeChild(stateElement);
    return true;
  }

  /**
   * Remove all transitions targeting a specific state
   */
  private removeTransitionsTargeting(doc: Document, targetStateId: string): void {
    const allStates = doc.querySelectorAll('state, parallel, final');

    allStates.forEach((state) => {
      const transitions = state.querySelectorAll('transition');
      transitions.forEach((transition) => {
        const target = transition.getAttribute('target');
        if (target === targetStateId) {
          transition.parentNode?.removeChild(transition);
        }
      });
    });
  }

  /**
   * Find the first available state in the document
   */
  private findFirstAvailableState(doc: Document): string | null {
    const scxmlRoot = doc.documentElement;
    const firstState = scxmlRoot.querySelector('state');
    return firstState?.getAttribute('id') || null;
  }

  undo(scxmlContent: string): CommandResult {
    if (!this.deletedStatesBackup) {
      return this.createFailureResult(
        'No deleted states backup available for undo',
        scxmlContent
      );
    }

    // For a complete undo implementation, we would need to:
    // 1. Parse deletedStatesBackup to extract the deleted state elements
    // 2. Find their original parent locations
    // 3. Re-insert them at the correct positions
    // 4. Restore transitions targeting these states

    // For now, we'll use the simple approach of returning the full backup
    return this.createSuccessResult(this.deletedStatesBackup, this.nodeIds);
  }

  getDescription(): string {
    if (this.nodeIds.length === 1) {
      return `Delete state "${this.nodeIds[0]}"`;
    }
    return `Delete ${this.nodeIds.length} states`;
  }
}
