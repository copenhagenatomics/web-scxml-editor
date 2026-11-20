/**
 * Visual Metadata Types for SCXML Editor
 *
 * These types define the structure of visual metadata stored in the
 * custom XML namespace `xmlns:visual="http://visual-scxml-editor/metadata"`
 *
 * All visual metadata is non-intrusive and preserves SCXML runtime behavior
 */

export interface VisualMetadata {
  /** Layout positioning data */
  layout?: LayoutMetadata;
  /** Visual styling information */
  style?: StyleMetadata;
  /** Diagram-specific layout data */
  diagram?: DiagramMetadata;
  /** Container-specific metadata for compound states */
  container?: ContainerMetadata;
  /** Custom action namespace definitions */
  actions?: ActionNamespaceMetadata;
  /** View state information */
  view?: ViewStateMetadata;
}

/**
 * Layout positioning and sizing information
 */
export interface LayoutMetadata {
  /** X coordinate position */
  x?: number;
  /** Y coordinate position */
  y?: number;
  /** Width of the element */
  width?: number;
  /** Height of the element */
  height?: number;
  /** Z-index for layering */
  zIndex?: number;
}

/**
 * Visual styling metadata
 */
export interface StyleMetadata {
  /** Fill color (CSS color value) */
  fill?: string;
  /** Stroke color (CSS color value) */
  stroke?: string;
  /** Stroke width in pixels */
  strokeWidth?: number;
  /** Border radius in pixels */
  borderRadius?: number;
  /** Custom CSS classes to apply */
  className?: string;
  /** Inline CSS styles */
  style?: Record<string, string>;
  /** Opacity (0-1) */
  opacity?: number;
}

/**
 * Diagram layout specific metadata
 */
export interface DiagramMetadata {
  /** Waypoints for transition paths */
  waypoints?: Waypoint[];
  /** Label positioning offset */
  labelOffset?: { x: number; y: number };
  /** Curve type for edges */
  curveType?: "smooth" | "step" | "straight" | "bezier";
  /** Arrow marker type */
  markerType?: "arrow" | "diamond" | "circle" | "none";
  /** Connection points for edges */
  connectionPoints?: {
    source?: { x: number; y: number };
    target?: { x: number; y: number };
  };
  /** Source handle ID (top, bottom, left, right) */
  sourceHandle?: "top" | "bottom" | "left" | "right";
  /** Target handle ID (top, bottom, left, right) */
  targetHandle?: "top" | "bottom" | "left" | "right";
}

/**
 * Waypoint for transition routing
 */
export interface Waypoint {
  /** X coordinate of waypoint */
  x: number;
  /** Y coordinate of waypoint */
  y: number;
  /** Optional waypoint type */
  type?: "control" | "anchor";
}

/**
 * Custom action namespace metadata
 */
export interface ActionNamespaceMetadata {
  /** List of custom action namespaces */
  namespaces?: string[];
  /** Custom action definitions */
  definitions?: ActionDefinition[];
}

/**
 * Custom action definition
 */
export interface ActionDefinition {
  /** Action name */
  name: string;
  /** Namespace the action belongs to */
  namespace: string;
  /** Action parameters */
  parameters?: ActionParameter[];
  /** Description of the action */
  description?: string;
}

/**
 * Action parameter definition
 */
export interface ActionParameter {
  /** Parameter name */
  name: string;
  /** Parameter type */
  type: "string" | "number" | "boolean" | "expression";
  /** Whether parameter is required */
  required?: boolean;
  /** Default value */
  defaultValue?: string | number | boolean;
  /** Parameter description */
  description?: string;
}

/**
 * View state metadata (diagram viewport information)
 */
export interface ViewStateMetadata {
  /** Zoom level */
  zoom?: number;
  /** Pan position */
  pan?: { x: number; y: number };
  /** Collapsed states (for hierarchical diagrams) */
  collapsed?: string[];
  /** Selected elements */
  selected?: string[];
  /** Viewport bounds */
  viewport?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/**
 * Container-specific metadata for compound and parallel states
 */
export interface ContainerMetadata {
  /** Layout strategy for child elements */
  childLayout:
    | "auto"
    | "grid"
    | "manual"
    | "force"
    | "elk-layered"
    | "elk-force"
    | "elk-stress";
  /** Padding inside the container */
  padding: number;
  /** Minimum container size */
  minSize: { width: number; height: number };
  /** Whether the container can be collapsed */
  isCollapsible: boolean;
  /** Current expanded/collapsed state */
  isExpanded: boolean;
  /** Child element positions (for manual layout) */
  childPositions?: Record<string, { x: number; y: number }>;
  /** Grid layout options */
  gridOptions?: {
    columns: number;
    rows?: number;
    spacing: { x: number; y: number };
    alignment: "center" | "start" | "end";
  };
  /** Force-directed layout options */
  forceOptions?: {
    strength: number;
    distance: number;
    iterations: number;
  };
  /** ELK layout options */
  elkOptions?: {
    algorithm?: "layered" | "force" | "stress" | "mrtree" | "radial";
    direction?: "DOWN" | "UP" | "RIGHT" | "LEFT";
    edgeRouting?: "ORTHOGONAL" | "POLYLINE" | "SPLINES" | "UNDEFINED";
    spacing?: {
      nodeNode?: number;
      edgeNode?: number;
      edgeEdge?: number;
    };
  };
}

/**
 * Complete visual metadata for an SCXML element
 */
export interface ElementVisualMetadata extends VisualMetadata {
  /** Element ID this metadata belongs to */
  elementId: string;
  /** Element type (state, transition, etc.) */
  elementType:
    | "state"
    | "transition"
    | "parallel"
    | "final"
    | "history"
    | "scxml"
    | "compound";
  /** Parent element ID (for hierarchical layout) */
  parentId?: string;
  /** Child element IDs (for compound/parallel states) */
  childIds?: string[];
  /** Depth in the hierarchy (0 = root level) */
  depth?: number;
  /** Whether this element acts as a container */
  isContainer?: boolean;
  /** Timestamp of last modification */
  lastModified?: number;
}

/**
 * Visual metadata attributes as they appear in XML
 * These match the actual attribute names used in the viz namespace
 */
export interface VisualXMLAttributes {
  /** Position and size attribute (x y width height) */
  "viz:xywh"?: string;

  /** Style attributes */
  "viz:rgb"?: string;
}

/**
 * Configuration for visual metadata serialization
 */
export interface VisualMetadataSerializationConfig {
  /** Whether to include visual metadata in output */
  includeVisualMetadata: boolean;
  /** Whether to format the output for readability */
  formatOutput: boolean;
  /** Namespace prefix to use (default: 'viz') */
  namespacePrefix?: string;
  /** Namespace URI (default: 'http://visual-scxml-editor/metadata') */
  namespaceURI?: string;
  /** Whether to validate visual metadata before serialization */
  validate?: boolean;
}

/**
 * Visual metadata validation result
 */
export interface VisualMetadataValidationResult {
  /** Whether the metadata is valid */
  isValid: boolean;
  /** Validation errors */
  errors: VisualMetadataValidationError[];
  /** Validation warnings */
  warnings: VisualMetadataValidationWarning[];
}

/**
 * Visual metadata validation error
 */
export interface VisualMetadataValidationError {
  /** Error message */
  message: string;
  /** Element ID where error occurred */
  elementId?: string;
  /** Attribute name that caused the error */
  attribute?: string;
  /** Error code */
  code?: string;
}

/**
 * Visual metadata validation warning
 */
export interface VisualMetadataValidationWarning {
  /** Warning message */
  message: string;
  /** Element ID where warning occurred */
  elementId?: string;
  /** Attribute name that caused the warning */
  attribute?: string;
  /** Warning code */
  code?: string;
}

/**
 * Visual metadata change event
 */
export interface VisualMetadataChangeEvent {
  /** Type of change */
  type: "create" | "update" | "delete" | "move" | "resize" | "style";
  /** Element ID that changed */
  elementId: string;
  /** Previous metadata (for updates) */
  previousMetadata?: ElementVisualMetadata;
  /** New metadata */
  newMetadata: ElementVisualMetadata;
  /** Timestamp of change */
  timestamp: number;
  /** Source of change (user, code, import, etc.) */
  source?: string;
}

/**
 * Constants for visual metadata
 */
export const VISUAL_METADATA_CONSTANTS = {
  /** Default namespace URI */
  NAMESPACE_URI: "http://visual-scxml-editor/metadata",
  /** Default namespace prefix */
  NAMESPACE_PREFIX: "viz",
  /** Supported element types */
  SUPPORTED_ELEMENTS: [
    "scxml",
    "state",
    "parallel",
    "final",
    "history",
    "transition",
  ] as const,
  /** Default styling values */
  DEFAULT_STYLES: {
    fill: "#f0f9ff",
    stroke: "#0369a1",
    strokeWidth: 2,
    borderRadius: 8,
    opacity: 1,
  },
  /** Default layout values */
  DEFAULT_LAYOUT: {
    width: 120,
    height: 60,
    x: 100,
    y: 100,
  },
  /** Post-it note annotation settings */
  NOTE: {
    /** Default width in px of a new note (user-resizable afterwards) */
    WIDTH: 500,
    /** Default base height in px of a new note (user-resizable afterwards) */
    HEIGHT: 250,
    /** Resize bounds in px — the maximum keeps the "note is full" cap meaningful */
    MIN_WIDTH: 200,
    MIN_HEIGHT: 100,
    MAX_WIDTH: 1200,
    MAX_HEIGHT: 1200,
    /** Font size used until text overflows, in px */
    FONT_SIZE_LARGE: 28,
    /** Font size used after large-font overflow, in px */
    FONT_SIZE_SMALL: 20,
    /** Node id prefix; ':' is not valid in SCXML state ids, so this cannot collide */
    ID_PREFIX: "note:",
    /** Qualified element name in the viz namespace */
    ELEMENT_NAME: "viz:note",
    /** Vertical growth factor applied when small font still overflows */
    HEIGHT_EXPANSION_FACTOR: 2,
  },
} as const;

/**
 * Whether a React Flow node id refers to a post-it note annotation
 */
export function isNoteId(id: string): boolean {
  return id.startsWith(VISUAL_METADATA_CONSTANTS.NOTE.ID_PREFIX);
}

/**
 * Clamp a note's base size to the allowed resize bounds. Missing/invalid
 * values fall back to the default size (legacy notes, hand-edited XML).
 */
export function clampNoteSize(
  width: number | undefined,
  height: number | undefined
): { width: number; height: number } {
  const NOTE = VISUAL_METADATA_CONSTANTS.NOTE;
  const clamp = (v: number | undefined, fallback: number, min: number, max: number) =>
    v === undefined || !Number.isFinite(v) || v <= 0
      ? fallback
      : Math.min(max, Math.max(min, Math.round(v)));
  return {
    width: clamp(width, NOTE.WIDTH, NOTE.MIN_WIDTH, NOTE.MAX_WIDTH),
    height: clamp(height, NOTE.HEIGHT, NOTE.MIN_HEIGHT, NOTE.MAX_HEIGHT),
  };
}
