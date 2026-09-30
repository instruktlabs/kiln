import { describe, expect, test } from 'bun:test';
import { listOf } from '../src/lib/catalog';

describe('listOf writes names as one sentence list', () => {
  test('none, one and two names', () => {
    expect(listOf([])).toBe('');
    expect(listOf(['FOUP'])).toBe('FOUP');
    expect(listOf(['Stocker', 'Signal tower'])).toBe('Stocker and Signal tower');
  });

  test('three or more names take commas and a final "and"', () => {
    expect(listOf(['FOUP', 'OHT vehicle', 'Load port'])).toBe('FOUP, OHT vehicle and Load port');
  });

  test('a name with a comma in it switches the list to semicolons, so each name stays one item', () => {
    expect(listOf(['Under-track storage', 'OHT rail, straight', 'OHT rail, curve', 'OHT rail, switch'])).toBe(
      'Under-track storage; OHT rail, straight; OHT rail, curve; and OHT rail, switch',
    );
  });
});
