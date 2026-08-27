/**
 * GRASP Capability Detection and Relay Introspection Helper
 *
 * Provides utilities for fetching NIP-11 relay information, detecting GRASP-01
 * (full Smart HTTP state) or GRASP-05 (archive-only) support, and normalizing
 * between WebSocket and HTTP relay URLs.
 *
 * Based on ngit implementation patterns from client.rs and relay.rs:
 * - Uses NIP-11 smart_http and http fields for capability detection
 * - Normalizes relay URLs for HTTP/WebSocket protocol conversion
 * - Provides fallback behavior for GRASP-05 archive-only mode
 */

import { normalizeRelayUrl } from '../../utils/sanitize-relays.js';
import { appendGraspHttpPath } from '../../utils/grasp-url.js';

export interface RelayInfo {
  name?: string;
  description?: string;
  pubkey?: string;
  contact?: string;
  supported_nips?: number[];
  supported_grasps?: string[];
  software?: string;
  version?: string;
  http?: string | string[];
  smart_http?: string | string[];
}

export type RelayInfoResult = { ok: true; info: RelayInfo } | { ok: false; info: RelayInfo; error: string };

export interface GraspCapabilities {
  grasp01: boolean; // Full GRASP-01 support (state + Smart HTTP)
  grasp05: boolean; // Archive-only GRASP-05 fallback support
  httpOrigins: string[];
  nostrRelays: string[];
  software?: string;
  version?: string;
}

/**
 * Convert an HTTP endpoint to WebSocket transport without changing endpoint identity.
 *
 * Based on ngit's URL normalization patterns in relay.rs
 */
export function normalizeWsOrigin(relayUrl: string): string {
  return normalizeRelayUrl(convertEndpointProtocol(relayUrl, 'ws'));
}

/**
 * Normalize a WebSocket relay URL to its HTTP origin counterpart.
 * Converts ws:// -> http:// and wss:// -> https://.
 *
 * Based on ngit's WebSocket URL handling in relay.rs
 */
export function normalizeHttpOrigin(relayUrl: string): string {
  return convertEndpointProtocol(relayUrl, 'http');
}

function convertEndpointProtocol(relayUrl: string, target: 'http' | 'ws'): string {
  try {
    const input = relayUrl.trim();
    const url = new URL(input);
    if (url.username || url.password) throw new TypeError('Endpoint credentials are not supported');
    const secure = url.protocol === 'wss:' || url.protocol === 'https:';
    if (!['ws:', 'wss:', 'http:', 'https:'].includes(url.protocol)) {
      throw new TypeError('Unsupported endpoint protocol');
    }

    const protocol = target === 'http' ? (secure ? 'https:' : 'http:') : secure ? 'wss:' : 'ws:';
    const rawAfterScheme = input.slice(input.indexOf('://') + 3);
    const suffixStart = rawAfterScheme.search(/[/?#]/);
    const rawSuffix = suffixStart === -1 ? '' : rawAfterScheme.slice(suffixStart);
    const suffixWithoutFragment = rawSuffix.split('#', 1)[0];
    const pathAndQuery = suffixWithoutFragment.startsWith('?') ? `/${suffixWithoutFragment}` : suffixWithoutFragment;
    return `${protocol}//${url.host}${pathAndQuery}`;
  } catch {
    return relayUrl;
  }
}

export function normalizeHttpEndpoint(relayUrl: string): string {
  return normalizeHttpOrigin(relayUrl);
}

/**
 * Derive preferred HTTP origins list from NIP-11 relay info or fallback
 * to derived http(s) origin from ws(s) base.
 */
export function deriveHttpOrigins(relayWsUrl: string, info?: RelayInfo): string[] {
  const primary = normalizeHttpOrigin(relayWsUrl);
  const origins: string[] = [];

  if (info) {
    const enrich = (field?: string | string[]) => {
      if (!field) return;
      if (Array.isArray(field)) origins.push(...field);
      else origins.push(field);
    };
    enrich(info.smart_http);
    enrich(info.http);
  }

  const normalizedOrigins = origins.map(normalizeHttpEndpoint);

  if (!normalizedOrigins.includes(primary)) normalizedOrigins.push(primary);

  // Heuristic fallbacks when NIP-11 doesn't advertise smart_http or is unreachable.
  // Many Smart HTTP frontends (e.g., Gitea) expose Git endpoints under '/git'.
  // Mirrors the resilience in ngit where multiple candidates are tried.
  const withGitPath = appendGraspHttpPath(primary, 'git');
  if (!normalizedOrigins.includes(withGitPath)) normalizedOrigins.push(withGitPath);

  // Deduplicate
  const seen = new Set<string>();
  const unique = normalizedOrigins.filter(o => {
    if (seen.has(o)) return false;
    seen.add(o);
    return true;
  });
  return unique;
}

/**
 * Fetches relay information via NIP-11 (application/nostr+json).
 *
 * Based on ngit's relay introspection in client.rs:
 * - Uses NIP-11 endpoint for capability discovery
 * - Handles both supported_nips and supported_grasps fields
 * - Provides graceful fallback for non-GRASP relays
 */
export async function fetchRelayInfo(relayWsUrl: string): Promise<RelayInfo> {
  return (await fetchRelayInfoResult(relayWsUrl)).info;
}

export async function fetchRelayInfoResult(relayWsUrl: string): Promise<RelayInfoResult> {
  const httpUrl = normalizeHttpEndpoint(relayWsUrl);
  try {
    const res = await fetch(httpUrl, {
      headers: { Accept: 'application/nostr+json' },
      signal: AbortSignal.timeout(8_000),
    });
    if (res.ok) {
      const info = (await res.json()) as RelayInfo;
      return { ok: true, info };
    }
    return { ok: false, info: {}, error: `NIP-11 returned HTTP ${res.status}` };
  } catch (e) {
    console.warn('fetchRelayInfo: failed to fetch or parse NIP-11', e);
    return {
      ok: false,
      info: {},
      error: e instanceof Error ? e.message : 'NIP-11 request failed',
    };
  }
}

/**
 * Analyze a relay's RelayInfo to determine GRASP capability set.
 *
 * Based on ngit's capability detection in client.rs:
 * - Checks supported_grasps for GRASP-01/GRASP-05
 * - Extracts HTTP origins from smart_http and http fields
 * - Provides fallback behavior for archive-only mode
 */
export function graspCapabilities(info: RelayInfo, relayWsUrl: string): GraspCapabilities {
  const grasp01 = Array.isArray(info.supported_grasps) ? info.supported_grasps.includes('GRASP-01') : false;
  const grasp05 = Array.isArray(info.supported_grasps) ? info.supported_grasps.includes('GRASP-05') : false;
  const httpOrigins = deriveHttpOrigins(relayWsUrl, info);
  const nostrRelays = [normalizeWsOrigin(relayWsUrl)];

  return {
    grasp01,
    grasp05,
    httpOrigins,
    nostrRelays,
    software: info.software,
    version: info.version,
  };
}
