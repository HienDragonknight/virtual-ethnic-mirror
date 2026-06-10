// ============================================================================
// Occlusion Compositor — 3-layer rendering with body segmentation masks
//
// Rendering pipeline:
//   Layer 1: Mirrored webcam video (background)
//   Layer 2: Outfit overlay (middle)
//   Layer 3: Foreground body parts (arms, head) extracted from video
//
// The category mask from MediaPipe tells us which pixels belong to:
//   0 = background, 1 = hair, 2 = body-skin, 3 = face-skin, 4 = clothes, 5 = others
//
// We extract categories 1 (hair), 2 (body-skin/arms), and 3 (face-skin)
// as the "foreground" that should appear IN FRONT of the outfit overlay.
// ============================================================================

// Categories that should appear IN FRONT of the outfit
const FOREGROUND_CATEGORIES = new Set([1, 2, 3]); // hair, body-skin, face-skin

/**
 * Create a foreground alpha mask from the category mask.
 * Pixels belonging to foreground categories get alpha=255, others get alpha=0.
 * 
 * Applies a simple edge softening pass to avoid hard cut-out edges.
 * 
 * @param categoryMask - Uint8Array where each element is the category index (0-5)
 * @param width - Width of the mask (matches video dimensions)
 * @param height - Height of the mask (matches video dimensions)
 * @returns Uint8Array alpha mask (0 or 255 per pixel)
 */
export function createForegroundMask(
  categoryMask: Uint8Array,
  width: number,
  height: number
): Uint8Array {
  const mask = new Uint8Array(width * height);

  // Pass 1: Binary classification
  for (let i = 0; i < categoryMask.length; i++) {
    mask[i] = FOREGROUND_CATEGORIES.has(categoryMask[i]) ? 255 : 0;
  }

  // Pass 2: Edge softening via 3x3 box blur on the mask edges
  // This prevents harsh cut-out boundaries between foreground and outfit
  const softened = new Uint8Array(mask.length);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const center = mask[idx];
      
      // Only process edge pixels (where neighboring pixels differ)
      const hasEdge = (
        mask[idx - 1] !== center ||
        mask[idx + 1] !== center ||
        mask[idx - width] !== center ||
        mask[idx + width] !== center
      );

      if (hasEdge) {
        // 3x3 average for edge softening
        let sum = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            sum += mask[(y + dy) * width + (x + dx)];
          }
        }
        softened[idx] = Math.round(sum / 9);
      } else {
        softened[idx] = center;
      }
    }
  }

  return softened;
}

/**
 * Composite the foreground body parts on top of the outfit overlay.
 * 
 * This function takes the already-rendered canvas (video + outfit) and
 * paints the foreground body pixels from the original video frame on top,
 * creating the illusion that arms/head are in front of the clothing.
 * 
 * The mask coordinates are in VIDEO space, but the canvas may be at a different
 * resolution (due to adaptive scaling). We handle this by scaling the mask sampling.
 * 
 * @param ctx - Canvas 2D context (already has video + outfit drawn)
 * @param videoElement - The raw webcam video element (source for foreground pixels)
 * @param foregroundMask - Alpha mask from createForegroundMask()
 * @param maskWidth - Width of the mask (video dimensions)
 * @param maskHeight - Height of the mask (video dimensions)
 * @param canvasWidth - Width of the output canvas
 * @param canvasHeight - Height of the output canvas
 */
export function compositeForground(
  ctx: CanvasRenderingContext2D,
  videoElement: HTMLVideoElement,
  foregroundMask: Uint8Array,
  maskWidth: number,
  maskHeight: number,
  canvasWidth: number,
  canvasHeight: number
): void {
  // Step 1: Draw the video onto a temporary canvas to get raw pixel data
  // We draw it mirrored (same as the main canvas) so coordinates align
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = canvasWidth;
  tempCanvas.height = canvasHeight;
  const tempCtx = tempCanvas.getContext('2d');
  if (!tempCtx) return;

  // Draw mirrored video
  tempCtx.save();
  tempCtx.translate(canvasWidth, 0);
  tempCtx.scale(-1, 1);
  tempCtx.drawImage(videoElement, 0, 0, canvasWidth, canvasHeight);
  tempCtx.restore();

  // Step 2: Get pixel data from the mirrored video
  const videoPixels = tempCtx.getImageData(0, 0, canvasWidth, canvasHeight);
  const videoData = videoPixels.data;

  // Step 3: Get current canvas pixel data (video + outfit already composited)
  const canvasPixels = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
  const canvasData = canvasPixels.data;

  // Step 4: Scale factors from canvas space to mask space
  const scaleX = maskWidth / canvasWidth;
  const scaleY = maskHeight / canvasHeight;

  // Step 5: For each canvas pixel, if the corresponding mask pixel is foreground,
  // replace the canvas pixel with the video pixel (arm/head on top of outfit)
  for (let cy = 0; cy < canvasHeight; cy++) {
    // Map canvas Y to mask Y
    const my = Math.floor(cy * scaleY);
    if (my >= maskHeight) continue;

    for (let cx = 0; cx < canvasWidth; cx++) {
      // Map canvas X to mask X (mirror the x coordinate since video is flipped)
      const mirroredCx = canvasWidth - 1 - cx;
      const mx = Math.floor(mirroredCx * scaleX);
      if (mx >= maskWidth) continue;

      const maskAlpha = foregroundMask[my * maskWidth + mx];
      if (maskAlpha === 0) continue; // Not foreground, skip

      const canvasIdx = (cy * canvasWidth + cx) * 4;

      if (maskAlpha === 255) {
        // Fully foreground — replace with video pixel
        canvasData[canvasIdx]     = videoData[canvasIdx];
        canvasData[canvasIdx + 1] = videoData[canvasIdx + 1];
        canvasData[canvasIdx + 2] = videoData[canvasIdx + 2];
        canvasData[canvasIdx + 3] = 255;
      } else {
        // Edge pixel — alpha blend for soft transition
        const alpha = maskAlpha / 255;
        const invAlpha = 1 - alpha;
        canvasData[canvasIdx]     = Math.round(videoData[canvasIdx]     * alpha + canvasData[canvasIdx]     * invAlpha);
        canvasData[canvasIdx + 1] = Math.round(videoData[canvasIdx + 1] * alpha + canvasData[canvasIdx + 1] * invAlpha);
        canvasData[canvasIdx + 2] = Math.round(videoData[canvasIdx + 2] * alpha + canvasData[canvasIdx + 2] * invAlpha);
        canvasData[canvasIdx + 3] = 255;
      }
    }
  }

  // Step 6: Write the composited result back to canvas
  ctx.putImageData(canvasPixels, 0, 0);
}
