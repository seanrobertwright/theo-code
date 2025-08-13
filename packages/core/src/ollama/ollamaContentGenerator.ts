/**
 * @license
 * Copyright 2025 Theo
 * SPDX-License-Identifier: Apache-2.0
 */

import { OpenAIContentGenerator } from '../core/openaiContentGenerator.js';
import { Config } from '../config/config.js';
import {
  GenerateContentParameters,
  GenerateContentResponse,
  CountTokensParameters,
  CountTokensResponse,
  EmbedContentParameters,
  EmbedContentResponse,
} from '@google/genai';

// Default Ollama base URL
const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434/v1';

/**
 * Ollama Content Generator that uses Ollama's OpenAI-compatible API
 */
export class OllamaContentGenerator extends OpenAIContentGenerator {
  constructor(model: string, config: Config) {
    // Initialize with placeholder API key (Ollama doesn't require authentication)
    super('ollama', model, config);

    // Set Ollama base URL
    const ollamaHost = process.env.OLLAMA_HOST || DEFAULT_OLLAMA_BASE_URL;
    this.client.baseURL = ollamaHost;
  }

  /**
   * Override to use Ollama-specific settings
   */
  async generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse> {
    // Temporarily update the API key (not needed for Ollama but keeping consistency)
    const originalApiKey = this.client.apiKey;
    this.client.apiKey = 'ollama'; // Ollama doesn't require authentication

    try {
      return await super.generateContent(request, userPromptId);
    } finally {
      // Restore original values
      this.client.apiKey = originalApiKey;
    }
  }

  /**
   * Override to use Ollama-specific settings
   */
  async generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    // Update the API key (not needed for Ollama but keeping consistency)
    const originalApiKey = this.client.apiKey;
    this.client.apiKey = 'ollama';

    try {
      return await super.generateContentStream(request, userPromptId);
    } catch (error) {
      // Restore original values on error
      this.client.apiKey = originalApiKey;
      throw error;
    }
  }

  /**
   * Override to use Ollama-specific settings
   */
  async countTokens(
    request: CountTokensParameters,
  ): Promise<CountTokensResponse> {
    // Temporarily update the API key
    const originalApiKey = this.client.apiKey;
    this.client.apiKey = 'ollama';

    try {
      return await super.countTokens(request);
    } finally {
      this.client.apiKey = originalApiKey;
    }
  }

  /**
   * Override to use Ollama-specific settings
   */
  async embedContent(
    request: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    // Temporarily update the API key
    const originalApiKey = this.client.apiKey;
    this.client.apiKey = 'ollama';

    try {
      return await super.embedContent(request);
    } finally {
      this.client.apiKey = originalApiKey;
    }
  }
}
