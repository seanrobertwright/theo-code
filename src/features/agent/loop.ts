/**
 * @fileoverview Agent loop orchestration
 * @module features/agent/loop
 *
 * Implements the core agent loop that:
 * 1. Sends messages to the model adapter
 * 2. Processes streaming responses
 * 3. Handles tool calls (when implemented)
 * 4. Updates the store with results
 */

import type { Message, ToolCall } from '../../shared/types/index.js';
import type { StreamChunk, ModelConfig } from '../../shared/types/models.js';
import type { IModelAdapter } from '../model/adapters/types.js';
import { OpenAIAdapter } from '../model/adapters/openai.js';
import { useAppStore } from '../../shared/store/index.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Options for the agent loop.
 */
export interface AgentLoopOptions {
  /** Model configuration */
  modelConfig: ModelConfig;
  /** Maximum iterations for tool calls */
  maxIterations?: number;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

/**
 * Token usage info.
 */
interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

/**
 * Result of an agent loop execution.
 */
export interface AgentLoopResult {
  /** Whether the execution completed successfully */
  success: boolean;
  /** Final assistant message content */
  content: string;
  /** Tool calls that were made */
  toolCalls: ToolCall[];
  /** Token usage */
  usage?: TokenUsage;
  /** Error if any */
  error?: string;
}

/**
 * Internal state during stream processing.
 */
interface StreamState {
  content: string;
  toolCalls: ToolCall[];
  usage?: TokenUsage;
  error?: string;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Parses tool call arguments from JSON string.
 */
function parseToolArguments(argsString: string): Record<string, unknown> {
  try {
    return JSON.parse(argsString) as Record<string, unknown>;
  } catch {
    return { raw: argsString };
  }
}

/**
 * Processes a text chunk.
 */
function processTextChunk(text: string, state: StreamState): StreamState {
  const store = useAppStore.getState();
  store.appendStreamingText(text);
  return { ...state, content: state.content + text };
}

/**
 * Processes a tool call chunk.
 */
function processToolCallChunk(
  chunk: Extract<StreamChunk, { type: 'tool_call' }>,
  state: StreamState
): StreamState {
  const toolCall: ToolCall = {
    id: chunk.id as ToolCall['id'],
    name: chunk.name,
    arguments: parseToolArguments(chunk.arguments),
  };
  return {
    ...state,
    toolCalls: [...state.toolCalls, toolCall],
  };
}

/**
 * Processes a done chunk.
 */
function processDoneChunk(
  chunk: Extract<StreamChunk, { type: 'done' }>,
  state: StreamState
): StreamState {
  if (chunk.usage === undefined) {
    return state;
  }

  const result: StreamState = {
    content: state.content,
    toolCalls: state.toolCalls,
    usage: chunk.usage,
  };

  if (state.error !== undefined) {
    result.error = state.error;
  }

  return result;
}

/**
 * Processes an error chunk.
 */
function processErrorChunk(
  chunk: Extract<StreamChunk, { type: 'error' }>,
  state: StreamState
): StreamState {
  return { ...state, error: chunk.error.message };
}

/**
 * Commits tool call message to store.
 */
function commitToolCallMessage(state: StreamState): void {
  const store = useAppStore.getState();
  const content = state.content.length > 0 ? state.content : 'I need to use some tools.';

  store.addMessage({
    role: 'assistant',
    content,
    toolCalls: state.toolCalls,
  });

  for (const toolCall of state.toolCalls) {
    store.addPendingToolCall(toolCall);
  }
}

/**
 * Commits assistant message to store.
 */
function commitAssistantMessage(state: StreamState): void {
  const store = useAppStore.getState();

  const messageData: Parameters<typeof store.addMessage>[0] = {
    role: 'assistant',
    content: state.content,
  };

  if (state.usage !== undefined) {
    messageData.tokens = {
      input: state.usage.inputTokens,
      output: state.usage.outputTokens,
    };
  }

  store.addMessage(messageData);
}

/**
 * Updates session token counts.
 */
function updateSessionTokens(usage: TokenUsage): void {
  const store = useAppStore.getState();
  const currentSession = store.session;

  if (currentSession === null) {
    return;
  }

  store.updateSessionTokens({
    total: currentSession.tokenCount.total + usage.inputTokens + usage.outputTokens,
    input: currentSession.tokenCount.input + usage.inputTokens,
    output: currentSession.tokenCount.output + usage.outputTokens,
  });
}

// =============================================================================
// AGENT LOOP CLASS
// =============================================================================

/**
 * Agent loop orchestrator.
 *
 * Manages the conversation flow between the user, model, and tools.
 *
 * @example
 * ```typescript
 * const agent = new AgentLoop({
 *   modelConfig: {
 *     provider: 'openai',
 *     model: 'gpt-4o',
 *     apiKey: process.env.OPENAI_API_KEY,
 *     contextLimit: 128000,
 *     maxOutputTokens: 4096,
 *   },
 * });
 *
 * await agent.run();
 * ```
 */
export class AgentLoop {
  private readonly adapter: IModelAdapter;
  private readonly _maxIterations: number;
  private aborted = false;

  constructor(options: AgentLoopOptions) {
    this._maxIterations = options.maxIterations ?? 10;
    this.adapter = this.createAdapter(options.modelConfig);

    if (options.signal !== undefined) {
      options.signal.addEventListener('abort', () => {
        this.aborted = true;
      });
    }
  }

  /**
   * Creates the appropriate adapter based on config.
   */
  private createAdapter(config: ModelConfig): IModelAdapter {
    if (config.provider === 'openai') {
      return new OpenAIAdapter(config);
    }

    // TODO: Implement other adapters
    throw new Error(`Provider ${config.provider} not yet implemented`);
  }

  /**
   * Runs the agent loop for a single turn.
   */
  async run(): Promise<AgentLoopResult> {
    const store = useAppStore.getState();
    const messages = store.messages;

    store.setStreaming(true);
    store.clearStreamingText();

    try {
      const state = await this.processStream(messages);
      this.commitResults(state);
      return this.buildResult(state);
    } catch (err) {
      return this.handleError(err);
    } finally {
      store.setStreaming(false);
      store.clearStreamingText();
    }
  }

  /**
   * Processes the stream and builds state.
   */
  private async processStream(messages: Message[]): Promise<StreamState> {
    let state: StreamState = { content: '', toolCalls: [] };

    for await (const chunk of this.adapter.generateStream(messages)) {
      if (this.aborted) {
        state = { ...state, error: 'Aborted by user' };
        break;
      }

      state = this.processChunk(chunk, state);

      if (state.error !== undefined) {
        break;
      }
    }

    return state;
  }

  /**
   * Processes a single stream chunk.
   */
  private processChunk(chunk: StreamChunk, state: StreamState): StreamState {
    switch (chunk.type) {
      case 'text':
        return processTextChunk(chunk.text, state);
      case 'tool_call':
        return processToolCallChunk(chunk, state);
      case 'done':
        return processDoneChunk(chunk, state);
      case 'error':
        return processErrorChunk(chunk, state);
      default:
        return state;
    }
  }

  /**
   * Commits results to the store.
   */
  private commitResults(state: StreamState): void {
    if (state.toolCalls.length > 0) {
      commitToolCallMessage(state);
    } else if (state.content.length > 0) {
      commitAssistantMessage(state);
    }

    if (state.usage !== undefined) {
      updateSessionTokens(state.usage);
    }
  }

  /**
   * Builds the result object.
   */
  private buildResult(state: StreamState): AgentLoopResult {
    const result: AgentLoopResult = {
      success: state.error === undefined,
      content: state.content,
      toolCalls: state.toolCalls,
    };

    if (state.usage !== undefined) {
      result.usage = state.usage;
    }
    if (state.error !== undefined) {
      result.error = state.error;
    }

    return result;
  }

  /**
   * Handles errors during execution.
   */
  private handleError(err: unknown): AgentLoopResult {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    useAppStore.getState().setError(errorMessage);

    return {
      success: false,
      content: '',
      toolCalls: [],
      error: errorMessage,
    };
  }

  /**
   * Counts tokens for the current conversation.
   */
  countTokens(messages: Message[]): number {
    return this.adapter.countTokens(messages);
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Creates an agent loop with the given configuration.
 */
export function createAgentLoop(options: AgentLoopOptions): AgentLoop {
  return new AgentLoop(options);
}
