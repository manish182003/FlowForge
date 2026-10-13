import React from 'react';
import { StatusBadge } from './StatusBadge';

/**
 * Header Component
 * Application top bar containing branding and live backend connection badge.
 */
export function Header({ isHealthy, serverStatus }) {
  return (
    <header className="app-header">
      <div className="brand">
        <span className="brand-logo">FF</span>
        <span className="brand-title">FLOWFORGE</span>
      </div>

      <div className="header-status">
        <StatusBadge 
          isHealthy={isHealthy} 
          text={isHealthy ? `API: ${serverStatus?.status || 'ONLINE'}` : 'API: DISCONNECTED'} 
        />
      </div>
    </header>
  );
}

