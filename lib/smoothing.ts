// ============================================================================
// Smoothing Engine — Adaptive Lerp-based interpolation to reduce jitter
// ============================================================================

import { Point2D, BodyAlignment } from '@/types';

/**
 * Standard linear interpolation between two values.
 */
export function lerp(current: number, target: number, factor: number): number {
  return current + (target - current) * factor;
}

/**
 * Shortest path angle interpolation (handles wrapping around -PI/PI).
 */
export function lerpAngle(current: number, target: number, factor: number): number {
  let diff = target - current;
  // Wrap to [-PI, PI]
  while (diff < -Math.PI) diff += Math.PI * 2;
  while (diff > Math.PI) diff -= Math.PI * 2;
  return current + diff * factor;
}

/**
 * Adaptive Linear Interpolation for scalar values.
 * Adjusts the interpolation factor based on the distance between current and target.
 * 
 * - Small change (noise/jitter) -> Small factor (heavy smoothing, stable)
 * - Large change (movement) -> Large factor (low smoothing, responsive)
 */
export function adaptiveLerp(
  current: number,
  target: number,
  minFactor: number,
  maxFactor: number,
  threshold: number
): number {
  const diff = Math.abs(target - current);
  const ratio = Math.min(diff / threshold, 1.0);
  // Quadratic easing for smoother transitions
  const t = ratio * ratio;
  const factor = minFactor + (maxFactor - minFactor) * t;
  return current + (target - current) * factor;
}

/**
 * Adaptive Linear Interpolation for 2D points (normalized coords).
 */
export function adaptiveLerpPoint(
  current: Point2D,
  target: Point2D,
  minFactor: number,
  maxFactor: number,
  threshold: number
): Point2D {
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  
  const ratio = Math.min(dist / threshold, 1.0);
  const t = ratio * ratio;
  const factor = minFactor + (maxFactor - minFactor) * t;
  
  return {
    x: current.x + dx * factor,
    y: current.y + dy * factor,
  };
}

/**
 * Adaptive Linear Interpolation for angles (radians).
 * Accounts for wrapping and applies velocity-based adaptive smoothing.
 */
export function adaptiveLerpAngle(
  current: number,
  target: number,
  minFactor: number,
  maxFactor: number,
  threshold: number
): number {
  const diff = lerpAngle(current, target, 1.0) - current;
  const absDiff = Math.abs(diff);
  
  const ratio = Math.min(absDiff / threshold, 1.0);
  const t = ratio * ratio;
  const factor = minFactor + (maxFactor - minFactor) * t;
  
  return current + diff * factor;
}

/**
 * Smooth an entire BodyAlignment using tuned adaptive lerp parameters.
 * This dynamically balances jitter reduction (when standing still) and 
 * latency reduction (when moving).
 */
export function smoothBodyAlignment(
  prev: BodyAlignment,
  next: BodyAlignment
): BodyAlignment {
  return {
    // 1. Position smoothing (normalized space: 0 to 1)
    // Threshold is 0.015 (roughly 20 pixels on 1280px canvas)
    shoulderMidpoint: adaptiveLerpPoint(
      prev.shoulderMidpoint,
      next.shoulderMidpoint,
      0.05,  // Heavy smoothing when still
      0.35,  // Fast tracking when moving
      0.015
    ),
    hipMidpoint: adaptiveLerpPoint(
      prev.hipMidpoint,
      next.hipMidpoint,
      0.05,
      0.35,
      0.015
    ),

    // 2. Scale smoothing (pixel space)
    // Using dynamic 5% of width/height as threshold to adapt to user distance and screen sizes
    shoulderWidth: adaptiveLerp(
      prev.shoulderWidth,
      next.shoulderWidth,
      0.02,  // Lock scale when still
      0.20,  // Smoothly scale when moving
      next.shoulderWidth * 0.05
    ),
    torsoHeight: adaptiveLerp(
      prev.torsoHeight,
      next.torsoHeight,
      0.02,
      0.20,
      next.torsoHeight * 0.05
    ),

    // 3. Rotation smoothing (radians)
    // Threshold is 0.05 radians (~3 degrees).
    // Extremely heavy smoothing (0.01) to prevent the bottom of the outfit from swaying.
    rotationAngle: adaptiveLerpAngle(
      prev.rotationAngle,
      next.rotationAngle,
      0.01,  // Lock rotation when still
      0.15,  // Smoothly rotate when turning
      0.05
    ),

    // 4. Pixel-space landmark smoothing for mesh warping control points
    // Threshold is 15 pixels. These drive the mesh deformation grid vertices.
    leftShoulderPx: adaptiveLerpPoint(
      prev.leftShoulderPx,
      next.leftShoulderPx,
      0.05, 0.35, 15
    ),
    rightShoulderPx: adaptiveLerpPoint(
      prev.rightShoulderPx,
      next.rightShoulderPx,
      0.05, 0.35, 15
    ),
    leftHipPx: adaptiveLerpPoint(
      prev.leftHipPx,
      next.leftHipPx,
      0.05, 0.35, 15
    ),
    rightHipPx: adaptiveLerpPoint(
      prev.rightHipPx,
      next.rightHipPx,
      0.05, 0.35, 15
    ),
  };
}

/** Default smoothing factor (legacy) */
export const DEFAULT_SMOOTHING_FACTOR = 0.3;

