/**
 * Image reference resolution for multimodal chat.
 * Extracts image references from user input (@mention) and markdown content
 * (![[wiki embeds]] and ![](markdown images)), reads them as base64 ContentParts.
 */
import type { ContentPart } from '../core/types/chat';

const IMAGE_EXTENSIONS: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

/** Max number of images per message (avoid oversized requests) */
export const MAX_IMAGES_PER_MESSAGE = 4;
/** Max size per image in bytes (5 MB) */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Returns the MIME type if the path has an image extension, otherwise null */
export function imageMimeType(path: string): string | null {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return IMAGE_EXTENSIONS[ext] ?? null;
}

/** Returns true if the path points to a supported image file */
export function isImagePath(path: string): boolean {
  return imageMimeType(path) !== null;
}

/**
 * Extract image file references from text:
 * - @mentions: @image.png
 * - Obsidian wiki embeds: ![[image.png]] or ![[image.png|alt]]
 * - Markdown images: ![alt](image.png)
 * Returns deduplicated list of link paths (unresolved).
 */
export function extractImageRefs(text: string): string[] {
  const refs = new Set<string>();

  // @mentions
  const mentionRegex = /@([^\s@]+)/g;
  let m;
  while ((m = mentionRegex.exec(text)) !== null) {
    if (isImagePath(m[1])) refs.add(m[1]);
  }

  // Obsidian wiki embeds ![[path]] or ![[path|alias]]
  const wikiRegex = /!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;
  while ((m = wikiRegex.exec(text)) !== null) {
    const p = m[1].trim();
    if (isImagePath(p)) refs.add(p);
  }

  // Markdown images ![alt](path) — skip http(s) URLs
  const mdRegex = /!\[[^\]]*\]\(([^)]+)\)/g;
  while ((m = mdRegex.exec(text)) !== null) {
    const p = decodeURIComponent(m[1].trim());
    if (!/^https?:\/\//i.test(p) && isImagePath(p)) refs.add(p);
  }

  return [...refs];
}

/** Convert an ArrayBuffer to base64 (chunked to avoid stack overflow on large files) */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/** Adapter for resolving and reading image files from the vault */
export interface ImageReadAdapter {
  /** Resolve a link path (possibly relative/short) to a full vault path, or null */
  resolveLink(linkpath: string): string | null;
  /** Read a file as binary by full vault path, or null if unreadable */
  readBinary(fullPath: string): Promise<ArrayBuffer | null>;
}

/**
 * Resolve image references in text to base64 image ContentParts.
 * Skips unresolvable/oversized images. Caps at MAX_IMAGES_PER_MESSAGE.
 */
export async function resolveImageParts(text: string, adapter: ImageReadAdapter): Promise<ContentPart[]> {
  const refs = extractImageRefs(text);
  const parts: ContentPart[] = [];

  for (const ref of refs) {
    if (parts.length >= MAX_IMAGES_PER_MESSAGE) break;

    const fullPath = adapter.resolveLink(ref);
    if (!fullPath) continue;

    const mediaType = imageMimeType(fullPath);
    if (!mediaType) continue;

    const buffer = await adapter.readBinary(fullPath);
    if (!buffer || buffer.byteLength === 0 || buffer.byteLength > MAX_IMAGE_BYTES) continue;

    parts.push({
      type: 'image',
      source: { type: 'base64', media_type: mediaType, data: arrayBufferToBase64(buffer) },
    });
  }

  return parts;
}
