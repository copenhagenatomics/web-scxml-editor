/**
 * Shared marker-attribute constants for the auto-wrapping "multiple Initial
 * State work trees" feature. Split out into their own module (rather than
 * living in parallel-group-normalization.ts, which imports FROM
 * initial-group-utils.ts) so initial-group-utils.ts can use them too without
 * creating a circular import between the two.
 */
export const AUTO_PARALLEL_MARKER = '@_viz:auto-parallel';
export const AUTO_REGION_MARKER = '@_viz:auto-region';
