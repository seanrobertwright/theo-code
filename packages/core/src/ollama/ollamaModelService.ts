/**
 * @license
 * Copyright 2025 Theo
 * SPDX-License-Identifier: Apache-2.0
 */

// Default Ollama base URL
const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';

/**
 * Interface representing an Ollama model
 */
export interface OllamaModel {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    parent_model: string;
    format: string;
    family: string;
    families: string[] | null;
    parameter_size: string;
    quantization_level: string;
  };
}

/**
 * Interface representing the response from Ollama's list models API
 */
export interface OllamaListModelResponse {
  models: OllamaModel[];
}

/**
 * Service to interact with Ollama API
 */
export class OllamaModelService {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || process.env.OLLAMA_HOST || DEFAULT_OLLAMA_BASE_URL;
  }

  /**
   * Fetches the list of available models from Ollama
   * @returns Promise resolving to the list of models
   */
  async listModels(): Promise<OllamaModel[]> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`);
      }
      
      const data: OllamaListModelResponse = await response.json();
      return data.models;
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error('Request timeout: Ollama is not responding');
        }
        throw new Error(`Failed to fetch Ollama models: ${error.message}`);
      }
      throw new Error('Failed to fetch Ollama models: Unknown error');
    }
  }

  /**
   * Checks if Ollama is accessible
   * @returns Promise resolving to true if Ollama is accessible, false otherwise
   */
  async isOllamaAccessible(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      return false;
    }
  }
}