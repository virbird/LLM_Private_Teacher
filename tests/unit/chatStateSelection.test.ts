import { ChatState } from '../../src/features/chat/state/ChatState';

function makeState(): ChatState {
  return new ChatState({
    onMessagesChanged: () => { /* noop */ },
    onStreamingChanged: () => { /* noop */ },
    onUsageChanged: () => { /* noop */ },
  });
}

/** Build a conversation of N completed rounds (user + assistant each) */
function seedRounds(state: ChatState, rounds: number): void {
  for (let i = 0; i < rounds; i++) {
    state.addUserMessage(`question ${i}`);
    const assistant = state.startAssistantMessage();
    assistant.content = `answer ${i}`;
  }
}

describe('ChatState.selectAll', () => {
  it('selects every assistant reply across multiple rounds', () => {
    const state = makeState();
    seedRounds(state, 4);

    state.selectAll();

    expect(state.getSelectedCount()).toBe(4);
    // Only assistant messages are selectable — user messages stay unselected
    const assistantIds = state.messages.filter(m => m.role === 'assistant').map(m => m.id);
    for (const id of assistantIds) {
      expect(state.selectedMessageIds.has(id)).toBe(true);
    }
    const userIds = state.messages.filter(m => m.role === 'user').map(m => m.id);
    for (const id of userIds) {
      expect(state.selectedMessageIds.has(id)).toBe(false);
    }
  });

  it('skips an assistant message that has no content yet (still streaming)', () => {
    const state = makeState();
    seedRounds(state, 2);
    state.addUserMessage('question 2');
    state.startAssistantMessage(); // empty content — not saveable

    expect(state.getSelectableIds()).toHaveLength(2);
    state.selectAll();
    expect(state.getSelectedCount()).toBe(2);
  });

  it('is idempotent and preserves an existing manual selection', () => {
    const state = makeState();
    seedRounds(state, 3);
    const firstAssistant = state.messages.find(m => m.role === 'assistant')!;

    state.toggleSelection(firstAssistant.id);
    expect(state.getSelectedCount()).toBe(1);

    state.selectAll();
    state.selectAll();
    expect(state.getSelectedCount()).toBe(3);
  });

  it('selects nothing on an empty conversation', () => {
    const state = makeState();
    expect(state.getSelectableIds()).toEqual([]);
    state.selectAll();
    expect(state.getSelectedCount()).toBe(0);
  });

  it('clearSelection resets a full selection', () => {
    const state = makeState();
    seedRounds(state, 3);
    state.selectAll();
    state.clearSelection();
    expect(state.getSelectedCount()).toBe(0);
  });
});
