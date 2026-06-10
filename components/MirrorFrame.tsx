'use client';
// ============================================================================
// MirrorFrame — Futuristic HUD-style frame overlay around the camera view
// ============================================================================

import React from 'react';

export default function MirrorFrame() {
  return (
    <div className="mirror-frame pointer-events-none">
      {/* Top title bar */}
      <div className="frame-title-bar">
        <div className="frame-title-line" />
        <h1 className="frame-title">
          <span className="frame-title-icon">◆</span>
          <span>VIRTUAL ETHNIC FASHION MIRROR</span>
          <span className="frame-title-icon">◆</span>
        </h1>
        <div className="frame-title-line" />
      </div>

      {/* Corner brackets — HUD targeting style */}
      <div className="hud-corner hud-top-left">
        <svg width="40" height="40" viewBox="0 0 40 40">
          <path d="M2 20 L2 2 L20 2" stroke="currentColor" strokeWidth="2" fill="none" />
        </svg>
      </div>
      <div className="hud-corner hud-top-right">
        <svg width="40" height="40" viewBox="0 0 40 40">
          <path d="M20 2 L38 2 L38 20" stroke="currentColor" strokeWidth="2" fill="none" />
        </svg>
      </div>
      <div className="hud-corner hud-bottom-left">
        <svg width="40" height="40" viewBox="0 0 40 40">
          <path d="M2 20 L2 38 L20 38" stroke="currentColor" strokeWidth="2" fill="none" />
        </svg>
      </div>
      <div className="hud-corner hud-bottom-right">
        <svg width="40" height="40" viewBox="0 0 40 40">
          <path d="M20 38 L38 38 L38 20" stroke="currentColor" strokeWidth="2" fill="none" />
        </svg>
      </div>

      {/* Animated scanline */}
      <div className="scanline" />

      {/* Bottom bar */}
      <div className="frame-bottom-bar">
        <span className="frame-status-dot" />
        <span className="frame-bottom-text">AI POSE TRACKING • REALTIME OVERLAY</span>
        <span className="frame-status-dot" />
      </div>
    </div>
  );
}
