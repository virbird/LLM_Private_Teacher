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
  } catch (e: any) {
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
  } catch (e: any) {
    const latency = Date.now() - start;
    const msg = parseApiError(e);
    return { success: false, message: msg, latencyMs: latency };
  }
}

function parseApiError(e: any): string {
  // Obsidian's requestUrl throws with status info
  if (e?.status) {
    const body = e?.message || '';
    if (e.status === 401) return 'Invalid API key (401 Unauthorized)';
    if (e.status === 403) return 'Access denied (403 Forbidden)';
    if (e.status === 404) return 'Model not found (404)';
    if (e.status === 429) return 'Rate limited (429) — API key may be valid';
    if (e.status === 500) return 'Server error (500)';
    if (e.status === 529) return 'Service overloaded (529)';
    return `HTTP ${e.status}: ${body.substring(0, 200)}`;
  }
  if (e?.message?.includes('fetch')) return `Network error: ${e.message}`;
  return e?.message || String(e);
}
