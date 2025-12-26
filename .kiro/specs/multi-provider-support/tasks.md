# Implementation Plan: Multi-Provider AI Support

## Overview

Implement support for multiple AI providers (Anthropic Claude, Google Gemini, OpenRouter, Cohere, Mistral, Together, Perplexity, enhanced Ollama) while maintaining the existing Universal Model Adapter Layer (UMAL) interface.

## Task List

- [x] 1. Enhance provider infrastructure and configuration
  - Extend provider configuration system
  - Implement provider manager for orchestration
  - Add provider validation and health checking
  - _Requirements: 5.1, 5.2, 5.4, 5.5_

- [x] 1.1 Extend model configuration schema
  - Add new provider types to ModelProviderSchema
  - Extend ModelConfig with provider-specific options
  - Add fallback provider configuration
  - Add rate limiting configuration
  - _Requirements: 5.1, 5.4_

- [x] 1.2 Write property test for configuration validation

  - **Property 8: Configuration serialization round-trip**
  - **Validates: Requirements 10.4**

- [x] 1.3 Implement ProviderManager class
  - Create provider registration and discovery
  - Implement adapter factory with fallback logic
  - Add provider health monitoring
  - Add rate limiting coordination
  - _Requirements: 5.2, 5.3, 7.3_

- [x] 1.4 Write property test for fallback provider selection

  - **Property 6: Fallback provider selection**
  - **Validates: Requirements 5.3, 7.3**
  - **Status: COMPLETED** - All 5 property tests pass successfully
  - **Fix Applied**: Resolved state pollution between test iterations by creating fresh ProviderManager instances per property iteration

- [x] 1.5 Add provider configuration validation
  - Implement API key validation for each provider
  - Add connectivity testing
  - Create configuration validation utilities
  - _Requirements: 5.1, 7.1_

- [x] 1.6 Write property test for authentication validation

  - **Property 3: Authentication validation completeness**
  - **Validates: Requirements 1.1, 2.1, 3.1, 5.1**

- [x] 2. Implement Anthropic Claude adapter
  - Build Anthropic Messages API integration
  - Support Claude 3.5 Sonnet, Opus, and Haiku models
  - Implement streaming and tool calling
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

- [x] 2.1 Create AnthropicAdapter class
  - Implement IModelAdapter interface
  - Add Anthropic Messages API client integration
  - Implement message format conversion
  - Support system message handling
  - _Requirements: 1.1, 1.2_

- [x] 2.2 Implement Anthropic streaming support
  - Add Server-Sent Events processing
  - Implement StreamChunk conversion
  - Handle streaming tool calls
  - Add error handling for stream interruptions
  - _Requirements: 1.2_

- [x] 2.3 Add Anthropic tool calling support
  - Convert Universal Tool Definitions to Anthropic format
  - Implement tool call parsing from responses
  - Handle tool call streaming accumulation
  - _Requirements: 1.3_

- [x] 2.4 Implement Anthropic token counting
  - Integrate with Anthropic's token counting API
  - Add fallback estimation method
  - Cache token counts for performance
  - _Requirements: 1.5_

- [x] 2.5 Write property test for Anthropic tool conversion

  - **Property 2: Tool definition conversion accuracy**
  - **Validates: Requirements 1.3**

- [x] 2.6 Write property test for Anthropic error mapping

  - **Property 4: Error code mapping consistency**
  - **Validates: Requirements 1.6**

- [ ] 3. Implement Google Gemini adapter with advanced features
  - Build Google Generative AI integration with Gemini 2.0/3.0 support
  - Support latest models: Gemini 3.0 Pro, Flash, 2.0 Flash, 2.0 Flash Thinking
  - Implement advanced features: thinking levels, thought signatures, image generation
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10_

- [ ] 3.1 Create GoogleAdapter class with Gemini 3.0 support
  - Implement IModelAdapter interface
  - Add Google Generative AI SDK integration
  - Support Gemini 3.0 Pro, Flash, and Image models
  - Support Gemini 2.0 Flash and Flash Thinking models
  - Implement message format conversion
  - Configure safety settings and generation parameters
  - _Requirements: 2.1, 2.2_

- [ ] 3.2 Implement Google streaming support with advanced features
  - Add generateContentStream integration
  - Implement StreamChunk conversion
  - Handle streaming function calls
  - Support thought signature streaming
  - Add error handling for stream failures
  - _Requirements: 2.2_

- [ ] 3.3 Add Google function calling and structured outputs
  - Convert Universal Tool Definitions to Google format
  - Implement function call parsing from responses
  - Handle function call streaming
  - Support structured outputs with JSON schema
  - Integrate with built-in tools (Search, Code Execution)
  - _Requirements: 2.3_

- [ ] 3.4 Implement Gemini 3.0 thinking levels and reasoning
  - Add thinking level parameter support (low, medium, high)
  - Implement thought signature handling for reasoning continuity
  - Support multi-turn reasoning with signature preservation
  - Handle parallel and sequential function calling with signatures
  - Add migration support for conversations from other models
  - _Requirements: 2.5, 2.7_

- [ ] 3.5 Add multimodal and media resolution controls
  - Implement media resolution parameters (low, medium, high, ultra_high)
  - Support image, video, and audio input processing
  - Add optimal resolution recommendations per media type
  - Handle token allocation for different resolution levels
  - _Requirements: 2.6_

- [ ] 3.6 Implement native image generation capabilities
  - Add support for Gemini 3.0 Pro Image model
  - Implement image generation with text prompts
  - Support conversational image editing
  - Add aspect ratio and image size controls
  - Integrate with Google Search grounding for image generation
  - _Requirements: 2.8_

- [ ] 3.7 Implement Google token counting and optimization
  - Integrate with Google's countTokens API
  - Add fallback estimation method
  - Handle token counting for multimodal content
  - Implement caching for token count results
  - Handle token counting errors gracefully
  - _Requirements: 2.9_

- [ ] 3.8 Write property test for Google tool conversion and advanced features

  - **Property 2: Tool definition conversion accuracy**
  - Test Universal Tool Definition to Google format conversion
  - Test structured outputs with JSON schema
  - Test built-in tool integration (Search, Code Execution)
  - **Validates: Requirements 2.3**

- [ ] 3.9 Write property test for Google error mapping

  - **Property 4: Error code mapping consistency**
  - Test Google API error mapping to standard codes
  - Test streaming error handling
  - Test multimodal processing errors
  - **Validates: Requirements 2.10**

- [ ] 3.10 Write property test for thinking level consistency

  - Test thinking level parameter effects on reasoning
  - Test thought signature preservation across turns
  - Test reasoning continuity in multi-turn conversations
  - **Validates: Requirements 2.5, 2.7**

- [ ] 3.11 Write unit tests for Gemini 3.0 advanced features

  - Test thinking level configuration
  - Test thought signature handling
  - Test media resolution controls
  - Test image generation capabilities
  - Test multimodal input processing
  - _Requirements: 2.5, 2.6, 2.7, 2.8_

- [ ] 4. Implement OpenRouter adapter
  - Build OpenRouter unified API integration
  - Support dynamic model catalog
  - Implement OpenAI-compatible interface
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [ ] 4.1 Create OpenRouterAdapter class
  - Implement IModelAdapter interface
  - Add OpenRouter API client integration
  - Implement model catalog discovery
  - Handle credit-based billing tracking
  - _Requirements: 3.1, 3.4_

- [ ] 4.2 Implement OpenRouter streaming support
  - Use OpenAI-compatible streaming format
  - Implement StreamChunk conversion
  - Handle model-specific streaming differences
  - _Requirements: 3.2_

- [ ] 4.3 Add OpenRouter tool calling support
  - Use OpenAI-compatible tool format
  - Handle model-specific tool calling capabilities
  - Implement tool call parsing
  - _Requirements: 3.3_

- [ ] 4.4 Implement OpenRouter token counting
  - Use OpenRouter's token counting endpoint
  - Add model-specific token counting
  - Handle rate limits for token counting
  - _Requirements: 3.5_

- [ ] 4.5 Write property test for OpenRouter model catalog

  - **Property 10: Model capability detection accuracy**
  - **Validates: Requirements 6.1, 6.2, 6.4**

- [ ] 4.6 Write unit tests for OpenRouter integration

  - Test model catalog loading
  - Test credit tracking
  - Verify OpenAI compatibility
  - _Requirements: 3.1, 3.4_

- [ ] 5. Implement additional provider adapters
  - Build Cohere, Mistral, Together, Perplexity adapters
  - Enhance existing Ollama adapter
  - Support provider-specific features
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

- [ ] 5.1 Create Cohere adapter
  - Implement Cohere Chat API integration
  - Add streaming and tool calling support
  - Handle enterprise features
  - _Requirements: 4.1_

- [ ] 5.2 Create Mistral adapter
  - Implement Mistral API integration
  - Add function calling support
  - Handle European compliance features
  - _Requirements: 4.2_

- [ ] 5.3 Create Together adapter
  - Implement Together Inference API integration
  - Support open-source model catalog
  - Handle custom model deployment
  - _Requirements: 4.3_

- [ ] 5.4 Create Perplexity adapter
  - Implement Perplexity API integration
  - Support search-augmented generation
  - Handle real-time information features
  - _Requirements: 4.4_

- [ ] 5.5 Enhance Ollama adapter
  - Improve local model management
  - Add model installation and updates
  - Implement better error handling
  - Support more model formats
  - _Requirements: 4.5_

- [ ] 5.6 Write property test for provider interface consistency

  - **Property 1: Provider interface consistency**
  - **Validates: Requirements 1.2, 2.2, 3.2**

- [ ] 5.7 Write property test for token counting accuracy

  - **Property 5: Token counting accuracy**
  - **Validates: Requirements 1.5, 2.5, 3.5**

- [ ] 6. Implement error handling and resilience
  - Add comprehensive error mapping
  - Implement retry logic with backoff
  - Add circuit breaker patterns
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

- [ ] 6.1 Create unified error handling system
  - Implement AdapterError extensions
  - Add provider-specific error mapping
  - Create error recovery strategies
  - _Requirements: 7.1, 7.4_

- [ ] 6.2 Implement retry logic with backoff
  - Add exponential backoff for rate limits
  - Implement configurable retry strategies
  - Handle different error types appropriately
  - _Requirements: 7.2, 7.4_

- [ ] 6.3 Add circuit breaker implementation
  - Implement circuit breaker for provider failures
  - Add health monitoring and recovery
  - Configure failure thresholds
  - _Requirements: 7.3_

- [ ] 6.4 Implement context limit handling
  - Add automatic message truncation
  - Implement smart context window management
  - Handle context overflow gracefully
  - _Requirements: 7.5_

- [ ] 6.5 Write property test for rate limit compliance

  - **Property 7: Rate limit compliance**
  - **Validates: Requirements 7.2, 8.4**

- [ ] 6.6 Write unit tests for error handling

  - Test error mapping accuracy
  - Test retry logic behavior
  - Test circuit breaker functionality
  - _Requirements: 7.1, 7.2, 7.3_

- [ ] 7. Implement performance optimizations
  - Add HTTP connection pooling
  - Implement request queuing
  - Add caching for token counting
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

- [ ] 7.1 Implement HTTP connection pooling
  - Add connection reuse across requests
  - Configure connection limits per provider
  - Handle connection lifecycle management
  - _Requirements: 8.1_

- [ ] 7.2 Add request queuing and batching
  - Implement request queues for rate limiting
  - Add batch request support where available
  - Handle queue overflow and prioritization
  - _Requirements: 8.4, 8.5_

- [ ] 7.3 Implement caching strategies
  - Add token count caching
  - Implement model capability caching
  - Add response caching for identical requests
  - _Requirements: 8.3_

- [ ] 7.4 Add performance monitoring
  - Implement response time tracking
  - Add throughput monitoring
  - Create performance dashboards
  - _Requirements: 8.6_

- [ ] 7.5 Write performance tests
  - Test concurrent request handling
  - Benchmark response times across providers
  - Test memory usage under load
  - _Requirements: 8.1, 8.2, 8.6_

- [ ] 7.6 Write unit tests for performance features

  - Test connection pooling behavior
  - Test request queuing logic
  - Test caching effectiveness
  - _Requirements: 8.1, 8.3, 8.4_

- [ ] 8. Implement response format standardization
  - Add StreamChunk conversion utilities
  - Implement response parsing and formatting
  - Add round-trip validation
  - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [ ] 8.1 Create response format converters
  - Implement provider-specific to StreamChunk conversion
  - Add tool call format standardization
  - Handle streaming response normalization
  - _Requirements: 9.1, 9.2_

- [ ] 8.2 Implement response formatting utilities
  - Add Pretty_Printer for provider responses
  - Implement consistent formatting across providers
  - Handle provider-specific response features
  - _Requirements: 9.3_

- [ ] 8.3 Write property test for response standardization

  - **Property 9: Response format standardization**
  - **Validates: Requirements 9.1, 9.2**

- [ ] 8.4 Write property test for format round-trips

  - Test parsing then formatting preserves data
  - Verify round-trip consistency
  - _Requirements: 9.4**

- [ ] 9. Update configuration and CLI integration
  - Extend configuration schemas
  - Update CLI commands for provider management
  - Add provider selection UI
  - _Requirements: 5.1, 5.2, 5.5, 5.6_

- [ ] 9.1 Extend configuration system
  - Update global and project configuration schemas
  - Add provider-specific configuration sections
  - Implement configuration validation
  - _Requirements: 5.1, 5.4_

- [ ] 9.2 Add provider management CLI commands
  - Implement `/provider` command family
  - Add provider listing and status commands
  - Create provider switching commands
  - _Requirements: 5.2, 5.5_

- [ ] 9.3 Create provider selection UI
  - Add provider selection in TUI
  - Implement provider status display
  - Create provider configuration wizard
  - _Requirements: 5.5, 5.6_

- [ ] 9.4 Update session management for providers
  - Store provider information in sessions
  - Handle provider switching in sessions
  - Add provider migration for existing sessions
  - _Requirements: 5.6_

- [ ] 9.5 Write unit tests for configuration updates

  - Test configuration loading and validation
  - Test CLI command functionality
  - Test UI provider selection
  - _Requirements: 5.1, 5.2, 5.5_

- [ ] 9.6 Write integration tests for provider switching

  - Test runtime provider switching
  - Test session provider migration
  - Test configuration persistence
  - _Requirements: 5.2, 5.6_

- [ ] 10. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Documentation and examples
  - Create provider setup guides
  - Add configuration examples
  - Document provider-specific features
  - _Requirements: All requirements_

- [ ] 11.1 Create provider setup documentation
  - Write setup guides for each provider
  - Document API key configuration
  - Add troubleshooting guides
  - _Requirements: 1.1, 2.1, 3.1, 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 11.2 Add configuration examples
  - Create example configurations for each provider
  - Document fallback configuration
  - Add performance tuning examples
  - _Requirements: 5.1, 5.3, 8.1_

- [ ] 11.3 Document provider-specific features
  - Document model capabilities per provider
  - Add feature comparison matrix
  - Create migration guides from OpenAI
  - _Requirements: 6.1, 6.2, 6.3_

- [ ] 11.4 Write integration tests for documentation examples

  - Test all configuration examples
  - Verify setup guide accuracy
  - Test migration procedures
  - _Requirements: All requirements_

- [ ] 12. Final checkpoint - Comprehensive testing
  - Run full test suite across all providers
  - Verify integration with existing features
  - Ensure backward compatibility

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- Integration tests verify end-to-end functionality across providers