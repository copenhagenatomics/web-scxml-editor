import { BaseCommand, type CommandResult } from './base-command';

/**
 * UpdateWaypointsCommand
 *
 * Updates the viz:waypoints attribute on a transition element
 * Used for waypoint add, delete, and drag operations
 */
export class UpdateWaypointsCommand extends BaseCommand {
  private oldWaypoints?: string;

  constructor(
    private sourceId: string,
    private targetId: string,
    private event: string | undefined,
    private condition: string | undefined,
    private waypoints: Array<{ x: number; y: number }>
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

    // Store old waypoints for undo
    this.oldWaypoints = targetTransition.getAttribute('viz:waypoints') || '';

    if (this.waypoints.length === 0) {
      // Remove waypoints attribute if no waypoints
      targetTransition.removeAttribute('viz:waypoints');
    } else {
      // Serialize waypoints as "x1,y1;x2,y2;..."
      const waypointsString = this.waypoints
        .map((wp) => `${Math.round(wp.x)},${Math.round(wp.y)}`)
        .join(';');

      targetTransition.setAttribute('viz:waypoints', waypointsString);
    }

    // Serialize and return
    const newContent = this.serializeXML(doc);
    return this.createSuccessResult(newContent, [this.sourceId]);
  }

  undo(scxmlContent: string): CommandResult {
    if (this.oldWaypoints === undefined) {
      return this.createFailureResult(
        'No previous waypoints to restore',
        scxmlContent
      );
    }

    // Parse old waypoints string back to array
    const oldWaypointsArray: Array<{ x: number; y: number }> = [];
    if (this.oldWaypoints) {
      const parts = this.oldWaypoints.split(';');
      for (const part of parts) {
        const [x, y] = part.split(',').map(s => parseFloat(s.trim()));
        if (!isNaN(x) && !isNaN(y)) {
          oldWaypointsArray.push({ x, y });
        }
      }
    }

    // Create inverse command with old waypoints
    const inverseCommand = new UpdateWaypointsCommand(
      this.sourceId,
      this.targetId,
      this.event,
      this.condition,
      oldWaypointsArray
    );

    return inverseCommand.execute(scxmlContent);
  }

  getDescription(): string {
    if (this.waypoints.length === 0) {
      return `Remove waypoints from transition`;
    }
    return `Update transition waypoints (${this.waypoints.length} points)`;
  }
}
