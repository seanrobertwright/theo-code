/**
 * @fileoverview Language Server Protocol integration
 */

import { spawn, type ChildProcess } from 'node:child_process';
import * as path from 'node:path';
import type { Tool } from '../../../shared/types/tools.js';
import { logger } from '../../../shared/utils/index.js';

interface LSPServer {
  process: ChildProcess;
  language: string;
  ready: boolean;
  messageId: number;
}

interface Position {
  line: number;
  character: number;
}

interface Location {
  uri: string;
  range: {
    start: Position;
    end: Position;
  };
}

class LSPManager {
  private servers = new Map<string, LSPServer>();
  private readonly serverConfigs = {
    typescript: { command: 'typescript-language-server', args: ['--stdio'] },
    javascript: { command: 'typescript-language-server', args: ['--stdio'] },
    python: { command: 'pylsp', args: [] },
    rust: { command: 'rust-analyzer', args: [] },
    go: { command: 'gopls', args: [] }
  };

  async startServer(language: string, workspaceRoot: string): Promise<boolean> {
    if (this.servers.has(language)) {
      return true;
    }

    const config = this.serverConfigs[language as keyof typeof this.serverConfigs];
    if (!config) {
      throw new Error(`Unsupported language: ${language}`);
    }

    try {
      const process = spawn(config.command, config.args, {
        cwd: workspaceRoot,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      const server: LSPServer = {
        process,
        language,
        ready: false,
        messageId: 1
      };

      // Initialize LSP
      await this.sendRequest(server, 'initialize', {
        processId: process.pid,
        rootUri: `file://${workspaceRoot}`,
        capabilities: {
          textDocument: {
            hover: { contentFormat: ['markdown', 'plaintext'] },
            definition: {},
            references: {},
            documentSymbol: {}
          }
        }
      });

      server.ready = true;
      this.servers.set(language, server);
      
      logger.debug(`LSP server started for ${language}`);
      return true;

    } catch (error) {
      logger.error(`Failed to start LSP server for ${language}`, error);
      return false;
    }
  }

  private async sendRequest(server: LSPServer, method: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = server.messageId++;
      const message = {
        jsonrpc: '2.0',
        id,
        method,
        params
      };

      const content = JSON.stringify(message);
      const header = `Content-Length: ${Buffer.byteLength(content)}\r\n\r\n`;
      
      server.process.stdin?.write(header + content);

      const timeout = setTimeout(() => reject(new Error('LSP request timeout')), 5000);

      server.process.stdout?.once('data', (data) => {
        clearTimeout(timeout);
        try {
          const response = JSON.parse(data.toString().split('\r\n\r\n')[1]);
          resolve(response.result);
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  async getDefinition(language: string, file: string, position: Position): Promise<Location[]> {
    const server = this.servers.get(language);
    if (!server?.ready) {
      throw new Error(`LSP server not ready for ${language}`);
    }

    return this.sendRequest(server, 'textDocument/definition', {
      textDocument: { uri: `file://${file}` },
      position
    });
  }

  async getHover(language: string, file: string, position: Position): Promise<any> {
    const server = this.servers.get(language);
    if (!server?.ready) {
      throw new Error(`LSP server not ready for ${language}`);
    }

    return this.sendRequest(server, 'textDocument/hover', {
      textDocument: { uri: `file://${file}` },
      position
    });
  }

  async getReferences(language: string, file: string, position: Position): Promise<Location[]> {
    const server = this.servers.get(language);
    if (!server?.ready) {
      throw new Error(`LSP server not ready for ${language}`);
    }

    return this.sendRequest(server, 'textDocument/references', {
      textDocument: { uri: `file://${file}` },
      position,
      context: { includeDeclaration: true }
    });
  }

  stopAll(): void {
    for (const server of this.servers.values()) {
      server.process.kill();
    }
    this.servers.clear();
  }
}

const lspManager = new LSPManager();

export const createLSPTools = (): Tool[] => [
  {
    definition: {
      name: 'lsp_start',
      description: 'Start Language Server Protocol server for code intelligence',
      parameters: {
        type: 'object',
        properties: {
          language: {
            type: 'string',
            enum: ['typescript', 'javascript', 'python', 'rust', 'go']
          }
        },
        required: ['language']
      }
    },

    async execute(params, context) {
      try {
        const success = await lspManager.startServer(params.language, context.workspaceRoot);
        return {
          success,
          data: { language: params.language, started: success }
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
  },

  {
    definition: {
      name: 'lsp_definition',
      description: 'Get symbol definition using LSP',
      parameters: {
        type: 'object',
        properties: {
          language: { type: 'string' },
          file: { type: 'string' },
          line: { type: 'number' },
          character: { type: 'number' }
        },
        required: ['language', 'file', 'line', 'character']
      }
    },

    async execute(params, context) {
      try {
        const filePath = path.resolve(context.workspaceRoot, params.file);
        const definitions = await lspManager.getDefinition(
          params.language,
          filePath,
          { line: params.line, character: params.character }
        );

        return {
          success: true,
          data: { definitions, file: params.file, position: { line: params.line, character: params.character } }
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
  },

  {
    definition: {
      name: 'lsp_hover',
      description: 'Get hover information using LSP',
      parameters: {
        type: 'object',
        properties: {
          language: { type: 'string' },
          file: { type: 'string' },
          line: { type: 'number' },
          character: { type: 'number' }
        },
        required: ['language', 'file', 'line', 'character']
      }
    },

    async execute(params, context) {
      try {
        const filePath = path.resolve(context.workspaceRoot, params.file);
        const hover = await lspManager.getHover(
          params.language,
          filePath,
          { line: params.line, character: params.character }
        );

        return {
          success: true,
          data: { hover, file: params.file }
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
  },

  {
    definition: {
      name: 'lsp_references',
      description: 'Find all references to a symbol using LSP',
      parameters: {
        type: 'object',
        properties: {
          language: { type: 'string' },
          file: { type: 'string' },
          line: { type: 'number' },
          character: { type: 'number' }
        },
        required: ['language', 'file', 'line', 'character']
      }
    },

    async execute(params, context) {
      try {
        const filePath = path.resolve(context.workspaceRoot, params.file);
        const references = await lspManager.getReferences(
          params.language,
          filePath,
          { line: params.line, character: params.character }
        );

        return {
          success: true,
          data: { references, total: references.length }
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
  }
];

// Cleanup on process exit
process.on('exit', () => lspManager.stopAll());
