import * as vscode from "vscode"
import * as path from "path"
import {execSync} from "child_process"

export async function announceRepo() {
  // Support multiple workspace folders
  let workspaceFolder: vscode.WorkspaceFolder | undefined

  if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
    vscode.window.showErrorMessage("Open a Git-enabled folder first")
    return
  }

  if (vscode.workspace.workspaceFolders.length === 1) {
    workspaceFolder = vscode.workspace.workspaceFolders[0]
  } else {
    // Multiple workspace folders - show quick pick
    const folderItems = vscode.workspace.workspaceFolders.map(folder => ({
      label: folder.name,
      description: folder.uri.fsPath,
      folder: folder,
    }))

    const selectedFolder = await vscode.window.showQuickPick(folderItems, {
      placeHolder: "Select workspace folder to announce to Nostr",
    })

    if (!selectedFolder) return
    workspaceFolder = selectedFolder.folder
  }

  const cwd = workspaceFolder.uri.fsPath

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Generating Repository Announcement",
        cancellable: false,
      },
      async progress => {
        progress.report({message: "Retrieving Git repository information..."})

        // Get repository name
        let name: string | undefined
        try {
          name = execSync("git rev-parse --show-toplevel", {cwd, timeout: 5000})
            .toString()
            .trim()
            .split(path.sep)
            .pop()
        } catch (err) {
          // Fallback to folder name
          name = workspaceFolder?.name
        }

        // Get remote URL if available
        let remoteUrl = ""
        try {
          remoteUrl = execSync("git remote get-url origin", {cwd, timeout: 5000}).toString().trim()
        } catch (err) {
          // Ignore if no remote
        }

        progress.report({message: "Collecting repository details..."})

        // Collect user input
        const web = await vscode.window.showInputBox({
          prompt: "Enter project website (or leave blank)",
          value: remoteUrl ? remoteUrl.replace(/\.git$/, "") : "",
          placeHolder: "https://example.com",
        })

        if (web === undefined) return // User cancelled

        const clone = await vscode.window.showInputBox({
          prompt: "Enter clone URL",
          value: remoteUrl || "",
          placeHolder: "https://github.com/user/repo.git",
        })

        if (clone === undefined) return // User cancelled

        const description = await vscode.window.showInputBox({
          prompt: "Enter short description (optional)",
          placeHolder: "A brief description of your repository",
        })

        if (description === undefined) return // User cancelled

        progress.report({message: "Creating announcement event..."})

        // Create the event
        const event = {
          kind: 30617,
          content: "",
          tags: [
            ["d", name || "unnamed-repo"],
            ["name", name || "Unnamed Repository"],
            ...(description ? [["description", description]] : []),
            ...(web ? [["web", web]] : []),
            ...(clone ? [["clone", clone]] : []),
          ],
          created_at: Math.floor(Date.now() / 1000),
          pubkey: "YOUR_PUBKEY_HERE",
          id: "...",
          sig: "...",
        }

        const output = JSON.stringify(event, null, 2)
        await vscode.env.clipboard.writeText(output)

        vscode.window.showInformationMessage(
          "Repo announcement (kind:30617) copied to clipboard!\n\n" +
            "Next steps:\n" +
            "1. Sign the event with your Nostr key\n" +
            "2. Publish to relays using ngit or another tool",
          "OK",
        )
      },
    )
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to generate announcement: ${(err as Error).message}`)
  }
}
