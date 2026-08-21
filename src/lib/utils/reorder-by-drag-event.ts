import { arrayMove } from '@dnd-kit/sortable';
import type { UniqueIdentifier } from '@dnd-kit/core';

/**
 * Reorders `list` from a dnd-kit drag-end event's active/over ids, locating
 * each item by a caller-supplied stable id (via `getId`) rather than by
 * position. Using array index as the id instead causes dnd-kit's drop
 * animation to visually snap the dragged row back to its old slot before
 * the reordered data repaints, since a recycled index-as-id can't tell
 * dnd-kit which row actually moved.
 */
export function reorderByDragEvent<T>(
  list: T[],
  getId: (item: T) => UniqueIdentifier,
  activeId: UniqueIdentifier,
  overId: UniqueIdentifier | null | undefined,
): T[] {
  if (overId == null || activeId === overId) return list;

  const oldIndex = list.findIndex((item) => getId(item) === activeId);
  const newIndex = list.findIndex((item) => getId(item) === overId);
  if (oldIndex === -1 || newIndex === -1) return list;

  return arrayMove(list, oldIndex, newIndex);
}
