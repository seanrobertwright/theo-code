# Ollama Model Selection Feature Implementation

## Overview

This implementation adds interactive model selection for Ollama users. When a user selects "Ollama" as their authentication method, the application will:

1. Check if Ollama is accessible
2. Fetch the list of available models
3. Display the models in a selectable list
4. Set the selected model as the active model for the session

## Key Components

### 1. OllamaModelService (`packages/core/src/ollama/ollamaModelService.ts`)

A new service that handles communication with the Ollama API:

- `listModels()`: Fetches available models from Ollama
- `isOllamaAccessible()`: Checks if Ollama is running and accessible
- Proper error handling for network issues, HTTP errors, and timeouts

### 2. Updated AuthDialog (`packages/cli/src/ui/components/AuthDialog.tsx`)

Modified to include:

- Ollama as an authentication option
- Automatic fetching of Ollama models when the dialog mounts
- Model selection UI when Ollama is chosen
- Error handling for inaccessible Ollama instances or empty model lists
- Setting of `OLLAMA_MODEL` environment variable

### 3. Package Exports

Updated exports to make the OllamaModelService available:

- `packages/core/src/index.ts`
- `packages/core/index.ts`

## Usage

When users run the application and select "Ollama" from the authentication options, they will see a list of their locally available models with size information. They can then select which model to use for the session.

## Environment Variables

- `OLLAMA_HOST`: Override the default Ollama host (default: http://localhost:11434)
- `OLLAMA_MODEL`: Set automatically when selected in the UI, or manually set to skip the UI

## Testing

Created comprehensive tests for the OllamaModelService covering:

- Successful model listing
- Error handling for network issues
- HTTP error responses
- Timeout scenarios
- Accessibility checks

All tests pass successfully.