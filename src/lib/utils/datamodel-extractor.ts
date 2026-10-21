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

type ExprType = 'bool' | 'double' | 'int' | 'unknown';

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
 * operands (so "0 || 1" is a number) and "?:" returns one of its branches.
 */
function inferExprType(raw: string): ExprType {
  const expr = raw.trim();
  if (!expr) return 'unknown';
  const masked = maskNested(expr);

  if (/^\(/.test(expr) && !masked.trim()) return inferExprType(expr.slice(1, -1));

  // ternary: type of the branches
  const q = masked.search(/\?(?![.?])/);
  if (q >= 0) {
    let level = 1;
    for (let i = q + 1; i < masked.length; i++) {
      if (masked[i] === '?' && masked[i + 1] !== '?' && masked[i - 1] !== '?') level++;
      else if (masked[i] === ':' && --level === 0) {
        return mergeTypes([inferExprType(expr.slice(q + 1, i)), inferExprType(expr.slice(i + 1))]);
      }
    }
  }

  // logical: type of the operands; bare variables on both sides are assumed to be bool flags
  if (/\|\||&&/.test(masked)) {
    const t = mergeTypes(splitAtTopLevel(expr, masked, /\|\||&&/g).map(inferExprType));
    return t === 'unknown' ? 'bool' : t;
  }

  const hasShift = /<<|>>/.test(masked);
  const noShifts = masked.replace(/<<|>>>|>>|=>/g, '  ');
  if (/[<>]|[!=]=/.test(noShifts)) return 'bool';
  if (/^\s*!/.test(noShifts) && !/[-+*/%&|^]/.test(noShifts)) return 'bool';
  if (hasShift || /[&|^]/.test(masked)) return 'int';

  if (/[+\-*/%]/.test(masked)) {
    const t = mergeTypes(splitAtTopLevel(expr, masked, /[+\-*/%]/g).map(inferExprType).filter((p) => p !== 'unknown'));
    return t === 'double' ? 'double' : 'int';
  }

  if (expr === 'true' || expr === 'false') return 'bool';
  if (/^\d*\.\d+$/.test(expr)) return 'double';
  if (/^\d+$/.test(expr)) return 'int';
  return 'unknown';
}

/**
 * Picks the <data expr> for a newly created (non-conf) channel from the value being assigned to
 * it (the <assign expr>) — the assigned expression itself never goes into <data expr>. The
 * LoopCode C# generator (GetFieldAndType) infers the field type from this literal and only
 * accepts the zero value per type for non-config fields: "false" -> bool, "0.0" -> double,
 * "0" -> int. Non-config string fields are rejected by the generator, so anything else is int.
 */
export function inferChannelInitialExpr(assignedValue: string | undefined): string {
  switch (inferExprType(assignedValue ?? '')) {
    case 'bool': return 'false';
    case 'double': return '0.0';
    default: return '0';
  }
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