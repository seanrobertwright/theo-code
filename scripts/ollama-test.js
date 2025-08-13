#!/usr/bin/env node

/**
 * Script to test Ollama integration with local models
 * This script demonstrates direct interaction with Ollama API
 */

import { OllamaModelService } from '../packages/core/dist/src/ollama/ollamaModelService.js';
import { OllamaContentGenerator } from '../packages/core/dist/src/ollama/ollamaContentGenerator.js';

async function testOllama() {
  console.log('Testing Ollama integration...\n');
  
  // Test 1: Check if Ollama is accessible
  console.log('1. Checking if Ollama is accessible...');
  const ollamaService = new OllamaModelService();
  const isAccessible = await ollamaService.isOllamaAccessible();
  console.log(`   Ollama accessible: ${isAccessible}`);
  
  if (!isAccessible) {
    console.log('   Please make sure Ollama is running on localhost:11434');
    return;
  }
  
  // Test 2: List available models
  console.log('\n2. Listing available models...');
  try {
    const models = await ollamaService.listModels();
    if (models.length === 0) {
      console.log('   No models found. Please pull a model first (e.g., "ollama pull llama3")');
      return;
    }
    
    console.log(`   Found ${models.length} model(s):`);
    models.forEach((model, index) => {
      console.log(`   ${index + 1}. ${model.name} (${(model.size / 1024 / 1024 / 1024).toFixed(2)} GB)`);
    });
    
    // Test 3: Use the first model to generate content
    console.log('\n3. Testing content generation with the first model...');
    const firstModel = models[0].name;
    console.log(`   Using model: ${firstModel}`);
    
    // Create a minimal config for testing
    const mockConfig = {
      getCliVersion: () => 'test',
      getProxy: () => undefined,
      getEnableOpenAILogging: () => false,
      getContentGeneratorTimeout: () => 30000,
      getContentGeneratorMaxRetries: () => 3,
      getSamplingParams: () => ({}),
      getContentGeneratorConfig: () => ({}),
      getUsageStatisticsEnabled: () => false,
      getDisableTelemetry: () => true
    };
    
    const generator = new OllamaContentGenerator(firstModel, mockConfig);
    
    // Test prompt
    const prompt = "Write a short hello world message (just a few words)";
    
    console.log(`   Prompt: "${prompt}"`);
    console.log('   Generating response...');
    
    const response = await generator.generateContent({
      contents: [{
        role: 'user',
        parts: [{ text: prompt }]
      }]
    }, 'test-prompt-id');
    
    const reply = response.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';
    console.log(`   Response: "${reply}"`);
    
  } catch (error) {
    console.error('   Error:', error.message);
  }
}

// Run the test
testOllama().catch(console.error);