import { XMLBuilder, XMLParser } from "fast-xml-parser";
import { ConditionEvaluator } from "@/lib/scxml/condition-evaluator";

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

function parseDataNodes(xmlContent: string): Array<Record<string, string>> {
  let result: unknown;
  try {
    result = xmlParser.parse(xmlContent);
  } catch {
    return [];
  }
  const dataNodes: Array<Record<string, string>> = [];

  function collect(node: unknown) {
    if (!node || typeof node !== "object") return;
    for (const [key, val] of Object.entries(node as Record<string, unknown>)) {
      if (key === "data") {
        const items = Array.isArray(val) ? val : [val];
        for (const item of items) {
          if (item && typeof item === "object") dataNodes.push(item as Record<string, string>);
        }
      } else {
        collect(val);
      }
    }
  }

  collect(result);
  return dataNodes;
}

/**
 * Extracts all <data id="..."> variable names from an SCXML document.
 */
export function extractDatamodelVariables(xmlContent: string): string[] {
  return parseDataNodes(xmlContent)
    .map((node) => node["@_id"])
    .filter(Boolean);
}

export interface ConfigField {
  name: string;
  type: 'string' | 'double' | 'bool' | 'int';
  defaultValue: string;
}

function inferType(value: string): ConfigField['type'] {
  if (!value.trim() || value.includes("'")) return 'string';
  if (value.includes('.')) return 'double';
  if (value === 'true' || value === 'false') return 'bool';
  return 'int';
}

export type ExprType = 'bool' | 'double' | 'int' | 'unknown';

/** Blanks out everything inside quotes and brackets (and the brackets themselves), keeping only top-level text. */
function maskNested(expr: string): string {
  let out = '';
  let depth = 0;
  let quote = '';
  for (const ch of expr) {
    if (quote) {
      if (ch === quote) quote = '';
      out += ' ';
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      out += ' ';
    } else if ('([{'.includes(ch)) {
      depth++;
      out += ' ';
    } else if (')]}'.includes(ch)) {
      depth--;
      out += ' ';
    } else {
      out += depth > 0 ? ' ' : ch;
    }
  }
  return out;
}

/** Splits expr at the given (global) regex's matches found in its masked form. */
function splitAtTopLevel(expr: string, masked: string, separator: RegExp): string[] {
  const parts: string[] = [];
  let start = 0;
  for (const m of masked.matchAll(separator)) {
    parts.push(expr.slice(start, m.index));
    start = m.index + m[0].length;
  }
  parts.push(expr.slice(start));
  return parts;
}

function mergeTypes(types: ExprType[]): ExprType {
  const known = types.filter((t) => t !== 'unknown');
  if (known.length === 0) return 'unknown';
  if (known.every((t) => t === known[0])) return known[0];
  if (known.every((t) => t === 'int' || t === 'double')) return 'double';
  return 'int'; // bool mixed with a number: no single C# type fits, so fall back to int
}

/**
 * Infers the result type of a JS expression from its outermost operator. An operator alone does
 * not decide the type: comparisons and "!" always give a bool, but "||"/"&&" return one of their
 * operands (so "0 || 1" is a number) and "?:" returns one of its branches. A bare variable name
 * has the type it has in `known` (see declaredVariableTypes), and is unknown otherwise.
 */
function inferExprType(raw: string, known?: ReadonlyMap<string, ExprType>): ExprType {
  const infer = (part: string) => inferExprType(part, known);
  const expr = raw.trim();
  if (!expr) return 'unknown';
  const masked = maskNested(expr);

  if (/^\(/.test(expr) && !masked.trim()) return infer(expr.slice(1, -1));

  // ternary: type of the branches
  const q = masked.search(/\?(?![.?])/);
  if (q >= 0) {
    let level = 1;
    for (let i = q + 1; i < masked.length; i++) {
      if (masked[i] === '?' && masked[i + 1] !== '?' && masked[i - 1] !== '?') level++;
      else if (masked[i] === ':' && --level === 0) {
        return mergeTypes([infer(expr.slice(q + 1, i)), infer(expr.slice(i + 1))]);
      }
    }
  }

  // logical: type of the operands; bare variables on both sides are assumed to be bool flags
  if (/\|\||&&/.test(masked)) {
    const t = mergeTypes(splitAtTopLevel(expr, masked, /\|\||&&/g).map(infer));
    return t === 'unknown' && !/[+\-*/%]/.test(expr) ? 'bool' : t;
  }

  const hasShift = /<<|>>/.test(masked);
  const noShifts = masked.replace(/<<|>>>|>>|=>/g, '  ');
  if (/[<>]|[!=]=/.test(noShifts)) return 'bool';
  if (/^\s*!/.test(noShifts) && !/[-+*/%&|^]/.test(noShifts)) return 'bool';
  if (hasShift || /[&|^]/.test(masked)) return 'int';

  if (/[+\-*/%]/.test(masked)) {
    // any double makes the result double; otherwise an operand of unknown type could still be one
    const operands = splitAtTopLevel(expr, masked, /[+\-*/%]/g).filter((p) => p.trim()).map(infer);
    if (operands.includes('double')) return 'double';
    return operands.includes('unknown') ? 'unknown' : 'int';
  }

  if (expr === 'true' || expr === 'false') return 'bool';
  if (/^\d*\.\d+$/.test(expr)) return 'double';
  if (/^\d+$/.test(expr)) return 'int';
  return known?.get(expr) ?? 'unknown';
}

/**
 * The type of every <data> variable whose declaration shows one: a conf_ field's explicit
 * confType, otherwise the type of its initial value literal ("true" -> bool, "12.5" -> double,
 * "0" -> int). The generated C# field has this type, so it is also the type an expression
 * reading the variable has. Strings and non-literal initial values are left out (unknown).
 */
function declaredVariableTypes(dataNodes: Array<Record<string, string>>): Map<string, ExprType> {
  const types = new Map<string, ExprType>();
  for (const node of dataNodes) {
    const id = node['@_id'];
    if (!id) continue;
    const confType = node['@_confType'];
    const type: ExprType =
      confType === 'bool' || confType === 'int' || confType === 'double'
        ? confType
        : confType === 'string'
          ? 'unknown'
          : inferExprType(node['@_expr'] ?? '');
    if (type !== 'unknown') types.set(id, type);
  }
  return types;
}

/**
 * Picks the <data expr> for a newly created (non-conf) channel from the value being assigned to
 * it (the <assign expr>) — the assigned expression itself never goes into <data expr>. The
 * LoopCode C# generator (GetFieldAndType) infers the field type from this literal and only
 * accepts the zero value per type for non-config fields: "false" -> bool, "0.0" -> double,
 * "0" -> int. Anything of unknown type is double: a double field accepts both int and double
 * values, while assigning a double to an int field fails to compile. Non-config string fields
 * are rejected by the generator whichever type is declared.
 */
export function inferChannelInitialExpr(
  assignedValue: string | undefined,
  known?: ReadonlyMap<string, ExprType>
): string {
  switch (inferExprType(assignedValue ?? '', known)) {
    case 'bool': return 'false';
    case 'int': return '0';
    default: return '0.0';
  }
}

const AUTO_CHANNEL_EXPRS: ReadonlySet<string> = new Set(['false', '0.0', '0']);

/** Marks a channel used as a number of unknown int/double type (e.g. compared to a literal). */
const NUMERIC_USE = 'number';

const THIS_CHANNEL_ID = /^this_\w+$/;
/** A this_ identifier that is not a property access (foo.this_x) or part of a longer name. */
const THIS_CHANNEL_REF = /(?<![\w$.])this_\w+/g;

/** Strips parentheses that wrap the whole expression, e.g. "((a))" -> "a". */
function stripOuterParens(raw: string): string {
  let expr = raw.trim();
  while (expr.startsWith('(') && !maskNested(expr).trim()) expr = expr.slice(1, -1).trim();
  return expr;
}

/** Every this_ identifier referenced in an expression, ignoring ones inside string literals. */
export function findThisChannelRefs(expr: string): string[] {
  const unquoted = expr.replace(/'[^']*'|"[^"]*"/g, (s) => ' '.repeat(s.length));
  return Array.from(unquoted.matchAll(THIS_CHANNEL_REF), (m) => m[0]);
}

/**
 * Records the type an expression implies for the this_ channels it reads, as a <data expr> zero
 * value. Only unambiguous uses count: a channel used as a whole boolean operand (the whole cond,
 * negated, or next to && / ||) is a bool; a channel compared to a bool literal is a bool, and one
 * compared to a number is NUMERIC_USE (some number: C# compares int and double fields alike).
 * A comparison with a declared variable counts as one with a value of that variable's type
 * (`known`). Everything else (arithmetic, comparing untyped names, ternary branches) says nothing.
 */
function collectUsageTypes(
  raw: string,
  boolContext: boolean,
  record: (id: string, expr: string) => void,
  known: ReadonlyMap<string, ExprType>
): void {
  const collect = (part: string, inBoolContext: boolean) => collectUsageTypes(part, inBoolContext, record, known);
  const expr = stripOuterParens(raw);
  if (!expr) return;
  const masked = maskNested(expr);

  const q = masked.search(/\?(?![.?])/);
  if (q >= 0) {
    collect(expr.slice(0, q), true);
    return;
  }

  if (/\|\||&&/.test(masked)) {
    for (const part of splitAtTopLevel(expr, masked, /\|\||&&/g)) collect(part, true);
    return;
  }

  const noShifts = masked.replace(/<<|>>>|>>|=>/g, (s) => ' '.repeat(s.length));
  const cmp = /[!=]==?|[<>]=?/.exec(noShifts);
  if (cmp) {
    const sides = [expr.slice(0, cmp.index), expr.slice(cmp.index + cmp[0].length)];
    sides.forEach((side, i) => {
      const id = stripOuterParens(side);
      if (THIS_CHANNEL_ID.test(id)) {
        const otherType = inferExprType(sides[1 - i], known);
        if (otherType === 'bool') record(id, 'false');
        else if (otherType !== 'unknown') record(id, NUMERIC_USE);
      } else {
        collect(side, false);
      }
    });
    return;
  }

  if (expr.startsWith('!') && !/[-+*/%&|^]/.test(masked)) {
    collect(expr.slice(1), true);
    return;
  }

  if (boolContext && THIS_CHANNEL_ID.test(expr)) record(expr, 'false');
}

/**
 * Reduces the types implied for one channel to a single <data expr> zero value, NUMERIC_USE when
 * it is only known to be some number, or null when the uses disagree or one is undeterminable.
 */
function resolveChannelExpr(types: Set<string> | undefined): string | null {
  if (!types || types.size === 0 || types.has('unknown')) return null;
  if (types.has('false')) return types.size === 1 ? 'false' : null;
  if (types.has('0.0')) return '0.0'; // int and double together fit a double
  if (types.has('0')) return '0';
  return NUMERIC_USE;
}

/**
 * Works out what the datamodel needs for this_ channels to match how they are used in conditions
 * (any `cond` attribute) and <assign> elements:
 *
 * - `missing`: this_ channels referenced but not declared, with the <data expr> to create them with
 *   (a double when the type cannot be determined, as for inferChannelInitialExpr).
 * - `retypes`: declared this_ channels whose <data expr> no longer matches their usage. Only
 *   channels still holding a generated zero value are considered (a hand-written initial value is
 *   left alone), and only when every use agrees on one type; conflicting uses have no single
 *   correct type, so they are skipped. So are channels assigned a value whose type cannot be
 *   determined, and a double is never narrowed to int: an untyped operand could still be a double,
 *   and the generated C# rejects assigning a double to an int field but accepts an int in a
 *   double field.
 *
 * Variables are typed from their declarations (declaredVariableTypes), so `this_v = conf_enabled`
 * makes this_v a bool when conf_enabled is declared "true". A this_ channel retyped here can change
 * the type of channels assigned from it, so callers wanting a settled datamodel apply the changes
 * and run this again until it returns none (see syncThisChannels).
 */
export function inferThisChannelChanges(xmlContent: string): {
  missing: Array<{ id: string; expr: string }>;
  retypes: Array<{ id: string; expr: string }>;
} {
  const analysis = analyzeThisChannels(xmlContent);
  if (!analysis) return { missing: [], retypes: [] };
  const { dataNodes, referenceSites, usages } = analysis;
  const typesOf = (id: string) => new Set(usages.get(id)?.map((u) => u.type));

  const declared = new Set<string>();
  const retypes: Array<{ id: string; expr: string }> = [];
  for (const node of dataNodes) {
    const id = node['@_id'];
    if (!id) continue;
    declared.add(id);
    const current = node['@_expr'] ?? '';
    if (!id.startsWith('this_') || !AUTO_CHANNEL_EXPRS.has(current)) continue;
    let inferred = resolveChannelExpr(typesOf(id));
    // Some number: an int or double channel already fits, only a bool needs changing.
    if (inferred === NUMERIC_USE) inferred = current === 'false' ? '0.0' : null;
    if (!inferred || (current === '0.0' && inferred === '0')) continue;
    if (inferred !== current) retypes.push({ id, expr: inferred });
  }

  const missing = Array.from(referenceSites.keys())
    .filter((id) => !declared.has(id))
    .map((id) => ({ id, expr: initialExprForMissing(typesOf(id)) }));

  return { missing, retypes };
}

/** The `retypes` half of inferThisChannelChanges. */
export function inferChannelRetypes(xmlContent: string): Array<{ id: string; expr: string }> {
  return inferThisChannelChanges(xmlContent).retypes;
}

/** Where a this_ channel is referenced: a condition (on a transition, or an <if>) or an <assign>. */
export type ThisChannelSite =
  | { kind: 'cond'; stateId?: string; targetId?: string }
  | { kind: 'assign'; stateId?: string };

interface ThisChannelUsage {
  /** A <data expr> zero value ('false', '0', '0.0'), NUMERIC_USE, or 'unknown'. */
  type: string;
  site: ThisChannelSite;
}

const STATE_TAGS: ReadonlySet<string> = new Set(['state', 'parallel', 'final']);

/**
 * Collects every this_ channel reference in conditions and <assign>s, with the type each use
 * implies (see collectUsageTypes) and where it is. Null when the document doesn't parse.
 */
function analyzeThisChannels(xmlContent: string): {
  dataNodes: Array<Record<string, string>>;
  known: Map<string, ExprType>;
  referenceSites: Map<string, ThisChannelSite[]>;
  usages: Map<string, ThisChannelUsage[]>;
} | null {
  let parsed: unknown;
  try {
    parsed = xmlParser.parse(xmlContent);
  } catch {
    return null;
  }

  const dataNodes = parseDataNodes(xmlContent);
  const known = declaredVariableTypes(dataNodes);
  const referenceSites = new Map<string, ThisChannelSite[]>();
  const usages = new Map<string, ThisChannelUsage[]>();
  const push = <T>(map: Map<string, T[]>, id: string, item: T) => map.set(id, [...(map.get(id) ?? []), item]);

  function collect(node: unknown, tag: string, stateId: string | undefined): void {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach((item) => collect(item, tag, stateId));
      return;
    }
    const obj = node as Record<string, unknown>;
    const ownId = obj['@_id'];
    const here = STATE_TAGS.has(tag) && typeof ownId === 'string' ? ownId : stateId;

    const cond = obj['@_cond'];
    if (typeof cond === 'string') {
      const target = obj['@_target'];
      const site: ThisChannelSite = {
        kind: 'cond',
        stateId: here,
        targetId: tag === 'transition' && typeof target === 'string' ? target : undefined,
      };
      findThisChannelRefs(cond).forEach((id) => push(referenceSites, id, site));
      collectUsageTypes(cond, true, (id, type) => push(usages, id, { type, site }), known);
    }

    for (const [key, val] of Object.entries(obj)) {
      if (key.startsWith('@_')) continue;
      if (key !== 'assign') {
        collect(val, key, here);
        continue;
      }
      for (const item of Array.isArray(val) ? val : [val]) {
        const site: ThisChannelSite = { kind: 'assign', stateId: here };
        const record = (id: string, type: string) => push(usages, id, { type, site });
        const location = item?.['@_location'];
        const expr = item?.['@_expr'];
        if (typeof expr === 'string') {
          findThisChannelRefs(expr).forEach((id) => push(referenceSites, id, site));
          collectUsageTypes(expr, false, record, known);
        }
        if (typeof location !== 'string') continue;
        if (THIS_CHANNEL_ID.test(location)) push(referenceSites, location, site);
        if (typeof expr === 'string') {
          record(location, inferExprType(expr, known) === 'unknown' ? 'unknown' : inferChannelInitialExpr(expr, known));
        }
      }
    }
  }
  collect(parsed, '', undefined);

  return { dataNodes, known, referenceSites, usages };
}

/** The <data expr> to declare a missing channel with: its inferred type, else a double. */
function initialExprForMissing(types: Set<string>): string {
  const inferred = resolveChannelExpr(types);
  return !inferred || inferred === NUMERIC_USE ? '0.0' : inferred;
}

/** A this_ channel problem the Validation panel reports (see validateThisChannelTypes). */
export type ThisChannelIssue =
  /** Referenced but not declared; `expr` is what declaring it would use. */
  | { kind: 'undeclared'; id: string; expr: string; site: ThisChannelSite }
  /** Used as a bool in one place and as a number in another: no one type fits both. */
  | { kind: 'conflict'; id: string; boolSite: ThisChannelSite; numberSite: ThisChannelSite }
  /**
   * Declared with a type its uses contradict. `current` is the declared <data expr>, `expected`
   * the zero value its uses need, and `use` the type of the use at `site`.
   */
  | {
      kind: 'mismatch';
      id: string;
      current: string;
      expected: string;
      use: 'bool' | 'number' | 'double';
      site: ThisChannelSite;
    };

/**
 * Finds this_ channels whose declaration can't work with how they are used — what the generated
 * C# would reject. Unlike inferThisChannelChanges, this looks at every declared value (hand-written
 * ones and edits made in the code editor too), and counts the uses it can type even when another
 * use's type is unknown: those uses are wrong for the declared type whatever the unknown one is.
 *
 * - `undeclared`: referenced but not declared.
 * - `conflict`: used both as a bool and as a number.
 * - `mismatch`: used as a bool but declared a number, used as a number but declared a bool, or
 *   assigned a double while declared an int. An int value in a double channel is fine.
 *
 * Channels whose declared value has no recognizable type (e.g. a function call) are skipped.
 */
export function findThisChannelTypeIssues(xmlContent: string): ThisChannelIssue[] {
  const analysis = analyzeThisChannels(xmlContent);
  if (!analysis) return [];
  const { dataNodes, known, referenceSites, usages } = analysis;
  const issues: ThisChannelIssue[] = [];

  const declared = new Set(dataNodes.map((node) => node['@_id']).filter(Boolean));
  for (const [id, sites] of referenceSites) {
    if (declared.has(id)) continue;
    const types = new Set(usages.get(id)?.map((u) => u.type));
    issues.push({ kind: 'undeclared', id, expr: initialExprForMissing(types), site: sites[0] });
  }

  for (const node of dataNodes) {
    const id = node['@_id'];
    if (!id?.startsWith('this_')) continue;
    const typed = (usages.get(id) ?? []).filter((u) => u.type !== 'unknown');
    const boolUse = typed.find((u) => u.type === 'false');
    const numberUses = typed.filter((u) => u.type !== 'false');
    if (boolUse && numberUses.length > 0) {
      issues.push({ kind: 'conflict', id, boolSite: boolUse.site, numberSite: numberUses[0].site });
      continue;
    }

    const declaredType = known.get(id);
    const current = node['@_expr'] ?? '';
    if (boolUse && (declaredType === 'int' || declaredType === 'double')) {
      issues.push({ kind: 'mismatch', id, current, expected: 'false', use: 'bool', site: boolUse.site });
    } else if (numberUses.length > 0 && declaredType === 'bool') {
      const doubleUse = numberUses.find((u) => u.type === '0.0');
      const expected = doubleUse || !numberUses.some((u) => u.type === '0') ? '0.0' : '0';
      issues.push({ kind: 'mismatch', id, current, expected, use: 'number', site: numberUses[0].site });
    } else if (declaredType === 'int') {
      const doubleUse = numberUses.find((u) => u.type === '0.0');
      if (doubleUse) {
        issues.push({ kind: 'mismatch', id, current, expected: '0.0', use: 'double', site: doubleUse.site });
      }
    }
  }
  return issues;
}

const VALID_CONF_TYPES:ReadonlySet<string> = new Set(['int', 'double', 'bool', 'string']);

export function extractConfigFields(xmlContent: string): ConfigField[] {
  const res =  parseDataNodes(xmlContent)
    .filter((node) => node["@_id"]?.startsWith("conf_"))
    .map((node) => {
      const name = node["@_id"].slice(5);
      const defaultValue = node["@_expr"] ?? "";
      const explicitType = node["@_confType"];
      const type = explicitType && VALID_CONF_TYPES.has(explicitType)
        ? explicitType as ConfigField['type']
        : inferType(defaultValue);
      return { name, type, defaultValue };
    });
    return res;
}

const updateParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseAttributeValue: false,
  trimValues: false,
  preserveOrder: true,
  commentPropName: "#comment",
  cdataPropName: "#cdata",
});

const updateBuilder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  preserveOrder: true,
  commentPropName: "#comment",
  cdataPropName: "#cdata",
  suppressEmptyNode: true,
});

export function updateConfigFieldExpr(xmlContent: string, name: string, newValue: string): string {
  let doc: unknown[];
  try {
    doc = updateParser.parse(xmlContent) as unknown[];
  } catch {
    return xmlContent;
  }

  const targetId = `conf_${name}`;

  function walk(nodes: unknown[]): void {
    for (const node of nodes) {
      if (!node || typeof node !== "object") continue;
      const nodeObj = node as Record<string, unknown>;
      if ("data" in nodeObj) {
        const attrs = nodeObj[":@"] as Record<string, string> | undefined;
        if (attrs?.["@_id"] === targetId) attrs["@_expr"] = newValue;
      } else {
        for (const [key, val] of Object.entries(nodeObj)) {
          if (key !== ":@" && Array.isArray(val)) walk(val);
        }
      }
    }
  }

  walk(doc);
  return updateBuilder.build(doc);
}

export function updateConfigFieldType(xmlContent: string, name: string, newType: ConfigField['type']): string {
  let doc: unknown[];
  try {
    doc = updateParser.parse(xmlContent) as unknown[];
  } catch {
    return xmlContent;
  }

  const targetId = `conf_${name}`;

  function walk(nodes: unknown[]): void {
    for (const node of nodes) {
      if (!node || typeof node !== "object") continue;
      const nodeObj = node as Record<string, unknown>;
      if ("data" in nodeObj) {
        const attrs = nodeObj[":@"] as Record<string, string> | undefined;
        if (attrs?.["@_id"] === targetId) attrs["@_confType"] = newType;
      } else {
        for (const [key, val] of Object.entries(nodeObj)) {
          if (key !== ":@" && Array.isArray(val)) walk(val);
        }
      }
    }
  }

  walk(doc);
  return updateBuilder.build(doc);
}

/**
 * Ensures every conf_ field carries an explicit confType attribute, computing it via the
 * same inferType heuristic used for legacy files that predate the attribute. Called once at
 * import time so the guess is captured explicitly rather than re-derived from expr on every load.
 */
export function annotateLegacyConfTypes(xmlContent: string): string {
  let doc: unknown[];
  try {
    doc = updateParser.parse(xmlContent) as unknown[];
  } catch {
    return xmlContent;
  }

  let changed = false;

  function walk(nodes: unknown[]): void {
    for (const node of nodes) {
      if (!node || typeof node !== "object") continue;
      const nodeObj = node as Record<string, unknown>;
      if ("data" in nodeObj) {
        const attrs = nodeObj[":@"] as Record<string, string> | undefined;
        if (attrs?.["@_id"]?.startsWith("conf_") && !attrs["@_confType"]) {
          attrs["@_confType"] = inferType(attrs["@_expr"] ?? "");
          changed = true;
        }
      } else {
        for (const [key, val] of Object.entries(nodeObj)) {
          if (key !== ":@" && Array.isArray(val)) walk(val);
        }
      }
    }
  }

  walk(doc);
  return changed ? updateBuilder.build(doc) : xmlContent;
}

export function deleteConfigField(xmlContent: string, name: string): string {
  let doc: unknown[];
  try {
    doc = updateParser.parse(xmlContent) as unknown[];
  } catch {
    return xmlContent;
  }

  const targetId = `conf_${name}`;

  function walk(nodes: unknown[]): void {
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i];
      if (!node || typeof node !== 'object') continue;
      const nodeObj = node as Record<string, unknown>;
      if ('data' in nodeObj) {
        const attrs = nodeObj[':@'] as Record<string, string> | undefined;
        if (attrs?.['@_id'] === targetId) nodes.splice(i, 1);
      } else {
        for (const [key, val] of Object.entries(nodeObj)) {
          if (key !== ':@' && Array.isArray(val)) walk(val);
        }
      }
    }
  }

  walk(doc);
  return updateBuilder.build(doc);
}

const SCXML_EXPR_ATTRS = new Set(['@_cond', '@_expr', '@_location', '@_namelist', '@_targetexpr', '@_srcexpr']);

/**
 * Returns variable names referenced in SCXML expressions/conditions that are not
 * declared in the datamodel, not reserved (this_* or conf_* prefixes), and not
 * already present as a physical channel in IO.conf.
 * These are "unresolved channel references" that need to be mapped to physical channels.
 */
export function extractUnresolvedChannelRefs(xmlContent: string, channels: string[]): string[] {
  const channelSet = new Set(channels);
  const refs = new Set<string>();

  let parsed: unknown;
  try {
    parsed = xmlParser.parse(xmlContent);
  } catch {
    return [];
  }

  function walk(node: unknown, parentKey?: string): void {
    if (!node || typeof node !== 'object') return;
    for (const [key, val] of Object.entries(node as Record<string, unknown>)) {
      if (SCXML_EXPR_ATTRS.has(key) && typeof val === 'string') {
        // <data> expr initializes variables with literal/computed values, not channel refs
        if (key === '@_expr' && parentKey === 'data') continue;
        // Strip _event. prefix so _event.data is treated as the event parameter, not a channel ref
        const stripped = val.replace(/_event\./g, '');
        for (const v of ConditionEvaluator.extractVariables(stripped)) {
          refs.add(v);
        }
      } else if (key !== ':@') {
        if (Array.isArray(val)) val.forEach(item => walk(item, key));
        else walk(val, key);
      }
    }
  }

  walk(parsed);

  return Array.from(refs)
    .filter(r => !r.startsWith('this_') && !r.startsWith('conf_') && r !== 'data' && !channelSet.has(r))
    .sort();
}

/**
 * Returns "main_"-prefixed variable names referenced anywhere in SCXML expressions
 * (cond, expr, location, namelist, targetexpr, srcexpr), across every element - not just
 * <data> declarations. Unlike extractUnresolvedChannelRefs, this does not exclude <data>'s
 * own expr, since a reference to a "main_" variable there is just as non-portable.
 */
export function extractMainPrefixedExpressionRefs(xmlContent: string): string[] {
  const refs = new Set<string>();

  let parsed: unknown;
  try {
    parsed = xmlParser.parse(xmlContent);
  } catch {
    return [];
  }

  function walk(node: unknown): void {
    if (!node || typeof node !== 'object') return;
    for (const [key, val] of Object.entries(node as Record<string, unknown>)) {
      if (SCXML_EXPR_ATTRS.has(key) && typeof val === 'string') {
        const stripped = val.replace(/_event\./g, '');
        for (const v of ConditionEvaluator.extractVariables(stripped)) {
          if (v.startsWith('main_')) refs.add(v);
        }
      } else if (key !== ':@') {
        if (Array.isArray(val)) val.forEach(item => walk(item));
        else walk(val);
      }
    }
  }

  walk(parsed);

  return Array.from(refs).sort();
}

/**
 * Returns the ids of elements that reference conf_<name> anywhere in the SCXML
 * (cond, expr, location, namelist, targetexpr, srcexpr), excluding the field's own
 * <data> declaration. Each entry is the nearest enclosing element id (e.g. the state
 * containing the referencing transition), falling back to the element's tag name if
 * no ancestor has an id. Empty array means the field is safe to delete.
 */
export function getConfigFieldUsage(xmlContent: string, name: string): string[] {
  const targetId = `conf_${name}`;
  const locations: string[] = [];

  let parsed: unknown;
  try {
    parsed = xmlParser.parse(xmlContent);
  } catch {
    return [];
  }

  function walk(node: unknown, tag: string | undefined, ancestorId: string | undefined): void {
    if (!node || typeof node !== 'object') return;
    const nodeObj = node as Record<string, unknown>;
    const ownId = typeof nodeObj['@_id'] === 'string' ? (nodeObj['@_id'] as string) : undefined;
    const currentAncestorId = ownId ?? ancestorId;

    for (const [key, val] of Object.entries(nodeObj)) {
      if (SCXML_EXPR_ATTRS.has(key) && typeof val === 'string') {
        if (key === '@_expr' && tag === 'data' && ownId === targetId) continue;
        const stripped = val.replace(/_event\./g, '');
        if (ConditionEvaluator.extractVariables(stripped).includes(targetId)) {
          locations.push(currentAncestorId ?? tag ?? key);
        }
      } else if (key !== '@_id') {
        if (Array.isArray(val)) val.forEach(item => walk(item, key, currentAncestorId));
        else walk(val, key, currentAncestorId);
      }
    }
  }

  walk(parsed, undefined, undefined);
  return Array.from(new Set(locations));
}