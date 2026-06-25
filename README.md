# Claudian API

An AI learning assistant embedded directly in your Obsidian vault. Claudian makes direct API calls to LLM providers (Anthropic Claude, OpenAI, OpenAI Compatible) so it works on Desktop and iPad.

## Features

- **AI chat sidebar** inside Obsidian
- **Direct API calls** — no middleman, your API key stays local
- **Multiple providers** — Anthropic Claude, OpenAI, OpenAI Compatible (DeepSeek, Qwen, Moonshot, etc.)
- **Learning materials** — select any Markdown note as the current study material
- **Learning roles** — Private Tutor, Socratic Tutor (STEM), Language Partner (Humanities)
- **Learning commands** — `/guide`, `/quiz`, `/confuse`, `/gap`, `/predict`, `/audio`, `/feynman`, `/mock`
- **File references** — `@filename` to include vault files in context
- **Quote to chat** — right-click selected text to quote it into Claudian
- **Inline edits** — edit, explain, translate, summarize selected text
- **Conversation history** — automatically saved

## Installation

### Community plugins (recommended)

Search "Claudian API" in Obsidian Community Plugins and install.

### Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest GitHub Release
2. Create a folder `.obsidian/plugins/claudian-api/` inside your vault
3. Copy the three files into that folder
4. In Obsidian, go to Settings → Community plugins, disable Safe mode, and enable Claudian API

## Setup

1. Open Claudian API settings
2. Enter your API key for at least one provider
3. (Optional) Add custom models for OpenAI Compatible providers
4. Open the Claudian view from the ribbon icon or command palette

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

### Use learning commands

Type `/` in the input box to see commands. Examples:

- `/guide quantum mechanics` — structured study guide
- `/quiz quantum mechanics` — Socratic quiz
- `/confuse quantum mechanics` — multi-angle explanation of confusing concepts
- `/gap quantum mechanics` — find knowledge gaps
- `/predict quantum mechanics` — predict exam focus points
- `/audio quantum mechanics` — podcast-style dialogue
- `/feynman` — test understanding with the Feynman technique
- `/mock quantum mechanics` — practice exam

### Reference files

- Type `@filename` in the input to include a vault file as context
- Right-click selected text in the editor and choose **Claudian: Quote to chat**

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
