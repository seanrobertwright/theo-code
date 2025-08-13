# Ollama Command Implementation

This document summarizes the implementation of the new `/ollama` command for Theo Code.

## Features Implemented

1. **`/ollama list`** - Lists all available Ollama models with their sizes
2. **`/ollama model <model_name>`** - Switches to a specific Ollama model

## Files Modified

1. **`packages/cli/src/ui/commands/ollamaCommand.ts`** - New command implementation
2. **`packages/cli/src/services/BuiltinCommandLoader.ts`** - Added the new command to the loader
3. **`docs/cli/commands.md`** - Documentation for the new command
4. **`docs/cli/commands/ollama.md`** - Detailed documentation for the Ollama command

## How It Works

The command leverages the existing Ollama integration in the project:

1. Uses the `OllamaModelService` to communicate with the Ollama API
2. Checks if Ollama is accessible before performing operations
3. Lists models with their sizes in GB for better readability
4. Validates model names when switching models
5. Sets the `OLLAMA_MODEL` environment variable when switching models

## Limitations

1. The status bar model name may not update immediately after switching models. This requires a more significant architectural change to update the React state from within a command.
2. The model switch takes effect for new requests but may not be reflected in the UI until the session is restarted.

## Usage Examples

```
/ollama list
```

```
/ollama model qwen3-coder:latest
```

## Testing

The implementation has been tested with your local Ollama setup which includes 7 models:
1. mistral:latest (4.07 GB)
2. qwen3-coder:latest (17.28 GB)
3. qwen3:30b (17.28 GB)
4. devstral:latest (13.35 GB)
5. gemma3:4b (3.11 GB)
6. glm4:9b (5.08 GB)
7. codellama:13b (6.86 GB)