/**
 * @fileoverview Demonstration of input handler error boundaries
 * @module shared/components/Layout/__tests__/error-boundary-demo
 */

import { 
  createSafeInputHandler, 
  createSafeInputHandlerWithDefaults,
  InputErrorRecoveryStrategies,
  createAdvancedSafeInputHandler
} from '../input-error-handling.js';

/**
 * Demonstrates how the error boundaries protect against input handler failures
 */
export function demonstrateErrorBoundaries() {
  console.log('=== Input Handler Error Boundary Demonstration ===\n');

  // Example 1: Basic error handling
  console.log('1. Basic Error Handling:');
  const faultyHandler = (input: string, key: any) => {
    if (input === 'crash') {
      throw new Error('Simulated input handler crash');
    }
    console.log(`  Normal input processed: ${input}`);
  };

  const safeHandler = createSafeInputHandlerWithDefaults(faultyHandler, 'DemoComponent');

  console.log('  Testing normal input:');
  safeHandler('hello', { key: 'test' });
  
  console.log('  Testing error-causing input:');
  safeHandler('crash', { key: 'test' }); // This should not crash the app
  
  console.log('  Testing normal input after error:');
  safeHandler('world', { key: 'test' });
  console.log('');

  // Example 2: Custom fallback behavior
  console.log('2. Custom Fallback Behavior:');
  const fallbackHandler = (input: string, key: any) => {
    console.log(`  Fallback handler activated for input: ${input}`);
  };

  const handlerWithFallback = createSafeInputHandler(faultyHandler, {
    componentName: 'DemoComponent',
    fallbackHandler,
    errorPrefix: 'Demo error'
  });

  console.log('  Testing with custom fallback:');
  handlerWithFallback('crash', { key: 'test' });
  console.log('');

  // Example 3: Advanced recovery strategies
  console.log('3. Advanced Recovery Strategies:');
  const advancedHandler = createAdvancedSafeInputHandler(
    faultyHandler,
    'DemoComponent',
    InputErrorRecoveryStrategies.DISABLE_TEMPORARILY
  );

  console.log('  Testing temporary disable strategy:');
  advancedHandler('crash', { key: 'test' }); // Should disable temporarily
  advancedHandler('hello', { key: 'test' }); // Should be ignored due to disable
  console.log('');

  console.log('=== Demonstration Complete ===');
  console.log('All input handlers remained stable despite errors!');
}

// Run demonstration if this file is executed directly
if (require.main === module) {
  demonstrateErrorBoundaries();
}