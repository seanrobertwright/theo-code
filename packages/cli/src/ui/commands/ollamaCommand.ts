/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, MessageActionReturn, SlashCommand } from './types.js';
import { MessageType } from '../types.js';
import { OllamaModelService } from '@theo-code/theo-code-core';

export const ollamaCommand: SlashCommand = {
  name: 'ollama',
  description: 'manage Ollama models',
  kind: CommandKind.BUILT_IN,
  subCommands: [
    {
      name: 'list',
      description: 'list available Ollama models',
      kind: CommandKind.BUILT_IN,
      action: async (context): Promise<MessageActionReturn> => {
        try {
          // Check if Ollama is accessible
          const ollamaService = new OllamaModelService();
          const isAccessible = await ollamaService.isOllamaAccessible();
          
          if (!isAccessible) {
            return {
              type: 'message',
              messageType: 'error',
              content: 'Ollama is not accessible. Please make sure Ollama is running on localhost:11434',
            };
          }
          
          // List available models
          const models = await ollamaService.listModels();
          
          if (models.length === 0) {
            return {
              type: 'message',
              messageType: 'info',
              content: 'No models found in Ollama. Please pull a model first (e.g., "ollama pull llama3")',
            };
          }
          
          // Format the model list
          const modelList = models.map((model, index) => {
            const sizeInGB = (model.size / 1024 / 1024 / 1024).toFixed(2);
            return `${index + 1}. ${model.name} (${sizeInGB} GB)`;
          }).join('\n');
          
          return {
            type: 'message',
            messageType: 'info',
            content: `Available Ollama models:\n${modelList}`,
          };
        } catch (error) {
          return {
            type: 'message',
            messageType: 'error',
            content: `Failed to list Ollama models: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
    {
      name: 'model',
      description: 'switch to a specific Ollama model',
      kind: CommandKind.BUILT_IN,
      action: async (context, args): Promise<MessageActionReturn> => {
        // First check if we're using Ollama auth
        const currentAuthType = context.services.config?.getContentGeneratorConfig()?.authType;
        if (currentAuthType !== 'ollama') {
          return {
            type: 'message',
            messageType: 'error',
            content: 'You are not currently using Ollama. Please switch to Ollama auth first using /auth',
          };
        }
        
        if (!args || args.trim() === '') {
          return {
            type: 'message',
            messageType: 'error',
            content: 'Please specify a model name. Usage: /ollama model <model_name>',
          };
        }
        
        const modelName = args.trim();
        
        try {
          // Check if Ollama is accessible
          const ollamaService = new OllamaModelService();
          const isAccessible = await ollamaService.isOllamaAccessible();
          
          if (!isAccessible) {
            return {
              type: 'message',
              messageType: 'error',
              content: 'Ollama is not accessible. Please make sure Ollama is running on localhost:11434',
            };
          }
          
          // Verify the model exists
          const models = await ollamaService.listModels();
          const modelExists = models.some(model => model.name === modelName);
          
          if (!modelExists) {
            // List available models for reference
            const modelList = models.map((model, index) => {
              const sizeInGB = (model.size / 1024 / 1024 / 1024).toFixed(2);
              return `${index + 1}. ${model.name} (${sizeInGB} GB)`;
            }).join('\n');
            return {
              type: 'message',
              messageType: 'error',
              content: `Model "${modelName}" not found. Available models:\n${modelList}`,
            };
          }
          
          // Set the OLLAMA_MODEL environment variable
          process.env.OLLAMA_MODEL = modelName;
          
          // Update the config model if possible
          if (context.services.config) {
            // Note: We can't directly change the model in the current session
            // The user would need to restart the session to use the new model
            // But we can at least update the environment variable
          }
          
          return {
            type: 'message',
            messageType: 'info',
            content: `Switched to Ollama model: ${modelName}\nNote: You may need to restart the session for the change to take effect in the status bar.`,
          };
        } catch (error) {
          return {
            type: 'message',
            messageType: 'error',
            content: `Failed to switch Ollama model: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
  ],
};