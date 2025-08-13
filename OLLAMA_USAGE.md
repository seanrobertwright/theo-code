# Using Ollama with Theo Code

This document explains how to use local Ollama models with your Theo Code project.

## Prerequisites

1. Install Ollama from https://ollama.com/
2. Pull at least one model (e.g., `ollama pull llama3`)

## Available Models

Your Ollama server currently has these models available:
1. mistral:latest (4.07 GB)
2. qwen3-coder:latest (17.28 GB)
3. qwen3:30b (17.28 GB)
4. devstral:latest (13.35 GB)
5. gemma3:4b (3.11 GB)
6. glm4:9b (5.08 GB)
7. codellama:13b (6.86 GB)

## Using Ollama with Theo Code

You can use Ollama models with Theo Code in several ways:

### 1. Through the Auth Dialog

When you run `theo`, you can select "Ollama" from the authentication options. The application will automatically detect available models and let you choose which one to use.

### 2. Environment Variables

You can set these environment variables to configure Ollama:

```bash
export THEO_AUTH_TYPE="ollama"
export OLLAMA_MODEL="qwen3-coder:latest"  # Optional, defaults to qwen3-coder-plus
export OLLAMA_HOST="http://localhost:11434"  # Optional, defaults to http://localhost:11434
```

### 3. Programmatic Usage

You can use the Ollama integration programmatically in your own scripts:

```javascript
import { OllamaInterface } from './scripts/ollama-interface.js';

const ollama = new OllamaInterface();

// Check if Ollama is accessible
const isAccessible = await ollama.isOllamaAccessible();

// List models
const models = await ollama.listModels();

// Generate content
const response = await ollama.generateContent(
  'mistral:latest', 
  'Explain quantum computing in simple terms'
);
```

## Test Scripts

The `scripts` directory contains several test scripts to help you interact with your Ollama models:

1. `npm test` - Automated test that checks connectivity and generates a simple response
2. `npm run interactive` - Interactive script that lets you choose models and enter custom prompts
3. `npm run interface` - Programmatic interface demonstration

## Troubleshooting

If you encounter issues:

1. Make sure Ollama is running: `ollama serve`
2. Check that you have at least one model pulled: `ollama list`
3. Verify the OLLAMA_HOST environment variable if using a custom host
4. Check the Ollama logs for any errors