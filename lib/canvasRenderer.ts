// ============================================================================
// Canvas Renderer — All drawing operations for the smart mirror
// ============================================================================

import {
  LandmarkPoint,
  BodyAlignment,
  OutfitItem,
  PoseLandmark,
  POSE_CONNECTIONS,
} from '@/types';
import {
  getSourceMesh,
  createDestinationMesh,
  drawWarpedMesh,
} from '@/lib/meshWarping';

/**
 * Draw the webcam video frame onto canvas with horizontal mirror flip.
 * 
 * The mirror effect is achieved by:
 * 1. Translating the canvas origin to the right edge
 * 2. Scaling x by -1 (flip horizontally)
 * 3. Drawing the video at (0, 0) — which is now the right edge
 * 
 * This makes the user see themselves as in a real mirror.
 */
export function drawMirroredVideo(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  width: number,
  height: number
): void {
  ctx.save();
  ctx.translate(width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, width, height);
  ctx.restore();
}

/**
 * Draw outfit PNG overlay on the body.
 * 
 * Coordinate system:
 * - shoulderMidpoint is in normalized coords (0-1)
 * - We convert to pixel coords for canvas drawing
 * - Outfit is centered on the shoulder midpoint with offsetY adjustment
 * - Outfit width = shoulderWidth * scaleMultiplier
 * - Outfit height maintains original aspect ratio
 * - Rotation is applied around the outfit center
 * 
 * Mirror correction:
 * - Since the video is mirrored, landmark x-coords are already in mirrored space
 * - We mirror the x coordinate: mirroredX = 1.0 - normalizedX
 */
/**
 * Processes an image on-the-fly using a border-based flood-fill (BFS) 
 * to turn a solid white background transparent while keeping internal white colors intact.
 */
export function removeWhiteBackground(image: HTMLImageElement): HTMLCanvasElement {
  const tempCanvas = document.createElement('canvas');
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  
  tempCanvas.width = width;
  tempCanvas.height = height;
  
  const ctx = tempCanvas.getContext('2d');
  if (!ctx) return tempCanvas;

  ctx.drawImage(image, 0, 0);

  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  // Helper to get index
  const getIndex = (x: number, y: number) => (y * width + x) * 4;

  // Threshold for "white" (opaque white pixels)
  const isWhite = (x: number, y: number) => {
    const idx = getIndex(x, y);
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const a = data[idx + 3];
    return r > 240 && g > 240 && b > 240 && a > 200;
  };

  // Visited array to keep track of filled pixels
  const visited = new Uint8Array(width * height);
  const queue: [number, number][] = [];

  // Add border pixels as starting points
  for (let x = 0; x < width; x++) {
    if (isWhite(x, 0)) {
      queue.push([x, 0]);
      visited[0 * width + x] = 1;
    }
    if (isWhite(x, height - 1)) {
      queue.push([x, height - 1]);
      visited[(height - 1) * width + x] = 1;
    }
  }
  for (let y = 0; y < height; y++) {
    if (isWhite(0, y)) {
      queue.push([0, y]);
      visited[y * width + 0] = 1;
    }
    if (isWhite(width - 1, y)) {
      queue.push([width - 1, y]);
      visited[y * width + (width - 1)] = 1;
    }
  }

  // BFS flood fill
  let head = 0;
  while (head < queue.length) {
    const [cx, cy] = queue[head++];

    // Make this background pixel transparent
    const idx = getIndex(cx, cy);
    data[idx + 3] = 0; // alpha = 0

    // Neighbors (4-connectivity)
    const neighbors = [
      [cx + 1, cy],
      [cx - 1, cy],
      [cx, cy + 1],
      [cx, cy - 1]
    ];

    for (const [nx, ny] of neighbors) {
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const vIdx = ny * width + nx;
        if (!visited[vIdx] && isWhite(nx, ny)) {
          visited[vIdx] = 1;
          queue.push([nx, ny]);
        }
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return tempCanvas;
}

export function drawOutfitOverlay(
  ctx: CanvasRenderingContext2D,
  outfitImage: HTMLImageElement | HTMLCanvasElement,
  alignment: BodyAlignment,
  outfitConfig: OutfitItem,
  canvasWidth: number,
  canvasHeight: number,
  enableWarping: boolean = false
): void {
  if (outfitImage instanceof HTMLImageElement) {
    if (!outfitImage.complete || outfitImage.naturalWidth === 0) return;
  }

  const naturalWidth = outfitImage instanceof HTMLImageElement ? outfitImage.naturalWidth : outfitImage.width;
  const naturalHeight = outfitImage instanceof HTMLImageElement ? outfitImage.naturalHeight : outfitImage.height;

  if (naturalWidth === 0 || naturalHeight === 0) return;

  // === Mesh Warping Mode ===
  if (enableWarping) {
    const srcMesh = getSourceMesh();
    const dstMesh = createDestinationMesh(alignment, outfitConfig, canvasWidth, canvasHeight);
    drawWarpedMesh(ctx, outfitImage, srcMesh, dstMesh, naturalWidth, naturalHeight);
    return;
  }

  // === Fallback: Simple rectangular overlay (original behavior) ===
  // Mirror the x coordinate for correct overlay positioning
  const mirroredX = 1.0 - alignment.shoulderMidpoint.x;
  
  // Convert normalized shoulder midpoint to pixel coordinates
  const centerX = mirroredX * canvasWidth;
  const centerY = alignment.shoulderMidpoint.y * canvasHeight;

  // Calculate outfit dimensions
  const outfitWidth = alignment.shoulderWidth * outfitConfig.scaleMultiplier;
  const aspectRatio = naturalHeight / naturalWidth;

  // Calculate vertical scaling to simulate 3D perspective / torso foreshortening.
  const ratio = alignment.torsoHeight / (alignment.shoulderWidth || 1);
  const standardRatio = 1.35;
  const scaleY = Math.max(0.65, Math.min(1.1, ratio / standardRatio));
  const outfitHeight = outfitWidth * aspectRatio * scaleY;

  // Apply vertical offset (in pixels)
  const offsetYPx = outfitConfig.offsetY * canvasHeight;

  // Draw position (top-left corner of outfit, centered on body)
  const drawX = centerX - outfitWidth / 2;
  const drawY = centerY + offsetYPx;

  // Mirror the rotation angle (negate it since video is flipped)
  const mirroredRotation = -alignment.rotationAngle;

  ctx.save();

  // Natural rotation: Pivot around the collar/neck area
  const pivotY = centerY + offsetYPx + outfitHeight * 0.12;
  ctx.translate(centerX, pivotY);
  ctx.rotate(mirroredRotation);
  ctx.translate(-centerX, -pivotY);

  // Draw the outfit image
  ctx.drawImage(outfitImage, drawX, drawY, outfitWidth, outfitHeight);

  ctx.restore();
}

/**
 * Draw the pose skeleton for debug visualization.
 * Renders landmark dots and connection lines with neon glow effect.
 */
export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  landmarks: LandmarkPoint[],
  width: number,
  height: number
): void {
  // Neon cyan glow effect
  ctx.shadowColor = '#00f5ff';
  ctx.shadowBlur = 10;

  // Draw connections
  ctx.strokeStyle = 'rgba(0, 245, 255, 0.6)';
  ctx.lineWidth = 2;

  for (const [startIdx, endIdx] of POSE_CONNECTIONS) {
    const start = landmarks[startIdx];
    const end = landmarks[endIdx];

    if (!start || !end) continue;
    if (start.visibility < 0.5 || end.visibility < 0.5) continue;

    // Mirror x coordinates for the mirrored video
    const startX = (1.0 - start.x) * width;
    const startY = start.y * height;
    const endX = (1.0 - end.x) * width;
    const endY = end.y * height;

    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
  }

  // Draw landmark dots
  const keyLandmarks = [
    PoseLandmark.NOSE,
    PoseLandmark.LEFT_SHOULDER,
    PoseLandmark.RIGHT_SHOULDER,
    PoseLandmark.LEFT_ELBOW,
    PoseLandmark.RIGHT_ELBOW,
    PoseLandmark.LEFT_WRIST,
    PoseLandmark.RIGHT_WRIST,
    PoseLandmark.LEFT_HIP,
    PoseLandmark.RIGHT_HIP,
    PoseLandmark.LEFT_KNEE,
    PoseLandmark.RIGHT_KNEE,
    PoseLandmark.LEFT_ANKLE,
    PoseLandmark.RIGHT_ANKLE,
  ];

  for (const idx of keyLandmarks) {
    const lm = landmarks[idx];
    if (!lm || lm.visibility < 0.5) continue;

    const px = (1.0 - lm.x) * width;
    const py = lm.y * height;

    // Outer glow ring
    ctx.fillStyle = 'rgba(0, 245, 255, 0.3)';
    ctx.beginPath();
    ctx.arc(px, py, 8, 0, Math.PI * 2);
    ctx.fill();

    // Inner solid dot
    ctx.fillStyle = '#00f5ff';
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Reset shadow
  ctx.shadowBlur = 0;
}

/**
 * Draw FPS counter in the top-right corner.
 */
export function drawFpsCounter(
  ctx: CanvasRenderingContext2D,
  fps: number,
  canvasWidth: number
): void {
  const text = `${Math.round(fps)} FPS`;
  
  ctx.save();
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'right';
  
  // Background pill
  const metrics = ctx.measureText(text);
  const padding = 8;
  const pillW = metrics.width + padding * 2;
  const pillH = 24;
  const pillX = canvasWidth - 16 - pillW;
  const pillY = 16;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.beginPath();
  ctx.roundRect(pillX, pillY, pillW, pillH, 6);
  ctx.fill();

  // Border
  ctx.strokeStyle = fps >= 25 ? 'rgba(0, 245, 255, 0.5)' : 'rgba(255, 100, 100, 0.5)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Text
  ctx.fillStyle = fps >= 25 ? '#00f5ff' : '#ff6464';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, pillX + pillW / 2, pillY + pillH / 2);
  
  ctx.restore();
}
