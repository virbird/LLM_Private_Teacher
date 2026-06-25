// Mock obsidian's requestUrl before importing anything
jest.mock('obsidian', () => ({
  requestUrl: jest.fn(),
}));

import { requestUrl } from 'obsidian';
import { testAnthropic, testOpenAI } from '../../src/utils/testConnection';

const mockRequestUrl = requestUrl as jest.MockedFunction<typeof requestUrl>;

describe('testConnection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('testAnthropic', () => {
    it('should return success on 200 response', async () => {
      mockRequestUrl.mockResolvedValue({ status: 200 } as any);
      const result = await testAnthropic('sk-ant-test', 'claude-sonnet-4-20250514');
      expect(result.success).toBe(true);
      expect(result.message).toContain('claude-sonnet-4-20250514');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should return error on 401', async () => {
      mockRequestUrl.mockRejectedValue({ status: 401, message: 'Invalid API Key' });
      const result = await testAnthropic('bad-key', 'claude-sonnet-4-20250514');
      expect(result.success).toBe(false);
      expect(result.message).toContain('401');
    });

    it('should return error on 429', async () => {
      mockRequestUrl.mockRejectedValue({ status: 429, message: 'Rate limited' });
      const result = await testAnthropic('sk-ant-test', 'claude-sonnet-4-20250514');
      expect(result.success).toBe(false);
      expect(result.message).toContain('429');
    });

    it('should handle network errors', async () => {
      mockRequestUrl.mockRejectedValue(new Error('fetch failed'));
      const result = await testAnthropic('sk-ant-test', 'claude-sonnet-4-20250514');
      expect(result.success).toBe(false);
      expect(result.message).toContain('fetch');
    });
  });

  describe('testOpenAI', () => {
    it('should return success on 200 response', async () => {
      mockRequestUrl.mockResolvedValue({ status: 200 } as any);
      const result = await testOpenAI('sk-test', 'gpt-4o', 'https://api.openai.com/v1');
      expect(result.success).toBe(true);
      expect(result.message).toContain('gpt-4o');
    });

    it('should construct correct URL for compatible providers', async () => {
      mockRequestUrl.mockResolvedValue({ status: 200 } as any);
      await testOpenAI('sk-test', 'deepseek-chat', 'https://api.deepseek.com/v1');
      expect(mockRequestUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://api.deepseek.com/v1/chat/completions',
        }),
      );
    });

    it('should strip trailing slash from base URL', async () => {
      mockRequestUrl.mockResolvedValue({ status: 200 } as any);
      await testOpenAI('sk-test', 'model', 'https://api.example.com/v1/');
      expect(mockRequestUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://api.example.com/v1/chat/completions',
        }),
      );
    });

    it('should return error on 404 (model not found)', async () => {
      mockRequestUrl.mockRejectedValue({ status: 404, message: 'Not found' });
      const result = await testOpenAI('sk-test', 'wrong-model', 'https://api.openai.com/v1');
      expect(result.success).toBe(false);
      expect(result.message).toContain('404');
    });
  });
});
