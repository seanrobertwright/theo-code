# theo-code

**Universal TUI Agent CLI** - A model-agnostic AI coding assistant for your terminal.

## Features

- 🤖 **Multi-Model Support** - OpenAI, Anthropic, Google Gemini, and local LLMs via Ollama
- 🖥️ **Rich Terminal UI** - Built with React Ink for a beautiful, responsive interface
- 🔧 **Native Tool Calling** - File operations, search, and more
- 💾 **Session Persistence** - Save and resume conversations
- 🔒 **Secure by Design** - Sandboxed execution with human-in-the-loop confirmations

## Installation

```bash
npm install -g theo-code
```

## Quick Start

1. **Initialize configuration:**
   ```bash
   theo-code init
   ```

2. **Set your API key:**
   ```bash
   export OPENAI_API_KEY=sk-...
   ```

3. **Start the CLI:**
   ```bash
   theo-code
   ```

## Commands

| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/new` | Start a new session |
| `/add @path` | Add file/directory to context |
| `/drop @path` | Remove file from context |
| `/map [depth]` | Show directory tree |
| `/exit` | Exit the application |

## Configuration

### Global Config (`~/.theo-code/config.yaml`)

```yaml
defaultProvider: openai
defaultModel: gpt-4o

session:
  autoSaveInterval: 30000
  maxSessions: 50

editor:
  theme: dark
  syntaxHighlighting: true
```

### Project Config (`.agentrc`)

```yaml
model: gpt-4o
contextFiles:
  - src/
  - README.md
ignore:
  - node_modules/
  - dist/
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `GOOGLE_API_KEY` | Google AI API key |
| `THEO_CODE_MODEL` | Override default model |
| `THEO_CODE_SAFE_MODE` | Force confirmation for all operations |

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

## License

MIT

---

# Original theo-code