/**
 * @fileoverview Response formatting utilities for consistent display across providers
 * @module features/model/response-formatter
 *
 * Provides Pretty_Printer functionality for provider responses and standardized
 * formatting utilities that handle provider-specific response features.
 */

import type {
  StreamChunk,
  TextStreamChunk,
  ToolCallStreamChunk,
  DoneStreamChunk,
  ErrorStreamChunk,
} from '../../shared/types/models.js';
import type { ToolCall } from '../../shared/types/index.js';
import { logger } from '../../shared/utils/index.js';

// =============================================================================
// FORMATTING CONFIGURATION
// =============================================================================

/**
 * Configuration options for response formatting.
 */
export interface FormattingOptions {
  /** Include provider-specific metadata in output */
  includeMetadata?: boolean;
  /** Include token usage information */
  includeUsage?: boolean;
  /** Include timing information */
  includeTiming?: boolean;
  /** Maximum width for formatted output */
  maxWidth?: number;
  /** Indent size for nested structures */
  indentSize?: number;
  /** Whether to colorize output (for terminal display) */
  colorize?: boolean;
  /** Whether to include debug information */
  debug?: boolean;
}

/**
 * Default formatting options.
 */
export const DEFAULT_FORMATTING_OPTIONS: FormattingOptions = {
  includeMetadata: false,
  includeUsage: true,
  includeTiming: false,
  maxWidth: 80,
  indentSize: 2,
  colorize: false,
  debug: false,
};

// =============================================================================
// PROVIDER-SPECIFIC RESPONSE METADATA
// =============================================================================

/**
 * Provider-specific metadata that can be included in formatted output.
 */
export interface ProviderMetadata {
  provider: string;
  model?: string;
  requestId?: string;
  timestamp?: string;
  version?: string;
  region?: string;
  [key: string]: any;
}

/**
 * Extended response information including provider metadata.
 */
export interface FormattedResponse {
  content: string;
  metadata?: ProviderMetadata;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  timing?: {
    startTime: number;
    endTime: number;
    duration: number;
  };
  toolCalls?: ToolCall[];
  errors?: Array<{
    code: string;
    message: string;
  }>;
}

// =============================================================================
// PRETTY PRINTER
// =============================================================================

/**
 * Pretty printer for provider responses with consistent formatting.
 */
export class ResponsePrettyPrinter {
  private options: FormattingOptions;

  constructor(options: Partial<FormattingOptions> = {}) {
    this.options = { ...DEFAULT_FORMATTING_OPTIONS, ...options };
  }

  /**
   * Formats a complete response for display.
   */
  formatResponse(response: FormattedResponse): string {
    const lines: string[] = [];
    const indent = ' '.repeat(this.options.indentSize || 2);

    // Add content
    if (response.content) {
      lines.push(this.formatContent(response.content));
    }

    // Add tool calls
    if (response.toolCalls && response.toolCalls.length > 0) {
      lines.push('');
      lines.push(this.formatToolCalls(response.toolCalls));
    }

    // Add usage information
    if (this.options.includeUsage && response.usage) {
      lines.push('');
      lines.push(this.formatUsage(response.usage));
    }

    // Add timing information
    if (this.options.includeTiming && response.timing) {
      lines.push('');
      lines.push(this.formatTiming(response.timing));
    }

    // Add metadata
    if (this.options.includeMetadata && response.metadata) {
      lines.push('');
      lines.push(this.formatMetadata(response.metadata));
    }

    // Add errors
    if (response.errors && response.errors.length > 0) {
      lines.push('');
      lines.push(this.formatErrors(response.errors));
    }

    return lines.join('\n');
  }

  /**
   * Formats streaming chunks for real-time display.
   */
  formatStreamChunk(chunk: StreamChunk, accumulated: FormattedResponse): string {
    switch (chunk.type) {
      case 'text':
        return this.formatTextChunk(chunk);
      case 'tool_call':
        return this.formatToolCallChunk(chunk);
      case 'done':
        return this.formatDoneChunk(chunk, accumulated);
      case 'error':
        return this.formatErrorChunk(chunk);
      default:
        return '';
    }
  }

  /**
   * Formats provider-specific responses consistently.
   */
  formatProviderResponse(
    provider: string,
    response: any,
    options?: Partial<FormattingOptions>
  ): string {
    const mergedOptions = { ...this.options, ...options };
    const formatter = this.getProviderFormatter(provider);
    
    if (!formatter) {
      logger.warn(`[ResponseFormatter] No formatter found for provider: ${provider}`);
      return this.formatGenericResponse(response);
    }

    return formatter(response, mergedOptions);
  }

  // =============================================================================
  // CHUNK FORMATTERS
  // =============================================================================

  private formatTextChunk(chunk: TextStreamChunk): string {
    return chunk.text;
  }

  private formatToolCallChunk(chunk: ToolCallStreamChunk): string {
    const lines: string[] = [];
    const indent = ' '.repeat(this.options.indentSize || 2);

    lines.push(`\n🔧 Tool Call: ${chunk.name}`);
    
    if (chunk.arguments) {
      try {
        const args = typeof chunk.arguments === 'string' 
          ? JSON.parse(chunk.arguments) 
          : chunk.arguments;
        
        lines.push(`${indent}Arguments:`);
        lines.push(this.formatObject(args, this.options.indentSize! * 2));
      } catch (error) {
        lines.push(`${indent}Arguments: ${chunk.arguments}`);
      }
    }

    return lines.join('\n');
  }

  private formatDoneChunk(chunk: DoneStreamChunk, accumulated: FormattedResponse): string {
    const lines: string[] = [];

    if (chunk.usage && this.options.includeUsage) {
      lines.push('\n' + this.formatUsage(chunk.usage));
    }

    return lines.join('\n');
  }

  private formatErrorChunk(chunk: ErrorStreamChunk): string {
    return `\n❌ Error [${chunk.error.code}]: ${chunk.error.message}`;
  }

  // =============================================================================
  // SECTION FORMATTERS
  // =============================================================================

  private formatContent(content: string): string {
    if (!content) return '';

    const maxWidth = this.options.maxWidth || 80;
    
    // Simple word wrapping
    if (content.length <= maxWidth) {
      return content;
    }

    const words = content.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      if (currentLine.length + word.length + 1 <= maxWidth) {
        currentLine += (currentLine ? ' ' : '') + word;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }
    
    if (currentLine) lines.push(currentLine);
    return lines.join('\n');
  }

  private formatToolCalls(toolCalls: ToolCall[]): string {
    const lines: string[] = [];
    const indent = ' '.repeat(this.options.indentSize || 2);

    lines.push('🔧 Tool Calls:');
    
    for (const toolCall of toolCalls) {
      lines.push(`${indent}• ${toolCall.name}`);
      
      if (toolCall.arguments && Object.keys(toolCall.arguments).length > 0) {
        lines.push(`${indent}  Arguments:`);
        lines.push(this.formatObject(toolCall.arguments, (this.options.indentSize || 2) * 2));
      }
    }

    return lines.join('\n');
  }

  private formatUsage(usage: { inputTokens: number; outputTokens: number; totalTokens?: number }): string {
    const total = usage.totalTokens || (usage.inputTokens + usage.outputTokens);
    return `📊 Token Usage: ${usage.inputTokens} input + ${usage.outputTokens} output = ${total} total`;
  }

  private formatTiming(timing: { startTime: number; endTime: number; duration: number }): string {
    const duration = timing.duration || (timing.endTime - timing.startTime);
    return `⏱️  Timing: ${duration}ms`;
  }

  private formatMetadata(metadata: ProviderMetadata): string {
    const lines: string[] = [];
    const indent = ' '.repeat(this.options.indentSize || 2);

    lines.push('ℹ️  Metadata:');
    lines.push(`${indent}Provider: ${metadata.provider}`);
    
    if (metadata.model) lines.push(`${indent}Model: ${metadata.model}`);
    if (metadata.requestId) lines.push(`${indent}Request ID: ${metadata.requestId}`);
    if (metadata.timestamp) lines.push(`${indent}Timestamp: ${metadata.timestamp}`);
    if (metadata.version) lines.push(`${indent}Version: ${metadata.version}`);
    if (metadata.region) lines.push(`${indent}Region: ${metadata.region}`);

    // Add any additional metadata
    for (const [key, value] of Object.entries(metadata)) {
      if (!['provider', 'model', 'requestId', 'timestamp', 'version', 'region'].includes(key)) {
        lines.push(`${indent}${key}: ${String(value)}`);
      }
    }

    return lines.join('\n');
  }

  private formatErrors(errors: Array<{ code: string; message: string }>): string {
    const lines: string[] = [];
    const indent = ' '.repeat(this.options.indentSize || 2);

    lines.push('❌ Errors:');
    
    for (const error of errors) {
      lines.push(`${indent}• [${error.code}] ${error.message}`);
    }

    return lines.join('\n');
  }

  private formatObject(obj: any, indentLevel: number): string {
    const indent = ' '.repeat(indentLevel);
    const lines: string[] = [];

    if (typeof obj !== 'object' || obj === null) {
      return `${indent}${String(obj)}`;
    }

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'object' && value !== null) {
        lines.push(`${indent}${key}:`);
        lines.push(this.formatObject(value, indentLevel + (this.options.indentSize || 2)));
      } else {
        lines.push(`${indent}${key}: ${String(value)}`);
      }
    }

    return lines.join('\n');
  }

  private formatGenericResponse(response: any): string {
    try {
      return JSON.stringify(response, null, this.options.indentSize || 2);
    } catch (error) {
      return String(response);
    }
  }

  // =============================================================================
  // PROVIDER-SPECIFIC FORMATTERS
  // =============================================================================

  private getProviderFormatter(provider: string): ((response: any, options: FormattingOptions) => string) | null {
    const formatters: Record<string, (response: any, options: FormattingOptions) => string> = {
      openai: this.formatOpenAIResponse.bind(this),
      anthropic: this.formatAnthropicResponse.bind(this),
      google: this.formatGoogleResponse.bind(this),
      openrouter: this.formatOpenRouterResponse.bind(this),
      cohere: this.formatCohereResponse.bind(this),
      mistral: this.formatMistralResponse.bind(this),
      together: this.formatTogetherResponse.bind(this),
      perplexity: this.formatPerplexityResponse.bind(this),
      ollama: this.formatOllamaResponse.bind(this),
    };

    return formatters[provider] || null;
  }

  private formatOpenAIResponse(response: any, options: FormattingOptions): string {
    const lines: string[] = [];

    if (response.choices && response.choices.length > 0) {
      const choice = response.choices[0];
      if (choice.message?.content) {
        lines.push(this.formatContent(choice.message.content));
      }
      
      if (choice.message?.tool_calls) {
        lines.push('');
        lines.push(this.formatToolCalls(choice.message.tool_calls.map((tc: any) => ({
          id: tc.id,
          name: tc.function.name,
          arguments: JSON.parse(tc.function.arguments || '{}'),
        }))));
      }
    }

    if (options.includeUsage && response.usage) {
      lines.push('');
      lines.push(this.formatUsage({
        inputTokens: response.usage.prompt_tokens,
        outputTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
      }));
    }

    if (options.includeMetadata) {
      lines.push('');
      lines.push(this.formatMetadata({
        provider: 'openai',
        model: response.model,
        requestId: response.id,
        timestamp: new Date().toISOString(),
      }));
    }

    return lines.join('\n');
  }

  private formatAnthropicResponse(response: any, options: FormattingOptions): string {
    const lines: string[] = [];

    if (response.content && response.content.length > 0) {
      for (const content of response.content) {
        if (content.type === 'text') {
          lines.push(this.formatContent(content.text));
        } else if (content.type === 'tool_use') {
          if (lines.length > 0) lines.push('');
          lines.push(this.formatToolCalls([{
            id: content.id,
            name: content.name,
            arguments: content.input,
          }]));
        }
      }
    }

    if (options.includeUsage && response.usage) {
      lines.push('');
      lines.push(this.formatUsage({
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      }));
    }

    if (options.includeMetadata) {
      lines.push('');
      lines.push(this.formatMetadata({
        provider: 'anthropic',
        model: response.model,
        requestId: response.id,
        timestamp: new Date().toISOString(),
      }));
    }

    return lines.join('\n');
  }

  private formatGoogleResponse(response: any, options: FormattingOptions): string {
    const lines: string[] = [];

    if (response.candidates && response.candidates.length > 0) {
      const candidate = response.candidates[0];
      
      if (candidate.content?.parts) {
        for (const part of candidate.content.parts) {
          if (part.text) {
            lines.push(this.formatContent(part.text));
          } else if (part.functionCall) {
            if (lines.length > 0) lines.push('');
            lines.push(this.formatToolCalls([{
              id: `google_${part.functionCall.name}_${Date.now()}`,
              name: part.functionCall.name,
              arguments: part.functionCall.args || {},
            }]));
          }
        }
      }
    }

    if (options.includeUsage && response.usageMetadata) {
      lines.push('');
      lines.push(this.formatUsage({
        inputTokens: response.usageMetadata.promptTokenCount || 0,
        outputTokens: response.usageMetadata.candidatesTokenCount || 0,
      }));
    }

    if (options.includeMetadata) {
      lines.push('');
      lines.push(this.formatMetadata({
        provider: 'google',
        model: response.model || 'gemini',
        timestamp: new Date().toISOString(),
      }));
    }

    return lines.join('\n');
  }

  private formatOpenRouterResponse(response: any, options: FormattingOptions): string {
    // OpenRouter uses OpenAI-compatible format
    const formatted = this.formatOpenAIResponse(response, options);
    
    if (options.includeMetadata) {
      const lines = formatted.split('\n');
      const metadataIndex = lines.findIndex(line => line.includes('ℹ️  Metadata:'));
      
      if (metadataIndex !== -1) {
        lines[metadataIndex + 1] = lines[metadataIndex + 1].replace('openai', 'openrouter');
      }
      
      return lines.join('\n');
    }
    
    return formatted;
  }

  private formatCohereResponse(response: any, options: FormattingOptions): string {
    const lines: string[] = [];

    if (response.text) {
      lines.push(this.formatContent(response.text));
    }

    if (response.tool_calls && response.tool_calls.length > 0) {
      lines.push('');
      lines.push(this.formatToolCalls(response.tool_calls.map((tc: any) => ({
        id: `cohere_${tc.name}_${Date.now()}`,
        name: tc.name,
        arguments: tc.parameters,
      }))));
    }

    if (options.includeUsage && response.meta?.tokens) {
      lines.push('');
      lines.push(this.formatUsage({
        inputTokens: response.meta.tokens.input_tokens,
        outputTokens: response.meta.tokens.output_tokens,
      }));
    }

    if (options.includeMetadata) {
      lines.push('');
      lines.push(this.formatMetadata({
        provider: 'cohere',
        model: response.model,
        requestId: response.generation_id,
        timestamp: new Date().toISOString(),
      }));
    }

    return lines.join('\n');
  }

  private formatMistralResponse(response: any, options: FormattingOptions): string {
    // Mistral uses OpenAI-compatible format
    const formatted = this.formatOpenAIResponse(response, options);
    
    if (options.includeMetadata) {
      const lines = formatted.split('\n');
      const metadataIndex = lines.findIndex(line => line.includes('ℹ️  Metadata:'));
      
      if (metadataIndex !== -1) {
        lines[metadataIndex + 1] = lines[metadataIndex + 1].replace('openai', 'mistral');
      }
      
      return lines.join('\n');
    }
    
    return formatted;
  }

  private formatTogetherResponse(response: any, options: FormattingOptions): string {
    // Together uses OpenAI-compatible format
    const formatted = this.formatOpenAIResponse(response, options);
    
    if (options.includeMetadata) {
      const lines = formatted.split('\n');
      const metadataIndex = lines.findIndex(line => line.includes('ℹ️  Metadata:'));
      
      if (metadataIndex !== -1) {
        lines[metadataIndex + 1] = lines[metadataIndex + 1].replace('openai', 'together');
      }
      
      return lines.join('\n');
    }
    
    return formatted;
  }

  private formatPerplexityResponse(response: any, options: FormattingOptions): string {
    const lines: string[] = [];

    if (response.choices && response.choices.length > 0) {
      const choice = response.choices[0];
      if (choice.message?.content) {
        lines.push(this.formatContent(choice.message.content));
      }
    }

    if (options.includeUsage && response.usage) {
      lines.push('');
      lines.push(this.formatUsage({
        inputTokens: response.usage.prompt_tokens,
        outputTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
      }));
    }

    if (options.includeMetadata) {
      lines.push('');
      lines.push(this.formatMetadata({
        provider: 'perplexity',
        model: response.model,
        requestId: response.id,
        timestamp: new Date().toISOString(),
      }));
    }

    return lines.join('\n');
  }

  private formatOllamaResponse(response: any, options: FormattingOptions): string {
    const lines: string[] = [];

    if (response.response) {
      lines.push(this.formatContent(response.response));
    }

    if (options.includeUsage && (response.prompt_eval_count || response.eval_count)) {
      lines.push('');
      lines.push(this.formatUsage({
        inputTokens: response.prompt_eval_count || 0,
        outputTokens: response.eval_count || 0,
      }));
    }

    if (options.includeMetadata) {
      lines.push('');
      lines.push(this.formatMetadata({
        provider: 'ollama',
        model: response.model,
        timestamp: response.created_at || new Date().toISOString(),
      }));
    }

    return lines.join('\n');
  }
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Creates a new ResponsePrettyPrinter with default options.
 */
export function createPrettyPrinter(options?: Partial<FormattingOptions>): ResponsePrettyPrinter {
  return new ResponsePrettyPrinter(options);
}

/**
 * Formats a response using default formatting options.
 */
export function formatResponse(response: FormattedResponse, options?: Partial<FormattingOptions>): string {
  const printer = createPrettyPrinter(options);
  return printer.formatResponse(response);
}

/**
 * Formats a stream chunk using default formatting options.
 */
export function formatStreamChunk(
  chunk: StreamChunk,
  accumulated: FormattedResponse,
  options?: Partial<FormattingOptions>
): string {
  const printer = createPrettyPrinter(options);
  return printer.formatStreamChunk(chunk, accumulated);
}

/**
 * Formats a provider-specific response using default formatting options.
 */
export function formatProviderResponse(
  provider: string,
  response: any,
  options?: Partial<FormattingOptions>
): string {
  const printer = createPrettyPrinter(options);
  return printer.formatProviderResponse(provider, response, options);
}

/**
 * Converts StreamChunks to a FormattedResponse for display.
 */
export function accumulateStreamChunks(chunks: StreamChunk[]): FormattedResponse {
  const result: FormattedResponse = {
    content: '',
    toolCalls: [],
    errors: [],
  };

  for (const chunk of chunks) {
    switch (chunk.type) {
      case 'text':
        result.content += chunk.text;
        break;
        
      case 'tool_call':
        result.toolCalls!.push({
          id: chunk.id,
          name: chunk.name,
          arguments: typeof chunk.arguments === 'string' 
            ? JSON.parse(chunk.arguments) 
            : chunk.arguments,
        });
        break;
        
      case 'done':
        if (chunk.usage) {
          result.usage = {
            inputTokens: chunk.usage.inputTokens,
            outputTokens: chunk.usage.outputTokens,
            totalTokens: chunk.usage.inputTokens + chunk.usage.outputTokens,
          };
        }
        break;
        
      case 'error':
        result.errors!.push({
          code: chunk.error.code,
          message: chunk.error.message,
        });
        break;
    }
  }

  return result;
}