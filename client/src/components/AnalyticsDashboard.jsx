import React from 'react';

/**
 * Analytics Dashboard Component.
 * Visualizes makespan, parallel speedup, critical path bottleneck chain,
 * and a Gantt-style timeline breakdown of task execution.
 * 
 * Follows strict monochrome black-and-white visual identity.
 * 
 * @param {Object} props
 * @param {boolean} props.isOpen
 * @param {Function} props.onClose
 * @param {Object|null} props.analytics
 * @param {boolean} props.loading
 * @param {Function} props.onRefresh
 */
export function AnalyticsDashboard({ 
  isOpen, 
  onClose, 
  analytics, 
  loading = false, 
  onRefresh 
}) {
  if (!isOpen) return null;

  const actualMakespan = analytics?.actualMakespanMs || 0;
  const criticalMakespan = analytics?.criticalMakespanMs || 0;
  const sequentialWork = analytics?.totalSequentialMs || 0;
  const speedup = analytics?.speedupFactor || 1.0;
  const criticalPath = analytics?.criticalPath || [];
  const tasks = analytics?.tasks || [];

  const maxTimelineWidth = Math.max(actualMakespan, criticalMakespan, 1);

  return (
    <div className="modal-backdrop">
      <div className="modal-card" style={{ maxWidth: '780px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <div>
            <h3>Execution Analytics & Critical-Path Analysis</h3>
            <span style={{ fontSize: '11px', color: '#888888' }}>
              Run ID: <code>{analytics?.runId || '—'}</code> • Status: <strong>{analytics?.status || '—'}</strong>
            </span>
          </div>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        <div style={{ padding: '16px 0', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Top Actions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#888888' }}>
              Workflow: <strong>{analytics?.workflowName || '—'}</strong>
            </span>
            {onRefresh && (
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={onRefresh}
                disabled={loading}
              >
                {loading ? 'Refreshing...' : 'Refresh Metrics'}
              </button>
            )}
          </div>

          {/* Key Metrics Grid */}
          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-label">Actual Makespan</span>
              <span className="stat-value">{actualMakespan}ms</span>
              <span className="stat-hint">Wall-clock execution time</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Sequential Work</span>
              <span className="stat-value">{sequentialWork}ms</span>
              <span className="stat-hint">Sum of task run times</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Parallel Speedup</span>
              <span className="stat-value">{speedup}×</span>
              <span className="stat-hint">Sequential / Actual Makespan</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Critical Makespan</span>
              <span className="stat-value">{criticalMakespan}ms</span>
              <span className="stat-hint">Theoretical minimum time</span>
            </div>
          </div>

          {/* Critical Path Chain */}
          <div className="panel" style={{ padding: '14px 16px', backgroundColor: '#141414', border: '1px solid #333333' }}>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#888888', marginBottom: '8px' }}>
              Critical Bottleneck Path ({criticalPath.length} tasks)
            </div>
            {criticalPath.length === 0 ? (
              <div style={{ fontSize: '12px', color: '#666666', fontStyle: 'italic' }}>
                No completed tasks to calculate critical path.
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                {criticalPath.map((taskId, idx) => (
                  <React.Fragment key={taskId}>
                    <span 
                      style={{ 
                        fontFamily: 'monospace', 
                        fontSize: '12px', 
                        padding: '3px 8px', 
                        backgroundColor: '#ffffff', 
                        color: '#000000', 
                        fontWeight: 700, 
                        borderRadius: '2px' 
                      }}
                    >
                      {taskId}
                    </span>
                    {idx < criticalPath.length - 1 && (
                      <span style={{ color: '#888888', fontWeight: 700 }}>➔</span>
                    )}
                  </React.Fragment>
                ))}
              </div>
            )}
            <div style={{ fontSize: '10px', color: '#777777', marginTop: '8px' }}>
              * According to Amdahl's Law, total workflow execution time can only be shortened by optimizing tasks on this critical chain.
            </div>
          </div>

          {/* Gantt-Style Execution Timeline */}
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>
              Task Execution Timeline Breakdown (Gantt Chart)
            </div>

            {tasks.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#777777', fontStyle: 'italic' }}>
                No task execution data available.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid #282828', padding: '12px', borderRadius: '4px', backgroundColor: '#0d0d0d' }}>
                {tasks.map(task => {
                  const offsetPct = Math.min(100, Math.max(0, (task.startOffsetMs / maxTimelineWidth) * 100));
                  const widthPct = Math.min(100 - offsetPct, Math.max(2, (task.durationMs / maxTimelineWidth) * 100));
                  const isCritical = task.isCritical;

                  return (
                    <div key={task.taskId} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontFamily: 'monospace' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontWeight: 600, color: isCritical ? '#ffffff' : '#aaaaaa' }}>
                            {task.name}
                          </span>
                          <span style={{ color: '#666666' }}>({task.taskId})</span>
                          {isCritical && (
                            <span style={{ backgroundColor: '#ffffff', color: '#000000', padding: '0 4px', fontSize: '9px', fontWeight: 800, borderRadius: '2px' }}>
                              CRITICAL
                            </span>
                          )}
                        </div>
                        <span style={{ color: '#888888' }}>
                          {task.durationMs}ms (Queue: {task.queueLatencyMs}ms)
                        </span>
                      </div>

                      {/* Bar Track */}
                      <div style={{ width: '100%', height: '14px', backgroundColor: '#1a1a1a', borderRadius: '2px', position: 'relative', overflow: 'hidden' }}>
                        <div 
                          style={{
                            position: 'absolute',
                            left: `${offsetPct}%`,
                            width: `${widthPct}%`,
                            height: '100%',
                            backgroundColor: isCritical ? '#ffffff' : '#666666',
                            borderRadius: '2px'
                          }}
                          title={`Offset: ${task.startOffsetMs}ms, Duration: ${task.durationMs}ms`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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

