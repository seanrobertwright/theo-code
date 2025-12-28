/**
 * @fileoverview Custom hook for keyboard handling
 * @module shared/hooks/useKeyboard
 */

import { useState, useCallback } from 'react';
import { useInput, type Key } from 'ink';

/**
 * Command history entry.
 */
interface HistoryEntry {
  input: string;
  timestamp: number;
}

/**
 * Options for useKeyboard hook.
 */
export interface UseKeyboardOptions {
  /** Callback when user submits input */
  onSubmit?: (input: string) => void;
  /** Callback when user requests exit */
  onExit?: () => void;
  /** Whether keyboard input is active */
  isActive?: boolean;
}

/**
 * Return value from useKeyboard hook.
 */
export interface UseKeyboardResult {
  /** Current input value */
  currentInput: string;
  /** Set input value */
  setInput: (value: string) => void;
  /** Clear input */
  clearInput: () => void;
  /** Command history */
  history: HistoryEntry[];
  /** Add entry to history */
  addToHistory: (entry: string) => void;
}

/**
 * Navigate history upwards.
 */
function navigateHistoryUp(
  history: HistoryEntry[],
  historyIndex: number,
  setHistoryIndex: (idx: number) => void,
  setInput: (value: string) => void
): void {
  if (history.length > 0 && historyIndex < history.length - 1) {
    const newIndex = historyIndex + 1;
    setHistoryIndex(newIndex);
    const historyEntry = history[newIndex];
    if (historyEntry !== undefined) {
      setInput(historyEntry.input);
    }
  }
}

/**
 * Navigate history downwards.
 */
function navigateHistoryDown(
  history: HistoryEntry[],
  historyIndex: number,
  setHistoryIndex: (idx: number) => void,
  setInput: (value: string) => void
): void {
  if (historyIndex > 0) {
    const newIndex = historyIndex - 1;
    setHistoryIndex(newIndex);
    const historyEntry = history[newIndex];
    if (historyEntry !== undefined) {
      setInput(historyEntry.input);
    }
  } else if (historyIndex === 0) {
    setHistoryIndex(-1);
    setInput('');
  }
}

/**
 * Check if the key is a special key that should be handled.
 */
function handleSpecialKey(
  key: Key,
  char: string,
  handlers: {
    onExit: (() => void) | undefined;
    onSubmit: () => void;
    onBackspace: () => void;
    onUpArrow: () => void;
    onDownArrow: () => void;
    onEscape: () => void;
  }
): boolean {
  if (key.ctrl && char === 'c') {
    handlers.onExit?.();
    return true;
  }
  if (key.return) {
    handlers.onSubmit();
    return true;
  }
  if (key.backspace || key.delete) {
    handlers.onBackspace();
    return true;
  }
  if (key.upArrow) {
    handlers.onUpArrow();
    return true;
  }
  if (key.downArrow) {
    handlers.onDownArrow();
    return true;
  }
  if (key.escape) {
    handlers.onEscape();
    return true;
  }
  return false;
}

/**
 * Custom hook for keyboard handling with history support.
 *
 * @param options - Hook options
 * @returns Keyboard state and actions
 *
 * @example
 * ```tsx
 * const { input, setInput, clearInput } = useKeyboard({
 *   onSubmit: (value) => handleSubmit(value),
 *   onExit: () => exit(),
 * });
 * ```
 */
export function useKeyboard(options: UseKeyboardOptions = {}): UseKeyboardResult {
  const { onSubmit, onExit, isActive = true } = options;

  const [input, setInput] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const clearInput = useCallback((): void => {
    setInput('');
    setHistoryIndex(-1);
  }, []);

  const addToHistory = useCallback((entry: string): void => {
    if (entry.length === 0) {
      return;
    }

    setHistory((prev) => [
      { input: entry, timestamp: Date.now() },
      ...prev.slice(0, 99), // Keep last 100 entries
    ]);
  }, []);

  useInput(
    (char, key) => {
      const handled = handleSpecialKey(key, char, {
        onExit,
        onSubmit: () => {
          if (input.length > 0) {
            addToHistory(input);
            onSubmit?.(input);
          }
          clearInput();
        },
        onBackspace: () => setInput((prev) => prev.slice(0, -1)),
        onUpArrow: () => navigateHistoryUp(history, historyIndex, setHistoryIndex, setInput),
        onDownArrow: () => navigateHistoryDown(history, historyIndex, setHistoryIndex, setInput),
        onEscape: clearInput,
      });

      // Handle regular character input
      if (!handled && !key.ctrl && !key.meta && char.length > 0) {
        setInput((prev) => prev + char);
        setHistoryIndex(-1);
      }
    },
    { isActive }
  );

  return {
    currentInput: input,
    setInput,
    clearInput,
    history,
    addToHistory,
  };
}
