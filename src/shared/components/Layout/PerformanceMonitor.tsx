/**
 * @fileoverview Performance monitoring component for development
 * @module shared/components/Layout/PerformanceMonitor
 */

import * as React from 'react';
import { Box, Text } from 'ink';
import {
  usePerformanceMonitor,
  useMemoryMonitor,
  createMemoComponent,
} from './performance-optimizations.js';

/**
 * Performance monitoring display component.
 */
interface PerformanceMonitorProps {
  /** Whether to show the monitor */
  enabled?: boolean;
  /** Position of the monitor */
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  /** Width of the monitor display */
  width?: number;
  /** Height of the monitor display */
  height?: number;
}

/**
 * Performance monitoring component for development and debugging.
 * 
 * This component provides real-time performance metrics including:
 * - Memory usage (if available)
 * - Render performance tracking
 * - Component update frequency
 * - Layout calculation timing
 * 
 * Only enabled in development mode for performance reasons.
 */
const PerformanceMonitorComponent: React.FC<PerformanceMonitorProps> = ({
  enabled = process.env.NODE_ENV === 'development',
  position = 'top-right',
  width = 25,
  height = 6,
}) => {
  const { measure } = usePerformanceMonitor('PerformanceMonitor', enabled);
  const memoryInfo = useMemoryMonitor(1000); // Update every second
  
  // Track render count and timing
  const [renderCount, setRenderCount] = React.useState(0);
  const [lastRenderTime, setLastRenderTime] = React.useState<number>(0);
  const [averageRenderTime, setAverageRenderTime] = React.useState<number>(0);
  
  // Track component updates
  React.useEffect(() => {
    const startTime = performance.now();
    
    measure(() => {
      setRenderCount(prev => prev + 1);
      
      const renderTime = performance.now() - startTime;
      setLastRenderTime(renderTime);
      
      // Calculate rolling average
      setAverageRenderTime(prev => {
        const alpha = 0.1; // Smoothing factor
        return prev * (1 - alpha) + renderTime * alpha;
      });
    });
  });
  
  // Don't render if disabled
  if (!enabled) {
    return null;
  }
  
  // Format memory values
  const formatBytes = (bytes?: number): string => {
    if (!bytes) return 'N/A';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)}MB`;
  };
  
  // Format timing values
  const formatTime = (ms: number): string => {
    return `${ms.toFixed(2)}ms`;
  };
  
  // Calculate position styles
  const getPositionProps = () => {
    switch (position) {
      case 'top-left':
        return { position: 'absolute' as const, top: 0, left: 0 };
      case 'top-right':
        return { position: 'absolute' as const, top: 0, right: 0 };
      case 'bottom-left':
        return { position: 'absolute' as const, bottom: 0, left: 0 };
      case 'bottom-right':
        return { position: 'absolute' as const, bottom: 0, right: 0 };
      default:
        return { position: 'absolute' as const, top: 0, right: 0 };
    }
  };
  
  return (
    <Box
      {...getPositionProps()}
      width={width}
      height={height}
      borderStyle="single"
      borderColor="gray"
      padding={1}
      flexDirection="column"
    >
      <Box marginBottom={1}>
        <Text bold color="cyan">Performance Monitor</Text>
      </Box>
      
      <Box>
        <Text color="yellow">Renders: </Text>
        <Text>{renderCount}</Text>
      </Box>
      
      <Box>
        <Text color="yellow">Last: </Text>
        <Text>{formatTime(lastRenderTime)}</Text>
      </Box>
      
      <Box>
        <Text color="yellow">Avg: </Text>
        <Text>{formatTime(averageRenderTime)}</Text>
      </Box>
      
      {memoryInfo.usedJSHeapSize && (
        <Box>
          <Text color="yellow">Memory: </Text>
          <Text>{formatBytes(memoryInfo.usedJSHeapSize)}</Text>
        </Box>
      )}
      
      {memoryInfo.totalJSHeapSize && (
        <Box>
          <Text color="yellow">Total: </Text>
          <Text>{formatBytes(memoryInfo.totalJSHeapSize)}</Text>
        </Box>
      )}
    </Box>
  );
};

// Create memoized version for performance (ironic, but necessary)
export const PerformanceMonitor = createMemoComponent(PerformanceMonitorComponent, (prevProps, nextProps) => {
  return (
    prevProps.enabled === nextProps.enabled &&
    prevProps.position === nextProps.position &&
    prevProps.width === nextProps.width &&
    prevProps.height === nextProps.height
  );
});

export type { PerformanceMonitorProps };