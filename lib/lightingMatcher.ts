// ============================================================================
// Lighting Matcher — Adaptive luminance analysis and outfit color grading
//
// Analyzes the webcam's torso area to determine ambient lighting conditions,
// then adjusts the outfit overlay's brightness/contrast to match.
//
// This prevents the outfit from looking like a "floating sticker" by ensuring
// it shares the same lighting characteristics as the real scene.
//
// Luminance formula (BT.601): L = 0.299*R + 0.587*G + 0.114*B
// ============================================================================

import { LightingInfo, BodyAlignment } from '@/types';

/**
 * Analyze the average luminance and color of the torso area in the webcam frame.
 * 
 * Samples a rectangular region around the shoulder-to-hip area.
 * The region is sampled at a low resolution (every 4th pixel) for performance.
 * 
 * @param ctx - Canvas 2D context with the mirrored video already drawn
 * @param alignment - Smoothed body alignment (provides torso bounding box)
 * @param canvasWidth - Canvas width
 * @param canvasHeight - Canvas height
 * @returns LightingInfo with average luminance and RGB channels
 */
export function analyzeTorsoLuminance(
  ctx: CanvasRenderingContext2D,
  alignment: BodyAlignment,
  canvasWidth: number,
  canvasHeight: number
): LightingInfo {
  // Define the torso sampling region (in pixel space)
  const mirroredX = 1.0 - alignment.shoulderMidpoint.x;
  const centerX = mirroredX * canvasWidth;
  const centerY = alignment.shoulderMidpoint.y * canvasHeight;
  const halfW = alignment.shoulderWidth * 0.4; // Sample 80% of shoulder width
  const torsoH = alignment.torsoHeight * 0.8;

  const x0 = Math.max(0, Math.floor(centerX - halfW));
  const y0 = Math.max(0, Math.floor(centerY));
  const x1 = Math.min(canvasWidth, Math.ceil(centerX + halfW));
  const y1 = Math.min(canvasHeight, Math.ceil(centerY + torsoH));

  const regionW = x1 - x0;
  const regionH = y1 - y0;

  if (regionW <= 0 || regionH <= 0) {
    return { avgLuminance: 128, avgR: 128, avgG: 128, avgB: 128 };
  }

  // Get pixel data from the torso region
  let imageData: ImageData;
  try {
    imageData = ctx.getImageData(x0, y0, regionW, regionH);
  } catch {
    return { avgLuminance: 128, avgR: 128, avgG: 128, avgB: 128 };
  }

  const data = imageData.data;
  let totalR = 0, totalG = 0, totalB = 0;
  let count = 0;

  // Sample every 4th pixel for performance (still accurate enough)
  const step = 4;
  for (let i = 0; i < data.length; i += 4 * step) {
    totalR += data[i];
    totalG += data[i + 1];
    totalB += data[i + 2];
    count++;
  }

  if (count === 0) {
    return { avgLuminance: 128, avgR: 128, avgG: 128, avgB: 128 };
  }

  const avgR = totalR / count;
  const avgG = totalG / count;
  const avgB = totalB / count;
  const avgLuminance = 0.299 * avgR + 0.587 * avgG + 0.114 * avgB;

  return { avgLuminance, avgR, avgG, avgB };
}

/**
 * Apply lighting adjustment to an outfit canvas to match the webcam's ambient lighting.
 * 
 * The strategy:
 * 1. Compare the webcam's torso luminance to a reference value (128 = neutral)
 * 2. Compute a brightness adjustment factor
 * 3. Apply it to the outfit image using canvas globalCompositeOperation
 * 
 * We use the "multiply" blend mode for darkening and "screen" for brightening.
 * This is much faster than per-pixel manipulation and produces natural results.
 * 
 * @param outfitCanvas - The outfit canvas/image to adjust
 * @param lighting - Lighting analysis from the webcam
 * @returns A new canvas with the adjusted outfit
 */
export function applyLightingToOutfit(
  outfitCanvas: HTMLImageElement | HTMLCanvasElement,
  lighting: LightingInfo
): HTMLCanvasElement {
  const w = outfitCanvas instanceof HTMLImageElement ? outfitCanvas.naturalWidth : outfitCanvas.width;
  const h = outfitCanvas instanceof HTMLImageElement ? outfitCanvas.naturalHeight : outfitCanvas.height;

  const resultCanvas = document.createElement('canvas');
  resultCanvas.width = w;
  resultCanvas.height = h;
  const ctx = resultCanvas.getContext('2d');
  if (!ctx) return resultCanvas;

  // Draw original outfit
  ctx.drawImage(outfitCanvas, 0, 0);

  // Reference luminance (studio lighting, what the outfit texture was shot in)
  const referenceLuminance = 140;
  
  // Calculate brightness ratio (how much darker/brighter the scene is)
  const ratio = lighting.avgLuminance / referenceLuminance;
  
  // Clamp the adjustment to avoid extreme distortion
  const clampedRatio = Math.max(0.5, Math.min(1.4, ratio));

  if (clampedRatio < 0.95) {
    // Scene is darker → darken the outfit using 'multiply' blend
    const darkness = clampedRatio;
    const gray = Math.round(darkness * 255);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = `rgb(${gray}, ${gray}, ${gray})`;
    ctx.fillRect(0, 0, w, h);
    
    // Restore alpha channel (multiply affects it)
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(outfitCanvas, 0, 0);
  } else if (clampedRatio > 1.05) {
    // Scene is brighter → brighten the outfit using 'screen' blend
    const brightness = 1 - (1 / clampedRatio);
    const gray = Math.round(brightness * 255);
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = `rgb(${gray}, ${gray}, ${gray})`;
    ctx.fillRect(0, 0, w, h);
    
    // Restore alpha channel
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(outfitCanvas, 0, 0);
  }

  // Add subtle color temperature matching
  // If the scene has a warm/cool tint, apply a very subtle overlay
  const avgScene = (lighting.avgR + lighting.avgG + lighting.avgB) / 3;
  if (avgScene > 10) {
    const rBias = (lighting.avgR / avgScene - 1) * 0.1; // Very subtle
    const gBias = (lighting.avgG / avgScene - 1) * 0.1;
    const bBias = (lighting.avgB / avgScene - 1) * 0.1;

    if (Math.abs(rBias) > 0.02 || Math.abs(gBias) > 0.02 || Math.abs(bBias) > 0.02) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.08; // Very light tint
      const tintR = Math.round(128 + rBias * 255);
      const tintG = Math.round(128 + gBias * 255);
      const tintB = Math.round(128 + bBias * 255);
      ctx.fillStyle = `rgb(${Math.max(0, Math.min(255, tintR))}, ${Math.max(0, Math.min(255, tintG))}, ${Math.max(0, Math.min(255, tintB))})`;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;

      // Restore alpha channel
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(outfitCanvas, 0, 0);
    }
  }

  ctx.globalCompositeOperation = 'source-over';
  return resultCanvas;
}

/**
 * Smooth lighting info over time to prevent flickering.
 * Uses exponential moving average.
 */
export function smoothLighting(
  prev: LightingInfo,
  next: LightingInfo,
  factor: number = 0.1
): LightingInfo {
  return {
    avgLuminance: prev.avgLuminance + (next.avgLuminance - prev.avgLuminance) * factor,
    avgR: prev.avgR + (next.avgR - prev.avgR) * factor,
    avgG: prev.avgG + (next.avgG - prev.avgG) * factor,
    avgB: prev.avgB + (next.avgB - prev.avgB) * factor,
  };
}
