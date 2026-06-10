// ============================================================================
// Body Alignment Engine — Pure math functions for pose geometry
// ============================================================================

import { LandmarkPoint, Point2D, BodyAlignment, PoseLandmark } from '@/types';

/**
 * Calculate the midpoint between two landmarks.
 * Used for shoulder center and hip center computation.
 */
export function midpoint(a: LandmarkPoint, b: LandmarkPoint): Point2D {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

/**
 * Calculate Euclidean distance between two 2D points (normalized space).
 */
export function distance2D(a: Point2D, b: Point2D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate the shoulder midpoint (center of shoulders).
 * Landmark 11 = left shoulder, 12 = right shoulder.
 */
export function calculateShoulderMidpoint(landmarks: LandmarkPoint[]): Point2D {
  return midpoint(
    landmarks[PoseLandmark.LEFT_SHOULDER],
    landmarks[PoseLandmark.RIGHT_SHOULDER]
  );
}

/**
 * Calculate the hip midpoint (center of hips).
 * Landmark 23 = left hip, 24 = right hip.
 */
export function calculateHipMidpoint(landmarks: LandmarkPoint[]): Point2D {
  return midpoint(
    landmarks[PoseLandmark.LEFT_HIP],
    landmarks[PoseLandmark.RIGHT_HIP]
  );
}

/**
 * Calculate shoulder width in pixels.
 * Converts normalized distance to pixel distance using canvas width.
 */
export function calculateShoulderWidth(
  landmarks: LandmarkPoint[],
  canvasWidth: number
): number {
  const leftShoulder = landmarks[PoseLandmark.LEFT_SHOULDER];
  const rightShoulder = landmarks[PoseLandmark.RIGHT_SHOULDER];
  // Distance in normalized coordinates, then scale to pixels
  const normalizedDist = distance2D(leftShoulder, rightShoulder);
  return normalizedDist * canvasWidth;
}

/**
 * Calculate torso height in pixels.
 * Distance from shoulder midpoint to hip midpoint.
 */
export function calculateTorsoHeight(
  landmarks: LandmarkPoint[],
  canvasHeight: number
): number {
  const shoulderMid = calculateShoulderMidpoint(landmarks);
  const hipMid = calculateHipMidpoint(landmarks);
  const normalizedDist = distance2D(shoulderMid, hipMid);
  return normalizedDist * canvasHeight;
}

/**
 * Calculate body rotation angle in radians.
 * Uses atan2 to find the angle between shoulders relative to horizontal.
 * 
 * Math explanation:
 * - If shoulders are level, angle = 0
 * - If right shoulder is higher, angle < 0 (tilt left)
 * - If left shoulder is higher, angle > 0 (tilt right)
 * 
 * We measure from the horizontal:
 *   angle = atan2(rightShoulder.y - leftShoulder.y, rightShoulder.x - leftShoulder.x)
 */
export function calculateBodyRotation(landmarks: LandmarkPoint[]): number {
  const leftShoulder = landmarks[PoseLandmark.LEFT_SHOULDER];
  const rightShoulder = landmarks[PoseLandmark.RIGHT_SHOULDER];
  
  let angle = Math.atan2(
    rightShoulder.y - leftShoulder.y,
    rightShoulder.x - leftShoulder.x
  );

  // Wrap angle to [-PI/2, PI/2] to represent the tilt relative to horizontal.
  // This resolves 180-degree flips caused by coordinate mirroring or landmark ordering.
  if (angle > Math.PI / 2) {
    angle -= Math.PI;
  } else if (angle < -Math.PI / 2) {
    angle += Math.PI;
  }
  
  return angle;
}

/**
 * Compute full body alignment from landmarks.
 * This is the main function called each frame to derive all pose geometry.
 * Returns both normalized-space values AND pixel-space landmark positions
 * (the latter is needed for mesh warping control points).
 */
export function computeBodyAlignment(
  landmarks: LandmarkPoint[],
  canvasWidth: number,
  canvasHeight: number
): BodyAlignment {
  const ls = landmarks[PoseLandmark.LEFT_SHOULDER];
  const rs = landmarks[PoseLandmark.RIGHT_SHOULDER];
  const lh = landmarks[PoseLandmark.LEFT_HIP];
  const rh = landmarks[PoseLandmark.RIGHT_HIP];

  return {
    shoulderMidpoint: calculateShoulderMidpoint(landmarks),
    hipMidpoint: calculateHipMidpoint(landmarks),
    shoulderWidth: calculateShoulderWidth(landmarks, canvasWidth),
    torsoHeight: calculateTorsoHeight(landmarks, canvasHeight),
    rotationAngle: calculateBodyRotation(landmarks),

    // Pixel-space positions for mesh warping
    leftShoulderPx:  { x: ls.x * canvasWidth, y: ls.y * canvasHeight },
    rightShoulderPx: { x: rs.x * canvasWidth, y: rs.y * canvasHeight },
    leftHipPx:       { x: lh.x * canvasWidth, y: lh.y * canvasHeight },
    rightHipPx:      { x: rh.x * canvasWidth, y: rh.y * canvasHeight },
  };
}
