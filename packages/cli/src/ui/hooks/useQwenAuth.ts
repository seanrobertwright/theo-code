/**
 * @license
 * Copyright 2025 Theo
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useEffect } from 'react';
import { LoadedSettings } from '../../config/settings.js';
import {
  AuthType,
  qwenOAuth2Events,
  TheoOAuth2Event,
} from '@theo-code/theo-code-core';

export interface DeviceAuthorizationInfo {
  verification_uri: string;
  verification_uri_complete: string;
  user_code: string;
  expires_in: number;
}

interface TheoAuthState {
  isTheoAuthenticating: boolean;
  deviceAuth: DeviceAuthorizationInfo | null;
  authStatus:
    | 'idle'
    | 'polling'
    | 'success'
    | 'error'
    | 'timeout'
    | 'rate_limit';
  authMessage: string | null;
}

export const useTheoAuth = (
  settings: LoadedSettings,
  isAuthenticating: boolean,
) => {
  const [qwenAuthState, setTheoAuthState] = useState<TheoAuthState>({
    isTheoAuthenticating: false,
    deviceAuth: null,
    authStatus: 'idle',
    authMessage: null,
  });

  const isTheoAuth = settings.merged.selectedAuthType === AuthType.QWEN_OAUTH;

  // Set up event listeners when authentication starts
  useEffect(() => {
    if (!isTheoAuth || !isAuthenticating) {
      // Reset state when not authenticating or not Theo auth
      setTheoAuthState({
        isTheoAuthenticating: false,
        deviceAuth: null,
        authStatus: 'idle',
        authMessage: null,
      });
      return;
    }

    setTheoAuthState((prev) => ({
      ...prev,
      isTheoAuthenticating: true,
      authStatus: 'idle',
    }));

    // Set up event listeners
    const handleDeviceAuth = (deviceAuth: DeviceAuthorizationInfo) => {
      setTheoAuthState((prev) => ({
        ...prev,
        deviceAuth: {
          verification_uri: deviceAuth.verification_uri,
          verification_uri_complete: deviceAuth.verification_uri_complete,
          user_code: deviceAuth.user_code,
          expires_in: deviceAuth.expires_in,
        },
        authStatus: 'polling',
      }));
    };

    const handleAuthProgress = (
      status: 'success' | 'error' | 'polling' | 'timeout' | 'rate_limit',
      message?: string,
    ) => {
      setTheoAuthState((prev) => ({
        ...prev,
        authStatus: status,
        authMessage: message || null,
      }));
    };

    // Add event listeners
    qwenOAuth2Events.on(TheoOAuth2Event.AuthUri, handleDeviceAuth);
    qwenOAuth2Events.on(TheoOAuth2Event.AuthProgress, handleAuthProgress);

    // Cleanup event listeners when component unmounts or auth finishes
    return () => {
      qwenOAuth2Events.off(TheoOAuth2Event.AuthUri, handleDeviceAuth);
      qwenOAuth2Events.off(TheoOAuth2Event.AuthProgress, handleAuthProgress);
    };
  }, [isTheoAuth, isAuthenticating]);

  const cancelTheoAuth = useCallback(() => {
    // Emit cancel event to stop polling
    qwenOAuth2Events.emit(TheoOAuth2Event.AuthCancel);

    setTheoAuthState({
      isTheoAuthenticating: false,
      deviceAuth: null,
      authStatus: 'idle',
      authMessage: null,
    });
  }, []);

  return {
    ...qwenAuthState,
    isTheoAuth,
    cancelTheoAuth,
  };
};
