import { createGitProvider } from "../git.js";
import { log } from "../utils/logger.js";

export default async function state(opts: any) {
  const repoId = opts.id || (await (await import("../utils/prompts.js")).promptInput("Repo identifier:"));
  const provider = await createGitProvider();
  try {
    const st = await provider.getRepoState(repoId, { kind: 30618, timeoutMs: 3000 });
    log.info(`Repo state for ${repoId}:`);
    console.log(JSON.stringify(st.state, null, 2));
  } catch (err) {
    log.error(`Get state failed: ${(err as Error).message}`);
  }
}