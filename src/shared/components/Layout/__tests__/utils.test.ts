/**
 * @fileoverview Tests for layout utility functions
 * @module shared/components/Layout/__tests__/utils
 */

import { deriveProjectName } from '../utils.js';

describe('Layout Utils', () => {
  describe('deriveProjectName', () => {
    it('should derive project name from simple path', () => {
      expect(deriveProjectName('/path/to/my-project')).toBe('My Project');
    });

    it('should handle kebab-case names', () => {
      expect(deriveProjectName('/workspace/awesome-web-app')).toBe('Awesome Web App');
    });

    it('should handle snake_case names', () => {
      expect(deriveProjectName('/home/user/my_cool_project')).toBe('My Cool Project');
    });

    it('should handle mixed case and separators', () => {
      expect(deriveProjectName('/dev/projects/React-Native_App')).toBe('React Native App');
    });

    it('should handle single word names', () => {
      expect(deriveProjectName('/workspace/frontend')).toBe('Frontend');
    });

    it('should handle Windows paths', () => {
      expect(deriveProjectName('C:\\Users\\Dev\\projects\\my-app')).toBe('My App');
    });

    it('should handle current directory', () => {
      expect(deriveProjectName('/some/path/.')).toBe('Current Directory');
      expect(deriveProjectName('.')).toBe('Current Directory');
    });

    it('should handle root directory', () => {
      expect(deriveProjectName('/')).toBe('Unknown Project');
    });

    it('should handle empty or invalid paths', () => {
      expect(deriveProjectName('')).toBe('Unknown Project');
    });

    it('should handle paths with numbers', () => {
      expect(deriveProjectName('/projects/app-v2')).toBe('App V2');
      expect(deriveProjectName('/workspace/project_2024')).toBe('Project 2024');
    });

    it('should handle paths with special characters', () => {
      expect(deriveProjectName('/workspace/my-project@latest')).toBe('My Project@Latest');
    });
  });
});