# Provider-Specific Features and Capabilities

This document provides detailed information about the capabilities and features of each AI provider supported by theo-code, including a comprehensive comparison matrix and migration guides.

## Table of Contents

- [Provider Overview](#provider-overview)
- [Feature Comparison Matrix](#feature-comparison-matrix)
- [Provider-Specific Capabilities](#provider-specific-capabilities)
- [Migration Guides](#migration-guides)
- [Model Selection Guidelines](#model-selection-guidelines)
- [Performance Characteristics](#performance-characteristics)

## Provider Overview

### Supported Providers

| Provider | Status | Models Available | Primary Strengths |
|----------|--------|------------------|-------------------|
| **OpenAI** | ✅ Stable | GPT-4o, GPT-4o-mini, GPT-3.5-turbo | General purpose, tool calling, reliable |
| **Anthropic** | ✅ Stable | Claude 3.5 Sonnet, Claude 3 Opus, Claude 3 Haiku | Safety, reasoning, long context |
| **Google** | ✅ Stable | Gemini 3.0 Pro/Flash, Gemini 2.0 Flash, Gemini 1.5 Pro | Multimodal, reasoning, image generation |
| **OpenRouter** | ✅ Stable | 100+ models | Model variety, unified API, cost optimization |
| **Cohere** | ✅ Stable | Command, Command Light | Enterprise features, multilingual |
| **Mistral** | ✅ Stable | Large, Medium, Small | European AI, efficiency, function calling |
| **Together** | ✅ Stable | Open-source models | Open-source focus, custom deployments |
| **Perplexity** | ✅ Stable | Sonar models | Real-time search, up-to-date information |
| **Ollama** | ✅ Stable | Local models | Privacy, offline usage, no API costs |

## Feature Comparison Matrix

### Core Capabilities

| Feature | OpenAI | Anthropic | Google | OpenRouter | Cohere | Mistral | Together | Perplexity | Ollama |
|---------|--------|-----------|--------|------------|--------|---------|----------|------------|--------|
| **Text Generation** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Streaming** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Tool Calling** | ✅ | ✅ | ✅ | ✅¹ | ✅ | ✅ | ❌² | ❌ | ❌² |
| **JSON Mode** | ✅ | ✅ | ✅ | ✅¹ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **System Messages** | ✅ | ✅ | ✅ | ✅¹ | ✅ | ✅ | ✅ | ✅ | ✅ |

¹ Depends on underlying model  
² Some models support via prompt engineering

### Advanced Features

| Feature | OpenAI | Anthropic | Google | OpenRouter | Cohere | Mistral | Together | Perplexity | Ollama |
|---------|--------|-----------|--------|------------|--------|---------|----------|------------|--------|
| **Multimodal (Images)** | ✅ | ✅ | ✅ | ✅¹ | ❌ | ❌ | ✅¹ | ❌ | ✅¹ |
| **Image Generation** | ❌ | ❌ | ✅ | ✅¹ | ❌ | ❌ | ✅¹ | ❌ | ✅¹ |
| **Video Processing** | ❌ | ❌ | ✅ | ✅¹ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Audio Processing** | ❌ | ❌ | ✅ | ✅¹ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Web Search** | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Real-time Data** | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Reasoning Modes** | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

¹ Depends on underlying model

### Context and Performance

| Metric | OpenAI | Anthropic | Google | OpenRouter | Cohere | Mistral | Together | Perplexity | Ollama |
|---------|--------|-----------|--------|------------|--------|---------|----------|------------|--------|
| **Max Context** | 128K | 200K | 1M | Varies¹ | 128K | 128K | Varies | 127K | Varies² |
| **Max Output** | 16K | 8K | 8K | Varies¹ | 4K | 8K | Varies | 4K | Varies² |
| **Typical Latency** | Low | Medium | Low-High³ | Varies¹ | Medium | Low | Varies | Medium | Very Low⁴ |
| **Rate Limits** | High | Medium | High | High | Medium | Medium | Medium | Low | None⁴ |

¹ Depends on selected model  
² Depends on local hardware  
³ Higher for reasoning modes  
⁴ Local processing

## Provider-Specific Capabilities

### OpenAI

**Strengths:**
- Reliable and consistent performance
- Excellent tool calling support
- Strong general-purpose capabilities
- Good documentation and community support

**Models:**
- **GPT-4o**: Latest flagship model, excellent for complex tasks
- **GPT-4o-mini**: Cost-effective alternative, good for simpler tasks
- **GPT-3.5-turbo**: Legacy model, still capable for basic tasks

**Unique Features:**
- JSON mode for structured outputs
- Seed parameter for reproducible outputs
- Function calling with parallel execution
- Fine-tuning capabilities (via API)

**Best Use Cases:**
- General-purpose AI assistance
- Code generation and analysis
- Tool-based workflows
- Production applications requiring reliability

**Limitations:**
- No multimodal capabilities in current models
- No real-time information access
- Higher costs for premium models

### Anthropic Claude

**Strengths:**
- Superior safety and alignment
- Excellent reasoning capabilities
- Long context windows (200K tokens)
- Strong performance on complex analytical tasks

**Models:**
- **Claude 3.5 Sonnet**: Best balance of capability and speed
- **Claude 3 Opus**: Most capable model, highest quality
- **Claude 3 Haiku**: Fastest and most cost-effective

**Unique Features:**
- Constitutional AI training for safety
- Excellent at following complex instructions
- Strong performance on creative writing
- Good at explaining reasoning processes

**Best Use Cases:**
- Complex analysis and reasoning tasks
- Creative writing and content generation
- Safety-critical applications
- Long document processing

**Limitations:**
- No multimodal capabilities
- No real-time information access
- More conservative in responses
- Higher latency for complex requests

### Google Gemini

**Strengths:**
- Advanced multimodal capabilities
- Native image generation (Gemini 3.0)
- Sophisticated reasoning with thinking modes
- Large context windows (1M tokens)
- Integration with Google services

**Models:**
- **Gemini 3.0 Pro**: Advanced reasoning, 1M context, latest knowledge
- **Gemini 3.0 Flash**: Pro-level intelligence at Flash speed
- **Gemini 3.0 Pro Image**: Native image generation capabilities
- **Gemini 2.0 Flash**: Multimodal agents with native tool use
- **Gemini 2.0 Flash Thinking**: Enhanced reasoning with thinking mode

**Unique Features:**
- **Thinking Levels**: Controlled reasoning depth (low/medium/high)
- **Thought Signatures**: Encrypted reasoning context for continuity
- **Media Resolution Controls**: Optimize processing for different media types
- **Native Image Generation**: Create and edit images conversationally
- **Grounding**: Integration with Google Search for real-time information
- **Code Execution**: Built-in Python code execution environment

**Advanced Capabilities:**
```yaml
# Gemini 3.0 specific features
gemini:
  thinkingLevel: medium        # Control reasoning depth
  mediaResolution: high        # Optimize for quality
  thoughtSignatures: true      # Enable reasoning continuity
  imageGeneration:
    aspectRatio: "16:9"
    imageSize: "2K"
  grounding:
    googleSearch: true
    urlContext: ["https://docs.example.com"]
```

**Best Use Cases:**
- Multimodal applications (text + images + video + audio)
- Complex reasoning and analysis tasks
- Image generation and editing
- Research with real-time information needs
- Applications requiring large context windows
- Creative projects combining multiple media types

**Limitations:**
- Higher latency for complex reasoning modes
- More complex configuration options
- Newer models may have less community documentation

### OpenRouter

**Strengths:**
- Access to 100+ models from multiple providers
- Unified API interface
- Cost optimization through model selection
- No vendor lock-in

**Available Models:**
- All major provider models (OpenAI, Anthropic, Google, Meta, etc.)
- Open-source models (Llama, Mixtral, etc.)
- Specialized models for specific tasks

**Unique Features:**
- Model routing and load balancing
- Cost tracking and optimization
- Fallback between models
- Access to latest models quickly

**Best Use Cases:**
- Experimentation with different models
- Cost optimization strategies
- Applications requiring model diversity
- Avoiding vendor lock-in

**Limitations:**
- Capabilities depend on underlying models
- Additional latency from routing layer
- Rate limits vary by model
- Less direct control over model parameters

### Cohere

**Strengths:**
- Enterprise-focused features
- Strong multilingual capabilities
- Excellent for business applications
- Good performance on classification tasks

**Models:**
- **Command**: Full-featured chat model
- **Command Light**: Faster, more cost-effective option

**Unique Features:**
- Enterprise security and compliance
- Strong multilingual support
- Specialized embedding models
- Classification and clustering capabilities

**Best Use Cases:**
- Enterprise applications
- Multilingual content processing
- Business document analysis
- Customer service applications

**Limitations:**
- Smaller model selection
- Less community adoption
- Limited multimodal capabilities

### Mistral

**Strengths:**
- European AI provider (GDPR compliance)
- Efficient and fast models
- Good function calling support
- Competitive pricing

**Models:**
- **Mistral Large**: Most capable model
- **Mistral Medium**: Balanced performance
- **Mistral Small**: Cost-effective option

**Unique Features:**
- European data residency
- Efficient architecture
- Good multilingual support (especially European languages)
- Strong performance on coding tasks

**Best Use Cases:**
- European compliance requirements
- Cost-sensitive applications
- Coding and technical tasks
- Multilingual European content

**Limitations:**
- Smaller ecosystem
- Limited multimodal capabilities
- Fewer specialized features

### Together AI

**Strengths:**
- Focus on open-source models
- Custom model deployment
- Good performance optimization
- Community-driven development

**Available Models:**
- Llama family models
- Mixtral models
- Code-specialized models
- Custom fine-tuned models

**Unique Features:**
- Open-source model hosting
- Custom model deployment
- Community model sharing
- Transparent pricing

**Best Use Cases:**
- Open-source model preference
- Custom model requirements
- Research and experimentation
- Cost-conscious applications

**Limitations:**
- Limited proprietary model access
- Fewer enterprise features
- Variable model quality
- Less comprehensive documentation

### Perplexity

**Strengths:**
- Real-time web search integration
- Up-to-date information access
- Citation and source tracking
- Good for research tasks

**Models:**
- **Sonar Large Online**: Most capable with search
- **Sonar Small Online**: Faster option with search

**Unique Features:**
- Real-time web search
- Source citations
- Current information access
- Research-optimized responses

**Best Use Cases:**
- Research and fact-checking
- Current events analysis
- Information synthesis
- Applications requiring up-to-date data

**Limitations:**
- Limited to search-augmented tasks
- No tool calling support
- Smaller model selection
- Dependency on web search quality

### Ollama

**Strengths:**
- Complete privacy (local processing)
- No API costs
- Offline capability
- Full control over models

**Available Models:**
- Llama family (3.1, 3.2)
- Code Llama
- Mistral models
- Specialized models (medical, legal, etc.)

**Unique Features:**
- Local model management
- Offline operation
- No data transmission
- Custom model support

**Best Use Cases:**
- Privacy-sensitive applications
- Offline environments
- Cost-conscious deployments
- Custom model requirements

**Limitations:**
- Requires local hardware
- Limited by local compute power
- No cloud-scale features
- Manual model management

## Migration Guides

### Migrating from OpenAI to Other Providers

#### From OpenAI to Anthropic Claude

**Configuration Changes:**
```yaml
# Before (OpenAI)
providers:
  openai:
    enabled: true
    apiKey: "${OPENAI_API_KEY}"
    models: ["gpt-4o", "gpt-4o-mini"]

# After (Anthropic)
providers:
  anthropic:
    enabled: true
    apiKey: "${ANTHROPIC_API_KEY}"
    models: ["claude-3-5-sonnet-20241022", "claude-3-haiku-20240307"]
```

**Model Mapping:**
- `gpt-4o` → `claude-3-5-sonnet-20241022`
- `gpt-4o-mini` → `claude-3-haiku-20240307`
- `gpt-3.5-turbo` → `claude-3-haiku-20240307`

**Key Differences:**
1. **System Messages**: Claude handles system messages differently
   ```typescript
   // OpenAI format
   { role: 'system', content: 'You are a helpful assistant.' }
   
   // Anthropic format (converted automatically)
   // System message becomes a parameter, not a message
   ```

2. **Tool Calling**: Similar capabilities, different format
   ```typescript
   // Both support tool calling, but Anthropic uses different JSON structure
   // theo-code handles conversion automatically
   ```

3. **Context Limits**: Claude has larger context (200K vs 128K)
4. **Response Style**: Claude tends to be more verbose and explanatory

**Migration Checklist:**
- [ ] Update API key configuration
- [ ] Test tool calling functionality
- [ ] Verify system message handling
- [ ] Check context window usage
- [ ] Test streaming responses
- [ ] Validate error handling

#### From OpenAI to Google Gemini

**Configuration Changes:**
```yaml
# Before (OpenAI)
providers:
  openai:
    enabled: true
    apiKey: "${OPENAI_API_KEY}"

# After (Google)
providers:
  google:
    enabled: true
    apiKey: "${GOOGLE_API_KEY}"
    gemini:
      thinkingLevel: medium
      mediaResolution: high
```

**Model Mapping:**
- `gpt-4o` → `gemini-3-pro-preview`
- `gpt-4o-mini` → `gemini-3-flash-preview`
- `gpt-3.5-turbo` → `gemini-3-flash-preview`

**New Capabilities Available:**
1. **Multimodal Processing**: Add image, video, audio support
2. **Thinking Modes**: Enable advanced reasoning
3. **Image Generation**: Native image creation capabilities
4. **Large Context**: Up to 1M tokens

**Migration Benefits:**
- Larger context windows (1M vs 128K tokens)
- Multimodal capabilities
- Advanced reasoning modes
- Native image generation
- Real-time information access

**Migration Checklist:**
- [ ] Update API key configuration
- [ ] Configure Gemini-specific features
- [ ] Test multimodal capabilities
- [ ] Verify tool calling with new format
- [ ] Test thinking modes
- [ ] Validate large context handling

#### From OpenAI to OpenRouter

**Configuration Changes:**
```yaml
# Before (OpenAI)
providers:
  openai:
    enabled: true
    apiKey: "${OPENAI_API_KEY}"

# After (OpenRouter)
providers:
  openrouter:
    enabled: true
    apiKey: "${OPENROUTER_API_KEY}"
    preferredModels:
      - "openai/gpt-4o"           # Same models via OpenRouter
      - "anthropic/claude-3.5-sonnet"  # Plus other providers
      - "google/gemini-pro-1.5"
```

**Benefits:**
- Access to multiple providers through one API
- Cost optimization through model selection
- Easy A/B testing between models
- Reduced vendor lock-in

**Migration Checklist:**
- [ ] Update API key to OpenRouter
- [ ] Configure preferred models
- [ ] Set up cost tracking
- [ ] Test model switching
- [ ] Verify rate limits per model

### Migrating Between Other Providers

#### Anthropic to Google Gemini

**Key Changes:**
- Gain multimodal capabilities
- Larger context windows (1M vs 200K)
- Different safety approaches
- New reasoning modes

#### Google to Anthropic

**Key Changes:**
- Lose multimodal capabilities
- Smaller context (200K vs 1M)
- More conservative responses
- Better safety guarantees

#### Any Provider to Ollama

**Benefits:**
- Complete privacy
- No API costs
- Offline capability

**Requirements:**
- Local hardware (GPU recommended)
- Model management
- Performance tuning

**Migration Steps:**
1. Install Ollama locally
2. Download required models
3. Update configuration to local endpoint
4. Test performance and adjust settings

## Model Selection Guidelines

### By Use Case

#### Code Generation and Analysis
**Recommended:**
1. **OpenAI GPT-4o** - Excellent general coding
2. **Anthropic Claude 3.5 Sonnet** - Strong reasoning
3. **Google Gemini 3.0 Pro** - Advanced analysis
4. **Ollama Code Llama** - Local/private coding

#### Creative Writing
**Recommended:**
1. **Anthropic Claude 3.5 Sonnet** - Best creative capabilities
2. **Google Gemini 3.0 Pro** - Strong creative reasoning
3. **OpenAI GPT-4o** - Reliable creative output

#### Research and Analysis
**Recommended:**
1. **Perplexity Sonar** - Real-time information
2. **Google Gemini 3.0 Pro** - Large context + search
3. **Anthropic Claude 3 Opus** - Deep analysis
4. **OpenAI GPT-4o** - Reliable analysis

#### Multimodal Tasks
**Recommended:**
1. **Google Gemini 3.0 Pro** - Best multimodal + reasoning
2. **Google Gemini 3.0 Flash** - Fast multimodal
3. **OpenRouter** - Access to various multimodal models

#### Cost-Sensitive Applications
**Recommended:**
1. **Ollama** - No API costs (local)
2. **OpenAI GPT-4o-mini** - Good value
3. **Anthropic Claude 3 Haiku** - Fast and cheap
4. **Google Gemini 3.0 Flash** - Efficient performance

#### Enterprise/Compliance
**Recommended:**
1. **Mistral** - European compliance
2. **Cohere** - Enterprise features
3. **Anthropic Claude** - Safety focus
4. **Ollama** - Complete data control

### By Performance Requirements

#### Low Latency
1. **Google Gemini 3.0 Flash** - Optimized for speed
2. **Anthropic Claude 3 Haiku** - Fastest Claude
3. **OpenAI GPT-4o-mini** - Quick responses
4. **Ollama** - Local processing (no network)

#### High Throughput
1. **OpenAI** - High rate limits
2. **Google Gemini** - Good concurrent handling
3. **OpenRouter** - Multiple model access
4. **Ollama** - Limited only by hardware

#### Large Context
1. **Google Gemini** - 1M tokens
2. **Anthropic Claude** - 200K tokens
3. **OpenAI** - 128K tokens

## Performance Characteristics

### Latency Comparison (Typical)

| Provider | Model | Avg Latency | Streaming Start | Notes |
|----------|-------|-------------|-----------------|-------|
| OpenAI | GPT-4o | 2-4s | <500ms | Consistent performance |
| OpenAI | GPT-4o-mini | 1-2s | <300ms | Faster, good value |
| Anthropic | Claude 3.5 Sonnet | 3-6s | <800ms | Higher for complex tasks |
| Anthropic | Claude 3 Haiku | 1-3s | <400ms | Fastest Claude model |
| Google | Gemini 3.0 Flash | 1-3s | <400ms | Optimized for speed |
| Google | Gemini 3.0 Pro | 2-8s | <600ms | Higher with thinking modes |
| Ollama | Local models | 0.5-5s | <100ms | Depends on hardware |

### Throughput Characteristics

| Provider | Requests/min | Tokens/min | Concurrent | Notes |
|----------|--------------|------------|------------|-------|
| OpenAI | 500+ | 500K+ | 50+ | High limits for paid tiers |
| Anthropic | 200+ | 200K+ | 20+ | More conservative limits |
| Google | 300+ | 300K+ | 30+ | Good for multimodal |
| OpenRouter | Varies | Varies | Varies | Depends on model |
| Ollama | Unlimited | Unlimited | Limited | Hardware dependent |

### Cost Comparison (per 1K tokens)

| Provider | Model | Input | Output | Notes |
|----------|-------|-------|--------|-------|
| OpenAI | GPT-4o | $2.50 | $10.00 | Premium pricing |
| OpenAI | GPT-4o-mini | $0.15 | $0.60 | Good value |
| Anthropic | Claude 3.5 Sonnet | $3.00 | $15.00 | Premium quality |
| Anthropic | Claude 3 Haiku | $0.25 | $1.25 | Cost effective |
| Google | Gemini 3.0 Pro | $1.25 | $5.00 | Competitive pricing |
| Google | Gemini 3.0 Flash | $0.075 | $0.30 | Very cost effective |
| Ollama | Any model | $0.00 | $0.00 | Local processing only |

*Prices are approximate and may vary by region and usage tier.*

## Conclusion

Each provider offers unique strengths and capabilities. The choice depends on your specific requirements:

- **OpenAI**: Best for general-purpose, reliable applications
- **Anthropic**: Best for safety-critical and complex reasoning tasks
- **Google**: Best for multimodal applications and advanced reasoning
- **OpenRouter**: Best for flexibility and cost optimization
- **Ollama**: Best for privacy and cost-sensitive applications

Use the fallback configuration to combine multiple providers for optimal reliability and performance.