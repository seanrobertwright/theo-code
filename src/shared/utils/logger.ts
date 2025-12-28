/**
 * @fileoverview Logger utility with configurable output levels
 * @module shared/utils/logger
 */

import chalk from 'chalk';

// =============================================================================
// LOG LEVELS
// =============================================================================

/**
 * Log level enum.
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4,
}

// =============================================================================
// LOGGER CLASS
// =============================================================================

/**
 * Logger instance for application-wide logging.
 *
 * @example
 * ```typescript
 * logger.setLevel(LogLevel.DEBUG);
 * logger.debug('Debug message');
 * logger.info('Info message');
 * logger.warn('Warning message');
 * logger.error('Error message');
 * ```
 */
class Logger {
  private level: LogLevel = LogLevel.INFO;
  private readonly prefix: string;

  constructor(prefix = 'theo-code') {
    this.prefix = prefix;
  }

  /**
   * Sets the log level.
   *
   * @param level - The minimum level to log
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * Gets the current log level.
   *
   * @returns Current log level
   */
  getLevel(): LogLevel {
    return this.level;
  }

  /**
   * Formats a log message with timestamp and prefix.
   *
   * @param level - Log level label
   * @param message - The message to format
   * @returns Formatted message
   */
  private format(level: string, message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${this.prefix}] [${level}] ${message}`;
  }

  /**
   * Logs a debug message.
   *
   * @param message - The message to log
   * @param args - Additional arguments to log
   */
  debug(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.DEBUG) {
      const formatted = this.format('DEBUG', message);
       
      console.warn(chalk.gray(formatted), ...args);
    }
  }

  /**
   * Logs an info message.
   *
   * @param message - The message to log
   * @param args - Additional arguments to log
   */
  info(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.INFO) {
      const formatted = this.format('INFO', message);
       
      console.warn(chalk.blue(formatted), ...args);
    }
  }

  /**
   * Logs a warning message.
   *
   * @param message - The message to log
   * @param args - Additional arguments to log
   */
  warn(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.WARN) {
      const formatted = this.format('WARN', message);
      console.warn(chalk.yellow(formatted), ...args);
    }
  }

  /**
   * Logs an error message.
   *
   * @param message - The message to log
   * @param args - Additional arguments to log
   */
  error(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.ERROR) {
      const formatted = this.format('ERROR', message);
      console.error(chalk.red(formatted), ...args);
    }
  }

  /**
   * Logs a success message (always at INFO level).
   *
   * @param message - The message to log
   * @param args - Additional arguments to log
   */
  success(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.INFO) {
      const formatted = this.format('SUCCESS', message);
       
      console.warn(chalk.green(formatted), ...args);
    }
  }

  /**
   * Creates a child logger with a different prefix.
   *
   * @param childPrefix - Additional prefix for the child logger
   * @returns New logger instance
   */
  child(childPrefix: string): Logger {
    const childLogger = new Logger(`${this.prefix}:${childPrefix}`);
    childLogger.setLevel(this.level);
    return childLogger;
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

/**
 * Default logger instance.
 */
export const logger = new Logger();
