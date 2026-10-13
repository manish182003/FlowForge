import React, { useState, useEffect } from 'react';
import { fetchWorkers, expireWorkerLease, triggerReaperSweep } from '../services/chaosApi';

/**
 * Chaos & Worker Fleet Recovery Modal Component.
 * Strict monochrome design for testing worker crashes and the Reaper watchdog.
 */
export function ChaosPanel({ isOpen, onClose, onActionLogged }) {
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [reaperResult, setReaperResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      loadWorkers();
    }
  }, [isOpen]);

  const loadWorkers = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchWorkers();
      setWorkers(res.data || []);
    } catch (err) {
      setError('Failed to fetch workers: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExpireLease = async (workerId) => {
    try {
      setLoading(true);
      setError(null);
      await expireWorkerLease(workerId, 60000);
      if (onActionLogged) {
        onActionLogged(`Simulated crash for worker "${workerId}": lease expired.`);
      }
      await loadWorkers();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTriggerReaper = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await triggerReaperSweep(15000);
      setReaperResult(res.data);
      if (onActionLogged) {
        onActionLogged(`Reaper sweep triggered: ${res.data.deadWorkersCount} dead workers detected, ${res.data.reclaimedTasksCount} orphaned tasks reclaimed.`);
      }
      await loadWorkers();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal-card" style={{ maxWidth: '640px' }}>
        <div className="modal-header">
          <div>
            <h3>Chaos Engineering & Worker Fleet Watchdog</h3>
            <span style={{ fontSize: '11px', color: '#888888' }}>
              Simulate worker crashes, test lease timeouts, and trigger the Reaper
            </span>
          </div>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        {error && <div className="modal-error">{error}</div>}

        <div style={{ padding: '16px 0', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Worker Pool ({workers.length} nodes)
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={loadWorkers}
                disabled={loading}
              >
                Refresh Fleet
              </button>
              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={handleTriggerReaper}
                disabled={loading}
              >
                Trigger Reaper Sweep
              </button>
            </div>
          </div>

          {reaperResult && (
            <div className="panel" style={{ padding: '10px 14px', backgroundColor: '#141414', border: '1px solid #333333' }}>
              <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                &gt; Reaper Summary: {reaperResult.deadWorkersCount} dead worker(s) evicted, {reaperResult.reclaimedTasksCount} orphaned task(s) reclaimed.
              </span>
            </div>
          )}

          <div className="table-container" style={{ maxHeight: '220px', overflowY: 'auto' }}>
            {workers.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#777777', fontStyle: 'italic', fontSize: '12px' }}>
                No active workers reported heartbeats yet. Start a worker process using <code>npm run worker</code>.
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Worker ID</th>
                    <th>Status</th>
                    <th>Last Heartbeat</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {workers.map(w => {
                    const isDead = w.status === 'DEAD' || (Date.now() - new Date(w.lastHeartbeat).getTime() > 15000);
                    return (
                      <tr key={w.workerId}>
                        <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{w.workerId}</td>
                        <td>
                          <span className={`badge ${isDead ? 'badge-disconnected' : 'badge-connected'}`}>
                            {isDead ? 'DEAD / EXPIRED' : 'ACTIVE'}
                          </span>
                        </td>
                        <td style={{ fontSize: '11px', color: '#aaaaaa' }}>
                          {new Date(w.lastHeartbeat).toLocaleTimeString()}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: '2px 8px', fontSize: '11px' }}
                            onClick={() => handleExpireLease(w.workerId)}
                            disabled={loading || isDead}
                            title="Artificially wind back worker heartbeat to trigger lease expiry"
                          >
                            Crash / Expire
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div style={{ fontSize: '11px', color: '#777777', lineHeight: 1.5, borderTop: '1px solid #222222', paddingTop: '12px' }}>
            <strong>How the Reaper Works:</strong> Workers renew their heartbeat lease every 5 seconds. If a worker process halts or crashes, its lease expires after 15 seconds. The Reaper atomically claims any tasks stuck in <code>RUNNING</code>, either re-scheduling them with exponential backoff or terminally failing them if retries are exhausted.
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
