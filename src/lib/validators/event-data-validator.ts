import type { SCXMLElement } from '@/types/scxml';
import type { ValidationError } from '@/types/common';
import { findTransitionPosition, parseStateIdList } from './validator-utils';

/** `_event.data` (also `_event . data`), but not e.g. `my_event.data` or `_event.dataX`. */
const EVENT_DATA_PATTERN = /(?<![\w$])_event\s*\.\s*data(?![\w$])/;

const toArray = <T>(value: T | T[] | undefined): T[] =>
  value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];

/** True if any string anywhere in this subtree (attribute or text) reads `_event.data`. */
function containsEventData(node: unknown): boolean {
  if (typeof node === 'string') return EVENT_DATA_PATTERN.test(node);
  if (Array.isArray(node)) return node.some(containsEventData);
  if (node && typeof node === 'object') return Object.values(node).some(containsEventData);
  return false;
}

/** Child states in document order as far as the parser keeps it (state, then parallel, then final). */
function childStates(element: any): any[] {
  return [...toArray(element.state), ...toArray(element.parallel), ...toArray(element.final)];
}

/**
 * Warns about eventless transitions (no `event`, or `event=""`) whose target reads
 * `_event.data` on entry — in its own `<onentry>` or in the `<onentry>` of a descendant
 * entered by default. No event triggers such a transition, so there is no event data,
 * and the downstream runtime silently evaluates `_event.data` to 0.
 *
 * `<initial>` transitions are deliberately not checked: they are eventless by definition,
 * and `_event` there still holds the event that entered the parent state.
 */
export function validateEventlessEventDataEntry(
  scxml: SCXMLElement,
  xmlContent: string | undefined,
  errors: ValidationError[]
): void {
  const statesById = new Map<string, any>();
  const parallels = new Set<any>();
  const collect = (element: any) => {
    toArray(element.parallel).forEach((p) => parallels.add(p));
    childStates(element).forEach((child) => {
      if (typeof child['@_id'] === 'string') statesById.set(child['@_id'], child);
      collect(child);
    });
  };
  collect(scxml);
  const stateIds = new Set(statesById.keys());

  /** The target state plus every descendant entered by default with it. */
  const defaultEntry = (state: any, seen: Set<any>): any[] => {
    if (seen.has(state)) return [];
    seen.add(state);
    const children = childStates(state);
    let next: any[] = [];
    if (parallels.has(state)) {
      next = children; // every region of a parallel state is entered
    } else if (children.length > 0) {
      const initialTransition = toArray<any>(toArray<any>(state.initial)[0]?.transition)[0];
      const initialAttr: string | undefined = state['@_initial'] ?? initialTransition?.['@_target'];
      const initialIds = initialAttr ? parseStateIdList(initialAttr, stateIds) : [];
      next = initialIds.length
        ? initialIds.map((id) => statesById.get(id)).filter(Boolean)
        : [children[0]];
    }
    return [state, ...next.flatMap((child) => defaultEntry(child, seen))];
  };

  const check = (element: any) => {
    const sourceId: string | undefined = element['@_id'];
    toArray<any>(element.transition).forEach((transition) => {
      const event: string = transition['@_event'] ?? '';
      if (event.trim() !== '') return;
      if (transition['@_type'] === 'internal') return;
      const target: string | undefined = transition['@_target'];
      if (!target || !sourceId) return;

      parseStateIdList(target, stateIds).forEach((targetId) => {
        const targetState = statesById.get(targetId);
        if (!targetState) return;
        const reader = defaultEntry(targetState, new Set()).find((s) =>
          toArray(s.onentry).some(containsEventData)
        );
        if (!reader) return;

        const readerId: string = reader['@_id'] ?? targetId;
        const where =
          readerId === targetId ? `'${targetId}'` : `'${readerId}' (entered through '${targetId}')`;
        // The parser unescapes attribute values; the position lookup matches raw XML.
        const cond: string | undefined = transition['@_cond']
          ?.replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
        const position = findTransitionPosition(sourceId, targetId, xmlContent, undefined, cond);

        errors.push({
          message: `Eventless transition from '${sourceId}' to '${targetId}': ${where} uses _event.data, but no event triggers this transition, so _event.data will be 0. Add an event to this transition, or don't read _event.data in ${where}.`,
          severity: 'warning',
          line: position?.line,
          column: position?.column,
          stateId: sourceId,
          targetStateId: targetId,
        });
      });
    });
    childStates(element).forEach(check);
  };
  check(scxml);
}
