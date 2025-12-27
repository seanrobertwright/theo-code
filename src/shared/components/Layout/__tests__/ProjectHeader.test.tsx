/**
 * @fileoverview Tests for ProjectHeader component
 * @module shared/components/Layout/__tests__/ProjectHeader
 */

import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';
import { ProjectHeader } from '../ProjectHeader.js';
import { createDefaultColorScheme } from '../utils.js';

describe('ProjectHeader', () => {
  const defaultProps = {
    projectName: 'Test Project',
    width: 80,
    colorScheme: createDefaultColorScheme(),
  };

  it('should render project name', () => {
    const { lastFrame } = render(<ProjectHeader {...defaultProps} />);
    
    expect(lastFrame()).toContain('Test Project');
  });

  it('should render with box outline', () => {
    const { lastFrame } = render(<ProjectHeader {...defaultProps} />);
    
    // Check for box characters (borders)
    const frame = lastFrame();
    expect(frame).toMatch(/[┌┐└┘│─]/);
  });

  it('should display session information when provided', () => {
    const sessionInfo = {
      model: 'gpt-4o',
      provider: 'openai',
      duration: '5m 30s',
    };

    const { lastFrame } = render(
      <ProjectHeader {...defaultProps} sessionInfo={sessionInfo} />
    );

    const frame = lastFrame();
    expect(frame).toContain('gpt-4o');
    expect(frame).toContain('openai');
    expect(frame).toContain('5m 30s');
  });

  it('should handle long session info by truncating', () => {
    const sessionInfo = {
      model: 'very-long-model-name-that-exceeds-available-space',
      provider: 'very-long-provider-name',
      duration: '1h 23m 45s',
    };

    const { lastFrame } = render(
      <ProjectHeader {...defaultProps} width={40} sessionInfo={sessionInfo} />
    );

    const frame = lastFrame();
    // Should contain truncation indicator
    expect(frame).toContain('...');
  });

  it('should work without session information', () => {
    const { lastFrame } = render(<ProjectHeader {...defaultProps} />);
    
    const frame = lastFrame();
    expect(frame).toContain('Test Project');
    // Should not contain session info separators
    expect(frame).not.toContain('•');
  });

  it('should respect the specified width', () => {
    const { lastFrame } = render(<ProjectHeader {...defaultProps} width={50} />);
    
    const frame = lastFrame();
    expect(frame).toBeDefined();
    const lines = frame!.split('\n');
    
    // Find the header line (should be the only line with content)
    const headerLine = lines.find(line => line.includes('Test Project'));
    expect(headerLine).toBeDefined();
    
    // The line should not exceed the specified width
    // Note: Ink may add some padding, so we check it's approximately correct
    expect(headerLine!.length).toBeLessThanOrEqual(52); // Allow some margin for box chars
  });
});