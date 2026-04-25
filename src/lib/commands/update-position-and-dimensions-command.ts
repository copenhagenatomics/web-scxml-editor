import { BaseCommand, type CommandResult } from './base-command';

/**
 * UpdatePositionAndDimensionsCommand
 *
 * Updates all four values in viz:xywh attribute (x, y, width, height)
 * This is the most common command used for resize operations
 */
export class UpdatePositionAndDimensionsCommand extends BaseCommand {
  private oldX?: number;
  private oldY?: number;
  private oldWidth?: number;
  private oldHeight?: number;

  constructor(
    private nodeId: string,
    private newX: number,
    private newY: number,
    private newWidth: number,
    private newHeight: number
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

    // Parse existing viz:xywh to save for undo
    const vizXywh = stateElement.getAttribute('viz:xywh');
    if (vizXywh) {
      const parts = vizXywh.split(',').map(p => parseFloat(p.trim()));
      if (parts.length >= 4) {
        this.oldX = parts[0];
        this.oldY = parts[1];
        this.oldWidth = parts[2];
        this.oldHeight = parts[3];
      }
    }

    // Update viz:xywh with all four values
    const newVizXywh = `${Math.round(this.newX)},${Math.round(this.newY)},${Math.round(this.newWidth)},${Math.round(this.newHeight)}`;
    stateElement.setAttribute('viz:xywh', newVizXywh);

    // Serialize and return
    const newContent = this.serializeXML(doc);
    return this.createSuccessResult(newContent, [this.nodeId]);
  }

  undo(scxmlContent: string): CommandResult {
    if (this.oldX === undefined || this.oldY === undefined ||
        this.oldWidth === undefined || this.oldHeight === undefined) {
      return this.createFailureResult(
        'No previous state to restore',
        scxmlContent
      );
    }

    // Create inverse command with old values
    const inverseCommand = new UpdatePositionAndDimensionsCommand(
      this.nodeId,
      this.oldX,
      this.oldY,
      this.oldWidth,
      this.oldHeight
    );

    return inverseCommand.execute(scxmlContent);
  }

  getDescription(): string {
    return `Resize and move "${this.nodeId}" to (${Math.round(this.newX)}, ${Math.round(this.newY)}) ${Math.round(this.newWidth)}×${Math.round(this.newHeight)}`;
  }
}
