import { describe, expect, it } from 'vitest';
import { parseRangesToIndices } from './ranges';

describe('ranges', () => {
  it('parses 1-3,5', () => {
    expect(parseRangesToIndices('1-3,5', 10)).toEqual([0, 1, 2, 4]);
  });
  it('clamps to max', () => {
    expect(parseRangesToIndices('8-99', 10)).toEqual([7, 8, 9]);
  });
  it('ignores garbage', () => {
    expect(parseRangesToIndices('abc,,2', 5)).toEqual([1]);
  });
});
