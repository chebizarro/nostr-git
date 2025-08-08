import * as vscode from "vscode";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function listNostrPRs() {
  // Support multiple workspace folders
  let repoPath: string | undefined;
  
  if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
    vscode.window.showErrorMessage("No workspace folder is open");
    return;
  }
  
  if (vscode.workspace.workspaceFolders.length === 1) {
    repoPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
  } else {
    // Multiple workspace folders - show quick pick
    const folderItems = vscode.workspace.workspaceFolders.map(folder => ({
      label: folder.name,
      description: folder.uri.fsPath,
      folder: folder
    }));
    
    const selectedFolder = await vscode.window.showQuickPick(folderItems, {
      placeHolder: "Select workspace folder to list Nostr PRs"
    });
    
    if (!selectedFolder) return;
    repoPath = selectedFolder.folder.uri.fsPath;
  }

  try {
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: "Listing Nostr PRs",
      cancellable: false
    }, async (progress) => {
      progress.report({ message: "Executing ngit list command..." });
      
      const { stdout, stderr } = await execAsync("ngit list", { cwd: repoPath });
      
      if (stderr) {
        vscode.window.showWarningMessage(`ngit list warning: ${stderr}`);
      }
      
      if (stdout.trim()) {
        vscode.window.showInformationMessage(
          `Nostr PRs:\n${stdout}`, 
          "OK"
        );
      } else {
        vscode.window.showInformationMessage("No Nostr PRs found in this repository.");
      }
    });
  } catch (err) {
    vscode.window.showErrorMessage(`ngit list failed: ${(err as Error).message}`);
  }
}
