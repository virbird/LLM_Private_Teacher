import {
  imageMimeType, isImagePath, extractImageRefs, arrayBufferToBase64,
  resolveImageParts, MAX_IMAGES_PER_MESSAGE, MAX_IMAGE_BYTES,
  type ImageReadAdapter,
} from '../../src/utils/imageResolver';
import { toOpenAIUserContent } from '../../src/core/providers/contentConverter';
import type { ContentPart } from '../../src/core/types/chat';

describe('imageMimeType / isImagePath', () => {
  it('maps known extensions', () => {
    expect(imageMimeType('a.png')).toBe('image/png');
    expect(imageMimeType('a.jpg')).toBe('image/jpeg');
    expect(imageMimeType('a.JPEG')).toBe('image/jpeg');
    expect(imageMimeType('a.gif')).toBe('image/gif');
    expect(imageMimeType('a.webp')).toBe('image/webp');
  });

  it('returns null for non-images', () => {
    expect(imageMimeType('a.md')).toBeNull();
    expect(imageMimeType('a.pdf')).toBeNull();
    expect(imageMimeType('noext')).toBeNull();
  });

  it('isImagePath works with paths', () => {
    expect(isImagePath('folder/pic.png')).toBe(true);
    expect(isImagePath('folder/note.md')).toBe(false);
  });
});

describe('extractImageRefs', () => {
  it('extracts @mentions of images only', () => {
    const refs = extractImageRefs('look at @pic.png and @note.md');
    expect(refs).toEqual(['pic.png']);
  });

  it('extracts wiki embeds', () => {
    const refs = extractImageRefs('content ![[zuowen-01 1.png]] more');
    expect(refs).toEqual(['zuowen-01 1.png']);
  });

  it('extracts wiki embeds with alias', () => {
    const refs = extractImageRefs('![[timu-01.jpg|题目]]');
    expect(refs).toEqual(['timu-01.jpg']);
  });

  it('extracts markdown images, skipping URLs', () => {
    const refs = extractImageRefs('![alt](local.png) ![web](https://x.com/a.png)');
    expect(refs).toEqual(['local.png']);
  });

  it('decodes URL-encoded markdown paths', () => {
    const refs = extractImageRefs('![](my%20pic.png)');
    expect(refs).toEqual(['my pic.png']);
  });

  it('deduplicates', () => {
    const refs = extractImageRefs('@a.png ![[a.png]] ![x](a.png)');
    expect(refs).toEqual(['a.png']);
  });

  it('returns empty for plain text', () => {
    expect(extractImageRefs('no images here')).toEqual([]);
  });
});

describe('arrayBufferToBase64', () => {
  it('encodes small buffers', () => {
    const buf = new TextEncoder().encode('hello').buffer;
    expect(arrayBufferToBase64(buf as ArrayBuffer)).toBe(btoa('hello'));
  });

  it('encodes large buffers without stack overflow', () => {
    const big = new Uint8Array(200000).fill(65); // 'A' x 200k
    const b64 = arrayBufferToBase64(big.buffer);
    expect(b64.length).toBeGreaterThan(0);
    expect(atob(b64).length).toBe(200000);
  });
});

describe('resolveImageParts', () => {
  function makeAdapter(files: Record<string, ArrayBuffer | null>): ImageReadAdapter {
    return {
      resolveLink: (p) => (p in files ? p : null),
      readBinary: async (p) => files[p] ?? null,
    };
  }

  const smallPng = new Uint8Array([137, 80, 78, 71]).buffer;

  it('resolves image refs to content parts', async () => {
    const adapter = makeAdapter({ 'pic.png': smallPng });
    const parts = await resolveImageParts('see @pic.png', adapter);
    expect(parts).toHaveLength(1);
    expect(parts[0].type).toBe('image');
    const img = parts[0] as Extract<ContentPart, { type: 'image' }>;
    expect(img.source.media_type).toBe('image/png');
    expect(img.source.data).toBe(arrayBufferToBase64(smallPng));
  });

  it('skips unresolvable refs', async () => {
    const adapter = makeAdapter({});
    const parts = await resolveImageParts('@missing.png', adapter);
    expect(parts).toHaveLength(0);
  });

  it('skips oversized images', async () => {
    const huge = new ArrayBuffer(MAX_IMAGE_BYTES + 1);
    const adapter = makeAdapter({ 'big.png': huge });
    const parts = await resolveImageParts('@big.png', adapter);
    expect(parts).toHaveLength(0);
  });

  it('caps at MAX_IMAGES_PER_MESSAGE', async () => {
    const files: Record<string, ArrayBuffer> = {};
    let text = '';
    for (let i = 0; i < MAX_IMAGES_PER_MESSAGE + 3; i++) {
      files[`p${i}.png`] = smallPng;
      text += ` @p${i}.png`;
    }
    const adapter = makeAdapter(files);
    const parts = await resolveImageParts(text, adapter);
    expect(parts).toHaveLength(MAX_IMAGES_PER_MESSAGE);
  });

  it('resolves embeds from material content', async () => {
    const adapter = makeAdapter({ 'zuowen-01 1.png': smallPng, 'timu-01.jpg': smallPng });
    const material = '<learning_material>\n![[timu-01.jpg]]\n![[zuowen-01 1.png]]\n</learning_material>';
    const parts = await resolveImageParts(material, adapter);
    expect(parts).toHaveLength(2);
  });
});

describe('toOpenAIUserContent', () => {
  it('converts text parts', () => {
    const parts: ContentPart[] = [{ type: 'text', text: 'hello' }];
    expect(toOpenAIUserContent(parts)).toEqual([{ type: 'text', text: 'hello' }]);
  });

  it('converts image parts to image_url data URI', () => {
    const parts: ContentPart[] = [
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
    ];
    expect(toOpenAIUserContent(parts)).toEqual([
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
    ]);
  });

  it('converts mixed content preserving order', () => {
    const parts: ContentPart[] = [
      { type: 'text', text: 'grade this' },
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'BBBB' } },
    ];
    const result = toOpenAIUserContent(parts);
    expect(result).toHaveLength(2);
    expect((result[0] as { type: string }).type).toBe('text');
    expect((result[1] as { type: string }).type).toBe('image_url');
  });
});
