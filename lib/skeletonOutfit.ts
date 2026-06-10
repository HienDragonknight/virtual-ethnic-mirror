// ============================================================================
// Skeleton-Driven Full Body Outfit Renderer
//
// Splits the outfit image into 5 body segments, each warped independently
// to follow the corresponding bone landmarks:
//   • Torso:       collar → shoulder → waist → hip
//   • Left sleeve: left shoulder → left elbow → left wrist
//   • Right sleeve: right shoulder → right elbow → right wrist
//   • Left leg:    left hip → left knee → left ankle
//   • Right leg:   right hip → right knee → right ankle
// ============================================================================

import { LandmarkPoint, Point2D } from '@/types';

// ─── UV Layout ───────────────────────────────────────────────────────────────
// Defines which region of the outfit IMAGE corresponds to each body segment.
// Tweak these if outfits have different proportions.
const UV = {
  // Horizontal seams (X, normalized 0-1)
  LEFT_OUTER:   0.00,  // leftmost edge of image
  LEFT_SEAM:    0.24,  // where left sleeve meets torso
  CENTER_LEFT:  0.35,
  CENTER_RIGHT: 0.65,
  RIGHT_SEAM:   0.76,  // where right sleeve meets torso
  RIGHT_OUTER:  1.00,

  // Vertical seams (Y, normalized 0-1)
  COLLAR:   0.02,
  SHOULDER: 0.09,
  ELBOW:    0.30,
  WRIST:    0.45,
  WAIST:    0.48,
  HIP:      0.58,
  KNEE:     0.76,
  ANKLE:    0.93,
  HEM:      1.00,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Convert a MediaPipe landmark to mirrored canvas pixel coordinates */
function px(lm: LandmarkPoint, w: number, h: number): Point2D {
  return { x: (1.0 - lm.x) * w, y: lm.y * h };
}

/** Linear interpolate between two 2D points */
function lerp2(a: Point2D, b: Point2D, t: number): Point2D {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Extrapolate beyond point B, continuing from A→B */
function extrapolate(a: Point2D, b: Point2D, factor: number): Point2D {
  return { x: b.x + (b.x - a.x) * factor, y: b.y + (b.y - a.y) * factor };
}

/**
 * Render a single textured quad (4 corners) as 2 affine-transformed triangles.
 * srcXX = source corners in IMAGE pixel coordinates
 * dstXX = destination corners in CANVAS pixel coordinates
 */
function drawQuad(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | HTMLCanvasElement,
  srcTL: Point2D, srcTR: Point2D, srcBL: Point2D, srcBR: Point2D,
  dstTL: Point2D, dstTR: Point2D, dstBL: Point2D, dstBR: Point2D,
): void {
  drawAffineTriangle(ctx, img, srcTL, srcTR, srcBL, dstTL, dstTR, dstBL);
  drawAffineTriangle(ctx, img, srcTR, srcBR, srcBL, dstTR, dstBR, dstBL);
}

/** Render one triangle using canvas affine transform */
function drawAffineTriangle(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | HTMLCanvasElement,
  s0: Point2D, s1: Point2D, s2: Point2D,
  d0: Point2D, d1: Point2D, d2: Point2D,
): void {
  const denom = (s0.x * (s1.y - s2.y) + s1.x * (s2.y - s0.y) + s2.x * (s0.y - s1.y));
  if (Math.abs(denom) < 1e-8) return;
  const inv = 1 / denom;

  const a = (d0.x*(s1.y-s2.y) + d1.x*(s2.y-s0.y) + d2.x*(s0.y-s1.y)) * inv;
  const b = (d0.y*(s1.y-s2.y) + d1.y*(s2.y-s0.y) + d2.y*(s0.y-s1.y)) * inv;
  const c = (d0.x*(s2.x-s1.x) + d1.x*(s0.x-s2.x) + d2.x*(s1.x-s0.x)) * inv;
  const d = (d0.y*(s2.x-s1.x) + d1.y*(s0.x-s2.x) + d2.y*(s1.x-s0.x)) * inv;
  const e = (d0.x*(s1.x*s2.y-s2.x*s1.y) + d1.x*(s2.x*s0.y-s0.x*s2.y) + d2.x*(s0.x*s1.y-s1.x*s0.y)) * inv;
  const f = (d0.y*(s1.x*s2.y-s2.x*s1.y) + d1.y*(s2.x*s0.y-s0.x*s2.y) + d2.y*(s0.x*s1.y-s1.x*s0.y)) * inv;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(d0.x, d0.y);
  ctx.lineTo(d1.x, d1.y);
  ctx.lineTo(d2.x, d2.y);
  ctx.closePath();
  ctx.clip();
  ctx.setTransform(a, b, c, d, e, f);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

// ─── Main Export ─────────────────────────────────────────────────────────────

/**
 * Draw the outfit following the full body skeleton.
 * Each body segment (torso, sleeves, legs) warps independently.
 *
 * @param ctx - Canvas 2D context
 * @param image - Processed outfit image (background removed)
 * @param landmarks - MediaPipe Pose landmarks (33 points)
 * @param canvasWidth - Canvas width in pixels
 * @param canvasHeight - Canvas height in pixels
 * @param scaleMultiplier - Width scale (default 2.2 = outfit is 2.2× shoulder width)
 */
export function drawSkeletonDrivenOutfit(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement | HTMLCanvasElement,
  landmarks: LandmarkPoint[],
  canvasWidth: number,
  canvasHeight: number,
  scaleMultiplier: number = 2.2,
): void {
  if (landmarks.length < 29) return;

  const W = canvasWidth;
  const H = canvasHeight;
  const iW = image instanceof HTMLImageElement ? image.naturalWidth  : image.width;
  const iH = image instanceof HTMLImageElement ? image.naturalHeight : image.height;

  // ── Extract landmark positions (mirrored canvas space) ──
  const NOSE  = px(landmarks[0],  W, H);
  const LS    = px(landmarks[11], W, H);  // left  shoulder
  const RS    = px(landmarks[12], W, H);  // right shoulder
  const LE    = px(landmarks[13], W, H);  // left  elbow
  const RE    = px(landmarks[14], W, H);  // right elbow
  const LW    = px(landmarks[15], W, H);  // left  wrist
  const RW    = px(landmarks[16], W, H);  // right wrist
  const LH    = px(landmarks[23], W, H);  // left  hip
  const RH    = px(landmarks[24], W, H);  // right hip
  const LK    = px(landmarks[25], W, H);  // left  knee
  const RK    = px(landmarks[26], W, H);  // right knee
  const LA    = px(landmarks[27], W, H);  // left  ankle
  const RA    = px(landmarks[28], W, H);  // right ankle

  // ── Visibility guards — fall back to interpolated positions ──
  const lElbowVis = landmarks[13].visibility > 0.3;
  const rElbowVis = landmarks[14].visibility > 0.3;
  const lWristVis = landmarks[15].visibility > 0.3;
  const rWristVis = landmarks[16].visibility > 0.3;
  const lKneeVis  = landmarks[25].visibility > 0.3;
  const rKneeVis  = landmarks[26].visibility > 0.3;
  const lAnkleVis = landmarks[27].visibility > 0.3;
  const rAnkleVis = landmarks[28].visibility > 0.3;

  const LE_safe = lElbowVis ? LE : lerp2(LS, LH, 0.35);
  const RE_safe = rElbowVis ? RE : lerp2(RS, RH, 0.35);
  const LW_safe = lWristVis ? LW : extrapolate(LS, LE_safe, 0.7);
  const RW_safe = rWristVis ? RW : extrapolate(RS, RE_safe, 0.7);
  const LK_safe = lKneeVis  ? LK : lerp2(LH, LA, 0.5);
  const RK_safe = rKneeVis  ? RK : lerp2(RH, RA, 0.5);
  const LA_safe = lAnkleVis ? LA : extrapolate(LH, LK_safe, 1.0);
  const RA_safe = rAnkleVis ? RA : extrapolate(RH, RK_safe, 1.0);

  // ── Derived geometry ──
  const shoulderWidth = Math.abs(RS.x - LS.x);
  const halfScale     = (shoulderWidth * scaleMultiplier) / 2;
  const shoulderMidX  = (LS.x + RS.x) / 2;
  const shoulderMidY  = (LS.y + RS.y) / 2;

  // Collar: lifted above shoulder toward nose
  const noseVis = landmarks[0].visibility > 0.3;
  const collarY = noseVis
    ? NOSE.y + (shoulderMidY - NOSE.y) * 0.65
    : shoulderMidY - shoulderWidth * 0.14;
  const collarHalfW = shoulderWidth * 0.28;

  // Shoulder outer extensions (for sleeve roots)
  const LS_out = { x: LS.x - shoulderWidth * 0.05, y: LS.y };
  const RS_out = { x: RS.x + shoulderWidth * 0.05, y: RS.y };

  // Wrist perpendicular width (sleeve cuff width)
  const cuffW = shoulderWidth * 0.18;
  function perp(from: Point2D, to: Point2D, width: number): { l: Point2D; r: Point2D } {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.sqrt(dx*dx + dy*dy) || 1;
    const nx = -dy / len * width;
    const ny =  dx / len * width;
    return { l: { x: to.x + nx, y: to.y + ny }, r: { x: to.x - nx, y: to.y - ny } };
  }

  // Left wrist perp (cuff ends)
  const lwPerp = perp(LE_safe, LW_safe, cuffW);
  // Right wrist perp
  const rwPerp = perp(RE_safe, RW_safe, cuffW);

  // Hem: extend slightly below ankles
  const LA_hem = extrapolate(LK_safe, LA_safe, 0.08);
  const RA_hem = extrapolate(RK_safe, RA_safe, 0.08);

  // Waist and hip edge widths (for trapezoidal body shape)
  const waistHalfW = shoulderWidth * 0.48;
  const hipHalfW   = shoulderWidth * 0.52;
  const LH_waist = lerp2(LS_out, LH, 0.5);
  const RH_waist = lerp2(RS_out, RH, 0.5);

  // ── UV helpers (image pixel coords) ──
  const u = (uvX: number) => uvX * iW;
  const v = (uvY: number) => uvY * iH;
  const src = (uvX: number, uvY: number): Point2D => ({ x: u(uvX), y: v(uvY) });

  // ─────────────────────────────────────────────────────────────────────────
  // SEGMENT 1: TORSO  (collar → shoulder → waist → hip)
  // ─────────────────────────────────────────────────────────────────────────

  // Collar line
  const collarL: Point2D = { x: shoulderMidX - collarHalfW, y: collarY };
  const collarR: Point2D = { x: shoulderMidX + collarHalfW, y: collarY };

  // Shoulder line
  const shL: Point2D = { x: shoulderMidX - shoulderWidth * 0.5, y: shoulderMidY };
  const shR: Point2D = { x: shoulderMidX + shoulderWidth * 0.5, y: shoulderMidY };

  // Waist line
  const waistL: Point2D = { x: shoulderMidX - waistHalfW, y: (LH_waist.y + RH_waist.y) / 2 };
  const waistR: Point2D = { x: shoulderMidX + waistHalfW, y: waistL.y };

  // Hip line
  const hipL: Point2D = { x: shoulderMidX - hipHalfW, y: (LH.y + RH.y) / 2 };
  const hipR: Point2D = { x: shoulderMidX + hipHalfW, y: hipL.y };

  // Quad: collar → shoulder
  drawQuad(ctx, image,
    src(UV.LEFT_SEAM,  UV.COLLAR),   src(UV.RIGHT_SEAM, UV.COLLAR),
    src(UV.LEFT_SEAM,  UV.SHOULDER), src(UV.RIGHT_SEAM, UV.SHOULDER),
    collarL, collarR, shL, shR,
  );
  // Quad: shoulder → waist
  drawQuad(ctx, image,
    src(UV.LEFT_SEAM,  UV.SHOULDER), src(UV.RIGHT_SEAM, UV.SHOULDER),
    src(UV.LEFT_SEAM,  UV.WAIST),    src(UV.RIGHT_SEAM, UV.WAIST),
    shL, shR, waistL, waistR,
  );
  // Quad: waist → hip
  drawQuad(ctx, image,
    src(UV.LEFT_SEAM,  UV.WAIST), src(UV.RIGHT_SEAM, UV.WAIST),
    src(UV.LEFT_SEAM,  UV.HIP),   src(UV.RIGHT_SEAM, UV.HIP),
    waistL, waistR, hipL, hipR,
  );

  // ─────────────────────────────────────────────────────────────────────────
  // SEGMENT 2: LEFT SLEEVE  (left shoulder → elbow → wrist)
  // In the outfit image: left portion (UV.LEFT_OUTER to UV.LEFT_SEAM)
  // ─────────────────────────────────────────────────────────────────────────

  // Shoulder root of sleeve
  const lSleeveInner_sh: Point2D = LS_out;
  const lSleeveOuter_sh: Point2D = { x: LS.x - shoulderWidth * 0.22, y: LS.y };

  // Elbow level
  const lePerp = perp(LS_out, LE_safe, shoulderWidth * 0.12);
  const lElbowInner = lePerp.r;
  const lElbowOuter = lePerp.l;

  // Wrist/cuff
  const lCuffInner = lwPerp.r;
  const lCuffOuter = lwPerp.l;

  // Quad: shoulder → elbow
  drawQuad(ctx, image,
    src(UV.LEFT_SEAM,  UV.SHOULDER), src(UV.LEFT_OUTER, UV.SHOULDER),
    src(UV.LEFT_SEAM,  UV.ELBOW),    src(UV.LEFT_OUTER, UV.ELBOW),
    lSleeveInner_sh, lSleeveOuter_sh, lElbowInner, lElbowOuter,
  );
  // Quad: elbow → wrist
  drawQuad(ctx, image,
    src(UV.LEFT_SEAM,  UV.ELBOW), src(UV.LEFT_OUTER, UV.ELBOW),
    src(UV.LEFT_SEAM,  UV.WRIST), src(UV.LEFT_OUTER, UV.WRIST),
    lElbowInner, lElbowOuter, lCuffInner, lCuffOuter,
  );

  // ─────────────────────────────────────────────────────────────────────────
  // SEGMENT 3: RIGHT SLEEVE
  // ─────────────────────────────────────────────────────────────────────────

  const rSleeveInner_sh: Point2D = RS_out;
  const rSleeveOuter_sh: Point2D = { x: RS.x + shoulderWidth * 0.22, y: RS.y };

  const rePerp = perp(RS_out, RE_safe, shoulderWidth * 0.12);
  const rElbowInner = rePerp.l;
  const rElbowOuter = rePerp.r;

  const rCuffInner = rwPerp.l;
  const rCuffOuter = rwPerp.r;

  drawQuad(ctx, image,
    src(UV.RIGHT_SEAM,  UV.SHOULDER), src(UV.RIGHT_OUTER, UV.SHOULDER),
    src(UV.RIGHT_SEAM,  UV.ELBOW),    src(UV.RIGHT_OUTER, UV.ELBOW),
    rSleeveInner_sh, rSleeveOuter_sh, rElbowInner, rElbowOuter,
  );
  drawQuad(ctx, image,
    src(UV.RIGHT_SEAM,  UV.ELBOW), src(UV.RIGHT_OUTER, UV.ELBOW),
    src(UV.RIGHT_SEAM,  UV.WRIST), src(UV.RIGHT_OUTER, UV.WRIST),
    rElbowInner, rElbowOuter, rCuffInner, rCuffOuter,
  );

  // ─────────────────────────────────────────────────────────────────────────
  // SEGMENT 4: LEFT LEG  (left hip → knee → ankle)
  // ─────────────────────────────────────────────────────────────────────────

  const legHalfW = shoulderWidth * 0.26;

  const lHipL: Point2D  = { x: LH.x - legHalfW,  y: LH.y };
  const lHipR: Point2D  = { x: LH.x + legHalfW * 0.1, y: LH.y };
  const lKneeL: Point2D = { x: LK_safe.x - legHalfW * 0.85, y: LK_safe.y };
  const lKneeR: Point2D = { x: LK_safe.x + legHalfW * 0.05, y: LK_safe.y };
  const lAnkL: Point2D  = { x: LA_hem.x - legHalfW * 0.7, y: LA_hem.y };
  const lAnkR: Point2D  = { x: LA_hem.x + legHalfW * 0.05, y: LA_hem.y };

  // Quad: hip → knee
  drawQuad(ctx, image,
    src(UV.LEFT_OUTER,  UV.HIP),  src(UV.CENTER_LEFT, UV.HIP),
    src(UV.LEFT_OUTER,  UV.KNEE), src(UV.CENTER_LEFT, UV.KNEE),
    lHipL, lHipR, lKneeL, lKneeR,
  );
  // Quad: knee → ankle
  drawQuad(ctx, image,
    src(UV.LEFT_OUTER,  UV.KNEE), src(UV.CENTER_LEFT, UV.KNEE),
    src(UV.LEFT_OUTER,  UV.HEM),  src(UV.CENTER_LEFT, UV.HEM),
    lKneeL, lKneeR, lAnkL, lAnkR,
  );

  // ─────────────────────────────────────────────────────────────────────────
  // SEGMENT 5: RIGHT LEG
  // ─────────────────────────────────────────────────────────────────────────

  const rHipL: Point2D  = { x: RH.x - legHalfW * 0.1, y: RH.y };
  const rHipR: Point2D  = { x: RH.x + legHalfW,  y: RH.y };
  const rKneeL: Point2D = { x: RK_safe.x - legHalfW * 0.05, y: RK_safe.y };
  const rKneeR: Point2D = { x: RK_safe.x + legHalfW * 0.85, y: RK_safe.y };
  const rAnkL: Point2D  = { x: RA_hem.x - legHalfW * 0.05, y: RA_hem.y };
  const rAnkR: Point2D  = { x: RA_hem.x + legHalfW * 0.7, y: RA_hem.y };

  drawQuad(ctx, image,
    src(UV.CENTER_RIGHT, UV.HIP),  src(UV.RIGHT_OUTER, UV.HIP),
    src(UV.CENTER_RIGHT, UV.KNEE), src(UV.RIGHT_OUTER, UV.KNEE),
    rHipL, rHipR, rKneeL, rKneeR,
  );
  drawQuad(ctx, image,
    src(UV.CENTER_RIGHT, UV.KNEE), src(UV.RIGHT_OUTER, UV.KNEE),
    src(UV.CENTER_RIGHT, UV.HEM),  src(UV.RIGHT_OUTER, UV.HEM),
    rKneeL, rKneeR, rAnkL, rAnkR,
  );
}
