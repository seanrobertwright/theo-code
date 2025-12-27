# Multi-Provider Configuration Examples

This document provides comprehensive configuration examples for all supported AI providers in theo-code, including fallback configurations and performance tuning examples.

## Table of Contents

- [Basic Provider Configuration](#basic-provider-configuration)
- [Provider-Specific Examples](#provider-specific-examples)
- [Fallback Configuration](#fallback-configuration)
- [Performance Tuning](#performance-tuning)
- [Security Best Practices](#security-best-practices)
- [Environment-Specific Configurations](#environment-specific-configurations)

## Basic Provider Configuration

### Global Configuration (`~/.theo/config.yaml`)

```yaml
# Global theo-code configuration
providers:
  # Primary provider
  openai:
    enabled: true
    apiKey: "${OPENAI_API_KEY}"
    priority: 1
    models:
      - gpt-4o
      - gpt-4o-mini
      - gpt-3.5-turbo
    rateLimit:
      requestsPerMinute: 60
      tokensPerMinute: 150000

  # Secondary provider for fallback
  anthropic:
    enabled: true
    apiKey: "${ANTHROPIC_API_KEY}"
    priority: 2
    models:
      - claude-3-5-sonnet-20241022
      - claude-3-opus-20240229
      - claude-3-haiku-20240307
    rateLimit:
      requestsPerMinute: 50
      tokensPerMinute: 100000

# Default model configuration
defaultModel:
  provider: openai
  model: gpt-4o
  fallbackProviders: [anthropic, google]
  
# Global settings
settings:
  maxRetries: 3
  timeoutMs: 30000
  enableFallback: true
```

### Project Configuration (`.theo/config.yaml`)

```yaml
# Project-specific overrides
providers:
  # Override global settings for this project
  google:
    enabled: true
    apiKey: "${GOOGLE_API_KEY}"
    priority: 1
    models:
      - gemini-3-pro-preview
      - gemini-3-flash-preview
      - gemini-2-flash-preview
    features:
      thinkingLevel: medium
      mediaResolution: high
      thoughtSignatures: true

# Project-specific model preferences
defaultModel:
  provider: google
  model: gemini-3-pro-preview
  fallbackProviders: [anthropic, openai]
```

## Provider-Specific Examples

### Anthropic Claude Configuration

```yaml
providers:
  anthropic:
    enabled: true
    apiKey: "${ANTHROPIC_API_KEY}"
    baseUrl: "https://api.anthropic.com"
    priority: 1
    
    # Model configuration
    models:
      - id: claude-3-5-sonnet-20241022
        name: "Claude 3.5 Sonnet"
        contextLimit: 200000
        maxOutputTokens: 8192
        supportsToolCalling: true
        supportsStreaming: true
        costPer1kTokens:
          input: 3.00
          output: 15.00
      
      - id: claude-3-opus-20240229
        name: "Claude 3 Opus"
        contextLimit: 200000
        maxOutputTokens: 4096
        supportsToolCalling: true
        supportsStreaming: true
        costPer1kTokens:
          input: 15.00
          output: 75.00
    
    # Rate limiting
    rateLimit:
      requestsPerMinute: 50
      tokensPerMinute: 100000
      concurrentRequests: 5
    
    # Anthropic-specific settings
    anthropic:
      maxTokens: 4096
      systemMessage: "You are a helpful AI assistant specialized in code analysis."
      temperature: 0.7
      topP: 0.9
    
    # Retry configuration
    retryConfig:
      maxRetries: 3
      backoffMs: 1000
      retryableErrors:
        - "rate_limit_error"
        - "server_error"
        - "timeout"
```

### Google Gemini Configuration

```yaml
providers:
  google:
    enabled: true
    apiKey: "${GOOGLE_API_KEY}"
    baseUrl: "https://generativelanguage.googleapis.com"
    priority: 1
    
    # Model configuration with Gemini 3.0 support
    models:
      - id: gemini-3-pro-preview
        name: "Gemini 3.0 Pro"
        contextLimit: 1000000
        maxOutputTokens: 8192
        supportsToolCalling: true
        supportsStreaming: true
        supportsImageGeneration: false
        supportsReasoning: true
        costPer1kTokens:
          input: 1.25
          output: 5.00
      
      - id: gemini-3-flash-preview
        name: "Gemini 3.0 Flash"
        contextLimit: 1000000
        maxOutputTokens: 8192
        supportsToolCalling: true
        supportsStreaming: true
        supportsImageGeneration: false
        supportsReasoning: true
        costPer1kTokens:
          input: 0.075
          output: 0.30
      
      - id: gemini-3-pro-image-preview
        name: "Gemini 3.0 Pro Image"
        contextLimit: 1000000
        maxOutputTokens: 8192
        supportsToolCalling: true
        supportsStreaming: true
        supportsImageGeneration: true
        supportsReasoning: true
        costPer1kTokens:
          input: 1.25
          output: 5.00
    
    # Rate limiting
    rateLimit:
      requestsPerMinute: 60
      tokensPerMinute: 120000
      concurrentRequests: 10
    
    # Gemini-specific settings
    gemini:
      # Thinking levels for controlled reasoning
      thinkingLevel: medium  # low, medium, high
      
      # Media resolution controls
      mediaResolution: high  # low, medium, high, ultra_high
      
      # Thought signatures for reasoning continuity
      thoughtSignatures: true
      
      # Image generation configuration
      imageConfig:
        aspectRatio: "16:9"
        imageSize: "2K"  # 1K, 2K, 4K
      
      # Safety settings
      safetySettings:
        - category: "HARM_CATEGORY_HARASSMENT"
          threshold: "BLOCK_MEDIUM_AND_ABOVE"
        - category: "HARM_CATEGORY_HATE_SPEECH"
          threshold: "BLOCK_MEDIUM_AND_ABOVE"
      
      # Generation parameters
      temperature: 0.7
      topP: 0.9
      topK: 40
```

### OpenRouter Configuration

```yaml
providers:
  openrouter:
    enabled: true
    apiKey: "${OPENROUTER_API_KEY}"
    baseUrl: "https://openrouter.ai/api/v1"
    priority: 2
    
    # Dynamic model catalog (loaded at runtime)
    modelCatalog:
      refreshIntervalMs: 3600000  # 1 hour
      cacheEnabled: true
    
    # Preferred models (subset of available catalog)
    preferredModels:
      - "anthropic/claude-3.5-sonnet"
      - "google/gemini-pro-1.5"
      - "openai/gpt-4o"
      - "meta-llama/llama-3.1-405b-instruct"
    
    # Rate limiting (varies by model)
    rateLimit:
      requestsPerMinute: 100
      tokensPerMinute: 200000
      concurrentRequests: 20
    
    # OpenRouter-specific settings
    openrouter:
      # Credit tracking
      trackCredits: true
      creditThreshold: 10.00  # Alert when credits below this
      
      # Model selection preferences
      preferCheaper: false
      preferFaster: true
      
      # Headers for better routing
      httpReferer: "https://theo-code.dev"
      xTitle: "theo-code"
```

### Cohere Configuration

```yaml
providers:
  cohere:
    enabled: true
    apiKey: "${COHERE_API_KEY}"
    baseUrl: "https://api.cohere.ai"
    priority: 3
    
    models:
      - id: command
        name: "Command"
        contextLimit: 128000
        maxOutputTokens: 4096
        supportsToolCalling: true
        supportsStreaming: true
      
      - id: command-light
        name: "Command Light"
        contextLimit: 4096
        maxOutputTokens: 4096
        supportsToolCalling: false
        supportsStreaming: true
    
    # Cohere-specific settings
    cohere:
      temperature: 0.7
      maxTokens: 4096
      k: 0
      p: 0.9
      frequencyPenalty: 0.0
      presencePenalty: 0.0
```

### Mistral Configuration

```yaml
providers:
  mistral:
    enabled: true
    apiKey: "${MISTRAL_API_KEY}"
    baseUrl: "https://api.mistral.ai"
    priority: 4
    
    models:
      - id: mistral-large-latest
        name: "Mistral Large"
        contextLimit: 128000
        maxOutputTokens: 8192
        supportsToolCalling: true
        supportsStreaming: true
      
      - id: mistral-medium-latest
        name: "Mistral Medium"
        contextLimit: 32000
        maxOutputTokens: 8192
        supportsToolCalling: true
        supportsStreaming: true
    
    # Mistral-specific settings
    mistral:
      temperature: 0.7
      topP: 1.0
      maxTokens: 8192
      safePrompt: false
      randomSeed: null
```

### Together AI Configuration

```yaml
providers:
  together:
    enabled: true
    apiKey: "${TOGETHER_API_KEY}"
    baseUrl: "https://api.together.xyz"
    priority: 5
    
    # Open-source model focus
    models:
      - id: meta-llama/Llama-3-70b-chat-hf
        name: "Llama 3 70B Chat"
        contextLimit: 8192
        maxOutputTokens: 4096
        supportsToolCalling: false
        supportsStreaming: true
      
      - id: mistralai/Mixtral-8x7B-Instruct-v0.1
        name: "Mixtral 8x7B Instruct"
        contextLimit: 32768
        maxOutputTokens: 8192
        supportsToolCalling: false
        supportsStreaming: true
    
    # Together-specific settings
    together:
      temperature: 0.7
      topP: 0.9
      topK: 50
      repetitionPenalty: 1.0
      stop: ["</s>", "[INST]", "[/INST]"]
```

### Perplexity Configuration

```yaml
providers:
  perplexity:
    enabled: true
    apiKey: "${PERPLEXITY_API_KEY}"
    baseUrl: "https://api.perplexity.ai"
    priority: 6
    
    models:
      - id: llama-3.1-sonar-large-128k-online
        name: "Sonar Large Online"
        contextLimit: 127072
        maxOutputTokens: 4096
        supportsToolCalling: false
        supportsStreaming: true
        hasSearchAccess: true
      
      - id: llama-3.1-sonar-small-128k-online
        name: "Sonar Small Online"
        contextLimit: 127072
        maxOutputTokens: 4096
        supportsToolCalling: false
        supportsStreaming: true
        hasSearchAccess: true
    
    # Perplexity-specific settings
    perplexity:
      temperature: 0.2
      topP: 0.9
      maxTokens: 4096
      searchDomainFilter: []  # Empty = search all domains
      returnCitations: true
      returnImages: false
```

### Ollama Configuration

```yaml
providers:
  ollama:
    enabled: true
    baseUrl: "http://localhost:11434"
    priority: 7
    
    # Local models (managed by Ollama)
    models:
      - id: llama3.1:8b
        name: "Llama 3.1 8B"
        contextLimit: 128000
        maxOutputTokens: 4096
        supportsToolCalling: false
        supportsStreaming: true
        localModel: true
      
      - id: codellama:13b
        name: "Code Llama 13B"
        contextLimit: 16384
        maxOutputTokens: 4096
        supportsToolCalling: false
        supportsStreaming: true
        localModel: true
        specialization: "code"
    
    # Ollama-specific settings
    ollama:
      # Model management
      autoUpdate: false
      keepAlive: "5m"
      
      # Generation parameters
      temperature: 0.7
      topP: 0.9
      topK: 40
      repeatPenalty: 1.1
      
      # Performance settings
      numCtx: 4096
      numGpu: 1
      numThread: 8
```

## Fallback Configuration

### Simple Fallback Chain

```yaml
# Simple provider fallback
defaultModel:
  provider: openai
  model: gpt-4o
  fallbackProviders:
    - anthropic    # Try Claude if OpenAI fails
    - google       # Try Gemini if Claude fails
    - openrouter   # Try OpenRouter as last resort

# Fallback configuration
fallback:
  enabled: true
  maxAttempts: 3
  retryDelay: 2000  # 2 seconds between attempts
  
  # Conditions that trigger fallback
  triggerConditions:
    - "rate_limit_error"
    - "server_error" 
    - "timeout"
    - "service_unavailable"
```

### Advanced Fallback with Model Mapping

```yaml
# Advanced fallback with model equivalency mapping
fallback:
  enabled: true
  modelMapping:
    # Map equivalent models across providers
    "gpt-4o":
      - provider: anthropic
        model: claude-3-5-sonnet-20241022
      - provider: google
        model: gemini-3-pro-preview
      - provider: openrouter
        model: anthropic/claude-3.5-sonnet
    
    "gpt-4o-mini":
      - provider: anthropic
        model: claude-3-haiku-20240307
      - provider: google
        model: gemini-3-flash-preview
      - provider: openrouter
        model: google/gemini-flash-1.5
    
    "claude-3-5-sonnet-20241022":
      - provider: openai
        model: gpt-4o
      - provider: google
        model: gemini-3-pro-preview
      - provider: openrouter
        model: openai/gpt-4o
  
  # Fallback strategy
  strategy: "equivalent_model"  # or "any_available"
  preserveContext: true
  maxContextTokens: 100000
```

### Cost-Optimized Fallback

```yaml
# Cost-optimized fallback strategy
fallback:
  enabled: true
  strategy: "cost_optimized"
  
  # Tier-based fallback (cheapest to most expensive)
  costTiers:
    tier1:  # Cheapest options
      - provider: openrouter
        models: ["google/gemini-flash-1.5", "anthropic/claude-3-haiku"]
      - provider: google
        models: ["gemini-3-flash-preview"]
    
    tier2:  # Mid-range options
      - provider: openai
        models: ["gpt-4o-mini"]
      - provider: anthropic
        models: ["claude-3-haiku-20240307"]
    
    tier3:  # Premium options
      - provider: openai
        models: ["gpt-4o"]
      - provider: anthropic
        models: ["claude-3-5-sonnet-20241022"]
      - provider: google
        models: ["gemini-3-pro-preview"]
  
  # Budget constraints
  budget:
    dailyLimit: 50.00  # USD
    warningThreshold: 40.00
    trackUsage: true
```

## Performance Tuning

### High-Throughput Configuration

```yaml
# Optimized for high-throughput scenarios
performance:
  # Connection pooling
  connectionPool:
    maxConnections: 100
    maxConnectionsPerHost: 20
    keepAliveTimeout: 30000
    connectionTimeout: 10000
  
  # Request queuing
  requestQueue:
    maxQueueSize: 1000
    priorityLevels: 3
    batchingEnabled: true
    batchSize: 10
    batchTimeout: 100  # ms
  
  # Caching
  cache:
    enabled: true
    tokenCountCache:
      maxSize: 10000
      ttlMs: 3600000  # 1 hour
    
    modelCapabilityCache:
      maxSize: 1000
      ttlMs: 86400000  # 24 hours
    
    responseCache:
      enabled: false  # Usually disabled for AI responses
      maxSize: 1000
      ttlMs: 300000   # 5 minutes

# Provider-specific performance tuning
providers:
  openai:
    rateLimit:
      requestsPerMinute: 500
      tokensPerMinute: 500000
      concurrentRequests: 50
    
    performance:
      streamingChunkSize: 1024
      timeoutMs: 60000
      retryConfig:
        maxRetries: 5
        backoffMs: 500
        maxBackoffMs: 30000

  anthropic:
    rateLimit:
      requestsPerMinute: 200
      tokensPerMinute: 200000
      concurrentRequests: 20
    
    performance:
      streamingChunkSize: 512
      timeoutMs: 45000

  google:
    rateLimit:
      requestsPerMinute: 300
      tokensPerMinute: 300000
      concurrentRequests: 30
    
    performance:
      streamingChunkSize: 2048
      timeoutMs: 90000  # Longer for complex reasoning
```

### Low-Latency Configuration

```yaml
# Optimized for low-latency responses
performance:
  # Aggressive connection reuse
  connectionPool:
    maxConnections: 50
    maxConnectionsPerHost: 10
    keepAliveTimeout: 60000
    connectionTimeout: 5000
  
  # Minimal queuing
  requestQueue:
    maxQueueSize: 100
    priorityLevels: 1
    batchingEnabled: false
  
  # Aggressive caching
  cache:
    enabled: true
    tokenCountCache:
      maxSize: 50000
      ttlMs: 7200000  # 2 hours
    
    # Cache frequent model capability checks
    modelCapabilityCache:
      maxSize: 5000
      ttlMs: 172800000  # 48 hours

# Prefer faster models and providers
providers:
  google:
    priority: 1
    preferredModels:
      - gemini-3-flash-preview  # Fastest Gemini model
    
    gemini:
      thinkingLevel: low  # Faster responses
      mediaResolution: medium  # Balance speed/quality
  
  openai:
    priority: 2
    preferredModels:
      - gpt-4o-mini  # Faster than gpt-4o
  
  anthropic:
    priority: 3
    preferredModels:
      - claude-3-haiku-20240307  # Fastest Claude model

# Aggressive timeouts
timeouts:
  requestTimeout: 15000   # 15 seconds
  streamTimeout: 30000    # 30 seconds
  connectionTimeout: 3000 # 3 seconds
```

### Memory-Optimized Configuration

```yaml
# Optimized for memory usage
performance:
  # Limited connection pooling
  connectionPool:
    maxConnections: 20
    maxConnectionsPerHost: 5
    keepAliveTimeout: 15000
  
  # Small queues
  requestQueue:
    maxQueueSize: 50
    batchingEnabled: true
    batchSize: 5
  
  # Conservative caching
  cache:
    enabled: true
    tokenCountCache:
      maxSize: 1000
      ttlMs: 1800000  # 30 minutes
    
    modelCapabilityCache:
      maxSize: 100
      ttlMs: 3600000  # 1 hour
  
  # Memory management
  memoryManagement:
    maxResponseSize: 1048576  # 1MB
    streamingBufferSize: 4096
    gcInterval: 60000  # Force GC every minute

# Prefer smaller models
providers:
  openai:
    preferredModels:
      - gpt-4o-mini
      - gpt-3.5-turbo
  
  anthropic:
    preferredModels:
      - claude-3-haiku-20240307
  
  google:
    preferredModels:
      - gemini-3-flash-preview
```

## Security Best Practices

### Secure API Key Management

```yaml
# Use environment variables for API keys
providers:
  openai:
    apiKey: "${OPENAI_API_KEY}"
    # Never hardcode: apiKey: "sk-..."
  
  anthropic:
    apiKey: "${ANTHROPIC_API_KEY}"
  
  google:
    apiKey: "${GOOGLE_API_KEY}"

# Key rotation configuration
security:
  keyRotation:
    enabled: true
    checkInterval: 86400000  # 24 hours
    warningDays: 7  # Warn 7 days before expiration
  
  # Audit logging
  auditLog:
    enabled: true
    logLevel: "info"
    includeRequestBodies: false  # For privacy
    includeResponseBodies: false
    logFile: "/var/log/theo-code/audit.log"
```

### Network Security

```yaml
# Network security configuration
security:
  # TLS configuration
  tls:
    minVersion: "1.2"
    cipherSuites:
      - "TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384"
      - "TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256"
  
  # Certificate validation
  certificates:
    validateCertificates: true
    allowSelfSigned: false
    customCaPath: null
  
  # Proxy configuration (if needed)
  proxy:
    enabled: false
    httpProxy: "${HTTP_PROXY}"
    httpsProxy: "${HTTPS_PROXY}"
    noProxy: "localhost,127.0.0.1,.local"

# Provider-specific security
providers:
  anthropic:
    security:
      validateResponseSignatures: true
  
  google:
    security:
      useServiceAccount: false
      validateTokens: true
```

## Environment-Specific Configurations

### Development Environment

```yaml
# Development configuration
environment: development

# Enable all providers for testing
providers:
  openai:
    enabled: true
    apiKey: "${OPENAI_API_KEY_DEV}"
    rateLimit:
      requestsPerMinute: 10  # Lower limits for dev
      tokensPerMinute: 10000
  
  anthropic:
    enabled: true
    apiKey: "${ANTHROPIC_API_KEY_DEV}"
  
  ollama:
    enabled: true
    baseUrl: "http://localhost:11434"
    priority: 1  # Prefer local models in dev

# Development-specific settings
settings:
  debug: true
  logLevel: "debug"
  enableMetrics: true
  mockResponses: false

# Relaxed timeouts for debugging
timeouts:
  requestTimeout: 120000  # 2 minutes
  streamTimeout: 300000   # 5 minutes
```

### Production Environment

```yaml
# Production configuration
environment: production

# Only stable providers
providers:
  openai:
    enabled: true
    apiKey: "${OPENAI_API_KEY_PROD}"
    priority: 1
    rateLimit:
      requestsPerMinute: 500
      tokensPerMinute: 500000
  
  anthropic:
    enabled: true
    apiKey: "${ANTHROPIC_API_KEY_PROD}"
    priority: 2
  
  google:
    enabled: true
    apiKey: "${GOOGLE_API_KEY_PROD}"
    priority: 3

# Production-specific settings
settings:
  debug: false
  logLevel: "warn"
  enableMetrics: true
  enableFallback: true

# Monitoring and alerting
monitoring:
  enabled: true
  metrics:
    - responseTime
    - errorRate
    - tokenUsage
    - costTracking
  
  alerts:
    errorRateThreshold: 0.05  # 5%
    responseTimeThreshold: 30000  # 30 seconds
    dailyCostThreshold: 1000.00  # $1000

# Strict timeouts
timeouts:
  requestTimeout: 30000   # 30 seconds
  streamTimeout: 60000    # 1 minute
  connectionTimeout: 5000 # 5 seconds
```

### Testing Environment

```yaml
# Testing configuration
environment: testing

# Mock providers for testing
providers:
  mock:
    enabled: true
    priority: 1
    models:
      - id: mock-gpt-4o
        name: "Mock GPT-4o"
        contextLimit: 128000
        maxOutputTokens: 4096
        supportsToolCalling: true
        supportsStreaming: true
  
  # Real providers with test keys
  openai:
    enabled: true
    apiKey: "${OPENAI_API_KEY_TEST}"
    baseUrl: "https://api.openai.com/v1"  # Or test endpoint
    rateLimit:
      requestsPerMinute: 5
      tokensPerMinute: 5000

# Testing-specific settings
settings:
  debug: true
  logLevel: "debug"
  enableMetrics: false
  mockResponses: true
  deterministicResponses: true  # For reproducible tests

# Fast timeouts for quick test feedback
timeouts:
  requestTimeout: 10000   # 10 seconds
  streamTimeout: 20000    # 20 seconds
  connectionTimeout: 2000 # 2 seconds
```

## Configuration Validation

All configurations are validated against the schema. Here's an example of validation rules:

```yaml
# Schema validation rules
validation:
  providers:
    required: ["enabled", "priority"]
    apiKey:
      pattern: "^[A-Za-z0-9_-]+$"
      minLength: 10
    priority:
      type: integer
      minimum: 1
      maximum: 10
  
  rateLimit:
    requestsPerMinute:
      type: integer
      minimum: 1
      maximum: 10000
    tokensPerMinute:
      type: integer
      minimum: 100
      maximum: 1000000
  
  models:
    required: ["id", "name", "contextLimit"]
    contextLimit:
      type: integer
      minimum: 1000
      maximum: 2000000
```

Use the `theo config validate` command to validate your configuration files before deployment.