/**
 * Tests for timeout utilities.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  withTimeout,
  withNetworkTimeout,
  withCloneTimeout,
  withGraspTimeout,
  combineSignals,
  createTimeoutSignal,
  checkAborted,
  DEFAULT_TIMEOUTS,
} from '../../src/retry/timeout.js';
import { GitErrorCode } from '../../src/errors/types.js';

describe('Timeout Utilities', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('withTimeout', () => {
    it('should complete operation before timeout', async () => {
      const operation = vi.fn(async (signal) => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'success';
      });
      
      const promise = withTimeout(operation, { timeoutMs: 1000 });
      
      await vi.advanceTimersByTimeAsync(100);
      
      const result = await promise;
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledWith(expect.any(AbortSignal));
    });

    it('should throw timeout error when operation exceeds timeout', async () => {
      const operation = vi.fn(async (signal) => {
        await new Promise(resolve => setTimeout(resolve, 2000));
        return 'success';
      });
      
      const promise = withTimeout(operation, { timeoutMs: 1000 });
      
      await vi.advanceTimersByTimeAsync(1000);
      
      await expect(promise).rejects.toMatchObject({
        code: GitErrorCode.TIMEOUT,
      });
    });

    it('should pass AbortSignal to operation', async () => {
      const operation = vi.fn(async (signal) => {
        expect(signal).toBeInstanceOf(AbortSignal);
        expect(signal.aborted).toBe(false);
        return 'success';
      });
      
      await withTimeout(operation, { timeoutMs: 1000 });
      
      expect(operation).toHaveBeenCalled();
    });

    it('should abort signal when timeout expires', async () => {
      let capturedSignal: AbortSignal | null = null;
      
      const operation = vi.fn(async (signal) => {
        capturedSignal = signal;
        await new Promise(resolve => setTimeout(resolve, 2000));
        return 'success';
      });
      
      const promise = withTimeout(operation, { timeoutMs: 1000 });
      
      await vi.advanceTimersByTimeAsync(1000);
      
      await expect(promise).rejects.toThrow();
      expect(capturedSignal?.aborted).toBe(true);
    });

    it('should combine with external signal', async () => {
      const externalController = new AbortController();
      
      const operation = vi.fn(async (signal) => {
        await new Promise(resolve => setTimeout(resolve, 500));
        return 'success';
      });
      
      const promise = withTimeout(operation, {
        timeoutMs: 1000,
        signal: externalController.signal,
      });
      
      // Abort externally before timeout
      externalController.abort();
      
      await expect(promise).rejects.toMatchObject({
        code: GitErrorCode.OPERATION_ABORTED,
      });
    });

    it('should attach context to timeout error', async () => {
      const operation = vi.fn(async (signal) => {
        await new Promise(resolve => setTimeout(resolve, 2000));
        return 'success';
      });
      
      const context = { naddr: 'test-naddr', operation: 'fetch' };
      const promise = withTimeout(operation, { timeoutMs: 1000, context });
      
      await vi.advanceTimersByTimeAsync(1000);
      
      await expect(promise).rejects.toMatchObject({
        context,
      });
    });

    it('should preserve original error if not timeout', async () => {
      const originalError = new Error('Operation failed');
      
      const operation = vi.fn(async (signal) => {
        throw originalError;
      });
      
      await expect(
        withTimeout(operation, { timeoutMs: 1000 })
      ).rejects.toBe(originalError);
    });
  });

  describe('combineSignals', () => {
    it('should create combined signal from multiple signals', () => {
      const controller1 = new AbortController();
      const controller2 = new AbortController();
      
      const combined = combineSignals(controller1.signal, controller2.signal);
      
      expect(combined).toBeInstanceOf(AbortSignal);
      expect(combined.aborted).toBe(false);
    });

    it('should abort when first signal aborts', () => {
      const controller1 = new AbortController();
      const controller2 = new AbortController();
      
      const combined = combineSignals(controller1.signal, controller2.signal);
      
      controller1.abort();
      
      expect(combined.aborted).toBe(true);
    });

    it('should abort when second signal aborts', () => {
      const controller1 = new AbortController();
      const controller2 = new AbortController();
      
      const combined = combineSignals(controller1.signal, controller2.signal);
      
      controller2.abort();
      
      expect(combined.aborted).toBe(true);
    });

    it('should handle already aborted signal', () => {
      const controller1 = new AbortController();
      controller1.abort();
      
      const controller2 = new AbortController();
      
      const combined = combineSignals(controller1.signal, controller2.signal);
      
      expect(combined.aborted).toBe(true);
    });

    it('should handle undefined signals', () => {
      const controller = new AbortController();
      
      const combined = combineSignals(controller.signal, undefined);
      
      expect(combined).toBeInstanceOf(AbortSignal);
      expect(combined.aborted).toBe(false);
    });

    it('should handle all undefined signals', () => {
      const combined = combineSignals(undefined, undefined);
      
      expect(combined).toBeInstanceOf(AbortSignal);
      expect(combined.aborted).toBe(false);
    });
  });

  describe('createTimeoutSignal', () => {
    it('should create signal that aborts after timeout', async () => {
      const signal = createTimeoutSignal(1000);
      
      expect(signal.aborted).toBe(false);
      
      await vi.advanceTimersByTimeAsync(1000);
      
      expect(signal.aborted).toBe(true);
    });

    it('should not abort before timeout', async () => {
      const signal = createTimeoutSignal(1000);
      
      await vi.advanceTimersByTimeAsync(500);
      
      expect(signal.aborted).toBe(false);
    });
  });

  describe('checkAborted', () => {
    it('should not throw if signal is not aborted', () => {
      const controller = new AbortController();
      
      expect(() => checkAborted(controller.signal)).not.toThrow();
    });

    it('should throw if signal is aborted', () => {
      const controller = new AbortController();
      controller.abort();
      
      expect(() => checkAborted(controller.signal)).toThrow();
      expect(() => checkAborted(controller.signal)).toThrowError(
        expect.objectContaining({ code: GitErrorCode.OPERATION_ABORTED })
      );
    });

    it('should handle undefined signal', () => {
      expect(() => checkAborted(undefined)).not.toThrow();
    });

    it('should attach context to error', () => {
      const controller = new AbortController();
      controller.abort();
      
      const context = { naddr: 'test-naddr' };
      
      expect(() => checkAborted(controller.signal, context)).toThrowError(
        expect.objectContaining({ context })
      );
    });
  });

  describe('Convenience Functions', () => {
    it('withNetworkTimeout should use network timeout', async () => {
      const operation = vi.fn(async (signal) => 'success');
      
      await withNetworkTimeout(operation);
      
      expect(operation).toHaveBeenCalled();
    });

    it('withCloneTimeout should use clone timeout', async () => {
      const operation = vi.fn(async (signal) => 'success');
      
      await withCloneTimeout(operation);
      
      expect(operation).toHaveBeenCalled();
    });

    it('withGraspTimeout should use GRASP timeout', async () => {
      const operation = vi.fn(async (signal) => 'success');
      
      await withGraspTimeout(operation);
      
      expect(operation).toHaveBeenCalled();
    });

    it('GRASP timeout should be higher than network timeout', () => {
      expect(DEFAULT_TIMEOUTS.GRASP).toBeGreaterThan(DEFAULT_TIMEOUTS.NETWORK);
    });

    it('clone timeout should be higher than network timeout', () => {
      expect(DEFAULT_TIMEOUTS.CLONE).toBeGreaterThan(DEFAULT_TIMEOUTS.NETWORK);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero timeout', async () => {
      const operation = vi.fn(async (signal) => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'success';
      });
      
      const promise = withTimeout(operation, { timeoutMs: 0 });
      
      await vi.advanceTimersByTimeAsync(0);
      
      await expect(promise).rejects.toMatchObject({
        code: GitErrorCode.TIMEOUT,
      });
    });

    it('should handle operation that completes synchronously', async () => {
      const operation = vi.fn((signal) => 'success');
      
      const result = await withTimeout(operation, { timeoutMs: 1000 });
      
      expect(result).toBe('success');
    });

    it('should handle operation that throws synchronously', async () => {
      const operation = vi.fn((signal) => {
        throw new Error('Sync error');
      });
      
      await expect(
        withTimeout(operation, { timeoutMs: 1000 })
      ).rejects.toThrow('Sync error');
    });

    it('should handle operation that returns undefined', async () => {
      const operation = vi.fn(async (signal) => undefined);
      
      const result = await withTimeout(operation, { timeoutMs: 1000 });
      
      expect(result).toBeUndefined();
    });

    it('should handle operation that returns null', async () => {
      const operation = vi.fn(async (signal) => null);
      
      const result = await withTimeout(operation, { timeoutMs: 1000 });
      
      expect(result).toBeNull();
    });
  });

  describe('Signal Propagation', () => {
    it('should allow operation to check signal status', async () => {
      let signalChecked = false;
      
      const operation = vi.fn(async (signal) => {
        await new Promise(resolve => setTimeout(resolve, 500));
        signalChecked = signal.aborted;
        return 'success';
      });
      
      const promise = withTimeout(operation, { timeoutMs: 1000 });
      
      await vi.advanceTimersByTimeAsync(500);
      await promise;
      
      expect(signalChecked).toBe(false);
    });

    it('should allow operation to respond to abort', async () => {
      let abortHandled = false;
      
      const operation = vi.fn(async (signal) => {
        signal.addEventListener('abort', () => {
          abortHandled = true;
        });
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        return 'success';
      });
      
      const promise = withTimeout(operation, { timeoutMs: 1000 });
      
      await vi.advanceTimersByTimeAsync(1000);
      
      await expect(promise).rejects.toThrow();
      expect(abortHandled).toBe(true);
    });
  });
});
