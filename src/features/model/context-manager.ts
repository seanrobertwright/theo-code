/**
 * @fileoverview Context limit handling and message truncation for model adapters
 * @module features/model/context-manager
 *
 * Implements smart context window management, automatic message truncation,
 * and context overflow handling for different AI providers.
 */

import type { Message } from '../../shared/types/index.js';
import type { ModelProvider, GenerateOptions } from '../../shared/types/models.js';
import { ExtendedAdapterError } from './error-handling.js';
import { logger } from '../../shared/utils/index.js';

// =============================================================================
// CONTEXT MANAGEMENT TYPES
// =============================================================================

/**
 * Context window configuration for different providers.
 */
export interface ContextConfig {
  /** Maximum context window in tokens */
  maxContextTokens: number;
  /** Maximum output tokens */
  maxOutputTokens: number;
  /** Reserved tokens for system messages and tools */
  reservedTokens: number;
  /** Truncation strategy to use */
  truncationStrategy: TruncationStrategy;
  /** Minimum number of messages to keep */
  minMessages: number;
  /** Whether to preserve system messages */
  preserveSystemMessages: boolean;
  /** Whether to preserve the last user message */
  preserveLastUserMessage: boolean;
}

/**
 * Truncation strategies for handling context overflow.
 */
export type TruncationStrategy = 
  | 'oldest_first'      // Remove oldest messages first
  | 'middle_out'        // Remove messages from the middle
  | 'sliding_window'    // Keep a sliding window of recent messages
  | 'smart_summary'     // Summarize older messages
  | 'token_based'       // Remove messages based on token count
  | 'priority_based';   // Remove based on message priority

/**
 * Message priority for truncation decisions.
 */
export type MessagePriority = 'critical' | 'high' | 'medium' | 'low';

/**
 * Extended message with truncation metadata.
 */
export interface ExtendedMessage extends Message {
  /** Estimated token count for this message */
  tokenCount?: number;
  /** Priority for truncation decisions */
  priority?: MessagePriority;
  /** Whether this message can be truncated */
  canTruncate?: boolean;
  /** Whether this message can be summarized */
  canSummarize?: boolean;
}

/**
 * Context analysis result.
 */
export interface ContextAnalysis {
  /** Total token count of all messages */
  totalTokens: number;
  /** Available tokens for output */
  availableOutputTokens: number;
  /** Whether context fits within limits */
  fitsInContext: boolean;
  /** Number of tokens to remove */
  tokensToRemove: number;
  /** Suggested truncation strategy */
  suggestedStrategy: TruncationStrategy;
  /** Messages that can be truncated */
  truncatableMessages: number[];
  /** Messages that should be preserved */
  preservedMessages: number[];
}

/**
 * Truncation result.
 */
export interface TruncationResult {
  /** Truncated messages */
  messages: ExtendedMessage[];
  /** Number of messages removed */
  messagesRemoved: number;
  /** Number of tokens removed */
  tokensRemoved: number;
  /** Strategy used for truncation */
  strategyUsed: TruncationStrategy;
  /** Whether truncation was successful */
  success: boolean;
  /** Warning message if any */
  warning?: string;
}

// =============================================================================
// DEFAULT CONTEXT CONFIGURATIONS
// =============================================================================

/**
 * Default context configurations by provider.
 */
const DEFAULT_CONTEXT_CONFIGS: Record<ModelProvider, ContextConfig> = {
  openai: {
    maxContextTokens: 128000, // GPT-4o
    maxOutputTokens: 4096,
    reservedTokens: 1000,
    truncationStrategy: 'sliding_window',
    minMessages: 2,
    preserveSystemMessages: true,
    preserveLastUserMessage: true,
  },
  anthropic: {
    maxContextTokens: 200000, // Claude 3.5 Sonnet
    maxOutputTokens: 8192,
    reservedTokens: 1000,
    truncationStrategy: 'sliding_window',
    minMessages: 2,
    preserveSystemMessages: true,
    preserveLastUserMessage: true,
  },
  google: {
    maxContextTokens: 1000000, // Gemini 3.0 Pro
    maxOutputTokens: 8192,
    reservedTokens: 2000,
    truncationStrategy: 'smart_summary',
    minMessages: 2,
    preserveSystemMessages: true,
    preserveLastUserMessage: true,
  },
  openrouter: {
    maxContextTokens: 32000, // Conservative default
    maxOutputTokens: 4096,
    reservedTokens: 1000,
    truncationStrategy: 'oldest_first',
    minMessages: 2,
    preserveSystemMessages: true,
    preserveLastUserMessage: true,
  },
  cohere: {
    maxContextTokens: 128000, // Command R+
    maxOutputTokens: 4096,
    reservedTokens: 1000,
    truncationStrategy: 'sliding_window',
    minMessages: 2,
    preserveSystemMessages: true,
    preserveLastUserMessage: true,
  },
  mistral: {
    maxContextTokens: 32000, // Mistral Large
    maxOutputTokens: 4096,
    reservedTokens: 1000,
    truncationStrategy: 'oldest_first',
    minMessages: 2,
    preserveSystemMessages: true,
    preserveLastUserMessage: true,
  },
  together: {
    maxContextTokens: 32000, // Conservative default
    maxOutputTokens: 4096,
    reservedTokens: 1000,
    truncationStrategy: 'oldest_first',
    minMessages: 2,
    preserveSystemMessages: true,
    preserveLastUserMessage: true,
  },
  perplexity: {
    maxContextTokens: 16000, // Conservative default
    maxOutputTokens: 4096,
    reservedTokens: 1000,
    truncationStrategy: 'oldest_first',
    minMessages: 2,
    preserveSystemMessages: true,
    preserveLastUserMessage: true,
  },
  ollama: {
    maxContextTokens: 8192, // Conservative default for local models
    maxOutputTokens: 2048,
    reservedTokens: 500,
    truncationStrategy: 'oldest_first',
    minMessages: 1,
    preserveSystemMessages: true,
    preserveLastUserMessage: true,
  },
};

// =============================================================================
// CONTEXT MANAGER IMPLEMENTATION
// =============================================================================

/**
 * Manages context windows and handles message truncation.
 */
export class ContextManager {
  private readonly provider: ModelProvider;
  private readonly config: ContextConfig;
  private readonly tokenCounter: (messages: Message[]) => number;

  constructor(
    provider: ModelProvider,
    tokenCounter: (messages: Message[]) => number,
    customConfig?: Partial<ContextConfig>
  ) {
    this.provider = provider;
    this.tokenCounter = tokenCounter;
    this.config = {
      ...DEFAULT_CONTEXT_CONFIGS[provider],
      ...customConfig,
    };

    logger.debug(`[ContextManager] Initialized for ${provider} with config:`, this.config);
  }

  /**
   * Analyze context usage and determine if truncation is needed.
   */
  analyzeContext(
    messages: Message[],
    options?: GenerateOptions
  ): ContextAnalysis {
    const extendedMessages = this.enrichMessages(messages);
    const totalTokens = this.calculateTotalTokens(extendedMessages);
    const requestedOutputTokens = options?.maxTokens ?? this.config.maxOutputTokens;
    const availableTokens = this.config.maxContextTokens - this.config.reservedTokens;
    const availableOutputTokens = Math.min(
      requestedOutputTokens,
      availableTokens - totalTokens
    );

    const fitsInContext = totalTokens + requestedOutputTokens <= availableTokens;
    const tokensToRemove = fitsInContext ? 0 : (totalTokens + requestedOutputTokens) - availableTokens;

    const analysis: ContextAnalysis = {
      totalTokens,
      availableOutputTokens: Math.max(0, availableOutputTokens),
      fitsInContext,
      tokensToRemove,
      suggestedStrategy: this.config.truncationStrategy,
      truncatableMessages: [],
      preservedMessages: [],
    };

    // Identify truncatable and preserved messages
    for (let i = 0; i < extendedMessages.length; i++) {
      const message = extendedMessages[i];
      if (!message) continue;
      
      const isSystemMessage = message.role === 'system';
      const isLastUserMessage = i === extendedMessages.length - 1 && message.role === 'user';

      if (
        (isSystemMessage && this.config.preserveSystemMessages) ||
        (isLastUserMessage && this.config.preserveLastUserMessage) ||
        message.canTruncate === false
      ) {
        analysis.preservedMessages.push(i);
      } else {
        analysis.truncatableMessages.push(i);
      }
    }

    logger.debug(`[ContextManager] Context analysis for ${this.provider}:`, {
      totalTokens,
      availableOutputTokens,
      fitsInContext,
      tokensToRemove,
      truncatableCount: analysis.truncatableMessages.length,
      preservedCount: analysis.preservedMessages.length,
    });

    return analysis;
  }

  /**
   * Truncate messages to fit within context limits.
   */
  truncateMessages(
    messages: Message[],
    options?: GenerateOptions,
    customStrategy?: TruncationStrategy
  ): TruncationResult {
    const analysis = this.analyzeContext(messages, options);
    
    if (analysis.fitsInContext) {
      return {
        messages: this.enrichMessages(messages),
        messagesRemoved: 0,
        tokensRemoved: 0,
        strategyUsed: this.config.truncationStrategy,
        success: true,
      };
    }

    const strategy = customStrategy ?? analysis.suggestedStrategy;
    const extendedMessages = this.enrichMessages(messages);

    logger.info(`[ContextManager] Truncating messages for ${this.provider} using ${strategy} strategy (need to remove ${analysis.tokensToRemove} tokens)`);

    let truncatedMessages: ExtendedMessage[];
    let tokensRemoved = 0;
    let messagesRemoved = 0;

    try {
      switch (strategy) {
        case 'oldest_first':
          ({ messages: truncatedMessages, tokensRemoved, messagesRemoved } = 
            this.truncateOldestFirst(extendedMessages, analysis));
          break;

        case 'middle_out':
          ({ messages: truncatedMessages, tokensRemoved, messagesRemoved } = 
            this.truncateMiddleOut(extendedMessages, analysis));
          break;

        case 'sliding_window':
          ({ messages: truncatedMessages, tokensRemoved, messagesRemoved } = 
            this.truncateSlidingWindow(extendedMessages, analysis));
          break;

        case 'token_based':
          ({ messages: truncatedMessages, tokensRemoved, messagesRemoved } = 
            this.truncateTokenBased(extendedMessages, analysis));
          break;

        case 'priority_based':
          ({ messages: truncatedMessages, tokensRemoved, messagesRemoved } = 
            this.truncatePriorityBased(extendedMessages, analysis));
          break;

        case 'smart_summary':
          ({ messages: truncatedMessages, tokensRemoved, messagesRemoved } = 
            this.truncateWithSummary(extendedMessages, analysis));
          break;

        default:
          throw new ExtendedAdapterError(
            'INVALID_REQUEST',
            this.provider,
            `Unknown truncation strategy: ${strategy}`,
            { severity: 'medium', recoveryStrategy: 'abort' }
          );
      }

      // Verify truncation was successful
      const finalTokens = this.calculateTotalTokens(truncatedMessages);
      const requestedOutputTokens = options?.maxTokens ?? this.config.maxOutputTokens;
      const availableTokens = this.config.maxContextTokens - this.config.reservedTokens;
      const success = finalTokens + requestedOutputTokens <= availableTokens;

      if (!success) {
        logger.warn(`[ContextManager] Truncation failed to fit within limits (${finalTokens} + ${requestedOutputTokens} > ${availableTokens})`);
      }

      const result: TruncationResult = {
        messages: truncatedMessages,
        messagesRemoved,
        tokensRemoved,
        strategyUsed: strategy,
        success,
      };
      
      if (!success) {
        result.warning = 'Truncation may not have achieved target token count';
      }
      
      return result;

    } catch (error) {
      logger.error(`[ContextManager] Truncation failed:`, error);
      
      throw new ExtendedAdapterError(
        'CONTEXT_LENGTH_EXCEEDED',
        this.provider,
        `Failed to truncate messages: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {
          severity: 'high',
          recoveryStrategy: 'abort',
          originalError: error,
          context: { analysis, strategy },
        }
      );
    }
  }

  /**
   * Handle context overflow gracefully.
   */
  async handleContextOverflow(
    messages: Message[],
    options?: GenerateOptions
  ): Promise<Message[]> {
    try {
      const result = this.truncateMessages(messages, options);
      
      if (!result.success) {
        throw new ExtendedAdapterError(
          'CONTEXT_LENGTH_EXCEEDED',
          this.provider,
          'Unable to fit messages within context limits after truncation',
          {
            severity: 'high',
            recoveryStrategy: 'abort',
            context: { result },
          }
        );
      }

      if (result.messagesRemoved > 0) {
        logger.warn(`[ContextManager] Removed ${result.messagesRemoved} messages (${result.tokensRemoved} tokens) due to context limits`);
      }

      return result.messages;

    } catch (error) {
      if (error instanceof ExtendedAdapterError) {
        throw error;
      }

      throw new ExtendedAdapterError(
        'CONTEXT_LENGTH_EXCEEDED',
        this.provider,
        `Context overflow handling failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {
          severity: 'high',
          recoveryStrategy: 'abort',
          originalError: error,
        }
      );
    }
  }

  // =============================================================================
  // PRIVATE TRUNCATION STRATEGIES
  // =============================================================================

  /**
   * Enrich messages with token counts and metadata.
   */
  private enrichMessages(messages: Message[]): ExtendedMessage[] {
    return messages.map((message, index) => {
      const tokenCount = this.estimateMessageTokens(message);
      const priority = this.determineMessagePriority(message, index, messages.length);
      
      return {
        ...message,
        tokenCount,
        priority,
        canTruncate: message.role !== 'system' || !this.config.preserveSystemMessages,
        canSummarize: message.role === 'user' || message.role === 'assistant',
      };
    });
  }

  /**
   * Calculate total token count for messages.
   */
  private calculateTotalTokens(messages: ExtendedMessage[]): number {
    return messages.reduce((total, message) => total + (message.tokenCount ?? 0), 0);
  }

  /**
   * Estimate token count for a single message.
   */
  private estimateMessageTokens(message: Message): number {
    // Simple estimation: ~4 characters per token
    const contentLength = Array.isArray(message.content)
      ? message.content.reduce((len, block) => {
          if (block.type === 'text') {
            return len + block.text.length;
          }
          return len + 100; // Estimate for non-text blocks
        }, 0)
      : message.content.length;

    return Math.ceil(contentLength / 4) + 10; // +10 for role and formatting
  }

  /**
   * Determine message priority for truncation decisions.
   */
  private determineMessagePriority(message: Message, index: number, totalMessages: number): MessagePriority {
    // System messages are critical
    if (message.role === 'system') {
      return 'critical';
    }

    // Last few messages are high priority
    if (index >= totalMessages - 3) {
      return 'high';
    }

    // Tool results are medium priority
    if (message.role === 'tool') {
      return 'medium';
    }

    // Older messages are low priority
    return 'low';
  }

  /**
   * Truncate oldest messages first.
   */
  private truncateOldestFirst(
    messages: ExtendedMessage[],
    analysis: ContextAnalysis
  ): { messages: ExtendedMessage[]; tokensRemoved: number; messagesRemoved: number } {
    const result = [...messages];
    let tokensRemoved = 0;
    let messagesRemoved = 0;

    // Remove messages from the beginning until we have enough space
    while (tokensRemoved < analysis.tokensToRemove && result.length > this.config.minMessages) {
      const messageIndex = result.findIndex((_, i) => analysis.truncatableMessages.includes(i));
      
      if (messageIndex === -1) break;

      const message = result[messageIndex];
      if (!message) break;
      
      tokensRemoved += message.tokenCount ?? 0;
      messagesRemoved++;
      result.splice(messageIndex, 1);

      // Update indices after removal
      analysis.truncatableMessages = analysis.truncatableMessages
        .map(i => i > messageIndex ? i - 1 : i)
        .filter(i => i !== messageIndex);
    }

    return { messages: result, tokensRemoved, messagesRemoved };
  }

  /**
   * Truncate messages from the middle outward.
   */
  private truncateMiddleOut(
    messages: ExtendedMessage[],
    analysis: ContextAnalysis
  ): { messages: ExtendedMessage[]; tokensRemoved: number; messagesRemoved: number } {
    const result = [...messages];
    let tokensRemoved = 0;
    let messagesRemoved = 0;

    const truncatableIndices = [...analysis.truncatableMessages].sort((a, b) => {
      const midpoint = messages.length / 2;
      return Math.abs(a - midpoint) - Math.abs(b - midpoint);
    });

    for (const index of truncatableIndices) {
      if (tokensRemoved >= analysis.tokensToRemove || result.length <= this.config.minMessages) {
        break;
      }

      const actualIndex = result.findIndex((_, i) => i === index);
      if (actualIndex === -1) continue;

      const message = result[actualIndex];
      if (!message) continue;
      
      tokensRemoved += message.tokenCount ?? 0;
      messagesRemoved++;
      result.splice(actualIndex, 1);
    }

    return { messages: result, tokensRemoved, messagesRemoved };
  }

  /**
   * Keep a sliding window of recent messages.
   */
  private truncateSlidingWindow(
    messages: ExtendedMessage[],
    analysis: ContextAnalysis
  ): { messages: ExtendedMessage[]; tokensRemoved: number; messagesRemoved: number } {
    const windowSize = Math.max(this.config.minMessages, messages.length - Math.ceil(analysis.tokensToRemove / 100));
    const preservedIndices = new Set(analysis.preservedMessages);
    
    // Keep preserved messages and recent messages
    const result: ExtendedMessage[] = [];
    let tokensRemoved = 0;
    let messagesRemoved = 0;

    // Add preserved messages
    for (const index of analysis.preservedMessages) {
      const message = messages[index];
      if (message) {
        result.push(message);
      }
    }

    // Add recent messages up to window size
    const recentStart = Math.max(0, messages.length - windowSize);
    for (let i = recentStart; i < messages.length; i++) {
      const message = messages[i];
      if (!preservedIndices.has(i) && message) {
        result.push(message);
      }
    }

    // Calculate removed tokens and messages
    for (let i = 0; i < recentStart; i++) {
      const message = messages[i];
      if (!preservedIndices.has(i) && message) {
        tokensRemoved += message.tokenCount ?? 0;
        messagesRemoved++;
      }
    }

    return { messages: result, tokensRemoved, messagesRemoved };
  }

  /**
   * Truncate based on token count thresholds.
   */
  private truncateTokenBased(
    messages: ExtendedMessage[],
    analysis: ContextAnalysis
  ): { messages: ExtendedMessage[]; tokensRemoved: number; messagesRemoved: number } {
    const result = [...messages];
    let tokensRemoved = 0;
    let messagesRemoved = 0;

    // Sort truncatable messages by token count (largest first)
    const truncatableWithTokens = analysis.truncatableMessages
      .map(i => messages[i] ? { index: i, tokens: messages[i].tokenCount ?? 0 } : null)
      .filter((item): item is { index: number; tokens: number } => item !== null)
      .sort((a, b) => b.tokens - a.tokens);

    for (const { index, tokens } of truncatableWithTokens) {
      if (tokensRemoved >= analysis.tokensToRemove || result.length <= this.config.minMessages) {
        break;
      }

      const actualIndex = result.findIndex((_, i) => i === index);
      if (actualIndex === -1) continue;

      tokensRemoved += tokens;
      messagesRemoved++;
      result.splice(actualIndex, 1);
    }

    return { messages: result, tokensRemoved, messagesRemoved };
  }

  /**
   * Truncate based on message priority.
   */
  private truncatePriorityBased(
    messages: ExtendedMessage[],
    analysis: ContextAnalysis
  ): { messages: ExtendedMessage[]; tokensRemoved: number; messagesRemoved: number } {
    const result = [...messages];
    let tokensRemoved = 0;
    let messagesRemoved = 0;

    const priorityOrder: MessagePriority[] = ['low', 'medium', 'high', 'critical'];

    for (const priority of priorityOrder) {
      const candidateIndices = analysis.truncatableMessages.filter(i => 
        messages[i] && messages[i].priority === priority
      );

      for (const index of candidateIndices) {
        if (tokensRemoved >= analysis.tokensToRemove || result.length <= this.config.minMessages) {
          break;
        }

        const actualIndex = result.findIndex((_, i) => i === index);
        if (actualIndex === -1) continue;

        const message = result[actualIndex];
        if (message) {
          tokensRemoved += message.tokenCount ?? 0;
          messagesRemoved++;
          result.splice(actualIndex, 1);
        }
      }

      if (tokensRemoved >= analysis.tokensToRemove) {
        break;
      }
    }

    return { messages: result, tokensRemoved, messagesRemoved };
  }

  /**
   * Truncate with smart summarization (placeholder implementation).
   */
  private truncateWithSummary(
    messages: ExtendedMessage[],
    analysis: ContextAnalysis
  ): { messages: ExtendedMessage[]; tokensRemoved: number; messagesRemoved: number } {
    // For now, fall back to sliding window
    // TODO: Implement actual summarization logic
    logger.warn(`[ContextManager] Smart summary not yet implemented, falling back to sliding window`);
    return this.truncateSlidingWindow(messages, analysis);
  }
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Create a context manager for a specific provider.
 */
export function createContextManager(
  provider: ModelProvider,
  tokenCounter: (messages: Message[]) => number,
  customConfig?: Partial<ContextConfig>
): ContextManager {
  return new ContextManager(provider, tokenCounter, customConfig);
}

/**
 * Get default context configuration for a provider.
 */
export function getDefaultContextConfig(provider: ModelProvider): ContextConfig {
  return { ...DEFAULT_CONTEXT_CONFIGS[provider] };
}

/**
 * Estimate if messages will fit in context window.
 */
export function estimateContextFit(
  provider: ModelProvider,
  messages: Message[],
  tokenCounter: (messages: Message[]) => number,
  options?: GenerateOptions
): boolean {
  const manager = createContextManager(provider, tokenCounter);
  const analysis = manager.analyzeContext(messages, options);
  return analysis.fitsInContext;
}