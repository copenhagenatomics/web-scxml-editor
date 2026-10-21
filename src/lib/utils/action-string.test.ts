import { describe, it, expect } from 'vitest';
import { parseAssignActionString } from './action-string';

describe('parseAssignActionString', () => {
  it.each([
    ['assign|this_a|1', 'this_a', '1'],
    ['assign|this_a|this_b && this_c', 'this_a', 'this_b && this_c'],
    ['assign|this_a|this_b || this_c', 'this_a', 'this_b || this_c'],
    ['assign|this_a|this_b||this_c', 'this_a', 'this_b||this_c'],
    ['assign|this_a|(this_b || this_c) && !this_d', 'this_a', '(this_b || this_c) && !this_d'],
    ['assign|this_a|this_b > 5 || this_c <= 2', 'this_a', 'this_b > 5 || this_c <= 2'],
    ['assign|this_a|this_b || this_c || this_d', 'this_a', 'this_b || this_c || this_d'],
    // Malformed exprs are not this decoder's concern — they must survive verbatim
    ['assign|this_a|this_b ||', 'this_a', 'this_b ||'],
    ['assign|this_a||| this_b', 'this_a', '|| this_b'],
    ['assign|this_a|', 'this_a', ''],
  ])('%j -> location %j, expr %j', (input, location, expr) => {
    expect(parseAssignActionString(input)).toEqual({ location, expr });
  });

  it.each([['send|ev|delay|1s'], ['cancel|id'], ['log|Action|x'], ['x || y'], ['']])(
    'returns undefined for non-assign action %j',
    (input) => {
      expect(parseAssignActionString(input)).toBeUndefined();
    }
  );
});
