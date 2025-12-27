# Implementation Plan: OAuth Authentication for AI Providers

## Overview

This implementation plan breaks down the OAuth authentication feature into discrete coding tasks that build incrementally on the existing multi-provider architecture. Each task focuses on specific components while ensuring integration with the current system.

## Tasks

- [x] 1. Set up OAuth infrastructure and core interfaces
  - Create OAuth-specific TypeScript interfaces and types
  - Set up OAuth configuration schema extensions
  - Create base OAuth manager class structure
  - _Requirements: 1.1, 6.1, 10.1_

- [x] 1.1 Write property test for OAuth configuration schema
  - **Property 8: Configuration Round-Trip**
  - **Validates: Requirements 10.4**

- [ ] 2. Implement PKCE generator and security utilities
  - [ ] 2.1 Create PKCE code verifier and challenge generation
    - Implement cryptographically secure random string generation
    - Add SHA256 hashing for code challenges
    - Add Base64URL encoding utilities
    - _Requirements: 1.2_

  - [ ] 2.2 Write property test for PKCE parameter generation
    - **Property 1: PKCE Parameter Inclusion**
    - **Validates: Requirements 1.2**

  - [ ] 2.3 Implement secure token storage using keychain
    - Add keytar dependency for system keychain access
    - Create encrypted token storage and retrieval methods
    - Implement token validation and expiration checking
    - _Requirements: 6.1, 6.6_

  - [ ] 2.4 Write property test for secure token storage
    - **Property 3: Secure Token Storage**
    - **Validates: Requirements 6.1**

- [ ] 3. Create OAuth callback server infrastructure
  - [ ] 3.1 Implement temporary HTTP server for OAuth callbacks
    - Create callback server with automatic port selection
    - Add timeout handling and graceful shutdown
    - Implement success/error page rendering
    - _Requirements: 1.1, 1.6_

  - [ ] 3.2 Add browser launcher utility
    - Implement cross-platform browser launching
    - Add error handling for browser launch failures
    - Create user-friendly fallback instructions
    - _Requirements: 1.3_

  - [ ] 3.3 Write unit tests for callback server lifecycle
    - Test server start/stop functionality
    - Test timeout handling
    - Test callback processing
    - _Requirements: 1.1, 1.6_

- [ ] 4. Implement provider-specific OAuth adapters
  - [ ] 4.1 Create Google OAuth adapter
    - Implement Google OAuth 2.0 configuration
    - Add Google-specific token exchange logic
    - Handle Google API scopes and permissions
    - _Requirements: 4.1, 4.2, 4.3_

  - [ ] 4.2 Create OpenRouter OAuth adapter
    - Implement OpenRouter PKCE-based OAuth flow
    - Add OpenRouter-specific API key generation
    - Handle OpenRouter token format
    - _Requirements: 5.1, 5.2, 5.3_

  - [ ] 4.3 Create placeholder adapters for Anthropic and OpenAI
    - Create adapter structure for future OAuth support
    - Implement fallback to API key authentication
    - Add configuration for when OAuth becomes available
    - _Requirements: 2.1, 3.1_

  - [ ] 4.4 Write property test for token exchange
    - **Property 2: Token Exchange Completeness**
    - **Validates: Requirements 1.4**

- [ ] 5. Checkpoint - Ensure OAuth adapters work independently
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Implement OAuth manager and flow orchestration
  - [ ] 6.1 Create OAuth manager class
    - Implement OAuth flow initiation and coordination
    - Add state parameter generation and validation
    - Create provider-agnostic OAuth interface
    - _Requirements: 1.1, 1.4, 1.5_

  - [ ] 6.2 Add automatic token refresh logic
    - Implement token expiration checking
    - Add automatic refresh before API calls
    - Handle refresh token expiration scenarios
    - _Requirements: 6.2, 2.5_

  - [ ] 6.3 Write property test for automatic token refresh
    - **Property 5: Automatic Token Refresh**
    - **Validates: Requirements 2.5, 6.2**

  - [ ] 6.4 Implement authentication method priority and fallback
    - Add OAuth priority over API key authentication
    - Implement fallback to API keys when OAuth fails
    - Create authentication method selection logic
    - _Requirements: 7.2, 7.3, 2.6_

  - [ ] 6.5 Write property test for authentication priority
    - **Property 4: Authentication Method Priority**
    - **Validates: Requirements 2.4, 7.2**

  - [ ] 6.6 Write property test for authentication fallback
    - **Property 6: Authentication Fallback**
    - **Validates: Requirements 2.6, 7.3**

- [ ] 7. Integrate OAuth with existing provider adapters
  - [ ] 7.1 Modify existing provider adapters to support OAuth tokens
    - Update Anthropic adapter to use OAuth tokens when available
    - Update Google adapter to use OAuth tokens when available
    - Update OpenRouter adapter to use OAuth tokens when available
    - _Requirements: 2.4, 4.4, 5.4_

  - [ ] 7.2 Update provider manager to handle OAuth authentication
    - Integrate OAuth manager with existing provider manager
    - Add OAuth status checking to provider health monitoring
    - Update provider selection logic to consider authentication method
    - _Requirements: 7.1, 7.5_

  - [ ] 7.3 Write property test for token security
    - **Property 7: Token Security**
    - **Validates: Requirements 6.6**

- [ ] 8. Implement OAuth command interface
  - [ ] 8.1 Create authentication commands
    - Add `/auth login <provider>` command
    - Add `/auth logout <provider>` command
    - Add `/auth status` command
    - Add `/auth refresh <provider>` command
    - Add `/auth list` command
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [ ] 8.2 Add command feedback and error handling
    - Implement clear success/error messages
    - Add progress indicators for OAuth flows
    - Create user-friendly error explanations
    - _Requirements: 8.6, 9.1, 9.4_

  - [ ] 8.3 Write unit tests for OAuth commands
    - Test each command with various scenarios
    - Test error handling and user feedback
    - Test command integration with OAuth manager
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ] 9. Implement configuration serialization and display
  - [ ] 9.1 Add OAuth configuration serialization
    - Extend existing configuration schemas for OAuth
    - Implement secure configuration serialization (mask sensitive data)
    - Add OAuth configuration validation
    - _Requirements: 10.1, 10.2, 10.3_

  - [ ] 9.2 Create secure token and configuration display utilities
    - Implement token information formatting with masking
    - Add authentication status display formatting
    - Create configuration display with security considerations
    - _Requirements: 11.3, 10.3_

  - [ ] 9.3 Write property test for token response normalization
    - **Property 9: Token Response Normalization**
    - **Validates: Requirements 11.2**

  - [ ] 9.4 Write property test for secure display formatting
    - **Property 10: Secure Display Formatting**
    - **Validates: Requirements 10.3, 11.3**

- [ ] 10. Final integration and testing
  - [ ] 10.1 Wire OAuth system with existing configuration management
    - Integrate OAuth configuration with global and project configs
    - Add OAuth provider status to existing status displays
    - Update configuration loading to handle OAuth settings
    - _Requirements: 7.4, 7.6_

  - [ ] 10.2 Add comprehensive error handling and recovery
    - Implement error recovery strategies
    - Add resource cleanup for failed OAuth flows
    - Create user guidance for common OAuth issues
    - _Requirements: 1.6, 9.4_

  - [ ] 10.3 Write integration tests for OAuth system
    - Test OAuth integration with existing provider system
    - Test configuration management integration
    - Test command interface integration
    - _Requirements: 7.1, 7.4, 8.6_

- [ ] 11. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with comprehensive testing ensure robust OAuth implementation
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- OAuth implementation maintains compatibility with existing API key authentication