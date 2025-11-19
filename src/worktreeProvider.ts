import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface WorktreeInfo {
    path: string;
    branch: string;
    commit: string;
    isCurrent: boolean;
}

export class WorktreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly path: string,
        public readonly branch: string,
        public readonly isCurrent: boolean,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);

        this.tooltip = `${branch} - ${path}`;
        this.description = isCurrent ? '(current)' : path;
        this.iconPath = new vscode.ThemeIcon(
            isCurrent ? 'check' : 'git-branch',
            isCurrent ? new vscode.ThemeColor('charts.green') : undefined
        );

        this.contextValue = 'worktree';
        this.command = {
            command: 'worktree-manager.switchWorktree',
            title: 'Switch to Worktree',
            arguments: [this]
        };
    }
}

export class WorktreeProvider implements vscode.TreeDataProvider<WorktreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<WorktreeItem | undefined | null | void> =
        new vscode.EventEmitter<WorktreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<WorktreeItem | undefined | null | void> =
        this._onDidChangeTreeData.event;

    constructor() {
        // Watch for git changes
        const gitWatcher = vscode.workspace.createFileSystemWatcher('**/.git/**');
        gitWatcher.onDidChange(() => this.refresh());
        gitWatcher.onDidCreate(() => this.refresh());
        gitWatcher.onDidDelete(() => this.refresh());
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: WorktreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: WorktreeItem): Promise<WorktreeItem[]> {
        if (element) {
            return [];
        }

        const worktrees = await this.getWorktrees();
        return worktrees.map(wt =>
            new WorktreeItem(
                wt.branch,
                wt.path,
                wt.branch,
                wt.isCurrent,
                vscode.TreeItemCollapsibleState.None
            )
        );
    }

    private async getWorktrees(): Promise<WorktreeInfo[]> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return [];
        }

        try {
            const { stdout } = await execAsync('git worktree list --porcelain', {
                cwd: workspaceFolder.uri.fsPath
            });

            return this.parseWorktreeList(stdout);
        } catch (error) {
            console.error('Failed to get worktrees:', error);
            return [];
        }
    }

    private parseWorktreeList(output: string): WorktreeInfo[] {
        const worktrees: WorktreeInfo[] = [];
        const lines = output.split('\n');

        let currentWorktree: Partial<WorktreeInfo> = {};

        for (const line of lines) {
            if (line.startsWith('worktree ')) {
                currentWorktree.path = line.substring(9);
            } else if (line.startsWith('HEAD ')) {
                currentWorktree.commit = line.substring(5);
            } else if (line.startsWith('branch ')) {
                currentWorktree.branch = line.substring(7).replace('refs/heads/', '');
            } else if (line === '') {
                if (currentWorktree.path) {
                    worktrees.push({
                        path: currentWorktree.path,
                        branch: currentWorktree.branch || 'detached',
                        commit: currentWorktree.commit || '',
                        isCurrent: false // We'll determine this separately
                    });
                }
                currentWorktree = {};
            }
        }

        // Mark current worktree
        const currentPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (currentPath) {
            const current = worktrees.find(wt => wt.path === currentPath);
            if (current) {
                current.isCurrent = true;
            }
        }

        return worktrees;
    }

    async createWorktree(branch: string, path: string): Promise<void> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder open');
            return;
        }

        try {
            await execAsync(`git worktree add ${path} -b ${branch}`, {
                cwd: workspaceFolder.uri.fsPath
            });

            vscode.window.showInformationMessage(`Created worktree: ${branch} at ${path}`);
            this.refresh();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create worktree: ${error}`);
        }
    }

    async switchToWorktree(path: string): Promise<void> {
        const uri = vscode.Uri.file(path);
        await vscode.commands.executeCommand('vscode.openFolder', uri, false);
    }

    async removeWorktree(path: string): Promise<void> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return;
        }

        try {
            await execAsync(`git worktree remove ${path}`, {
                cwd: workspaceFolder.uri.fsPath
            });

            vscode.window.showInformationMessage(`Removed worktree at ${path}`);
            this.refresh();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to remove worktree: ${error}`);
        }
    }
}
