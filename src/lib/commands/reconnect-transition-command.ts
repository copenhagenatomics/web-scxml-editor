import { BaseCommand, type CommandResult } from './base-command';

/**
 * ReconnectTransitionCommand
 *
 * Updates a transition's source and/or target state, and/or handles
 * Allows dragging edge endpoints to reconnect transitions
 */
export class ReconnectTransitionCommand extends BaseCommand {
  private oldSourceId: string;
  private oldTargetId: string;

  constructor(
    oldSourceId: string,
    oldTargetId: string,
    private newSourceId: string | null,
    private newTargetId: string | null,
    private event?: string,
    private cond?: string,
    private oldSourceHandle?: string,
    private oldTargetHandle?: string,
    private newSourceHandle?: string,
    private newTargetHandle?: string
  ) {
    super();
    this.oldSourceId = oldSourceId;
    this.oldTargetId = oldTargetId;
  }

  execute(scxmlContent: string): CommandResult {
    const { doc, error } = this.parseXML(scxmlContent);
    if (!doc) {
      return this.createFailureResult(
        error || 'Failed to parse XML',
        scxmlContent
      );
    }

    // Determine actual new source and target (null means no change)
    const finalNewSourceId = this.newSourceId || this.oldSourceId;
    const finalNewTargetId = this.newTargetId || this.oldTargetId;

    // Check if handles changed
    const sourceHandleChanged = this.newSourceHandle !== this.oldSourceHandle;
    const targetHandleChanged = this.newTargetHandle !== this.oldTargetHandle;

    // Validation: Prevent no-op reconnections (no change in nodes or handles)
    if (
      finalNewSourceId === this.oldSourceId &&
      finalNewTargetId === this.oldTargetId &&
      !sourceHandleChanged &&
      !targetHandleChanged
    ) {
      return this.createFailureResult(
        'No change in source, target, or handles',
        scxmlContent
      );
    }

    // Self-loops are now allowed to support transitions that re-enter the same state

    // Find the old source state element
    const oldSourceElement = this.findStateElement(doc, this.oldSourceId);
    if (!oldSourceElement) {
      return this.createFailureResult(
        `Source state not found: ${this.oldSourceId}`,
        scxmlContent
      );
    }

    // Find the specific transition to reconnect
    const transitions = oldSourceElement.querySelectorAll('transition');
    let transitionElement: Element | null = null;

    for (const transition of Array.from(transitions)) {
      const transitionTarget = transition.getAttribute('target');
      const transitionEvent = transition.getAttribute('event');
      const transitionCond = transition.getAttribute('cond');

      // Match by target and either event or condition
      const isMatch =
        transitionTarget === this.oldTargetId &&
        ((this.event && transitionEvent === this.event) ||
          (this.cond && transitionCond === this.cond) ||
          (!this.event &&
            !this.cond &&
            !transitionEvent &&
            !transitionCond));

      if (isMatch) {
        transitionElement = transition;
        break;
      }
    }

    if (!transitionElement) {
      return this.createFailureResult(
        `Transition not found from ${this.oldSourceId} to ${this.oldTargetId}`,
        scxmlContent
      );
    }

    // Ensure viz namespace exists
    this.ensureVizNamespace(doc);

    // Clone the transition element to preserve all attributes and children
    const clonedTransition = transitionElement.cloneNode(true) as Element;

    // Update target attribute if target changed
    if (finalNewTargetId !== this.oldTargetId) {
      clonedTransition.setAttribute('target', finalNewTargetId);
    }

    // Update handle attributes if they changed
    if (sourceHandleChanged) {
      if (this.newSourceHandle) {
        clonedTransition.setAttribute('viz:sourceHandle', this.newSourceHandle);
      } else {
        clonedTransition.removeAttribute('viz:sourceHandle');
      }
    }

    if (targetHandleChanged) {
      if (this.newTargetHandle) {
        clonedTransition.setAttribute('viz:targetHandle', this.newTargetHandle);
      } else {
        clonedTransition.removeAttribute('viz:targetHandle');
      }
    }

    // If source changed, move transition to new source state
    if (finalNewSourceId !== this.oldSourceId) {
      const newSourceElement = this.findStateElement(doc, finalNewSourceId);
      if (!newSourceElement) {
        return this.createFailureResult(
          `New source state not found: ${finalNewSourceId}`,
          scxmlContent
        );
      }

      // Remove transition from old source
      transitionElement.remove();

      // Append to new source
      newSourceElement.appendChild(clonedTransition);
    } else {
      // Same source, just update in place
      oldSourceElement.replaceChild(clonedTransition, transitionElement);
    }

    // Serialize and return
    const newContent = this.serializeXML(doc);
    return this.createSuccessResult(newContent, [
      this.oldSourceId,
      finalNewSourceId,
      finalNewTargetId,
    ]);
  }

  undo(scxmlContent: string): CommandResult {
    // Create inverse command that reverses the reconnection
    const inverseCommand = new ReconnectTransitionCommand(
      this.newSourceId || this.oldSourceId,
      this.newTargetId || this.oldTargetId,
      this.oldSourceId,
      this.oldTargetId,
      this.event,
      this.cond,
      this.newSourceHandle,
      this.newTargetHandle,
      this.oldSourceHandle,
      this.oldTargetHandle
    );

    return inverseCommand.execute(scxmlContent);
  }

  getDescription(): string {
    const sourceChanged = this.newSourceId && this.newSourceId !== this.oldSourceId;
    const targetChanged = this.newTargetId && this.newTargetId !== this.oldTargetId;

    if (sourceChanged && targetChanged) {
      return `Reconnect transition from ${this.oldSourceId}→${this.oldTargetId} to ${this.newSourceId}→${this.newTargetId}`;
    } else if (sourceChanged) {
      return `Reconnect transition source from ${this.oldSourceId} to ${this.newSourceId}`;
    } else if (targetChanged) {
      return `Reconnect transition target from ${this.oldTargetId} to ${this.newTargetId}`;
    }
    return 'Reconnect transition';
  }
}
