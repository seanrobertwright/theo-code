# Multi-Provider AI Setup Guide

This guide walks you through setting up and configuring multiple AI providers in theo-code, enabling you to use different AI models and implement fallback strategies for enhanced reliability.

## Overview

theo-code supports multiple AI providers:
- **Anthropic Claude** - Advanced reasoning and safety features
- **Google Gemini** - Multimodal capabilities and cutting-edge AI features
- **OpenRouter** - Unified access to multiple models with single API
- **Cohere** - Enterprise-focused language models
- **Mistral** - European AI with efficiency focus
- **Together** - Open-source model hosting
- **Perplexity** - Search-augmented generation
- **Ollama** - Local model inference for privacy

## Quick Start

1. **Configure your first provider**:
   ```bash
   theo provider add anthropic
   ```

2. **Set your API key**:
   ```bash
   theo config set providers.anthropic.apiKey "your-api-key-here"
   ```

3. **Test the connection**:
   ```bash
   theo provider test anthropic
   ```

4. **Start using the provider**:
   ```bash
   theo chat --provider anthropic
   ```

## Provider Setup Guides

### Anthropic Claude Setup

Anthropic Claude offers advanced reasoning capabilities with strong safety features.

#### Getting Your API Key

1. Visit [Anthropic Console](https://console.anthropic.com/)
2. Sign up or log in to your account
3. Navigate to "API Keys" section
4. Create a new API key
5. Copy the key (starts with `sk-ant-`)

#### Configuration

**Method 1: Using CLI**
```bash
# Add Anthropic provider
theo provider add anthropic

# Set API key
theo config set providers.anthropic.apiKey "sk-ant-your-key-here"

# Optional: Set custom base URL (for enterprise)
theo config set providers.anthropic.baseUrl "https://api.anthropic.com"

# Test connection
theo provider test anthropic
```

**Method 2: Configuration File**
Add to your `~/.theo/config.yaml`:
```yaml
providers:
  anthropic:
    enabled: true
    apiKey: "sk-ant-your-key-here"
    models:
      - claude-3-5-sonnet-20241022
      - claude-3-opus-20240229
      - claude-3-haiku-20240307
    rateLimit:
      requestsPerMinute: 60
      tokensPerMinute: 100000
```

#### Supported Models

| Model | Context | Best For |
|-------|---------|----------|
| `claude-3-5-sonnet-20241022` | 200K | Balanced performance and capability |
| `claude-3-opus-20240229` | 200K | Complex reasoning tasks |
| `claude-3-haiku-20240307` | 200K | Fast, lightweight tasks |

#### Features

- ✅ Streaming responses
- ✅ Tool calling (function calling)
- ✅ Large context windows (200K tokens)
- ✅ System message support
- ✅ Token counting via API

### Google Gemini Setup

Google Gemini provides cutting-edge multimodal AI with advanced reasoning capabilities.

#### Getting Your API Key

1. Visit [Google AI Studio](https://aistudio.google.com/)
2. Sign in with your Google account
3. Click "Get API key" in the left sidebar
4. Create a new API key
5. Copy the key (starts with `AIza`)

#### Configuration

**Method 1: Using CLI**
```bash
# Add Google provider
theo provider add google

# Set API key
theo config set providers.google.apiKey "AIza-your-key-here"

# Test connection
theo provider test google
```

**Method 2: Configuration File**
Add to your `~/.theo/config.yaml`:
```yaml
providers:
  google:
    enabled: true
    apiKey: "AIza-your-key-here"
    models:
      - gemini-3-pro-preview
      - gemini-3-flash-preview
      - gemini-3-pro-image-preview
      - gemini-2-flash-preview
      - gemini-2-flash-thinking-preview
    features:
      thinkingLevels: true
      imageGeneration: true
      multimodal: true
    rateLimit:
      requestsPerMinute: 60
      tokensPerMinute: 1000000
```

#### Supported Models

| Model | Context | Special Features |
|-------|---------|------------------|
| `gemini-3-pro-preview` | 1M | Advanced reasoning, Jan 2025 knowledge |
| `gemini-3-flash-preview` | 1M | Pro-level intelligence at Flash speed |
| `gemini-3-pro-image-preview` | 1M | Native image generation |
| `gemini-2-flash-preview` | 1M | Multimodal agents, native tool use |
| `gemini-2-flash-thinking-preview` | 1M | Enhanced reasoning with thinking mode |

#### Advanced Features

**Thinking Levels** (Gemini 3.0+):
```yaml
providers:
  google:
    gemini:
      thinkingLevel: "medium"  # low, medium, high
      thoughtSignatures: true  # Enable reasoning continuity
```

**Media Resolution Controls**:
```yaml
providers:
  google:
    gemini:
      mediaResolution: "high"  # low, medium, high, ultra_high
```

**Image Generation** (Gemini 3.0 Pro Image):
```yaml
providers:
  google:
    gemini:
      imageConfig:
        aspectRatio: "16:9"
        imageSize: "2K"  # 1K, 2K, 4K
```

#### Features

- ✅ Streaming responses
- ✅ Function calling with structured outputs
- ✅ Multimodal input (text, image, video, audio)
- ✅ Native image generation (Gemini 3.0 Pro Image)
- ✅ Thinking levels for controlled reasoning
- ✅ Thought signatures for conversation continuity
- ✅ Google Search grounding

### OpenRouter Setup

OpenRouter provides unified access to multiple AI models through a single API.

#### Getting Your API Key

1. Visit [OpenRouter](https://openrouter.ai/)
2. Sign up or log in
3. Go to "Keys" section
4. Create a new API key
5. Copy the key (starts with `sk-or-`)

#### Configuration

**Method 1: Using CLI**
```bash
# Add OpenRouter provider
theo provider add openrouter

# Set API key
theo config set providers.openrouter.apiKey "sk-or-your-key-here"

# Test connection
theo provider test openrouter
```

**Method 2: Configuration File**
```yaml
providers:
  openrouter:
    enabled: true
    apiKey: "sk-or-your-key-here"
    baseUrl: "https://openrouter.ai/api/v1"
    # Models are discovered dynamically from catalog
    rateLimit:
      requestsPerMinute: 200
      tokensPerMinute: 500000
```

#### Popular Models Available

| Model | Provider | Best For |
|-------|----------|----------|
| `anthropic/claude-3.5-sonnet` | Anthropic | Balanced performance |
| `google/gemini-pro-1.5` | Google | Multimodal tasks |
| `openai/gpt-4o` | OpenAI | General purpose |
| `meta-llama/llama-3.1-405b` | Meta | Open source |

#### Features

- ✅ Access to 100+ models
- ✅ OpenAI-compatible API
- ✅ Dynamic model catalog
- ✅ Usage tracking and credits
- ✅ Model-specific capabilities

### Cohere Setup

Cohere provides enterprise-focused language models with strong multilingual support.

#### Getting Your API Key

1. Visit [Cohere Dashboard](https://dashboard.cohere.ai/)
2. Sign up or log in
3. Navigate to API Keys
4. Create a new API key
5. Copy the key

#### Configuration

```bash
# Add Cohere provider
theo provider add cohere

# Set API key
theo config set providers.cohere.apiKey "your-cohere-key"

# Test connection
theo provider test cohere
```

**Configuration File**:
```yaml
providers:
  cohere:
    enabled: true
    apiKey: "your-cohere-key"
    models:
      - command
      - command-light
      - command-nightly
    rateLimit:
      requestsPerMinute: 100
      tokensPerMinute: 200000
```

#### Features

- ✅ Chat API with streaming
- ✅ Tool calling support
- ✅ Enterprise features
- ✅ Multilingual capabilities

### Mistral Setup

Mistral AI offers efficient European AI models with strong performance.

#### Getting Your API Key

1. Visit [Mistral Console](https://console.mistral.ai/)
2. Sign up or log in
3. Go to API Keys section
4. Create a new key
5. Copy the key

#### Configuration

```bash
# Add Mistral provider
theo provider add mistral

# Set API key
theo config set providers.mistral.apiKey "your-mistral-key"

# Test connection
theo provider test mistral
```

**Configuration File**:
```yaml
providers:
  mistral:
    enabled: true
    apiKey: "your-mistral-key"
    models:
      - mistral-large-latest
      - mistral-medium-latest
      - mistral-small-latest
    rateLimit:
      requestsPerMinute: 60
      tokensPerMinute: 150000
```

#### Features

- ✅ Chat completions
- ✅ Function calling
- ✅ European AI compliance
- ✅ Efficient performance

### Together Setup

Together AI provides access to open-source models with custom deployment options.

#### Getting Your API Key

1. Visit [Together AI](https://api.together.xyz/)
2. Sign up or log in
3. Navigate to API Keys
4. Create a new key
5. Copy the key

#### Configuration

```bash
# Add Together provider
theo provider add together

# Set API key
theo config set providers.together.apiKey "your-together-key"

# Test connection
theo provider test together
```

**Configuration File**:
```yaml
providers:
  together:
    enabled: true
    apiKey: "your-together-key"
    models:
      - meta-llama/Llama-2-70b-chat-hf
      - mistralai/Mixtral-8x7B-Instruct-v0.1
      - togethercomputer/RedPajama-INCITE-Chat-3B-v1
    rateLimit:
      requestsPerMinute: 100
      tokensPerMinute: 300000
```

#### Features

- ✅ Open-source model catalog
- ✅ Custom model deployment
- ✅ Inference API
- ✅ Community models

### Perplexity Setup

Perplexity AI provides search-augmented generation with real-time information access.

#### Getting Your API Key

1. Visit [Perplexity AI](https://www.perplexity.ai/)
2. Sign up for API access
3. Navigate to API section
4. Create a new key
5. Copy the key

#### Configuration

```bash
# Add Perplexity provider
theo provider add perplexity

# Set API key
theo config set providers.perplexity.apiKey "your-perplexity-key"

# Test connection
theo provider test perplexity
```

**Configuration File**:
```yaml
providers:
  perplexity:
    enabled: true
    apiKey: "your-perplexity-key"
    models:
      - pplx-7b-online
      - pplx-70b-online
      - pplx-7b-chat
      - pplx-70b-chat
    features:
      searchAugmented: true
      realTimeInfo: true
    rateLimit:
      requestsPerMinute: 60
      tokensPerMinute: 100000
```

#### Features

- ✅ Search-augmented generation
- ✅ Real-time information access
- ✅ Online and offline models
- ✅ Citation support

### Ollama Setup (Local Models)

Ollama enables running AI models locally for privacy and offline usage.

#### Installation

**macOS/Linux**:
```bash
# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Start Ollama service
ollama serve
```

**Windows**:
1. Download Ollama from [ollama.ai](https://ollama.ai/)
2. Run the installer
3. Ollama will start automatically

#### Configuration

```bash
# Add Ollama provider
theo provider add ollama

# Set base URL (default: http://localhost:11434)
theo config set providers.ollama.baseUrl "http://localhost:11434"

# Test connection
theo provider test ollama
```

**Configuration File**:
```yaml
providers:
  ollama:
    enabled: true
    baseUrl: "http://localhost:11434"
    models:
      - llama2
      - codellama
      - mistral
      - neural-chat
    features:
      localInference: true
      offline: true
```

#### Installing Models

```bash
# Install popular models
ollama pull llama2
ollama pull codellama
ollama pull mistral

# List installed models
ollama list
```

#### Popular Models

| Model | Size | Best For |
|-------|------|----------|
| `llama2` | 7B/13B/70B | General conversation |
| `codellama` | 7B/13B/34B | Code generation |
| `mistral` | 7B | Efficient performance |
| `neural-chat` | 7B | Chat applications |

#### Features

- ✅ Local inference (privacy)
- ✅ Offline usage
- ✅ Model management
- ✅ Custom model support
- ✅ No API costs

## Environment Variables

You can also configure providers using environment variables:

```bash
# Anthropic
export ANTHROPIC_API_KEY="sk-ant-your-key"

# Google
export GOOGLE_API_KEY="AIza-your-key"

# OpenRouter
export OPENROUTER_API_KEY="sk-or-your-key"

# Cohere
export COHERE_API_KEY="your-cohere-key"

# Mistral
export MISTRAL_API_KEY="your-mistral-key"

# Together
export TOGETHER_API_KEY="your-together-key"

# Perplexity
export PERPLEXITY_API_KEY="your-perplexity-key"
```

## Security Best Practices

### API Key Management

1. **Never commit API keys to version control**
2. **Use environment variables in production**
3. **Rotate keys regularly**
4. **Use separate keys for development/production**
5. **Monitor API usage for anomalies**

### Configuration Security

```yaml
# Good: Use environment variables
providers:
  anthropic:
    apiKey: "${ANTHROPIC_API_KEY}"

# Bad: Hardcoded keys
providers:
  anthropic:
    apiKey: "sk-ant-actual-key-here"  # DON'T DO THIS
```

### File Permissions

```bash
# Secure your config file
chmod 600 ~/.theo/config.yaml

# Secure your project config
chmod 600 .theo/config.yaml
```

## Next Steps

- [Configuration Examples](./MULTI_PROVIDER_CONFIG_EXAMPLES.md) - See example configurations
- [Provider Features](./MULTI_PROVIDER_FEATURES.md) - Compare provider capabilities
- [Troubleshooting](./MULTI_PROVIDER_TROUBLESHOOTING.md) - Common issues and solutions

## Troubleshooting Guide

### Common Issues and Solutions

#### Authentication Errors

**Problem**: `Invalid API key` or `Authentication failed`

**Solutions**:
1. **Verify API key format**:
   - Anthropic: Should start with `sk-ant-`
   - Google: Should start with `AIza`
   - OpenRouter: Should start with `sk-or-`
   
2. **Check key validity**:
   ```bash
   # Test individual provider
   theo provider test anthropic
   theo provider test google
   theo provider test openrouter
   ```

3. **Verify environment variables**:
   ```bash
   echo $ANTHROPIC_API_KEY
   echo $GOOGLE_API_KEY
   ```

4. **Check configuration file**:
   ```bash
   theo config get providers.anthropic.apiKey
   ```

#### Rate Limiting Issues

**Problem**: `Rate limit exceeded` or `Too many requests`

**Solutions**:
1. **Check current rate limits**:
   ```bash
   theo provider status anthropic
   ```

2. **Adjust rate limits in config**:
   ```yaml
   providers:
     anthropic:
       rateLimit:
         requestsPerMinute: 30  # Reduce from default
         tokensPerMinute: 50000
   ```

3. **Enable request queuing**:
   ```yaml
   providers:
     anthropic:
       features:
         requestQueuing: true
         maxQueueSize: 100
   ```

4. **Use fallback providers**:
   ```yaml
   fallbackChain:
     - anthropic
     - google
     - openrouter
   ```

#### Connection Issues

**Problem**: `Connection timeout` or `Service unavailable`

**Solutions**:
1. **Check internet connectivity**:
   ```bash
   ping api.anthropic.com
   ping generativelanguage.googleapis.com
   ```

2. **Verify base URLs**:
   ```bash
   theo config get providers.anthropic.baseUrl
   ```

3. **Test with curl**:
   ```bash
   curl -H "x-api-key: $ANTHROPIC_API_KEY" https://api.anthropic.com/v1/messages
   ```

4. **Check firewall/proxy settings**:
   - Ensure ports 443 (HTTPS) is open
   - Configure proxy if needed:
   ```yaml
   providers:
     anthropic:
       proxy: "http://proxy.company.com:8080"
   ```

#### Model Not Found

**Problem**: `Model not found` or `Invalid model name`

**Solutions**:
1. **List available models**:
   ```bash
   theo provider models anthropic
   theo provider models google
   ```

2. **Check model name spelling**:
   ```yaml
   # Correct
   model: "claude-3-5-sonnet-20241022"
   
   # Incorrect
   model: "claude-3.5-sonnet"
   ```

3. **Verify model availability**:
   - Some models may be region-restricted
   - Check provider documentation for availability

#### Context Length Exceeded

**Problem**: `Context length exceeded` or `Input too long`

**Solutions**:
1. **Check model context limits**:
   ```bash
   theo provider info claude-3-5-sonnet-20241022
   ```

2. **Enable automatic truncation**:
   ```yaml
   providers:
     anthropic:
       features:
         autoTruncate: true
         maxContextTokens: 180000  # Leave buffer for response
   ```

3. **Use models with larger context**:
   - Claude 3.5 Sonnet: 200K tokens
   - Gemini 1.5 Pro: 1M tokens
   - GPT-4 Turbo: 128K tokens

#### Ollama Issues

**Problem**: Ollama connection or model issues

**Solutions**:
1. **Check Ollama service**:
   ```bash
   # Check if running
   ps aux | grep ollama
   
   # Start service
   ollama serve
   ```

2. **Verify model installation**:
   ```bash
   ollama list
   ollama pull llama2  # Install if missing
   ```

3. **Check port availability**:
   ```bash
   netstat -an | grep 11434
   curl http://localhost:11434/api/tags
   ```

4. **Update Ollama**:
   ```bash
   # macOS/Linux
   curl -fsSL https://ollama.ai/install.sh | sh
   ```

#### Provider-Specific Issues

**Anthropic Claude**:
- **Content Policy**: Claude may refuse certain requests due to safety guidelines
- **System Messages**: Use proper system message format for Claude
- **Tool Calling**: Ensure tools are properly formatted for Anthropic's schema

**Google Gemini**:
- **Safety Settings**: Adjust safety settings if content is blocked
- **Multimodal**: Ensure media files are in supported formats
- **Thinking Levels**: Only available on Gemini 3.0+ models

**OpenRouter**:
- **Credits**: Check account balance and credit usage
- **Model Availability**: Some models may be temporarily unavailable
- **Rate Limits**: Vary by model and account tier

### Debugging Commands

**Enable debug logging**:
```bash
export THEO_DEBUG=true
export THEO_LOG_LEVEL=debug
theo chat --provider anthropic --debug
```

**Test provider connectivity**:
```bash
# Test all providers
theo provider test-all

# Test specific provider with verbose output
theo provider test anthropic --verbose
```

**Check configuration**:
```bash
# Show current config
theo config show

# Validate configuration
theo config validate

# Show provider status
theo provider status
```

**Monitor API usage**:
```bash
# Show usage statistics
theo provider usage anthropic

# Show rate limit status
theo provider limits anthropic
```

### Getting Help

If you're still experiencing issues:

1. **Check the logs**:
   ```bash
   tail -f ~/.theo/logs/theo.log
   ```

2. **Search existing issues**: Check the project's GitHub issues

3. **Create a bug report** with:
   - Provider name and model
   - Error message (sanitized of API keys)
   - Configuration (sanitized)
   - Steps to reproduce

4. **Community support**: Join the project's Discord or forum

### Performance Optimization

**Improve response times**:
```yaml
providers:
  anthropic:
    features:
      connectionPooling: true
      keepAlive: true
      maxConnections: 10
    timeout:
      connect: 5000
      request: 30000
```

**Optimize token usage**:
```yaml
providers:
  anthropic:
    features:
      tokenCaching: true
      smartTruncation: true
    limits:
      maxInputTokens: 150000
      reserveOutputTokens: 4000
```

**Enable caching**:
```yaml
cache:
  enabled: true
  provider: "redis"  # or "memory"
  ttl: 3600  # 1 hour
  maxSize: "100MB"
```