// ============================================================================
// Mesh Warping Engine — Triangle mesh deformation for outfit rendering
//
// Instead of drawing the outfit as a flat rectangle, we divide it into
// a grid of triangles. Each triangle vertex is mapped from "source" coordinates
// (uniform grid on the outfit texture) to "destination" coordinates
// (positions derived from body landmarks).
//
// When the user moves, the destination vertices follow the body landmarks,
// causing the outfit image to warp/deform naturally.
//
// Grid layout (COLS=5, ROWS=5 = 16 quads = 32 triangles):
//
//   src (uniform grid)          dst (landmark-driven)
//   ┌──┬──┬──┬──┐              ╭──╮──╮──╮──╮
//   │  │  │  │  │      →       │   ╲  │  ╱  │    (shoulders curve)
//   ├──┼──┼──┼──┤              ├──╮──┼──╮──┤
//   │  │  │  │  │      →       │   │  │  │   │    (torso follows)
//   ├──┼──┼──┼──┤              ├──╯──┼──╯──┤
//   │  │  │  │  │      →       │   ╱  │  ╲  │    (hips curve)
//   └──┴──┴──┴──┘              ╰──╯──╯──╯──╯
// ============================================================================

import { Point2D, MeshGrid, BodyAlignment, OutfitItem } from '@/types';

// Grid resolution — more divisions = smoother deformation but higher CPU cost
const MESH_COLS = 5;
const MESH_ROWS = 6;

/**
 * Create the source mesh: a uniform grid in texture space (0-1 normalized).
 * This represents where each vertex maps to on the outfit image.
 */
export function createSourceMesh(): MeshGrid {
  const grid: MeshGrid = [];
  for (let row = 0; row <= MESH_ROWS; row++) {
    const rowPoints: Point2D[] = [];
    for (let col = 0; col <= MESH_COLS; col++) {
      rowPoints.push({
        x: col / MESH_COLS,
        y: row / MESH_ROWS,
      });
    }
    grid.push(rowPoints);
  }
  return grid;
}

/**
 * Create the destination mesh: vertices positioned according to body landmarks.
 * 
 * The mesh stretches from shoulder line to hip line, with lateral extension
 * controlled by the outfit's scaleMultiplier.
 * 
 * Key control points:
 * - Top-left: left shoulder (extended outward by scale factor)
 * - Top-right: right shoulder (extended outward by scale factor)  
 * - Bottom-left: left hip (extended outward)
 * - Bottom-right: right hip (extended outward)
 * - Intermediate rows: linearly interpolated between shoulders and hips
 * 
 * @param alignment - Smoothed body alignment with pixel-space landmark positions
 * @param outfitConfig - Outfit configuration (scaleMultiplier, offsetY)
 * @param canvasWidth - Canvas width for coordinate calculations
 * @param canvasHeight - Canvas height for coordinate calculations
 */
export function createDestinationMesh(
  alignment: BodyAlignment,
  outfitConfig: OutfitItem,
  canvasWidth: number,
  canvasHeight: number
): MeshGrid {
  // Mirror the landmark X coordinates (video is flipped)
  const lsPx = { x: canvasWidth - alignment.leftShoulderPx.x, y: alignment.leftShoulderPx.y };
  const rsPx = { x: canvasWidth - alignment.rightShoulderPx.x, y: alignment.rightShoulderPx.y };
  const lhPx = { x: canvasWidth - alignment.leftHipPx.x, y: alignment.leftHipPx.y };
  const rhPx = { x: canvasWidth - alignment.rightHipPx.x, y: alignment.rightHipPx.y };

  // Calculate the extension factor: how far beyond the landmarks the outfit extends
  // scaleMultiplier of 2.3 means the outfit is 2.3x the shoulder width
  const shoulderWidth = Math.abs(rsPx.x - lsPx.x);
  const totalWidth = shoulderWidth * outfitConfig.scaleMultiplier;
  const extensionX = (totalWidth - shoulderWidth) / 2;

  // Vertical offset
  const offsetYPx = outfitConfig.offsetY * canvasHeight;

  // Hip width extension (slightly narrower than shoulders for natural silhouette)
  const hipWidth = Math.abs(rhPx.x - lhPx.x);
  const hipTotalWidth = hipWidth * outfitConfig.scaleMultiplier * 0.9;
  const hipExtensionX = (hipTotalWidth - hipWidth) / 2;

  // Define the 4 corner anchor points of the outfit
  // Left side = visually left on screen = smaller X
  const topLeft     = { x: Math.min(lsPx.x, rsPx.x) - extensionX,    y: Math.min(lsPx.y, rsPx.y) + offsetYPx };
  const topRight    = { x: Math.max(lsPx.x, rsPx.x) + extensionX,    y: Math.min(lsPx.y, rsPx.y) + offsetYPx };
  const bottomLeft  = { x: Math.min(lhPx.x, rhPx.x) - hipExtensionX, y: Math.max(lhPx.y, rhPx.y) + offsetYPx };
  const bottomRight = { x: Math.max(lhPx.x, rhPx.x) + hipExtensionX, y: Math.max(lhPx.y, rhPx.y) + offsetYPx };

  // Extend bottom further down (outfit typically extends below hips)
  const torsoH = Math.abs(bottomLeft.y - topLeft.y);
  const extendBelow = torsoH * 0.6; // 60% extension below hips
  const extBottomLeft  = { x: bottomLeft.x,  y: bottomLeft.y + extendBelow };
  const extBottomRight = { x: bottomRight.x, y: bottomRight.y + extendBelow };

  // Build the grid by bilinear interpolation between the 4 corners
  const grid: MeshGrid = [];
  for (let row = 0; row <= MESH_ROWS; row++) {
    const t = row / MESH_ROWS; // 0 at top, 1 at bottom
    const rowPoints: Point2D[] = [];

    // Interpolate left edge: topLeft → extBottomLeft
    const leftX = topLeft.x + (extBottomLeft.x - topLeft.x) * t;
    const leftY = topLeft.y + (extBottomLeft.y - topLeft.y) * t;

    // Interpolate right edge: topRight → extBottomRight
    const rightX = topRight.x + (extBottomRight.x - topRight.x) * t;
    const rightY = topRight.y + (extBottomRight.y - topRight.y) * t;

    // Add slight curvature to the sides for a natural garment silhouette
    // The waist (t ≈ 0.5) curves inward slightly
    const curveFactor = Math.sin(t * Math.PI) * shoulderWidth * 0.04;

    for (let col = 0; col <= MESH_COLS; col++) {
      const s = col / MESH_COLS; // 0 at left, 1 at right

      // Bilinear interpolation
      const x = leftX + (rightX - leftX) * s;
      const y = leftY + (rightY - leftY) * s;

      // Apply lateral curvature (compress sides inward at the waist)
      const lateralOffset = (s - 0.5) * 2; // -1 to 1
      const curveX = x + lateralOffset * curveFactor;

      rowPoints.push({ x: curveX, y });
    }
    grid.push(rowPoints);
  }

  return grid;
}

/**
 * Draw the outfit image warped through a triangle mesh.
 * 
 * For each quad in the grid, we split it into 2 triangles and render each
 * triangle using Canvas 2D affine transformations.
 * 
 * The affine transform for each triangle maps 3 source points to 3 destination
 * points, which is an exact solution (3 points define a unique affine transform).
 * 
 * @param ctx - Canvas 2D rendering context
 * @param image - The outfit image (HTMLImageElement or HTMLCanvasElement)
 * @param srcMesh - Source mesh (uniform grid in texture space, 0-1)
 * @param dstMesh - Destination mesh (pixel positions on canvas)
 * @param imgWidth - Natural width of the outfit image
 * @param imgHeight - Natural height of the outfit image
 */
export function drawWarpedMesh(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement | HTMLCanvasElement,
  srcMesh: MeshGrid,
  dstMesh: MeshGrid,
  imgWidth: number,
  imgHeight: number
): void {
  ctx.save();

  for (let row = 0; row < dstMesh.length - 1; row++) {
    for (let col = 0; col < dstMesh[0].length - 1; col++) {
      // Source quad corners (in pixel space of the image)
      const s00 = { x: srcMesh[row][col].x * imgWidth,       y: srcMesh[row][col].y * imgHeight };
      const s10 = { x: srcMesh[row][col + 1].x * imgWidth,   y: srcMesh[row][col + 1].y * imgHeight };
      const s01 = { x: srcMesh[row + 1][col].x * imgWidth,   y: srcMesh[row + 1][col].y * imgHeight };
      const s11 = { x: srcMesh[row + 1][col + 1].x * imgWidth, y: srcMesh[row + 1][col + 1].y * imgHeight };

      // Destination quad corners (in canvas pixel space)
      const d00 = dstMesh[row][col];
      const d10 = dstMesh[row][col + 1];
      const d01 = dstMesh[row + 1][col];
      const d11 = dstMesh[row + 1][col + 1];

      // Triangle 1: top-left triangle (00, 10, 01)
      drawTriangle(ctx, image, s00, s10, s01, d00, d10, d01);

      // Triangle 2: bottom-right triangle (10, 11, 01)
      drawTriangle(ctx, image, s10, s11, s01, d10, d11, d01);
    }
  }

  ctx.restore();
}

/**
 * Draw a single textured triangle using Canvas 2D affine transform.
 * 
 * Given 3 source points on the texture and 3 destination points on the canvas,
 * we compute the unique affine transformation matrix that maps src → dst.
 * 
 * The affine transform is:
 *   [x']   [a c e] [x]
 *   [y'] = [b d f] [y]
 *   [1 ]   [0 0 1] [1]
 * 
 * We solve for a,b,c,d,e,f using the 3 point pairs (6 equations, 6 unknowns).
 */
function drawTriangle(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement | HTMLCanvasElement,
  s0: Point2D, s1: Point2D, s2: Point2D,  // source triangle (image coords)
  d0: Point2D, d1: Point2D, d2: Point2D   // destination triangle (canvas coords)
): void {
  // Clip to the destination triangle
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(d0.x, d0.y);
  ctx.lineTo(d1.x, d1.y);
  ctx.lineTo(d2.x, d2.y);
  ctx.closePath();
  ctx.clip();

  // Compute the affine transform: src → dst
  // We need to solve:
  //   d0.x = a*s0.x + c*s0.y + e
  //   d0.y = b*s0.x + d*s0.y + f
  //   d1.x = a*s1.x + c*s1.y + e
  //   ... (6 equations total)
  
  const denom = (s0.x * (s1.y - s2.y) + s1.x * (s2.y - s0.y) + s2.x * (s0.y - s1.y));
  
  if (Math.abs(denom) < 1e-10) {
    ctx.restore();
    return; // Degenerate triangle, skip
  }

  const invDenom = 1 / denom;

  // Solve for transform coefficients
  const a = (d0.x * (s1.y - s2.y) + d1.x * (s2.y - s0.y) + d2.x * (s0.y - s1.y)) * invDenom;
  const b = (d0.y * (s1.y - s2.y) + d1.y * (s2.y - s0.y) + d2.y * (s0.y - s1.y)) * invDenom;
  const c = (d0.x * (s2.x - s1.x) + d1.x * (s0.x - s2.x) + d2.x * (s1.x - s0.x)) * invDenom;
  const d = (d0.y * (s2.x - s1.x) + d1.y * (s0.x - s2.x) + d2.y * (s1.x - s0.x)) * invDenom;
  const e = (d0.x * (s1.x * s2.y - s2.x * s1.y) + d1.x * (s2.x * s0.y - s0.x * s2.y) + d2.x * (s0.x * s1.y - s1.x * s0.y)) * invDenom;
  const f = (d0.y * (s1.x * s2.y - s2.x * s1.y) + d1.y * (s2.x * s0.y - s0.x * s2.y) + d2.y * (s0.x * s1.y - s1.x * s0.y)) * invDenom;

  // Apply the affine transform and draw the image
  ctx.setTransform(a, b, c, d, e, f);
  ctx.drawImage(image, 0, 0);

  ctx.restore();
}

// Pre-computed source mesh (static, never changes)
let cachedSourceMesh: MeshGrid | null = null;

/**
 * Get the cached source mesh (created once, reused every frame).
 */
export function getSourceMesh(): MeshGrid {
  if (!cachedSourceMesh) {
    cachedSourceMesh = createSourceMesh();
  }
  return cachedSourceMesh;
}
