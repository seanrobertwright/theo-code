#!/usr/bin/env node

/**
 * Advanced Ollama interaction script
 * This script allows you to interact with your local Ollama models
 */

import { OllamaModelService } from '../packages/core/dist/src/ollama/ollamaModelService.js';
import { OllamaContentGenerator } from '../packages/core/dist/src/ollama/ollamaContentGenerator.js';

// Simple readline interface for user input
import * as readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function selectModel(models) {
  console.log('\nAvailable models:');
  models.forEach((model, index) => {
    console.log(`  ${index + 1}. ${model.name} (${(model.size / 1024 / 1024 / 1024).toFixed(2)} GB)`);
  });
  
  const choice = await question('\nSelect a model (enter number): ');
  const index = parseInt(choice) - 1;
  
  if (isNaN(index) || index < 0 || index >= models.length) {
    console.log('Invalid selection. Using the first model.');
    return models[0].name;
  }
  
  return models[index].name;
}

async function getCustomPrompt() {
  const prompt = await question('\nEnter your prompt (or press Enter for default): ');
  return prompt || "Write a short hello world message (just a few words)";
}

async function main() {
  console.log('Advanced Ollama Interaction Script\n');
  
  try {
    // Check if Ollama is accessible
    console.log('Checking if Ollama is accessible...');
    const ollamaService = new OllamaModelService();
    const isAccessible = await ollamaService.isOllamaAccessible();
    
    if (!isAccessible) {
      console.log('Ollama is not accessible. Please make sure it is running on localhost:11434');
      return;
    }
    
    console.log('Ollama is accessible!\n');
    
    // List available models
    console.log('Fetching available models...');
    const models = await ollamaService.listModels();
    
    if (models.length === 0) {
      console.log('No models found. Please pull a model first (e.g., "ollama pull llama3")');
      return;
    }
    
    console.log(`Found ${models.length} model(s):\n`);
    
    // Let user select a model
    const selectedModel = await selectModel(models);
    console.log(`\nSelected model: ${selectedModel}`);
    
    // Get prompt from user
    const prompt = await getCustomPrompt();
    console.log(`\nUsing prompt: "${prompt}"`);
    
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
    
    // Create the content generator
    const generator = new OllamaContentGenerator(selectedModel, mockConfig);
    
    console.log('\nGenerating response...\n');
    
    // Generate content
    const response = await generator.generateContent({
      contents: [{
        role: 'user',
        parts: [{ text: prompt }]
      }]
    }, 'interactive-prompt-id');
    
    const reply = response.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';
    console.log('Response:');
    console.log(reply);
    
    // Ask if user wants to try another prompt
    const continueChoice = await question('\nWould you like to try another prompt? (y/N): ');
    if (continueChoice.toLowerCase() === 'y' || continueChoice.toLowerCase() === 'yes') {
      await main(); // Recursive call for another round
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    rl.close();
  }
}

// Run the main function
main().catch(console.error);