// ============================================================================
// Outfit Catalog — Defines available outfits
// ============================================================================

import { OutfitItem } from '@/types';

/**
 * Available outfits for the virtual try-on system.
 * 
 * offsetY: Vertical offset ratio from shoulder midpoint.
 *   - Negative values move outfit UP (e.g., for outfits that start above shoulders)
 *   - Positive values move outfit DOWN
 * 
 * scaleMultiplier: How much wider the outfit image should be relative to shoulder width.
 *   - 1.0 = exactly shoulder width
 *   - 2.0 = twice the shoulder width (typical for full garments with sleeves)
 *   - 2.5 = wider (for flowing/loose garments)
 */
export const OUTFITS: OutfitItem[] = [
  {
    id: 'm1',
    name: 'Áo Dài Mường 1',
    src: '/outfits/m1.png',
    thumbnail: '/outfits/m1.png',
    offsetY: -0.03,
    scaleMultiplier: 2.3,
  },
  {
    id: 'm2',
    name: 'Áo Dài Mường 2',
    src: '/outfits/m2.png',
    thumbnail: '/outfits/m2.png',
    offsetY: -0.03,
    scaleMultiplier: 2.3,
  },
  {
    id: 'm3',
    name: 'Áo Dài Mường 3',
    src: '/outfits/m3.png',
    thumbnail: '/outfits/m3.png',
    offsetY: -0.03,
    scaleMultiplier: 2.3,
  },
  {
    id: 'traditional',
    name: 'Traditional Muong',
    src: '/outfits/traditional.jpg',
    thumbnail: '/outfits/traditional.jpg',
    offsetY: -0.03,
    scaleMultiplier: 2.3,
  },
];
