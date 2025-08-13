#!/usr/bin/env node

/**
 * Test script for the new Ollama command
 */

import { OllamaModelService } from '@theo-code/theo-code-core';

async function testOllamaCommand() {
  console.log('Testing Ollama command implementation...\n');
  
  try {
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
    const models = await ollamaService.listModels();
    
    if (models.length === 0) {
      console.log('   No models found. Please pull a model first (e.g., "ollama pull llama3")');
      return;
    }
    
    console.log(`   Found ${models.length} model(s):`);
    models.forEach((model, index) => {
      const sizeInGB = (model.size / 1024 / 1024 / 1024).toFixed(2);
      console.log(`   ${index + 1}. ${model.name} (${sizeInGB} GB)`);
    });
    
    console.log('\nCommand implementation is ready!');
    console.log('You can now use the following commands in Theo Code:');
    console.log('  /ollama list     - List available Ollama models');
    console.log('  /ollama model <model_name>  - Switch to a specific Ollama model');
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testOllamaCommand().catch(console.error);