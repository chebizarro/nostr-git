import * as vscode from 'vscode';
import * as path from 'path';
import { execSync } from 'child_process';

export async function announceRepo() {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('Open a Git-enabled folder first');
    return;
  }

  const cwd = workspaceFolder.uri.fsPath;

  try {
    const name = execSync('git rev-parse --show-toplevel', { cwd }).toString().trim().split(path.sep).pop();
    const remoteUrl = execSync('git remote get-url origin', { cwd }).toString().trim();
    const web = await vscode.window.showInputBox({ prompt: 'Enter project website (or leave blank)', value: remoteUrl.replace(/\.git$/, '') });
    const clone = await vscode.window.showInputBox({ prompt: 'Enter clone URL', value: remoteUrl });
    const description = await vscode.window.showInputBox({ prompt: 'Enter short description' });

    const event = {
      kind: 30617,
      content: '',
      tags: [
        ['d', name!],
        ['name', name!],
        ...(description ? [['description', description]] : []),
        ...(web ? [['web', web]] : []),
        ...(clone ? [['clone', clone]] : [])
      ],
      created_at: Math.floor(Date.now() / 1000),
      pubkey: 'YOUR_PUBKEY_HERE',
      id: '...',
      sig: '...'
    };

    const output = JSON.stringify(event, null, 2);
    await vscode.env.clipboard.writeText(output);
    vscode.window.showInformationMessage('Repo announcement (kind:30617) copied to clipboard!');

  } catch (err) {
    vscode.window.showErrorMessage(`Failed to generate announcement: ${(err as Error).message}`);
  }
}
