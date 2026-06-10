'use client';
// ============================================================================
// usePoseLandmarker Hook — MediaPipe Pose detection integration
// ============================================================================

import { useState, useRef, useEffect, useCallback } from 'react';
import { LandmarkPoint } from '@/types';

// We dynamically import MediaPipe to avoid SSR issues in Next.js
type PoseLandmarkerType = import('@mediapipe/tasks-vision').PoseLandmarker;

interface UsePoseLandmarkerReturn {
  isReady: boolean;
  isLoading: boolean;
  error: string | null;
  detect: (video: HTMLVideoElement, timestamp: number) => LandmarkPoint[] | null;
}

/**
 * Custom hook for MediaPipe PoseLandmarker.
 * 
 * - Loads WASM runtime from CDN
 * - Downloads pose_landmarker_lite model from Google Storage
 * - Provides a `detect` function for frame-by-frame pose detection
 * - Running mode: VIDEO (synchronous per-frame detection)
 */
export function usePoseLandmarker(): UsePoseLandmarkerReturn {
  const landmarkerRef = useRef<PoseLandmarkerType | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastTimestampRef = useRef<number>(-1);

  useEffect(() => {
    let cancelled = false;

    async function initializeLandmarker() {
      try {
        setIsLoading(true);
        setError(null);

        // Dynamic import to avoid SSR issues — MediaPipe uses browser APIs
        const { FilesetResolver, PoseLandmarker } = await import(
          '@mediapipe/tasks-vision'
        );

        // Initialize the WASM runtime from CDN
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );

        if (cancelled) return;

        // Create the PoseLandmarker with optimized settings
        const landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
            delegate: 'GPU', // Use GPU acceleration when available
          },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        if (cancelled) {
          landmarker.close();
          return;
        }

        landmarkerRef.current = landmarker;
        setIsReady(true);
        setIsLoading(false);
      } catch (err) {
        if (!cancelled) {
          const error = err as Error;
          setError(`Failed to initialize pose detection: ${error.message}`);
          setIsLoading(false);
        }
      }
    }

    initializeLandmarker();

    return () => {
      cancelled = true;
      if (landmarkerRef.current) {
        landmarkerRef.current.close();
        landmarkerRef.current = null;
      }
    };
  }, []);

  /**
   * Detect pose landmarks in the current video frame.
   * Returns null if no pose is detected or landmarker is not ready.
   * 
   * IMPORTANT: timestamp must be strictly increasing for VIDEO mode.
   */
  const detect = useCallback(
    (video: HTMLVideoElement, timestamp: number): LandmarkPoint[] | null => {
      if (!landmarkerRef.current || !isReady) return null;
      if (video.readyState < 2) return null; // Video not ready yet

      // Ensure strictly increasing timestamps
      if (timestamp <= lastTimestampRef.current) {
        timestamp = lastTimestampRef.current + 1;
      }
      lastTimestampRef.current = timestamp;

      try {
        const result = landmarkerRef.current.detectForVideo(video, timestamp);

        if (result.landmarks && result.landmarks.length > 0) {
          // Convert to our LandmarkPoint interface
          return result.landmarks[0].map((lm) => ({
            x: lm.x,
            y: lm.y,
            z: lm.z,
            visibility: lm.visibility ?? 0,
          }));
        }

        return null;
      } catch {
        // Silently handle detection errors (e.g., invalid frame)
        return null;
      }
    },
    [isReady]
  );

  return { isReady, isLoading, error, detect };
}
