/**
 * Rewrites the completion event `done.state.<oldId>` to `done.state.<newId>`
 * inside a comma-separated event list, matching whole items only — so
 * `done.state.CC` isn't touched when renaming `C`. A space is part of a name,
 * not a separator (project rule 6.7): renaming `Motor` leaves
 * `done.state.Motor left` alone. The input is returned as-is when nothing
 * matched (same contract as renameTimeEventTokensInEventList).
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
  const oldEvent = `done.state.${oldId}`;
  const tokens = value.split(',').map((t) => t.trim());
  const renamed = tokens.map((t) => (t === oldEvent ? `done.state.${newId}` : t));
  return renamed.some((t, i) => t !== tokens[i]) ? renamed.join(', ') : value;
}
