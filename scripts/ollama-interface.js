#!/usr/bin/env node

/**
 * Programmatic Ollama interface
 * This script provides a simple API to interact with Ollama models programmatically
 */

import { OllamaModelService } from '../packages/core/dist/src/ollama/ollamaModelService.js';
import { OllamaContentGenerator } from '../packages/core/dist/src/ollama/ollamaContentGenerator.js';

class OllamaInterface {
  constructor() {
    this.ollamaService = new OllamaModelService();
    this.mockConfig = {
      getCliVersion: () => 'programmatic-interface',
      getProxy: () => undefined,
      getEnableOpenAILogging: () => false,
      getContentGeneratorTimeout: () => 30000,
      getContentGeneratorMaxRetries: () => 3,
      getSamplingParams: () => ({}),
      getContentGeneratorConfig: () => ({}),
      getUsageStatisticsEnabled: () => false,
      getDisableTelemetry: () => true
    };
  }

  /**
   * Check if Ollama is accessible
   * @returns {Promise<boolean>} True if Ollama is accessible, false otherwise
   */
  async isOllamaAccessible() {
    return await this.ollamaService.isOllamaAccessible();
  }

  /**
   * List all available models
   * @returns {Promise<Array>} Array of available models
   */
  async listModels() {
    return await this.ollamaService.listModels();
  }

  /**
   * Generate content using a specific model
   * @param {string} model - The model to use
   * @param {string} prompt - The prompt to send to the model
   * @param {string} promptId - Optional prompt ID for tracking
   * @returns {Promise<string>} The generated response
   */
  async generateContent(model, prompt, promptId = 'programmatic-prompt') {
    const generator = new OllamaContentGenerator(model, this.mockConfig);
    
    const response = await generator.generateContent({
      contents: [{
        role: 'user',
        parts: [{ text: prompt }]
      }]
    }, promptId);
    
    return response.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';
  }

  /**
   * Generate content using the default model
   * @param {string} prompt - The prompt to send to the model
   * @param {string} promptId - Optional prompt ID for tracking
   * @returns {Promise<string>} The generated response
   */
  async generateContentWithDefaultModel(prompt, promptId = 'programmatic-prompt') {
    const models = await this.listModels();
    if (models.length === 0) {
      throw new Error('No models available');
    }
    
    // Use the first model as default
    const defaultModel = models[0].name;
    return await this.generateContent(defaultModel, prompt, promptId);
  }
}

// Export the interface for programmatic use
export { OllamaInterface };

// Run the main function
async function main() {
  const ollama = new OllamaInterface();
  
  console.log('Ollama Programmatic Interface\n');
  
  // Check accessibility
  const isAccessible = await ollama.isOllamaAccessible();
  if (!isAccessible) {
    console.log('Ollama is not accessible. Please make sure it is running.');
    return;
  }
  
  console.log('Ollama is accessible.');
  
  // List models
  const models = await ollama.listModels();
  console.log(`\nFound ${models.length} model(s):`);
  models.forEach((model, index) => {
    console.log(`  ${index + 1}. ${model.name}`);
  });
  
  // Example usage
  console.log('\nGenerating content with default model...');
  const response = await ollama.generateContentWithDefaultModel(
    "Explain what Ollama is in one sentence."
  );
  console.log('Response:', response);
}

main().catch(console.error);