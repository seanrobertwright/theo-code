#!/usr/bin/env node
/**
 * @fileoverview CLI entry point for theo-code
 * @module cli
 *
 * This is the main entry point for the theo-code CLI application.
 * It sets up Commander.js for command parsing and launches the React Ink TUI.
 */

import { config as loadEnv } from 'dotenv';
import { Command } from 'commander';
import { render } from 'ink';
import React from 'react';
import { App } from './app.js';
import { ensureConfigDir, createDefaultConfig, loadConfig } from './config/index.js';
import { logger, LogLevel } from './shared/utils/logger.js';
// Load .env file from current directory
loadEnv();

// =============================================================================
// VERSION
// =============================================================================

const VERSION = '0.1.0';
const DESCRIPTION = 'Universal TUI Agent CLI - Model-agnostic AI coding assistant';

// =============================================================================
// CLI SETUP
// =============================================================================

const program = new Command();

program
  .name('theo-code')
  .description(DESCRIPTION)
  .version(VERSION, '-v, --version', 'Display version number')
  .option('-m, --model <model>', 'Override the default model')
  .option('--verbose', 'Enable verbose logging')
  .option('--safe-mode', 'Enable safe mode (require confirmation for all operations)')
  .option('-d, --directory <path>', 'Set the workspace directory', process.cwd());

// =============================================================================
// INIT COMMAND
// =============================================================================

program
  .command('init')
  .description('Initialize theo-code configuration')
  .action((): void => {
    ensureConfigDir();
    const created = createDefaultConfig();

    if (created) {
      logger.success('Created default configuration file');
      logger.info('Edit ~/.theo-code/config.yaml to customize settings');
    } else {
      logger.info('Configuration file already exists');
    }

    logger.info('\nQuick start:');
    logger.info('  1. Set your API key: export OPENAI_API_KEY=sk-...');
    logger.info('  2. Run: theo-code');
    logger.info('  3. Type /help to see available commands');
  });

// =============================================================================
// MAIN ACTION
// =============================================================================

program.action((options: { model?: string; verbose?: boolean; safeMode?: boolean; directory?: string }): void => {
  // Configure logging - enable verbose by default for debugging
  logger.setLevel(LogLevel.DEBUG);
  logger.debug('Debug logging enabled');

  // Set safe mode via environment
  if (options.safeMode === true) {
    process.env['THEO_CODE_SAFE_MODE'] = 'true';
  }

  // Set model override via environment
  if (options.model !== undefined) {
    process.env['THEO_CODE_MODEL'] = options.model;
  }

  // Determine workspace root
  const workspaceRoot = options.directory ?? process.cwd();

  // Ensure config exists
  ensureConfigDir();

  // Load configuration
  const config = loadConfig(workspaceRoot);
  logger.debug('Configuration loaded', { model: config.global.defaultModel });

  // Launch the TUI
  const { waitUntilExit } = render(
    React.createElement(App, {
      workspaceRoot,
      config,
      initialModel: options.model ?? config.global.defaultModel,
    })
  );

  // Handle exit
  waitUntilExit()
    .then(() => {
      logger.debug('Application exited cleanly');
      process.exit(0);
    })
    .catch((_error: unknown) => {
      logger.error('Application error', error);
      process.exit(1);
    });
});

// =============================================================================
// PARSE & RUN
// =============================================================================

program.parse();
