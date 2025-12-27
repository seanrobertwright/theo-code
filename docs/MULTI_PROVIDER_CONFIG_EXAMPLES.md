# Multi-Provider Configuration Examples

This document provides comprehensive configuration examples for theo-code's multi-provider AI support, including basic setups, advanced configurations, fallback strategies, and performance tuning.

## Table of Contents

- [Basic Provider Configurations](#basic-provider-configurations)
- [Advanced Provider Configurations](#advanced-provider-configurations)
- [Fallback Configuration Examples](#fallback-configuration-examples)
- [Performance Tuning Examples](#performance-tuning-examples)
- [Project-Specific Configurations](#project-specific-configurations)
- [Environment-Specific Configurations](#environment-specific-configurations)
- [Security and Best Practices](#security-and-best-practices)

## Basic Provider Configurations

### Single Provider Setup

**Anthropic Claude Only**
```yaml
# ~/.theo/config.yaml
providers:
  anthropic:
    enabled: true
    apiKey: "${ANTHROPIC_API_KEY}"
    models:
      - claude-3-5-sonnet-20241022
    rateLimit:
      requestsPerMinute: 60
      tokensPerMinute: 100000

defaultProvider: "anthropic"
defaultModel: "claude-3-5-sonnet-20241022"
```

**Google Gemini Only**
```yaml
# ~/.theo/config.yaml
providers:
  google:
    enabled: true
    apiKey: "${GOOGLE_API_KEY}"
    models:
      - gemini-3-pro-preview
      - gemini-3-flash-preview
    gemini:
      thinkingLevel: "medium"
      mediaResolution: "high"
    rateLimit:
      requestsPerMinute: 60
      tokensPerMinute: 1000000

defaultProvider: "google"
defaultModel: "gemini-3-pro-preview"
```

**OpenRouter Only**
```yaml
# ~/.theo/config.yaml
providers:
  openrouter:
    enabled: true
    apiKey: "${OPENROUTER_API_KEY}"
    baseUrl: "https://openrouter.ai/api/v1"
    rateLimit:
      requestsPerMinute: 200
      tokensPerMinute: 500000

defaultProvider: "openrouter"
defaultModel: "anthropic/claude-3.5-sonnet"
```

### Multi-Provider Basic Setup

```yaml
# ~/.theo/config.yaml
providers:
  anthropic:
    enabled: true
    apiKey: "${ANTHROPIC_API_KEY}"
    models:
      - claude-3-5-sonnet-20241022
      - claude-3-haiku-20240307
    
  google:
    enabled: true
    apiKey: "${GOOGLE_API_KEY}"
    models:
      - gemini-3-pro-preview
      - gemini-3-flash-preview
    
  openrouter:
    enabled: true
    apiKey: "${OPENROUTER_API_KEY}"
    
  ollama:
    enabled: true
    baseUrl: "http://localhost:11434"
    models:
      - llama2
      - codellama

defaultProvider: "anthropic"
defaultModel: "claude-3-5-sonnet-20241022"
```

## Advanced Provider Configurations

### Anthropic Advanced Configuration

```yaml
providers:
  anthropic:
    enabled: true
    apiKey: "${ANTHROPIC_API_KEY}"
    baseUrl: "https://api.anthropic.com"  # Custom endpoint for enterprise
    models:
      - id: claude-3-5-sonnet-20241022
        name: "Claude 3.5 Sonnet"
        contextLimit: 200000
        maxOutputTokens: 8192
        supportsToolCalling: true
        supportsStreaming: true
        costPer1kTokens:
          input: 0.003
          output: 0.015
      - id: claude-3-opus-20240229
        name: "Claude 3 Opus"
        contextLimit: 200000
        maxOutputTokens: 4096
        supportsToolCalling: true
        supportsStreaming: true
        costPer1kTokens:
          input: 0.015
          output: 0.075
      - id: claude-3-haiku-20240307
        name: "Claude 3 Haiku"
        contextLimit: 200000
        maxOutputTokens: 4096
        supportsToolCalling: true
        supportsStreaming: true
        costPer1kTokens:
          input: 0.00025
          output: 0.00125
    rateLimit:
      requestsPerMinute: 60
      tokensPerMinute: 100000
      concurrentRequests: 5
    retryConfig:
      maxRetries: 3
      backoffMs: 1000
      retryableErrors:
        - "rate_limit_error"
        - "server_error"
        - "timeout"
    anthropic:
      maxTokens: 4096
      systemMessage: "You are a helpful AI assistant specialized in code analysis and generation."
```

### Google Gemini Advanced Configuration

```yaml
providers:
  google:
    enabled: true
    apiKey: "${GOOGLE_API_KEY}"
    models:
      - id: gemini-3-pro-preview
        name: "Gemini 3.0 Pro"
        contextLimit: 1000000
        maxOutputTokens: 8192
        supportsToolCalling: true
        supportsStreaming: true
        features:
          multimodal: true
          imageGeneration: false
          reasoning: true
          thinkingLevels: true
      - id: gemini-3-pro-image-preview
        name: "Gemini 3.0 Pro Image"
        contextLimit: 1000000
        maxOutputTokens: 8192
        supportsToolCalling: true
        supportsStreaming: true
        features:
          multimodal: true
          imageGeneration: true
          reasoning: true
      - id: gemini-2-flash-thinking-preview
        name: "Gemini 2.0 Flash Thinking"
        contextLimit: 1000000
        maxOutputTokens: 8192
        supportsToolCalling: true
        supportsStreaming: true
        features:
          multimodal: true
          reasoning: true
          thinkingMode: true
    rateLimit:
      requestsPerMinute: 60
      tokensPerMinute: 1000000
      concurrentRequests: 10
    gemini:
      thinkingLevel: "high"  # low, medium, high
      mediaResolution: "ultra_high"  # low, medium, high, ultra_high
      thoughtSignatures: true  # Enable reasoning continuity
      safetySettings:
        - category: "HARM_CATEGORY_HARASSMENT"
          threshold: "BLOCK_MEDIUM_AND_ABOVE"
        - category: "HARM_CATEGORY_HATE_SPEECH"
          threshold: "BLOCK_MEDIUM_AND_ABOVE"
      imageConfig:
        aspectRatio: "16:9"
        imageSize: "4K"  # 1K, 2K, 4K
      generationConfig:
        temperature: 0.7
        topP: 0.8
        topK: 40
        maxOutputTokens: 8192
```

### OpenRouter Advanced Configuration

```yaml
providers:
  openrouter:
    enabled: true
    apiKey: "${OPENROUTER_API_KEY}"
    baseUrl: "https://openrouter.ai/api/v1"
    headers:
      "HTTP-Referer": "https://your-app.com"  # Optional: for analytics
      "X-Title": "theo-code"  # Optional: for analytics
    models:
      # Models are auto-discovered, but you can specify preferences
      - anthropic/claude-3.5-sonnet
      - google/gemini-pro-1.5
      - openai/gpt-4o
      - meta-llama/llama-3.1-405b
    rateLimit:
      requestsPerMinute: 200
      tokensPerMinute: 500000
      concurrentRequests: 20
    features:
      modelCatalog: true
      usageTracking: true
      creditBased: true
```

### Local Ollama Advanced Configuration

```yaml
providers:
  ollama:
    enabled: true
    baseUrl: "http://localhost:11434"
    timeout: 300000  # 5 minutes for large models
    models:
      - id: llama2
        name: "Llama 2 7B"
        contextLimit: 4096
        supportsToolCalling: false
        supportsStreaming: true
      - id: codellama
        name: "Code Llama 7B"
        contextLimit: 16384
        supportsToolCalling: false
        supportsStreaming: true
      - id: mistral
        name: "Mistral 7B"
        contextLimit: 8192
        supportsToolCalling: false
        supportsStreaming: true
    features:
      localInference: true
      offline: true
      modelManagement: true
    ollama:
      keepAlive: "5m"  # Keep model loaded for 5 minutes
      numCtx: 4096     # Context window size
      numGpu: 1        # Number of GPU layers
      temperature: 0.7
```

## Fallback Configuration Examples

### Simple Fallback Chain

```yaml
# Primary -> Secondary -> Tertiary fallback
providers:
  anthropic:
    enabled: true
    apiKey: "${ANTHROPIC_API_KEY}"
    priority: 1  # Primary
    
  google:
    enabled: true
    apiKey: "${GOOGLE_API_KEY}"
    priority: 2  # Secondary fallback
    
  ollama:
    enabled: true
    baseUrl: "http://localhost:11434"
    priority: 3  # Tertiary fallback (local)

fallbackConfig:
  enabled: true
  strategy: "priority"  # Use priority order
  maxRetries: 2
  retryDelay: 5000  # 5 seconds between provider switches
```

### Cost-Optimized Fallback

```yaml
# Start with cheapest, fallback to more expensive
providers:
  ollama:
    enabled: true
    baseUrl: "http://localhost:11434"
    priority: 1  # Free local models first
    
  openrouter:
    enabled: true
    apiKey: "${OPENROUTER_API_KEY}"
    priority: 2  # Cost-effective cloud models
    
  anthropic:
    enabled: true
    apiKey: "${ANTHROPIC_API_KEY}"
    priority: 3  # Premium models as last resort

fallbackConfig:
  enabled: true
  strategy: "cost"
  costThreshold: 0.01  # Switch if cost per request exceeds $0.01
  fallbackTriggers:
    - "model_unavailable"
    - "rate_limit_exceeded"
    - "cost_threshold_exceeded"
```

### Feature-Based Fallback

```yaml
# Fallback based on required features
providers:
  google:
    enabled: true
    apiKey: "${GOOGLE_API_KEY}"
    priority: 1
    features:
      toolCalling: true
      multimodal: true
      imageGeneration: true
      
  anthropic:
    enabled: true
    apiKey: "${ANTHROPIC_API_KEY}"
    priority: 2
    features:
      toolCalling: true
      multimodal: false
      imageGeneration: false
      
  openrouter:
    enabled: true
    apiKey: "${OPENROUTER_API_KEY}"
    priority: 3
    features:
      toolCalling: true  # Depends on selected model
      multimodal: true   # Depends on selected model

fallbackConfig:
  enabled: true
  strategy: "feature"
  requiredFeatures:
    - "toolCalling"
  preferredFeatures:
    - "multimodal"
    - "imageGeneration"
```

### Geographic Fallback

```yaml
# Fallback based on geographic regions for compliance
providers:
  mistral:
    enabled: true
    apiKey: "${MISTRAL_API_KEY}"
    priority: 1
    region: "eu"  # European provider for GDPR compliance
    
  anthropic:
    enabled: true
    apiKey: "${ANTHROPIC_API_KEY}"
    priority: 2
    region: "us"  # US provider
    
  ollama:
    enabled: true
    baseUrl: "http://localhost:11434"
    priority: 3
    region: "local"  # Local processing

fallbackConfig:
  enabled: true
  strategy: "geographic"
  preferredRegions: ["eu", "us", "local"]
  complianceMode: "gdpr"
```

## Performance Tuning Examples

### High-Throughput Configuration

```yaml
# Optimized for maximum throughput
providers:
  anthropic:
    enabled: true
    apiKey: "${ANTHROPIC_API_KEY}"
    rateLimit:
      requestsPerMinute: 1000  # Increased limits
      tokensPerMinute: 500000
      concurrentRequests: 20   # High concurrency
    connectionPool:
      maxConnections: 50
      keepAlive: true
      timeout: 30000
    
  google:
    enabled: true
    apiKey: "${GOOGLE_API_KEY}"
    rateLimit:
      requestsPerMinute: 600
      tokensPerMinute: 2000000
      concurrentRequests: 30
    connectionPool:
      maxConnections: 100
      keepAlive: true
      timeout: 30000

performance:
  caching:
    enabled: true
    tokenCountCache: true
    modelCapabilityCache: true
    responseCache: false  # Disable for dynamic content
    ttl: 3600  # 1 hour cache
  
  batching:
    enabled: true
    maxBatchSize: 10
    batchTimeout: 100  # 100ms
  
  streaming:
    bufferSize: 8192
    flushInterval: 50  # 50ms
```

### Low-Latency Configuration

```yaml
# Optimized for minimum response time
providers:
  google:
    enabled: true
    apiKey: "${GOOGLE_API_KEY}"
    models:
      - gemini-3-flash-preview  # Fastest model
    gemini:
      thinkingLevel: "low"  # Faster responses
      mediaResolution: "medium"  # Balance speed/quality
    connectionPool:
      maxConnections: 10
      keepAlive: true
      timeout: 5000  # Short timeout
    
  anthropic:
    enabled: true
    apiKey: "${ANTHROPIC_API_KEY}"
    models:
      - claude-3-haiku-20240307  # Fastest Claude model
    connectionPool:
      maxConnections: 10
      keepAlive: true
      timeout: 5000

performance:
  caching:
    enabled: true
    tokenCountCache: true
    modelCapabilityCache: true
    responseCache: true  # Cache for repeated queries
    ttl: 300  # 5 minute cache
  
  streaming:
    enabled: true
    bufferSize: 1024  # Small buffer for faster first byte
    flushInterval: 10  # 10ms for immediate response
  
  timeout:
    connection: 5000
    request: 30000
    stream: 60000
```

### Cost-Optimized Configuration

```yaml
# Optimized for minimum cost
providers:
  ollama:
    enabled: true
    baseUrl: "http://localhost:11434"
    priority: 1  # Free local models
    models:
      - llama2
      - codellama
    
  openrouter:
    enabled: true
    apiKey: "${OPENROUTER_API_KEY}"
    priority: 2
    # Use cost-effective models
    preferredModels:
      - "meta-llama/llama-3.1-8b-instruct"
      - "mistralai/mistral-7b-instruct"
    
  anthropic:
    enabled: true
    apiKey: "${ANTHROPIC_API_KEY}"
    priority: 3
    models:
      - claude-3-haiku-20240307  # Cheapest Claude model

performance:
  caching:
    enabled: true
    tokenCountCache: true
    modelCapabilityCache: true
    responseCache: true
    ttl: 7200  # 2 hour cache to reduce API calls
  
  costOptimization:
    enabled: true
    maxCostPerRequest: 0.005  # $0.005 limit
    budgetTracking: true
    monthlyBudget: 100.00  # $100/month
    alertThreshold: 0.8  # Alert at 80% of budget
```

### Memory-Optimized Configuration

```yaml
# Optimized for low memory usage
providers:
  anthropic:
    enabled: true
    apiKey: "${ANTHROPIC_API_KEY}"
    connectionPool:
      maxConnections: 5  # Limit connections
      keepAlive: false   # Don't keep connections alive
    
  google:
    enabled: true
    apiKey: "${GOOGLE_API_KEY}"
    connectionPool:
      maxConnections: 5
      keepAlive: false

performance:
  caching:
    enabled: true
    maxCacheSize: 50MB  # Limit cache size
    tokenCountCache: true
    modelCapabilityCache: true
    responseCache: false  # Disable to save memory
  
  streaming:
    bufferSize: 1024  # Small buffer
    maxConcurrentStreams: 3  # Limit concurrent streams
  
  memoryManagement:
    gcInterval: 30000  # Garbage collect every 30s
    maxHeapSize: 512MB
```

## Project-Specific Configurations

### Code Analysis Project

```yaml
# .theo/config.yaml (project-specific)
providers:
  anthropic:
    enabled: true
    apiKey: "${ANTHROPIC_API_KEY}"
    models:
      - claude-3-5-sonnet-20241022  # Best for code analysis
    anthropic:
      systemMessage: "You are an expert code analyzer. Focus on code quality, security, and best practices."
  
  google:
    enabled: true
    apiKey: "${GOOGLE_API_KEY}"
    models:
      - gemini-3-pro-preview
    gemini:
      thinkingLevel: "high"  # Deep analysis

defaultProvider: "anthropic"
defaultModel: "claude-3-5-sonnet-20241022"

features:
  toolCalling: true
  codeAnalysis: true
  securityScanning: true
```

### Creative Writing Project

```yaml
# .theo/config.yaml (project-specific)
providers:
  google:
    enabled: true
    apiKey: "${GOOGLE_API_KEY}"
    models:
      - gemini-3-pro-preview
      - gemini-3-pro-image-preview  # For image generation
    gemini:
      thinkingLevel: "medium"
      imageConfig:
        aspectRatio: "16:9"
        imageSize: "2K"
      generationConfig:
        temperature: 0.9  # More creative
        topP: 0.95
  
  anthropic:
    enabled: true
    apiKey: "${ANTHROPIC_API_KEY}"
    models:
      - claude-3-opus-20240229  # Best for creative tasks
    anthropic:
      systemMessage: "You are a creative writing assistant. Help with storytelling, character development, and narrative structure."

defaultProvider: "google"
defaultModel: "gemini-3-pro-preview"

features:
  imageGeneration: true
  multimodal: true
  creativeWriting: true
```

### Research Project

```yaml
# .theo/config.yaml (project-specific)
providers:
  perplexity:
    enabled: true
    apiKey: "${PERPLEXITY_API_KEY}"
    models:
      - pplx-70b-online  # Best for research with real-time info
    priority: 1
  
  google:
    enabled: true
    apiKey: "${GOOGLE_API_KEY}"
    models:
      - gemini-3-pro-preview
    gemini:
      thinkingLevel: "high"  # Deep reasoning for research
    priority: 2
  
  anthropic:
    enabled: true
    apiKey: "${ANTHROPIC_API_KEY}"
    models:
      - claude-3-opus-20240229  # Comprehensive analysis
    priority: 3

defaultProvider: "perplexity"
defaultModel: "pplx-70b-online"

features:
  searchAugmented: true
  realTimeInfo: true
  citations: true
```

## Environment-Specific Configurations

### Development Environment

```yaml
# config/development.yaml
providers:
  ollama:
    enabled: true
    baseUrl: "http://localhost:11434"
    priority: 1  # Use local models for development
  
  anthropic:
    enabled: true
    apiKey: "${ANTHROPIC_API_KEY_DEV}"
    priority: 2
    rateLimit:
      requestsPerMinute: 30  # Lower limits for dev
      tokensPerMinute: 50000

logging:
  level: "debug"
  providers: true
  requests: true
  responses: true

performance:
  caching:
    enabled: false  # Disable caching for testing
```

### Staging Environment

```yaml
# config/staging.yaml
providers:
  anthropic:
    enabled: true
    apiKey: "${ANTHROPIC_API_KEY_STAGING}"
    priority: 1
    rateLimit:
      requestsPerMinute: 100
      tokensPerMinute: 200000
  
  google:
    enabled: true
    apiKey: "${GOOGLE_API_KEY_STAGING}"
    priority: 2

logging:
  level: "info"
  providers: true
  requests: false
  responses: false

performance:
  caching:
    enabled: true
    ttl: 1800  # 30 minute cache
```

### Production Environment

```yaml
# config/production.yaml
providers:
  anthropic:
    enabled: true
    apiKey: "${ANTHROPIC_API_KEY_PROD}"
    priority: 1
    rateLimit:
      requestsPerMinute: 1000
      tokensPerMinute: 500000
      concurrentRequests: 50
  
  google:
    enabled: true
    apiKey: "${GOOGLE_API_KEY_PROD}"
    priority: 2
    rateLimit:
      requestsPerMinute: 600
      tokensPerMinute: 2000000
      concurrentRequests: 100
  
  openrouter:
    enabled: true
    apiKey: "${OPENROUTER_API_KEY_PROD}"
    priority: 3

fallbackConfig:
  enabled: true
  strategy: "priority"
  maxRetries: 3

logging:
  level: "warn"
  providers: false
  requests: false
  responses: false

performance:
  caching:
    enabled: true
    ttl: 3600  # 1 hour cache
  
  monitoring:
    enabled: true
    metrics: true
    healthChecks: true
```

## Security and Best Practices

### Secure Configuration Template

```yaml
# Secure configuration with best practices
providers:
  anthropic:
    enabled: true
    apiKey: "${ANTHROPIC_API_KEY}"  # Always use env vars
    baseUrl: "https://api.anthropic.com"  # Explicit HTTPS
    timeout: 30000
    retryConfig:
      maxRetries: 3
      backoffMs: 1000
    rateLimit:
      requestsPerMinute: 60
      tokensPerMinute: 100000

security:
  # API key validation
  validateKeys: true
  keyRotation:
    enabled: true
    interval: 2592000  # 30 days
  
  # Request security
  tlsVerification: true
  certificatePinning: false  # Set to true for high security
  
  # Logging security
  logSanitization: true
  maskApiKeys: true
  
  # Rate limiting security
  rateLimitEnforcement: true
  circuitBreaker:
    enabled: true
    failureThreshold: 5
    recoveryTimeout: 60000

# Audit configuration
audit:
  enabled: true
  logRequests: false  # Don't log request content
  logResponses: false  # Don't log response content
  logMetadata: true   # Log metadata only
  retention: 2592000  # 30 days
```

### Environment Variable Template

```bash
# .env.example - Template for environment variables

# Anthropic
ANTHROPIC_API_KEY=sk-ant-your-key-here

# Google
GOOGLE_API_KEY=AIza-your-key-here

# OpenRouter
OPENROUTER_API_KEY=sk-or-your-key-here

# Cohere
COHERE_API_KEY=your-cohere-key-here

# Mistral
MISTRAL_API_KEY=your-mistral-key-here

# Together
TOGETHER_API_KEY=your-together-key-here

# Perplexity
PERPLEXITY_API_KEY=your-perplexity-key-here

# Optional: Custom endpoints
ANTHROPIC_BASE_URL=https://api.anthropic.com
GOOGLE_BASE_URL=https://generativelanguage.googleapis.com
OLLAMA_BASE_URL=http://localhost:11434

# Optional: Feature flags
ENABLE_FALLBACK=true
ENABLE_CACHING=true
ENABLE_MONITORING=true
```

## Configuration Validation

### Schema Validation Example

```yaml
# Configuration with validation rules
providers:
  anthropic:
    enabled: true
    apiKey: "${ANTHROPIC_API_KEY}"
    # Validation: API key must start with 'sk-ant-'
    models:
      - claude-3-5-sonnet-20241022
    # Validation: Models must be from supported list
    rateLimit:
      requestsPerMinute: 60  # Validation: Must be > 0 and <= 1000
      tokensPerMinute: 100000  # Validation: Must be > 0

# Built-in validation rules:
validation:
  apiKeys:
    anthropic: "^sk-ant-"
    google: "^AIza"
    openrouter: "^sk-or-"
  
  rateLimits:
    requestsPerMinute:
      min: 1
      max: 1000
    tokensPerMinute:
      min: 1000
      max: 10000000
  
  models:
    anthropic:
      - claude-3-5-sonnet-20241022
      - claude-3-opus-20240229
      - claude-3-haiku-20240307
    google:
      - gemini-3-pro-preview
      - gemini-3-flash-preview
      - gemini-2-flash-preview
```

This comprehensive configuration guide provides examples for every major use case and deployment scenario. Choose the configuration that best matches your needs and customize as required.