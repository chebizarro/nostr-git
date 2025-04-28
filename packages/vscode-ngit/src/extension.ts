import * as vscode from "vscode";
import { listNostrPRs } from "./commands/listNostrPRs";
import { initNostrRepo } from "./commands/initNostrRepo";
import { parseRepoEvent } from "./nostr/parseRepoEvent";
import { RepoTreeProvider } from "./views/RepoTreeProvider";
import { announceRepo } from "./commands/announceRepo";
import { Nip46Client } from "./nostr/nip46Client";

export function activate(context: vscode.ExtensionContext) {
  console.log("✅ ngit-vscode extension activated");

  const repoTreeProvider = new RepoTreeProvider();
  vscode.window.registerTreeDataProvider("nostrRepos", repoTreeProvider);

  context.subscriptions.push(
    vscode.commands.registerCommand("ngit.listPRs", listNostrPRs),
    vscode.commands.registerCommand("ngit.initRepo", initNostrRepo),
    vscode.commands.registerCommand("ngit.announceRepo", announceRepo),
    vscode.commands.registerCommand("ngit.parseRepoEvent", async () => {
      const input = await vscode.window.showInputBox({
        prompt: "Paste kind:30617 repo announcement JSON",
      });
      if (!input) return;
      try {
        const parsed = parseRepoEvent(JSON.parse(input));
        vscode.window.showInformationMessage(
          `Repo: ${parsed.name}\nURL: ${parsed.web}\nClone: ${parsed.clone}`
        );
        repoTreeProvider.addRepo(parsed);
      } catch (err) {
        vscode.window.showErrorMessage(
          `Invalid event: ${(err as Error).message}`
        );
      }
    }),
    vscode.commands.registerCommand("ngit.copyCloneUrl", async (item) => {
      if (item?.repo?.clone) {
        await vscode.env.clipboard.writeText(item.repo.clone);
        vscode.window.showInformationMessage("Clone URL copied to clipboard");
      } else {
        vscode.window.showErrorMessage("No clone URL available");
      }
    }),
    vscode.commands.registerCommand("ngit.copyWebUrl", async (item) => {
      if (item?.repo?.web) {
        await vscode.env.clipboard.writeText(item.repo.web);
        vscode.window.showInformationMessage("Web URL copied to clipboard");
      } else {
        vscode.window.showErrorMessage("No web URL available");
      }
    }),
    vscode.commands.registerCommand("ngit.nip46Connect", async () => {
      const uri = await vscode.window.showInputBox({
        prompt: "Enter NIP-46 URI (e.g., bunker://...)",
      });
      if (!uri) return;

      try {
        const client = new Nip46Client();
        await client.connect(uri);

        const pubkey = await client.getPublicKey();
        vscode.window.showInformationMessage(
          `Connected to NIP-46 signer. Pubkey: ${pubkey}`
        );
      } catch (err) {
        vscode.window.showErrorMessage(
          `NIP-46 connection failed: ${(err as Error).message}`
        );
      }
    })
  );
}

export function deactivate() {}
