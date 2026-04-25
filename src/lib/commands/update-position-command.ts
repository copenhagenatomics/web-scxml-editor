import { BaseCommand, type CommandResult } from './base-command';

/**
 * UpdatePositionCommand
 *
 * Updates only the x,y values in viz:xywh attribute
 * Preserves existing width and height
 * Used for drag operations (move without resize)
 */
export class UpdatePositionCommand extends BaseCommand {
  private oldX?: number;
  private oldY?: number;

  constructor(
    private nodeId: string,
    private newX: number,
    private newY: number
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

    // Find the state element
    const stateElement = this.findStateElement(doc, this.nodeId);
    if (!stateElement) {
      return this.createFailureResult(
        `State element not found: ${this.nodeId}`,
        scxmlContent
      );
    }

    // Parse existing viz:xywh
    const vizXywh = stateElement.getAttribute('viz:xywh');
    let width = 160; // Default width
    let height = 80;  // Default height

    if (vizXywh) {
      const parts = vizXywh.split(',').map(p => parseFloat(p.trim()));
      if (parts.length >= 4) {
        // Save old position for undo
        this.oldX = parts[0];
        this.oldY = parts[1];
        // Keep existing dimensions
        width = parts[2];
        height = parts[3];
      }
    }

    // Update viz:xywh with new position but same dimensions
    const newVizXywh = `${Math.round(this.newX)},${Math.round(this.newY)},${Math.round(width)},${Math.round(height)}`;
    stateElement.setAttribute('viz:xywh', newVizXywh);

    // Serialize and return
    const newContent = this.serializeXML(doc);
    return this.createSuccessResult(newContent, [this.nodeId]);
  }

  undo(scxmlContent: string): CommandResult {
    if (this.oldX === undefined || this.oldY === undefined) {
      return this.createFailureResult(
        'No previous position to restore',
        scxmlContent
      );
    }

    // Create inverse command with old position
    const inverseCommand = new UpdatePositionCommand(
      this.nodeId,
      this.oldX,
      this.oldY
    );

    return inverseCommand.execute(scxmlContent);
  }

  getDescription(): string {
    return `Move "${this.nodeId}" to (${Math.round(this.newX)}, ${Math.round(this.newY)})`;
  }
}
