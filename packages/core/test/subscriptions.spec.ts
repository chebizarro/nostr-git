import { describe, it, expect } from 'vitest';
import { buildRepoSubscriptions } from '../src/lib/subscriptions';

function keysOf(obj: Record<string, unknown>): string[] {
  return Object.keys(obj);
}

describe('buildRepoSubscriptions dedupe and ordering', () => {
  it('builds expected filters and notes for full args', () => {
    const res = buildRepoSubscriptions({
      addressA: 'git:npub1xyz:repo',
      rootEventId: 'root123',
      euc: 'euc://relay.example/repo',
    });

    // Expect 4 filters: ids, #e, #a, #r (stable order)
    expect(res.filters.length).toBe(4);
    const shapes = res.filters.map((f) => keysOf(f as any)[0]);
    expect(shapes).toEqual(['ids', '#e', '#a', '#r']);

    // No exact duplicates
    const serialized = res.filters.map((f) => JSON.stringify(f)).sort();
    const unique = Array.from(new Set(serialized));
    expect(unique.length).toBe(serialized.length);

    // Notes should mention each subscription strategy
    expect(res.notes.join(' ')).toMatch(/repo address/i);
    expect(res.notes.join(' ')).toMatch(/root id/i);
    expect(res.notes.join(' ')).toMatch(/euc/i);
  });

  it('handles partial args and avoids duplicates', () => {
    const res = buildRepoSubscriptions({ rootEventId: 'root-only' });
    expect(res.filters.length).toBe(2); // ids + #e
    const shapes = res.filters.map((f) => keysOf(f as any)[0]);
    expect(shapes).toEqual(['ids', '#e']);
  });
});
