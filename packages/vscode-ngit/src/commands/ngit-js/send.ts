import { createGitProvider } from "../git.js";
import { promptInput } from "../utils/prompts.js";
import { log } from "../utils/logger.js";

export default async function send(range: string | undefined, opts: any) {
  const provider = await createGitProvider();
  const repoAddr = await promptInput("Repository address (a-tag)?:");
  const commits = [await promptInput("Enter commit hash to send:")];
  const baseBranch = "main";
  const content = await promptInput("Patch description:");
  try {
    const res = await provider.sendProposal({
      repoAddr,
      commits,
      baseBranch,
      coverLetter: content,
    });
    log.success(`Sent proposal with patchIds: ${res.patchIds.join(", ")}`);
  } catch (err) {
    log.error(`Send failed: ${(err as Error).message}`);
  }
}