function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Rewrites the completion event `done.state.<oldId>` to `done.state.<newId>`
 * inside an event list, matching whole tokens only (separated by commas
 * and/or whitespace) so `done.state.CC` or `done.state.C.sub` aren't touched
 * when renaming `C`. Separators are preserved; the input is returned as-is
 * when nothing matched.
 *
 * The event name bakes the state id in as a literal string (see
 * getDefaultNewTransitionEvent), so anything that changes a state's id —
 * rename, paste with fresh ids — must rewrite it or the transition goes on
 * listening for an event that is never raised.
 */
export function renameCompletionEventTokens(
  value: string | undefined,
  oldId: string,
  newId: string
): string | undefined {
  if (!value) return value;
  const pattern = new RegExp(`(^|[\\s,])done\\.state\\.${escapeRegExp(oldId)}(?=$|[\\s,])`, 'g');
  return value.replace(pattern, (_match, sep: string) => `${sep}done.state.${newId}`);
}
