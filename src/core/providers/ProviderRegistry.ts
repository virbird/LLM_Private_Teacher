import type { LlmProvider } from './LlmProvider';
import type { ProviderId } from '../types/provider';

export class ProviderRegistry {
  private static providers = new Map<ProviderId, LlmProvider>();

  static register(provider: LlmProvider): void {
    this.providers.set(provider.id, provider);
  }

  static get(id: ProviderId): LlmProvider | undefined {
    return this.providers.get(id);
  }

  static getOrThrow(id: ProviderId): LlmProvider {
    const provider = this.providers.get(id);
    if (!provider) throw new Error(`Provider "${id}" not registered`);
    return provider;
  }

  static getAll(): LlmProvider[] {
    return Array.from(this.providers.values());
  }

  static clear(): void {
    this.providers.clear();
  }
}
