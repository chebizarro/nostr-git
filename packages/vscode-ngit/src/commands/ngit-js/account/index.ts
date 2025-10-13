import { loadConfig, saveConfig } from "../../config.js";
import { promptInput } from "../../utils/prompts.js";
import { log } from "../../utils/logger.js";
import { nip19 } from "nostr-tools";

export default async function account(opts: any) {
  const cfg = await loadConfig();

  if (opts.logout) {
    cfg.nsec = undefined;
    await saveConfig(cfg);
    log.info("Cleared credentials");
    return;
  }

  if (opts.export) {
    if (cfg.nsec) {
      const key = cfg.nsec.startsWith("nsec") ? cfg.nsec : nip19.nsecEncode(cfg.nsec);
      console.log(key);
    } else {
      log.warn("No nsec stored.");
    }
    return;
  }

  const key = await promptInput("Enter your nsec (starting with 'nsec'):");
  cfg.nsec = key;
  await saveConfig(cfg);
  log.success("nsec saved.");
}