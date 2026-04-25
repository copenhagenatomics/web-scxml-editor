// visual-style-utils.ts
import type { ElementVisualMetadata } from '@/types/visual-metadata';
import type { VisualStyles } from '@/components/diagram/nodes/scxml-state-node';

/**
 * Converts visual metadata style properties to VisualStyles format
 */
export function computeVisualStyles(
  visualMetadata: ElementVisualMetadata | undefined,
  stateType: 'simple' | 'compound' | 'final' | 'parallel' = 'simple',
  isActive = false,
  selected = false
): VisualStyles {
  const styles: VisualStyles = {};

  // Apply visual metadata styles if available
  if (visualMetadata?.style) {
    const { style } = visualMetadata;

    // Convert fill color to backgroundColor
    if (style.fill) {
      styles.backgroundColor = '#' + style.fill;
    }

    // Convert stroke to border properties
    if (style.stroke) {
      styles.borderColor = style.stroke;
    }

    if (style.strokeWidth !== undefined) {
      styles.borderWidth = style.strokeWidth;
    }

    if (style.borderRadius !== undefined) {
      styles.borderRadius = style.borderRadius;
    }

    if (style.opacity !== undefined) {
      styles.opacity = style.opacity;
    }

    // Use inline style property for custom border styles if available
    if (style.style?.borderStyle) {
      styles.borderStyle = style.style.borderStyle as
        | 'solid'
        | 'dashed'
        | 'dotted'
        | 'double';
    }
  }

  // Apply default styles based on state type if not overridden
  if (!styles.borderColor) {
    // Apply state-specific colors only if not overridden by visual metadata
    switch (stateType) {
      case 'final':
        styles.borderColor = '#ef4444'; // red-500
        styles.borderStyle = 'double';
        break;
      case 'compound':
        styles.borderColor = '#a855f7'; // purple-500
        styles.borderStyle = 'dashed';
        break;
      case 'parallel':
        styles.borderColor = '#ea580c'; // orange-600
        styles.borderStyle = 'dashed';
        styles.borderWidth = 3;
        break;
      default: // simple
        styles.borderColor = '#64748b'; // slate-500
        styles.borderStyle = 'solid';
    }
  }

  // Apply default background colors if not set
  if (!styles.backgroundColor) {
    if (isActive) {
      styles.backgroundColor = '#f0fdf4'; // green-50
      styles.borderColor = '#22c55e'; // green-500
    } else if (selected) {
      styles.backgroundColor = '#eff6ff'; // blue-50
      styles.borderColor = '#3b82f6'; // blue-500
    } else {
      switch (stateType) {
        case 'final':
          styles.backgroundColor = '#fef2f2'; // red-50
          break;
        case 'compound':
          styles.backgroundColor = '#faf5ff'; // purple-50
          break;
        case 'parallel':
          styles.backgroundColor = '#fed7aa'; // orange-200 - more vibrant for parallel states
          break;
        default:
          styles.backgroundColor = '#f8fafc'; // slate-50
      }
    }
  }

  // Set default border width if not specified
  if (!styles.borderWidth) {
    if (stateType === 'compound' || stateType === 'parallel') {
      styles.borderWidth = 4;
    } else {
      styles.borderWidth = 1;
    }
  }

  // Set default border radius if not specified
  if (!styles.borderRadius) {
    styles.borderRadius = 12; // rounded-xl equivalent
  }

  return styles;
}

/**
 * Converts VisualStyles to inline CSS style object
 */
export function visualStylesToCSS(
  visualStyles: VisualStyles
): React.CSSProperties {
  const cssStyles: React.CSSProperties = {};

  if (visualStyles.backgroundColor) {
    cssStyles.backgroundColor = visualStyles.backgroundColor;
  }

  if (visualStyles.borderColor) {
    cssStyles.borderColor = visualStyles.borderColor;
  }

  if (visualStyles.borderWidth !== undefined) {
    cssStyles.borderWidth = `${visualStyles.borderWidth}px`;
  }

  if (visualStyles.borderRadius !== undefined) {
    cssStyles.borderRadius = `${visualStyles.borderRadius}px`;
  }

  if (visualStyles.opacity !== undefined) {
    cssStyles.opacity = visualStyles.opacity;
  }

  if (visualStyles.borderStyle) {
    cssStyles.borderStyle = visualStyles.borderStyle;
  }

  return cssStyles;
}

/**
 * Generates additional CSS classes based on visual styles and state
 */
export function getAdditionalClasses(
  visualStyles: VisualStyles,
  isActive = false,
  selected = false
): string {
  const classes: string[] = [];

  // Add shadow classes based on state
  if (isActive) {
    // classes.push('shadow-xl', 'ring-4', 'ring-green-200', 'ring-opacity-50');
  } else if (selected) {
    classes.push('shadow-xl', 'ring-2', 'ring-blue-300');
  } else {
    classes.push('shadow-lg', 'hover:shadow-xl');
  }

  // Add transition classes
  classes.push('transition-all', 'duration-300');

  return classes.join(' ');
}
