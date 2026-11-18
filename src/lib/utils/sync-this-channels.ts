import { AddDataCommand } from '@/lib/commands/add-data-command';
import { UpdateDataExprCommand } from '@/lib/commands/update-data-expr-command';
import { findThisChannelRefs, inferThisChannelChanges } from '@/lib/utils/datamodel-extractor';

/**
 * Upper bound on inference rounds. One round settles almost everything; a further round only
 * follows one more link of a chain between channels in scope (`this_c = this_b; this_b = ...`),
 * and the bound keeps two channels whose types feed each other from looping.
 */
const MAX_ROUNDS = 5;

/**
 * The items of `next` that have no counterpart left in `previous` — the rows a list edit added or
 * changed (an edited row is a new item; deleted and untouched rows are excluded). Counts
 * duplicates, so adding a second copy of an existing row counts as one changed row.
 */
export function changedItems<T>(
  previous: readonly T[],
  next: readonly T[],
  key: (item: T) => string = String
): T[] {
  const remaining = new Map<string, number>();
  for (const item of previous) remaining.set(key(item), (remaining.get(key(item)) ?? 0) + 1);
  return next.filter((item) => {
    const count = remaining.get(key(item)) ?? 0;
    if (count === 0) return true;
    remaining.set(key(item), count - 1);
    return false;
  });
}

/** The this_ channels referenced in the given texts (conditions, action strings, exprs). */
export function thisChannelRefsIn(texts: ReadonlyArray<string | undefined>): string[] {
  return Array.from(new Set(texts.flatMap((text) => (text ? findThisChannelRefs(text) : []))));
}

/**
 * Brings the given this_ channels' declarations in line with how conditions and <assign>s use
 * them: declares any that are referenced but missing, and re-types generated ones whose usage
 * changed (see inferThisChannelChanges). Run after a condition/action commit with the channels
 * that commit references (thisChannelRefsIn), so a channel is typed from the final expression
 * rather than whatever was typed when it was created.
 *
 * Only `channelIds` are changed: applying one condition never edits a channel used elsewhere.
 * Their types are still inferred from every use in the document, though, since a channel has one
 * type that must fit all of them. Problems with other channels are left to the Validation panel
 * (validateThisChannelTypes), which reports them with a one-click fix.
 */
export function syncThisChannels(content: string, channelIds: Iterable<string>): string {
  const scope = new Set(channelIds);
  if (scope.size === 0) return content;

  let result = content;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const changes = inferThisChannelChanges(result);
    const missing = changes.missing.filter(({ id }) => scope.has(id));
    const retypes = changes.retypes.filter(({ id }) => scope.has(id));
    if (missing.length === 0 && retypes.length === 0) break;
    for (const { id, expr } of missing) {
      const added = new AddDataCommand(id, expr).execute(result);
      if (added.success) result = added.newContent;
    }
    for (const { id, expr } of retypes) {
      const updated = new UpdateDataExprCommand(id, expr).execute(result);
      if (updated.success) result = updated.newContent;
    }
  }
  return result;
}
