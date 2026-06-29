import { spawn, type ChildProcess } from 'child_process';
import type { Readable, Writable } from 'stream';

export interface CliLaunchSpec {
  command: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
}

type ExitCallback = (code: number | null, signal: string | null) => void;
type ErrorCallback = (error: Error) => void;

/**
 * Shared CLI subprocess wrapper for all CLI-based providers.
 * Handles spawn/kill/error/exit lifecycle.
 */
export class CliSubprocess {
  private proc: ChildProcess | null = null;
  private readonly exitCallbacks: ExitCallback[] = [];
  private readonly errorCallbacks: ErrorCallback[] = [];

  constructor(private readonly spec: CliLaunchSpec) {}

  start(): void {
    if (this.proc) return;

    this.proc = spawn(this.spec.command, this.spec.args, {
      cwd: this.spec.cwd,
      env: { ...process.env, ...this.spec.env },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    this.proc.on('exit', (code, signal) => {
      for (const cb of this.exitCallbacks) {
        cb(code, signal);
      }
    });

    this.proc.on('error', (error) => {
      for (const cb of this.errorCallbacks) {
        cb(error);
      }
    });
  }

  get stdin(): Writable {
    if (!this.proc?.stdin) throw new Error('Process not started or stdin unavailable');
    return this.proc.stdin;
  }

  get stdout(): Readable {
    if (!this.proc?.stdout) throw new Error('Process not started or stdout unavailable');
    return this.proc.stdout;
  }

  get stderr(): Readable {
    if (!this.proc?.stderr) throw new Error('Process not started or stderr unavailable');
    return this.proc.stderr;
  }

  get isAlive(): boolean {
    return this.proc !== null && this.proc.exitCode === null && !this.proc.killed;
  }

  get pid(): number | undefined {
    return this.proc?.pid;
  }

  kill(signal: NodeJS.Signals = 'SIGTERM'): void {
    this.proc?.kill(signal);
  }

  onExit(callback: ExitCallback): () => void {
    this.exitCallbacks.push(callback);
    return () => {
      const idx = this.exitCallbacks.indexOf(callback);
      if (idx >= 0) this.exitCallbacks.splice(idx, 1);
    };
  }

  onError(callback: ErrorCallback): () => void {
    this.errorCallbacks.push(callback);
    return () => {
      const idx = this.errorCallbacks.indexOf(callback);
      if (idx >= 0) this.errorCallbacks.splice(idx, 1);
    };
  }
}
