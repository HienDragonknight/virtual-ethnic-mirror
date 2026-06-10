'use client';
// ============================================================================
// LoadingScreen — Animated overlay shown while MediaPipe model loads
// ============================================================================

import React from 'react';

interface LoadingScreenProps {
  isVisible: boolean;
  progress?: string;
}

export default function LoadingScreen({ isVisible, progress }: LoadingScreenProps) {
  if (!isVisible) return null;

  return (
    <div className="loading-overlay">
      {/* Animated background grid */}
      <div className="loading-grid" />

      {/* Central loading content */}
      <div className="loading-content">
        {/* Spinner rings */}
        <div className="loading-spinner">
          <div className="spinner-ring ring-outer" />
          <div className="spinner-ring ring-middle" />
          <div className="spinner-ring ring-inner" />
          <div className="spinner-core" />
        </div>

        {/* Title */}
        <h1 className="loading-title">
          <span className="text-glow-cyan">VIRTUAL</span>
          <span className="text-white mx-2">ETHNIC FASHION</span>
          <span className="text-glow-cyan">MIRROR</span>
        </h1>

        {/* Progress text */}
        <p className="loading-progress">
          {progress || 'Initializing AI Pose Engine...'}
        </p>

        {/* Animated dots */}
        <div className="loading-dots">
          <span className="dot dot-1" />
          <span className="dot dot-2" />
          <span className="dot dot-3" />
        </div>
      </div>

      {/* Corner decorations */}
      <div className="corner-decoration top-left" />
      <div className="corner-decoration top-right" />
      <div className="corner-decoration bottom-left" />
      <div className="corner-decoration bottom-right" />
    </div>
  );
}
