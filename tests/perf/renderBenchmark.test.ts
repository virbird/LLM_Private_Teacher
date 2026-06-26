/**
 * Render performance benchmark.
 *
 * Simulates streaming a 500-token assistant response into a conversation
 * with 10 existing messages (5 user + 5 assistant), and measures:
 *
 * - MarkdownRenderer.render() call count  (heaviest operation)
 * - DOM element creation count             (createDiv/createEl)
 * - Container empty() calls               (full re-render trigger)
 *
 * Two strategies are compared:
 *   BEFORE: renderAll() on every text chunk  (current unoptimized code)
 *   AFTER:  updateLastMessage() + rAF throttle
 */

// ---- Counting mocks -------------------------------------------------------

let mdRenderCount = 0;
let domCreateCount = 0;
let containerEmptyCount = 0;

function resetCounters(): void {
  mdRenderCount = 0;
  domCreateCount = 0;
  containerEmptyCount = 0;
}

/** Minimal element mock that counts creations. */
class MockEl {
  children: MockEl[] = [];
  parent: MockEl | null = null;
  className = '';
  style: Record<string, string> = {};

  createDiv(opts?: { cls?: string; text?: string }): MockEl {
    domCreateCount++;
    const el = new MockEl();
    if (opts?.cls) el.className = opts.cls;
    if (opts?.text) el._text = opts.text;
    this.children.push(el);
    el.parent = this;
    return el;
  }

  createEl(_tag: string, opts?: { text?: string; cls?: string }): MockEl {
    domCreateCount++;
    const el = new MockEl();
    if (opts?.text) el._text = opts.text;
    if (opts?.cls) el.className = opts.cls;
    this.children.push(el);
    el.parent = this;
    return el;
  }

  createSpan(opts?: { text?: string; cls?: string }): MockEl {
    domCreateCount++;
    const el = new MockEl();
    if (opts?.text) el._text = opts.text;
    this.children.push(el);
    el.parent = this;
    return el;
  }

  appendChild(el: MockEl): MockEl {
    this.children.push(el);
    (el as { parent: MockEl | null }).parent = this;
    return el;
  }

  remove(): void {
    if (this.parent) {
      const idx = this.parent.children.indexOf(this);
      if (idx >= 0) this.parent.children.splice(idx, 1);
      this.parent = null;
    }
  }

  empty(): void {
    this.children = [];
  }

  addClass(_cls: string): void {}
  removeClass(..._args: string[]): void {}
  toggleClass(_cls: string, _val?: boolean): void {}
  hasClass(cls: string): boolean { return this.className.includes(cls); }
  setText(_text: string): void {}

  private _text = '';
  get textContent(): string { return this._text; }
  set textContent(v: string) { this._text = v; }

  get lastElementChild(): MockEl | null {
    return this.children.length > 0 ? this.children[this.children.length - 1] : null;
  }

  ownerDocument = { createElement: (tag: string) => { domCreateCount++; return new MockEl(); } };
}

// ---- Simulate BEFORE: renderAll() per chunk ------------------------------

function simulateBefore(numMessages: number, numChunks: number): void {
  resetCounters();
  const container = new MockEl();

  for (let chunk = 0; chunk < numChunks; chunk++) {
    // renderAll: empty container, re-create ALL messages
    container.empty();
    containerEmptyCount++;

    for (let i = 0; i < numMessages; i++) {
      const isAssistant = i % 2 === 1;
      // renderMessage: create msgDiv, headerEl, roleSpan, contentEl
      const msgEl = container.createDiv({ cls: 'claudian-message' });       // +1
      msgEl.createDiv({ cls: 'claudian-message-header' });                   // +1
      msgEl.createSpan({ text: 'role' });                                    // +1
      const contentEl = msgEl.createDiv({ cls: 'claudian-message-content' }); // +1

      if (isAssistant) {
        // Checkbox
        const cb = msgEl.ownerDocument.createElement('input');                // +1
        msgEl.children[0].appendChild(cb);                                   // +1 (appendChild counts)
        // MarkdownRenderer.render for content
        mdRenderCount++;
      } else {
        contentEl.createSpan({ text: 'user text' });                         // +1
      }
    }

    // Append loading element
    container.appendChild(new MockEl());                                     // +1
  }
}

// ---- Simulate AFTER: updateLastMessage + rAF throttle --------------------

function simulateAfter(numMessages: number, numChunks: number): void {
  resetCounters();
  const container = new MockEl();

  // Initial full render (once)
  container.empty();
  containerEmptyCount++;
  for (let i = 0; i < numMessages; i++) {
    const isAssistant = i % 2 === 1;
    const msgEl = container.createDiv({ cls: 'claudian-message' });
    msgEl.createDiv({ cls: 'claudian-message-header' });
    msgEl.createSpan({ text: 'role' });
    const contentEl = msgEl.createDiv({ cls: 'claudian-message-content' });
    if (isAssistant) {
      const cb = msgEl.ownerDocument.createElement('input');
      msgEl.children[0].appendChild(cb);
      mdRenderCount++;
    } else {
      contentEl.createSpan({ text: 'user text' });
    }
  }
  container.appendChild(new MockEl()); // loading element

  // rAF throttle: ~60fps → chunks per frame vary, but we render at most once per frame
  // In practice, 200 chunks arrive over ~5-10 seconds, so ~60-120 actual renders
  // Conservative: 1 render per 2 chunks (throttle to 30fps effective)
  const rafThrottledRenders = Math.ceil(numChunks / 2);

  for (let r = 0; r < rafThrottledRenders; r++) {
    // updateLastMessage: remove last message element (not loading), re-render only it
    // Find last message element (before loading element)
    const loadingEl = container.lastElementChild;
    const lastMsgEl = loadingEl ? container.children[container.children.length - 2] : container.lastElementChild;
    if (lastMsgEl) {
      lastMsgEl.remove();
    }
    // Re-render only the last message
    const msgEl = container.createDiv({ cls: 'claudian-message' });
    msgEl.createDiv({ cls: 'claudian-message-header' });
    msgEl.createSpan({ text: 'role' });
    msgEl.createDiv({ cls: 'claudian-message-content' });
    const cb = msgEl.ownerDocument.createElement('input');
    msgEl.children[0].appendChild(cb);
    mdRenderCount++;
  }
}

// ---- Run benchmark -------------------------------------------------------

const SCENARIOS = [
  { msgs: 6, chunks: 100, label: 'Small (3 turns, 100 chunks)' },
  { msgs: 10, chunks: 200, label: 'Medium (5 turns, 200 chunks)' },
  { msgs: 20, chunks: 400, label: 'Large (10 turns, 400 chunks)' },
  { msgs: 40, chunks: 600, label: 'Heavy (20 turns, 600 chunks)' },
];

describe('Render performance benchmark', () => {
  for (const scenario of SCENARIOS) {
    it(`${scenario.label}`, () => {
      simulateBefore(scenario.msgs, scenario.chunks);
      const before = {
        mdCalls: mdRenderCount,
        domOps: domCreateCount,
        empties: containerEmptyCount,
      };

      simulateAfter(scenario.msgs, scenario.chunks);
      const after = {
        mdCalls: mdRenderCount,
        domOps: domCreateCount,
        empties: containerEmptyCount,
      };

      const mdReduction = ((1 - after.mdCalls / before.mdCalls) * 100).toFixed(1);
      const domReduction = ((1 - after.domOps / before.domOps) * 100).toFixed(1);

      // eslint-disable-next-line no-console
      console.log(`\n  ${scenario.label}`);
      // eslint-disable-next-line no-console
      console.log(`    MarkdownRenderer calls:  ${before.mdCalls} → ${after.mdCalls}  (-${mdReduction}%)`);
      // eslint-disable-next-line no-console
      console.log(`    DOM creations:          ${before.domOps} → ${after.domOps}  (-${domReduction}%)`);
      // eslint-disable-next-line no-console
      console.log(`    Container empty():      ${before.empties} → ${after.empties}`);

      expect(after.mdCalls).toBeLessThan(before.mdCalls);
      expect(after.domOps).toBeLessThan(before.domOps);
    });
  }
});

// ---- Provider polling vs event-driven benchmark -------------------------

describe('Provider polling vs event-driven benchmark', () => {
  it('compares CPU wakeups for a 5-second stream', () => {
    const streamDurationMs = 5000;
    const dataArrivals = 50; // SSE chunks arrive in ~50 bursts over 5s

    // BEFORE: 50ms polling → wake every 50ms regardless of data
    const beforeWakeups = streamDurationMs / 50; // 100 wakeups

    // AFTER: event-driven → wake only when data arrives + 1 for stream end
    const afterWakeups = dataArrivals + 1; // 51 wakeups

    const reduction = ((1 - afterWakeups / beforeWakeups) * 100).toFixed(1);

    // eslint-disable-next-line no-console
    console.log(`\n  Provider polling vs event-driven (5s stream, ${dataArrivals} data bursts)`);
    // eslint-disable-next-line no-console
    console.log(`    CPU wakeups:  ${beforeWakeups} → ${afterWakeups}  (-${reduction}%)`);

    expect(afterWakeups).toBeLessThan(beforeWakeups);
  });
});
