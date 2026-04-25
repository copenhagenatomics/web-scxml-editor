/**
 * Visual Metadata Utilities for SCXML Converter
 *
 * Handles extraction and manipulation of visual metadata (viz:xywh, viz:rgb)
 * and XML utility functions for SCXML parsing.
 */

import type { HierarchicalNode } from '@/types/hierarchical-node';
import { VISUAL_METADATA_CONSTANTS } from '@/types/visual-metadata';

export interface VisualMetadata {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
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

  return metadata;
}

/**
 * Write calculated layout (position + dimensions) back to SCXML as viz:xywh attributes
 * This initializes SCXML files that arrive without viz:xywh
 */
export function writeLayoutToSCXML(
  nodes: HierarchicalNode[],
  originalScxmlContent: string
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

    // Serialize back to string
    const serializer = new XMLSerializer();
    const newContent = serializer.serializeToString(doc);

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
