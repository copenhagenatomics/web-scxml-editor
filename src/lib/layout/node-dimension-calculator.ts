/**
 * NodeDimensionCalculator - Calculates width and height for state nodes
 *
 * Since we show one hierarchy level at a time, dimensions are based on:
 * - Label length
 * - State type (simple/compound/parallel/final)
 * - Actions count (onentry/onexit)
 *
 * NOT based on children count (children aren't rendered simultaneously)
 */

export interface NodeDimensions {
  width: number;
  height: number;
}

export type StateType = 'simple' | 'compound' | 'parallel' | 'final';

export class NodeDimensionCalculator {
  /**
   * Calculate width based on label and state type
   */
  calculateWidth(label: string, stateType: StateType, isInitial: boolean = false): number {
    // Compound and parallel states need extra padding for visual indicators
    let basePadding = stateType === 'compound' || stateType === 'parallel'
      ? 100  // Extra padding for compound/parallel indicator
      : 80;  // Standard padding for icons and borders

    // Add extra padding for initial states to account for the "Initial" tag (approximately 70px)
    if (isInitial) {
      basePadding += 70;
    }

    const minWidth = stateType === 'compound' || stateType === 'parallel'
      ? 200  // Minimum for container states
      : 160; // Minimum for simple/final states

    // Calculate based on label length (8px per character)
    const calculatedWidth = label.length * 8 + basePadding;

    return Math.max(minWidth, calculatedWidth);
  }

  /**
   * Calculate height based on state type and content
   *
   * IMPORTANT: Does NOT consider children count since we show
   * one hierarchy level at a time via navigation
   */
  calculateHeight(
    stateType: StateType,
    onentryActionsCount: number = 0,
    onexitActionsCount: number = 0
  ): number {
    let baseHeight: number;

    switch (stateType) {
      case 'compound':
      case 'parallel':
        // Taller base to indicate it's a container state
        // But NOT based on children since they're not visible
        baseHeight = 120;
        break;

      case 'final':
      case 'simple':
      default:
        // Standard height for simple states
        baseHeight = 80;
        break;
    }

    // Add height for actions (each action adds ~20px)
    const actionHeight = (onentryActionsCount + onexitActionsCount) * 20;

    return baseHeight + actionHeight;
  }

  /**
   * Calculate both width and height for a node
   */
  calculateDimensions(
    label: string,
    stateType: StateType,
    onentryActionsCount: number = 0,
    onexitActionsCount: number = 0,
    isInitial: boolean = false
  ): NodeDimensions {
    return {
      width: this.calculateWidth(label, stateType, isInitial),
      height: this.calculateHeight(stateType, onentryActionsCount, onexitActionsCount)
    };
  }

  /**
   * Get state type from node data
   */
  getStateType(nodeData: any): StateType {
    const type = nodeData.stateType;

    // Validate and return
    if (type === 'simple' || type === 'compound' || type === 'parallel' || type === 'final') {
      return type;
    }

    // Default to simple if not specified
    return 'simple';
  }

  /**
   * Count actions from node data
   */
  countActions(nodeData: any): { onentry: number; onexit: number } {
    const onentryCount = Array.isArray(nodeData.onentryActions)
      ? nodeData.onentryActions.length
      : 0;

    const onexitCount = Array.isArray(nodeData.onexitActions)
      ? nodeData.onexitActions.length
      : 0;

    return {
      onentry: onentryCount,
      onexit: onexitCount
    };
  }

  /**
   * Calculate dimensions from node object directly
   */
  calculateDimensionsFromNode(node: any): NodeDimensions {
    const label = node.data?.label || node.id || '';
    const stateType = this.getStateType(node.data);
    const actions = this.countActions(node.data);

    return this.calculateDimensions(
      label,
      stateType,
      actions.onentry,
      actions.onexit
    );
  }
}

// Export singleton instance
export const nodeDimensionCalculator = new NodeDimensionCalculator();
