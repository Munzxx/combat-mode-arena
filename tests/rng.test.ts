import { describe, expect, it } from 'vitest';
import { Rng } from '../src/sim/rng';

describe('Rng', () => {
  it('gives the same sequence for the same seed', () => {
    const a = new Rng(12345);
    const b = new Rng(12345);
    for (let i = 0; i < 1000; i++) expect(a.next()).toBe(b.next());
  });

  it('gives different sequences for different seeds', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    const same = Array.from({ length: 20 }, () => a.next() === b.next()).every(Boolean);
    expect(same).toBe(false);
  });

  it('keeps next() inside [0, 1)', () => {
    const r = new Rng(99);
    for (let i = 0; i < 10000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('keeps int() inside its inclusive bounds and reaches both ends', () => {
    const r = new Rng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = r.int(3, 6);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(6);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([3, 4, 5, 6]);
  });

  it('forks into a deterministic, independent child', () => {
    const a = new Rng(5).fork();
    const b = new Rng(5).fork();
    expect(a.next()).toBe(b.next());
  });

  it('rejects invalid ranges', () => {
    const r = new Rng(1);
    expect(() => r.int(5, 1)).toThrow(RangeError);
    expect(() => r.pick([])).toThrow(RangeError);
  });
});
