import { describe, expect, it } from 'vitest';
import { bestAnimal, formatTimeframe } from './animal-filter';

describe('bestAnimal - spotting the animal in a video frame', () => {
  it('returns the highest-scoring animal above threshold', () => {
    expect(
      bestAnimal([
        { class: 'person', score: 0.99 },
        { class: 'dog', score: 0.72 },
        { class: 'cat', score: 0.91 },
      ]),
    ).toEqual({ label: 'cat', score: 0.91 });
  });

  it('ignores people, vehicles and weak guesses', () => {
    expect(bestAnimal([{ class: 'person', score: 0.99 }, { class: 'car', score: 0.9 }])).toBeNull();
    expect(bestAnimal([{ class: 'dog', score: 0.4 }])).toBeNull();
    expect(bestAnimal([])).toBeNull();
  });

  it('respects a custom threshold', () => {
    expect(bestAnimal([{ class: 'bear', score: 0.55 }], 0.5)).toEqual({ label: 'bear', score: 0.55 });
  });
});

describe('formatTimeframe', () => {
  it('formats seconds as m:ss.s', () => {
    expect(formatTimeframe(0)).toBe('0:00.0');
    expect(formatTimeframe(75.34)).toBe('1:15.3');
    expect(formatTimeframe(-5)).toBe('0:00.0');
  });
});
