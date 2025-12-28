/**
 * @fileoverview Custom hook for configuration access
 * @module shared/hooks/useConfig
 */

import { useState, useEffect } from 'react';
import { loadConfig, type MergedConfig } from '../../config/index.js';

/**
 * Return value from useConfig hook.
 */
export interface UseConfigResult {
  /** Loaded configuration */
  config: MergedConfig | null;
  /** Whether config is loading */
  isLoading: boolean;
  /** Error if config failed to load */
  error: Error | null;
  /** Reload configuration */
  reload: () => void;
}

/**
 * Custom hook for accessing application configuration.
 *
 * @param workspaceRoot - Workspace root directory
 * @returns Configuration state
 *
 * @example
 * ```tsx
 * const { config, isLoading, error } = useConfig('/path/to/project');
 *
 * if (isLoading) {
    return <Spinner />;
  }
 * if (error) {
    return <Text color="red">{error.message}</Text>;
  }
 *
 * return <Text>Model: {config?.global.defaultModel}</Text>;
 * ```
 */
export function useConfig(workspaceRoot: string): UseConfigResult {
  const [config, setConfig] = useState<MergedConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const reload = (): void => {
    setIsLoading(true);
    setError(null);

    try {
      const loadedConfig = loadConfig(workspaceRoot);
      setConfig(loadedConfig);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load config'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceRoot]);

  return {
    config,
    isLoading,
    error,
    reload,
  };
}
