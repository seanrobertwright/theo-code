/**
 * @license
 * Copyright 2025 Theo
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { OllamaContentGenerator } from './ollamaContentGenerator.js';
import { Config } from '../config/config.js';
import OpenAI from 'openai';

// Mock OpenAI
vi.mock('openai');

// Mock the Config class
vi.mock('../config/config.js', () => ({
  Config: vi.fn(),
}));

describe('OllamaContentGenerator', () => {
  let generator: OllamaContentGenerator;
  let mockConfig: Config;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockOpenAIClient: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock environment variables
    vi.stubEnv('OLLAMA_HOST', '');

    // Create a mock config object
    mockConfig = {
      getContentGeneratorConfig: vi.fn().mockReturnValue({}),
      getCliVersion: vi.fn().mockReturnValue('0.0.5'),
    } as unknown as Config;

    // Mock OpenAI client
    mockOpenAIClient = {
      chat: {
        completions: {
          create: vi.fn(),
        },
      },
      embeddings: {
        create: vi.fn(),
      },
      apiKey: '',
      baseURL: '',
    };

    vi.mocked(OpenAI).mockImplementation(() => mockOpenAIClient);

    // Create generator instance
    generator = new OllamaContentGenerator('test-model', mockConfig);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should initialize with correct base URL', () => {
    expect(generator).toBeInstanceOf(OllamaContentGenerator);
    // The client should be initialized with the Ollama base URL
    expect(generator['client'].baseURL).toBe('http://localhost:11434/v1');
  });

  it('should use custom OLLAMA_HOST when provided', () => {
    vi.stubEnv('OLLAMA_HOST', 'http://custom-host:11434/v1');

    const customGenerator = new OllamaContentGenerator(
      'test-model',
      mockConfig,
    );
    expect(customGenerator['client'].baseURL).toBe(
      'http://custom-host:11434/v1',
    );

    vi.unstubAllEnvs();
  });

  it('should initialize with correct API key and base URL', () => {
    // Check that the OpenAI client was created with the correct initial parameters
    expect(OpenAI).toHaveBeenCalledWith({
      apiKey: 'ollama',
      baseURL: '',
      timeout: 120000,
      maxRetries: 3,
      defaultHeaders: {
        'User-Agent': 'TheoCode/0.0.5 (win32; x64)',
      },
    });

    // Check that the baseURL was set after construction
    expect(generator['client'].baseURL).toBe('http://localhost:11434/v1');
  });
});
