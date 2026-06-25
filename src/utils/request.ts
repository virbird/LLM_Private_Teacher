import { requestUrl } from 'obsidian';

export interface StreamRequestOptions {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
  signal?: AbortSignal;
}

export async function streamRequest(
  options: StreamRequestOptions,
  onChunk: (text: string) => void,
): Promise<void> {
  // Try native fetch first (available in Electron desktop)
  if (typeof fetch !== 'undefined') {
    await streamViaFetch(options, onChunk);
    return;
  }

  // Fallback: XMLHttpRequest with onprogress (works on iPad WebKit)
  await streamViaXHR(options, onChunk);
}

async function streamViaFetch(
  options: StreamRequestOptions,
  onChunk: (text: string) => void,
): Promise<void> {
  const response = await fetch(options.url, {
    method: options.method,
    headers: options.headers,
    body: options.body,
    signal: options.signal,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`API error ${response.status}: ${errorBody}`);
  }

  if (!response.body) {
    throw new Error('No response body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      if (text) onChunk(text);
    }
    // Flush remaining
    const remaining = decoder.decode();
    if (remaining) onChunk(remaining);
  } finally {
    reader.releaseLock();
  }
}

function streamViaXHR(
  options: StreamRequestOptions,
  onChunk: (text: string) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let lastIndex = 0;

    xhr.open(options.method, options.url, true);

    for (const [key, value] of Object.entries(options.headers)) {
      xhr.setRequestHeader(key, value);
    }

    xhr.onprogress = () => {
      const newData = xhr.responseText.substring(lastIndex);
      lastIndex = xhr.responseText.length;
      if (newData) onChunk(newData);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        // Flush any remaining data
        const remaining = xhr.responseText.substring(lastIndex);
        if (remaining) onChunk(remaining);
        resolve();
      } else {
        reject(new Error(`API error ${xhr.status}: ${xhr.responseText}`));
      }
    };

    xhr.onerror = () => reject(new Error('Network error'));
    xhr.onabort = () => reject(new Error('Request aborted'));

    if (options.signal) {
      options.signal.addEventListener('abort', () => xhr.abort());
    }

    xhr.send(options.body);
  });
}

// Non-streaming request for simple API calls (MCP, etc.)
export async function jsonRequest<T = unknown>(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
  } = {},
): Promise<T> {
  const response = await requestUrl({
    url,
    method: options.method ?? 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  return response.json as T;
}
