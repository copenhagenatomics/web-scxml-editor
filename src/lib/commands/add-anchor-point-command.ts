import { BaseCommand, type CommandResult } from './base-command';
import type { HandleSide } from '@/lib/layout/edge-obstacle-utils';
import {
  parseAnchorsAttribute,
  formatAnchorsAttribute,
  MAX_ANCHORS_PER_SIDE,
} from '@/lib/converters/converter-modules/visual-metadata';

/**
 * AddAnchorPointCommand
 *
 * Adds one more connection-point anchor to a side of a state (viz:anchors),
 * triggered by shift-clicking near that side's border. All anchors on a side
 * are rendered evenly spaced by scxml-state-node.tsx — see
 * .claude/features/state-connections-handles.md.
 */
export class AddAnchorPointCommand extends BaseCommand {
  private oldAnchorsAttr: string | null = null;

  constructor(
    private stateId: string,
    private side: HandleSide
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

    const stateElement = this.findStateElement(doc, this.stateId);
    if (!stateElement) {
      return this.createFailureResult(
        `State not found: ${this.stateId}`,
        scxmlContent
      );
    }

    this.ensureVizNamespace(doc);

    this.oldAnchorsAttr = stateElement.getAttribute('viz:anchors');
    const anchors = this.oldAnchorsAttr
      ? parseAnchorsAttribute(this.oldAnchorsAttr)
      : {};

    const currentCount = anchors[this.side] ?? 1;
    if (currentCount >= MAX_ANCHORS_PER_SIDE) {
      return this.createFailureResult(
        `Side "${this.side}" already has the maximum of ${MAX_ANCHORS_PER_SIDE} anchors`,
        scxmlContent
      );
    }

    anchors[this.side] = currentCount + 1;
    const newAttrValue = formatAnchorsAttribute(anchors);

    if (newAttrValue) {
      stateElement.setAttribute('viz:anchors', newAttrValue);
    } else {
      stateElement.removeAttribute('viz:anchors');
    }

    const newContent = this.serializeXML(doc);
    return this.createSuccessResult(newContent, [this.stateId]);
  }

  undo(scxmlContent: string): CommandResult {
    const { doc, error } = this.parseXML(scxmlContent);
    if (!doc) {
      return this.createFailureResult(
        error || 'Failed to parse XML',
        scxmlContent
      );
    }

    const stateElement = this.findStateElement(doc, this.stateId);
    if (!stateElement) {
      return this.createFailureResult(
        `State not found: ${this.stateId}`,
        scxmlContent
      );
    }

    if (this.oldAnchorsAttr) {
      stateElement.setAttribute('viz:anchors', this.oldAnchorsAttr);
    } else {
      stateElement.removeAttribute('viz:anchors');
    }

    const newContent = this.serializeXML(doc);
    return this.createSuccessResult(newContent, [this.stateId]);
  }

  getDescription(): string {
    return `Add anchor point to ${this.side} side of ${this.stateId}`;
  }
}
