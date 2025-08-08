import * as vscode from 'vscode';

// Define the RepoAnnouncement interface inline to avoid import issues
export interface RepoAnnouncement {
  id: string;
  repoId: string;
  address: string;
  name?: string;
  owner: string; // pubkey
  description?: string;
  web?: string[];
  clone?: string[];
  identifier: string; // for backward compatibility
  pubkey: string; // for backward compatibility
}

export class RepoTreeItem extends vscode.TreeItem {
  constructor(
    public readonly repo: RepoAnnouncement,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(repo.name || 'Unnamed Repository', collapsibleState);
    
    this.tooltip = `${repo.name || 'Unnamed Repository'}\nOwner: ${repo.owner}\n${repo.description || ''}`;
    this.description = repo.description;
    
    // Use robohash for avatar based on pubkey
    const pubkey = repo.pubkey || repo.owner;
    this.iconPath = {
      light: vscode.Uri.parse(`https://robohash.org/${pubkey}?set=set3&size=32x32`),
      dark: vscode.Uri.parse(`https://robohash.org/${pubkey}?set=set3&size=32x32`)
    };
    
    // Add context value for context menu commands
    this.contextValue = 'nostrRepo';
    
    // Add command to open web URL when clicking on the item
    if (repo.web && repo.web.length > 0) {
      this.command = {
        command: 'vscode.open',
        title: 'Open Repository',
        arguments: [vscode.Uri.parse(repo.web[0])]
      };
    }
  }
}

export class RepoTreeProvider implements vscode.TreeDataProvider<RepoTreeItem> {
  private repos: RepoAnnouncement[] = [];
  private _onDidChangeTreeData = new vscode.EventEmitter<RepoTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private updateContext() {
    console.log(`ngit-vscode: Setting context nostrRepos.hasRepos to ${this.repos.length > 0}`);
    vscode.commands.executeCommand('setContext', 'nostrRepos.hasRepos', this.repos.length > 0);
  }

  addRepo(repo: RepoAnnouncement) {
    // Check if repo already exists to avoid duplicates
    const existingIndex = this.repos.findIndex(r => r.id === repo.id);
    if (existingIndex >= 0) {
      this.repos[existingIndex] = repo;
    } else {
      this.repos.push(repo);
    }
    this.updateContext();
    this._onDidChangeTreeData.fire();
  }

  removeRepo(repoId: string) {
    const index = this.repos.findIndex(r => r.id === repoId);
    if (index >= 0) {
      this.repos.splice(index, 1);
      this.updateContext();
      this._onDidChangeTreeData.fire();
    }
  }

  getTreeItem(element: RepoTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: RepoTreeItem): Thenable<RepoTreeItem[]> {
    if (element) {
      return Promise.resolve([]);
    }
    
    return Promise.resolve(
      this.repos.map(repo => new RepoTreeItem(repo, vscode.TreeItemCollapsibleState.None))
    );
  }

  refresh() {
    this._onDidChangeTreeData.fire();
  }

  clear() {
    this.repos = [];
    this.updateContext();
    this._onDidChangeTreeData.fire();
  }

  getRepos(): RepoAnnouncement[] {
    return [...this.repos];
  }
}