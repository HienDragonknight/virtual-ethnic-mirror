'use client';
// ============================================================================
// SmartMirror — Production render pipeline (optimized)
//
// Key optimizations vs previous version:
//   ① Lighting-adjusted outfit canvas is CACHED in a ref — not recreated every frame
//   ② Lighting only invalidates cache when luminance shifts > 8 units
//   ③ Occlusion mask is throttled to every 3rd frame (imperceptible at 30fps)
//   ④ Auto-fit computes outfit scale/position from REAL body measurements each frame
//   ⑤ Nose landmark used to anchor collar accurately to neck area
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
import { drawSkeletonDrivenOutfit } from '@/lib/skeletonOutfit';
import {
  updateForegroundMask,
  compositeForeground,
} from '@/lib/occlusionCompositor';
import {
  analyzeTorsoLuminance,
  applyLightingToOutfit,
  smoothLighting,
} from '@/lib/lightingMatcher';
import { OUTFITS } from '@/lib/outfits';
import { OutfitItem, BodyAlignment, LightingInfo, LandmarkPoint } from '@/types';
import LoadingScreen from './LoadingScreen';
import MirrorFrame from './MirrorFrame';
import OutfitSelector from './OutfitSelector';
import ControlPanel from './ControlPanel';


export default function SmartMirror() {
  // === Refs ===
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Raw outfit (after bg removal) — loaded once per selection
  const outfitSourceRef = useRef<HTMLCanvasElement | null>(null);
  // Lighting-adjusted outfit — cached, only rebuilt when lighting shifts significantly
  const litOutfitCacheRef = useRef<HTMLCanvasElement | null>(null);
  const lastLitLuminanceRef = useRef<number>(-999);

  const smoothedAlignmentRef = useRef<BodyAlignment | null>(null);
  const fpsRef = useRef<number>(0);
  const lightingRef = useRef<LightingInfo>({ avgLuminance: 128, avgR: 128, avgG: 128, avgB: 128 });

  // Throttle refs
  const lightingFrameCounter = useRef<number>(0);
  const occlusionFrameCounter = useRef<number>(0);
  // Flag indicating if a foreground mask is loaded and available
  const hasForegroundMaskRef = useRef<boolean>(false);

  // === State ===
  const [selectedOutfit, setSelectedOutfit] = useState<OutfitItem | null>(null);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [enableOcclusion, setEnableOcclusion] = useState(true);
  const [enableWarping, setEnableWarping] = useState(false);
  const [enableSkeletonDriven, setEnableSkeletonDriven] = useState(true);
  const [outfitLoaded, setOutfitLoaded] = useState(false);
  const [displayFps, setDisplayFps] = useState(0);

  // Keep latest landmarks accessible inside the frame callback without stale closure
  const latestLandmarksRef = useRef<LandmarkPoint[] | null>(null);

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
      outfitSourceRef.current = null;
      litOutfitCacheRef.current = null;
      lastLitLuminanceRef.current = -999;
      setOutfitLoaded(false);
      return;
    }

    setOutfitLoaded(false);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      // Process once: remove white background, store as source canvas
      const processed = removeWhiteBackground(img);
      outfitSourceRef.current = processed;
      // Invalidate lighting cache
      litOutfitCacheRef.current = null;
      lastLitLuminanceRef.current = -999;
      setOutfitLoaded(true);
    };
    img.onerror = () => {
      console.warn(`Failed to load outfit: ${selectedOutfit.src}`);
      outfitSourceRef.current = null;
      litOutfitCacheRef.current = null;
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

      // ── Adaptive canvas scaling ──
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

      if (!isPoseReady || video.readyState < 2) {
        drawFpsCounter(ctx, fpsRef.current, width);
        return;
      }

      // ── Step 2: Pose detection ──
      const landmarks = detect(video, timestamp);

      // ── Step 3: Body segmentation (throttled to every 3rd frame) ──
      occlusionFrameCounter.current++;
      const doSegmentation = isSegmenterReady && enableOcclusion && (occlusionFrameCounter.current % 3 === 0);
      if (doSegmentation) {
        const segMask = segment(video, timestamp);
        if (segMask) {
          const maskW = video.videoWidth;
          const maskH = video.videoHeight;
          updateForegroundMask(segMask, maskW, maskH);
          hasForegroundMaskRef.current = true;
        }
      }

      if (landmarks && landmarks.length >= 25) {
        const leftShoulder  = landmarks[11];
        const rightShoulder = landmarks[12];
        const nose          = landmarks[0];

        const isShoulderVisible =
          leftShoulder && rightShoulder &&
          leftShoulder.visibility > 0.4 &&
          rightShoulder.visibility > 0.4;

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

          // ── Step 5: Lighting analysis (every 15 frames) ──
          lightingFrameCounter.current++;
          if (lightingFrameCounter.current % 15 === 0) {
            const rawLighting = analyzeTorsoLuminance(ctx, smoothedAlignmentRef.current, width, height);
            lightingRef.current = smoothLighting(lightingRef.current, rawLighting, 0.12);
          }
        }

        // ── Step 6: Draw outfit ──
        if (outfitSourceRef.current && outfitLoaded && smoothedAlignmentRef.current) {
          const alignment = smoothedAlignmentRef.current;

          // Rebuild lighting cache only when luminance shifts > 8 units
          const currentLum = lightingRef.current.avgLuminance;
          if (!litOutfitCacheRef.current || Math.abs(currentLum - lastLitLuminanceRef.current) > 8) {
            litOutfitCacheRef.current = applyLightingToOutfit(outfitSourceRef.current, lightingRef.current);
            lastLitLuminanceRef.current = currentLum;
          }

          const litOutfit = litOutfitCacheRef.current;

          // Store latest valid landmarks for skeleton rendering
          if (landmarks.length >= 29) {
            latestLandmarksRef.current = landmarks;
          }

          // Render mode: Skeleton-driven (full body) > Mesh warp > Rectangular
          if (enableSkeletonDriven && latestLandmarksRef.current) {
            drawSkeletonDrivenOutfit(
              ctx,
              litOutfit,
              latestLandmarksRef.current,
              width,
              height
            );
          } else {
            // Auto-fit collar position using nose landmark
            let collarOffsetY = -0.08;
            if (nose && nose.visibility > 0.4) {
              const neckGap = alignment.shoulderMidpoint.y - nose.y;
              collarOffsetY = -(neckGap * 0.65);
            }
            const autoFitConfig: OutfitItem = {
              ...(selectedOutfit!),
              scaleMultiplier: 2.2,
              offsetY: collarOffsetY,
            };
            drawOutfitOverlay(ctx, litOutfit, alignment, autoFitConfig, width, height, enableWarping);
          }
        }


        // ── Step 7: Composite foreground occlusion ──
        if (
          hasForegroundMaskRef.current &&
          enableOcclusion &&
          selectedOutfit &&
          outfitLoaded
        ) {
          compositeForeground(
            ctx,
            video,
            width,
            height
          );
        }

        // ── Step 8: Skeleton debug ──
        if (showSkeleton) {
          drawSkeleton(ctx, landmarks, width, height);
        }
      }

      // ── Step 9: FPS counter ──
      drawFpsCounter(ctx, fpsRef.current, width);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isPoseReady, isSegmenterReady, detect, segment, selectedOutfit, outfitLoaded, showSkeleton, enableOcclusion, enableWarping]
  );

  // === Animation loop ===
  const bothReady = isWebcamReady && isPoseReady;
  const { fps: currentFps } = useAnimationLoop(onFrame, bothReady);

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

  const error = webcamError || poseError;

  return (
    <div className="smart-mirror-container">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="hidden-video"
      />

      <canvas
        ref={canvasRef}
        className="mirror-canvas"
      />

      <MirrorFrame />

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
          enableSkeletonDriven={enableSkeletonDriven}
          fps={displayFps}
          onToggleSkeleton={() => setShowSkeleton((prev) => !prev)}
          onToggleOcclusion={() => setEnableOcclusion((prev) => !prev)}
          onToggleWarping={() => setEnableWarping((prev) => !prev)}
          onToggleSkeletonDriven={() => setEnableSkeletonDriven((prev) => !prev)}
          canvasRef={canvasRef as React.RefObject<HTMLCanvasElement>}
        />
      </div>

      <LoadingScreen isVisible={isLoading} progress={loadingProgress} />

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
