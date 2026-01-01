import { useRef, useCallback } from 'react';
import { useInput } from 'ink';

interface UseDoubleCtrlCOptions {
  onExit: () => void;
  timeout?: number;
}

export const useDoubleCtrlC = ({ onExit, timeout = 1000 }: UseDoubleCtrlCOptions) => {
  const lastCtrlCTime = useRef<number>(0);

  useInput(useCallback((input, key) => {
    if (key.ctrl && input === 'c') {
      const now = Date.now();
      
      if (now - lastCtrlCTime.current < timeout) {
        // Double Ctrl+C detected
        onExit();
      } else {
        // First Ctrl+C - update timestamp
        lastCtrlCTime.current = now;
      }
    }
  }, [onExit, timeout]));
};
