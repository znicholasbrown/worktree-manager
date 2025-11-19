# Worktree Manager

A VS Code extension for managing Git worktrees directly from the editor.

## Features

- 📋 **View all worktrees** in a dedicated sidebar
- ➕ **Create new worktrees** with custom branches
- 🔄 **Switch between worktrees** with one click
- 🗑️ **Remove worktrees** safely
- 🎯 **Visual indicators** showing your current worktree

## Installation

### Option 1: Install from .vsix (Recommended)

1. Download the latest `.vsix` file from the [releases](https://github.com/znicholasbrown/worktree-manager/releases)
   
   Or build it yourself:
   ```bash
   npm install
   npm run package
   ```

2. Install in VS Code:
   - Open VS Code
   - Go to Extensions view (`Cmd+Shift+X`)
   - Click the "..." menu → "Install from VSIX..."
   - Select `worktree-manager-0.0.1.vsix`

### Option 2: Development Mode

1. Clone the repository:
   ```bash
   git clone https://github.com/znicholasbrown/worktree-manager.git
   cd worktree-manager
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run in development mode:
   - Press `F5` in VS Code
   - The extension will load in a new Extension Development Host window

## Getting Started

### Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Build the extension:
   ```bash
   npm run build
   ```

3. Run in development mode:
   - Press `F5` in VS Code to open the Extension Development Host
   - The extension will be loaded automatically

4. Package for distribution:
   ```bash
   npm run package
   ```
   This creates a `worktree-manager-0.0.1.vsix` file that can be installed locally.

### Usage

Once installed, you'll see a new "Worktrees" icon in the Activity Bar (sidebar). Click it to:

- View all your Git worktrees
- Create new worktrees with the "+" button
- Switch to a worktree by clicking on it
- Remove worktrees via the context menu

### Commands

Access these commands via the Command Palette (`Cmd+Shift+P`):

- `Worktree: List Worktrees` - Refresh the worktree list
- `Worktree: Create New Worktree` - Create a new worktree
- `Worktree: Switch to Worktree` - Switch to a different worktree
- `Worktree: Remove Worktree` - Remove a worktree

## Project Structure

```
.
├── src/
│   ├── extension.ts         # Extension entry point
│   └── worktreeProvider.ts  # Worktree tree view provider
├── dist/                    # Compiled output (esbuild)
├── package.json             # Extension manifest
├── tsconfig.json            # TypeScript configuration
└── esbuild.js              # Build configuration
```

## Technology Stack

- **TypeScript** - Type-safe development
- **esbuild** - Fast bundling
- **VS Code Extension API** - Extension framework

## License

MIT
 extension
