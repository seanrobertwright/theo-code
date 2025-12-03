/**
 * @fileoverview Tests for path utilities
 * @module shared/utils/__tests__/paths.test
 */

import { describe, it, expect } from 'vitest';
import {
  isPathWithinWorkspace,
  normalizePath,
  getRelativePath,
  formatFileSize,
  isBinaryFile,
} from '../paths.js';

describe('isPathWithinWorkspace', () => {
  it('should return true for paths within workspace', () => {
    expect(isPathWithinWorkspace('/project/src/file.ts', '/project')).toBe(true);
    expect(isPathWithinWorkspace('src/file.ts', '/project')).toBe(true);
    expect(isPathWithinWorkspace('./src/file.ts', '/project')).toBe(true);
  });

  it('should return false for paths outside workspace', () => {
    expect(isPathWithinWorkspace('/other/file.ts', '/project')).toBe(false);
    expect(isPathWithinWorkspace('../etc/passwd', '/project')).toBe(false);
    expect(isPathWithinWorkspace('/project/../etc/passwd', '/project')).toBe(false);
  });

  it('should return true for workspace root itself', () => {
    expect(isPathWithinWorkspace('/project', '/project')).toBe(true);
    expect(isPathWithinWorkspace('.', '/project')).toBe(true);
  });
});

describe('normalizePath', () => {
  it('should normalize relative paths', () => {
    const result = normalizePath('src/file.ts', '/project');
    expect(result).toContain('project');
    expect(result).toContain('src');
    expect(result).toContain('file.ts');
  });

  it('should throw for paths outside workspace', () => {
    expect(() => normalizePath('../etc/passwd', '/project')).toThrow();
  });
});

describe('getRelativePath', () => {
  it('should return relative path from workspace', () => {
    const result = getRelativePath('/project/src/file.ts', '/project');
    // Path separator may vary by OS
    expect(result).toContain('src');
    expect(result).toContain('file.ts');
  });
});

describe('formatFileSize', () => {
  it('should format bytes', () => {
    expect(formatFileSize(500)).toBe('500 B');
  });

  it('should format kilobytes', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB');
    expect(formatFileSize(1536)).toBe('1.5 KB');
  });

  it('should format megabytes', () => {
    expect(formatFileSize(1048576)).toBe('1.0 MB');
  });

  it('should format gigabytes', () => {
    expect(formatFileSize(1073741824)).toBe('1.0 GB');
  });
});

describe('isBinaryFile', () => {
  it('should detect binary file extensions', () => {
    expect(isBinaryFile('image.png')).toBe(true);
    expect(isBinaryFile('image.jpg')).toBe(true);
    expect(isBinaryFile('archive.zip')).toBe(true);
    expect(isBinaryFile('program.exe')).toBe(true);
    expect(isBinaryFile('document.pdf')).toBe(true);
  });

  it('should detect text file extensions', () => {
    expect(isBinaryFile('code.ts')).toBe(false);
    expect(isBinaryFile('code.js')).toBe(false);
    expect(isBinaryFile('readme.md')).toBe(false);
    expect(isBinaryFile('config.json')).toBe(false);
  });

  it('should be case insensitive', () => {
    expect(isBinaryFile('IMAGE.PNG')).toBe(true);
    expect(isBinaryFile('Image.Png')).toBe(true);
  });
});
