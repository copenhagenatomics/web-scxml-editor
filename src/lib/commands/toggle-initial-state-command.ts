import { BaseCommand, type CommandResult } from './base-command';
import { SCXMLParser } from '@/lib/parsers/scxml-parser';
import {
  wouldConflictIfMarkedInitial,
  findParentEntry,
  getInitialIds,
  isParallelRegion,
} from '@/lib/utils/initial-group-utils';
import { wouldNestParallelIfMarkedInitial } from '@/lib/utils/parallel-nesting-rules';
import { innerParallelIdFor, isInnerParallel, isRootParallel } from '@/lib/utils/parallel-structure';
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
 * "Direct parent" above means the *logical* container, resolved via
 * findParentEntry: for a state at the root next to `__root_parallel`
 * (parallel-group-normalization.ts) that's the <scxml> root, whose raw
 * `initial` names the <parallel>'s id — getInitialIds expands it to the real
 * set of Initial ids. A region of a <parallel> is always active, so toggling
 * it is refused. The actual restructuring (a <state> becoming a <parallel>
 * once it has 2+ Initial work trees) is left entirely to
 * normalizeParallelGroups, which every mutation path already runs through
 * downstream (useEditorStore.setContent) — this command only ever needs to
 * get the `initial` attribute's real token list right — with one exception:
 * unmarking the last Initial State of a region dissolves that region
 * (dissolveRegion), its states going back out as loose siblings of the
 * <parallel>. The work tree is no longer a work tree, so it must stop being
 * a region; normalization then reverts the <parallel> to a compound <state>
 * once fewer than 2 regions are left. That's done here, on the gesture,
 * rather than in normalizeParallelGroups, because a hand-written <parallel>'s
 * regions often have no `initial` at all and must not be dissolved on load.
 */

/** Region children that move out with its work tree when it dissolves. */
const REGION_MEMBER_TAGS = new Set(['state', 'parallel', 'final', 'history', 'viz:note']);
export class ToggleInitialStateCommand extends BaseCommand {
  private previousInitialAttr?: string | null;
  private previousInitialElement?: Element | null;
  /** Set when execute() dissolved a region — undo then restores it verbatim. */
  private contentBeforeDissolve?: string;
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

    const parentEntry = findParentEntry(scxmlDoc, this.stateId);
    if (!parentEntry) {
      return this.createFailureResult(
        `Could not resolve the container for state: ${this.stateId}`,
        scxmlContent
      );
    }
    if (isParallelRegion(scxmlDoc, this.stateId)) {
      return this.createFailureResult(
        `'${this.stateId}' is a region of a parallel state, so it is always active — the Initial State designation doesn't apply to it.`,
        scxmlContent
      );
    }
    const logicalContainer = parentEntry.container;
    const containerId = (logicalContainer as any)['@_id'] as string | undefined;
    const parent = containerId ? this.findStateElement(doc, containerId) : doc.documentElement;
    if (!parent) {
      return this.createFailureResult(
        `Container element not found: ${containerId}`,
        scxmlContent
      );
    }

    const initialElement = this.findInitialElement(parent);
    const currentIds = getInitialIds(logicalContainer, parentEntry.kind);

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
        if (containerId && isParallelRegion(scxmlDoc, containerId) && this.dissolveRegion(doc, parent)) {
          this.contentBeforeDissolve = scxmlContent;
        }
      }
    } else {
      const conflict = wouldConflictIfMarkedInitial(scxmlDoc, this.stateId);
      if (conflict.blocked) {
        return this.createFailureResult(
          conflict.reason || `Cannot mark '${this.stateId}' as an Initial State.`,
          scxmlContent
        );
      }
      const nesting = wouldNestParallelIfMarkedInitial(scxmlDoc, this.stateId);
      if (nesting.blocked) {
        return this.createFailureResult(
          nesting.reason || `Cannot mark '${this.stateId}' as an Initial State.`,
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
    if (this.contentBeforeDissolve !== undefined) {
      return this.createSuccessResult(this.contentBeforeDissolve, [this.stateId]);
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

  /**
   * Move a region's states out of its <parallel> and drop the region. Under
   * an editor-inserted `__root_parallel` / `{id}__parallel` they go beside
   * it, in its host. Any other <parallel> can't hold loose children, so it
   * becomes a <state> (same id, attributes and own content) holding its
   * remaining regions in an inner `{id}__parallel`, the states beside it —
   * the same shape addLooseStateToParallel produces. A region with content
   * of its own (transitions, actions, ...) is left alone. Returns whether
   * it dissolved.
   */
  private dissolveRegion(doc: Document, region: Element): boolean {
    const parallel = region.parentElement;
    const host = parallel?.parentElement;
    if (!parallel || !host || parallel.tagName !== 'parallel') return false;
    const children = Array.from(region.children);
    if (children.some((el) => !REGION_MEMBER_TAGS.has(el.tagName))) return false;

    const parallelId = parallel.getAttribute('id') ?? '';
    const transparent =
      (host === doc.documentElement && isRootParallel({ '@_id': parallelId })) ||
      (host.tagName === 'state' && isInnerParallel({ '@_id': parallelId }));
    if (transparent) {
      children.forEach((el) => host.insertBefore(el, parallel.nextSibling));
      parallel.removeChild(region);
      return true;
    }

    const usedIds = new Set(Array.from(doc.querySelectorAll('[id]')).map((el) => el.getAttribute('id')));
    const base = innerParallelIdFor(parallelId);
    let innerId = base;
    for (let n = 2; usedIds.has(innerId); n++) innerId = `${base}_${n}`;

    const ns = parallel.namespaceURI;
    const state = doc.createElementNS(ns, 'state');
    Array.from(parallel.attributes).forEach((attr) => state.setAttributeNode(attr.cloneNode() as Attr));
    const inner = doc.createElementNS(ns, 'parallel');
    inner.setAttribute('id', innerId);
    state.setAttribute('initial', innerId);
    Array.from(parallel.childNodes).forEach((node) => {
      if (node === region) {
        children.forEach((el) => state.appendChild(el));
      } else if (node instanceof Element && (node.tagName === 'state' || node.tagName === 'parallel')) {
        if (!inner.parentNode) state.appendChild(inner);
        inner.appendChild(node);
      } else {
        state.appendChild(node);
      }
    });
    if (!inner.parentNode) state.appendChild(inner);
    host.replaceChild(state, parallel);
    return true;
  }

  getDescription(): string {
    return `Toggle Initial State for "${this.stateId}"`;
  }
}
