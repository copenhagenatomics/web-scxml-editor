/**
 * Visual Metadata Utilities
 * 
 * Utility functions for detecting and working with visual metadata in SCXML
 */

import type { ElementVisualMetadata } from '@/types/visual-metadata';

/**
 * Check if SCXML content contains visual metadata
 */
export function hasVisualMetadata(scxmlContent: string): boolean {
  // Check for visual namespace declaration
  const namespacePattern = /xmlns:([\w-]+)\s*=\s*["']http:\/\/visual-scxml-editor\/metadata["']/;
  const hasNamespace = namespacePattern.test(scxmlContent);
  
  if (!hasNamespace) {
    return false;
  }
  
  // Extract the namespace prefix
  const match = scxmlContent.match(namespacePattern);
  const prefix = match ? match[1] : 'viz';
  
  // Check for any visual attributes with that prefix
  const attributePattern = new RegExp(`${prefix}:([\\w-]+)\\s*=`, 'g');
  return attributePattern.test(scxmlContent);
}

/**
 * Extract visual namespace prefix from SCXML content
 */
export function getVisualNamespacePrefix(scxmlContent: string): string | null {
  const namespacePattern = /xmlns:([\w-]+)\s*=\s*["']http:\/\/visual-scxml-editor\/metadata["']/;
  const match = scxmlContent.match(namespacePattern);
  return match ? match[1] : null;
}

/**
 * Get visual attributes from SCXML content
 */
export function extractVisualAttributes(scxmlContent: string): Map<string, string[]> {
  const prefix = getVisualNamespacePrefix(scxmlContent);
  if (!prefix) {
    return new Map();
  }
  
  const attributeMap = new Map<string, string[]>();
  const attributePattern = new RegExp(`${prefix}:([\\w-]+)\\s*=\\s*["']([^"']*)["']`, 'g');
  
  let match;
  while ((match = attributePattern.exec(scxmlContent)) !== null) {
    const [, attributeName, attributeValue] = match;
    const fullName = `${prefix}:${attributeName}`;
    
    if (!attributeMap.has(fullName)) {
      attributeMap.set(fullName, []);
    }
    attributeMap.get(fullName)!.push(attributeValue);
  }
  
  return attributeMap;
}

/**
 * Generate sample SCXML with visual metadata
 */
export function generateSampleWithVisualMetadata(): string {
  return `<scxml xmlns="http://www.w3.org/2005/07/scxml"
       xmlns:viz="http://visual-scxml-editor/metadata"
       version="1.0"
       initial="idle">

  <state id="idle"
         viz:xywh="100 50 120 60"
         viz:rgb="#e1f5fe">
    <onentry>
      <log label="State" expr="'Entering idle state'" />
    </onentry>
    <transition event="start"
                target="active" />
  </state>

  <state id="active"
         viz:xywh="300 150 120 60"
         viz:rgb="#e8f5e8">
    <onentry>
      <log label="State" expr="'Entering active state'" />
    </onentry>
    <transition event="stop"
                target="idle" />
  </state>

</scxml>`;
}

/**
 * Validate visual metadata structure
 */
export function validateVisualMetadataStructure(metadata: ElementVisualMetadata): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Validate element ID
  if (!metadata.elementId || typeof metadata.elementId !== 'string') {
    errors.push('Element ID is required and must be a string');
  }

  // Validate element type
  if (!metadata.elementType) {
    errors.push('Element type is required');
  }

  // Validate layout if present
  if (metadata.layout) {
    if (metadata.layout.x !== undefined && (typeof metadata.layout.x !== 'number' || !isFinite(metadata.layout.x))) {
      errors.push('Layout x coordinate must be a finite number');
    }
    if (metadata.layout.y !== undefined && (typeof metadata.layout.y !== 'number' || !isFinite(metadata.layout.y))) {
      errors.push('Layout y coordinate must be a finite number');
    }
    if (metadata.layout.width !== undefined && (typeof metadata.layout.width !== 'number' || metadata.layout.width <= 0)) {
      errors.push('Layout width must be a positive number');
    }
    if (metadata.layout.height !== undefined && (typeof metadata.layout.height !== 'number' || metadata.layout.height <= 0)) {
      errors.push('Layout height must be a positive number');
    }
  }

  // Validate style if present
  if (metadata.style) {
    if (metadata.style.opacity !== undefined && 
        (typeof metadata.style.opacity !== 'number' || 
         metadata.style.opacity < 0 || 
         metadata.style.opacity > 1)) {
      errors.push('Style opacity must be a number between 0 and 1');
    }
    if (metadata.style.strokeWidth !== undefined && 
        (typeof metadata.style.strokeWidth !== 'number' || metadata.style.strokeWidth < 0)) {
      errors.push('Style stroke width must be a non-negative number');
    }
  }

  // Validate diagram waypoints if present
  if (metadata.diagram?.waypoints) {
    if (!Array.isArray(metadata.diagram.waypoints)) {
      errors.push('Diagram waypoints must be an array');
    } else {
      metadata.diagram.waypoints.forEach((waypoint, index) => {
        if (typeof waypoint.x !== 'number' || !isFinite(waypoint.x)) {
          errors.push(`Waypoint ${index} x coordinate must be a finite number`);
        }
        if (typeof waypoint.y !== 'number' || !isFinite(waypoint.y)) {
          errors.push(`Waypoint ${index} y coordinate must be a finite number`);
        }
      });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Clean visual metadata from SCXML content (regex-based approach)
 */
export function removeVisualMetadataFromXML(scxmlContent: string): string {
  let cleaned = scxmlContent;
  
  // First, get the visual namespace prefix if it exists
  const prefix = getVisualNamespacePrefix(scxmlContent) || 'viz';
  
  // Remove visual namespace declaration
  const namespaceDeclarationPattern = new RegExp(
    `\\s*xmlns:${prefix}\\s*=\\s*["']http://visual-scxml-editor/metadata["']`,
    'g'
  );
  cleaned = cleaned.replace(namespaceDeclarationPattern, '');
  
  // Remove all visual namespace attributes (more comprehensive pattern)
  const attributePattern = new RegExp(
    `\\s*${prefix}:[\\w-]+\\s*=\\s*["'][^"']*["']`,
    'g'
  );
  cleaned = cleaned.replace(attributePattern, '');
  
  // Clean up any extra whitespace that might be left
  // Replace multiple spaces with single space
  cleaned = cleaned.replace(/[ \t]{2,}/g, ' ');
  // Remove space before closing tags
  cleaned = cleaned.replace(/\s+>/g, '>');
  // Remove space before self-closing tags
  cleaned = cleaned.replace(/\s+\/>/g, '/>');
  // Clean up line breaks and indentation inconsistencies
  cleaned = cleaned.replace(/\n\s*\n\s*\n/g, '\n\n');
  
  // Ensure proper formatting around element boundaries
  cleaned = cleaned.replace(/>(\s*)<\//g, '>\n  </');
  cleaned = cleaned.replace(/>(\s*)<([^/])/g, '>\n  <$2');
  
  return cleaned.trim();
}

/**
 * Convert visual metadata to CSS styles for preview
 */
export function visualMetadataToCSS(metadata: ElementVisualMetadata): Record<string, string> {
  const styles: Record<string, string> = {};
  
  if (metadata.layout) {
    if (metadata.layout.x !== undefined) styles.left = `${metadata.layout.x}px`;
    if (metadata.layout.y !== undefined) styles.top = `${metadata.layout.y}px`;
    if (metadata.layout.width !== undefined) styles.width = `${metadata.layout.width}px`;
    if (metadata.layout.height !== undefined) styles.height = `${metadata.layout.height}px`;
    if (metadata.layout.zIndex !== undefined) styles.zIndex = metadata.layout.zIndex.toString();
  }
  
  if (metadata.style) {
    if (metadata.style.fill) styles.backgroundColor = metadata.style.fill;
    if (metadata.style.stroke) styles.borderColor = metadata.style.stroke;
    if (metadata.style.strokeWidth !== undefined) styles.borderWidth = `${metadata.style.strokeWidth}px`;
    if (metadata.style.borderRadius !== undefined) styles.borderRadius = `${metadata.style.borderRadius}px`;
    if (metadata.style.opacity !== undefined) styles.opacity = metadata.style.opacity.toString();
    if (metadata.style.className) styles.className = metadata.style.className;
    
    // Merge inline styles
    if (metadata.style.style) {
      Object.assign(styles, metadata.style.style);
    }
  }
  
  return styles;
}

/**
 * Format visual metadata for display
 */
export function formatVisualMetadataForDisplay(metadata: ElementVisualMetadata): string {
  const sections: string[] = [];
  
  if (metadata.layout) {
    const layout = [];
    if (metadata.layout.x !== undefined) layout.push(`x: ${metadata.layout.x}`);
    if (metadata.layout.y !== undefined) layout.push(`y: ${metadata.layout.y}`);
    if (metadata.layout.width !== undefined) layout.push(`w: ${metadata.layout.width}`);
    if (metadata.layout.height !== undefined) layout.push(`h: ${metadata.layout.height}`);
    if (layout.length > 0) {
      sections.push(`Layout: ${layout.join(', ')}`);
    }
  }
  
  if (metadata.style) {
    const styles = [];
    if (metadata.style.fill) styles.push(`fill: ${metadata.style.fill}`);
    if (metadata.style.stroke) styles.push(`stroke: ${metadata.style.stroke}`);
    if (metadata.style.opacity !== undefined) styles.push(`opacity: ${metadata.style.opacity}`);
    if (styles.length > 0) {
      sections.push(`Style: ${styles.join(', ')}`);
    }
  }
  
  if (metadata.diagram) {
    const diagram = [];
    if (metadata.diagram.waypoints?.length) diagram.push(`${metadata.diagram.waypoints.length} waypoints`);
    if (metadata.diagram.curveType) diagram.push(`curve: ${metadata.diagram.curveType}`);
    if (diagram.length > 0) {
      sections.push(`Diagram: ${diagram.join(', ')}`);
    }
  }
  
  return sections.join(' | ') || 'No visual metadata';
}