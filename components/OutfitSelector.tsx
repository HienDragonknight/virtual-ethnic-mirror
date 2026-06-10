'use client';
// ============================================================================
// OutfitSelector — Left panel outfit picker with glassmorphism
// ============================================================================

import React, { useState, useEffect } from 'react';
import { OutfitItem } from '@/types';

interface OutfitSelectorProps {
  outfits: OutfitItem[];
  selectedOutfit: OutfitItem | null;
  onSelect: (outfit: OutfitItem | null) => void;
}

export default function OutfitSelector({
  outfits,
  selectedOutfit,
  onSelect,
}: OutfitSelectorProps) {
  const [loadedImages, setLoadedImages] = useState<Record<string, boolean>>({});

  // Preload outfit thumbnails
  useEffect(() => {
    outfits.forEach((outfit) => {
      const img = new Image();
      img.onload = () => {
        setLoadedImages((prev) => ({ ...prev, [outfit.id]: true }));
      };
      img.onerror = () => {
        setLoadedImages((prev) => ({ ...prev, [outfit.id]: false }));
      };
      img.src = outfit.thumbnail;
    });
  }, [outfits]);

  return (
    <div className="outfit-selector">
      {/* Panel header */}
      <div className="outfit-header">
        <div className="outfit-header-icon">👘</div>
        <h2 className="outfit-header-title">OUTFITS</h2>
        <div className="outfit-header-line" />
      </div>

      {/* Outfit grid */}
      <div className="outfit-grid">
        {outfits.map((outfit) => {
          const isSelected = selectedOutfit?.id === outfit.id;
          const isLoaded = loadedImages[outfit.id];

          return (
            <button
              key={outfit.id}
              id={`outfit-btn-${outfit.id}`}
              className={`outfit-card ${isSelected ? 'outfit-card-active' : ''}`}
              onClick={() => onSelect(isSelected ? null : outfit)}
              title={outfit.name}
            >
              {/* Thumbnail */}
              <div className="outfit-thumbnail">
                {isLoaded !== false ? (
                  <img
                    src={outfit.thumbnail}
                    alt={outfit.name}
                    className="outfit-img"
                    draggable={false}
                  />
                ) : (
                  <div className="outfit-placeholder">
                    <span>👘</span>
                  </div>
                )}

                {/* Selection indicator */}
                {isSelected && (
                  <div className="outfit-selected-badge">
                    <span>✓</span>
                  </div>
                )}
              </div>

              {/* Info & Subtitle */}
              <div className="outfit-info">
                <span className="outfit-name">{outfit.name}</span>
                <span className="outfit-subtitle">
                  {outfit.id === 'm1' && 'Heritage Red'}
                  {outfit.id === 'm2' && 'Indigo Brocade'}
                  {outfit.id === 'm3' && 'Royal Silk'}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* No selection hint */}
      {!selectedOutfit && (
        <p className="outfit-hint">Select an outfit to try on</p>
      )}
    </div>
  );
}
