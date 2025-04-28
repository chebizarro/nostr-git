import * as vscode from 'vscode';
import type { RepoAnnouncement } from '../nostr/parseRepoEvent';

export class RepoTreeProvider implements vscode.TreeDataProvider<RepoTreeItem> {
  private repos: RepoAnnouncement[] = [];
  private _onDidChangeTreeData: vscode.EventEmitter<RepoTreeItem | undefined | void> = new vscode.EventEmitter();
  readonly onDidChangeTreeData: vscode.Event<RepoTreeItem | undefined | void> = this._onDidChangeTreeData.event;

  addRepo(repo: RepoAnnouncement) {
    this.repos.push(repo);
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: RepoTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): Thenable<RepoTreeItem[]> {
    return Promise.resolve(this.repos.map(repo => new RepoTreeItem(repo)));
  }
}

class RepoTreeItem extends vscode.TreeItem {
	constructor(public readonly repo: RepoAnnouncement) {
	  super(repo.name, vscode.TreeItemCollapsibleState.None);
  
	  this.tooltip = `${repo.description || ''}`;
	  this.description = repo.clone || repo.web || repo.identifier;
	  this.contextValue = 'nostrRepo';
	  this.command = {
		command: 'vscode.open',
		title: 'Open in Browser',
		arguments: [vscode.Uri.parse(repo.web || 'https://gitworkshop.dev/repos')]
	  };
  
	  const pubkey = repo.pubkey;
	  this.iconPath = {
		light: vscode.Uri.parse(`https://robohash.org/${pubkey}?set=set3&size=32x32`),
		dark: vscode.Uri.parse(`https://robohash.org/${pubkey}?set=set3&size=32x32`)
	  };
	}
  }
  