import { requestUrl } from 'obsidian';

export interface TestResult {
  success: boolean;
  message: string;
  latencyMs: number;
}

/**
 * Test Anthropic API connection with a minimal non-streaming request.
 */
export async function testAnthropic(apiKey: string, model: string): Promise<TestResult> {
  const start = Date.now();
  try {
    const response = await requestUrl({
      url: 'https://api.anthropic.com/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    });

    const latency = Date.now() - start;
    if (response.status === 200) {
      return { success: true, message: `Connected to ${model}`, latencyMs: latency };
    }
    return { success: false, message: `Unexpected status: ${response.status}`, latencyMs: latency };
  } catch (e: unknown) {
    const latency = Date.now() - start;
    const msg = parseApiError(e);
    return { success: false, message: msg, latencyMs: latency };
  }
}

/**
 * Test OpenAI-compatible API connection with a minimal non-streaming request.
 */
export async function testOpenAI(apiKey: string, model: string, baseUrl: string): Promise<TestResult> {
  const start = Date.now();
  const url = baseUrl.replace(/\/+$/, '') + '/chat/completions';
  try {
    const response = await requestUrl({
      url,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    });

    const latency = Date.now() - start;
    if (response.status === 200) {
      return { success: true, message: `Connected to ${model}`, latencyMs: latency };
    }
    return { success: false, message: `Unexpected status: ${response.status}`, latencyMs: latency };
  } catch (e: unknown) {
    const latency = Date.now() - start;
    const msg = parseApiError(e);
    return { success: false, message: msg, latencyMs: latency };
  }
}

function parseApiError(e: unknown): string {
  // Obsidian's requestUrl throws with status info
  if (e && typeof e === 'object' && 'status' in e) {
    const err = e as { status: number; message?: string };
    const body = err.message || '';
    if (err.status === 401) return 'Invalid API key (401 Unauthorized)';
    if (err.status === 403) return 'Access denied (403 Forbidden)';
    if (err.status === 404) return 'Model not found (404)';
    if (err.status === 429) return 'Rate limited (429) — API key may be valid';
    if (err.status === 500) return 'Server error (500)';
    if (err.status === 529) return 'Service overloaded (529)';
    return `HTTP ${err.status}: ${body.substring(0, 200)}`;
  }
  if (e instanceof Error && e.message.includes('fetch')) return `Network error: ${e.message}`;
  return e instanceof Error ? e.message : String(e);
}
