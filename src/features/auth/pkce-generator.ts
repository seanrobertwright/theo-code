/**
 * @fileoverview PKCE (Proof Key for Code Exchange) generator for OAuth 2.0 security
 * @module features/auth/pkce-generator
 */

import { createHash, randomBytes } from 'node:crypto';
import type { IPKCEGenerator } from './types.js';
import { logger } from '../../shared/utils/index.js';

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * PKCE code verifier length (43-128 characters as per RFC 7636)
 */
const CODE_VERIFIER_LENGTH = 128;

/**
 * Base64URL character set for code verifier generation
 */
const BASE64URL_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

// =============================================================================
// PKCE GENERATOR
// =============================================================================

/**
 * PKCE generator for creating cryptographically secure OAuth 2.0 PKCE parameters.
 * 
 * Implements RFC 7636 - Proof Key for Code Exchange by OAuth Public Clients
 * https://tools.ietf.org/html/rfc7636
 */
export class PKCEGenerator implements IPKCEGenerator {
  
  /**
   * Generate cryptographically secure code verifier.
   * 
   * Creates a URL-safe string of 128 characters using cryptographically
   * secure random number generation as specified in RFC 7636.
   * 
   * @returns Base64URL-encoded code verifier string
   */
  generateCodeVerifier(): string {
    logger.debug('[PKCEGenerator] Generating code verifier');
    
    try {
      // Generate cryptographically secure random bytes
      const buffer = randomBytes(96); // 96 bytes = 128 base64url chars
      
      // Convert to base64url encoding
      const codeVerifier = this.base64URLEncode(buffer);
      
      // Ensure proper length (should be 128 chars)
      if (codeVerifier.length !== CODE_VERIFIER_LENGTH) {
        throw new Error(`Invalid code verifier length: ${codeVerifier.length}, expected: ${CODE_VERIFIER_LENGTH}`);
      }
      
      logger.debug('[PKCEGenerator] Code verifier generated successfully');
      return codeVerifier;
      
    } catch (error) {
      logger.error('[PKCEGenerator] Failed to generate code verifier:', error);
      throw new Error('Failed to generate secure code verifier');
    }
  }

  /**
   * Generate code challenge from verifier using SHA256.
   * 
   * Creates a SHA256 hash of the code verifier and encodes it as base64url
   * as specified in RFC 7636 for the S256 code challenge method.
   * 
   * @param verifier - The code verifier to hash
   * @returns Base64URL-encoded SHA256 hash of the verifier
   */
  generateCodeChallenge(verifier: string): string {
    logger.debug('[PKCEGenerator] Generating code challenge');
    
    try {
      // Validate input
      if (!verifier || typeof verifier !== 'string') {
        throw new Error('Code verifier must be a non-empty string');
      }
      
      if (verifier.length < 43 || verifier.length > 128) {
        throw new Error(`Code verifier length must be between 43-128 characters, got: ${verifier.length}`);
      }
      
      // Validate character set (RFC 7636: unreserved characters only)
      if (!/^[A-Za-z0-9\-._~]+$/.test(verifier)) {
        throw new Error('Code verifier contains invalid characters. Only A-Z, a-z, 0-9, -, ., _, ~ are allowed');
      }
      
      // Create SHA256 hash of the verifier
      const hash = createHash('sha256');
      hash.update(verifier, 'ascii');
      const digest = hash.digest();
      
      // Encode as base64url
      const codeChallenge = this.base64URLEncode(digest);
      
      logger.debug('[PKCEGenerator] Code challenge generated successfully');
      return codeChallenge;
      
    } catch (error) {
      logger.error('[PKCEGenerator] Failed to generate code challenge:', error);
      throw new Error('Failed to generate code challenge');
    }
  }

  /**
   * Validate PKCE code verifier against challenge.
   * 
   * Verifies that a code verifier produces the expected code challenge
   * when hashed with SHA256. Used for security validation.
   * 
   * @param verifier - The original code verifier
   * @param challenge - The expected code challenge
   * @returns True if verifier matches challenge, false otherwise
   */
  validateCodeVerifier(verifier: string, challenge: string): boolean {
    logger.debug('[PKCEGenerator] Validating code verifier against challenge');
    
    try {
      // Validate inputs
      if (!verifier || !challenge) {
        logger.warn('[PKCEGenerator] Missing verifier or challenge for validation');
        return false;
      }
      
      // Generate challenge from verifier
      const expectedChallenge = this.generateCodeChallenge(verifier);
      
      // Constant-time comparison to prevent timing attacks
      const isValid = this.constantTimeEquals(expectedChallenge, challenge);
      
      logger.debug(`[PKCEGenerator] Code verifier validation result: ${isValid}`);
      return isValid;
      
    } catch (error) {
      logger.error('[PKCEGenerator] Error during code verifier validation:', error);
      return false;
    }
  }

  // =============================================================================
  // PRIVATE UTILITIES
  // =============================================================================

  /**
   * Encode buffer as base64url (RFC 4648 Section 5).
   * 
   * Base64url encoding is base64 with URL-safe characters:
   * - Replace '+' with '-'
   * - Replace '/' with '_'  
   * - Remove padding '='
   * 
   * @param buffer - Buffer to encode
   * @returns Base64URL-encoded string
   */
  private base64URLEncode(buffer: Buffer): string {
    return buffer
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  /**
   * Constant-time string comparison to prevent timing attacks.
   * 
   * Compares two strings in constant time regardless of where they differ,
   * preventing timing-based attacks on PKCE validation.
   * 
   * @param a - First string
   * @param b - Second string
   * @returns True if strings are equal, false otherwise
   */
  private constantTimeEquals(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }
    
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    
    return result === 0;
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a new PKCE generator instance.
 * 
 * @returns New PKCEGenerator instance
 */
export function createPKCEGenerator(): IPKCEGenerator {
  return new PKCEGenerator();
}