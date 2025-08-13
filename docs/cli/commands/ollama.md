# Ollama Command

The `/ollama` command allows you to manage your local Ollama models directly from the Theo Code interface.

## Usage

### List Available Models

```
/ollama list
```

This command will display a list of all available Ollama models along with their sizes.

### Switch to a Specific Model

```
/ollama model <model_name>
```

This command allows you to switch to a specific Ollama model. Note that you must be using Ollama authentication to use this command.

## Examples

```
/ollama list
```

Output:
```
Available Ollama models:
1. mistral:latest (4.07 GB)
2. qwen3-coder:latest (17.28 GB)
3. qwen3:30b (17.28 GB)
```

```
/ollama model qwen3-coder:latest
```

Output:
```
Switched to Ollama model: qwen3-coder:latest
Note: You may need to restart the session for the change to take effect in the status bar.
```

## Requirements

1. Ollama must be installed and running on your system
2. You must have at least one model pulled (e.g., `ollama pull llama3`)
3. You must be using Ollama authentication in Theo Code

## Notes

- The model switch will take effect immediately for new requests
- The status bar model name may not update until you restart the session
- If you specify a model that doesn't exist, the command will show a list of available models