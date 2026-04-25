import { BaseCommand, type CommandResult } from './base-command';

/**
 * UpdateTransitionHandlesCommand
 *
 * Updates the viz:sourceHandle and viz:targetHandle attributes on a transition element
 * Used when creating or reconnecting edges to store which handles were used
 */
export class UpdateTransitionHandlesCommand extends BaseCommand {
  private oldSourceHandle?: string;
  private oldTargetHandle?: string;

  constructor(
    private sourceId: string,
    private targetId: string,
    private event: string | undefined,
    private condition: string | undefined,
    private sourceHandle?: string,
    private targetHandle?: string
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

    // Ensure viz namespace exists
    this.ensureVizNamespace(doc);

    // Find the source state element
    const sourceElement = this.findStateElement(doc, this.sourceId);
    if (!sourceElement) {
      return this.createFailureResult(
        `Source state not found: ${this.sourceId}`,
        scxmlContent
      );
    }

    // Find the specific transition
    const transitions = sourceElement.querySelectorAll('transition');
    let targetTransition: Element | null = null;

    for (const transition of Array.from(transitions)) {
      const target = transition.getAttribute('target');
      const transEvent = transition.getAttribute('event');
      const transCond = transition.getAttribute('cond');

      // Match transition by target and event/cond
      const eventMatches = (transEvent === this.event) || (!transEvent && !this.event);
      const condMatches = (transCond === this.condition) || (!transCond && !this.condition);

      if (target === this.targetId && eventMatches && condMatches) {
        targetTransition = transition;
        break;
      }
    }

    if (!targetTransition) {
      return this.createFailureResult(
        `Transition not found from ${this.sourceId} to ${this.targetId}`,
        scxmlContent
      );
    }

    // Store old handles for undo
    this.oldSourceHandle = targetTransition.getAttribute('viz:sourceHandle') || '';
    this.oldTargetHandle = targetTransition.getAttribute('viz:targetHandle') || '';

    // Update or remove sourceHandle attribute
    if (this.sourceHandle) {
      targetTransition.setAttribute('viz:sourceHandle', this.sourceHandle);
    } else {
      targetTransition.removeAttribute('viz:sourceHandle');
    }

    // Update or remove targetHandle attribute
    if (this.targetHandle) {
      targetTransition.setAttribute('viz:targetHandle', this.targetHandle);
    } else {
      targetTransition.removeAttribute('viz:targetHandle');
    }

    // Serialize and return
    const newContent = this.serializeXML(doc);
    return this.createSuccessResult(newContent, [this.sourceId]);
  }

  undo(scxmlContent: string): CommandResult {
    // Create inverse command with old handles
    const inverseCommand = new UpdateTransitionHandlesCommand(
      this.sourceId,
      this.targetId,
      this.event,
      this.condition,
      this.oldSourceHandle || undefined,
      this.oldTargetHandle || undefined
    );

    return inverseCommand.execute(scxmlContent);
  }

  getDescription(): string {
    return `Update transition handles (source: ${this.sourceHandle || 'none'}, target: ${this.targetHandle || 'none'})`;
  }
}
