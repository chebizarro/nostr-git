import * as vscode from "vscode"
import {RepoTreeProvider} from "./views/RepoTreeProvider"
import {listNostrPRs} from "./commands/listNostrPRs"
import {initNostrRepo} from "./commands/initNostrRepo"
import {announceRepo} from "./commands/announceRepo"
import {Nip46Client} from "./nostr/nip46Client"
import {parseRepoEvent} from "./nostr/parseRepoEvent"

let treeProvider: RepoTreeProvider

export async function activate(context: vscode.ExtensionContext) {
  console.log("ngit-vscode activating...")

  try {
    // Create and register the tree provider
    treeProvider = new RepoTreeProvider()
    vscode.window.registerTreeDataProvider("nostrRepos", treeProvider)

    // Initialize context for welcome view (no repos initially)
    console.log("ngit-vscode: Setting initial context nostrRepos.hasRepos to false")
    vscode.commands.executeCommand("setContext", "nostrRepos.hasRepos", false)

    console.log("ngit-vscode tree provider registered")
  } catch (error) {
    console.error("ngit-vscode failed to register tree provider:", error)
  }

  // Register commands
  try {
    context.subscriptions.push(
      vscode.commands.registerCommand("ngit.listPRs", listNostrPRs),
      vscode.commands.registerCommand("ngit.initRepo", initNostrRepo),
      vscode.commands.registerCommand("ngit.announceRepo", announceRepo),
      vscode.commands.registerCommand("ngit.parseRepoEvent", async () => {
        const input = await vscode.window.showInputBox({
          prompt: "Paste kind:30617 repo announcement JSON",
          placeHolder: '{"kind": 30617, ...}',
        })
        if (!input) return

        try {
          const eventData = JSON.parse(input)
          if (eventData.kind !== 30617) {
            vscode.window.showErrorMessage(`Expected kind 30617, got ${eventData.kind}`)
            return
          }

          const parsed = parseRepoEvent(eventData)

          const webUrls = parsed.web?.join("\n") || "None"
          const cloneUrls = parsed.clone?.join("\n") || "None"

          vscode.window.showInformationMessage(
            `Repository: ${parsed.name || "Unnamed"}\n` +
              `Description: ${parsed.description || "None"}\n` +
              `Web URLs: ${webUrls}\n` +
              `Clone URLs: ${cloneUrls}`,
            "OK",
          )

          // Add the parsed repo to the tree view
          treeProvider.addRepo(parsed)
        } catch (err) {
          vscode.window.showErrorMessage(`Invalid event: ${(err as Error).message}`)
        }
      }),
      vscode.commands.registerCommand("ngit.copyCloneUrl", async item => {
        if (item?.repo?.clone && item.repo.clone.length > 0) {
          // If multiple clone URLs, show quick pick
          let cloneUrl: string | undefined
          if (item.repo.clone.length === 1) {
            cloneUrl = item.repo.clone[0]
          } else {
            cloneUrl = await vscode.window.showQuickPick(item.repo.clone, {
              placeHolder: "Select clone URL to copy",
            })
          }

          if (cloneUrl) {
            await vscode.env.clipboard.writeText(cloneUrl)
            vscode.window.showInformationMessage("Clone URL copied to clipboard")
          }
        } else {
          vscode.window.showErrorMessage("No clone URL available")
        }
      }),
      vscode.commands.registerCommand("ngit.copyWebUrl", async item => {
        if (item?.repo?.web && item.repo.web.length > 0) {
          // If multiple web URLs, show quick pick
          let webUrl: string | undefined
          if (item.repo.web.length === 1) {
            webUrl = item.repo.web[0]
          } else {
            webUrl = await vscode.window.showQuickPick(item.repo.web, {
              placeHolder: "Select web URL to copy",
            })
          }

          if (webUrl) {
            await vscode.env.clipboard.writeText(webUrl)
            vscode.window.showInformationMessage("Web URL copied to clipboard")
          }
        } else {
          vscode.window.showErrorMessage("No web URL available")
        }
      }),
      vscode.commands.registerCommand("ngit.nip46Connect", async () => {
        const uri = await vscode.window.showInputBox({
          prompt: "Enter NIP-46 URI (e.g., bunker://...)",
          placeHolder: "bunker://...",
        })
        if (!uri) return

        try {
          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: "Connecting to NIP-46 signer",
              cancellable: false,
            },
            async progress => {
              progress.report({message: "Establishing connection..."})

              const client = new Nip46Client()
              await client.connect(uri)

              progress.report({message: "Retrieving public key..."})
              const pubkey = await client.getPublicKey()

              vscode.window.showInformationMessage(
                `Connected to NIP-46 signer.\nPubkey: ${pubkey}`,
                "OK",
              )
            },
          )
        } catch (err) {
          vscode.window.showErrorMessage(`NIP-46 connection failed: ${(err as Error).message}`)
        }
      }),
    )
    console.log("ngit-vscode commands registered")
  } catch (error) {
    console.error("ngit-vscode failed to register commands:", error)
  }

  console.log("ngit-vscode is now active!")
}

export function deactivate() {
  // Clean up resources if needed
}
