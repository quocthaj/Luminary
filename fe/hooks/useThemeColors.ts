'use client';

import { useState, useEffect } from 'react';

export interface ThemeColors {
  bgBase: string;
  bgSurface: string;
  bgElevated: string;
  accent: string;
  accentDim: string;
  accentGlow: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  borderNormal: string;
  borderSubtle: string;
  success: string;
  successDim: string;
  warning: string;
  warningDim: string;
  error: string;
  errorDim: string;
}

export function useThemeColors() {
  const [colors, setColors] = useState<ThemeColors>({
    bgBase: '#faf9f5',
    bgSurface: '#efe9de',
    bgElevated: '#e8e0d2',
    accent: '#cc785c',
    accentDim: 'rgba(204, 120, 92, 0.1)',
    accentGlow: 'rgba(204, 120, 92, 0.22)',
    textPrimary: '#141413',
    textSecondary: '#3d3d3a',
    textMuted: '#6c6a64',
    borderNormal: '#e6dfd8',
    borderSubtle: '#ebe6df',
    success: '#5db872',
    successDim: 'rgba(93, 184, 114, 0.1)',
    warning: '#d4a017',
    warningDim: 'rgba(212, 160, 23, 0.1)',
    error: '#c64545',
    errorDim: 'rgba(198, 69, 69, 0.1)',
  });

  useEffect(() => {
    const updateColors = () => {
      const rootStyle = getComputedStyle(document.documentElement);
      
      const getVal = (varName: string, fallback: string) => {
        const val = rootStyle.getPropertyValue(varName).trim();
        return val || fallback;
      };

      setColors({
        bgBase: getVal('--bg-base', '#faf9f5'),
        bgSurface: getVal('--bg-surface', '#efe9de'),
        bgElevated: getVal('--bg-elevated', '#e8e0d2'),
        accent: getVal('--accent', '#cc785c'),
        accentDim: getVal('--accent-dim', 'rgba(204, 120, 92, 0.1)'),
        accentGlow: getVal('--accent-glow', 'rgba(204, 120, 92, 0.22)'),
        textPrimary: getVal('--text-primary', '#141413'),
        textSecondary: getVal('--text-secondary', '#3d3d3a'),
        textMuted: getVal('--text-muted', '#6c6a64'),
        borderNormal: getVal('--border-normal', '#e6dfd8'),
        borderSubtle: getVal('--border-subtle', '#ebe6df'),
        success: getVal('--success', '#5db872'),
        successDim: getVal('--success-dim', 'rgba(93, 184, 114, 0.1)'),
        warning: getVal('--warning', '#d4a017'),
        warningDim: getVal('--warning-dim', 'rgba(212, 160, 23, 0.1)'),
        error: getVal('--error', '#c64545'),
        errorDim: getVal('--error-dim', 'rgba(198, 69, 69, 0.1)'),
      });
    };

    updateColors();

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
          updateColors();
        }
      });
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  return colors;
}
