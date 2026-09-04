/**
 * Visual Metadata Utilities for SCXML Converter
 *
 * Handles extraction and manipulation of visual metadata (viz:xywh, viz:rgb)
 * and XML utility functions for SCXML parsing.
 */

import type { HierarchicalNode } from '@/types/hierarchical-node';
import { VISUAL_METADATA_CONSTANTS } from '@/types/visual-metadata';
import { formatXML } from '@/lib/utils/format-utils';
import type { HandleSide } from '@/lib/layout/edge-obstacle-utils';

export interface VisualMetadata {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  /** Per-side anchor-point counts (viz:anchors) — sides at the default of 1 are omitted. */
  anchors?: Partial<Record<HandleSide, number>>;
}

/**
 * Parses the viz:anchors attribute value ("side:count;side:count") into a
 * per-side count map. Malformed entries (unknown side, non-positive count)
 * are skipped rather than throwing, since this reads user-editable XML.
 */
export function parseAnchorsAttribute(value: string): Partial<Record<HandleSide, number>> {
  const result: Partial<Record<HandleSide, number>> = {};
  const sides: HandleSide[] = ['top', 'bottom', 'left', 'right'];
  for (const entry of value.split(';')) {
    const [side, countStr] = entry.split(':').map((s) => s.trim());
    const count = parseInt(countStr, 10);
    if (sides.includes(side as HandleSide) && Number.isFinite(count) && count > 1) {
      result[side as HandleSide] = count;
    }
  }
  return result;
}

/**
 * Serializes a per-side anchor count map back into the viz:anchors attribute
 * format, omitting sides at the default count of 1.
 */
export function formatAnchorsAttribute(anchors: Partial<Record<HandleSide, number>>): string {
  return (Object.entries(anchors) as [HandleSide, number][])
    .filter(([, count]) => count > 1)
    .map(([side, count]) => `${side}:${count}`)
    .join(';');
}

/**
 * Extract visual metadata from SCXML element (viz:xywh, viz:rgb)
 */
export function extractVisualMetadata(
  element: any,
  getAttribute: (element: any, attrName: string) => string | undefined
): VisualMetadata {
  const metadata: VisualMetadata = {};

  // Extract visual metadata from the viz namespace
  const vizXywh = getAttribute(element, 'viz:xywh');
  const vizRgb = getAttribute(element, 'viz:rgb');
  const vizAnchors = getAttribute(element, 'viz:anchors');

  // Parse viz:xywh format: "x,y,width,height" (comma-separated)
  if (vizXywh && typeof vizXywh === 'string') {
    const parts = vizXywh
      .trim()
      .split(',')
      .map((p) => p.trim());
    if (parts.length >= 4) {
      metadata.x = parseFloat(parts[0]);
      metadata.y = parseFloat(parts[1]);
      metadata.width = parseFloat(parts[2]);
      metadata.height = parseFloat(parts[3]);
    }
  }

  // Parse viz:rgb for fill color
  if (vizRgb) {
    (metadata as any).fill = vizRgb;
  }

  if (vizAnchors) {
    metadata.anchors = parseAnchorsAttribute(vizAnchors);
  }

  return metadata;
}

export interface EdgeHandleEntry {
  source: string;
  target: string;
  event?: string;
  condition?: string;
  sourceHandle: string;
  targetHandle: string;
}

/**
 * Write calculated layout (position + dimensions) back to SCXML as viz:xywh attributes,
 * and optionally write computed edge handles as viz:sourceHandle / viz:targetHandle.
 * This initializes SCXML files that arrive without viz:xywh or without handle attributes.
 */
export function writeLayoutToSCXML(
  nodes: HierarchicalNode[],
  originalScxmlContent: string,
  edgeHandles?: EdgeHandleEntry[]
): string {
  if (!originalScxmlContent) {
    console.warn('No original SCXML content available for write-back');
    return '';
  }

  try {
    // Normalize namespace URI in the raw XML before parsing
    // This handles migration from old namespace URIs
    let normalizedXml = originalScxmlContent;

    // Replace any old namespace URIs with the canonical one
    const oldNamespacePatterns = [
      /xmlns:viz\s*=\s*["']http:\/\/scxml-viz\.github\.io\/ns["']/g,
      /xmlns:viz\s*=\s*["']urn:x-thingm:viz["']/g,
      /xmlns:ns1\s*=\s*["']http:\/\/scxml-viz\.github\.io\/ns["']/g,
      /xmlns:ns1\s*=\s*["']urn:x-thingm:viz["']/g,
    ];

    for (const pattern of oldNamespacePatterns) {
      normalizedXml = normalizedXml.replace(
        pattern,
        `xmlns:viz="${VISUAL_METADATA_CONSTANTS.NAMESPACE_URI}"`
      );
    }

    // Also replace ns1: prefixed attributes with viz: prefix
    normalizedXml = normalizedXml.replace(/\bns1:/g, 'viz:');

    const parser = new DOMParser();
    const doc = parser.parseFromString(normalizedXml, 'text/xml');

    // Check for XML parsing errors
    const parseError = doc.querySelector('parsererror');
    if (parseError) {
      console.error(
        'XML parsing error in writeLayoutToSCXML:',
        parseError.textContent
      );
      return '';
    }

    // Ensure viz namespace is declared on root element with correct URI
    const root = doc.documentElement;
    if (root) {
      // Always set/update the namespace to the canonical URI
      // This migrates old namespace URIs to the new standard
      root.setAttribute('xmlns:viz', VISUAL_METADATA_CONSTANTS.NAMESPACE_URI);
    }

    // Update viz:xywh for each node
    nodes.forEach((node) => {
      // Find the state element by ID (could be <state>, <parallel>, or <final>)
      const stateElement = doc.querySelector(
        `state[id="${node.id}"], parallel[id="${node.id}"], final[id="${node.id}"]`
      );

      if (!stateElement) {
        console.warn(`State element not found for node: ${node.id}`);
        return;
      }

      // Get position and dimensions
      const x = Math.round(node.position.x);
      const y = Math.round(node.position.y);
      const width = Math.round((node.data as any).width || 160);
      const height = Math.round((node.data as any).height || 80);

      // Set viz:xywh attribute in format "x,y,width,height"
      const vizXywh = `${x},${y},${width},${height}`;
      stateElement.setAttribute('viz:xywh', vizXywh);
    });

    // Write viz:sourceHandle / viz:targetHandle to transition elements
    if (edgeHandles && edgeHandles.length > 0) {
      for (const entry of edgeHandles) {
        const sourceEl = doc.querySelector(
          `state[id="${entry.source}"], parallel[id="${entry.source}"], final[id="${entry.source}"]`
        );
        if (!sourceEl) continue;

        const transitions = Array.from(sourceEl.querySelectorAll(':scope > transition'));
        for (const transition of transitions) {
          const tgt = transition.getAttribute('target');
          const evt = transition.getAttribute('event') ?? undefined;
          const cond = transition.getAttribute('cond') ?? undefined;

          const targetMatches = tgt === entry.target;
          const eventMatches = (evt ?? '') === (entry.event ?? '');
          const condMatches = (cond ?? '') === (entry.condition ?? '');

          if (targetMatches && eventMatches && condMatches) {
            transition.setAttribute('viz:sourceHandle', entry.sourceHandle);
            transition.setAttribute('viz:targetHandle', entry.targetHandle);
            break;
          }
        }
      }
    }

    // Serialize back to string
    const serializer = new XMLSerializer();
    const newContent = formatXML(serializer.serializeToString(doc));

    return newContent;
  } catch (error) {
    console.error('Error in writeLayoutToSCXML:', error);
    return '';
  }
}

/**
 * Parse SCXML datamodel into context object
 */
export function convertDataModel(
  dataModel: any,
  getElements: (parent: any, elementName: string) => any,
  getAttribute: (element: any, attrName: string) => string | undefined
): Record<string, any> {
  const context: Record<string, any> = {};

  const dataElements = getElements(dataModel, 'data');
  if (dataElements) {
    const dataArray = Array.isArray(dataElements) ? dataElements : [dataElements];
    for (const data of dataArray) {
      const id = getAttribute(data, 'id');
      const expr = getAttribute(data, 'expr');
      const src = getAttribute(data, 'src');

      if (id) {
        if (expr) {
          // Try to parse as JSON or use as string
          try {
            context[id] = JSON.parse(expr);
          } catch {
            context[id] = expr;
          }
        } else if (src) {
          context[id] = `/* external: ${src} */`;
        } else if (data['#text']) {
          context[id] = data['#text'];
        }
      }
    }
  }

  return context;
}

/**
 * Get XML attribute from element
 * Handles both @_ prefixed and unprefixed attributes
 */
export function getAttribute(element: any, attrName: string): string | undefined {
  return element?.[`@_${attrName}`] || element?.[attrName];
}

/**
 * Get child elements by element name
 */
export function getElements(parent: any, elementName: string): any {
  return parent?.[elementName];
}
