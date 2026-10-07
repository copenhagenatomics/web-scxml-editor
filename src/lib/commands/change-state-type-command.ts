import { BaseCommand, type CommandResult } from './base-command';
import { clearWaypointsForTouchingTransitions } from './waypoint-invalidation';

/**
 * Children each target element may keep when it's retagged. Anything else
 * (e.g. a <state>'s transitions/substates when it becomes a <final>, or a
 * <final>'s <donedata> when it becomes a <state>) is invalid there and is
 * dropped. Elements outside the SCXML namespace (viz:note etc.) always stay.
 */
const ALLOWED_CHILDREN: Record<'state' | 'final', ReadonlySet<string>> = {
  final: new Set(['onentry', 'onexit', 'donedata']),
  state: new Set([
    'onentry',
    'onexit',
    'transition',
    'initial',
    'state',
    'parallel',
    'final',
    'history',
    'datamodel',
    'invoke',
  ]),
};

/** Attributes valid on a <state> but not on a <final>. */
const STATE_ONLY_ATTRIBUTES = new Set(['initial']);

/** Elements a transition can target. */
const TARGETABLE_TAGS = ['state', 'parallel', 'final', 'history'];
const TARGETABLE_SELECTOR = TARGETABLE_TAGS.map((tag) => `${tag}[id]`).join(', ');

/**
 * Ids of the transition-targetable elements that disappear along with
 * `removed` (each one itself + its descendants). Only state-like elements
 * count: other elements' ids (e.g. `<data id="X">`) live in a different
 * namespace and must not cause transitions targeting a state `X` to be removed.
 */
function collectTargetableIds(removed: Element[]): Set<string> {
  const ids = new Set<string>();
  removed.forEach((el) => {
    const candidates = TARGETABLE_TAGS.includes(el.localName) ? [el] : [];
    candidates.push(...Array.from(el.querySelectorAll(TARGETABLE_SELECTOR)));
    candidates.forEach((e) => {
      const id = e.getAttribute('id');
      if (id) ids.add(id);
    });
  });
  return ids;
}

/**
 * ChangeStateTypeCommand
 *
 * Changes the type of a state (simple, compound, parallel, final).
 *
 * A final state is a separate SCXML element, so converting to/from 'final'
 * replaces `<state id="X">` with `<final id="X">` (and back), keeping the
 * attributes and children that are valid on the new element and dropping
 * the rest — see ALLOWED_CHILDREN. Transitions elsewhere that targeted a
 * dropped descendant are removed too, so no dangling targets remain.
 * 'simple'/'compound' are both a <state>; which one is decided by whether
 * it has children. Conversion to 'parallel' is not implemented.
 *
 * State type also changes the node's rendered width/height (see
 * NodeDimensionCalculator, which sizes compound/parallel states larger than
 * simple/final ones), so stale persisted `viz:waypoints` on transitions
 * touching it are cleared too (see waypoint-invalidation.ts).
 *
 * Undo restores the document as it was before execute() (the same approach
 * DeleteNodeCommand takes), since dropped children can't be rebuilt by
 * simply converting back.
 */
export class ChangeStateTypeCommand extends BaseCommand {
  private previousContent?: string;

  constructor(
    private nodeId: string,
    private newStateType: string
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

    const currentTag = stateElement.localName;

    if (this.newStateType === 'parallel') {
      // Log warning for parallel state conversion (not implemented)
      console.warn(
        'Converting to parallel state requires element type change - not fully implemented'
      );
    } else {
      const targetTag = this.newStateType === 'final' ? 'final' : 'state';

      if (targetTag === 'final' && stateElement.parentElement?.localName === 'parallel') {
        return this.createFailureResult(
          'A region of a parallel state cannot be a final state',
          scxmlContent
        );
      }

      if (currentTag !== targetTag && (currentTag === 'state' || currentTag === 'final')) {
        this.retag(doc, stateElement, targetTag);
      }
    }

    this.previousContent = scxmlContent;

    clearWaypointsForTouchingTransitions(doc, this.nodeId);

    // Serialize and return
    const newContent = this.serializeXML(doc);
    return this.createSuccessResult(newContent, [this.nodeId]);
  }

  /**
   * Replace `element` with a `<targetTag>` carrying over its valid
   * attributes and children, in their original order.
   */
  private retag(doc: Document, element: Element, targetTag: 'state' | 'final'): void {
    const replacement = doc.createElementNS(element.namespaceURI, targetTag);

    Array.from(element.attributes).forEach((attr) => {
      if (targetTag === 'final' && !attr.namespaceURI && STATE_ONLY_ATTRIBUTES.has(attr.name)) {
        return;
      }
      replacement.setAttributeNS(attr.namespaceURI, attr.name, attr.value);
    });

    const allowed = ALLOWED_CHILDREN[targetTag];
    const dropped: Element[] = [];
    Array.from(element.childNodes).forEach((child) => {
      if (
        child.nodeType === Node.ELEMENT_NODE &&
        (child as Element).namespaceURI === element.namespaceURI &&
        !allowed.has((child as Element).localName)
      ) {
        dropped.push(child as Element);
        return;
      }
      replacement.appendChild(child);
    });

    element.parentNode?.replaceChild(replacement, element);

    // Known limitation: this and collectTargetableIds use document-wide
    // selectors, so XML embedded in data payloads (<content>, inline <data>)
    // isn't excluded. No UI calls this command yet — scope both to the real
    // state hierarchy before wiring one up (see .claude/features/state-node-types.md).
    //
    // Targets pointing at a dropped descendant would dangle. A transition can
    // list several targets ("A B"), so only the dropped ones are removed from
    // the list; the transition itself goes only once no target is left.
    const droppedIds = collectTargetableIds(dropped);
    if (droppedIds.size > 0) {
      doc.querySelectorAll('transition[target]').forEach((transition) => {
        const targets = (transition.getAttribute('target') || '').split(/\s+/).filter(Boolean);
        const remaining = targets.filter((t) => !droppedIds.has(t));
        if (remaining.length === targets.length) return;
        if (remaining.length > 0) {
          transition.setAttribute('target', remaining.join(' '));
        } else {
          transition.parentNode?.removeChild(transition);
        }
      });
    }
  }

  undo(scxmlContent: string): CommandResult {
    if (this.previousContent === undefined) {
      return this.createFailureResult(
        'No previous state type to restore',
        scxmlContent
      );
    }
    return this.createSuccessResult(this.previousContent, [this.nodeId]);
  }

  getDescription(): string {
    return `Change state type to "${this.newStateType}"`;
  }
}
