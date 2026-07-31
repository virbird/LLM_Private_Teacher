# AI Study Buddy

An AI learning assistant embedded directly in your Obsidian vault. It makes direct API calls to LLM providers (Anthropic Claude, OpenAI, OpenAI Compatible) and can also call LLMs via local CLI tools (Claude CLI, Pi CLI, Codex CLI, ACP, OpenCode) — no API key needed for CLI providers.

## Features

- **AI chat sidebar** inside Obsidian (or open it as a full-width tab in the main pane)
- **Bilingual UI** — English / 中文, switchable in Settings
- **Direct API calls** — no middleman, your API key stays local
- **Multiple providers** — API mode (Anthropic Claude, OpenAI, OpenAI Compatible) and CLI mode (Claude CLI, Pi CLI, Codex CLI, ACP, OpenCode)
- **CLI auto-detection** — automatically finds CLI executables in PATH, Homebrew, nvm, and other common locations
- **Compact header** — provider, model, material and role collapse into one status chip, leaving room for the conversation in narrow sidebars
- **Focused settings page** — only the active provider's configuration is shown; switch the Active Provider dropdown to configure others
- **Learning materials** — select any Markdown note as the current study material
- **Learning roles** — Private Tutor, Socratic Tutor (STEM), Language Partner (Humanities), IELTS Writing High-Score Coach
- **8 learning method commands** — `/guide`, `/quiz`, `/confuse`, `/gap`, `/predict`, `/audio`, `/feynman`, `/mock`
- **9 learning action commands** — `/flashcard`, `/summary`, `/map`, `/plan`, `/review`, `/checkup`, `/stats`, `/mistakes`, `/buddy`
- **Card management** — `/card list`, `/card edit`, `/card delete`, `/card suspend`/`resume`, `/card export`, `/card import`, `/card help`
- **Subject + topic classification** — flashcards organized by subject (e.g. `/flashcard 物理 量子力学`), review by subject
- **Cloze deletion cards** — `/flashcard cloze <subject> <topic>` generates `{{c1::...}}` fill-in-the-blank cards
- **Learning steps scheduling** — new cards go through 10min → 1d steps before graduating to SM-2 spaced repetition
- **Import/Export** — `/card export [json|apkg]` exports to CSV (Anki-compatible), JSON (full fidelity), or Anki `.apkg`; `/card import <path>` imports from any supported format
- **Spaced repetition** — SM-2 algorithm schedules flashcard reviews automatically, filter by subject/topic
- **Error notebook** — collects quiz mistakes for targeted review
- **Learning statistics** — track flashcards, reviews, quizzes, and activity streak
- **Save replies as notes** — tick AI replies (or **Select all**) and save the Q&A pairs as a Markdown note
- **File references** — `@filename` to include vault files in context
- **Image support (vision models)** — `@image.png`, `![[embeds]]`, and images in learning material are sent to vision-capable models (max 4 per message, 5 MB each)
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
2. Pick your provider in **Active Provider** — the page shows only the selected provider's settings (switch the dropdown to configure another one)
3. **API mode**: Enter your API key for the selected provider
4. **CLI mode** (Desktop only): Install a CLI tool (e.g. `claude`), leave the CLI path empty for auto-detection, then click **Test CLI** to verify. Type any model name the CLI supports in the model field.
5. Click **Test** to verify the configuration — the result includes the provider's own error message (e.g. model not activated, invalid key)
6. Open the AI Study Buddy view from the ribbon icon or the command palette (**Open chat view**). For long outputs, run **Open chat view in main pane** to get a full-width tab instead of the sidebar.

## Usage

### The header at a glance

The header is a single row: `＋` new conversation, `🕘` history, `?` help, and a **status chip** on the right showing the current **model · role · material**. Click the chip to open the quick settings panel, where provider, model, material and role live. In narrow sidebars the chip collapses to just the role icon.

### Select a learning material

- Click the status chip, then **+ Material** in the panel
- Search and pick a Markdown file from your vault
- The dropdown groups files by folder, mirroring your vault structure

### Switch learning role

Click the status chip and pick a role from the panel:

- **Private Tutor** — systematic five-step teaching loop based on your material
- **Socratic Tutor (STEM)** — asks guiding questions instead of giving direct answers
- **Language Partner (Humanities)** — vocabulary, grammar, translation, and cultural context
- **IELTS Writing High-Score Coach** — grades essays on the official four criteria (TR/CC/LR/GRA) with paragraph-level feedback, a full revision, and an action list

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
- `/flashcard cloze <subject> <topic>` — generate cloze deletion cards with `{{c1::...}}` syntax
- `/summary` — generate a summary of the current conversation
- `/map quantum mechanics` — generate a Mermaid knowledge concept map
- `/plan quantum mechanics` — generate a phased learning plan (uses chat history + material for personalization)
- `/review` — show subject tree of due cards; `/review Physics` starts reviewing; `/review 5` rates current card
- `/checkup quantum mechanics` — AI quiz with auto-grading and error notebook logging
- `/stats` — show learning statistics dashboard
- `/mistakes` — review error notebook entries
- `/buddy quantum mechanics` — enter study buddy mode (AI acts as a confused classmate)
- `/card help` — show all card management commands with detailed format
- `/card list [subject]` — list cards with ID, type, state
- `/card edit <id> q|a <text>` — edit a card's question or answer
- `/card delete <id>` — permanently remove a card
- `/card suspend <id>` / `/card resume <id>` — pause/resume a card in the review queue
- `/card export [json|apkg] [subject]` — export to CSV, JSON, or Anki `.apkg`
- `/card import <path>` — import from CSV, JSON, or `.apkg` file

### Reference files

- Type `@filename` in the input to include a vault file as context
- Right-click selected text in the editor and choose **Claudian: Quote to chat**

### Save replies as notes

- Tick the checkbox in the top-right corner of any AI reply — a bar appears at the bottom with **Select all / Save selected / Clear**
- **Select all** picks every reply in the conversation, which is the quick path for a long multi-round session (also available as **Select all AI replies in chat** in the command palette, so it works before you tick anything)
- Saved notes land in the `学习笔记/` folder (configurable in Settings) as `qa-note-<timestamp>.md`, one `## Q/A` section per selected reply
- The confirmation notice shows the full path and is clickable to open the note

### Use images with vision models

When your provider/model supports vision (e.g. GPT-4o, Claude, Qwen-VL), images are sent automatically:

- `@screenshot.png` — reference an image directly in your message
- `![[diagram.png]]` — images embedded in your **learning material** are included automatically
- Works with learning commands too: `/flashcard English Vocabulary` on an image-based material generates cards from the images
- Images from the **last 2 turns** stay in context, so follow-up questions still "see" them
- Limits: 4 images per message, 5 MB each; supported formats are png, jpg, gif, webp
- CLI providers cannot transmit images — use an API provider for vision tasks

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
2. In Settings, select the CLI provider in **Active Provider** to reveal its settings, and leave the **CLI Path** field empty — the plugin auto-detects the executable
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
