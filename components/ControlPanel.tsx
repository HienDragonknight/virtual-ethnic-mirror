'use client';
// ============================================================================
// ControlPanel — Debug controls, status indicators, feature toggles
// ============================================================================

import React, { useCallback } from 'react';

interface ControlPanelProps {
  isWebcamReady: boolean;
  isPoseReady: boolean;
  isSegmenterReady: boolean;
  showSkeleton: boolean;
  enableOcclusion: boolean;
  enableWarping: boolean;
  enableSkeletonDriven: boolean;
  fps: number;
  onToggleSkeleton: () => void;
  onToggleOcclusion: () => void;
  onToggleWarping: () => void;
  onToggleSkeletonDriven: () => void;
  canvasRef: React.RefObject<HTMLCanvasElement>;
}

export default function ControlPanel({
  isWebcamReady,
  isPoseReady,
  isSegmenterReady,
  showSkeleton,
  enableOcclusion,
  enableWarping,
  enableSkeletonDriven,
  fps,
  onToggleSkeleton,
  onToggleOcclusion,
  onToggleWarping,
  onToggleSkeletonDriven,
  canvasRef,
}: ControlPanelProps) {
  /**
   * Capture the current canvas frame as a PNG screenshot.
   * Downloads it as a file to the user's device.
   */
  const handleScreenshot = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const link = document.createElement('a');
    link.download = `fashion-mirror-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, [canvasRef]);

  return (
    <div className="control-panel">
      {/* Panel header */}
      <div className="control-header">
        <span className="control-header-icon">⚙</span>
        <h2 className="control-header-title">CONTROLS</h2>
      </div>

      {/* Status indicators */}
      <div className="control-section">
        <h3 className="control-section-title">STATUS</h3>

        <div className="status-item">
          <span className={`status-dot ${isWebcamReady ? 'status-active' : 'status-inactive'}`} />
          <span className="status-label">Webcam</span>
          <span className={`status-value ${isWebcamReady ? 'text-green-400' : 'text-red-400'}`}>
            {isWebcamReady ? 'Active' : 'Off'}
          </span>
        </div>

        <div className="status-item">
          <span className={`status-dot ${isPoseReady ? 'status-active' : 'status-inactive'}`} />
          <span className="status-label">Pose AI</span>
          <span className={`status-value ${isPoseReady ? 'text-green-400' : 'text-yellow-400'}`}>
            {isPoseReady ? 'Ready' : 'Loading...'}
          </span>
        </div>

        <div className="status-item">
          <span className={`status-dot ${isSegmenterReady ? 'status-active' : 'status-warning'}`} />
          <span className="status-label">Body Seg</span>
          <span className={`status-value ${isSegmenterReady ? 'text-green-400' : 'text-yellow-400'}`}>
            {isSegmenterReady ? 'Ready' : 'Loading...'}
          </span>
        </div>

        <div className="status-item">
          <span className={`status-dot ${fps >= 25 ? 'status-active' : 'status-warning'}`} />
          <span className="status-label">FPS</span>
          <span className={`status-value ${fps >= 25 ? 'text-cyan-400' : 'text-yellow-400'}`}>
            {Math.round(fps)}
          </span>
        </div>
      </div>

      {/* Feature toggles */}
      <div className="control-section">
        <h3 className="control-section-title">FEATURES</h3>

        <button
          id="occlusion-toggle"
          className={`toggle-button ${enableOcclusion ? 'toggle-active' : ''}`}
          onClick={onToggleOcclusion}
        >
          <span className="toggle-track"><span className="toggle-thumb" /></span>
          <span className="toggle-label">Arm Occlusion</span>
        </button>

        <button
          id="skeleton-driven-toggle"
          className={`toggle-button ${enableSkeletonDriven ? 'toggle-active' : ''}`}
          onClick={onToggleSkeletonDriven}
        >
          <span className="toggle-track"><span className="toggle-thumb" /></span>
          <span className="toggle-label">Full Body Fit</span>
        </button>

        <button
          id="warping-toggle"
          className={`toggle-button ${enableWarping ? 'toggle-active' : ''}`}
          onClick={onToggleWarping}
        >
          <span className="toggle-track"><span className="toggle-thumb" /></span>
          <span className="toggle-label">Mesh Warp (fallback)</span>
        </button>
      </div>

      {/* Debug toggle */}
      <div className="control-section">
        <h3 className="control-section-title">DEBUG</h3>

        <button
          id="skeleton-toggle"
          className={`toggle-button ${showSkeleton ? 'toggle-active' : ''}`}
          onClick={onToggleSkeleton}
        >
          <span className="toggle-track">
            <span className="toggle-thumb" />
          </span>
          <span className="toggle-label">Skeleton</span>
        </button>
      </div>

      {/* Actions */}
      <div className="control-section">
        <h3 className="control-section-title">ACTIONS</h3>

        <button
          id="screenshot-btn"
          className="action-button"
          onClick={handleScreenshot}
          disabled={!isWebcamReady}
        >
          <span className="action-icon">📸</span>
          <span>Screenshot</span>
        </button>
      </div>
    </div>
  );
}
