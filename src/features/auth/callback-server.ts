/**
 * @fileoverview OAuth callback server for handling OAuth redirects
 * @module features/auth/callback-server
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { URL } from 'node:url';
import type { ICallbackServer, CallbackResult } from './types.js';
// =============================================================================
// CALLBACK SERVER
// =============================================================================

/**
 * Temporary HTTP server for handling OAuth callbacks.
 * 
 * Creates a local server to receive OAuth authorization codes, handles
 * timeout scenarios, and provides user-friendly success/error pages.
 */
export class CallbackServer implements ICallbackServer {
  private server: Server | null = null;
  private port: number | null = null;
  private callbackPromise: Promise<CallbackResult> | null = null;
  private callbackResolve: ((_result: CallbackResult) => void) | null = null;
  private timeoutHandle: NodeJS.Timeout | null = null;
  
  // Configuration
  private readonly DEFAULT_PORT = 8080;
  private readonly MAX_PORT_ATTEMPTS = 10;
  private readonly TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
  
  // =============================================================================
  // SERVER LIFECYCLE
  // =============================================================================

  /**
   * Start the callback server on an available port.
   */
  async start(port?: number): Promise<number> {
    if (this.server) {
      throw new Error('Callback server is already running');
    }

    const startPort = port || this.DEFAULT_PORT;
    
    // Try to find an available port
    for (let attempt = 0; attempt < this.MAX_PORT_ATTEMPTS; attempt++) {
      const tryPort = startPort + attempt;
      
      try {
        await this.startOnPort(tryPort);
        this.port = tryPort;
        logger.info(`[CallbackServer] Started on port ${tryPort}`);
        return tryPort;
      } catch (error) {
        logger.debug(`[CallbackServer] Port ${tryPort} unavailable, trying next port`);
        
        if (attempt === this.MAX_PORT_ATTEMPTS - 1) {
          throw new Error(`Failed to start callback server after ${this.MAX_PORT_ATTEMPTS} attempts`);
        }
      }
    }
    
    throw new Error('Unable to start callback server');
  }

  /**
   * Stop the callback server and cleanup resources.
   */
  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    logger.debug('[CallbackServer] Stopping server');
    
    // Clear timeout
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
    
    // Close server
    return new Promise<void>((resolve, reject) => {
      this.server!.close((error) => {
        if (error) {
          logger.error('[CallbackServer] Error stopping server:', error);
          reject(error);
        } else {
          logger.info('[CallbackServer] Server stopped');
          this.server = null;
          this.port = null;
          // Don't reset callback promise here - let it complete naturally
          resolve();
        }
      });
    });
  }

  /**
   * Wait for OAuth callback with timeout handling.
   */
  async waitForCallback(): Promise<CallbackResult> {
    if (!this.server) {
      throw new Error('Callback server is not running');
    }

    // Return existing promise if already waiting
    if (this.callbackPromise) {
      return this.callbackPromise;
    }

    // Create promise for callback result
    this.callbackPromise = new Promise<CallbackResult>((resolve) => {
      this.callbackResolve = resolve;
    });

    // Set up timeout
    this.timeoutHandle = setTimeout(() => {
      this.handleTimeout();
    }, this.TIMEOUT_MS);

    return this.callbackPromise;
  }

  /**
   * Handle authentication timeout.
   */
  handleTimeout(): void {
    logger.warn('[CallbackServer] OAuth flow timed out');
    
    if (this.callbackResolve) {
      this.callbackResolve({
        error: 'timeout',
        errorDescription: 'OAuth authentication timed out after 5 minutes',
      });
      this.callbackPromise = null;
      this.callbackResolve = null;
    }
  }

  /**
   * Check if server is running.
   */
  isRunning(): boolean {
    return this.server !== null && this.server.listening;
  }

  // =============================================================================
  // PRIVATE HELPERS
  // =============================================================================

  /**
   * Start server on a specific port.
   */
  private async startOnPort(_port: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.server = createServer(this.handleRequest.bind(this));
      
      this.server.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE') {
          reject(new Error(`Port ${port} is already in use`));
        } else {
          reject(error);
        }
      });
      
      this.server.listen(port, 'localhost', () => {
        resolve();
      });
    });
  }

  /**
   * Handle incoming HTTP requests.
   */
  private handleRequest(_req: IncomingMessage, _res: ServerResponse): void {
    const url = new URL(req.url || '/', `http://localhost:${this.port}`);
    
    logger.debug(`[CallbackServer] Received request: ${req.method} ${url.pathname}`);
    
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }
    
    // Handle callback endpoint
    if (url.pathname === '/callback' && req.method === 'GET') {
      this.handleCallback(url, res);
      return;
    }
    
    // Handle health check
    if (url.pathname === '/health' && req.method === 'GET') {
      this.handleHealthCheck(res);
      return;
    }
    
    // Handle 404
    this.handleNotFound(res);
  }

  /**
   * Handle OAuth callback request.
   */
  private handleCallback(_url: URL, _res: ServerResponse): void {
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');
    const errorDescription = url.searchParams.get('error_description');
    
    logger.debug('[CallbackServer] Processing OAuth callback', {
      hasCode: !!code,
      hasState: !!state,
      hasError: !!error,
    });
    
    // Clear timeout since we received a callback
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
    
    // Prepare callback result
    const result: CallbackResult = {
      code: code ?? undefined,
      state: state ?? undefined,
      error: error ?? undefined,
      errorDescription: errorDescription ?? undefined,
    };
    
    // Send response to browser
    if (error) {
      this.sendErrorPage(res, error, errorDescription);
    } else if (code) {
      this.sendSuccessPage(res);
    } else {
      // Missing code but no explicit error - send error page but don't set error in result
      this.sendErrorPage(res, 'invalid_request', 'Missing authorization code');
    }
    
    // Resolve callback promise and reset state
    if (this.callbackResolve) {
      this.callbackResolve(result);
      this.callbackPromise = null;
      this.callbackResolve = null;
    }
  }

  /**
   * Handle health check request.
   */
  private handleHealthCheck(_res: ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      port: this.port,
      timestamp: new Date().toISOString(),
    }));
  }

  /**
   * Handle 404 requests.
   */
  private handleNotFound(_res: ServerResponse): void {
    res.writeHead(404, { 'Content-Type': 'text/html' });
    res.end(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Not Found - theo-code OAuth</title>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 40px; }
            .container { max-width: 600px; margin: 0 auto; text-align: center; }
            h1 { color: #e74c3c; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>404 - Not Found</h1>
            <p>The requested page was not found on this OAuth callback server.</p>
            <p>This server is only used for OAuth authentication callbacks.</p>
          </div>
        </body>
      </html>
    `);
  }

  /**
   * Send success page to browser.
   */
  private sendSuccessPage(_res: ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Authentication Successful - theo-code</title>
          <meta charset="utf-8">
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; 
              margin: 0; 
              padding: 40px;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .container { 
              max-width: 500px; 
              text-align: center; 
              background: rgba(255, 255, 255, 0.1);
              padding: 40px;
              border-radius: 12px;
              backdrop-filter: blur(10px);
            }
            h1 { color: #2ecc71; margin-bottom: 20px; }
            .checkmark {
              font-size: 64px;
              color: #2ecc71;
              margin-bottom: 20px;
            }
            p { font-size: 16px; line-height: 1.6; margin-bottom: 15px; }
            .close-instruction {
              margin-top: 30px;
              padding: 15px;
              background: rgba(255, 255, 255, 0.1);
              border-radius: 8px;
              font-size: 14px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="checkmark">✓</div>
            <h1>Authentication Successful!</h1>
            <p>You have successfully authenticated with the AI provider.</p>
            <p>You can now close this browser tab and return to theo-code.</p>
            <div class="close-instruction">
              <strong>Next steps:</strong><br>
              Return to your terminal to continue using theo-code with your authenticated provider.
            </div>
          </div>
          <script>
            // Auto-close tab after 3 seconds (if allowed by browser)
            setTimeout(() => {
              try {
                window.close();
              } catch (e) {
                // Browser may not allow auto-close, that's fine
              }
            }, 3000);
          </script>
        </body>
      </html>
    `);
  }

  /**
   * Send error page to browser.
   */
  private sendErrorPage(_res: ServerResponse, _error: string, description?: string | null): void {
    res.writeHead(400, { 'Content-Type': 'text/html' });
    res.end(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Authentication Error - theo-code</title>
          <meta charset="utf-8">
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; 
              margin: 0; 
              padding: 40px;
              background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
              color: white;
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .container { 
              max-width: 500px; 
              text-align: center; 
              background: rgba(255, 255, 255, 0.1);
              padding: 40px;
              border-radius: 12px;
              backdrop-filter: blur(10px);
            }
            h1 { color: #e74c3c; margin-bottom: 20px; }
            .error-icon {
              font-size: 64px;
              color: #e74c3c;
              margin-bottom: 20px;
            }
            p { font-size: 16px; line-height: 1.6; margin-bottom: 15px; }
            .error-details {
              margin-top: 20px;
              padding: 15px;
              background: rgba(255, 255, 255, 0.1);
              border-radius: 8px;
              font-size: 14px;
              text-align: left;
            }
            .retry-instruction {
              margin-top: 30px;
              padding: 15px;
              background: rgba(255, 255, 255, 0.1);
              border-radius: 8px;
              font-size: 14px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="error-icon">✗</div>
            <h1>Authentication Failed</h1>
            <p>There was an error during the authentication process.</p>
            
            <div class="error-details">
              <strong>Error:</strong> ${this.escapeHtml(error)}<br>
              ${description ? `<strong>Description:</strong> ${this.escapeHtml(description)}` : ''}
            </div>
            
            <div class="retry-instruction">
              <strong>What to do next:</strong><br>
              1. Close this browser tab<br>
              2. Return to your terminal<br>
              3. Try the authentication command again<br>
              4. If the problem persists, check your provider configuration
            </div>
          </div>
        </body>
      </html>
    `);
  }

  /**
   * Escape HTML to prevent XSS.
   */
  private escapeHtml(_text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    
    return text.replace(/[&<>"']/g, (char) => map[char] || char);
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a new callback server instance.
 */
export function createCallbackServer(): ICallbackServer {
  return new CallbackServer();
}