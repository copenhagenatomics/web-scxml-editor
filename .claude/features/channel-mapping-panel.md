# Feature: Channel Mapping Panel

## Purpose

Let a user connect an SCXML expression identifier that doesn't resolve to anything declared in the datamodel — a "channel reference" — to one of the host's actual physical I/O channels (or another available datamodel/channel name), so the authored logic can be wired to real hardware inputs/outputs at the host level.

## User behavior

- The panel auto-lists every "unresolved" identifier found anywhere in an SCXML expression attribute that isn't declared in `<datamodel>` and doesn't use the `this_`/`conf_` prefixes — each gets a searchable dropdown of available channels/variables to map it to.
- A user can also manually add a mapping for a reference that doesn't yet appear anywhere in the SCXML (for planning ahead), or rename an existing manual mapping's reference name inline.
- Removing a mapping (trash icon) clears it back to unmapped.

## UI behavior

- Two visually distinct sections: **unresolved refs** (auto-detected, read-only reference name, dropdown only) and **manual rows** (editable reference-name text field + dropdown) — manual rows are ones whose ref name isn't currently found "unresolved" in the live document (either because it was added preemptively, or because it used to be unresolved and has since become resolved by other means, but the mapping itself persists).
- Dropdown options combine host-pushed channel names **and** current datamodel variable names (excluding `this_`-prefixed ones) into one deduplicated, sorted list via `SearchableSelect`.
- Empty state explains the exact matching rule: "Channel references are variable names used in conditions or expressions that are not declared in the `<datamodel>` and do not use the `this_` or `conf_` prefixes."

## Internal architecture

- `extractUnresolvedChannelRefs(scxmlContent, channelNames)` (`datamodel-extractor.ts`) scans every expression attribute (`cond`, `expr`, `location`, `namelist`, `targetexpr`, `srcexpr`) for identifier tokens, then filters out anything that **is** declared in `<datamodel>`, **is** a known channel name already, or starts with `this_`/`conf_`.
- Mappings themselves (`ChannelMapping[]`) are **not stored in the SCXML at all** — they live purely in `useHostAPIStore.channelMappings` (pushed to/read from the host via the Host API bridge's `getChannelMappings`/`setChannelMappings`). `updateChannelMapping(scxmlRef, mappedChannel)` is a plain Zustand action, not a Command, and does not touch `content`.
- `getChannelMappings()` (the Host API method, `use-host-api-bridge.ts`) actually **filters** the stored `channelMappings` down to only those whose `scxmlRef` is currently an active unresolved reference (recomputed fresh from the live content) — so a mapping for a ref that's no longer referenced anywhere doesn't get reported to the host as "active," even though it still exists in the store and reappears if the ref comes back.

## Relevant components

`src/components/ui/channel-mapping-panel.tsx`, `src/components/ui/searchable-select.tsx` (the dropdown widget, shared with other panels).

## Relevant state/store

`useHostAPIStore.channels` (available physical channels, host-pushed), `useHostAPIStore.channelMappings` (the mapping list itself, host-pushed **and** editable here), `updateChannelMapping` action.

## Relevant utilities

`src/lib/utils/datamodel-extractor.ts` (`extractUnresolvedChannelRefs`, `extractDatamodelVariables`).

## SCXML behavior

This feature reads SCXML (to find unresolved refs) but **never writes to it** — mappings are entirely host-side metadata layered on top of the document, not persisted in the `.scxml` file itself. This is a meaningful contrast with the Config Panel, which does write `conf_` fields into the datamodel.

## Validation rules

None in `SCXMLValidator` — an unresolved channel reference is not flagged as an SCXML error by the main validation pipeline; it's purely surfaced here as a to-do for the user to map, not a blocking correctness issue from this editor's point of view (whether it's a runtime problem depends entirely on whether the host actually has a matching channel, which this editor cannot know in advance).

## Related features

- `config-panel.md` — reads the complementary identifier set (`conf_`-prefixed) from the same expression-scanning approach.
- `host-api-embedding.md` — source/destination of `channels` and `channelMappings`.
- `monaco-code-editor.md`, `state-actions-panel.md` — both surface `this_`-prefixed "new channel" creation, a related but distinct mechanism (declaring a new datamodel variable) from this panel's job (mapping an *existing* unresolved reference to a host channel).

## Related files

`src/components/ui/channel-mapping-panel.tsx`, `src/lib/utils/datamodel-extractor.ts`, `src/stores/host-api-store.ts`, `src/app/_hooks/use-host-api-bridge.ts`.

## Tests

No dedicated test file for `channel-mapping-panel.tsx` was found in this pass — a gap given the manual-row-vs-unresolved-row logic and the rename-in-place behavior are both non-trivial.

## Known limitations

- No SCXML validation ties into "does this reference actually have a mapping" — a user could ignore this panel entirely and the document would still pass all of `SCXMLValidator`'s checks, even though the reference would presumably fail at the host/runtime level.
- Mapping data is entirely host-managed/ephemeral from this editor's perspective (not in the `.scxml` file) — if the host doesn't persist and re-push `channelMappings` on next load, mappings a user made in an earlier session could appear to have "vanished," even though nothing in the SCXML itself would show that.

## Important edge cases

- Renaming a manual row's reference name (`onBlur`) is implemented as **remove old mapping + add new mapping** (`updateChannelMapping(next, ...)` then `updateChannelMapping(scxmlRef, '')`) rather than an atomic rename — if the new name happens to collide with another existing mapping, the second call could silently overwrite it without warning.
- A ref that starts out "unresolved" (shown in the auto-detected section) and later gets resolved (e.g. the user adds a matching `<data>` declaration) will disappear from the unresolved section, but its **mapping persists** in the store and reappears as a manual row only if it's still in `channelMappings` — otherwise the mapping is effectively orphaned/inactive (per the `getChannelMappings()` filtering behavior above).

## Things that must NOT be changed

- Do not make this panel write mappings into the SCXML document — the deliberate host-side-only storage model is what lets the same SCXML file be deployed to different physical installations with different channel mappings, without the mapping data itself needing to travel with the file.

## Previous design decisions

`docs/superpowers/plans/2026-06-25-transition-panel-channel-mapping-suggestions...` (spec) and `2026-06-30-channel-mapping-create-new.md` (plan) document the "create new mapping" manual-add capability as a later addition on top of an initially auto-detection-only panel — confirming the two-section (auto-detected vs. manual) UI split reflects the feature's actual growth path, not an from-the-start design.
