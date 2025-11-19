import * as vscode from 'vscode';
import { WorktreeProvider } from './worktreeProvider.js';

export function activate(context: vscode.ExtensionContext) {
    console.log('Worktree Manager extension is now active');

    // Create the tree view provider
    const worktreeProvider = new WorktreeProvider();

    // Register the tree view
    const treeView = vscode.window.createTreeView('worktreeList', {
        treeDataProvider: worktreeProvider,
        showCollapseAll: true
    });

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('worktree-manager.listWorktrees', async () => {
            await worktreeProvider.refresh();
            vscode.window.showInformationMessage('Worktrees refreshed');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('worktree-manager.createWorktree', async () => {
            const branch = await vscode.window.showInputBox({
                prompt: 'Enter branch name for new worktree',
                placeHolder: 'feature/my-feature'
            });

            if (branch) {
                const path = await vscode.window.showInputBox({
                    prompt: 'Enter path for new worktree',
                    placeHolder: '../my-feature'
                });

                if (path) {
                    await worktreeProvider.createWorktree(branch, path);
                }
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('worktree-manager.switchWorktree', async (item) => {
            if (item && item.path) {
                await worktreeProvider.switchToWorktree(item.path);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('worktree-manager.removeWorktree', async (item) => {
            if (item && item.path) {
                const confirm = await vscode.window.showWarningMessage(
                    `Remove worktree at ${item.path}?`,
                    { modal: true },
                    'Remove'
                );

                if (confirm === 'Remove') {
                    await worktreeProvider.removeWorktree(item.path);
                }
            }
        })
    );

    context.subscriptions.push(treeView);
}

export function deactivate() {
    console.log('Worktree Manager extension is now deactivated');
}
