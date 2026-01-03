/**
 * @fileoverview Example usage of memory monitoring functionality
 * @module shared/utils/performanceMonitor.example
 */

import {
  startMemoryMonitoring,
  stopMemoryMonitoring,
  getMemoryStats,
  getMemoryLeakReport,
  forceGarbageCollection,
  logSummary,
  setPerformanceMonitorEnabled,
} from './performanceMonitor.js';

/**
 * Example: Basic memory monitoring for a component
 */
export function exampleBasicMemoryMonitoring() {
  // Enable performance monitoring
  setPerformanceMonitorEnabled(true);
  
  // Start monitoring memory for a component
  startMemoryMonitoring('MyComponent');
  
  // Simulate some work that might cause memory growth
  const largeArray = new Array(1000000).fill('data');
  
  // Check memory stats
  const stats = getMemoryStats('MyComponent');
  if (stats) {
    console.log('Memory Stats:', {
      component: stats.name,
      currentUsage: `${(stats.currentMemory.usedHeapSize / 1024 / 1024).toFixed(2)}MB`,
      memoryGrowth: `${(stats.memoryGrowth / 1024 / 1024).toFixed(2)}MB`,
      potentialLeak: stats.potentialLeak,
    });
  }
  
  // Stop monitoring when component unmounts
  stopMemoryMonitoring('MyComponent');
  
  // Clean up
  largeArray.length = 0;
}

/**
 * Example: Memory leak detection across multiple components
 */
export function exampleMemoryLeakDetection() {
  setPerformanceMonitorEnabled(true);
  
  // Monitor multiple components
  startMemoryMonitoring('ComponentA');
  startMemoryMonitoring('ComponentB');
  startMemoryMonitoring('ComponentC');
  
  // Simulate different memory usage patterns
  
  // ComponentA: Normal usage
  const normalData = new Array(100).fill('normal');
  
  // ComponentB: Potential memory leak
  const leakyData = new Array(10000000).fill('leak'); // Large allocation
  
  // ComponentC: Efficient usage
  const efficientData = new Array(10).fill('efficient');
  
  // Wait a bit for monitoring to collect data
  setTimeout(() => {
    // Get memory leak report
    const report = getMemoryLeakReport();
    
    console.log('Memory Leak Report:', {
      totalMonitored: report.totalMonitored,
      potentialLeaks: report.potentialLeaks.length,
      healthyComponents: report.healthyComponents.length,
      totalMemoryGrowth: `${(report.totalMemoryGrowth / 1024 / 1024).toFixed(2)}MB`,
    });
    
    // Log components with potential leaks
    if (report.potentialLeaks.length > 0) {
      console.warn('Components with potential memory leaks:');
      report.potentialLeaks.forEach(stats => {
        console.warn(`- ${stats.name}: ${(stats.memoryGrowth / 1024 / 1024).toFixed(2)}MB growth`);
      });
    }
    
    // Clean up
    normalData.length = 0;
    leakyData.length = 0;
    efficientData.length = 0;
    
    stopMemoryMonitoring('ComponentA');
    stopMemoryMonitoring('ComponentB');
    stopMemoryMonitoring('ComponentC');
  }, 6000); // Wait for at least one memory sample
}

/**
 * Example: Using garbage collection monitoring
 */
export function exampleGarbageCollectionMonitoring() {
  setPerformanceMonitorEnabled(true);
  
  console.log('Testing garbage collection...');
  
  // Create some objects that can be garbage collected
  let temporaryData: any[] = [];
  for (let i = 0; i < 1000000; i++) {
    temporaryData.push({ id: i, data: `item-${i}` });
  }
  
  // Force garbage collection and measure impact
  const gcResult = forceGarbageCollection();
  
  if (gcResult) {
    const memoryFreed = gcResult.before.usedHeapSize - gcResult.after.usedHeapSize;
    console.log('Garbage Collection Results:', {
      beforeGC: `${(gcResult.before.usedHeapSize / 1024 / 1024).toFixed(2)}MB`,
      afterGC: `${(gcResult.after.usedHeapSize / 1024 / 1024).toFixed(2)}MB`,
      memoryFreed: `${(memoryFreed / 1024 / 1024).toFixed(2)}MB`,
    });
  }
  
  // Clear reference to allow garbage collection
  temporaryData = [];
}

/**
 * Example: Session-level memory monitoring
 */
export function exampleSessionMemoryMonitoring() {
  setPerformanceMonitorEnabled(true);
  
  // Start monitoring for the entire session
  startMemoryMonitoring('UserSession');
  
  // Simulate session activities
  const sessionData = {
    messages: [] as string[],
    cache: new Map<string, any>(),
    temporaryFiles: [] as string[],
  };
  
  // Add some data over time
  const addSessionData = () => {
    sessionData.messages.push(`Message ${Date.now()}`);
    sessionData.cache.set(`key-${Date.now()}`, { data: 'cached data' });
    sessionData.temporaryFiles.push(`temp-${Date.now()}.tmp`);
  };
  
  // Simulate periodic activity
  const interval = setInterval(addSessionData, 1000);
  
  // Check memory periodically
  const checkMemory = setInterval(() => {
    const stats = getMemoryStats('UserSession');
    if (stats) {
      console.log('Session Memory:', {
        duration: `${((Date.now() - stats.initialMemory.timestamp) / 1000).toFixed(1)}s`,
        currentUsage: `${(stats.currentMemory.usedHeapSize / 1024 / 1024).toFixed(2)}MB`,
        memoryGrowth: `${(stats.memoryGrowth / 1024 / 1024).toFixed(2)}MB`,
        measurements: stats.measurementCount,
        potentialLeak: stats.potentialLeak ? '🚨 YES' : '✅ NO',
      });
    }
  }, 10000);
  
  // Clean up after 30 seconds
  setTimeout(() => {
    clearInterval(interval);
    clearInterval(checkMemory);
    
    // Final memory report
    logSummary();
    
    stopMemoryMonitoring('UserSession');
    
    // Clean up session data
    sessionData.messages.length = 0;
    sessionData.cache.clear();
    sessionData.temporaryFiles.length = 0;
  }, 30000);
}

/**
 * Example: React component memory monitoring pattern
 */
export function exampleReactComponentPattern() {
  setPerformanceMonitorEnabled(true);
  
  // Simulate React component lifecycle
  const componentName = 'ExpensiveComponent';
  
  // Component mount
  console.log(`Mounting ${componentName}...`);
  startMemoryMonitoring(componentName);
  
  // Simulate component work
  const componentState = {
    data: new Array(100000).fill('component data'),
    listeners: [] as (() => void)[],
    timers: [] as NodeJS.Timeout[],
  };
  
  // Add event listeners (potential leak source)
  for (let i = 0; i < 100; i++) {
    const listener = () => console.log(`Event ${i}`);
    componentState.listeners.push(listener);
  }
  
  // Add timers (potential leak source)
  for (let i = 0; i < 10; i++) {
    const timer = setInterval(() => {
      // Simulate timer work
    }, 1000);
    componentState.timers.push(timer);
  }
  
  // Check memory after component setup
  setTimeout(() => {
    const stats = getMemoryStats(componentName);
    if (stats) {
      console.log(`${componentName} Memory After Setup:`, {
        memoryGrowth: `${(stats.memoryGrowth / 1024 / 1024).toFixed(2)}MB`,
        potentialLeak: stats.potentialLeak,
      });
    }
    
    // Component unmount - clean up resources
    console.log(`Unmounting ${componentName}...`);
    
    // Clear timers
    componentState.timers.forEach(timer => clearInterval(timer));
    componentState.timers.length = 0;
    
    // Clear listeners
    componentState.listeners.length = 0;
    
    // Clear data
    componentState.data.length = 0;
    
    // Stop memory monitoring
    stopMemoryMonitoring(componentName);
    
    console.log(`${componentName} cleanup complete`);
  }, 5000);
}

// Export all examples for easy testing
export const memoryMonitoringExamples = {
  basic: exampleBasicMemoryMonitoring,
  leakDetection: exampleMemoryLeakDetection,
  garbageCollection: exampleGarbageCollectionMonitoring,
  sessionMonitoring: exampleSessionMemoryMonitoring,
  reactComponent: exampleReactComponentPattern,
};