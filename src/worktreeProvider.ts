import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execAsync = promisify(exec);

export interface WorktreeInfo {
    path: string;
    branch: string;
    commit: string;
    isCurrent: boolean;
}

export interface RepositoryInfo {
    name: string;
    path: string;
    worktrees: WorktreeInfo[];
}

export interface BranchInfo {
    name: string;
    isCurrent: boolean;
    isRemote: boolean;
}

type TreeNode = RepositoryItem | WorktreeItem | BranchItem;

export class RepositoryItem extends vscode.TreeItem {
    constructor(
        public readonly name: string,
        public readonly path: string,
        public readonly worktreeCount: number,
        public readonly worktrees: WorktreeInfo[]
    ) {
        super(name, vscode.TreeItemCollapsibleState.Expanded);

        this.tooltip = `${name}\n${path}`;
        this.description = `${worktreeCount} worktree${worktreeCount !== 1 ? 's' : ''}`;
        this.iconPath = new vscode.ThemeIcon('repo');
        this.contextValue = 'repository';
    }
}

export class WorktreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly path: string,
        public readonly branch: string,
        public readonly isCurrent: boolean,
        public readonly branches: BranchInfo[]
    ) {
        super(label, vscode.TreeItemCollapsibleState.Collapsed);

        this.tooltip = `${branch}\n${path}`;
        this.description = `${path} (${branch})`;
        this.iconPath = new vscode.ThemeIcon(
            isCurrent ? 'folder-active' : 'folder',
            isCurrent ? new vscode.ThemeColor('charts.green') : undefined
        );

        this.contextValue = 'worktree';
    }
}

export class BranchItem extends vscode.TreeItem {
    constructor(
        public readonly name: string,
        public readonly isCurrent: boolean,
        public readonly worktreePath: string,
        public readonly isRemote: boolean
    ) {
        super(name, vscode.TreeItemCollapsibleState.None);

        this.tooltip = isRemote ? `Remote branch: ${name}` : `Branch: ${name}`;
        this.description = isCurrent ? '(current)' : undefined;
        this.iconPath = new vscode.ThemeIcon(
            isCurrent ? 'check' : 'git-branch',
            isCurrent ? new vscode.ThemeColor('charts.green') : undefined
        );

        this.contextValue = 'branch';

        if (!isCurrent) {
            this.command = {
                command: 'worktree-manager.switchBranch',
                title: 'Switch to Branch',
                arguments: [this]
            };
        }
    }
}

export class WorktreeProvider implements vscode.TreeDataProvider<TreeNode> {
    private _onDidChangeTreeData: vscode.EventEmitter<TreeNode | undefined | null | void> =
        new vscode.EventEmitter<TreeNode | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TreeNode | undefined | null | void> =
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

    getTreeItem(element: TreeNode): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: TreeNode): Promise<TreeNode[]> {
        if (!element) {
            // Root level - return repositories
            const repositories = await this.getRepositories();
            return repositories.map(repo =>
                new RepositoryItem(repo.name, repo.path, repo.worktrees.length, repo.worktrees)
            );
        } else if (element instanceof RepositoryItem) {
            // Second level - return worktrees for this repository
            const worktreesWithBranches = await Promise.all(
                element.worktrees.map(async (wt) => {
                    const branches = await this.getBranches(wt.path);
                    return new WorktreeItem(
                        wt.branch,
                        wt.path,
                        wt.branch,
                        wt.isCurrent,
                        branches
                    );
                })
            );
            return worktreesWithBranches;
        } else if (element instanceof WorktreeItem) {
            // Third level - return branches for this worktree
            return element.branches.map(branch =>
                new BranchItem(branch.name, branch.isCurrent, element.path, branch.isRemote)
            );
        }

        return [];
    }

    private async getRepositories(): Promise<RepositoryInfo[]> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return [];
        }

        const repositories: RepositoryInfo[] = [];

        // Check each workspace folder for git repositories
        for (const folder of workspaceFolders) {
            try {
                // Check if this folder is a git repository
                const isGitRepo = await this.isGitRepository(folder.uri.fsPath);

                if (isGitRepo) {
                    const worktrees = await this.getWorktrees(folder.uri.fsPath);

                    if (worktrees.length > 0) {
                        const repoName = await this.getRepositoryName(folder.uri.fsPath);

                        repositories.push({
                            name: repoName,
                            path: folder.uri.fsPath,
                            worktrees
                        });
                    }
                }
            } catch (error) {
                console.error(`Failed to get repository info for ${folder.uri.fsPath}:`, error);
                // Continue with other folders
            }
        }

        return repositories;
    }

    private async isGitRepository(path: string): Promise<boolean> {
        try {
            await execAsync('git rev-parse --git-dir', { cwd: path });
            return true;
        } catch (error) {
            return false;
        }
    }

    private async getRepositoryName(cwd: string): Promise<string> {
        try {
            // Try to get repository name from remote URL
            const { stdout } = await execAsync('git config --get remote.origin.url', { cwd });
            const remoteUrl = stdout.trim();

            if (remoteUrl) {
                // Extract repo name from URL (e.g., "user/repo.git" -> "repo")
                const match = remoteUrl.match(/\/([^\/]+?)(\.git)?$/);
                if (match) {
                    return match[1];
                }
            }
        } catch (error) {
            // Fall through to directory name
        }

        // Fallback: use directory name
        return path.basename(cwd);
    }

    private async getWorktrees(cwd: string): Promise<WorktreeInfo[]> {
        try {
            const { stdout } = await execAsync('git worktree list --porcelain', { cwd });
            return this.parseWorktreeList(stdout, cwd);
        } catch (error) {
            console.error('Failed to get worktrees:', error);
            return [];
        }
    }

    private parseWorktreeList(output: string, currentPath: string): WorktreeInfo[] {
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
                        isCurrent: currentWorktree.path === currentPath
                    });
                }
                currentWorktree = {};
            }
        }

        // Handle last worktree if output doesn't end with empty line
        if (currentWorktree.path) {
            worktrees.push({
                path: currentWorktree.path,
                branch: currentWorktree.branch || 'detached',
                commit: currentWorktree.commit || '',
                isCurrent: currentWorktree.path === currentPath
            });
        }

        return worktrees;
    }

    private async getBranches(worktreePath: string): Promise<BranchInfo[]> {
        try {
            const { stdout } = await execAsync('git branch --list --all', { cwd: worktreePath });
            return this.parseBranchList(stdout);
        } catch (error) {
            console.error('Failed to get branches:', error);
            return [];
        }
    }

    private parseBranchList(output: string): BranchInfo[] {
        const branches: BranchInfo[] = [];
        const lines = output.split('\n').filter(line => line.trim());

        for (const line of lines) {
            const trimmed = line.trim();
            const isCurrent = trimmed.startsWith('* ');
            const branchName = trimmed.replace(/^\*?\s+/, '');

            // Skip HEAD detached state and remote HEAD pointers
            if (branchName.includes('HEAD') && branchName.includes('->')) {
                continue;
            }

            const isRemote = branchName.startsWith('remotes/');
            const cleanName = isRemote ? branchName.replace('remotes/', '') : branchName;

            branches.push({
                name: cleanName,
                isCurrent,
                isRemote
            });
        }

        return branches;
    }

    async switchBranch(worktreePath: string, branchName: string): Promise<void> {
        try {
            // Handle remote branches - strip the remote prefix for checkout
            let checkoutName = branchName;
            if (branchName.includes('/')) {
                const parts = branchName.split('/');
                checkoutName = parts.slice(1).join('/'); // Remove remote name
            }

            await execAsync(`git checkout ${checkoutName}`, { cwd: worktreePath });
            vscode.window.showInformationMessage(`Switched to branch: ${checkoutName}`);
            this.refresh();
        } catch (error: any) {
            const errorMsg = error.stderr || error.message || String(error);
            vscode.window.showErrorMessage(`Failed to switch branch: ${errorMsg}`);
        }
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
