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

const VALID_CONF_TYPES: ReadonlySet<string> = new Set(['int', 'double', 'bool', 'string']);

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