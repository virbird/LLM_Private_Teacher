/**
 * Resolves @file mentions in text by reading file contents and appending as context.
 * Returns the original text with file contents appended in <referenced_files> tags.
 */
export interface FileReadAdapter {
  getAbstractFileByPath(path: string): unknown | null;
  read(file: unknown): Promise<string>;
}

export async function resolveMentions(text: string, vault: FileReadAdapter): Promise<string> {
  const mentionRegex = /@([^\s@]+)/g;
  let match;
  const contexts: string[] = [];

  while ((match = mentionRegex.exec(text)) !== null) {
    const filePath = match[1];
    const file = vault.getAbstractFileByPath(filePath);
    if (file && !('children' in (file as Record<string, unknown>))) {
      try {
        const content = await vault.read(file);
        const truncated = content.length > 4000
          ? content.substring(0, 4000) + '\n...(truncated)'
          : content;
        contexts.push(`\n--- File: ${filePath} ---\n${truncated}\n--- End of ${filePath} ---`);
      } catch {
        // skip unreadable files
      }
    }
  }

  if (contexts.length === 0) return text;
  return text + '\n\n<referenced_files>' + contexts.join('\n') + '\n</referenced_files>';
}

export function extractMentions(text: string): string[] {
  const mentionRegex = /@([^\s@]+)/g;
  const mentions: string[] = [];
  let match;
  while ((match = mentionRegex.exec(text)) !== null) {
    mentions.push(match[1]);
  }
  return mentions;
}

export function isSlashCommand(text: string): boolean {
  return text.trim().startsWith('/');
}

export function parseSlashCommand(text: string): { cmd: string; args: string } {
  const trimmed = text.trim();
  const spaceIdx = trimmed.indexOf(' ');
  if (spaceIdx === -1) {
    return { cmd: trimmed.toLowerCase(), args: '' };
  }
  return {
    cmd: trimmed.substring(0, spaceIdx).toLowerCase(),
    args: trimmed.substring(spaceIdx + 1),
  };
}
