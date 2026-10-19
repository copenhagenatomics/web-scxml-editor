import { BaseCommand, type CommandResult } from './base-command';

export class AddDataCommand extends BaseCommand {
  constructor(private id: string, private initialExpr: string = '0') {
    super();
  }

  execute(scxmlContent: string): CommandResult {
    const { doc, error } = this.parseXML(scxmlContent);
    if (!doc) return this.createFailureResult(error || 'Failed to parse XML', scxmlContent);

    if (doc.querySelector(`data[id="${this.id}"]`)) {
      return this.createSuccessResult(scxmlContent);
    }

    const ns = doc.documentElement.namespaceURI || 'http://www.w3.org/2005/07/scxml';

    let datamodel = doc.querySelector('datamodel');
    if (!datamodel) {
      datamodel = doc.createElementNS(ns, 'datamodel');
      doc.documentElement.insertBefore(datamodel, doc.documentElement.firstChild);
    }

    const dataEl = doc.createElementNS(ns, 'data');
    dataEl.setAttribute('id', this.id);
    dataEl.setAttribute('expr', this.initialExpr);
    datamodel.appendChild(dataEl);

    return this.createSuccessResult(this.serializeXML(doc));
  }

  undo(scxmlContent: string): CommandResult {
    const { doc, error } = this.parseXML(scxmlContent);
    if (!doc) return this.createFailureResult(error || 'Failed to parse XML', scxmlContent);

    const dataEl = doc.querySelector(`data[id="${this.id}"]`);
    if (!dataEl) return this.createSuccessResult(scxmlContent);

    const datamodel = dataEl.parentElement;
    datamodel?.removeChild(dataEl);

    if (datamodel && datamodel.children.length === 0) {
      datamodel.parentElement?.removeChild(datamodel);
    }

    return this.createSuccessResult(this.serializeXML(doc));
  }

  getDescription(): string {
    return `Add data variable: ${this.id}`;
  }
}
