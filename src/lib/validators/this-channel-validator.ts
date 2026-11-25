import type { ValidationError } from '@/types/common';
import {
  findThisChannelTypeIssues,
  type ThisChannelIssue,
  type ThisChannelSite,
} from '@/lib/utils/datamodel-extractor';
import { findDataIdPositions, findIdentifierPositions } from './validator-utils';

/** "the condition on 'A' → 'B'", "an assignment in 'C'", ... */
function describeSite(site: ThisChannelSite): string {
  if (site.kind === 'cond') {
    if (site.stateId && site.targetId) return `the condition on '${site.stateId}' → '${site.targetId}'`;
    return site.stateId ? `a condition in '${site.stateId}'` : 'a condition';
  }
  if (site.kind === 'delay') {
    return site.stateId ? `the delay of a time transition from '${site.stateId}'` : 'the delay of a time transition';
  }
  return site.stateId ? `an assignment in '${site.stateId}'` : 'an assignment';
}

/** Plain-language name of the type a <data expr> literal gives a channel. */
function typeName(expr: string): string {
  if (expr === 'true' || expr === 'false') return 'true/false';
  if (/^-?\d+$/.test(expr)) return 'whole number';
  if (/^-?\d*\.\d+$/.test(expr)) return 'number';
  return 'value';
}

function describeUse(use: 'bool' | 'number' | 'double', site: ThisChannelSite): string {
  const where = describeSite(site);
  if (site.kind === 'cond') {
    if (use === 'bool') return `is used as a true/false condition in ${where}`;
    return `is compared to ${use === 'double' ? 'a decimal number' : 'a number'} in ${where}`;
  }
  if (site.kind === 'delay') {
    if (use === 'bool') return `is used as a true/false test in ${where}`;
    return `is used as a number in ${where}`;
  }
  if (use === 'bool') return `is assigned a true/false value in ${where}`;
  return `is assigned ${use === 'double' ? 'a decimal number' : 'a number'} in ${where}`;
}

function toValidationError(issue: ThisChannelIssue, xmlContent: string): ValidationError {
  const id = issue.id;
  const declaration = findDataIdPositions(id, xmlContent)[0];

  if (issue.kind === 'undeclared') {
    const reference = findIdentifierPositions(id, xmlContent)[0];
    const declareAs = `${typeName(issue.expr)} (${issue.expr})`;
    return {
      message: `Channel '${id}' is used in ${describeSite(issue.site)} but isn't declared in the datamodel, so the host can't generate the program. Declare it as a ${declareAs}.`,
      severity: 'error',
      line: reference?.line,
      column: reference?.column,
      stateId: issue.site.stateId,
      targetStateId: issue.site.kind === 'cond' ? issue.site.targetId : undefined,
      fix: { label: `Declare as ${declareAs}`, kind: 'add-data', dataId: id, expr: issue.expr },
    };
  }

  if (issue.kind === 'conflict') {
    return {
      message: `Channel '${id}' is used as a true/false value in ${describeSite(issue.boolSite)} but as a number in ${describeSite(issue.numberSite)}. A channel has one type, so change one of them to match the other.`,
      severity: 'warning',
      line: declaration?.line,
      column: declaration?.column,
      stateId: issue.boolSite.stateId,
    };
  }

  return {
    message: `Channel '${id}' starts as ${issue.current} (${typeName(issue.current)}) but ${describeUse(issue.use, issue.site)}. Change its initial value to ${issue.expected}, or the host will fail to generate the program.`,
    severity: 'warning',
    line: declaration?.line,
    column: declaration?.column,
    stateId: issue.site.stateId,
    targetStateId: issue.site.kind === 'cond' ? issue.site.targetId : undefined,
    fix: { label: `Set initial value to ${issue.expected}`, kind: 'set-data-expr', dataId: id, expr: issue.expected },
  };
}

/**
 * Reports this_ channels the host would reject: used but undeclared (error), used as both a bool
 * and a number (warning), or declared with a type their uses contradict (warning). See
 * findThisChannelTypeIssues. Applying a condition or action in the visual panels already declares
 * and re-types generated channels (syncThisChannels), so these mostly surface edits made in the
 * code editor, hand-written initial values, and uses whose types disagree.
 */
export function validateThisChannelTypes(xmlContent: string | undefined, errors: ValidationError[]): void {
  if (!xmlContent) return;
  for (const issue of findThisChannelTypeIssues(xmlContent)) {
    errors.push(toValidationError(issue, xmlContent));
  }
}
