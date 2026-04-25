import { BaseCommand, type CommandResult } from './base-command';

/**
 * BatchUpdatePositionCommand
 *
 * Updates positions for multiple nodes in a single operation
 * Used for multi-select drag operations
 */
export class BatchUpdatePositionCommand extends BaseCommand {
  private oldPositions: Map<string, { x: number; y: number }> = new Map();

  constructor(
    private updates: Array<{ nodeId: string; x: number; y: number }>
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

    const affectedElements: string[] = [];

    // Process all position updates
    for (const update of this.updates) {
      const stateElement = this.findStateElement(doc, update.nodeId);
      if (!stateElement) {
        console.warn(`State element not found: ${update.nodeId}`);
        continue;
      }

      // Parse existing viz:xywh
      const vizXywh = stateElement.getAttribute('viz:xywh');
      let width = 160; // Default width
      let height = 80; // Default height

      if (vizXywh) {
        const parts = vizXywh.split(',').map((p) => parseFloat(p.trim()));
        if (parts.length >= 4) {
          // Save old position for undo
          this.oldPositions.set(update.nodeId, { x: parts[0], y: parts[1] });
          // Keep existing dimensions
          width = parts[2];
          height = parts[3];
        }
      }

      // Update viz:xywh with new position but same dimensions
      const newVizXywh = `${Math.round(update.x)},${Math.round(update.y)},${Math.round(width)},${Math.round(height)}`;
      stateElement.setAttribute('viz:xywh', newVizXywh);
      affectedElements.push(update.nodeId);
    }

    // Serialize and return
    const newContent = this.serializeXML(doc);
    return this.createSuccessResult(newContent, affectedElements);
  }

  undo(scxmlContent: string): CommandResult {
    if (this.oldPositions.size === 0) {
      return this.createFailureResult(
        'No previous positions to restore',
        scxmlContent
      );
    }

    // Create inverse command with old positions
    const undoUpdates = Array.from(this.oldPositions.entries()).map(
      ([nodeId, pos]) => ({
        nodeId,
        x: pos.x,
        y: pos.y,
      })
    );

    const inverseCommand = new BatchUpdatePositionCommand(undoUpdates);
    return inverseCommand.execute(scxmlContent);
  }

  getDescription(): string {
    if (this.updates.length === 1) {
      const update = this.updates[0];
      return `Move "${update.nodeId}" to (${Math.round(update.x)}, ${Math.round(update.y)})`;
    }
    return `Move ${this.updates.length} states`;
  }
}
