import { BaseCommand, type CommandResult } from './base-command';

/**
 * RenameStateCommand
 *
 * Renames a state and updates all references to it
 * - Updates the state's @id attribute
 * - Updates all transition @target attributes pointing to this state
 * - Updates parent's @initial attribute if it points to this state
 */
export class RenameStateCommand extends BaseCommand {
  private oldId?: string;

  constructor(
    private stateId: string,
    private newId: string
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
    const stateElement = this.findStateElement(doc, this.stateId);
    if (!stateElement) {
      return this.createFailureResult(
        `State element not found: ${this.stateId}`,
        scxmlContent
      );
    }

    // Store old ID for undo
    this.oldId = this.stateId;

    // Update the state's ID
    stateElement.setAttribute('id', this.newId);

    // Update all transitions that target this state
    const transitions = doc.querySelectorAll(`transition[target="${this.stateId}"]`);
    transitions.forEach((transition) => {
      transition.setAttribute('target', this.newId);
    });

    // Update parent's initial attribute if it points to this state
    const parentsWithInitial = doc.querySelectorAll(`[initial="${this.stateId}"]`);
    parentsWithInitial.forEach((parent) => {
      parent.setAttribute('initial', this.newId);
    });

    // Serialize and return
    const newContent = this.serializeXML(doc);
    return this.createSuccessResult(newContent, [this.stateId, this.newId]);
  }

  undo(scxmlContent: string): CommandResult {
    if (!this.oldId) {
      return this.createFailureResult(
        'No previous ID to restore',
        scxmlContent
      );
    }

    // Create inverse command
    const inverseCommand = new RenameStateCommand(this.newId, this.oldId);
    return inverseCommand.execute(scxmlContent);
  }

  getDescription(): string {
    return `Rename "${this.stateId}" to "${this.newId}"`;
  }
}
