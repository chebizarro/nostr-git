// Minimal HTTP adapter for isomorphic-git-style clients using fetch
// Avoids importing 'isomorphic-git/http/web' directly to keep core free of that dep.
export function makeGitHubHttp(token: string) {
  return {
    // Compatible with isomorphic-git http client signature used in options
    async request(config: any) {
      const url = config.url || config.endpoint || config.href;
      const method = config.method || 'GET';
      const headers = new Headers(config.headers || {});
      // Add GitHub token as Basic auth header (x-access-token)
      headers.set('Authorization', 'Basic ' + btoa(`x-access-token:${token}`));
      if (config.compress === false) headers.set('Accept-Encoding', 'identity');
      const body = config.body;

      const res = await fetch(url, { method, headers, body, redirect: 'follow' });
      const buffer = new Uint8Array(await res.arrayBuffer());
      // Build minimal response compatible with isomorphic-git expectations
      const outHeaders: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        outHeaders[k] = v;
      });
      return {
        url: res.url,
        statusCode: res.status,
        statusMessage: res.statusText,
        headers: outHeaders,
        body: buffer
      };
    }
  };
}
