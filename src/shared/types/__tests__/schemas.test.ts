/**
 * @fileoverview Tests for Zod schemas
 * @module shared/types/__tests__/schemas.test
 */

import { describe, it, expect } from 'vitest';
import {
  MessageIdSchema,
  SessionIdSchema,
  ToolCallIdSchema,
  FilePathSchema,
  MessageSchema,
  SessionSchema,
  ToolCallSchema,
  ToolResultSchema,
  UniversalToolDefinitionSchema,
  createMessageId,
  createSessionId,
  createToolCallId,
  createFilePath,
} from '../schemas.js';

describe('Branded ID Schemas', () => {
  describe('MessageIdSchema', () => {
    it('should accept valid UUIDs', () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      const result = MessageIdSchema.safeParse(validUuid);
      expect(result.success).toBe(true);
    });

    it('should reject invalid UUIDs', () => {
      const result = MessageIdSchema.safeParse('not-a-uuid');
      expect(result.success).toBe(false);
    });
  });

  describe('SessionIdSchema', () => {
    it('should accept valid UUIDs', () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      const result = SessionIdSchema.safeParse(validUuid);
      expect(result.success).toBe(true);
    });
  });

  describe('ToolCallIdSchema', () => {
    it('should accept non-empty strings', () => {
      const result = ToolCallIdSchema.safeParse('call_123');
      expect(result.success).toBe(true);
    });

    it('should reject empty strings', () => {
      const result = ToolCallIdSchema.safeParse('');
      expect(result.success).toBe(false);
    });
  });

  describe('FilePathSchema', () => {
    it('should accept non-empty strings', () => {
      const result = FilePathSchema.safeParse('/path/to/file.ts');
      expect(result.success).toBe(true);
    });
  });
});

describe('Helper Functions', () => {
  describe('createMessageId', () => {
    it('should create a valid MessageId', () => {
      const id = createMessageId();
      expect(typeof id).toBe('string');
      expect(id.length).toBe(36); // UUID length
    });
  });

  describe('createSessionId', () => {
    it('should create a valid SessionId', () => {
      const id = createSessionId();
      expect(typeof id).toBe('string');
      expect(id.length).toBe(36);
    });
  });

  describe('createToolCallId', () => {
    it('should create a branded ToolCallId', () => {
      const id = createToolCallId('call_123');
      expect(id).toBe('call_123');
    });

    it('should throw for empty string', () => {
      expect(() => createToolCallId('')).toThrow();
    });
  });

  describe('createFilePath', () => {
    it('should create a branded FilePath', () => {
      const path = createFilePath('/src/file.ts');
      expect(path).toBe('/src/file.ts');
    });
  });
});

describe('MessageSchema', () => {
  it('should accept valid user message', () => {
    const message = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      role: 'user',
      content: 'Hello, world!',
      timestamp: Date.now(),
    };
    const result = MessageSchema.safeParse(message);
    expect(result.success).toBe(true);
  });

  it('should accept assistant message with tokens', () => {
    const message = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      role: 'assistant',
      content: 'Hello!',
      timestamp: Date.now(),
      model: 'gpt-4o',
      tokens: { input: 10, output: 5 },
    };
    const result = MessageSchema.safeParse(message);
    expect(result.success).toBe(true);
  });

  it('should reject invalid role', () => {
    const message = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      role: 'invalid',
      content: 'Hello',
      timestamp: Date.now(),
    };
    const result = MessageSchema.safeParse(message);
    expect(result.success).toBe(false);
  });
});

describe('ToolCallSchema', () => {
  it('should accept valid tool call', () => {
    const toolCall = {
      id: 'call_123',
      name: 'read_file',
      arguments: { path: '/src/file.ts' },
    };
    const result = ToolCallSchema.safeParse(toolCall);
    expect(result.success).toBe(true);
  });
});

describe('ToolResultSchema', () => {
  it('should accept valid tool result', () => {
    const toolResult = {
      toolCallId: 'call_123',
      content: 'File contents here',
      isError: false,
    };
    const result = ToolResultSchema.safeParse(toolResult);
    expect(result.success).toBe(true);
  });

  it('should default isError to false', () => {
    const toolResult = {
      toolCallId: 'call_123',
      content: 'File contents here',
    };
    const result = ToolResultSchema.safeParse(toolResult);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isError).toBe(false);
    }
  });
});

describe('UniversalToolDefinitionSchema', () => {
  it('should accept valid tool definition', () => {
    const toolDef = {
      name: 'read_file',
      description: 'Read contents of a file',
      parameters: {
        type: 'object' as const,
        properties: {
          path: { type: 'string' as const, description: 'File path' },
        },
        required: ['path'],
      },
    };
    const result = UniversalToolDefinitionSchema.safeParse(toolDef);
    expect(result.success).toBe(true);
  });

  it('should reject tool name with invalid characters', () => {
    const toolDef = {
      name: 'read-file', // hyphens not allowed
      description: 'Read contents of a file',
      parameters: {
        type: 'object' as const,
        properties: {},
        required: [],
      },
    };
    const result = UniversalToolDefinitionSchema.safeParse(toolDef);
    expect(result.success).toBe(false);
  });
});

describe('SessionSchema', () => {
  it('should accept valid session', () => {
    const session = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      created: Date.now(),
      lastModified: Date.now(),
      model: 'gpt-4o',
      tokenCount: { total: 100, input: 80, output: 20 },
      filesAccessed: ['/src/file.ts'],
      messages: [],
      contextFiles: [],
    };
    const result = SessionSchema.safeParse(session);
    expect(result.success).toBe(true);
  });
});
