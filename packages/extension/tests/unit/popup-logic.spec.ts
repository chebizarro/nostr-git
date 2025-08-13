import { describe, it, expect } from 'vitest';
import { normalizeRelays } from '../../src/popup-logic';

describe('normalizeRelays', () => {
  it('filters invalid protocols and trims whitespace', () => {
    const { relays, invalid } = normalizeRelays([
      ' wss://relay.one ',
      'http://bad',
      'ftp://nope',
      'ws://ok.local:1234 ',
      '',
      '   ',
    ]);
    expect(relays).toEqual(['wss://relay.one', 'ws://ok.local:1234']);
    expect(invalid).toEqual(['http://bad', 'ftp://nope']);
  });

  it('dedupes case-insensitively and strips trailing slashes', () => {
    const { relays, invalid } = normalizeRelays([
      'wss://Relay.Damus.io/',
      'wss://relay.damus.io',
      'WSS://RELAY.DAMUS.IO/',
    ]);
    expect(invalid).toEqual([]);
    expect(relays).toEqual(['wss://Relay.Damus.io']);
  });

  it('preserves order of first occurrences', () => {
    const { relays } = normalizeRelays([
      'wss://a.example',
      'wss://b.example/',
      'wss://a.example/',
      'ws://c.example',
    ]);
    expect(relays).toEqual([
      'wss://a.example',
      'wss://b.example',
      'ws://c.example',
    ]);
  });
});
