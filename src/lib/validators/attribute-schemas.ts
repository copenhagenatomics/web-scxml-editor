/**
 * SCXML Attribute Schema Definitions
 *
 * This module contains all valid attribute sets for SCXML elements.
 * Each function returns a Set of valid attribute names for a specific SCXML element type.
 */

export function getValidScxmlAttributes(): Set<string> {
  return new Set([
    'xmlns',
    'version',
    'datamodel',
    'initial',
    'name',
    'binding',
    'exmode',
  ]);
}

export function getValidStateAttributes(): Set<string> {
  return new Set(['id', 'initial']);
}

export function getValidParallelAttributes(): Set<string> {
  return new Set(['id']);
}

export function getValidFinalAttributes(): Set<string> {
  return new Set(['id']);
}

export function getValidHistoryAttributes(): Set<string> {
  return new Set(['id', 'type']);
}

export function getValidTransitionAttributes(): Set<string> {
  return new Set(['event', 'cond', 'target', 'type']);
}

export function getValidOnentryAttributes(): Set<string> {
  return new Set([]);
}

export function getValidOnexitAttributes(): Set<string> {
  return new Set([]);
}

export function getValidInitialAttributes(): Set<string> {
  return new Set([]);
}

export function getValidDatamodelAttributes(): Set<string> {
  return new Set([]);
}

export function getValidDataAttributes(): Set<string> {
  // confType is this editor's own (non-W3C) type tag on conf_ fields, written
  // by the Config panel — see datamodel-extractor.ts.
  return new Set(['id', 'src', 'expr', 'confType']);
}

export function getValidInvokeAttributes(): Set<string> {
  return new Set([
    'type',
    'typeexpr',
    'src',
    'srcexpr',
    'id',
    'idlocation',
    'namelist',
    'autoforward',
  ]);
}

export function getValidScriptAttributes(): Set<string> {
  return new Set(['src']);
}

export function getValidAssignAttributes(): Set<string> {
  return new Set(['location', 'expr']);
}

export function getValidSendAttributes(): Set<string> {
  return new Set([
    'event',
    'eventexpr',
    'target',
    'targetexpr',
    'type',
    'typeexpr',
    'id',
    'idlocation',
    'delay',
    'delayexpr',
    'namelist',
  ]);
}

export function getValidRaiseAttributes(): Set<string> {
  return new Set(['event']);
}

export function getValidLogAttributes(): Set<string> {
  return new Set(['label', 'expr']);
}

export function getValidCancelAttributes(): Set<string> {
  return new Set(['sendid', 'sendidexpr']);
}

export function getValidIfAttributes(): Set<string> {
  return new Set(['cond']);
}

export function getValidElseifAttributes(): Set<string> {
  return new Set(['cond']);
}

export function getValidElseAttributes(): Set<string> {
  return new Set([]);
}

export function getValidForeachAttributes(): Set<string> {
  return new Set(['array', 'item', 'index']);
}

export function getValidParamAttributes(): Set<string> {
  return new Set(['name', 'expr', 'location']);
}

export function getValidContentAttributes(): Set<string> {
  return new Set(['expr']);
}

export function getValidDonedataAttributes(): Set<string> {
  return new Set([]);
}

export function getValidFinalizeAttributes(): Set<string> {
  return new Set([]);
}

/**
 * Attribute schema per SCXML element name. Elements not listed here (foreign or
 * namespaced elements, and <content>'s arbitrary payload) are never checked.
 */
export function getElementAttributeSchemas(): Map<string, Set<string>> {
  return new Map([
    ['scxml', getValidScxmlAttributes()],
    ['state', getValidStateAttributes()],
    ['parallel', getValidParallelAttributes()],
    ['final', getValidFinalAttributes()],
    ['history', getValidHistoryAttributes()],
    ['transition', getValidTransitionAttributes()],
    ['onentry', getValidOnentryAttributes()],
    ['onexit', getValidOnexitAttributes()],
    ['initial', getValidInitialAttributes()],
    ['datamodel', getValidDatamodelAttributes()],
    ['data', getValidDataAttributes()],
    ['invoke', getValidInvokeAttributes()],
    ['script', getValidScriptAttributes()],
    ['assign', getValidAssignAttributes()],
    ['send', getValidSendAttributes()],
    ['raise', getValidRaiseAttributes()],
    ['log', getValidLogAttributes()],
    ['cancel', getValidCancelAttributes()],
    ['if', getValidIfAttributes()],
    ['elseif', getValidElseifAttributes()],
    ['else', getValidElseAttributes()],
    ['foreach', getValidForeachAttributes()],
    ['param', getValidParamAttributes()],
    ['content', getValidContentAttributes()],
    ['donedata', getValidDonedataAttributes()],
    ['finalize', getValidFinalizeAttributes()],
  ]);
}
