import { BaseCommand, type CommandResult } from './base-command';
import { parseHandleId, type HandleSide } from '@/lib/layout/edge-obstacle-utils';
import {
  parseAnchorsAttribute,
  formatAnchorsAttribute,
} from '@/lib/converters/converter-modules/visual-metadata';

export const ANCHOR_IN_USE_MESSAGE =
  'Move or delete the transitions on this connection point before removing it.';
export const LAST_ANCHOR_MESSAGE =
  'Each side keeps at least one connection point — it cannot be removed.';

interface HandleAttrChange {
  /** Position of the <transition> in document order. */
  transitionIndex: number;
  attr: 'viz:sourceHandle' | 'viz:targetHandle';
  oldValue: string;
}

const handleIdFor = (side: HandleSide, index: number) =>
  index === 0 ? side : `${side}-${index}`;

/**
 * RemoveAnchorPointCommand
 *
 * Removes one connection-point anchor from a side of a state (viz:anchors),
 * triggered by Alt-clicking that connection point. Refuses when any saved
 * transition handle (viz:sourceHandle/viz:targetHandle) still uses that
 * anchor, or when it's the side's last one. Saved handles on higher-index
 * anchors of the same side are shifted down by one so they keep pointing at
 * the same physical connection point — e.g. removing 'bottom-1' renames
 * 'bottom-2' → 'bottom-1', and removing 'bottom' (index 0) renames
 * 'bottom-1' → 'bottom'. See .claude/features/state-connections-handles.md.
 */
export class RemoveAnchorPointCommand extends BaseCommand {
  private oldAnchorsAttr: string | null = null;
  private handleChanges: HandleAttrChange[] = [];

  constructor(
    private stateId: string,
    private side: HandleSide,
    private index: number
  ) {
    super();
  }

  execute(scxmlContent: string): CommandResult {
    const { doc, error } = this.parseXML(scxmlContent);
    if (!doc) {
      return this.createFailureResult(error || 'Failed to parse XML', scxmlContent);
    }

    const stateElement = this.findStateElement(doc, this.stateId);
    if (!stateElement) {
      return this.createFailureResult(`State not found: ${this.stateId}`, scxmlContent);
    }

    this.oldAnchorsAttr = stateElement.getAttribute('viz:anchors');
    const anchors = this.oldAnchorsAttr ? parseAnchorsAttribute(this.oldAnchorsAttr) : {};
    const count = anchors[this.side] ?? 1;

    if (count <= 1) {
      return this.createFailureResult(LAST_ANCHOR_MESSAGE, scxmlContent);
    }
    if (!Number.isInteger(this.index) || this.index < 0 || this.index >= count) {
      return this.createFailureResult(
        `Connection point ${handleIdFor(this.side, this.index)} does not exist on ${this.stateId}`,
        scxmlContent
      );
    }

    // Every saved handle value that refers to one of this state's anchors.
    const refs: { el: Element; transitionIndex: number; attr: HandleAttrChange['attr']; value: string }[] = [];
    const transitions = doc.getElementsByTagName('transition');
    for (let i = 0; i < transitions.length; i++) {
      const t = transitions[i];
      const sourceId = t.parentElement?.getAttribute('id');
      const targets = (t.getAttribute('target') || '').split(/\s+/).filter(Boolean);
      const src = t.getAttribute('viz:sourceHandle');
      const tgt = t.getAttribute('viz:targetHandle');
      if (sourceId === this.stateId && src) {
        refs.push({ el: t, transitionIndex: i, attr: 'viz:sourceHandle', value: src });
      }
      if (targets.includes(this.stateId) && tgt) {
        refs.push({ el: t, transitionIndex: i, attr: 'viz:targetHandle', value: tgt });
      }
    }

    const onThisSide = refs
      .map((ref) => ({ ref, parsed: parseHandleId(ref.value) }))
      .filter(({ parsed }) => parsed.side === this.side);

    if (onThisSide.some(({ parsed }) => parsed.index === this.index)) {
      return this.createFailureResult(ANCHOR_IN_USE_MESSAGE, scxmlContent);
    }

    this.ensureVizNamespace(doc);
    this.handleChanges = [];
    for (const { ref, parsed } of onThisSide) {
      if (parsed.index > this.index) {
        this.handleChanges.push({
          transitionIndex: ref.transitionIndex,
          attr: ref.attr,
          oldValue: ref.value,
        });
        ref.el.setAttribute(ref.attr, handleIdFor(this.side, parsed.index - 1));
      }
    }

    anchors[this.side] = count - 1;
    const newAttrValue = formatAnchorsAttribute(anchors);
    if (newAttrValue) {
      stateElement.setAttribute('viz:anchors', newAttrValue);
    } else {
      stateElement.removeAttribute('viz:anchors');
    }

    return this.createSuccessResult(this.serializeXML(doc), [this.stateId]);
  }

  undo(scxmlContent: string): CommandResult {
    const { doc, error } = this.parseXML(scxmlContent);
    if (!doc) {
      return this.createFailureResult(error || 'Failed to parse XML', scxmlContent);
    }

    const stateElement = this.findStateElement(doc, this.stateId);
    if (!stateElement) {
      return this.createFailureResult(`State not found: ${this.stateId}`, scxmlContent);
    }

    if (this.oldAnchorsAttr) {
      stateElement.setAttribute('viz:anchors', this.oldAnchorsAttr);
    } else {
      stateElement.removeAttribute('viz:anchors');
    }

    const transitions = doc.getElementsByTagName('transition');
    for (const change of this.handleChanges) {
      transitions[change.transitionIndex]?.setAttribute(change.attr, change.oldValue);
    }

    return this.createSuccessResult(this.serializeXML(doc), [this.stateId]);
  }

  getDescription(): string {
    return `Remove anchor point ${handleIdFor(this.side, this.index)} from ${this.stateId}`;
  }
}
