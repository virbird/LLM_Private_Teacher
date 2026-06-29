// eslint-disable-next-line obsidianmd/no-nodejs-modules -- Required for CLI executable path resolution (fs module)
import * as fs from 'fs';
// eslint-disable-next-line obsidianmd/no-nodejs-modules -- Required for path manipulation in CLI resolution
import * as path from 'path';
// eslint-disable-next-line obsidianmd/no-nodejs-modules -- Required for which command execution in CLI resolution
import { execSync } from 'child_process';
import { Platform } from 'obsidian';

/**
 * Resolves CLI executable path with priority:
 * 1. User-configured path (if exists and is a file)
 * 2. Auto-detect from PATH (desktop only)
 * 3. Search common installation directories (homebrew, nvm, etc.)
 * 4. Fallback: `which` command via shell
 *
 * Obsidian runs as a GUI app and its process.env.PATH may not include
 * paths set by shell init scripts (e.g. homebrew, nvm, fnm).
 */
export class CliResolver {
  /** Common directories where CLI tools are installed on macOS/Linux. */
  private static readonly COMMON_DIRS = [
    '/opt/homebrew/bin',           // Apple Silicon homebrew
    '/usr/local/bin',              // Intel homebrew / manual install
    '/usr/local/npm/bin',         // npm global (non-nvm)
    '/usr/bin',                   // system
    '/bin',
  ];

  static resolve(configuredPath: string, fallbackNames: string[]): string | null {
    // 1. User-configured path
    if (configuredPath) {
      try {
        if (fs.existsSync(configuredPath) && fs.statSync(configuredPath).isFile()) {
          return configuredPath;
        }
      } catch {
        // Fall through to auto-detect
      }
    }

    // Auto-detect — desktop only
    if (!Platform.isDesktopApp) return null;

    // 2. Search process.env.PATH
    for (const name of fallbackNames) {
      const found = this.findInPath(name);
      if (found) return found;
    }

    // 3. Search common installation directories
    for (const name of fallbackNames) {
      for (const dir of this.COMMON_DIRS) {
        const full = path.join(dir, name);
        if (this.isExecutableFile(full)) return full;
      }
    }

    // 4. Fallback: use `which` via user's login shell
    for (const name of fallbackNames) {
      const found = this.whichFromShell(name);
      if (found) return found;
    }

    return null;
  }

  private static findInPath(name: string): string | null {
    const pathEnv = process.env.PATH ?? '';
    const exts = process.platform === 'win32' ? ['.exe', '.cmd', ''] : [''];
    for (const dir of pathEnv.split(path.delimiter)) {
      for (const ext of exts) {
        const full = path.join(dir, name + ext);
        if (this.isExecutableFile(full)) return full;
      }
    }
    return null;
  }

  /**
   * Use `which` via a login shell to find executables.
   * GUI apps don't inherit PATH from shell init scripts, so we explicitly
   * run through the user's shell to get the full PATH.
   */
  private static whichFromShell(name: string): string | null {
    const shell = process.env.SHELL ?? '/bin/zsh';
    try {
      const output = execSync(`which ${name} 2>/dev/null`, {
        shell,
        encoding: 'utf-8',
        timeout: 5000,
        env: { ...process.env },
      }).trim();
      if (output && this.isExecutableFile(output)) {
        return output;
      }
    } catch {
      // Shell not available or command not found
    }
    return null;
  }

  /** Check that a path exists, is a file (following symlinks), and is executable. */
  private static isExecutableFile(fullPath: string): boolean {
    try {
      if (!fs.existsSync(fullPath)) return false;
      const stat = fs.statSync(fullPath); // follows symlinks
      if (!stat.isFile()) return false;
      // On Unix, check executable bit
      if (process.platform !== 'win32') {
        fs.accessSync(fullPath, fs.constants.X_OK);
      }
      return true;
    } catch {
      return false;
    }
  }
}
