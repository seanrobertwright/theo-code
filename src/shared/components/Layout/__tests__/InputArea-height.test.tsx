/**
 * @fileoverview Layout test for InputArea height stability
 * @module shared/components/Layout/__tests__/InputArea-height
 */

import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';
import { InputArea } from '../InputArea.js';
import { InputManagerProvider } from '../../../hooks/useInputManager.js';

describe('InputArea height', () => {
  it('should remain 3 lines tall with long input', () => {
    const longValue = 'x'.repeat(500);

    const { lastFrame } = render(
      <InputManagerProvider>
        <InputArea value={longValue} onChange={() => {}} onSubmit={() => {}} width={40} />
      </InputManagerProvider>
    );

    const frame = lastFrame() ?? '';
    expect(frame.split('\n').length).toBe(3);
  });
});

