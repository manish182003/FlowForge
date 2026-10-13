import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { StatusBadge } from './components/StatusBadge';
import { fetchHealth } from './services/api';

export function App() {
  const [healthData, setHealthData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastChecked, setLastChecked] = useState(null);

  const checkHealth = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchHealth();
      setHealthData(data);
      setLastChecked(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err.message);
      setHealthData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkHealth();
    // Poll health every 30 seconds
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  const isServerHealthy = healthData && healthData.status === 'ok';

  return (
    <div className="app-container">
      <Header isHealthy={isServerHealthy} serverStatus={healthData} />

      <main className="main-content">
        {/* Module 1 Banner */}
        <section className="panel">
          <div className="panel-header">
            <span className="panel-title">System Status — Module 1 Foundation</span>
            <button 
              className="btn btn-secondary" 
              onClick={checkHealth}
              disabled={loading}
            >
              {loading ? 'Pinging...' : 'Ping API'}
            </button>
          </div>
          <div className="panel-body">
            <div className="stats-grid">
              <div className="stat-card">
                <span className="stat-label">API Health</span>
                <span className="stat-value">
                  {loading && !healthData ? '...' : (isServerHealthy ? '200 OK' : 'OFFLINE')}
                </span>
                <span className="stat-hint">
                  {error ? error : `Last checked: ${lastChecked || 'Never'}`}
                </span>
              </div>

              <div className="stat-card">
                <span className="stat-label">Database Status</span>
                <span className="stat-value">
                  {healthData?.database?.state || 'UNAVAILABLE'}
                </span>
                <span className="stat-hint">
                  {healthData?.database?.name ? `DB: ${healthData.database.name}` : 'Awaiting Connection'}
                </span>
              </div>

              <div className="stat-card">
                <span className="stat-label">Node Process Uptime</span>
                <span className="stat-value">
                  {healthData?.uptime ? `${Math.floor(healthData.uptime)}s` : '0s'}
                </span>
                <span className="stat-hint">
                  PID: {healthData?.pid || '—'}
                </span>
              </div>

              <div className="stat-card">
                <span className="stat-label">Architecture Mode</span>
                <span className="stat-value">MODULAR</span>
                <span className="stat-hint">Phase 1 Foundation Active</span>
              </div>
            </div>
          </div>
        </section>

        {/* Diagnostic Snapshot */}
        <section className="panel">
          <div className="panel-header">
            <span className="panel-title">Health Check Response Payload</span>
            <StatusBadge 
              isHealthy={isServerHealthy} 
              text={isServerHealthy ? 'LIVE SNAPSHOT' : 'ERROR'} 
            />
          </div>
          <div className="panel-body">
            {error ? (
              <div className="code-box">
                Error connecting to API server: {error}
                {'\n'}Make sure the server is running on http://localhost:5000.
              </div>
            ) : (
              <pre className="code-box">
                {JSON.stringify(healthData, null, 2) || '// Fetching health data...'}
              </pre>
            )}
          </div>
        </section>

        {/* Phased Roadmap Overview */}
        <section className="panel">
          <div className="panel-header">
            <span className="panel-title">Development Roadmap Execution Matrix</span>
          </div>
          <div className="panel-body">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Phase</th>
                  <th>Module</th>
                  <th>Core Engineering Concepts</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>01</td>
                  <td>Application Foundation</td>
                  <td>Express, Mongoose, Zod Env Validation, Monochrome Design Tokens</td>
                  <td>IN PROGRESS</td>
                </tr>
                <tr>
                  <td>02</td>
                  <td>Workflow Data Modeling</td>
                  <td>Task Schemas, Directed Graph Models, Dependency Definitions</td>
                  <td>PENDING</td>
                </tr>
                <tr>
                  <td>03</td>
                  <td>Graph Algorithms (DSA)</td>
                  <td>Kahn's Topo Sort, Cycle Detection, Heap Scheduling, Critical Path</td>
                  <td>PENDING</td>
                </tr>
                <tr>
                  <td>04</td>
                  <td>Execution Engine & Queue</td>
                  <td>State Machine, BullMQ, Redis Leases, Idempotency, At-Least-Once</td>
                  <td>PENDING</td>
                </tr>
                <tr>
                  <td>05</td>
                  <td>Distributed Workers</td>
                  <td>Multi-Process Workers, Heartbeats, Poison Pill Recovery, Concurrency</td>
                  <td>PENDING</td>
                </tr>
                <tr>
                  <td>06</td>
                  <td>Real-Time Observability</td>
                  <td>Native WebSockets, Live Graph Visualizer, Execution Logs</td>
                  <td>PENDING</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <footer className="app-footer">
        <span>FlowForge Distributed Scheduler</span>
        <span>Strict Monochrome Architecture</span>
      </footer>
    </div>
  );
}
export default App;

