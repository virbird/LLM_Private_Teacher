# AI Study Buddy

An AI learning assistant embedded directly in your Obsidian vault. It makes direct API calls to LLM providers (Anthropic Claude, OpenAI, OpenAI Compatible) and can also call LLMs via local CLI tools (Claude CLI, Pi CLI, Codex CLI, ACP, OpenCode) — no API key needed for CLI providers.

## Features

- **AI chat sidebar** inside Obsidian
- **Bilingual UI** — English / 中文, switchable in Settings
- **Direct API calls** — no middleman, your API key stays local
- **Multiple providers** — API mode (Anthropic Claude, OpenAI, OpenAI Compatible) and CLI mode (Claude CLI, Pi CLI, Codex CLI, ACP, OpenCode)
- **CLI auto-detection** — automatically finds CLI executables in PATH, Homebrew, nvm, and other common locations
- **Learning materials** — select any Markdown note as the current study material
- **Learning roles** — Private Tutor, Socratic Tutor (STEM), Language Partner (Humanities)
- **8 learning method commands** — `/guide`, `/quiz`, `/confuse`, `/gap`, `/predict`, `/audio`, `/feynman`, `/mock`
- **9 learning action commands** — `/flashcard`, `/summary`, `/map`, `/plan`, `/review`, `/checkup`, `/stats`, `/mistakes`, `/buddy`
- **Subject + topic classification** — flashcards organized by subject (e.g. `/flashcard 物理 量子力学`), review by subject
- **Spaced repetition** — SM-2 algorithm schedules flashcard reviews automatically, filter by subject/topic
- **Error notebook** — collects quiz mistakes for targeted review
- **Learning statistics** — track flashcards, reviews, quizzes, and activity streak
- **File references** — `@filename` to include vault files in context
- **Quote to chat** — right-click selected text to quote it into AI Study Buddy
- **Inline edits** — edit, explain, translate, summarize selected text
- **Conversation history** — automatically saved

## Installation

### Community plugins (recommended)

Search "AI Study Buddy" in Obsidian Community Plugins and install.

### Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest GitHub Release
2. Create a folder `.obsidian/plugins/claudian-api/` inside your vault
3. Copy the three files into that folder
4. In Obsidian, go to Settings → Community plugins, disable Safe mode, and enable AI Study Buddy

## Setup

1. Open AI Study Buddy settings
2. **API mode**: Enter your API key for at least one provider
3. **CLI mode** (Desktop only): Install a CLI tool (e.g. `claude`), leave the CLI path empty for auto-detection, then click **Test CLI** to verify
4. (Optional) For CLI providers, type any model name the CLI supports in the model field
5. Open the AI Study Buddy view from the ribbon icon or command palette

## Usage

### Select a learning material

- Click **+ Material** in the chat header
- Search and pick a Markdown file from your vault
- The dropdown groups files by folder, mirroring your vault structure

### Switch learning role

Use the **Role** bar to choose:

- **Private Tutor** — systematic five-step teaching loop based on your material
- **Socratic Tutor (STEM)** — asks guiding questions instead of giving direct answers
- **Language Partner (Humanities)** — vocabulary, grammar, translation, and cultural context

### Use learning method commands

Type `/` in the input box to see commands. These wrap your query with a study-focused prompt:

- `/guide quantum mechanics` — structured study guide
- `/quiz quantum mechanics` — Socratic quiz
- `/confuse quantum mechanics` — multi-angle explanation of confusing concepts
- `/gap quantum mechanics` — find knowledge gaps
- `/predict quantum mechanics` — predict exam focus points
- `/audio quantum mechanics` — podcast-style dialogue
- `/feynman` — test understanding with the Feynman technique
- `/mock quantum mechanics` — practice exam

### Use learning action commands

These call AI and save results to your vault:

- `/flashcard <subject> <topic>` — generate flashcard Q&A cards (e.g. `/flashcard Physics Quantum Mechanics`), organized by subject subfolder
- `/summary` — generate a summary of the current conversation
- `/map quantum mechanics` — generate a Mermaid knowledge concept map
- `/plan quantum mechanics` — generate a phased learning plan (uses chat history + material for personalization)
- `/review` — show subject tree of due cards; `/review Physics` starts reviewing; `/review 5` rates current card
- `/checkup quantum mechanics` — AI quiz with auto-grading and error notebook logging
- `/stats` — show learning statistics dashboard
- `/mistakes` — review error notebook entries
- `/buddy quantum mechanics` — enter study buddy mode (AI acts as a confused classmate)

### Reference files

- Type `@filename` in the input to include a vault file as context
- Right-click selected text in the editor and choose **Claudian: Quote to chat**

## CLI Providers (Desktop Only)

CLI providers call LLMs via local command-line tools instead of HTTP APIs. No API key is needed — authentication is managed by the CLI itself.

| Provider | CLI command | Communication protocol |
|----------|-----------|----------------------|
| Claude CLI | `claude` | One-shot `spawn` + stream-json |
| Pi CLI | `pi` | Persistent subprocess + JSONL |
| Codex CLI | `codex` | JSON-RPC 2.0 over stdio |
| ACP | `acp` | JSON-RPC 2.0 over stdio |
| OpenCode | `opencode` | JSON-RPC 2.0 over stdio |

### Setup

1. Install the CLI tool (e.g. `npm install -g @anthropic-ai/claude-code`)
2. In Settings, leave the **CLI Path** field empty — the plugin auto-detects the executable
3. Enter any model name in the **Model** field (e.g. `claude-sonnet-4-20250514`)
4. Click **Test CLI** to verify the installation

> **Note:** CLI providers are not available on iPad. Use API providers on mobile devices.

## Development

```bash
npm install
npm run dev      # watch mode
npm run build    # production build
npm run typecheck
npm test
```

## License

MIT
