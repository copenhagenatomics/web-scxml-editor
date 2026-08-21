import type { SCXMLElement, StateElement, ParallelElement, TransitionElement } from '@/types/scxml';
import type { ValidationError } from '@/types/common';
import { findTransitionPosition } from './validator-utils';
import { classifyTransitionSlot } from '@/lib/utils/transition-slot-rules';

/**
 * Flags, per (source state, target, type) family, any transition with both event and
 * cond set (always invalid), and any slot ('event', 'timer', 'cond', or 'always'/eventless)
 * occupied by more than one transition. This is the code-editor-visible counterpart to the live blocking already
 * done in the diagram connect gesture and the transition panel — it only ever fires on
 * violations introduced after load, since legacy duplicates are silently merged away by
 * transition-merge-utils.ts before this validator ever sees the content.
 */
export function validateTransitionSlotConflicts(
  scxml: SCXMLElement,
  xmlContent: string | undefined,
  errors: ValidationError[]
): void {
  // Shared across the entire recursive walk (not per-element/group) so that line numbers,
  // which are unique across the whole XML file, are never re-claimed by a later lookup.
  const usedLines = new Set<number>();

  const validateElement = (element: SCXMLElement | StateElement | ParallelElement) => {
    const sourceId = (element as any)['@_id'];
    if ((element as any).transition && sourceId) {
      const transitions: TransitionElement[] = Array.isArray((element as any).transition)
        ? (element as any).transition
        : [(element as any).transition];

      // Group by (target, type) so each slot family is checked independently.
      const groups = new Map<string, TransitionElement[]>();
      for (const t of transitions) {
        if (!t['@_target']) continue;
        const type = t['@_type'] || 'external';
        const key = `${t['@_target']}::${type}`;
        const list = groups.get(key) ?? [];
        list.push(t);
        groups.set(key, list);
      }

      for (const group of groups.values()) {
        const bySlot = new Map<'event' | 'timer' | 'cond' | 'always', TransitionElement[]>();

        for (const t of group) {
          const slot = classifyTransitionSlot(t);
          if (slot === 'invalid-both') {
            const position = findTransitionPosition(
              sourceId,
              t['@_target']!,
              xmlContent,
              t['@_event'],
              t['@_cond'],
              usedLines
            );
            if (position) usedLines.add(position.line);
            errors.push({
              message: `Transition from '${sourceId}' to '${t['@_target']}' can't have both an event and a condition.`,
              severity: 'error',
              line: position?.line,
              column: position?.column,
            });
            continue;
          }
          const list = bySlot.get(slot) ?? [];
          list.push(t);
          bySlot.set(slot, list);
        }

        for (const [slot, list] of bySlot) {
          if (list.length <= 1) continue;
          for (const t of list) {
            const position = findTransitionPosition(
              sourceId,
              t['@_target']!,
              xmlContent,
              t['@_event'],
              t['@_cond'],
              usedLines
            );
            if (position) usedLines.add(position.line);
            errors.push({
              message:
                slot === 'event'
                  ? `Only one event-based transition is allowed from '${sourceId}' to '${t['@_target']}'.`
                  : slot === 'timer'
                    ? `Only one timer-based transition is allowed from '${sourceId}' to '${t['@_target']}'.`
                    : slot === 'cond'
                      ? `Only one condition-based transition is allowed from '${sourceId}' to '${t['@_target']}'.`
                      : `Only one eventless transition is allowed from '${sourceId}' to '${t['@_target']}'.`,
              severity: 'error',
              line: position?.line,
              column: position?.column,
            });
          }
        }
      }
    }

    if (element.state) {
      const states = Array.isArray(element.state) ? element.state : [element.state];
      states.forEach((s) => validateElement(s));
    }
    if (element.parallel) {
      const parallels = Array.isArray(element.parallel) ? element.parallel : [element.parallel];
      parallels.forEach((p) => validateElement(p));
    }
  };

  validateElement(scxml);
}
