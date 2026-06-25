import type { Conversation } from '../types/chat';
import type { VaultStorage } from './VaultStorage';

export interface ConversationMeta {
  id: string;
  title: string;
  providerId: string;
  model: string;
  createdAt: number;
  updatedAt: number;
}

export class SessionStorage {
  constructor(private storage: VaultStorage) {}

  async save(conversation: Conversation): Promise<void> {
    const meta: ConversationMeta = {
      id: conversation.id,
      title: conversation.title,
      providerId: conversation.providerId,
      model: conversation.model,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };
    await this.storage.writeJson(`sessions/${conversation.id}.meta.json`, meta);
    await this.storage.writeJson(`sessions/${conversation.id}.json`, conversation);
  }

  async load(id: string): Promise<Conversation | null> {
    return this.storage.readJson<Conversation>(`sessions/${id}.json`);
  }

  async delete(id: string): Promise<void> {
    await this.storage.delete(`sessions/${id}.meta.json`);
    await this.storage.delete(`sessions/${id}.json`);
  }

  async listAll(): Promise<ConversationMeta[]> {
    const files = await this.storage.listFiles('sessions');
    const metaFiles = files.filter(f => f.endsWith('.meta.json'));
    const metas: ConversationMeta[] = [];
    for (const file of metaFiles) {
      const meta = await this.storage.readJson<ConversationMeta>(`sessions/${file}`);
      if (meta) metas.push(meta);
    }
    return metas.sort((a, b) => b.updatedAt - a.updatedAt);
  }
}
