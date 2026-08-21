# UI Redesign — Design Spec

**Date:** 2026-05-29  
**Scope:** Visual-only redesign. No logic changes. shadcn/ui + Tailwind CSS v4.

---

## 1. Design Direction

**Warm Neutral** — Tailwind `stone-*` scale throughout. No blue accent colour. Primary action colour is `stone-900` (near-black). Inspired by Notion / Raycast: cozy, editorial, approachable.

### Colour Palette

| Token | Hex | Usage |
|---|---|---|
| `stone-900` | `#1c1917` | Primary text, active elements, primary button bg |
| `stone-600` | `#57534e` | Secondary text, ghost button text |
| `stone-400` | `#a8a29e` | Muted text, icons, dividers |
| `stone-200` | `#e7e5e4` | Borders, dividers |
| `stone-100` | `#f5f5f4` | Input bg, hover states, toggle bg |
| `stone-50`  | `#fafaf9` | Page bg, secondary panel bg |
| `white`     | `#ffffff` | Card bg, toolbar bg, editor bg |
| `amber-700` | `#b45309` | Unsaved dot indicator |
| `green-700` | `#15803d` | Valid status |
| `red-500`   | `#ef4444` | Error dots / status |
| `amber-400` | `#f59e0b` | Warning dots / status |

### Typography

- Font: Geist Sans (already in use via `next/font`)
- No font changes required.

---

## 2. shadcn/ui Components to Install

Install only what is needed. Do **not** install the full component library.

| Component | Used in |
|---|---|
| `button` | All buttons throughout |
| `separator` | Toolbar dividers |
| `tooltip` | Icon button tooltips (undo, redo, overflow) |
| `dropdown-menu` | `···` overflow menu |
| `badge` | Feature pills on landing, unsaved indicator |
| `scroll-area` | Validation panel error list, config panel |

---

## 3. Landing Page (empty state)

**Layout:** Centered hero. Single column. Vertically and horizontally centred on the full viewport.

**Structure (top to bottom):**
1. **Logo mark** — `stone-900` filled square (40×40, rounded-lg) with an SVG state-machine icon in white.
2. **Title** — "Visual SCXML Editor" — `text-2xl font-bold tracking-tight text-stone-900`
3. **Subtitle** — one sentence description — `text-sm text-stone-500`
4. **Upload zone** — white card, `border-2 border-dashed border-stone-300`, rounded-xl, `p-8 text-center`. Contains:
   - Upload icon (lucide `Upload`) in a `stone-100` circle
   - "Drop your SCXML file here" heading
   - ".scxml and .xml · up to 10MB" hint
   - Two buttons: **Browse file** (primary, `stone-900` bg) and **New document** (ghost, `stone-300` border)
   - Drag-and-drop hover state: `border-stone-500 bg-stone-50`
5. **Feature pills** — flex-wrap row of `Badge` chips: Code ↔ Visual sync, Real-time validation, SCXML autocomplete, Visual metadata, Undo / Redo

**File:** `src/app/page.tsx` — the `!content` branch.

---

## 4. Editor View

### 4a. Toolbar (single row)

**File:** `src/components/layout/two-tab-layout.tsx`

**Height:** 44px. `bg-white border-b border-stone-200`.

**Left zone:**
- **View toggle** — `inline-flex bg-stone-100 rounded-md p-0.5 border border-stone-200`. Two icon-only buttons (lucide `Workflow` for visual, `Code2` for code). Active button: `bg-white shadow-sm rounded`. Use `Tooltip` for labels.
- `Separator` (vertical, `h-5`)
- **File breadcrumb** — lucide `FileText` icon + filename in `text-sm font-medium text-stone-900`. Unsaved: amber dot `●` `text-amber-600 text-xs`.

**Centre zone (host commands):**
- Rendered from `commands` array (unchanged logic). Each command: `Button variant="outline"` with `size="sm"`, `text-stone-600`. Executing state keeps the spinner. No commands → zone is empty (breadcrumb fills the space via `flex-1`).

**Right zone:**
- `UndoRedoControls` — already icon-only; restyle buttons to `variant="ghost" size="icon"` with `text-stone-500`, disabled = `text-stone-300`.
- `Separator` (vertical, `h-5`)
- **Overflow `···` dropdown** (`DropdownMenu`):
  - Load new file (lucide `Upload`)  
  - ─ separator ─  
  - Download (lucide `Download`) — shown when no visual metadata  
  - Download Download (lucide `Eye`) — shown when `hasVisualMetadata`  
  - Clean SCXML (lucide `EyeOff`) — shown when `hasVisualMetadata`
  - ─ separator ─  
  - Validation (lucide `AlertCircle`) — toggles validation panel; shows error/warning count as a `Badge`

**Remove:** The existing separate tab-nav row (the `border-b bg-gray-50` div with Code Editor / Visual Diagram buttons and `InlineTipsCarousel`). View switching moves fully to the icon toggle.

**Tips carousel:** Move `InlineTipsCarousel` into the **context bar** (see 4b).

### 4b. Context Bar

**File:** `src/components/layout/two-tab-layout.tsx`

Thin secondary bar below the toolbar. `h-9 bg-stone-50 border-b border-stone-200 px-3 flex items-center gap-2 text-xs`.

**Left:** Tips carousel — `InlineTipsCarousel` restyled to `text-xs text-stone-400`.  
**Right:** Nothing by default. (Transition/state edit bars are rendered by the diagram and code editor components — they overlay or sit inside the content area, unchanged.)

### 4c. Content Area

No structural changes. Tab switching logic unchanged; only the trigger moves to the toolbar toggle.

- **Code tab bg:** `bg-white`  
- **Visual tab bg:** `bg-stone-100` (was `bg-gray-100`)

### 4d. Validation Panel

**File:** `src/components/ui/validation-panel.tsx`

- Container: `bg-white border border-stone-200 rounded-xl shadow-sm` (was `rounded-lg shadow-sm`)
- Header: `px-4 pt-3 pb-0 flex items-center justify-between`
- Title: `text-sm font-semibold text-stone-900`
- Close button: `text-stone-400 hover:text-stone-600`
- Tabs: underline style, active = `border-stone-900 text-stone-900`
- Error items:
  - Error bg: `bg-red-50 border-red-100` (softer border)
  - Warning bg: `bg-amber-50 border-amber-100`
  - Message text: `text-sm text-stone-700`
  - Location: `text-xs text-stone-400 font-mono`

### 4e. Config Panel

**File:** `src/components/ui/config-panel.tsx`

- Container: `w-80 flex flex-col border border-stone-200 rounded-xl bg-white shadow-sm`
- Header bg: `bg-stone-50`
- Table header: `bg-stone-50 text-stone-500`
- Row hover: `hover:bg-stone-50`
- Inputs: `border-stone-200 focus:ring-stone-400`
- Add button: `border-dashed border-stone-300 text-stone-500 hover:border-stone-500 hover:text-stone-700`

### 4f. Channel Mapping Panel

**File:** `src/components/ui/channel-mapping-panel.tsx`

Same restyling as Config Panel — replace gray tokens with stone equivalents.

### 4g. Feedback Toasts

**File:** `src/components/layout/two-tab-layout.tsx`

- `info`: `bg-green-50 border border-green-200 text-green-800`  
- `warning`: `bg-amber-50 border border-amber-200 text-amber-800`  
- `error`: `bg-red-50 border border-red-200 text-red-800`  
- Shape: `rounded-xl` (was `rounded-lg`), `shadow-lg`

### 4h. Status Bar

New thin strip at the very bottom of the editor view (`h-6 bg-stone-50 border-t border-stone-200 px-3 flex items-center gap-3 text-xs text-stone-400`).

**Contents:**
- Error/warning count dot + label (mirrors toolbar validation badge)
- Right-aligned: filename + "SCXML" label

**File:** `src/components/layout/two-tab-layout.tsx` — add inside the outermost `flex-col` div, after the content area.

---

## 5. File Upload Component

**File:** `src/components/file-operations/file-upload.tsx`

Restyle to match the landing page upload zone design (section 3 above). The component already handles drag-and-drop; just update classes.

- Border: `border-2 border-dashed border-stone-300 rounded-xl`
- Hover/drag: `hover:border-stone-500 hover:bg-stone-50`
- Icon container: `bg-stone-100 rounded-lg`
- Text: stone scale

---

## 6. UndoRedoControls

**File:** `src/components/ui/undo-redo-controls.tsx`

Replace manual button classes with `Button` from shadcn/ui:
- `variant="ghost" size="icon"`
- `disabled` state handled by shadcn automatically

---

## 7. Global CSS

**File:** `src/app/globals.css`

Remove the hardcoded `button:hover { cursor: pointer; }` rule — shadcn/ui handles this.  
Keep the ReactFlow group node overrides.

---

## 8. shadcn/ui Setup

1. Install shadcn/ui: `npx shadcn@latest init` — choose **stone** as the base colour, **neutral** style.
2. Add components: `npx shadcn@latest add button separator tooltip dropdown-menu badge scroll-area`
3. This generates `src/components/ui/` primitives (button.tsx, etc.). The existing custom files in `src/components/ui/` (validation-panel, config-panel, etc.) are **not** replaced — they are restyled.

---

## 9. Out of Scope

- No logic changes anywhere.
- No changes to diagram nodes, edges, or ReactFlow canvas styling.
- No changes to Monaco editor internals.
- No dark mode (Warm Neutral is light-only).
- No changes to stores, parsers, validators, or lib code.
- The `TransitionEditBar` and `StateActionsEditBar` diagram overlays are **not** restyled in this pass.
