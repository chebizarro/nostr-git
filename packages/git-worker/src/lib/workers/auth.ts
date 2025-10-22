// Authentication utilities extracted from git-worker
// Keeps a simple token-per-host configuration and provides onAuth callbacks

export interface AuthToken {
  host: string;
  token: string;
}

export interface AuthConfig {
  tokens: AuthToken[];
}

let authConfig: AuthConfig = { tokens: [] };

export function setAuthConfig(config: AuthConfig): void {
  authConfig = config;
  console.log('Git worker authentication configured for', config.tokens.length, 'hosts');
}

/**
 * Return an isomorphic-git onAuth callback for the URL, if a matching token exists.
 */
export function getAuthCallback(url: string) {
  if (!authConfig.tokens.length) return undefined;

  // Extract hostname
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return undefined;
  }

  const match = authConfig.tokens.find(
    (t) => hostname === t.host || hostname.endsWith('.' + t.host)
  );
  if (!match) return undefined;

  return () => ({ username: 'token', password: match.token });
}

/**
 * Return configured hostnames for logging/debugging purposes.
 */
export function getConfiguredAuthHosts(): string[] {
  try {
    return (authConfig.tokens || []).map((t) => t.host);
  } catch {
    return [];
  }
}
