import { BaseCommand, type CommandResult } from './base-command';

/**
 * UpdateDataExprCommand
 *
 * Changes the `expr` of an existing <data> element (e.g. to re-type a channel after the value
 * assigned to it changed). A missing <data> is a no-op, since AddDataCommand owns creation.
 */
export class UpdateDataExprCommand extends BaseCommand {
  private oldExpr?: string | null;

  constructor(private id: string, private newExpr: string) {
    super();
  }

  execute(scxmlContent: string): CommandResult {
    const { doc, error } = this.parseXML(scxmlContent);
    if (!doc) return this.createFailureResult(error || 'Failed to parse XML', scxmlContent);

    const dataEl = doc.querySelector(`data[id="${this.id}"]`);
    if (!dataEl) return this.createSuccessResult(scxmlContent);

    this.oldExpr = dataEl.getAttribute('expr');
    if (this.oldExpr === this.newExpr) return this.createSuccessResult(scxmlContent);

    dataEl.setAttribute('expr', this.newExpr);
    return this.createSuccessResult(this.serializeXML(doc));
  }

  undo(scxmlContent: string): CommandResult {
    if (this.oldExpr === undefined) {
      return this.createFailureResult('No previous data expr to restore', scxmlContent);
    }

    const { doc, error } = this.parseXML(scxmlContent);
    if (!doc) return this.createFailureResult(error || 'Failed to parse XML', scxmlContent);

    const dataEl = doc.querySelector(`data[id="${this.id}"]`);
    if (!dataEl) return this.createSuccessResult(scxmlContent);

    if (this.oldExpr === null) dataEl.removeAttribute('expr');
    else dataEl.setAttribute('expr', this.oldExpr);
    return this.createSuccessResult(this.serializeXML(doc));
  }

  getDescription(): string {
    return `Update data expr: ${this.id} = ${this.newExpr}`;
  }
}
