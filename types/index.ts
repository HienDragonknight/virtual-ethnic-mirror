// ============================================================================
// Virtual Try-On Smart Mirror — Type Definitions
// ============================================================================

/** A single pose landmark point from MediaPipe */
export interface LandmarkPoint {
  x: number; // normalized 0-1, relative to image width
  y: number; // normalized 0-1, relative to image height
  z: number; // depth, roughly same scale as x
  visibility: number; // confidence 0-1
}

/** 2D point for canvas operations */
export interface Point2D {
  x: number;
  y: number;
}

/**
 * Computed body alignment data derived from pose landmarks.
 * All coordinates are in normalized space (0-1) unless stated otherwise.
 */
export interface BodyAlignment {
  shoulderMidpoint: Point2D;
  hipMidpoint: Point2D;
  shoulderWidth: number;   // in pixels
  torsoHeight: number;     // in pixels
  rotationAngle: number;   // radians — body tilt from vertical

  // Pixel-space landmark positions for mesh warping control points
  leftShoulderPx: Point2D;
  rightShoulderPx: Point2D;
  leftHipPx: Point2D;
  rightHipPx: Point2D;
}

/** Outfit configuration for the overlay system */
export interface OutfitItem {
  id: string;
  name: string;
  src: string;             // path to transparent PNG
  thumbnail: string;       // path to thumbnail image
  offsetY: number;         // vertical offset ratio from shoulder midpoint
  scaleMultiplier: number; // outfit width = shoulderWidth * this value
}

/** 2D grid of points representing a triangle mesh for warping */
export type MeshGrid = Point2D[][];

/** Lighting analysis result for adaptive color grading */
export interface LightingInfo {
  avgLuminance: number;       // 0-255 average brightness of torso area
  avgR: number;               // average red channel
  avgG: number;               // average green channel
  avgB: number;               // average blue channel
}

/** Global application state */
export interface MirrorState {
  isWebcamReady: boolean;
  isPoseReady: boolean;
  showSkeleton: boolean;
  selectedOutfit: OutfitItem | null;
  fps: number;
}

/**
 * MediaPipe Pose Landmark indices we use.
 * Full list: https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker
 */
export enum PoseLandmark {
  NOSE = 0,
  LEFT_SHOULDER = 11,
  RIGHT_SHOULDER = 12,
  LEFT_ELBOW = 13,
  RIGHT_ELBOW = 14,
  LEFT_WRIST = 15,
  RIGHT_WRIST = 16,
  LEFT_HIP = 23,
  RIGHT_HIP = 24,
  LEFT_KNEE = 25,
  RIGHT_KNEE = 26,
  LEFT_ANKLE = 27,
  RIGHT_ANKLE = 28,
}

/** Skeleton connection pairs for debug drawing */
export const POSE_CONNECTIONS: [PoseLandmark, PoseLandmark][] = [
  [PoseLandmark.LEFT_SHOULDER, PoseLandmark.RIGHT_SHOULDER],
  [PoseLandmark.LEFT_SHOULDER, PoseLandmark.LEFT_ELBOW],
  [PoseLandmark.RIGHT_SHOULDER, PoseLandmark.RIGHT_ELBOW],
  [PoseLandmark.LEFT_ELBOW, PoseLandmark.LEFT_WRIST],
  [PoseLandmark.RIGHT_ELBOW, PoseLandmark.RIGHT_WRIST],
  [PoseLandmark.LEFT_SHOULDER, PoseLandmark.LEFT_HIP],
  [PoseLandmark.RIGHT_SHOULDER, PoseLandmark.RIGHT_HIP],
  [PoseLandmark.LEFT_HIP, PoseLandmark.RIGHT_HIP],
  [PoseLandmark.LEFT_HIP, PoseLandmark.LEFT_KNEE],
  [PoseLandmark.RIGHT_HIP, PoseLandmark.RIGHT_KNEE],
  [PoseLandmark.LEFT_KNEE, PoseLandmark.LEFT_ANKLE],
  [PoseLandmark.RIGHT_KNEE, PoseLandmark.RIGHT_ANKLE],
];
