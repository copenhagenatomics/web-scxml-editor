# Configuration Decisions

Covers both product-level "configuration" (the `conf_` per-deployment value system) and build/deployment configuration.

---

## 1. `conf_`-prefixed datamodel fields as the mechanism for per-deployment configurable values

### Context
The same authored SCXML state machine is deployed across multiple physical installations, each potentially needing different tuning values (thresholds, setpoints) without a code/logic change.

### Decision
Any `<data>` element whose id starts with `conf_` is treated as a configurable value: it's surfaced in the Config Panel, exposed via the Host API (`getConfigValues`/`setConfigValues`), and reconciled against host-pushed `IO.conf` overrides.

### Reason
A pure naming-convention mechanism rather than a new schema/attribute — this keeps the convention entirely within standard SCXML (`<data>` with an id prefix), requiring no non-standard element for the "this is configurable" designation itself (only the separate, non-standard `confType` attribute for type-tracking).

### Constraints
The prefix convention is not schema-enforced — a `conf_`-prefixed field with no other special markup is fully valid, ordinary SCXML from any other tool's perspective; only this app's Config Panel treats the prefix as meaningful.

### Alternatives
None found evidenced (e.g. a dedicated `<viz:config>` element was not used for this purpose, unlike visual metadata's own dedicated namespace).

### Evidence
`src/lib/utils/datamodel-extractor.ts` (`extractConfigFields`), `src/components/ui/config-panel.tsx`, `docs/superpowers/plans/2026-07-11-config-panel-host-bridge.md`.

### Status
Accepted.

---

## 2. Local in-progress edits win over stale host-pushed override state

### Context
The Config Panel simultaneously reflects: the SCXML-authored default, the host's last-pushed override value, and whatever the user is actively typing.

### Decision
`mergeConfigEntries(fields, configOverrides, previousEntries)` explicitly prioritizes the panel's own `previousEntries` (in-progress local edits) over a possibly-stale `configOverrides` push from the host when reconciling on every re-render.

### Reason
Not documented in a dedicated note, but this prevents a host re-push (which could happen at any time, independent of user action) from clobbering an edit the user is actively making but hasn't yet committed — without this precedence rule, a host update mid-edit could silently discard user input.

### Constraints
Any future rework of this merge logic must preserve "local wins over host" precedence, or risk reintroducing lost-edit bugs.

### Alternatives
"Host always wins" (simpler, but leads to lost edits) is the implicit rejected alternative.

### Evidence
`src/lib/utils/config-overrides.ts` (`mergeConfigEntries`), `src/components/ui/config-panel.tsx` (usage).

### Status
Accepted.

---

## 3. Deleting a config field is refused, not just warned, if still referenced

### Context
Deleting a `conf_` field that's still referenced somewhere in the document's expressions would leave a dangling reference.

### Decision
`getConfigFieldUsage` is checked before any delete; if the field is referenced anywhere, the delete is **refused outright** (with an explanatory toast naming what still references it), not merely warned-and-allowed.

### Reason
Not documented in a dedicated note, but refusing rather than warning-and-proceeding avoids ever producing a document with a dangling reference through this specific UI path — a stronger safety guarantee than a dismissible warning would provide.

### Constraints
A user who genuinely wants to delete a still-referenced field must first remove or rewrite the referencing expression(s) elsewhere in the document.

### Alternatives
"Warn but allow" is the implicit, weaker alternative not chosen — evidenced by `docs/superpowers/plans/2026-08-25-config-value-deletion.md` existing as a dedicated plan specifically for this safety feature, implying deletion was previously unchecked (see `backward-compatibility.md`-adjacent history: an earlier, less-safe delete behavior existed before this plan shipped).

### Evidence
`src/lib/utils/datamodel-extractor.ts` (`getConfigFieldUsage`, `deleteConfigField`), `src/app/_components/side-panels.tsx` (the refusal + toast wiring), `docs/superpowers/plans/2026-08-25-config-value-deletion.md`.

### Status
Accepted.

---

## 4. GitHub OAuth endpoint configuration is build-time, per-deployment-target, via `NEXT_PUBLIC_*` env vars

### Context
The static-export build (see `architecture.md` #1) needs to know where its GitHub Device Flow relay endpoints are, but that location differs between local development and a LoopControl-embedded deployment.

### Decision
`NEXT_PUBLIC_GITHUB_CLIENT_ID`, `NEXT_PUBLIC_GITHUB_DEVICE_CODE_ENDPOINT`, `NEXT_PUBLIC_GITHUB_DEVICE_TOKEN_ENDPOINT` are baked into the static bundle at build time, sourced from GitHub Actions repository variables in CI (`.github/workflows/release.yml`) or a local `.env.local` for development.

### Reason
Directly follows from the static-export decision — there is no runtime server to read environment variables from at request time, so configuration that varies by deployment target must be resolved at build time instead. The release workflow's own comment explains the endpoints are relative/same-origin specifically because each LoopControl device is reached at its own local IP/hostname, so a single fixed absolute URL baked into one shared release build wouldn't work across a fleet of devices.

### Constraints
Changing GitHub relay endpoint configuration requires a rebuild/re-release, not a runtime config change — a real, accepted limitation of the static-export architecture.

### Alternatives
None found evidenced (e.g. a runtime-configurable endpoint fetched from some discovery mechanism was not implemented).

### Evidence
`.env.local.example`, `.github/workflows/release.yml` (env var wiring + explanatory comment), `server/README.md`.

### Status
Accepted.
