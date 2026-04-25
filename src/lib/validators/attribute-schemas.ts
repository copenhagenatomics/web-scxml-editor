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
  return new Set(['id', 'src', 'expr']);
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
