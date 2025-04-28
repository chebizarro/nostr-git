import * as vscode from 'vscode';
import { exec } from 'child_process';

export async function initNostrRepo() {
  const repoPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
  if (!repoPath) {
    vscode.window.showErrorMessage('No workspace folder is open');
    return;
  }

  exec('ngit init', { cwd: repoPath }, (err, stdout, stderr) => {
    if (err) {
      vscode.window.showErrorMessage(`ngit init failed: ${stderr}`);
      return;
    }

    vscode.window.showInformationMessage(`Repository announced to Nostr:\\n${stdout}`);
  });
}
