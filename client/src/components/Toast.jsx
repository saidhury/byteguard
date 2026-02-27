import React, { useEffect } from 'react';

/**
 * Toast — brief notification banner.
 * Colour mapping uses CSS custom properties for theme awareness.
 */
const palette = {
  success: { bg: 'var(--success-soft)', border: 'var(--success)', color: 'var(--success)' },
  error:   { bg: 'var(--error-soft)',   border: 'var(--error)',   color: 'var(--error)' },
  warning: { bg: 'var(--warning-soft)', border: 'var(--warning)', color: 'var(--warning)' },
  info:    { bg: 'var(--info-soft)',     border: 'var(--info)',    color: 'var(--info)' },
};

export default function Toast({ message, type = 'info', onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);

  const icons = { success: '✓', error: '✗', warning: '⚠', info: 'ℹ' };
  const p = palette[type] || palette.info;

  return (
    <div
      className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm cursor-pointer animate-slide-in min-w-[250px] max-w-[400px] backdrop-blur-lg"
      style={{ background: p.bg, border: `1px solid ${p.border}`, color: p.color }}
      onClick={onClose}
    >
      <span className="text-base font-bold">{icons[type] || icons.info}</span>
      <span className="flex-1">{message}</span>
    </div>
  );
}
