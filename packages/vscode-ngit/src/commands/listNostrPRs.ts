import * as vscode from "vscode";
import { exec } from "child_process";

export async function listNostrPRs() {
  vscode.window.showInformationMessage("List Nostr PRs executed!");

  const repoPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
  if (!repoPath) {
    vscode.window.showErrorMessage("No workspace folder is open");
    return;
  }

  exec("ngit list", { cwd: repoPath }, (err, stdout, stderr) => {
    if (err) {
      vscode.window.showErrorMessage(`ngit list failed: ${stderr}`);
      return;
    }

    vscode.window.showInformationMessage(`Nostr PRs:\n${stdout}`);
  });
}
