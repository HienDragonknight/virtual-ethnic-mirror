'use client';
// ============================================================================
// useAnimationLoop Hook — requestAnimationFrame-based render loop with FPS
// ============================================================================

import { useRef, useEffect, useCallback, useState } from 'react';

interface UseAnimationLoopReturn {
  fps: number;
  isRunning: boolean;
  start: () => void;
  stop: () => void;
}

/**
 * Custom hook for a requestAnimationFrame render loop with FPS tracking.
 * 
 * FPS is calculated as a rolling average over the last 30 frames
 * to provide a stable readout without flicker.
 * 
 * @param onFrame - Callback called each animation frame with the timestamp
 * @param enabled - Whether the loop should be active
 */
export function useAnimationLoop(
  onFrame: (timestamp: number) => void,
  enabled: boolean = true
): UseAnimationLoopReturn {
  const rafIdRef = useRef<number>(0);
  const isRunningRef = useRef(false);
  const [isRunning, setIsRunning] = useState(false);
  const [fps, setFps] = useState(0);

  // FPS tracking
  const frameTimesRef = useRef<number[]>([]);
  const lastFpsUpdateRef = useRef(0);

  // Store the latest callback in a ref to avoid stale closures
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;

  const loop = useCallback((timestamp: number) => {
    if (!isRunningRef.current) return;

    // Track frame times for FPS calculation
    frameTimesRef.current.push(timestamp);
    
    // Keep only last 30 frame timestamps
    if (frameTimesRef.current.length > 30) {
      frameTimesRef.current.shift();
    }

    // Update FPS display every 500ms to avoid constant re-renders
    if (timestamp - lastFpsUpdateRef.current > 500) {
      const times = frameTimesRef.current;
      if (times.length >= 2) {
        const elapsed = times[times.length - 1] - times[0];
        const currentFps = ((times.length - 1) / elapsed) * 1000;
        setFps(currentFps);
      }
      lastFpsUpdateRef.current = timestamp;
    }

    // Call the frame handler
    onFrameRef.current(timestamp);

    // Schedule next frame
    rafIdRef.current = requestAnimationFrame(loop);
  }, []);

  const start = useCallback(() => {
    if (isRunningRef.current) return;
    isRunningRef.current = true;
    setIsRunning(true);
    frameTimesRef.current = [];
    rafIdRef.current = requestAnimationFrame(loop);
  }, [loop]);

  const stop = useCallback(() => {
    isRunningRef.current = false;
    setIsRunning(false);
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = 0;
    }
  }, []);

  // Auto-start/stop based on enabled prop
  useEffect(() => {
    if (enabled) {
      start();
    } else {
      stop();
    }
    return () => stop();
  }, [enabled, start, stop]);

  return { fps, isRunning, start, stop };
}
