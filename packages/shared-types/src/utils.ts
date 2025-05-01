import type { Nip34Event, RepoAnnouncementEvent, RepoStateEvent, PatchEvent, IssueEvent, StatusEvent } from './nip34';

/**
 * Type guard for RepoAnnouncementEvent (kind: 30617)
 */
export function isRepoAnnouncementEvent(event: Nip34Event): event is RepoAnnouncementEvent {
  return event.kind === 30617;
}

/**
 * Type guard for RepoStateEvent (kind: 30618)
 */
export function isRepoStateEvent(event: Nip34Event): event is RepoStateEvent {
  return event.kind === 30618;
}

/**
 * Type guard for PatchEvent (kind: 1617)
 */
export function isPatchEvent(event: Nip34Event): event is PatchEvent {
  return event.kind === 1617;
}

/**
 * Type guard for IssueEvent (kind: 1621)
 */
export function isIssueEvent(event: Nip34Event): event is IssueEvent {
  return event.kind === 1621;
}

/**
 * Type guard for StatusEvent (kinds: 1630, 1631, 1632, 1633)
 */
export function isStatusEvent(event: Nip34Event): event is StatusEvent {
  return event.kind === 1630 || event.kind === 1631 || event.kind === 1632 || event.kind === 1633;
}

/**
 * Get a human-readable label for a NIP-34 event kind
 */
export function getNip34KindLabel(kind: number): string {
  switch (kind) {
    case 30617:
      return 'Repository Announcement';
    case 30618:
      return 'Repository State';
    case 1617:
      return 'Patch';
    case 1621:
      return 'Issue';
    case 1630:
      return 'Status: Open';
    case 1631:
      return 'Status: Applied/Merged/Resolved';
    case 1632:
      return 'Status: Closed';
    case 1633:
      return 'Status: Draft';
    default:
      return 'Unknown';
  }
}
