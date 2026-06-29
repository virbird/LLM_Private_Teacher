// eslint-disable-next-line obsidianmd/no-nodejs-modules -- Required for reading JSON-RPC lines from CLI subprocess stdout
import { createInterface, type Interface } from 'readline';

import type { CliSubprocess } from './CliSubprocess';

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: number;
};

type NotificationHandler = (params: unknown) => void;

/**
 * JSON-RPC 2.0 transport over a CLI subprocess's stdio.
 *
 * Shared by Codex, ACP, and OpenCode CLI providers.
 * - `request()` sends a JSON-RPC request and waits for the response.
 * - `notify()` sends a notification (no response expected).
 * - `onNotification()` subscribes to server-side notifications.
 */
export class JsonRpcTransport {
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly notificationHandlers = new Map<string, Set<NotificationHandler>>();
  private readline: Interface | null = null;

  constructor(private readonly subprocess: CliSubprocess) {}

  start(): void {
    this.readline = createInterface({ input: this.subprocess.stdout });
    this.readline.on('line', (line: string) => {
      this.handleLine(line);
    });
  }

  request<T>(method: string, params?: unknown, timeoutMs = 30000): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const id = this.nextId++;
      const msg = JSON.stringify({
        jsonrpc: '2.0',
        id,
        method,
        params: params ?? {},
      });

      const timer = window.setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`JSON-RPC request '${method}' timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pending.set(id, {
        resolve: (value) => {
          window.clearTimeout(timer);
          this.pending.delete(id);
          resolve(value as T);
        },
        reject: (error) => {
          window.clearTimeout(timer);
          this.pending.delete(id);
          reject(error);
        },
        timer,
      });

      try {
        this.subprocess.stdin.write(msg + '\n');
      } catch (error) {
        window.clearTimeout(timer);
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  notify(method: string, params?: unknown): void {
    const msg = JSON.stringify({
      jsonrpc: '2.0',
      method,
      params: params ?? {},
    });
    this.subprocess.stdin.write(msg + '\n');
  }

  onNotification(method: string, handler: NotificationHandler): () => void {
    let handlers = this.notificationHandlers.get(method);
    if (!handlers) {
      handlers = new Set();
      this.notificationHandlers.set(method, handlers);
    }
    handlers.add(handler);
    return () => {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.notificationHandlers.delete(method);
      }
    };
  }

  private handleLine(line: string): void {
    if (!line.trim()) return;

    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(line) as Record<string, unknown>;
    } catch {
      // Not valid JSON, skip
      return;
    }

    // Response (has id, no method)
    if ('id' in msg && !('method' in msg)) {
      const id = msg.id as number;
      const pending = this.pending.get(id);
      if (pending) {
        if (msg.error) {
          pending.reject(new Error(String((msg.error as { message?: string }).message ?? msg.error)));
        } else {
          pending.resolve(msg.result);
        }
      }
      return;
    }

    // Notification or request (has method)
    if ('method' in msg) {
      const method = msg.method as string;
      const params = msg.params;

      // If it has an id, it's a request — we should respond (but we don't support server-to-client requests)
      // For now, treat it as a notification
      const handlers = this.notificationHandlers.get(method);
      if (handlers) {
        for (const handler of handlers) {
          handler(params);
        }
      }
    }
  }
}
