import { BaseCommand, type CommandResult } from './base-command';

export interface InternalEventAction {
  event: string;
  location: string;
  expr: string;
  type: 'internal' | 'external';
}

export class UpdateInternalEventsCommand extends BaseCommand {
  private oldActions?: InternalEventAction[];

  constructor(
    private nodeId: string,
    private actions: InternalEventAction[]
  ) {
    super();
  }

  execute(scxmlContent: string): CommandResult {
    const { doc, error } = this.parseXML(scxmlContent);
    if (!doc) {
      return this.createFailureResult(error || 'Failed to parse XML', scxmlContent);
    }

    const stateElement = this.findStateElement(doc, this.nodeId);
    if (!stateElement) {
      return this.createFailureResult(
        `State element not found: ${this.nodeId}`,
        scxmlContent
      );
    }

    // Snapshot existing internal transitions for undo
    this.oldActions = this.extractCurrentActions(stateElement);

    // Remove all existing targetless internal/external transitions (reactions)
    const toRemove = Array.from(stateElement.children).filter(
      (child) =>
        child.tagName.toLowerCase() === 'transition' &&
        !child.getAttribute('target') &&
        (child.getAttribute('type') === 'internal' || child.getAttribute('type') === 'external')
    );
    toRemove.forEach((el) => stateElement.removeChild(el));

    if (this.actions.length > 0) {
      const scxmlNS =
        doc.documentElement.namespaceURI || 'http://www.w3.org/2005/07/scxml';

      // Group rows by event name, preserving insertion order
      const grouped = new Map<string, InternalEventAction[]>();
      for (const action of this.actions) {
        if (!grouped.has(action.event)) grouped.set(action.event, []);
        grouped.get(action.event)!.push(action);
      }

      // Insert before the first cross-state (targeted) transition
      const firstCrossTransition =
        Array.from(stateElement.children).find(
          (child) =>
            child.tagName.toLowerCase() === 'transition' &&
            child.getAttribute('target')
        ) || null;

      for (const [eventName, rows] of grouped) {
        const transEl = doc.createElementNS(scxmlNS, 'transition');
        transEl.setAttribute('event', eventName);
        transEl.setAttribute('type', rows[0].type);
        for (const row of rows) {
          const assignEl = doc.createElementNS(scxmlNS, 'assign');
          assignEl.setAttribute('location', row.location);
          assignEl.setAttribute('expr', row.expr);
          transEl.appendChild(assignEl);
        }
        stateElement.insertBefore(transEl, firstCrossTransition);
      }
    }

    const newContent = this.serializeXML(doc);
    return this.createSuccessResult(newContent, [this.nodeId]);
  }

  undo(scxmlContent: string): CommandResult {
    if (!this.oldActions) {
      return this.createFailureResult(
        'No previous actions to restore',
        scxmlContent
      );
    }
    return new UpdateInternalEventsCommand(
      this.nodeId,
      this.oldActions
    ).execute(scxmlContent);
  }

  getDescription(): string {
    return `Update internal event reactions: ${this.actions.length} action(s)`;
  }

  private extractCurrentActions(stateElement: Element): InternalEventAction[] {
    const result: InternalEventAction[] = [];
    for (const child of Array.from(stateElement.children)) {
      if (
        child.tagName.toLowerCase() === 'transition' &&
        !child.getAttribute('target') &&
        (child.getAttribute('type') === 'internal' || child.getAttribute('type') === 'external')
      ) {
        const eventName = child.getAttribute('event') || '';
        const transType = (child.getAttribute('type') || 'internal') as 'internal' | 'external';
        for (const assign of Array.from(child.children)) {
          if (assign.tagName.toLowerCase() === 'assign') {
            result.push({
              event: eventName,
              location: assign.getAttribute('location') || '',
              expr: assign.getAttribute('expr') || '',
              type: transType,
            });
          }
        }
      }
    }
    return result;
  }
}
