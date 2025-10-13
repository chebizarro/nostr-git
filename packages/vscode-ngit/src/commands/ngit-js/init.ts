import { createGitProvider } from "../git.js";
import { log } from "../utils/logger.js";

export default async function init() {
  const provider = await createGitProvider();
  const repoId = await (await import("../utils/prompts.js")).promptInput("Repo identifier:");
  const evt = await provider.announceRepoState({
    identifier: repoId,
    kind: 30617,
    state: { "refs/heads/main": "hash", HEAD: "ref: refs/heads/main" },
    content: "Repository announcement",
  });
  log.success(`Published announcement event: ${evt}`);
}