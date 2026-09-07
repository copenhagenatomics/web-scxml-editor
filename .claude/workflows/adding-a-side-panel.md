# Workflow: Adding a New Side Panel

Use this when adding a new panel to the single-panel-slot system (alongside Config, Channel Mapping, Events, Validation, Transition, State Actions, GitHub). See `.claude/project/ui-rules.md` §Layout shell for the single-panel-at-a-time rule this must respect.

## Steps

1. **Register the panel id**: add your new id to the `PanelId` union in `src/stores/panel-store.ts` (`'config' | 'channelMapping' | 'events' | 'validation' | 'transition' | 'stateActions' | 'github' | '<yours>'`).
2. **Build the panel component** under `src/components/ui/` (for host-bridge-style panels) or `src/components/diagram/` (for canvas-selection-scoped panels like Transition/State Actions). Use the shared primitives from `src/components/ui/primitives/` (`Panel`, `FormActions`, `FooterAddButton`, `PanelEmptyState`, `inputClass`) rather than rebuilding panel chrome from scratch — every existing panel follows this pattern.
3. **Gate visibility** with `isVisible={activePanel === '<yours>'}` and an `onClose` calling `setActivePanel(null)` — follow `config-panel.tsx`/`channel-mapping-panel.tsx` as templates; both `return null` early when `!isVisible` rather than conditionally rendering their container from the parent.
4. **Wire it into `src/app/_components/side-panels.tsx`** (for host-bridge-style panels rendered inside `VisualEditorPane`) — add your panel alongside the existing four there. If it's a diagram-selection-scoped panel instead (like Transition/State Actions), render it directly from `visual-diagram.tsx` following the existing `transition-panel.tsx`/`StateActionsPanel` pattern there.
5. **Add a toggle affordance** — a toolbar button (in `src/app/page.tsx`'s `renderActions` or `two-tab-layout.tsx`) calling `setActivePanel(activePanel === '<yours>' ? null : '<yours>')`, matching the existing GitHub-button pattern in `page.tsx`.
6. **If the panel needs host-bridge data** (channels, events, config, etc.), read it via `useHostAPIStore` selectors — don't create a new store unless the data is genuinely unrelated to the existing host-bridge concept.
7. **If the panel needs to mutate SCXML**, follow `.claude/workflows/adding-a-command.md` for the actual mutation — panels should call a Command (or an existing utility that wraps one), not inline DOM/object-tree manipulation directly inside the panel component.
8. **Add empty-state copy** (`PanelEmptyState`) that explains the panel's activation convention if there is one (e.g. Config Panel explicitly instructs "add a `conf_` prefix..." rather than showing a bare "no items" message) — this repo consistently treats the empty state as a teaching moment, not just a placeholder.
9. **Write a test** if the panel has non-trivial interactive logic (see `events-panel.test.tsx`, `state-actions-panel.test.tsx` for the RTL pattern this repo uses) — purely presentational panels with no branching logic don't need one (see `.claude/project/coding-rules.md` §6).

## Checklist

- [ ] New id added to `PanelId` in `panel-store.ts`.
- [ ] Only one panel can ever be visible at a time (verify by construction — you're reading `activePanel === '<yours>'`, not a separate boolean).
- [ ] Uses shared `primitives/` components, not custom panel chrome.
- [ ] Any SCXML mutation goes through a Command, not inline manipulation.
- [ ] Empty state explains any activation convention, not just "nothing here."
