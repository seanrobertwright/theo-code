  /**
   * Creates the Google Gemini request.
   */
  private createRequest(
    contents: Content[],
    tools: Tool[] | undefined,
    options?: GenerateOptions
  ): GenerateContentRequest {
    logger.debug('[Google] Creating request with:', {
      contentCount: contents.length,
      hasTools: !!tools,
      toolsCount: tools?.[0] && 'functionDeclarations' in tools[0] ? tools[0].functionDeclarations?.length ?? 0 : 0,
      model: this.model
    });

    // Merge with built-in tools if enabled
    const finalTools = tools ? mergeWithBuiltInTools(tools, options?.includeBuiltInTools ?? false) : undefined;

    // Add migration context if available
    const migrationContext = (this as any).migrationContext;
    if (migrationContext && contents.length > 0) {
      const migrationPrompt = this.createMigrationPrompt(migrationContext);
      const firstContent = contents[0];
      if (migrationPrompt && firstContent && firstContent.role === 'user') {
        // Prepend migration context to the first user message
        const firstPart = firstContent.parts[0];
        if (firstPart && firstPart.text) {
          firstPart.text = migrationPrompt + '\n\n' + firstPart.text;
        }
      }
      
      // Clear migration context after use
      delete (this as any).migrationContext;
    }

    const request: GenerateContentRequest = {
      contents,
      ...(finalTools !== undefined ? { tools: finalTools } : {}),
    };

    // Add generation config overrides from options
    if (options) {
      const generationConfig: GenerationConfig = {};
      
      if (options.temperature !== undefined) {
        generationConfig.temperature = options.temperature;
      }
      
      if (options.maxTokens !== undefined) {
        generationConfig.maxOutputTokens = options.maxTokens;
      }
      
      if (options.topP !== undefined) {
        generationConfig.topP = options.topP;
      }
      
      if (options.stopSequences !== undefined) {
        generationConfig.stopSequences = options.stopSequences;
      }

      // Add Gemini 3.0 specific overrides
      if ((this.config as any).gemini?.thinkingLevel && THINKING_MODELS.has(this.model)) {
        (generationConfig as any).thinkingLevel = (this.config as any).gemini.thinkingLevel;
      }

      // Add structured output configuration
      if (options.responseFormat?.type === 'json_object') {
        (generationConfig as any).responseMimeType = 'application/json';
        if (options.responseFormat.schema) {
          (generationConfig as any).responseSchema = convertJsonSchemaToGoogle(options.responseFormat.schema);
        }
      }

      if (Object.keys(generationConfig).length > 0) {
        request.generationConfig = generationConfig;
      }
    }

    // Add thought signature for reasoning continuity
    if ((this.config as any).gemini?.thoughtSignatures && (this as any).thoughtSignature) {
      (request as any).thoughtSignature = (this as any).thoughtSignature;
    }

    logger.debug('[Google] Request created:', {
      hasContents: request.contents.length > 0,
      hasTools: !!request.tools,
      toolCount: request.tools?.length ?? 0,
      hasGenerationConfig: !!request.generationConfig,
      hasThoughtSignature: !!(request as any).thoughtSignature,
      hasMigrationContext: !!migrationContext
    });

    return request;
  }
