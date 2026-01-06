import { describe, it, expect } from 'vitest';
import { getTag, getTags, getTagValue, addTag, setTag, removeTag } from '../../src/events/nip34/nip34-utils.js';

describe('NIP-34 tag helpers (getTag/getTags/getTagValue)', () => {
  it('getTag returns first matching tag, getTags returns all, getTagValue returns first value', () => {
    const evt: any = {
      tags: [
        ['a', '30617:pk:repo'],
        ['t', 'one'],
        ['t', 'two'],
        ['clone', 'u1', 'u2']
      ]
    };

    expect(getTag(evt, 'a')).toEqual(['a', '30617:pk:repo']);
    expect(getTagValue(evt, 'a')).toBe('30617:pk:repo');

    expect(getTag(evt, 't')).toEqual(['t', 'one']);
    expect(getTags(evt, 't')).toEqual([['t', 'one'], ['t', 'two']]);

    const clone = getTag(evt, 'clone') as any;
    expect(clone).toEqual(['clone', 'u1', 'u2']);
    expect(clone.slice(1)).toEqual(['u1', 'u2']);

    expect(getTagValue(evt, 'does-not-exist' as any)).toBeUndefined();
  });
});

describe('NIP-34 tag mutation utilities (immutable)', () => {
  it('addTag adds without removing existing tags and does not mutate original', () => {
    const original: any = { tags: [['t', 'one']] };
    const out = addTag(original, ['t', 'two']);

    expect(original.tags).toEqual([['t', 'one']]); // unchanged
    expect(out.tags).toEqual([['t', 'one'], ['t', 'two']]);
  });

  it('setTag replaces all tags of same type and does not mutate original', () => {
    const original: any = { tags: [['t', 'one'], ['t', 'two'], ['a', 'x']] };
    const out = setTag(original, ['t', 'final']);

    expect(original.tags).toEqual([['t', 'one'], ['t', 'two'], ['a', 'x']]); // unchanged
    expect(out.tags).toEqual([['a', 'x'], ['t', 'final']]);
  });

  it('removeTag removes all tags of a given type and does not mutate original', () => {
    const original: any = { tags: [['t', 'one'], ['t', 'two'], ['a', 'x']] };
    const out = removeTag(original, 't');

    expect(original.tags).toEqual([['t', 'one'], ['t', 'two'], ['a', 'x']]); // unchanged
    expect(out.tags).toEqual([['a', 'x']]);
  });
});