/**
 * @fileoverview Browser launcher utility for OAuth authentication
 * @module features/auth/browser-launcher
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { platform } from 'node:os';
import type { IBrowserLauncher } from './types.js';
import { logger } from '../../shared/utils/index.js';

// =============================================================================
// BROWSER LAUNCHER
// =============================================================================

/**
 * Cross-platform browser launcher for OAuth authentication.
 * 
 * Handles launching the user's default browser on different operating systems
 * with proper error handling and fallback instructions.
 */
export class BrowserLauncher implements IBrowserLauncher {
  private readonly LAUNCH_TIMEOUT_MS = 10000; // 10 seconds
  
  // =============================================================================
  // PUBLIC METHODS
  // =============================================================================

  /**
   * Launch default browser with the specified URL.
   */
  async launchBrowser(url: string): Promise<void> {
    if (!this.isSupported()) {
      throw new Error('Browser launching is not supported on this platform');
    }

    logger.info(`[BrowserLauncher] Launching browser with URL: ${this.maskUrl(url)}`);

    try {
      await this.launchBrowserForPlatform(url);
      logger.debug('[BrowserLauncher] Browser launched successfully');
    } catch (error) {
      logger.error('[BrowserLauncher] Failed to launch browser:', error);
      
      // Provide fallback instructions
      const fallbackMessage = this.getFallbackInstructions(url);
      throw new Error(`Failed to launch browser automatically. ${fallbackMessage}`);
    }
  }

  /**
   * Check if browser launch is supported on this platform.
   */
  isSupported(): boolean {
    const currentPlatform = platform();
    return ['win32', 'darwin', 'linux'].includes(currentPlatform);
  }

  // =============================================================================
  // PRIVATE METHODS
  // =============================================================================

  /**
   * Launch browser using platform-specific commands.
   */
  private async launchBrowserForPlatform(url: string): Promise<void> {
    const currentPlatform = platform();
    
    switch (currentPlatform) {
      case 'win32':
        return this.launchOnWindows(url);
      case 'darwin':
        return this.launchOnMacOS(url);
      case 'linux':
        return this.launchOnLinux(url);
      default:
        throw new Error(`Unsupported platform: ${currentPlatform}`);
    }
  }

  /**
   * Launch browser on Windows.
   */
  private async launchOnWindows(url: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      // Use 'start' command to open URL with default browser
      const child = spawn('cmd', ['/c', 'start', '""', url], {
        detached: true,
        stdio: 'ignore',
      });

      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error('Browser launch timed out'));
      }, this.LAUNCH_TIMEOUT_MS);

      child.on('error', (error) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to launch browser on Windows: ${error.message}`));
      });

      child.on('spawn', () => {
        clearTimeout(timeout);
        child.unref(); // Allow parent process to exit
        resolve();
      });
    });
  }

  /**
   * Launch browser on macOS.
   */
  private async launchOnMacOS(url: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      // Use 'open' command to open URL with default browser
      const child = spawn('open', [url], {
        detached: true,
        stdio: 'ignore',
      });

      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error('Browser launch timed out'));
      }, this.LAUNCH_TIMEOUT_MS);

      child.on('error', (error) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to launch browser on macOS: ${error.message}`));
      });

      child.on('spawn', () => {
        clearTimeout(timeout);
        child.unref(); // Allow parent process to exit
        resolve();
      });
    });
  }

  /**
   * Launch browser on Linux.
   */
  private async launchOnLinux(url: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      // Try multiple commands in order of preference
      const commands = ['xdg-open', 'gnome-open', 'kde-open', 'firefox', 'chromium', 'google-chrome'];
      
      this.tryLaunchCommands(url, commands, 0, resolve, reject);
    });
  }

  /**
   * Try launching browser with different commands on Linux.
   */
  private tryLaunchCommands(
    url: string,
    commands: string[],
    index: number,
    resolve: () => void,
    reject: (error: Error) => void
  ): void {
    if (index >= commands.length) {
      reject(new Error('No suitable browser launcher found on Linux'));
      return;
    }

    const command = commands[index];
    logger.debug(`[BrowserLauncher] Trying command: ${command}`);

    const child = spawn(command, [url], {
      detached: true,
      stdio: 'ignore',
    });

    const timeout = setTimeout(() => {
      child.kill();
      // Try next command
      this.tryLaunchCommands(url, commands, index + 1, resolve, reject);
    }, this.LAUNCH_TIMEOUT_MS);

    child.on('error', () => {
      clearTimeout(timeout);
      // Try next command
      this.tryLaunchCommands(url, commands, index + 1, resolve, reject);
    });

    child.on('spawn', () => {
      clearTimeout(timeout);
      child.unref(); // Allow parent process to exit
      logger.debug(`[BrowserLauncher] Successfully launched with: ${command}`);
      resolve();
    });
  }

  /**
   * Get fallback instructions for manual browser opening.
   */
  private getFallbackInstructions(url: string): string {
    const currentPlatform = platform();
    
    const instructions = [
      'Please manually open your browser and navigate to the following URL:',
      '',
      url,
      '',
      'Platform-specific instructions:',
    ];

    switch (currentPlatform) {
      case 'win32':
        instructions.push(
          '• Windows: Copy the URL and paste it into your browser address bar',
          '• Or press Win+R, type the URL, and press Enter'
        );
        break;
      case 'darwin':
        instructions.push(
          '• macOS: Copy the URL and paste it into your browser address bar',
          '• Or open Terminal and run: open "' + url + '"'
        );
        break;
      case 'linux':
        instructions.push(
          '• Linux: Copy the URL and paste it into your browser address bar',
          '• Or run in terminal: xdg-open "' + url + '"'
        );
        break;
      default:
        instructions.push(
          '• Copy the URL and paste it into your browser address bar'
        );
    }

    instructions.push(
      '',
      'After completing authentication in your browser, return to this terminal.'
    );

    return instructions.join('\n');
  }

  /**
   * Mask sensitive parts of URL for logging.
   */
  private maskUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      
      // Mask sensitive query parameters
      const sensitiveParams = ['client_secret', 'code', 'access_token', 'refresh_token'];
      
      for (const param of sensitiveParams) {
        if (urlObj.searchParams.has(param)) {
          urlObj.searchParams.set(param, '***');
        }
      }
      
      return urlObj.toString();
    } catch {
      // If URL parsing fails, just mask the entire thing
      return url.substring(0, 50) + '...';
    }
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a new browser launcher instance.
 */
export function createBrowserLauncher(): IBrowserLauncher {
  return new BrowserLauncher();
}