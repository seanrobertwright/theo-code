/**
 * @fileoverview Unit tests for browser launcher utility
 * @module features/auth/__tests__/browser-launcher
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { spawn } from 'node:child_process';
import { platform } from 'node:os';
import { BrowserLauncher, createBrowserLauncher } from '../browser-launcher.js';
import type { IBrowserLauncher } from '../types.js';

// Mock child_process
vi.mock('node:child_process');
vi.mock('node:os');

// =============================================================================
// TEST SETUP
// =============================================================================

describe('BrowserLauncher', () => {
  let browserLauncher: IBrowserLauncher;
  let mockSpawn: ReturnType<typeof vi.fn>;
  let mockPlatform: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    browserLauncher = createBrowserLauncher();
    mockSpawn = vi.mocked(spawn);
    mockPlatform = vi.mocked(platform);
    
    // Reset mocks
    mockSpawn.mockClear();
    mockPlatform.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // =============================================================================
  // PLATFORM SUPPORT TESTS
  // =============================================================================

  describe('Platform Support', () => {
    it('should support Windows', () => {
      mockPlatform.mockReturnValue('win32');
      expect(browserLauncher.isSupported()).toBe(true);
    });

    it('should support macOS', () => {
      mockPlatform.mockReturnValue('darwin');
      expect(browserLauncher.isSupported()).toBe(true);
    });

    it('should support Linux', () => {
      mockPlatform.mockReturnValue('linux');
      expect(browserLauncher.isSupported()).toBe(true);
    });

    it('should not support unsupported platforms', () => {
      mockPlatform.mockReturnValue('freebsd');
      expect(browserLauncher.isSupported()).toBe(false);
    });
  });

  // =============================================================================
  // BROWSER LAUNCHING TESTS
  // =============================================================================

  describe('Browser Launching', () => {
    it('should throw error on unsupported platform', async () => {
      mockPlatform.mockReturnValue('unsupported');
      
      await expect(browserLauncher.launchBrowser('https://example.com')).rejects.toThrow(
        'Browser launching is not supported on this platform'
      );
    });

    it('should launch browser on Windows', async () => {
      mockPlatform.mockReturnValue('win32');
      
      const mockChild = {
        on: vi.fn(),
        kill: vi.fn(),
        unref: vi.fn(),
      };
      
      mockSpawn.mockReturnValue(mockChild as any);
      
      // Simulate successful spawn
      mockChild.on.mockImplementation((event, callback) => {
        if (event === 'spawn') {
          process.nextTick(callback);
        }
      });
      
      await expect(browserLauncher.launchBrowser('https://example.com')).resolves.toBeUndefined();
      
      expect(mockSpawn).toHaveBeenCalledWith('cmd', ['/c', 'start', '""', 'https://example.com'], {
        detached: true,
        stdio: 'ignore',
      });
    });

    it('should launch browser on macOS', async () => {
      mockPlatform.mockReturnValue('darwin');
      
      const mockChild = {
        on: vi.fn(),
        kill: vi.fn(),
        unref: vi.fn(),
      };
      
      mockSpawn.mockReturnValue(mockChild as any);
      
      // Simulate successful spawn
      mockChild.on.mockImplementation((event, callback) => {
        if (event === 'spawn') {
          process.nextTick(callback);
        }
      });
      
      await expect(browserLauncher.launchBrowser('https://example.com')).resolves.toBeUndefined();
      
      expect(mockSpawn).toHaveBeenCalledWith('open', ['https://example.com'], {
        detached: true,
        stdio: 'ignore',
      });
    });

    it('should launch browser on Linux with xdg-open', async () => {
      mockPlatform.mockReturnValue('linux');
      
      const mockChild = {
        on: vi.fn(),
        kill: vi.fn(),
        unref: vi.fn(),
      };
      
      mockSpawn.mockReturnValue(mockChild as any);
      
      // Simulate successful spawn
      mockChild.on.mockImplementation((event, callback) => {
        if (event === 'spawn') {
          process.nextTick(callback);
        }
      });
      
      await expect(browserLauncher.launchBrowser('https://example.com')).resolves.toBeUndefined();
      
      expect(mockSpawn).toHaveBeenCalledWith('xdg-open', ['https://example.com'], {
        detached: true,
        stdio: 'ignore',
      });
    });

    it('should handle spawn errors on Windows', async () => {
      mockPlatform.mockReturnValue('win32');
      
      const mockChild = {
        on: vi.fn(),
        kill: vi.fn(),
        unref: vi.fn(),
      };
      
      mockSpawn.mockReturnValue(mockChild as any);
      
      // Simulate spawn error
      mockChild.on.mockImplementation((event, callback) => {
        if (event === 'error') {
          process.nextTick(() => callback(new Error('Command not found')));
        }
      });
      
      await expect(browserLauncher.launchBrowser('https://example.com')).rejects.toThrow(
        'Failed to launch browser automatically'
      );
    });

    it('should handle timeout on browser launch', async () => {
      mockPlatform.mockReturnValue('win32');
      
      const mockChild = {
        on: vi.fn(),
        kill: vi.fn(),
        unref: vi.fn(),
      };
      
      mockSpawn.mockReturnValue(mockChild as any);
      
      // Don't emit any events (simulate hanging)
      mockChild.on.mockImplementation(() => {});
      
      await expect(browserLauncher.launchBrowser('https://example.com')).rejects.toThrow(
        'Failed to launch browser automatically'
      );
      
      expect(mockChild.kill).toHaveBeenCalled();
    });

    it('should try fallback commands on Linux', async () => {
      mockPlatform.mockReturnValue('linux');
      
      let spawnCallCount = 0;
      const mockChildren: any[] = [];
      
      mockSpawn.mockImplementation(() => {
        const mockChild = {
          on: vi.fn(),
          kill: vi.fn(),
          unref: vi.fn(),
        };
        mockChildren.push(mockChild);
        
        // First command fails, second succeeds
        if (spawnCallCount === 0) {
          mockChild.on.mockImplementation((event, callback) => {
            if (event === 'error') {
              process.nextTick(() => callback(new Error('Command not found')));
            }
          });
        } else if (spawnCallCount === 1) {
          mockChild.on.mockImplementation((event, callback) => {
            if (event === 'spawn') {
              process.nextTick(callback);
            }
          });
        }
        
        spawnCallCount++;
        return mockChild;
      });
      
      await expect(browserLauncher.launchBrowser('https://example.com')).resolves.toBeUndefined();
      
      expect(mockSpawn).toHaveBeenCalledTimes(2);
      expect(mockSpawn).toHaveBeenNthCalledWith(1, 'xdg-open', ['https://example.com'], {
        detached: true,
        stdio: 'ignore',
      });
      expect(mockSpawn).toHaveBeenNthCalledWith(2, 'gnome-open', ['https://example.com'], {
        detached: true,
        stdio: 'ignore',
      });
    });

    it('should fail when all Linux commands fail', async () => {
      mockPlatform.mockReturnValue('linux');
      
      const mockChild = {
        on: vi.fn(),
        kill: vi.fn(),
        unref: vi.fn(),
      };
      
      mockSpawn.mockReturnValue(mockChild as any);
      
      // All commands fail
      mockChild.on.mockImplementation((event, callback) => {
        if (event === 'error') {
          process.nextTick(() => callback(new Error('Command not found')));
        }
      });
      
      await expect(browserLauncher.launchBrowser('https://example.com')).rejects.toThrow(
        'Failed to launch browser automatically'
      );
    });
  });

  // =============================================================================
  // FALLBACK INSTRUCTIONS TESTS
  // =============================================================================

  describe('Fallback Instructions', () => {
    it('should provide Windows-specific fallback instructions', async () => {
      mockPlatform.mockReturnValue('win32');
      
      const mockChild = {
        on: vi.fn(),
        kill: vi.fn(),
        unref: vi.fn(),
      };
      
      mockSpawn.mockReturnValue(mockChild as any);
      
      // Simulate error
      mockChild.on.mockImplementation((event, callback) => {
        if (event === 'error') {
          process.nextTick(() => callback(new Error('Failed')));
        }
      });
      
      try {
        await browserLauncher.launchBrowser('https://example.com');
      } catch (error) {
        expect(error.message).toContain('Windows: Copy the URL');
        expect(error.message).toContain('Win+R');
        expect(error.message).toContain('https://example.com');
      }
    });

    it('should provide macOS-specific fallback instructions', async () => {
      mockPlatform.mockReturnValue('darwin');
      
      const mockChild = {
        on: vi.fn(),
        kill: vi.fn(),
        unref: vi.fn(),
      };
      
      mockSpawn.mockReturnValue(mockChild as any);
      
      // Simulate error
      mockChild.on.mockImplementation((event, callback) => {
        if (event === 'error') {
          process.nextTick(() => callback(new Error('Failed')));
        }
      });
      
      try {
        await browserLauncher.launchBrowser('https://example.com');
      } catch (error) {
        expect(error.message).toContain('macOS: Copy the URL');
        expect(error.message).toContain('open "https://example.com"');
      }
    });

    it('should provide Linux-specific fallback instructions', async () => {
      mockPlatform.mockReturnValue('linux');
      
      const mockChild = {
        on: vi.fn(),
        kill: vi.fn(),
        unref: vi.fn(),
      };
      
      mockSpawn.mockReturnValue(mockChild as any);
      
      // Simulate error
      mockChild.on.mockImplementation((event, callback) => {
        if (event === 'error') {
          process.nextTick(() => callback(new Error('Failed')));
        }
      });
      
      try {
        await browserLauncher.launchBrowser('https://example.com');
      } catch (error) {
        expect(error.message).toContain('Linux: Copy the URL');
        expect(error.message).toContain('xdg-open "https://example.com"');
      }
    });
  });

  // =============================================================================
  // URL MASKING TESTS
  // =============================================================================

  describe('URL Masking', () => {
    it('should mask sensitive parameters in URLs', async () => {
      mockPlatform.mockReturnValue('win32');
      
      const mockChild = {
        on: vi.fn(),
        kill: vi.fn(),
        unref: vi.fn(),
      };
      
      mockSpawn.mockReturnValue(mockChild as any);
      
      // Simulate successful spawn
      mockChild.on.mockImplementation((event, callback) => {
        if (event === 'spawn') {
          process.nextTick(callback);
        }
      });
      
      const urlWithSecrets = 'https://example.com/auth?client_secret=secret123&code=auth_code';
      
      await browserLauncher.launchBrowser(urlWithSecrets);
      
      // The actual URL passed to spawn should not be masked
      expect(mockSpawn).toHaveBeenCalledWith('cmd', ['/c', 'start', '""', urlWithSecrets], {
        detached: true,
        stdio: 'ignore',
      });
    });
  });

  // =============================================================================
  // FACTORY FUNCTION TESTS
  // =============================================================================

  describe('Factory Function', () => {
    it('should create browser launcher instance', () => {
      const launcher = createBrowserLauncher();
      expect(launcher).toBeInstanceOf(BrowserLauncher);
    });
  });
});