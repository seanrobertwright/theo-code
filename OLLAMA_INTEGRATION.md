# Ollama Integration Testing

## Prerequisites

1. Install Ollama from https://ollama.com/
2. Pull at least one model:
   ```bash
   ollama pull llama3
   # or
   ollama pull mistral
   ```

## Testing the Feature

1. Start Ollama service (it should start automatically when installed)
2. Run the Theo Code application:
   ```bash
   node bundle/gemini.js
   ```
3. When the AuthDialog appears, select "Ollama" as the authentication method
4. The application should fetch the list of available models from Ollama
5. Select a model from the list
6. The application should initialize with the selected Ollama model

## Environment Variables

- `OLLAMA_HOST` - Override the default Ollama host (default: http://localhost:11434)
- `OLLAMA_MODEL` - Set the Ollama model to use (set automatically when selected in the UI)