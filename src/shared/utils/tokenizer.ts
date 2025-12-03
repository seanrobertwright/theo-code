/**
 * @fileoverview Token counting utilities using tiktoken
 * @module shared/utils/tokenizer
 */

import { Tiktoken, encoding_for_model as encodingForModel } from 'tiktoken';
import type { Message } from '../types/index.js';

// =============================================================================
// TOKENIZER CACHE
// =============================================================================

/** Cache of tokenizer instances by model */
const tokenizerCache = new Map<string, Tiktoken>();

/**
 * Gets or creates a tokenizer for a model.
 *
 * @param model - The model identifier
 * @returns Tiktoken encoder instance
 */
function getTokenizer(model: string): Tiktoken {
  const cached = tokenizerCache.get(model);
  if (cached !== undefined) {
    return cached;
  }

  try {
    // Map model names to tiktoken encoding names
    const encodingModel = mapModelToEncoding(model);
    const tokenizer = encodingForModel(encodingModel);
    tokenizerCache.set(model, tokenizer);
    return tokenizer;
  } catch {
    // Fall back to cl100k_base for unknown models
    const fallback = tokenizerCache.get('gpt-4o');
    if (fallback !== undefined) {
      return fallback;
    }

    const tokenizer = encodingForModel('gpt-4o');
    tokenizerCache.set('gpt-4o', tokenizer);
    tokenizerCache.set(model, tokenizer);
    return tokenizer;
  }
}

/**
 * Maps model identifier to tiktoken encoding model.
 *
 * @param model - The model identifier
 * @returns Tiktoken-compatible model name
 */
function mapModelToEncoding(model: string): Parameters<typeof encodingForModel>[0] {
  const normalizedModel = model.toLowerCase();

  // GPT-4 family
  if (normalizedModel.includes('gpt-4')) {
    return 'gpt-4o';
  }

  // GPT-3.5 family
  if (normalizedModel.includes('gpt-3.5')) {
    return 'gpt-3.5-turbo';
  }

  // Claude models (use GPT-4 tokenizer as approximation)
  if (normalizedModel.includes('claude')) {
    return 'gpt-4o';
  }

  // Gemini models (use GPT-4 tokenizer as approximation)
  if (normalizedModel.includes('gemini')) {
    return 'gpt-4o';
  }

  // Default to GPT-4 tokenizer
  return 'gpt-4o';
}

// =============================================================================
// TOKEN COUNTING
// =============================================================================

/**
 * Counts tokens in a string.
 *
 * @param text - The text to count tokens for
 * @param model - The model to use for tokenization
 * @returns Number of tokens
 *
 * @example
 * ```typescript
 * const tokens = countTokens('Hello, world!', 'gpt-4o');
 * console.log(tokens); // 4
 * ```
 */
export function countTokens(text: string, model = 'gpt-4o'): number {
  const tokenizer = getTokenizer(model);
  return tokenizer.encode(text).length;
}

/**
 * Counts tokens in a message.
 *
 * This accounts for the message format overhead (role, separators, etc.).
 *
 * @param message - The message to count tokens for
 * @param model - The model to use for tokenization
 * @returns Number of tokens
 */
export function countMessageTokens(message: Message, model = 'gpt-4o'): number {
  let tokenCount = 0;
  const tokenizer = getTokenizer(model);

  // Base overhead per message (role, separators)
  tokenCount += 4; // <|im_start|>, role, \n, <|im_end|>

  // Content tokens
  if (typeof message.content === 'string') {
    tokenCount += tokenizer.encode(message.content).length;
  } else {
    // Array of content blocks
    for (const block of message.content) {
      if (block.type === 'text') {
        tokenCount += tokenizer.encode(block.text).length;
      } else if (block.type === 'tool_use') {
        // Tool use blocks have structured content
        tokenCount += tokenizer.encode(block.name).length;
        tokenCount += tokenizer.encode(JSON.stringify(block.input)).length;
        tokenCount += 10; // Overhead for tool structure
      } else if (block.type === 'tool_result') {
        tokenCount += tokenizer.encode(block.content).length;
        tokenCount += 5; // Overhead for result structure
      }
    }
  }

  // Tool calls
  if (message.toolCalls !== undefined) {
    for (const toolCall of message.toolCalls) {
      tokenCount += tokenizer.encode(toolCall.name).length;
      tokenCount += tokenizer.encode(JSON.stringify(toolCall.arguments)).length;
      tokenCount += 10; // Overhead for tool call structure
    }
  }

  return tokenCount;
}

/**
 * Counts total tokens for an array of messages.
 *
 * @param messages - The messages to count tokens for
 * @param model - The model to use for tokenization
 * @returns Total number of tokens
 */
export function countMessagesTokens(messages: Message[], model = 'gpt-4o'): number {
  let totalTokens = 0;

  for (const message of messages) {
    totalTokens += countMessageTokens(message, model);
  }

  // Add conversation overhead
  totalTokens += 3; // Every reply is primed with <|im_start|>assistant<|im_sep|>

  return totalTokens;
}

// =============================================================================
// CONTEXT LIMITS
// =============================================================================

/** Default context limits by model family */
const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  'gpt-4o': 128000,
  'gpt-4o-mini': 128000,
  'gpt-4-turbo': 128000,
  'gpt-4': 8192,
  'gpt-3.5-turbo': 16384,
  'claude-3-5-sonnet': 200000,
  'claude-3-opus': 200000,
  'claude-3-sonnet': 200000,
  'claude-3-haiku': 200000,
  'gemini-1.5-pro': 2000000,
  'gemini-1.5-flash': 1000000,
  'gemini-2.0-flash': 1000000,
};

/**
 * Gets the context limit for a model.
 *
 * @param model - The model identifier
 * @returns Context limit in tokens
 */
export function getContextLimit(model: string): number {
  const normalizedModel = model.toLowerCase();

  // Check exact match
  const exactLimit = MODEL_CONTEXT_LIMITS[normalizedModel];
  if (exactLimit !== undefined) {
    return exactLimit;
  }

  // Check partial match
  for (const [key, limit] of Object.entries(MODEL_CONTEXT_LIMITS)) {
    if (normalizedModel.includes(key) || key.includes(normalizedModel)) {
      return limit;
    }
  }

  // Default fallback
  return 128000;
}

/**
 * Checks if messages fit within context limit.
 *
 * @param messages - The messages to check
 * @param model - The model to use
 * @param reserveTokens - Tokens to reserve for response
 * @returns Object with fit status and usage info
 */
export function checkContextFit(
  messages: Message[],
  model = 'gpt-4o',
  reserveTokens = 4096
): { fits: boolean; used: number; limit: number; available: number } {
  const used = countMessagesTokens(messages, model);
  const limit = getContextLimit(model);
  const available = limit - used - reserveTokens;

  return {
    fits: available > 0,
    used,
    limit,
    available: Math.max(0, available),
  };
}

/**
 * Formats token count for display.
 *
 * @param tokens - Number of tokens
 * @returns Formatted string (e.g., "1.2K", "150K")
 */
export function formatTokenCount(tokens: number): string {
  if (tokens < 1000) {
    return tokens.toString();
  }

  if (tokens < 1000000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }

  return `${(tokens / 1000000).toFixed(1)}M`;
}
