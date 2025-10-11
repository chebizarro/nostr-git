/**
 * Tests for retry logic with exponential backoff.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withRetry, withGraspRetry, DEFAULT_RETRY_OPTIONS, GRASP_RETRY_OPTIONS } from '../../src/retry/index.js';
import {
  createNetworkError,
  createAuthRequiredError,
  createCorruptPackError,
} from '../../src/errors/factory.js';

describe('Retry Logic', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('withRetry', () => {
    it('should succeed on first attempt', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      
      const result = await withRetry(operation);
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on retriable error', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(createNetworkError())
        .mockResolvedValueOnce('success');
      
      const promise = withRetry(operation, { maxAttempts: 3 });
      
      // Fast-forward through retry delay
      await vi.runAllTimersAsync();
      
      const result = await promise;
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should not retry on user-actionable error', async () => {
      const operation = vi.fn().mockRejectedValue(createAuthRequiredError());
      
      await expect(withRetry(operation)).rejects.toThrow('Authentication required');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry fatal error once', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(createCorruptPackError())
        .mockResolvedValueOnce('success');
      
      const promise = withRetry(operation, { maxAttempts: 3 });
      
      await vi.runAllTimersAsync();
      
      const result = await promise;
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should not retry fatal error more than once', async () => {
      const operation = vi.fn().mockRejectedValue(createCorruptPackError());
      
      const promise = withRetry(operation, { maxAttempts: 3 });
      
      await vi.runAllTimersAsync();
      
      await expect(promise).rejects.toThrow('Corrupt pack');
      expect(operation).toHaveBeenCalledTimes(2); // Initial + 1 retry
    });

    it('should respect maxAttempts', async () => {
      const operation = vi.fn().mockRejectedValue(createNetworkError());
      
      const promise = withRetry(operation, { maxAttempts: 3 });
      
      await vi.runAllTimersAsync();
      
      await expect(promise).rejects.toThrow('Network error');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should use exponential backoff', async () => {
      const operation = vi.fn().mockRejectedValue(createNetworkError());
      const delays: number[] = [];
      
      const promise = withRetry(operation, {
        maxAttempts: 4,
        initialDelayMs: 100,
        jitter: false, // Disable jitter for predictable delays
      });
      
      // Track delays between attempts
      let lastTime = Date.now();
      for (let i = 0; i < 3; i++) {
        await vi.advanceTimersByTimeAsync(1); // Trigger next retry
        const currentTime = Date.now();
        delays.push(currentTime - lastTime);
        lastTime = currentTime;
      }
      
      await expect(promise).rejects.toThrow();
      
      // Delays should be approximately: 100ms, 200ms, 400ms (exponential)
      expect(delays[0]).toBeGreaterThanOrEqual(100);
      expect(delays[1]).toBeGreaterThanOrEqual(200);
      expect(delays[2]).toBeGreaterThanOrEqual(400);
    });

    it('should cap delay at maxDelayMs', async () => {
      const operation = vi.fn().mockRejectedValue(createNetworkError());
      
      const promise = withRetry(operation, {
        maxAttempts: 10,
        initialDelayMs: 1000,
        maxDelayMs: 2000,
        jitter: false,
      });
      
      // Advance through multiple retries
      for (let i = 0; i < 9; i++) {
        await vi.advanceTimersByTimeAsync(3000); // More than maxDelay
      }
      
      await expect(promise).rejects.toThrow();
      
      // All delays should be capped at 2000ms
      expect(operation).toHaveBeenCalledTimes(10);
    });

    it('should apply jitter when enabled', async () => {
      const operation = vi.fn().mockRejectedValue(createNetworkError());
      const delays: number[] = [];
      
      // Run multiple times to check for variation
      for (let run = 0; run < 3; run++) {
        operation.mockClear();
        vi.clearAllTimers();
        
        const promise = withRetry(operation, {
          maxAttempts: 2,
          initialDelayMs: 1000,
          jitter: true,
        });
        
        const startTime = Date.now();
        await vi.advanceTimersByTimeAsync(2000);
        const delay = Date.now() - startTime;
        delays.push(delay);
        
        await expect(promise).rejects.toThrow();
      }
      
      // Delays should vary due to jitter (not all the same)
      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).toBeGreaterThan(1);
    });

    it('should call onRetry callback', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(createNetworkError())
        .mockResolvedValueOnce('success');
      
      const onRetry = vi.fn();
      
      const promise = withRetry(operation, {
        maxAttempts: 3,
        onRetry,
      });
      
      await vi.runAllTimersAsync();
      await promise;
      
      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(
        1, // attempt number
        expect.objectContaining({ code: 'NETWORK_ERROR' }),
        expect.any(Number) // delay
      );
    });

    it('should use custom shouldRetry function', async () => {
      const operation = vi.fn().mockRejectedValue(createNetworkError());
      const shouldRetry = vi.fn().mockReturnValue(false);
      
      await expect(
        withRetry(operation, { shouldRetry })
      ).rejects.toThrow();
      
      expect(operation).toHaveBeenCalledTimes(1);
      expect(shouldRetry).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'NETWORK_ERROR' }),
        0
      );
    });

    it('should use default retry options', async () => {
      const operation = vi.fn().mockRejectedValue(createNetworkError());
      
      const promise = withRetry(operation);
      
      await vi.runAllTimersAsync();
      
      await expect(promise).rejects.toThrow();
      
      // Should use default maxAttempts (3)
      expect(operation).toHaveBeenCalledTimes(DEFAULT_RETRY_OPTIONS.maxAttempts);
    });
  });

  describe('withGraspRetry', () => {
    it('should use GRASP-specific retry options', async () => {
      const operation = vi.fn().mockRejectedValue(createNetworkError());
      
      const promise = withGraspRetry(operation);
      
      await vi.runAllTimersAsync();
      
      await expect(promise).rejects.toThrow();
      
      // Should use GRASP maxAttempts
      expect(operation).toHaveBeenCalledTimes(GRASP_RETRY_OPTIONS.maxAttempts);
    });

    it('should allow overriding GRASP options', async () => {
      const operation = vi.fn().mockRejectedValue(createNetworkError());
      
      const promise = withGraspRetry(operation, { maxAttempts: 5 });
      
      await vi.runAllTimersAsync();
      
      await expect(promise).rejects.toThrow();
      
      expect(operation).toHaveBeenCalledTimes(5);
    });

    it('should use higher initial delay for GRASP', () => {
      expect(GRASP_RETRY_OPTIONS.initialDelayMs).toBeGreaterThan(
        DEFAULT_RETRY_OPTIONS.initialDelayMs
      );
    });

    it('should use higher max delay for GRASP', () => {
      expect(GRASP_RETRY_OPTIONS.maxDelayMs).toBeGreaterThan(
        DEFAULT_RETRY_OPTIONS.maxDelayMs
      );
    });
  });

  describe('Error Handling', () => {
    it('should throw last error after all retries fail', async () => {
      const error1 = createNetworkError({ operation: 'attempt1' });
      const error2 = createNetworkError({ operation: 'attempt2' });
      const error3 = createNetworkError({ operation: 'attempt3' });
      
      const operation = vi.fn()
        .mockRejectedValueOnce(error1)
        .mockRejectedValueOnce(error2)
        .mockRejectedValueOnce(error3);
      
      const promise = withRetry(operation, { maxAttempts: 3 });
      
      await vi.runAllTimersAsync();
      
      await expect(promise).rejects.toBe(error3);
    });

    it('should handle non-GitError exceptions', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('generic error'));
      
      const promise = withRetry(operation, { maxAttempts: 2 });
      
      await vi.runAllTimersAsync();
      
      await expect(promise).rejects.toThrow('generic error');
      
      // Should still retry (treats as retriable by default)
      expect(operation).toHaveBeenCalledTimes(2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle maxAttempts of 1 (no retries)', async () => {
      const operation = vi.fn().mockRejectedValue(createNetworkError());
      
      await expect(
        withRetry(operation, { maxAttempts: 1 })
      ).rejects.toThrow();
      
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should handle zero initial delay', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(createNetworkError())
        .mockResolvedValueOnce('success');
      
      const promise = withRetry(operation, {
        initialDelayMs: 0,
        jitter: false,
      });
      
      await vi.runAllTimersAsync();
      
      const result = await promise;
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should handle operation that returns undefined', async () => {
      const operation = vi.fn().mockResolvedValue(undefined);
      
      const result = await withRetry(operation);
      
      expect(result).toBeUndefined();
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should handle operation that returns null', async () => {
      const operation = vi.fn().mockResolvedValue(null);
      
      const result = await withRetry(operation);
      
      expect(result).toBeNull();
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });
});
