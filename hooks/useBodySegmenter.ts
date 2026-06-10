'use client';
// ============================================================================
// useBodySegmenter Hook — MediaPipe Image Segmenter for body part masks
//
// Uses the multiclass selfie segmentation model to identify body regions:
//   0 = background
//   1 = hair
//   2 = body-skin (arms, hands)
//   3 = face-skin
//   4 = clothes
//   5 = others (accessories)
//
// This mask is used by the occlusion compositor to render arms/head
// IN FRONT of the outfit overlay, creating realistic occlusion.
// ============================================================================

import { useState, useRef, useEffect, useCallback } from 'react';

type ImageSegmenterType = import('@mediapipe/tasks-vision').ImageSegmenter;

interface UseBodySegmenterReturn {
  isReady: boolean;
  isLoading: boolean;
  error: string | null;
  /**
   * Run segmentation on the current video frame.
   * Returns a Uint8Array category mask where each pixel = category index (0-5).
   * Returns null if segmenter is not ready or frame is invalid.
   */
  segment: (video: HTMLVideoElement, timestamp: number) => Uint8Array | null;
}

/**
 * Custom hook for MediaPipe Image Segmenter with multiclass selfie model.
 * Runs in VIDEO mode for synchronous per-frame segmentation.
 */
export function useBodySegmenter(): UseBodySegmenterReturn {
  const segmenterRef = useRef<ImageSegmenterType | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastTimestampRef = useRef<number>(-1);
  const cachedMaskRef = useRef<Uint8Array | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function initializeSegmenter() {
      try {
        setIsLoading(true);
        setError(null);

        // Dynamic import to avoid SSR issues
        const { FilesetResolver, ImageSegmenter } = await import(
          '@mediapipe/tasks-vision'
        );

        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );

        if (cancelled) return;

        const segmenter = await ImageSegmenter.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          outputCategoryMask: true,
          outputConfidenceMasks: false,
        });

        if (cancelled) {
          segmenter.close();
          return;
        }

        segmenterRef.current = segmenter;
        setIsReady(true);
        setIsLoading(false);
      } catch (err) {
        if (!cancelled) {
          const error = err as Error;
          setError(`Failed to initialize body segmenter: ${error.message}`);
          setIsLoading(false);
        }
      }
    }

    initializeSegmenter();

    return () => {
      cancelled = true;
      if (segmenterRef.current) {
        segmenterRef.current.close();
        segmenterRef.current = null;
      }
    };
  }, []);

  const segment = useCallback(
    (video: HTMLVideoElement, timestamp: number): Uint8Array | null => {
      if (!segmenterRef.current || !isReady) return null;
      if (video.readyState < 2) return null;

      // Ensure strictly increasing timestamps
      if (timestamp <= lastTimestampRef.current) {
        timestamp = lastTimestampRef.current + 1;
      }
      lastTimestampRef.current = timestamp;

      try {
        const result = segmenterRef.current.segmentForVideo(video, timestamp);

        if (result.categoryMask) {
          const maskData = result.categoryMask.getAsUint8Array();
          // Copy the data because MediaPipe may reuse the buffer
          const copy = new Uint8Array(maskData.length);
          copy.set(maskData);
          cachedMaskRef.current = copy;
          // Close the result to free WebGL resources
          result.close();
          return cachedMaskRef.current;
        }
        
        result.close();
        return null;
      } catch {
        // Silently handle segmentation errors
        return null;
      }
    },
    [isReady]
  );

  return { isReady, isLoading, error, segment };
}
