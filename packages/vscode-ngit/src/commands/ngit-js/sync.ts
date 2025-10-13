import { createGitProvider } from "../git.js";
import { log } from "../utils/logger.js";

export default async function sync(opts: any) {
  const provider = await createGitProvider();
  const repoId = await (await import("../utils/prompts.js")).promptInput("Repo identifier:");
  const res = await provider.announceRepoState({
    identifier: repoId,
    kind: 30618,
    state: { "refs/heads/main": "dummyhash", HEAD: "ref: refs/heads/main" },
  });
  log.success(`Announced repo state event: ${res}`);
}