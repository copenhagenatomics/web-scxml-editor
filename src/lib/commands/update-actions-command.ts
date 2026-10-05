import { BaseCommand, type CommandResult } from './base-command';
import { clearWaypointsForTouchingTransitions } from './waypoint-invalidation';

/**
 * UpdateActionsCommand
 *
 * Updates onentry and onexit actions for a state element
 * Handles creating/removing onentry and onexit elements based on action arrays
 *
 * The entry/exit action count also changes the node's rendered height (see
 * NodeDimensionCalculator), so stale persisted `viz:waypoints` on
 * transitions touching it are cleared too (see waypoint-invalidation.ts).
 * Undo re-runs execute() with the old actions, which naturally re-clears
 * them as the node resizes back — no explicit restore needed here.
 */
export class UpdateActionsCommand extends BaseCommand {
  private oldEntryActions?: string[];
  private oldExitActions?: string[];

  constructor(
    private nodeId: string,
    private entryActions: string[],
    private exitActions: string[]
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

    // Store old actions for undo (collect from ALL onentry/onexit elements)
    const allOnentry = Array.from(stateElement.children).filter(
      child => child.tagName.toLowerCase() === 'onentry'
    );
    this.oldEntryActions = allOnentry.flatMap(el => this.extractActionsFromElement(el));

    const allOnexit = Array.from(stateElement.children).filter(
      child => child.tagName.toLowerCase() === 'onexit'
    );
    this.oldExitActions = allOnexit.flatMap(el => this.extractActionsFromElement(el));

    // Update onentry actions — remove ALL existing onentry elements
    allOnentry.forEach(el => stateElement.removeChild(el));

    if (this.entryActions.length > 0) {
      // Get the namespace from the root element
      const scxmlNamespace = doc.documentElement.namespaceURI || 'http://www.w3.org/2005/07/scxml';
      const onentry = doc.createElementNS(scxmlNamespace, 'onentry');

      this.entryActions.forEach((action) => {
        if (action.startsWith('assign|')) {
          const parts = action.split('|');
          const location = parts[1] || '';
          // Rejoin the tail: expr may itself contain '|' (e.g. `a || b`)
          const expr = parts.slice(2).join('|');
          const assignElement = doc.createElementNS(scxmlNamespace, 'assign');
          if (location) assignElement.setAttribute('location', location);
          if (expr) assignElement.setAttribute('expr', expr);
          onentry.appendChild(assignElement);
        } else if (action.startsWith('send|')) {
          const parts = action.split('|');
          const event = parts[1] || '';
          const delayType = parts[2] || 'delay';
          const delayValue = parts.slice(3).join('|');
          const sendElement = doc.createElementNS(scxmlNamespace, 'send');
          if (event) sendElement.setAttribute('event', event);
          if (delayValue) sendElement.setAttribute(delayType, delayValue);
          onentry.appendChild(sendElement);
        } else if (action.startsWith('log')) {
          const logElement = doc.createElementNS(scxmlNamespace, 'log');
          logElement.setAttribute('label', 'Action');
          logElement.setAttribute('expr', action);
          onentry.appendChild(logElement);
        } else {
          const executable = doc.createElementNS(scxmlNamespace, 'executable');
          executable.setAttribute('label', 'Action');
          executable.setAttribute('expr', action);
          onentry.appendChild(executable);
        }
      });
      stateElement.appendChild(onentry);
    }

    // Update onexit actions — remove ALL existing onexit elements
    allOnexit.forEach(el => stateElement.removeChild(el));

    if (this.exitActions.length > 0) {
      const scxmlNamespace = doc.documentElement.namespaceURI || 'http://www.w3.org/2005/07/scxml';
      const onexit = doc.createElementNS(scxmlNamespace, 'onexit');

      this.exitActions.forEach((action) => {
        if (action.startsWith('assign|')) {
          const parts = action.split('|');
          const location = parts[1] || '';
          const expr = parts.slice(2).join('|');
          const assignElement = doc.createElementNS(scxmlNamespace, 'assign');
          if (location) assignElement.setAttribute('location', location);
          if (expr) assignElement.setAttribute('expr', expr);
          onexit.appendChild(assignElement);
        } else if (action.startsWith('cancel|')) {
          const parts = action.split('|');
          const sendid = parts[1] || '';
          const cancelElement = doc.createElementNS(scxmlNamespace, 'cancel');
          if (sendid) cancelElement.setAttribute('sendid', sendid);
          onexit.appendChild(cancelElement);
        } else if (action.startsWith('log')) {
          const logElement = doc.createElementNS(scxmlNamespace, 'log');
          logElement.setAttribute('label', 'Action');
          logElement.setAttribute('expr', action);
          onexit.appendChild(logElement);
        } else {
          const executable = doc.createElementNS(scxmlNamespace, 'executable');
          executable.setAttribute('label', 'Action');
          executable.setAttribute('expr', action);
          onexit.appendChild(executable);
        }
      });
      stateElement.appendChild(onexit);
    }

    clearWaypointsForTouchingTransitions(doc, this.nodeId);

    // Serialize and return
    const newContent = this.serializeXML(doc);
    return this.createSuccessResult(newContent, [this.nodeId]);
  }

  undo(scxmlContent: string): CommandResult {
    if (this.oldEntryActions === undefined || this.oldExitActions === undefined) {
      return this.createFailureResult(
        'No previous actions to restore',
        scxmlContent
      );
    }

    // Create inverse command with old actions
    const inverseCommand = new UpdateActionsCommand(
      this.nodeId,
      this.oldEntryActions,
      this.oldExitActions
    );

    return inverseCommand.execute(scxmlContent);
  }

  getDescription(): string {
    const entryCount = this.entryActions.length;
    const exitCount = this.exitActions.length;
    const parts = [];
    if (entryCount > 0) parts.push(`${entryCount} entry action${entryCount > 1 ? 's' : ''}`);
    if (exitCount > 0) parts.push(`${exitCount} exit action${exitCount > 1 ? 's' : ''}`);
    return `Update actions: ${parts.join(', ') || 'no actions'}`;
  }

  /**
   * Extract actions from onentry/onexit element, preserving format
   */
  private extractActionsFromElement(element: Element): string[] {
    const actions: string[] = [];
    const children = Array.from(element.children);

    for (const child of children) {
      const tagName = child.tagName.toLowerCase();

      if (tagName === 'assign') {
        const location = child.getAttribute('location') || '';
        const expr = child.getAttribute('expr') || '';
        actions.push(`assign|${location}|${expr}`);
      } else if (tagName === 'send') {
        const event = child.getAttribute('event') || '';
        const delayexpr = child.getAttribute('delayexpr');
        const delay = child.getAttribute('delay');
        const delayType = delayexpr !== null ? 'delayexpr' : 'delay';
        const delayValue = delayexpr ?? delay ?? '';
        actions.push(`send|${event}|${delayType}|${delayValue}`);
      } else if (tagName === 'cancel') {
        const sendid = child.getAttribute('sendid') || '';
        actions.push(`cancel|${sendid}`);
      } else if (tagName === 'log') {
        const label = child.getAttribute('label') || '';
        const expr = child.getAttribute('expr') || '';
        actions.push(`log|${label}|${expr}`);
      } else if (tagName === 'executable') {
        const expr = child.getAttribute('expr') || '';
        actions.push(expr);
      }
    }

    return actions;
  }
}
