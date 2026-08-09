import type { CSSProperties } from 'react';

/** shared chrome for menu/HUD overlays (matches existing inline-style look) */
export const panel: CSSProperties = {
  background: '#241b10',
  border: '1px solid #5a4730',
  borderRadius: 4,
  color: '#e8dcc0',
};

export const btn: CSSProperties = {
  background: '#3a2d1c',
  border: '1px solid #5a4730',
  borderRadius: 3,
  color: '#e8dcc0',
  padding: '8px 16px',
  cursor: 'pointer',
  fontSize: 14,
  fontFamily: 'inherit',
};

export const btnPrimary: CSSProperties = {
  ...btn,
  background: '#6b4a1e',
  border: '1px solid #d8b13a',
  color: '#ffe9b0',
};

export const btnActive: CSSProperties = {
  ...btn,
  background: '#6b4a1e',
  color: '#ffe9b0',
};

export const title: CSSProperties = {
  color: '#d8b13a',
  fontFamily: 'Georgia, serif',
};
