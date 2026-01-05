import { describe, it, expect } from 'vitest';
import { resolveStatus, type LocalStatusEvent } from '../src/events/nip34/status-resolver.js';

function makeStatus(
  id: string,
  kind: number,
  pubkey: string,
  created_at: number
): LocalStatusEvent {
  const e = {
    id,
    kind,
    pubkey,
    created_at,
    content: '',
    tags: [] as string[][],
    sig: ''
  } as unknown as LocalStatusEvent;
  return e;
}

describe('resolveStatus precedence', () => {
  it('prefers maintainer over root-author over others, then kind, then recency', () => {
    const rootAuthor = 'root-pub';
    const maintainers = new Set<string>(['maintainer-pub']);

    const events: LocalStatusEvent[] = [
      makeStatus('s1', 1630, 'other-pub', 1000), // open by other
      makeStatus('s2', 1631, 'root-pub', 1100), // applied by root
      makeStatus('s3', 1630, 'maintainer-pub', 900), // open by maintainer older
      makeStatus('s4', 1632, 'other-pub', 1200), // closed by other (higher kind but lower role)
      makeStatus('s5', 1631, 'maintainer-pub', 800), // applied by maintainer oldest
      makeStatus('s6', 1631, 'maintainer-pub', 1300) // applied by maintainer newest -> should win over s3/s5 and root
    ];

    const { final, reason } = resolveStatus({ statuses: events, rootAuthor, maintainers });

    expect(final?.id).toBe('s6');
    expect(reason).toMatch(/role=maintainer/);
    expect(reason).toMatch(/kind=applied/);
  });

  it('within same role and kind, uses recency', () => {
    const rootAuthor = 'root';
    const maintainers = new Set<string>([]);
    const events: LocalStatusEvent[] = [
      makeStatus('s1', 1630, 'root', 1000),
      makeStatus('s2', 1630, 'root', 2000)
    ];
    const { final } = resolveStatus({ statuses: events, rootAuthor, maintainers });
    expect(final?.id).toBe('s2');
  });

  it('ignores non-status kinds', () => {
    const rootAuthor = 'r';
    const maintainers = new Set<string>();
    const events: LocalStatusEvent[] = [makeStatus('x', 1, 'r', 1)];
    const { final, reason } = resolveStatus({ statuses: events, rootAuthor, maintainers });
    expect(final).toBeUndefined();
    expect(reason).toBe('no-status-events');
  });
});
