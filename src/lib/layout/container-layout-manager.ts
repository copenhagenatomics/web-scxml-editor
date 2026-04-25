import type {
  Rectangle,
  ChildPosition,
  LayoutStrategy,
  HierarchicalNode,
} from '@/types/hierarchical-node';
import { elkLayoutService } from './elk-layout-service';

export interface LayoutOptions {
  padding: number;
  spacing: { x: number; y: number };
  alignment: 'center' | 'start' | 'end';
  columns?: number;
  rows?: number;
}

export class ContainerLayoutManager {
  private defaultOptions: LayoutOptions = {
    padding: 20,
    spacing: { x: 20, y: 20 },
    alignment: 'center',
    columns: 2,
  };

  /**
   * Arrange children within a parent container
   * Note: ELK strategies ('elk-*') return Promises and should be awaited
   */
  arrangeChildren(
    parentBounds: Rectangle,
    children: HierarchicalNode[],
    strategy: LayoutStrategy,
    options: Partial<LayoutOptions> = {}
  ): ChildPosition[] {
    const layoutOptions = { ...this.defaultOptions, ...options };

    switch (strategy.type) {
      case 'grid':
        return this.arrangeInGrid(parentBounds, children, layoutOptions);
      case 'auto':
        return this.arrangeAuto(parentBounds, children, layoutOptions);
      case 'force':
        return this.arrangeWithForces(parentBounds, children, layoutOptions);
      case 'manual':
        return this.preserveManualPositions(
          parentBounds,
          children,
          layoutOptions
        );
      case 'elk-layered':
      case 'elk-force':
      case 'elk-stress':
        // ELK strategies are not supported in synchronous context
        // Fall back to auto layout
        console.warn(`ELK layout strategy '${strategy.type}' requires async context, falling back to 'auto'`);
        return this.arrangeAuto(parentBounds, children, layoutOptions);
      default:
        return this.arrangeAuto(parentBounds, children, layoutOptions);
    }
  }

  /**
   * Arrange children within a parent container using async layouts (ELK)
   * This method should be used when ELK layout is explicitly requested
   */
  async arrangeChildrenAsync(
    parentBounds: Rectangle,
    children: HierarchicalNode[],
    strategy: LayoutStrategy,
    options: Partial<LayoutOptions> = {}
  ): Promise<ChildPosition[]> {
    const layoutOptions = { ...this.defaultOptions, ...options };

    switch (strategy.type) {
      case 'elk-layered':
        return this.arrangeWithELK(parentBounds, children, strategy, 'layered');
      case 'elk-force':
        return this.arrangeWithELK(parentBounds, children, strategy, 'force');
      case 'elk-stress':
        return this.arrangeWithELK(parentBounds, children, strategy, 'stress');
      default:
        // For non-ELK strategies, just return the synchronous result
        return this.arrangeChildren(parentBounds, children, strategy, options);
    }
  }

  /**
   * Arrange children in a grid layout
   */
  private arrangeInGrid(
    parentBounds: Rectangle,
    children: HierarchicalNode[],
    options: LayoutOptions
  ): ChildPosition[] {
    if (children.length === 0) return [];

    const { padding, spacing, columns = 2 } = options;
    const availableWidth = parentBounds.width - padding * 2;
    const availableHeight = parentBounds.height - padding * 2;

    const rows = Math.ceil(children.length / columns);
    const cellWidth = (availableWidth - spacing.x * (columns - 1)) / columns;
    const cellHeight = (availableHeight - spacing.y * (rows - 1)) / rows;

    return children.map((child, index) => {
      const row = Math.floor(index / columns);
      const col = index % columns;

      // Return positions relative to parent bounds (not absolute)
      const x = padding + col * (cellWidth + spacing.x);
      const y = padding + row * (cellHeight + spacing.y);

      return {
        id: child.id,
        x,
        y,
        width: Math.max(120, cellWidth - 10), // Leave some margin
        height: Math.max(60, cellHeight - 10),
      };
    });
  }

  /**
   * Auto-arrange children with smart positioning based on content
   */
  private arrangeAuto(
    parentBounds: Rectangle,
    children: HierarchicalNode[],
    options: LayoutOptions
  ): ChildPosition[] {
    if (children.length === 0) return [];

    const { padding, spacing } = options;

    // Analyze children to determine optimal layout
    const containerChildren = children.filter(
      (child) => child.childIds && child.childIds.length > 0
    );
    const simpleChildren = children.filter(
      (child) => !child.childIds || child.childIds.length === 0
    );

    // For mixed content, use different strategies
    if (containerChildren.length > 0 && simpleChildren.length > 0) {
      return this.arrangeMixedContent(
        parentBounds,
        containerChildren,
        simpleChildren,
        options
      );
    } else if (containerChildren.length > 0) {
      return this.arrangeContainersOnly(
        parentBounds,
        containerChildren,
        options
      );
    } else {
      return this.arrangeSimpleStates(parentBounds, simpleChildren, options);
    }
  }

  /**
   * Arrange mixed content (containers + simple states)
   */
  private arrangeMixedContent(
    parentBounds: Rectangle,
    containers: HierarchicalNode[],
    simpleStates: HierarchicalNode[],
    options: LayoutOptions
  ): ChildPosition[] {
    const { padding, spacing } = options;
    const positions: ChildPosition[] = [];

    // Place containers first (they need more space)
    let currentY = padding;

    containers.forEach((container, index) => {
      const containerWidth = Math.max(200, parentBounds.width * 0.8);
      const containerHeight = this.calculateContainerHeight(container);

      positions.push({
        id: container.id,
        x: (parentBounds.width - containerWidth) / 2, // Center containers
        y: currentY,
        width: containerWidth,
        height: containerHeight,
      });

      currentY += containerHeight + spacing.y;
    });

    // Place simple states below containers
    if (simpleStates.length > 0) {
      const simplePositions = this.arrangeSimpleStates(
        {
          x: 0,
          y: currentY,
          width: parentBounds.width,
          height: parentBounds.height - currentY,
        },
        simpleStates,
        options
      );

      positions.push(...simplePositions);
    }

    return positions;
  }

  /**
   * Arrange only container states
   */
  private arrangeContainersOnly(
    parentBounds: Rectangle,
    containers: HierarchicalNode[],
    options: LayoutOptions
  ): ChildPosition[] {
    const { padding, spacing } = options;

    if (containers.length === 1) {
      const container = containers[0];
      const width = Math.max(200, parentBounds.width - padding * 2);
      const height = this.calculateContainerHeight(container);

      return [
        {
          id: container.id,
          x: padding,
          y: padding,
          width,
          height,
        },
      ];
    }

    // Multiple containers - arrange vertically with spacing
    const positions: ChildPosition[] = [];
    let currentY = padding;

    containers.forEach((container) => {
      const width = Math.max(
        180,
        (parentBounds.width - padding * 2 - spacing.x) /
          Math.min(2, containers.length)
      );
      const height = this.calculateContainerHeight(container);

      positions.push({
        id: container.id,
        x: padding,
        y: currentY,
        width,
        height,
      });

      currentY += height + spacing.y;
    });

    return positions;
  }

  /**
   * Arrange only simple states
   */
  private arrangeSimpleStates(
    parentBounds: Rectangle,
    simpleStates: HierarchicalNode[],
    options: LayoutOptions
  ): ChildPosition[] {
    // Use existing grid layout for simple states
    const columns = Math.min(3, Math.ceil(Math.sqrt(simpleStates.length)));
    return this.arrangeInGrid(parentBounds, simpleStates, {
      ...options,
      columns,
    });
  }

  /**
   * Arrange simple states in a compact horizontal layout when space is constrained
   */
  private arrangeSimpleStatesCompact(
    parentBounds: Rectangle,
    simpleStates: HierarchicalNode[],
    options: LayoutOptions
  ): ChildPosition[] {
    if (simpleStates.length === 0) return [];

    const { padding, spacing } = options;
    const availableWidth = parentBounds.width - padding * 2;
    const stateWidth = Math.max(
      100,
      (availableWidth - spacing.x * (simpleStates.length - 1)) /
        simpleStates.length
    );
    const stateHeight = Math.min(60, parentBounds.height - 10); // Compact height

    return simpleStates.map((state, index) => ({
      id: state.id,
      x: padding + index * (stateWidth + spacing.x),
      y: parentBounds.y + 5, // Small offset from top
      width: stateWidth,
      height: stateHeight,
    }));
  }

  /**
   * Calculate height needed for a container based on its children
   */
  private calculateContainerHeight(container: HierarchicalNode): number {
    const baseHeight = 80; // Header + padding
    const childCount = container.childIds?.length || 0;

    if (childCount === 0) return baseHeight;

    // More intelligent height calculation based on child types
    // For parallel states (like Engines), we need more vertical space for children
    if ((container.type === 'group' || container.type === 'scxmlCompound') && childCount > 2) {
      const childrenPerRow = Math.min(2, childCount);
      const rows = Math.ceil(childCount / childrenPerRow);
      const childHeight = 70; // Height per child row for complex containers
      return baseHeight + rows * childHeight + 30; // Extra padding for complex layouts
    }

    // For simpler containers
    const childrenPerRow = 2;
    const rows = Math.ceil(childCount / childrenPerRow);
    const childHeight = 60; // Height per child row

    return baseHeight + rows * childHeight + 20; // Extra padding
  }

  /**
   * Arrange a single child in the center
   */
  private arrangeSingle(
    parentBounds: Rectangle,
    child: HierarchicalNode,
    options: LayoutOptions
  ): ChildPosition[] {
    const { padding } = options;
    const childWidth = 140;
    const childHeight = 80;

    return [
      {
        id: child.id,
        x: (parentBounds.width - childWidth) / 2,
        y: (parentBounds.height - childHeight) / 2,
        width: childWidth,
        height: childHeight,
      },
    ];
  }

  /**
   * Arrange two children side by side
   */
  private arrangeTwo(
    parentBounds: Rectangle,
    children: HierarchicalNode[],
    options: LayoutOptions
  ): ChildPosition[] {
    const { padding, spacing } = options;
    const availableWidth = parentBounds.width - padding * 2 - spacing.x;
    const childWidth = availableWidth / 2;
    const childHeight = 80;

    return children.map((child, index) => ({
      id: child.id,
      x: padding + index * (childWidth + spacing.x),
      y: (parentBounds.height - childHeight) / 2,
      width: Math.max(120, childWidth),
      height: childHeight,
    }));
  }

  /**
   * Arrange 3-4 children in an optimized layout
   */
  private arrangeFew(
    parentBounds: Rectangle,
    children: HierarchicalNode[],
    options: LayoutOptions
  ): ChildPosition[] {
    const { padding, spacing } = options;

    if (children.length === 3) {
      // Arrange in a triangle: one at top, two at bottom
      const childWidth = 120;
      const childHeight = 60;
      const topX = (parentBounds.width - childWidth) / 2;
      const topY = padding;
      const bottomY = parentBounds.height - childHeight - padding;
      const bottomSpacing =
        (parentBounds.width - 2 * childWidth - 2 * padding) / 1;

      return [
        {
          id: children[0].id,
          x: topX,
          y: topY,
          width: childWidth,
          height: childHeight,
        },
        {
          id: children[1].id,
          x: padding,
          y: bottomY,
          width: childWidth,
          height: childHeight,
        },
        {
          id: children[2].id,
          x: padding + childWidth + bottomSpacing,
          y: bottomY,
          width: childWidth,
          height: childHeight,
        },
      ];
    } else {
      // Arrange in 2x2 grid
      return this.arrangeInGrid(parentBounds, children, {
        ...options,
        columns: 2,
      });
    }
  }

  /**
   * Arrange using force-directed algorithm (simplified version)
   */
  private arrangeWithForces(
    parentBounds: Rectangle,
    children: HierarchicalNode[],
    options: LayoutOptions
  ): ChildPosition[] {
    if (children.length === 0) return [];

    // Start with random positions
    let positions = children.map((child, index) => {
      const angle = (index / children.length) * 2 * Math.PI;
      const radius = Math.min(parentBounds.width, parentBounds.height) * 0.3;
      const centerX = parentBounds.x + parentBounds.width / 2;
      const centerY = parentBounds.y + parentBounds.height / 2;

      return {
        id: child.id,
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius,
        width: 120,
        height: 60,
      };
    });

    // Simple force simulation iterations
    const iterations = 50;
    const { padding } = options;

    for (let i = 0; i < iterations; i++) {
      // Apply repulsion forces between nodes
      for (let j = 0; j < positions.length; j++) {
        for (let k = j + 1; k < positions.length; k++) {
          const pos1 = positions[j];
          const pos2 = positions[k];
          const dx = pos2.x - pos1.x;
          const dy = pos2.y - pos1.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < 100) {
            // Min distance threshold
            const force = (100 - distance) * 0.1;
            const fx = (dx / distance) * force;
            const fy = (dy / distance) * force;

            pos1.x -= fx;
            pos1.y -= fy;
            pos2.x += fx;
            pos2.y += fy;
          }
        }
      }

      // Keep positions within bounds
      positions = positions.map((pos) => ({
        ...pos,
        x: Math.max(
          parentBounds.x + padding,
          Math.min(
            parentBounds.x + parentBounds.width - pos.width - padding,
            pos.x
          )
        ),
        y: Math.max(
          parentBounds.y + padding,
          Math.min(
            parentBounds.y + parentBounds.height - pos.height - padding,
            pos.y
          )
        ),
      }));
    }

    return positions;
  }

  /**
   * Preserve manual positions, adjusting only if they're outside bounds
   */
  private preserveManualPositions(
    parentBounds: Rectangle,
    children: HierarchicalNode[],
    options: LayoutOptions
  ): ChildPosition[] {
    const { padding } = options;

    return children.map((child) => {
      // Use existing position if available, otherwise use default
      const currentPos = child.position || { x: 0, y: 0 };
      const width = child.containerBounds?.width || 120;
      const height = child.containerBounds?.height || 60;

      // Adjust position to be within parent bounds
      const x = Math.max(
        parentBounds.x + padding,
        Math.min(
          parentBounds.x + parentBounds.width - width - padding,
          currentPos.x
        )
      );
      const y = Math.max(
        parentBounds.y + padding,
        Math.min(
          parentBounds.y + parentBounds.height - height - padding,
          currentPos.y
        )
      );

      return {
        id: child.id,
        x,
        y,
        width,
        height,
      };
    });
  }

  /**
   * Calculate minimum container size needed for children
   */
  calculateMinimumContainerSize(
    children: HierarchicalNode[],
    strategy: LayoutStrategy,
    options: Partial<LayoutOptions> = {}
  ): { width: number; height: number } {
    const layoutOptions = { ...this.defaultOptions, ...options };
    const { padding, spacing } = layoutOptions;

    if (children.length === 0) {
      return { width: 200, height: 100 };
    }

    switch (strategy.type) {
      case 'grid': {
        const columns =
          layoutOptions.columns || Math.ceil(Math.sqrt(children.length));
        const rows = Math.ceil(children.length / columns);
        const minWidth =
          columns * 120 + (columns - 1) * spacing.x + padding * 2;
        const minHeight = rows * 80 + (rows - 1) * spacing.y + padding * 2;
        return { width: minWidth, height: minHeight };
      }
      case 'auto': {
        if (children.length <= 2) {
          return { width: 300, height: 150 };
        } else if (children.length <= 4) {
          return { width: 300, height: 200 };
        } else {
          const columns = Math.ceil(Math.sqrt(children.length));
          const rows = Math.ceil(children.length / columns);
          const minWidth =
            columns * 120 + (columns - 1) * spacing.x + padding * 2;
          const minHeight = rows * 80 + (rows - 1) * spacing.y + padding * 2;
          return { width: minWidth, height: minHeight };
        }
      }
      default:
        return { width: 250, height: 150 };
    }
  }

  /**
   * Check if a position is within the container bounds
   */
  isPositionWithinBounds(
    position: { x: number; y: number },
    size: { width: number; height: number },
    containerBounds: Rectangle,
    padding: number = 20
  ): boolean {
    return (
      position.x >= containerBounds.x + padding &&
      position.y >= containerBounds.y + padding &&
      position.x + size.width <=
        containerBounds.x + containerBounds.width - padding &&
      position.y + size.height <=
        containerBounds.y + containerBounds.height - padding
    );
  }

  /**
   * Adjust a position to be within container bounds
   */
  constrainToBounds(
    position: { x: number; y: number },
    size: { width: number; height: number },
    containerBounds: Rectangle,
    padding: number = 20
  ): { x: number; y: number } {
    return {
      x: Math.max(
        containerBounds.x + padding,
        Math.min(
          containerBounds.x + containerBounds.width - size.width - padding,
          position.x
        )
      ),
      y: Math.max(
        containerBounds.y + padding,
        Math.min(
          containerBounds.y + containerBounds.height - size.height - padding,
          position.y
        )
      ),
    };
  }

  /**
   * Arrange children using ELK (Eclipse Layout Kernel)
   */
  private async arrangeWithELK(
    parentBounds: Rectangle,
    children: HierarchicalNode[],
    strategy: LayoutStrategy,
    algorithm: 'layered' | 'force' | 'stress'
  ): Promise<ChildPosition[]> {
    if (children.length === 0) return [];

    try {
      // Prepare edges (transitions between children)
      const edges: Array<{ source: string; target: string }> = [];

      // Collect all transitions from children
      children.forEach((child) => {
        // Note: Edges are handled separately in the converter
        // This is a simplified version for container layout
      });

      // Run ELK layout
      const positions = await elkLayoutService.computeLayout(children, [], {
        algorithm,
        direction: strategy.options?.direction || 'DOWN',
        edgeRouting: strategy.options?.edgeRouting || 'ORTHOGONAL',
        spacing: {
          nodeNode: strategy.options?.spacing?.y || 80,
          edgeNode: 40,
          edgeEdge: 20,
        },
        padding: {
          top: 50,
          right: 50,
          bottom: 50,
          left: 50,
        },
        hierarchical: strategy.options?.hierarchical ?? true,
      });

      // Convert ELK positions to ChildPosition format
      const childPositions: ChildPosition[] = [];

      for (const child of children) {
        const pos = positions.get(child.id);
        if (pos) {
          childPositions.push({
            id: child.id,
            x: pos.x + parentBounds.x,
            y: pos.y + parentBounds.y,
            width: pos.width,
            height: pos.height,
          });
        }
      }

      return childPositions;
    } catch (error) {
      console.error('ELK layout failed, falling back to auto layout:', error);
      // Fallback to auto layout if ELK fails
      return this.arrangeAuto(parentBounds, children, this.defaultOptions);
    }
  }
}
