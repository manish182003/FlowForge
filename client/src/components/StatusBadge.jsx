import React from 'react';

/**
 * StatusBadge Component
 * Displays system status with strict monochrome styling.
 * 
 * Props:
 * - isHealthy: boolean - true if system is healthy/connected
 * - text: string - label text to display
 */
export function StatusBadge({ isHealthy, text }) {
  const badgeClass = isHealthy ? 'badge badge-connected' : 'badge badge-disconnected';
  const dotClass = isHealthy ? 'badge-dot' : 'badge-dot-muted';

  return (
    <span className={badgeClass}>
      <span className={dotClass} />
      {text}
    </span>
  );
}

