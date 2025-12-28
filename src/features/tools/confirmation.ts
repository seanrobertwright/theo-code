/**
 * @fileoverview Confirmation service for human-in-the-loop tool execution
 * @module features/tools/confirmation
 *
 * Provides user confirmation dialogs for potentially dangerous operations.
 * Integrates with the TUI to show diff previews and collect user approval.
 */

import { useAppStore } from '../../shared/store/index.js';
import { logger } from '../../shared/utils/logger.js';
// =============================================================================
// TYPES
// =============================================================================

/**
 * Confirmation request details.
 */
export interface ConfirmationRequest {
  /** Unique ID for this request */
  id: string;
  /** Message describing the action */
  message: string;
  /** Optional details (e.g., diff preview) */
  details?: string;
  /** Timestamp when request was created */
  timestamp: Date;
}

/**
 * Confirmation result.
 */
export interface ConfirmationResult {
  /** Request ID this result is for */
  id: string;
  /** Whether user approved the action */
  approved: boolean;
  /** Timestamp when decision was made */
  timestamp: Date;
}

// =============================================================================
// CONFIRMATION SERVICE
// =============================================================================

/**
 * Service for managing user confirmations in the TUI.
 * 
 * This service bridges between tool execution and the React Ink UI,
 * allowing tools to request user approval with rich context.
 */
export class ConfirmationService {
  private pendingRequests = new Map<string, ConfirmationRequest>();
  private requestIdCounter = 0;

  /**
   * Request user confirmation with optional details.
   *
   * @param message - Description of the action requiring confirmation
   * @param details - Optional additional details (e.g., diff preview)
   * @returns Promise resolving to true if confirmed, false if rejected
   */
  async requestConfirmation(message: string, details?: string): Promise<boolean> {
    const id = this.generateRequestId();
    const request: ConfirmationRequest = {
      id,
      message,
      ...(details !== undefined ? { details } : {}),
      timestamp: new Date(),
    };

    this.pendingRequests.set(id, request);
    logger.debug(`Created confirmation request ${id}`, { message });

    try {
      // Add confirmation to the store for UI to handle
      const store = useAppStore.getState();
      store.setError(null); // Clear any existing errors

      // Use the store's confirmation dialog
      const approved = await store.showConfirmation(message, details);
      
      const result: ConfirmationResult = {
        id,
        approved,
        timestamp: new Date(),
      };

      logger.debug(`Confirmation request ${id} ${approved === true ? 'approved' : 'rejected'}`);
      return result.approved;

    } finally {
      this.pendingRequests.delete(id);
    }
  }

  /**
   * Get all pending confirmation requests.
   */
  getPendingRequests(): ConfirmationRequest[] {
    return Array.from(this.pendingRequests.values());
  }

  /**
   * Check if there are any pending confirmations.
   */
  hasPendingRequests(): boolean {
    return this.pendingRequests.size > 0;
  }

  /**
   * Clear all pending requests (e.g., on app shutdown).
   */
  clearPendingRequests(): void {
    this.pendingRequests.clear();
    logger.debug('Cleared all pending confirmation requests');
  }

  // ---------------------------------------------------------------------------
  // Private Methods
  // ---------------------------------------------------------------------------

  /**
   * Generate a unique request ID.
   */
  private generateRequestId(): string {
    return `confirm-${++this.requestIdCounter}-${Date.now()}`;
  }


}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

/** Global confirmation service instance */
export const confirmationService = new ConfirmationService();