import React from 'react';
import { StatusBadge } from './StatusBadge';

/**
 * Header Component
 * Application top bar containing branding, global action tools, and live connection status badges.
 */
export function Header({ 
  isHealthy, 
  serverStatus, 
  wsConnected, 
  activeTab, 
  setActiveTab,
  onOpenChaos,
  onOpenCluster
}) {
  return (
    <header className="app-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-6)' }}>
        <div className="brand" onClick={() => setActiveTab && setActiveTab('workflows')} style={{ cursor: 'pointer' }}>
          <span className="brand-logo">FF</span>
          <span className="brand-title">FLOWFORGE</span>
        </div>

        {/* Global Navigation Tabs */}
        {setActiveTab && (
          <nav style={{ display: 'flex', gap: 'var(--space-1)' }}>
            <button
              onClick={() => setActiveTab('workflows')}
              className={`btn ${activeTab === 'workflows' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '4px 12px', fontSize: 'var(--text-xs)' }}
            >
              DAG Canvas
            </button>
            <button
              onClick={() => setActiveTab('diagnostics')}
              className={`btn ${activeTab === 'diagnostics' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '4px 12px', fontSize: 'var(--text-xs)' }}
            >
              System & Roadmap
            </button>
          </nav>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        {/* Global Cluster & Chaos Quick Triggers */}
        {onOpenCluster && (
          <button
            className="btn btn-secondary"
            onClick={onOpenCluster}
            title="Consistent Hash Ring [0, 2^32-1], Virtual Nodes, and Migration Simulator"
            style={{ padding: '4px 10px', fontSize: 'var(--text-xs)' }}
          >
            🔄 Cluster Ring
          </button>
        )}

        {onOpenChaos && (
          <button
            className="btn btn-secondary"
            onClick={onOpenChaos}
            title="Simulate worker crashes, lease expirations, and test watchdog reapers"
            style={{ padding: '4px 10px', fontSize: 'var(--text-xs)' }}
          >
            ⚡ Chaos & Fleet
          </button>
        )}

        <div className="header-status">
          <StatusBadge 
            isHealthy={isHealthy} 
            text={isHealthy ? `API: ${serverStatus?.status || 'ONLINE'}` : 'API: OFFLINE'} 
          />
          <StatusBadge 
            isHealthy={wsConnected} 
            text={wsConnected ? 'WS: LIVE' : 'WS: CONNECTING'} 
          />
        </div>
      </div>
    </header>
  );
}

export default Header;
