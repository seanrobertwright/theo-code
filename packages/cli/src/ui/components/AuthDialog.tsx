/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { Colors } from '../colors.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { LoadedSettings, SettingScope } from '../../config/settings.js';
import { AuthType } from '@theo-code/theo-code-core';
import {
  validateAuthMethod,
  setOpenAIApiKey,
  setOpenAIBaseUrl,
  setOpenAIModel,
} from '../../config/auth.js';
import { OpenAIKeyPrompt } from './OpenAIKeyPrompt.js';
import { OllamaModelService, OllamaModel } from '@theo-code/theo-code-core';

interface AuthDialogProps {
  onSelect: (authMethod: AuthType | undefined, scope: SettingScope) => void;
  settings: LoadedSettings;
  initialErrorMessage?: string | null;
}

function parseDefaultAuthType(
  defaultAuthType: string | undefined,
): AuthType | null {
  if (
    defaultAuthType &&
    Object.values(AuthType).includes(defaultAuthType as AuthType)
  ) {
    return defaultAuthType as AuthType;
  }
  return null;
}

export function AuthDialog({
  onSelect,
  settings,
  initialErrorMessage,
}: AuthDialogProps): React.JSX.Element {
  const [errorMessage, setErrorMessage] = useState<string | null>(
    initialErrorMessage || null,
  );
  const [showOpenAIKeyPrompt, setShowOpenAIKeyPrompt] = useState(false);
  const [showOllamaModelSelection, setShowOllamaModelSelection] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [ollamaError, setOllamaError] = useState<string | null>(null);
  
  const items = [
    { label: 'Theo OAuth', value: AuthType.QWEN_OAUTH },
    { label: 'OpenAI', value: AuthType.USE_OPENAI },
    { label: 'Ollama', value: AuthType.USE_OLLAMA },
  ];

  const initialAuthIndex = Math.max(
    0,
    items.findIndex((item) => {
      if (settings.merged.selectedAuthType) {
        return item.value === settings.merged.selectedAuthType;
      }

      const defaultAuthType = parseDefaultAuthType(
        process.env.GEMINI_DEFAULT_AUTH_TYPE,
      );
      if (defaultAuthType) {
        return item.value === defaultAuthType;
      }

      if (process.env.GEMINI_API_KEY) {
        return item.value === AuthType.USE_GEMINI;
      }

      if (process.env.QWEN_OAUTH_TOKEN) {
        return item.value === AuthType.QWEN_OAUTH;
      }

      return item.value === AuthType.LOGIN_WITH_GOOGLE;
    }),
  );

  // Fetch Ollama models when component mounts
  useEffect(() => {
    const fetchOllamaModels = async () => {
      try {
        const ollamaService = new OllamaModelService();
        const isAccessible = await ollamaService.isOllamaAccessible();
        
        if (!isAccessible) {
          setOllamaError('Ollama is not accessible. Make sure Ollama is running on localhost:11434');
          return;
        }
        
        const models = await ollamaService.listModels();
        setOllamaModels(models);
        
        if (models.length === 0) {
          setOllamaError('No models found in Ollama. Please pull a model first (e.g., "ollama pull llama3")');
        }
      } catch (error) {
        setOllamaError(error instanceof Error ? error.message : 'Failed to fetch Ollama models');
      }
    };

    fetchOllamaModels();
  }, []);

  const handleAuthSelect = (authMethod: AuthType) => {
    const error = validateAuthMethod(authMethod);
    if (error) {
      if (authMethod === AuthType.USE_OPENAI && !process.env.OPENAI_API_KEY) {
        setShowOpenAIKeyPrompt(true);
        setErrorMessage(null);
      } else if (authMethod === AuthType.USE_OLLAMA) {
        if (ollamaError) {
          setErrorMessage(ollamaError);
        } else if (ollamaModels.length === 0) {
          setErrorMessage('No models available in Ollama. Please pull a model first.');
        } else {
          setShowOllamaModelSelection(true);
          setErrorMessage(null);
        }
      } else {
        setErrorMessage(error);
      }
    } else {
      setErrorMessage(null);
      onSelect(authMethod, SettingScope.User);
    }
  };

  const handleOllamaModelSelect = (model: string) => {
    // Set the OLLAMA_MODEL environment variable
    process.env.OLLAMA_MODEL = model;
    setShowOllamaModelSelection(false);
    onSelect(AuthType.USE_OLLAMA, SettingScope.User);
  };

  const handleOpenAIKeySubmit = (
    apiKey: string,
    baseUrl: string,
    model: string,
  ) => {
    setOpenAIApiKey(apiKey);
    setOpenAIBaseUrl(baseUrl);
    setOpenAIModel(model);
    setShowOpenAIKeyPrompt(false);
    onSelect(AuthType.USE_OPENAI, SettingScope.User);
  };

  const handleOpenAIKeyCancel = () => {
    setShowOpenAIKeyPrompt(false);
    setErrorMessage('OpenAI API key is required to use OpenAI authentication.');
  };

  useInput((_input, key) => {
    if (showOpenAIKeyPrompt || showOllamaModelSelection) {
      return;
    }

    if (key.escape) {
      // Prevent exit if there is an error message.
      // This means they user is not authenticated yet.
      if (errorMessage) {
        return;
      }
      if (settings.merged.selectedAuthType === undefined) {
        // Prevent exiting if no auth method is set
        setErrorMessage(
          'You must select an auth method to proceed. Press Ctrl+C twice to exit.',
        );
        return;
      }
      onSelect(undefined, SettingScope.User);
    }
  });

  if (showOpenAIKeyPrompt) {
    return (
      <OpenAIKeyPrompt
        onSubmit={handleOpenAIKeySubmit}
        onCancel={handleOpenAIKeyCancel}
      />
    );
  }

  if (showOllamaModelSelection) {
    return (
      <Box
        borderStyle="round"
        borderColor={Colors.Gray}
        flexDirection="column"
        padding={1}
        width="100%"
      >
        <Text bold>Select Ollama Model</Text>
        <Box marginTop={1}>
          <Text>Choose a model to use with Ollama:</Text>
        </Box>
        {ollamaError ? (
          <Box marginTop={1}>
            <Text color={Colors.AccentRed}>{ollamaError}</Text>
          </Box>
        ) : (
          <Box marginTop={1}>
            <RadioButtonSelect
              items={ollamaModels.map(model => ({ 
                label: `${model.name} (${(model.size / 1024 / 1024 / 1024).toFixed(1)} GB)`, 
                value: model.name 
              }))}
              initialIndex={0}
              onSelect={handleOllamaModelSelect}
              isFocused={true}
            />
          </Box>
        )}
        <Box marginTop={1}>
          <Text color={Colors.AccentPurple}>(Use Enter to Select Model)</Text>
        </Box>
        <Box marginTop={1}>
          <Text color={Colors.Gray}>(Press Escape to go back)</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box
      borderStyle="round"
      borderColor={Colors.Gray}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      <Text bold>Get started</Text>
      <Box marginTop={1}>
        <Text>How would you like to authenticate for this project?</Text>
      </Box>
      <Box marginTop={1}>
        <RadioButtonSelect
          items={items}
          initialIndex={initialAuthIndex}
          onSelect={handleAuthSelect}
          isFocused={true}
        />
      </Box>
      {errorMessage && (
        <Box marginTop={1}>
          <Text color={Colors.AccentRed}>{errorMessage}</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text color={Colors.AccentPurple}>(Use Enter to Set Auth)</Text>
      </Box>
      <Box marginTop={1}>
        <Text>Terms of Services and Privacy Notice for Theo Code</Text>
      </Box>
      <Box marginTop={1}>
        <Text color={Colors.AccentBlue}>
          {'https://github.com/TheoLM/Theo3-Coder/blob/main/README.md'}
        </Text>
      </Box>
    </Box>
  );
}
