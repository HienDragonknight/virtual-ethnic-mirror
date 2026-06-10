'use client';
// ============================================================================
// SmartMirror — Main orchestrator component
//
// Production-grade render pipeline:
//   1. Draw mirrored webcam video
//   2. Run MediaPipe Pose detection → landmarks
//   3. Run MediaPipe Body Segmentation → category mask
//   4. Smooth body alignment (adaptive LERP)
//   5. Analyze torso lighting for color grading
//   6. Draw outfit overlay (mesh warped or rectangular fallback)
//   7. Composite foreground occlusion (arms/head on top of outfit)
//   8. Draw debug skeleton + FPS counter
// ============================================================================

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useWebcam } from '@/hooks/useWebcam';
import { usePoseLandmarker } from '@/hooks/usePoseLandmarker';
import { useBodySegmenter } from '@/hooks/useBodySegmenter';
import { useAnimationLoop } from '@/hooks/useAnimationLoop';
import { computeBodyAlignment } from '@/lib/bodyAlignment';
import { smoothBodyAlignment } from '@/lib/smoothing';
import {
  drawMirroredVideo,
  drawOutfitOverlay,
  drawSkeleton,
  drawFpsCounter,
  removeWhiteBackground,
} from '@/lib/canvasRenderer';
import {
  createForegroundMask,
  compositeForground,
} from '@/lib/occlusionCompositor';
import {
  analyzeTorsoLuminance,
  applyLightingToOutfit,
  smoothLighting,
} from '@/lib/lightingMatcher';
import { OUTFITS } from '@/lib/outfits';
import { OutfitItem, BodyAlignment, LightingInfo } from '@/types';
import LoadingScreen from './LoadingScreen';
import MirrorFrame from './MirrorFrame';
import OutfitSelector from './OutfitSelector';
import ControlPanel from './ControlPanel';

export default function SmartMirror() {
  // === Refs ===
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const outfitImageRef = useRef<HTMLImageElement | HTMLCanvasElement | null>(null);
  const smoothedAlignmentRef = useRef<BodyAlignment | null>(null);
  const fpsRef = useRef<number>(0);
  const lightingRef = useRef<LightingInfo>({ avgLuminance: 128, avgR: 128, avgG: 128, avgB: 128 });
  const lightingFrameCounter = useRef<number>(0);

  // === State ===
  const [selectedOutfit, setSelectedOutfit] = useState<OutfitItem | null>(null);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [enableOcclusion, setEnableOcclusion] = useState(true);
  const [enableWarping, setEnableWarping] = useState(true);
  const [outfitLoaded, setOutfitLoaded] = useState(false);
  const [displayFps, setDisplayFps] = useState(0);

  // === Hooks ===
  const { videoRef, isReady: isWebcamReady, error: webcamError, startWebcam } = useWebcam();
  const { isReady: isPoseReady, isLoading: isPoseLoading, error: poseError, detect } = usePoseLandmarker();
  const { isReady: isSegmenterReady, segment } = useBodySegmenter();

  // === Auto-start webcam on mount ===
  useEffect(() => {
    startWebcam();
  }, [startWebcam]);

  // === Load outfit image when selection changes ===
  useEffect(() => {
    if (!selectedOutfit) {
      outfitImageRef.current = null;
      setOutfitLoaded(false);
      return;
    }

    setOutfitLoaded(false);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      // Process the image on-the-fly to remove white background if present
      const processed = removeWhiteBackground(img);
      outfitImageRef.current = processed;
      setOutfitLoaded(true);
    };
    img.onerror = () => {
      console.warn(`Failed to load outfit: ${selectedOutfit.src}`);
      outfitImageRef.current = null;
      setOutfitLoaded(false);
    };
    img.src = selectedOutfit.src;
  }, [selectedOutfit]);

  // === Main render frame callback ===
  const onFrame = useCallback(
    (timestamp: number) => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Adaptive canvas scaling: Cap width to 960px for FPS stability
      const maxWidthCap = 960;
      let targetWidth = video.videoWidth || 1280;
      let targetHeight = video.videoHeight || 720;

      if (targetWidth > maxWidthCap) {
        const scale = maxWidthCap / targetWidth;
        targetWidth = maxWidthCap;
        targetHeight = Math.round(targetHeight * scale);
      }

      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
      }

      const { width, height } = canvas;

      // ── Step 1: Draw mirrored video frame ──
      drawMirroredVideo(ctx, video, width, height);

      // ── Step 2: Run pose detection ──
      if (isPoseReady && video.readyState >= 2) {
        const landmarks = detect(video, timestamp);

        // ── Step 3: Run body segmentation (parallel with pose processing) ──
        let segMask: Uint8Array | null = null;
        if (isSegmenterReady && enableOcclusion) {
          segMask = segment(video, timestamp);
        }

        if (landmarks && landmarks.length >= 25) {
          const leftShoulder = landmarks[11];
          const rightShoulder = landmarks[12];
          
          const isShoulderVisible = leftShoulder && rightShoulder && 
                                    leftShoulder.visibility > 0.5 && 
                                    rightShoulder.visibility > 0.5;

          if (isShoulderVisible) {
            // ── Step 4: Compute and smooth body alignment ──
            const rawAlignment = computeBodyAlignment(landmarks, width, height);

            if (smoothedAlignmentRef.current) {
              smoothedAlignmentRef.current = smoothBodyAlignment(
                smoothedAlignmentRef.current,
                rawAlignment
              );
            } else {
              smoothedAlignmentRef.current = rawAlignment;
            }

            // ── Step 5: Analyze torso lighting (every 10 frames for performance) ──
            lightingFrameCounter.current++;
            if (lightingFrameCounter.current % 10 === 0) {
              const rawLighting = analyzeTorsoLuminance(ctx, smoothedAlignmentRef.current, width, height);
              lightingRef.current = smoothLighting(lightingRef.current, rawLighting, 0.15);
            }
          }

          // ── Step 6: Draw outfit overlay ──
          if (
            selectedOutfit &&
            outfitImageRef.current &&
            outfitLoaded &&
            smoothedAlignmentRef.current
          ) {
            // Apply lighting adjustment to the outfit
            const litOutfit = applyLightingToOutfit(outfitImageRef.current, lightingRef.current);

            drawOutfitOverlay(
              ctx,
              litOutfit,
              smoothedAlignmentRef.current,
              selectedOutfit,
              width,
              height,
              enableWarping
            );
          }

          // ── Step 7: Composite foreground occlusion (arms/head on top) ──
          if (segMask && enableOcclusion && selectedOutfit && outfitLoaded) {
            const maskW = video.videoWidth;
            const maskH = video.videoHeight;
            const foregroundMask = createForegroundMask(segMask, maskW, maskH);
            compositeForground(ctx, video, foregroundMask, maskW, maskH, width, height);
          }

          // ── Step 8: Draw skeleton debug ──
          if (showSkeleton) {
            drawSkeleton(ctx, landmarks, width, height);
          }
        }
      }

      // ── Step 9: Draw FPS counter ──
      drawFpsCounter(ctx, fpsRef.current, width);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isPoseReady, isSegmenterReady, detect, segment, selectedOutfit, outfitLoaded, showSkeleton, enableOcclusion, enableWarping]
  );

  // === Animation loop ===
  const bothReady = isWebcamReady && isPoseReady;
  const { fps: currentFps } = useAnimationLoop(onFrame, bothReady);

  // Sync FPS to ref for canvas drawing and to state for UI display
  useEffect(() => {
    fpsRef.current = currentFps;
    setDisplayFps(currentFps);
  }, [currentFps]);

  // === Loading state ===
  const isLoading = !isWebcamReady || isPoseLoading || !isPoseReady;
  const loadingProgress = !isWebcamReady
    ? 'Starting camera...'
    : isPoseLoading
    ? 'Loading AI Pose Engine...'
    : !isPoseReady
    ? 'Preparing pose detection...'
    : '';

  // === Error handling ===
  const error = webcamError || poseError;

  return (
    <div className="smart-mirror-container">
      {/* Hidden video element — feeds the canvas */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="hidden-video"
      />

      {/* Main canvas — fullscreen */}
      <canvas
        ref={canvasRef}
        className="mirror-canvas"
      />

      {/* HUD frame overlay */}
      <MirrorFrame />

      {/* Left panel — outfit selector + controls */}
      <div className="left-panel">
        <OutfitSelector
          outfits={OUTFITS}
          selectedOutfit={selectedOutfit}
          onSelect={setSelectedOutfit}
        />

        <ControlPanel
          isWebcamReady={isWebcamReady}
          isPoseReady={isPoseReady}
          isSegmenterReady={isSegmenterReady}
          showSkeleton={showSkeleton}
          enableOcclusion={enableOcclusion}
          enableWarping={enableWarping}
          fps={displayFps}
          onToggleSkeleton={() => setShowSkeleton((prev) => !prev)}
          onToggleOcclusion={() => setEnableOcclusion((prev) => !prev)}
          onToggleWarping={() => setEnableWarping((prev) => !prev)}
          canvasRef={canvasRef as React.RefObject<HTMLCanvasElement>}
        />
      </div>

      {/* Loading screen overlay */}
      <LoadingScreen isVisible={isLoading} progress={loadingProgress} />

      {/* Error overlay */}
      {error && (
        <div className="error-overlay">
          <div className="error-card">
            <div className="error-icon">⚠️</div>
            <h2 className="error-title">Connection Error</h2>
            <p className="error-message">{error}</p>
            <button
              className="error-retry-btn"
              onClick={() => window.location.reload()}
            >
              Retry
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
