'use client';
// ============================================================================
// useWebcam Hook — Manages webcam lifecycle and permissions
// ============================================================================

import { useState, useRef, useEffect, useCallback } from 'react';

interface UseWebcamReturn {
  videoRef: React.RefObject<HTMLVideoElement>;
  isReady: boolean;
  error: string | null;
  startWebcam: () => Promise<void>;
  stopWebcam: () => void;
}

/**
 * Custom hook to manage the webcam stream.
 * 
 * - Requests camera permission
 * - Handles errors gracefully (permission denied, no camera, etc.)
 * - Cleans up stream on unmount
 * - Provides a video element ref to attach to a <video> tag
 */
export function useWebcam(): UseWebcamReturn {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startWebcam = useCallback(async () => {
    try {
      setError(null);
      setIsReady(false);

      // Request camera with preferred constraints
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user', // front camera
          frameRate: { ideal: 30 },
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        // Mobile browser autoplay requirements (iOS Safari, Android Chrome)
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.setAttribute('muted', 'true');
        videoRef.current.srcObject = stream;
        
        // Wait for video metadata to load before marking ready
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().then(() => {
            setIsReady(true);
          }).catch((playErr) => {
            setError(`Failed to play video: ${playErr.message}`);
          });
        };
      }
    } catch (err) {
      const error = err as Error;
      
      if (error.name === 'NotAllowedError') {
        setError('Camera permission denied. Please allow camera access and refresh.');
      } else if (error.name === 'NotFoundError') {
        setError('No camera found. Please connect a camera and refresh.');
      } else if (error.name === 'NotReadableError') {
        setError('Camera is in use by another application.');
      } else {
        setError(`Camera error: ${error.message}`);
      }
    }
  }, []);

  const stopWebcam = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsReady(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  return {
    videoRef: videoRef as React.RefObject<HTMLVideoElement>,
    isReady,
    error,
    startWebcam,
    stopWebcam,
  };
}
