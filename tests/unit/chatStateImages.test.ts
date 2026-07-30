import { ChatState } from '../../src/features/chat/state/ChatState';
import type { ContentPart } from '../../src/core/types/chat';

function makeState(): ChatState {
  return new ChatState({
    onMessagesChanged: () => { /* noop */ },
    onStreamingChanged: () => { /* noop */ },
    onUsageChanged: () => { /* noop */ },
  });
}

const img = (data: string): ContentPart => ({
  type: 'image',
  source: { type: 'base64', media_type: 'image/png', data },
});

describe('ChatState image attachments', () => {
  it('attaches and retrieves images by message id', () => {
    const state = makeState();
    const msg = state.addUserMessage('grade this');
    state.attachImages(msg.id, [img('AAAA')]);

    const retrieved = state.getImages(msg.id);
    expect(retrieved).toHaveLength(1);
    expect((retrieved![0] as Extract<ContentPart, { type: 'image' }>).source.data).toBe('AAAA');
  });

  it('does not store empty attachment arrays', () => {
    const state = makeState();
    const msg = state.addUserMessage('no images');
    state.attachImages(msg.id, []);
    expect(state.getImages(msg.id)).toBeUndefined();
    expect(state.hasImages()).toBe(false);
  });

  it('hasImages reflects attachment presence', () => {
    const state = makeState();
    expect(state.hasImages()).toBe(false);
    const msg = state.addUserMessage('with image');
    state.attachImages(msg.id, [img('BBBB')]);
    expect(state.hasImages()).toBe(true);
  });

  it('returns undefined for unknown message ids', () => {
    const state = makeState();
    expect(state.getImages('nonexistent')).toBeUndefined();
  });

  it('keeps attachments across multiple messages', () => {
    const state = makeState();
    const m1 = state.addUserMessage('first');
    state.attachImages(m1.id, [img('IMG1')]);
    const m2 = state.addUserMessage('second');
    state.attachImages(m2.id, [img('IMG2')]);

    expect(state.getImages(m1.id)).toHaveLength(1);
    expect(state.getImages(m2.id)).toHaveLength(1);
  });

  it('clear() removes all attachments', () => {
    const state = makeState();
    const msg = state.addUserMessage('with image');
    state.attachImages(msg.id, [img('CCCC')]);
    state.clear();
    expect(state.hasImages()).toBe(false);
    expect(state.getImages(msg.id)).toBeUndefined();
  });

  it('compressMessages drops attachments for evicted messages', () => {
    const state = makeState();
    const old = state.addUserMessage('old turn');
    state.attachImages(old.id, [img('OLD')]);
    const kept = state.addUserMessage('kept turn');
    state.attachImages(kept.id, [img('KEPT')]);

    state.compressMessages('summary text', [kept]);

    expect(state.getImages(old.id)).toBeUndefined();
    expect(state.getImages(kept.id)).toHaveLength(1);
  });
});
