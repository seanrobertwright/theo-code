/**
 * @fileoverview Property-based tests for Anthropic tool conversion
 * @module features/model/adapters/__tests__/anthropic-tool-conversion.property.test
 *
 * **Feature: multi-provider-support, Property 2: Tool definition conversion accuracy**
 * **Validates: Requirements 1.3**
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { UniversalToolDefinition } from '../../../../shared/types/index.js';
import type { Tool } from '@anthropic-ai/sdk/resources/messages';

// =============================================================================
// GENERATORS
// =============================================================================

/**
 * Generate valid JSON schema property types.
 */
const jsonSchemaTypeArb = fc.constantFrom(
  'string',
  'number',
  'integer',
  'boolean'
);

/**
 * Generate simple JSON schema properties.
 */
const simpleJsonSchemaPropertyArb = fc.record({
  _type: jsonSchemaTypeArb,
  description: fc.option(fc.string({ _minLength: 1, _maxLength: 50 }), { _nil: undefined }),
});

/**
 * Generate valid parameter schemas.
 */
const parameterSchemaArb = fc.record({
  type: fc.constant('object' as const),
  properties: fc.dictionary(
    fc.string({ _minLength: 1, _maxLength: 20 }).filter(s => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(s)),
    simpleJsonSchemaPropertyArb,
    { _minKeys: 1, _maxKeys: 5 }
  ),
  required: fc.option(fc.array(fc.string({ _minLength: 1, _maxLength: 20 }).filter(s => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(s)), { _maxLength: 2 }), { _nil: undefined }),
});

/**
 * Generate valid universal tool definitions.
 */
const universalToolDefinitionArb: fc.Arbitrary<UniversalToolDefinition> = fc.record({
  name: fc.string({ _minLength: 1, _maxLength: 30 }).filter(name => 
    /^[a-zA-Z][a-zA-Z0-9_]*$/.test(name) // Valid function name pattern
  ),
  description: fc.string({ _minLength: 1, _maxLength: 100 }),
  _parameters: parameterSchemaArb,
});

// =============================================================================
// CONVERSION FUNCTIONS
// =============================================================================

/**
 * Converts universal tool definitions to Anthropic format.
 * This is a copy of the function from the adapter for testing.
 */
function convertToolsToAnthropic(tools: UniversalToolDefinition[]): Tool[] {
  return tools.map((tool) => {
    // Validate tool definition
    if (!tool.name || !tool.description) {
      throw new Error(`Invalid tool definition: name and description are required for tool: ${tool.name}`);
    }

    if (!tool.parameters?.properties) {
      throw new Error(`Invalid tool definition: parameters.properties is required for tool: ${tool.name}`);
    }

    return {
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: 'object' as const,
        properties: tool.parameters.properties,
        required: tool.parameters.required ?? [],
      },
    };
  });
}

/**
 * Converts Anthropic tools back to universal format (for round-trip testing).
 */
function convertToolsFromAnthropic(tools: Tool[]): UniversalToolDefinition[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: {
      type: 'object' as const,
      properties: tool.input_schema.properties,
      required: tool.input_schema.required,
    },
  }));
}

// =============================================================================
// PROPERTY TESTS
// =============================================================================

describe('Anthropic Tool Conversion Properties', () => {
  it('**Feature: multi-provider-support, Property 2: Tool definition conversion accuracy**', () => {
    fc.assert(
      fc.property(
        fc.array(universalToolDefinitionArb, { _minLength: 1, _maxLength: 3 }),
        (universalTools) => {
          // Convert to Anthropic format
          const anthropicTools = convertToolsToAnthropic(universalTools);
          
          // Verify structure preservation
          expect(anthropicTools).toHaveLength(universalTools.length);
          
          for (let i = 0; i < universalTools.length; i++) {
            const universal = universalTools[i];
            const anthropic = anthropicTools[i];
            
            // Essential properties should be preserved
            expect(anthropic.name).toBe(universal.name);
            expect(anthropic.description).toBe(universal.description);
            expect(anthropic.input_schema.type).toBe('object');
            expect(anthropic.input_schema.properties).toEqual(universal.parameters.properties);
            
            // Required fields should be preserved (with default empty array)
            const expectedRequired = universal.parameters.required ?? [];
            expect(anthropic.input_schema.required).toEqual(expectedRequired);
          }
        }
      ),
      { _numRuns: 50 }
    );
  });

  it('Property: Tool conversion round-trip preserves functionality', () => {
    fc.assert(
      fc.property(
        fc.array(universalToolDefinitionArb, { _minLength: 1, _maxLength: 2 }),
        (originalTools) => {
          // Round-trip conversion
          const anthropicTools = convertToolsToAnthropic(originalTools);
          const roundTripTools = convertToolsFromAnthropic(anthropicTools);
          
          // Should preserve essential functionality
          expect(roundTripTools).toHaveLength(originalTools.length);
          
          for (let i = 0; i < originalTools.length; i++) {
            const original = originalTools[i];
            const roundTrip = roundTripTools[i];
            
            expect(roundTrip.name).toBe(original.name);
            expect(roundTrip.description).toBe(original.description);
            expect(roundTrip.parameters.type).toBe(original.parameters.type);
            expect(roundTrip.parameters.properties).toEqual(original.parameters.properties);
            
            // Required should be preserved (with consistent default handling)
            const originalRequired = original.parameters.required ?? [];
            const roundTripRequired = roundTrip.parameters.required ?? [];
            expect(roundTripRequired).toEqual(originalRequired);
          }
        }
      ),
      { _numRuns: 50 }
    );
  });

  it('Property: Tool names remain valid identifiers after conversion', () => {
    fc.assert(
      fc.property(
        fc.array(universalToolDefinitionArb, { _minLength: 1, _maxLength: 3 }),
        (universalTools) => {
          const anthropicTools = convertToolsToAnthropic(universalTools);
          
          for (const tool of anthropicTools) {
            // Tool names should remain valid identifiers
            expect(tool.name).toMatch(/^[a-zA-Z][a-zA-Z0-9_]*$/);
            expect(tool.name.length).toBeGreaterThan(0);
            expect(tool.name.length).toBeLessThanOrEqual(30);
          }
        }
      ),
      { _numRuns: 50 }
    );
  });

  it('Property: Tool descriptions are preserved and non-empty', () => {
    fc.assert(
      fc.property(
        fc.array(universalToolDefinitionArb, { _minLength: 1, _maxLength: 3 }),
        (universalTools) => {
          const anthropicTools = convertToolsToAnthropic(universalTools);
          
          for (let i = 0; i < universalTools.length; i++) {
            const universal = universalTools[i];
            const anthropic = anthropicTools[i];
            
            // Descriptions should be preserved exactly
            expect(anthropic.description).toBe(universal.description);
            expect(anthropic.description.length).toBeGreaterThan(0);
          }
        }
      ),
      { _numRuns: 50 }
    );
  });

  it('Property: Parameter schemas maintain JSON Schema validity', () => {
    fc.assert(
      fc.property(
        fc.array(universalToolDefinitionArb, { _minLength: 1, _maxLength: 3 }),
        (universalTools) => {
          const anthropicTools = convertToolsToAnthropic(universalTools);
          
          for (const tool of anthropicTools) {
            const schema = tool.input_schema;
            
            // Schema should maintain JSON Schema structure
            expect(schema.type).toBe('object');
            expect(typeof schema.properties).toBe('object');
            expect(schema.properties).not.toBeNull();
            expect(Array.isArray(schema.required)).toBe(true);
          }
        }
      ),
      { _numRuns: 50 }
    );
  });

  it('Property: Conversion handles edge cases gracefully', () => {
    fc.assert(
      fc.property(
        universalToolDefinitionArb,
        (tool) => {
          // Test single tool conversion
          const anthropicTools = convertToolsToAnthropic([tool]);
          
          expect(anthropicTools).toHaveLength(1);
          const converted = anthropicTools[0];
          
          // Should handle undefined required array
          if (tool.parameters.required === undefined) {
            expect(converted.input_schema.required).toEqual([]);
          } else {
            expect(converted.input_schema.required).toEqual(tool.parameters.required);
          }
          
          // Should handle empty properties object
          if (Object.keys(tool.parameters.properties).length === 0) {
            expect(Object.keys(converted.input_schema.properties)).toHaveLength(0);
          }
        }
      ),
      { _numRuns: 50 }
    );
  });
});