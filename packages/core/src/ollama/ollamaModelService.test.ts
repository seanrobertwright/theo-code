/**
 * @license
 * Copyright 2025 Theo
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { OllamaModelService, type OllamaListModelResponse } from './ollamaModelService.js';

describe('OllamaModelService', () => {
  it('should construct with default base URL', () => {
    const service = new OllamaModelService();
    expect(service).toBeInstanceOf(OllamaModelService);
  });

  it('should construct with custom base URL', () => {
    const customUrl = 'http://custom-host:11434';
    const service = new OllamaModelService(customUrl);
    expect(service).toBeInstanceOf(OllamaModelService);
  });

  it('should handle fetch errors gracefully', async () => {
    const service = new OllamaModelService('http://localhost:11434');
    
    // Mock fetch to simulate a network error
    const mockFetch = vi.spyOn(global, 'fetch').mockImplementationOnce(() => {
      throw new Error('Network error');
    });
    
    await expect(service.listModels()).rejects.toThrow('Failed to fetch Ollama models');
    
    mockFetch.mockRestore();
  });

  it('should handle successful model listing', async () => {
    const service = new OllamaModelService('http://localhost:11434');
    
    // Mock response data
    const mockResponseData: OllamaListModelResponse = {
      models: [
        {
          name: 'llama3',
          model: 'llama3',
          modified_at: '2024-01-01T00:00:00Z',
          size: 4661224672,
          digest: 'abc123',
          details: {
            parent_model: '',
            format: 'gguf',
            family: 'llama',
            families: ['llama'],
            parameter_size: '8B',
            quantization_level: 'Q4_0'
          }
        }
      ]
    };
    
    // Mock fetch to return successful response
    const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponseData
    } as Response);
    
    const models = await service.listModels();
    expect(models).toHaveLength(1);
    expect(models[0].name).toBe('llama3');
    expect(models[0].size).toBe(4661224672);
    
    mockFetch.mockRestore();
  });

  it('should handle HTTP error responses', async () => {
    const service = new OllamaModelService('http://localhost:11434');
    
    // Mock fetch to return error response
    const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error'
    } as Response);
    
    await expect(service.listModels()).rejects.toThrow('Failed to fetch models: 500 Internal Server Error');
    
    mockFetch.mockRestore();
  });

  it('should handle timeout errors by using AbortController', async () => {
    const service = new OllamaModelService('http://localhost:11434');
    
    // Mock fetch to simulate an abort error
    const mockFetch = vi.spyOn(global, 'fetch').mockImplementationOnce(() => {
      const error = new Error('AbortError');
      error.name = 'AbortError';
      throw error;
    });
    
    await expect(service.listModels()).rejects.toThrow('Request timeout: Ollama is not responding');
    
    mockFetch.mockRestore();
  });

  it('should check if Ollama is accessible', async () => {
    const service = new OllamaModelService('http://localhost:11434');
    
    // Mock fetch to return successful response
    const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true
    } as Response);
    
    const isAccessible = await service.isOllamaAccessible();
    expect(isAccessible).toBe(true);
    
    mockFetch.mockRestore();
  });

  it('should handle inaccessible Ollama', async () => {
    const service = new OllamaModelService('http://localhost:11434');
    
    // Mock fetch to simulate network error
    const mockFetch = vi.spyOn(global, 'fetch').mockImplementationOnce(() => {
      throw new Error('Network error');
    });
    
    const isAccessible = await service.isOllamaAccessible();
    expect(isAccessible).toBe(false);
    
    mockFetch.mockRestore();
  });
});