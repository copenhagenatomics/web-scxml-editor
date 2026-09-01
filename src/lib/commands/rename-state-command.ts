import { BaseCommand, type CommandResult } from './base-command';
import { clearWaypointsForTouchingTransitions } from './waypoint-invalidation';
import { renameTimeEventTokensInEventList } from '../utils/time-transition';

/**
 * RenameStateCommand
 *
 * Renames a state and updates all references to it
 * - Updates the state's @id attribute
 * - Updates all transition @target attributes pointing to this state
 * - Updates parent's @initial attribute if it points to this state
 * - Updates auto-generated time-event tokens ({oldId}_t_N_timeEvent_N) that
 *   this state's own transitions/send/cancel elements carry, since that
 *   naming bakes the id in as a literal string rather than deriving it live
 *
 * A longer/shorter id also changes the node's rendered width (see
 * NodeDimensionCalculator, which sizes by label length — the label is the
 * state id), so stale persisted `viz:waypoints` on transitions touching it
 * are cleared too (see waypoint-invalidation.ts). Undo re-runs execute()
 * with the names swapped, which naturally re-clears them as the node
 * resizes back — no explicit restore needed here.
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

    // Rewrite this state's own time-event tokens (transition @event, onentry
    // send @event, onexit cancel @sendid) — auto-generated names bake the
    // state id in literally, so a rename leaves them stale otherwise.
    Array.from(stateElement.children).forEach((child) => {
      const tag = child.tagName.toLowerCase();

      if (tag === 'transition') {
        const eventAttr = child.getAttribute('event');
        const renamed = renameTimeEventTokensInEventList(eventAttr ?? undefined, this.stateId, this.newId);
        if (renamed !== undefined && renamed !== eventAttr) {
          child.setAttribute('event', renamed);
        }
      }

      if (tag === 'onentry' || tag === 'onexit') {
        Array.from(child.children).forEach((action) => {
          const actionTag = action.tagName.toLowerCase();
          if (actionTag === 'send') {
            const eventAttr = action.getAttribute('event');
            const renamed = renameTimeEventTokensInEventList(eventAttr ?? undefined, this.stateId, this.newId);
            if (renamed !== undefined && renamed !== eventAttr) {
              action.setAttribute('event', renamed);
            }
          } else if (actionTag === 'cancel') {
            const sendidAttr = action.getAttribute('sendid');
            const renamed = renameTimeEventTokensInEventList(sendidAttr ?? undefined, this.stateId, this.newId);
            if (renamed !== undefined && renamed !== sendidAttr) {
              action.setAttribute('sendid', renamed);
            }
          }
        });
      }
    });

    // Update all transitions that target this state
    const transitions = doc.querySelectorAll(`transition[target="${this.stateId}"]`);
    transitions.forEach((transition) => {
      transition.setAttribute('target', this.newId);
    });

    // Update parent's initial attribute if it references this state — token-aware
    // so a multi-value list ("A B") only has the renamed token replaced, not wiped.
    const elementsWithInitial = doc.querySelectorAll('[initial]');
    elementsWithInitial.forEach((element) => {
      const tokens = (element.getAttribute('initial') || '').split(/\s+/).filter(Boolean);
      if (tokens.includes(this.stateId)) {
        const updated = tokens.map((t) => (t === this.stateId ? this.newId : t));
        element.setAttribute('initial', updated.join(' '));
      }
    });

    clearWaypointsForTouchingTransitions(doc, this.newId);

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
