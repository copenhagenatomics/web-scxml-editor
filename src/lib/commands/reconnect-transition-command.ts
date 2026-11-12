import { BaseCommand, type CommandResult } from './base-command';
import { findTimeEventToken, generateTimeEventName } from '../utils/time-transition';

/**
 * ReconnectTransitionCommand
 *
 * Updates a transition's source and/or target state, and/or handles
 * Allows dragging edge endpoints to reconnect transitions
 *
 * When the source changes on an "after X" time transition, the timer that
 * drives it lives in the source state (onentry `<send event=token>` and onexit
 * `<cancel sendid=token>`), so those move with the transition, and the token
 * (`{sourceId}_t_N_timeEvent_N`) is re-issued for the new source.
 */
export class ReconnectTransitionCommand extends BaseCommand {
  private oldSourceId: string;
  private oldTargetId: string;
  // Event value the transition carries after execute() (differs from `event`
  // when a time-event token was re-issued for a new source); undo() matches on it.
  private executedEvent?: string;

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
    private newTargetHandle?: string,
    // Used by undo() to restore the exact original time-event token instead of
    // generating a fresh one for the original source.
    private preferredTimeEventName?: string
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

      this.moveTimeEvent(
        doc,
        scxmlContent,
        clonedTransition,
        oldSourceElement,
        newSourceElement,
        finalNewSourceId
      );
    } else {
      // Same source, just update in place
      oldSourceElement.replaceChild(clonedTransition, transitionElement);
    }

    this.executedEvent = clonedTransition.getAttribute('event') ?? undefined;

    // Serialize and return
    const newContent = this.serializeXML(doc);
    return this.createSuccessResult(newContent, [
      this.oldSourceId,
      finalNewSourceId,
      finalNewTargetId,
    ]);
  }

  /**
   * Moves the timer backing a time-event transition from the old source to the
   * new one and re-issues its token for the new source. The token is rewritten
   * only inside the (possibly comma-merged) event list, never by substring.
   * If another transition still left on the old source uses the same token,
   * the old source keeps its send/cancel and the new source gets copies.
   */
  private moveTimeEvent(
    doc: Document,
    scxmlContent: string,
    transition: Element,
    oldSourceElement: Element,
    newSourceElement: Element,
    newSourceId: string
  ): void {
    const eventAttr = transition.getAttribute('event') ?? undefined;
    const oldToken = findTimeEventToken(eventAttr);
    if (!eventAttr || !oldToken) return;

    const newToken =
      this.preferredTimeEventName ?? generateTimeEventName(newSourceId, scxmlContent);

    const directChildren = (parent: Element, tag: string) =>
      Array.from(parent.children).filter((c) => c.tagName.toLowerCase() === tag);

    const stillUsedByOldSource = directChildren(oldSourceElement, 'transition').some(
      (t) => findTimeEventToken(t.getAttribute('event') ?? undefined) === oldToken
    );

    const findActions = (blockTag: 'onentry' | 'onexit', actionTag: 'send' | 'cancel', attr: 'event' | 'sendid') =>
      directChildren(oldSourceElement, blockTag).flatMap((block) =>
        directChildren(block, actionTag).filter((a) => a.getAttribute(attr) === oldToken)
      );

    // No timer owned by the old source (e.g. hand-written, sent from elsewhere):
    // leave the event untouched rather than renaming it away from its sender.
    if (findActions('onentry', 'send', 'event').length === 0) return;

    const relocate = (blockTag: 'onentry' | 'onexit', actionTag: 'send' | 'cancel', attr: 'event' | 'sendid') => {
      const matches = findActions(blockTag, actionTag, attr);
      if (matches.length === 0) return;

      let targetBlock = directChildren(newSourceElement, blockTag).pop();
      if (!targetBlock) {
        const ns = doc.documentElement.namespaceURI || 'http://www.w3.org/2005/07/scxml';
        targetBlock = doc.createElementNS(ns, blockTag);
        newSourceElement.appendChild(targetBlock);
      }

      for (const action of matches) {
        const block = action.parentElement;
        const moved = stillUsedByOldSource ? (action.cloneNode(true) as Element) : action;
        moved.setAttribute(attr, newToken);
        targetBlock.appendChild(moved);
        if (!stillUsedByOldSource && block && block.children.length === 0) {
          block.remove();
        }
      }
    };

    relocate('onentry', 'send', 'event');
    relocate('onexit', 'cancel', 'sendid');

    const tokens = eventAttr.split(',').map((t) => t.trim());
    transition.setAttribute(
      'event',
      tokens.map((t) => (t === oldToken ? newToken : t)).join(', ')
    );
  }

  undo(scxmlContent: string): CommandResult {
    // Create inverse command that reverses the reconnection. A re-issued
    // time-event token is matched by its new name and restored to the original.
    const sourceChanged =
      !!this.newSourceId && this.newSourceId !== this.oldSourceId;
    const inverseCommand = new ReconnectTransitionCommand(
      this.newSourceId || this.oldSourceId,
      this.newTargetId || this.oldTargetId,
      this.oldSourceId,
      this.oldTargetId,
      this.executedEvent ?? this.event,
      this.cond,
      this.newSourceHandle,
      this.newTargetHandle,
      this.oldSourceHandle,
      this.oldTargetHandle,
      sourceChanged ? findTimeEventToken(this.event) : undefined
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
