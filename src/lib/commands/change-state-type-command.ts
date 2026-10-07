import { BaseCommand, type CommandResult } from './base-command';
import { clearWaypointsForTouchingTransitions } from './waypoint-invalidation';

/**
 * ChangeStateTypeCommand
 *
 * Changes the type of a state (simple, compound, parallel, final)
 * Handles cleanup operations like removing transitions and substates for final states
 *
 * State type also changes the node's rendered width/height (see
 * NodeDimensionCalculator, which sizes compound/parallel states larger than
 * simple/final ones), so stale persisted `viz:waypoints` on transitions
 * touching it are cleared too (see waypoint-invalidation.ts). Undo re-runs
 * execute() with the old type, which naturally re-clears them as the node
 * resizes back — no explicit restore needed here.
 */
export class ChangeStateTypeCommand extends BaseCommand {
  private oldStateType?: string;
  private oldTransitions?: string;
  private oldSubstates?: string;

  constructor(
    private nodeId: string,
    private newStateType: string
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

    // Store old state type for undo (based on element name)
    this.oldStateType = stateElement.tagName.toLowerCase();

    // Handle final state conversions
    if (this.newStateType === 'final') {
      // Store removed transitions for undo
      const transitions = stateElement.querySelectorAll('transition');
      if (transitions.length > 0) {
        const transitionsClone = doc.createElement('div');
        transitions.forEach((t) => transitionsClone.appendChild(t.cloneNode(true)));
        this.oldTransitions = transitionsClone.innerHTML;
      }

      // Store removed substates for undo
      const substates = stateElement.querySelectorAll('state');
      const parallels = stateElement.querySelectorAll('parallel');
      if (substates.length > 0 || parallels.length > 0) {
        const substatesClone = doc.createElement('div');
        substates.forEach((s) => substatesClone.appendChild(s.cloneNode(true)));
        parallels.forEach((p) => substatesClone.appendChild(p.cloneNode(true)));
        this.oldSubstates = substatesClone.innerHTML;
      }

      // Remove transitions (final states can't have outgoing transitions)
      transitions.forEach((transition) => stateElement.removeChild(transition));

      // Remove substates (final states can't have substates)
      substates.forEach((state) => stateElement.removeChild(state));
      parallels.forEach((parallel) => stateElement.removeChild(parallel));
    }

    // Log warning for parallel state conversion (not fully implemented)
    if (this.newStateType === 'parallel') {
      console.warn(
        'Converting to parallel state requires element type change - not fully implemented'
      );
    }

    // Note: Actual element type change (state -> parallel, etc.) would require
    // recreating the element, which is complex. For now, we just handle the
    // attribute and content changes. Full implementation would need:
    // 1. Create new element with correct tag name
    // 2. Copy all attributes and children
    // 3. Replace old element with new element

    clearWaypointsForTouchingTransitions(doc, this.nodeId);

    // Serialize and return
    const newContent = this.serializeXML(doc);
    return this.createSuccessResult(newContent, [this.nodeId]);
  }

  undo(scxmlContent: string): CommandResult {
    if (this.oldStateType === undefined) {
      return this.createFailureResult(
        'No previous state type to restore',
        scxmlContent
      );
    }

    // For undo, we would need to:
    // 1. Restore old state type
    // 2. Restore removed transitions (from this.oldTransitions)
    // 3. Restore removed substates (from this.oldSubstates)
    // This is complex and would require XML parsing of stored strings

    // For now, create a simple inverse command
    const inverseCommand = new ChangeStateTypeCommand(
      this.nodeId,
      this.oldStateType
    );

    return inverseCommand.execute(scxmlContent);
  }

  getDescription(): string {
    return `Change state type to "${this.newStateType}"`;
  }
}
