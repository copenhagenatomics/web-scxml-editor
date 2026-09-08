import { BaseCommand, type CommandResult } from './base-command';
import { SCXMLParser } from '@/lib/parsers/scxml-parser';
import {
  wouldConflictIfMarkedInitial,
  findParentContainer,
  getInitialIds,
} from '@/lib/utils/initial-group-utils';
import {
  clearWaypointsForTouchingTransitions,
  restoreClearedWaypoints,
  type ClearedWaypoint,
} from './waypoint-invalidation';

/**
 * ToggleInitialStateCommand
 *
 * Adds or removes a state's id from its direct parent's Initial designation.
 * SCXML allows two ways to express this: the `initial` attribute
 * (space-separated list) and the older `<initial><transition target="X"/></initial>`
 * child element (single target). This command reads both — merging whichever
 * ids each currently names — and always *writes* back using the attribute
 * form only, removing any pre-existing `<initial>` element in the process.
 * That's a one-time normalization the first time a container's Initial
 * designation is touched via this command; it's necessary because the
 * attribute form is the only one that supports more than one Initial id, and
 * keeping both forms simultaneously would just be two disagreeing sources of
 * truth for the same thing. Undo restores the original element verbatim
 * (the same DOM node instance, re-imported) if one existed.
 *
 * Unmarking always succeeds, even when it's the sole marker — a chain
 * temporarily having zero Initial states is a valid editing state (a
 * compound state losing its only initial designation is caught by the
 * existing validateCompoundStates persistent validator, surfaced in the
 * Errors panel, not blocked here — blocking it here would create a deadlock:
 * you could never reassign a chain's Initial marker to a different sibling,
 * since marking that sibling first is refused by the check below). Refuses
 * to mark a state Initial when it's already transitively connected to
 * another Initial-marked sibling, since that would merge two groups.
 *
 * Marking/unmarking changes the node's rendered width (to make or reclaim
 * room for the "Initial" badge — see NodeDimensionCalculator), so any
 * transition touching this state has its persisted `viz:waypoints` cleared
 * too — see waypoint-invalidation.ts. This command's undo doesn't re-run
 * execute() (unlike Rename/UpdateActions/ChangeStateType), so it must
 * explicitly restore the cleared snapshot.
 *
 * "Direct parent" above means the *logical* container, not necessarily the
 * state's real DOM parentElement: once 2+ Initial States get auto-wrapped
 * into a real <parallel> (parallel-group-normalization.ts), a member's real
 * DOM parent is that <parallel> or one of its viz:auto-region wrappers —
 * neither of which ever carries an `initial` attribute — so this command
 * resolves the logical container via findParentContainer (which already
 * sees through auto-wrapping) and reads/writes ITS `initial` attribute,
 * using getInitialIds (also auto-wrap-aware) rather than a raw attribute
 * read to determine the current, real set of Initial ids — the raw
 * attribute on a wrapped container names the synthetic <parallel>'s id, not
 * any real state. The actual document restructuring (moving the toggled
 * state in or out of the <parallel>) is left entirely to
 * normalizeParallelGroups, which every mutation path already runs through
 * downstream (useEditorStore.setContent) — this command only ever needs to
 * get the `initial` attribute's real token list right.
 */
export class ToggleInitialStateCommand extends BaseCommand {
  private previousInitialAttr?: string | null;
  private previousInitialElement?: Element | null;
  private clearedWaypoints: ClearedWaypoint[] = [];

  constructor(private stateId: string) {
    super();
  }

  private findInitialElement(parent: Element): Element | null {
    return (
      Array.from(parent.children).find((el) => el.tagName === 'initial') ?? null
    );
  }

  execute(scxmlContent: string): CommandResult {
    const { doc, error } = this.parseXML(scxmlContent);
    if (!doc) {
      return this.createFailureResult(error || 'Failed to parse XML', scxmlContent);
    }

    const stateElement = this.findStateElement(doc, this.stateId);
    if (!stateElement) {
      return this.createFailureResult(
        `State element not found: ${this.stateId}`,
        scxmlContent
      );
    }

    const parseResult = new SCXMLParser().parse(scxmlContent);
    if (!parseResult.success || !parseResult.data) {
      return this.createFailureResult(
        parseResult.errors?.[0]?.message || 'Failed to parse XML for initial-group analysis',
        scxmlContent
      );
    }
    const scxmlDoc = parseResult.data;

    const logicalContainer = findParentContainer(scxmlDoc, this.stateId);
    if (!logicalContainer) {
      return this.createFailureResult(
        `Could not resolve the container for state: ${this.stateId}`,
        scxmlContent
      );
    }
    const containerId = (logicalContainer as any)['@_id'] as string | undefined;
    const parent = containerId ? this.findStateElement(doc, containerId) : doc.documentElement;
    if (!parent) {
      return this.createFailureResult(
        `Container element not found: ${containerId}`,
        scxmlContent
      );
    }

    const initialElement = this.findInitialElement(parent);
    const currentIds = getInitialIds(logicalContainer);

    this.previousInitialAttr = parent.hasAttribute('initial')
      ? parent.getAttribute('initial')
      : null;
    this.previousInitialElement = initialElement;

    const isCurrentlyInitial = currentIds.has(this.stateId);

    if (isCurrentlyInitial) {
      const updated = [...currentIds].filter((id) => id !== this.stateId);
      if (initialElement) parent.removeChild(initialElement);
      if (updated.length > 0) {
        parent.setAttribute('initial', updated.join(' '));
      } else {
        parent.removeAttribute('initial');
      }
    } else {
      const conflict = wouldConflictIfMarkedInitial(scxmlDoc, this.stateId);
      if (conflict.blocked) {
        return this.createFailureResult(
          conflict.reason || `Cannot mark '${this.stateId}' as an Initial State.`,
          scxmlContent
        );
      }
      if (initialElement) parent.removeChild(initialElement);
      parent.setAttribute('initial', [...currentIds, this.stateId].join(' '));
    }

    this.clearedWaypoints = clearWaypointsForTouchingTransitions(doc, this.stateId);

    return this.createSuccessResult(this.serializeXML(doc), [this.stateId]);
  }

  undo(scxmlContent: string): CommandResult {
    if (this.previousInitialAttr === undefined) {
      return this.createFailureResult('Nothing to undo', scxmlContent);
    }

    const { doc, error } = this.parseXML(scxmlContent);
    if (!doc) {
      return this.createFailureResult(error || 'Failed to parse XML', scxmlContent);
    }

    const stateElement = this.findStateElement(doc, this.stateId);
    if (!stateElement || !stateElement.parentElement) {
      return this.createFailureResult(
        `State element not found: ${this.stateId}`,
        scxmlContent
      );
    }

    const parent = stateElement.parentElement;

    // Defensive: remove whatever execute() wrote before restoring.
    const currentInitialElement = this.findInitialElement(parent);
    if (currentInitialElement) parent.removeChild(currentInitialElement);

    if (this.previousInitialAttr === null) {
      parent.removeAttribute('initial');
    } else {
      parent.setAttribute('initial', this.previousInitialAttr);
    }

    if (this.previousInitialElement) {
      const imported = doc.importNode(this.previousInitialElement, true);
      parent.insertBefore(imported, parent.firstChild);
    }

    restoreClearedWaypoints(doc, this.clearedWaypoints);

    return this.createSuccessResult(this.serializeXML(doc), [this.stateId]);
  }

  getDescription(): string {
    return `Toggle Initial State for "${this.stateId}"`;
  }
}
