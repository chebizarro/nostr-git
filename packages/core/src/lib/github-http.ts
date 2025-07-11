import { request as gitRequest } from 'isomorphic-git/http/web';

export function makeGitHubHttp(token: string) {
  return {
    async request(config: any) {
      config.headers = {
        ...config.headers,
        'Authorization': 'Basic ' + btoa(`x-access-token:${token}`)
      };
      return gitRequest(config);
    }
  };
}
