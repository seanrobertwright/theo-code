/**
 * @fileoverview Command registry for managing CLI commands
 * @module features/commands/registry
 */

import type { CommandDefinition, CommandHandler, CommandContext } from './types.js';
import { resumeCommandHandler } from './handlers/resume.js';
import { sessionsCommandHandler } from './handlers/sessions.js';
import { providerCommandHandler } from './handlers/provider.js';

// =============================================================================
// COMMAND REGISTRY
// =============================================================================

/**
 * Registry for managing CLI commands.
 */
export class CommandRegistry {
  private commands = new Map<string, CommandDefinition>();
  private aliases = new Map<string, string>();
  
  /**
   * Registers a command with the registry.
   * 
   * @param definition - Command definition
   */
  register(definition: CommandDefinition): void {
    this.commands.set(definition.name, definition);
    
    // Register aliases
    if (definition.aliases) {
      for (const alias of definition.aliases) {
        this.aliases.set(alias, definition.name);
      }
    }
  }
  
  /**
   * Gets a command by name or alias.
   * 
   * @param name - Command name or alias
   * @returns Command definition or undefined
   */
  get(name: string): CommandDefinition | undefined {
    // Check direct name first
    const command = this.commands.get(name);
    if (command) {
      return command;
    }
    
    // Check aliases
    const aliasTarget = this.aliases.get(name);
    if (aliasTarget) {
      return this.commands.get(aliasTarget);
    }
    
    return undefined;
  }
  
  /**
   * Checks if a command exists.
   * 
   * @param name - Command name or alias
   * @returns True if command exists
   */
  has(name: string): boolean {
    return this.commands.has(name) || this.aliases.has(name);
  }
  
  /**
   * Gets all registered commands.
   * 
   * @returns Array of command definitions
   */
  getAll(): CommandDefinition[] {
    return Array.from(this.commands.values());
  }
  
  /**
   * Executes a command by name.
   * 
   * @param name - Command name
   * @param args - Command arguments
   * @param context - Execution context
   * @returns Promise that resolves when command completes
   */
  async execute(name: string, args: string[], context: CommandContext): Promise<void> {
    const command = this.get(name);
    if (!command) {
      throw new Error(`Unknown command: ${name}`);
    }
    
    await command.handler(args, context);
  }
  
  /**
   * Generates help text for all commands.
   * 
   * @returns Formatted help text
   */
  generateHelp(): string {
    const commands = this.getAll();
    
    let help = `**Available Commands:**\n\n`;
    
    // Group commands by category
    const sessionCommands = commands.filter(cmd => 
      cmd.name.startsWith('resume') || cmd.name.startsWith('sessions')
    );
    const otherCommands = commands.filter(cmd => 
      !cmd.name.startsWith('resume') && !cmd.name.startsWith('sessions') && !cmd.name.startsWith('provider')
    );
    
    if (sessionCommands.length > 0) {
      help += `**Session Management:**\n`;
      for (const cmd of sessionCommands) {
        help += `• \`/${cmd.name}\` - ${cmd.description}\n`;
        if (cmd.aliases && cmd.aliases.length > 0) {
          help += `  Aliases: ${cmd.aliases.map(a => `\`/${a}\``).join(', ')}\n`;
        }
      }
      help += '\n';
    }
    
    // Provider commands
    const providerCommands = commands.filter(cmd => 
      cmd.name.startsWith('provider')
    );
    
    if (providerCommands.length > 0) {
      help += `**Provider Management:**\n`;
      for (const cmd of providerCommands) {
        help += `• \`/${cmd.name}\` - ${cmd.description}\n`;
        if (cmd.aliases && cmd.aliases.length > 0) {
          help += `  Aliases: ${cmd.aliases.map(a => `\`/${a}\``).join(', ')}\n`;
        }
      }
      help += '\n';
    }
    
    if (otherCommands.length > 0) {
      help += `**General Commands:**\n`;
      for (const cmd of otherCommands) {
        help += `• \`/${cmd.name}\` - ${cmd.description}\n`;
        if (cmd.aliases && cmd.aliases.length > 0) {
          help += `  Aliases: ${cmd.aliases.map(a => `\`/${a}\``).join(', ')}\n`;
        }
      }
      help += '\n';
    }
    
    help += `**Tips:**\n`;
    help += `• Type your message and press Enter to chat\n`;
    help += `• Use Ctrl+C to exit at any time\n`;
    help += `• Commands are case-insensitive\n`;
    
    return help;
  }
}

// =============================================================================
// DEFAULT REGISTRY
// =============================================================================

/**
 * Creates and configures the default command registry.
 * 
 * @returns Configured command registry
 */
export function createDefaultCommandRegistry(): CommandRegistry {
  const registry = new CommandRegistry();
  
  // Register session management commands
  registry.register({
    name: 'resume',
    description: 'Resume a previous session',
    usage: '/resume [session-id]',
    handler: resumeCommandHandler,
    aliases: ['restore', 'load'],
  });
  
  registry.register({
    name: 'sessions',
    description: 'Manage saved sessions',
    usage: '/sessions [subcommand] [options]',
    handler: sessionsCommandHandler,
    aliases: ['session', 'sess'],
  });
  
  registry.register({
    name: 'provider',
    description: 'Manage AI providers',
    usage: '/provider [subcommand] [options]',
    handler: providerCommandHandler,
    aliases: ['providers', 'prov'],
  });
  
  return registry;
}

// =============================================================================
// EXPORTS
// =============================================================================

export { CommandRegistry, createDefaultCommandRegistry };