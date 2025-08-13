# Ollama Test Scripts

These scripts demonstrate how to interact with your local Ollama server using the existing Theo Code Ollama integration.

## Prerequisites

1. Make sure Ollama is installed and running on your system
2. Have at least one model pulled (e.g., `ollama pull llama3`)

## Usage

### Automated Test Script

Run the automated test script:
```bash
npm test
```

This will:
1. Check if Ollama is accessible
2. List all available models
3. Use the first model to generate a short response to a test prompt

### Interactive Script

Run the interactive script:
```bash
npm run interactive
```

This will:
1. Check if Ollama is accessible
2. List all available models and let you choose one
3. Allow you to enter a custom prompt
4. Generate a response using the selected model
5. Optionally repeat the process with another prompt

### Programmatic Interface

Run the programmatic interface script:
```bash
npm run interface
```

This script demonstrates how to use the `OllamaInterface` class programmatically. It also serves as an example of how you could integrate Ollama into other parts of your project.

## Environment Variables

You can customize the Ollama connection with these environment variables:

- `OLLAMA_HOST`: Override the default Ollama host (default: http://localhost:11434)
- `OLLAMA_MODEL`: Set a specific model to use (default: qwen3-coder-plus)

Example:
```bash
OLLAMA_HOST=http://localhost:11434 npm test
```

## Programmatic Usage

You can also use the `OllamaInterface` class directly in your own scripts:

```javascript
import { OllamaInterface } from './ollama-interface.js';

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