import React, { useState, useEffect, useRef } from 'react';

/**
 * Terminal-style monochrome live telemetry and log viewer.
 * Follows strict monochrome black-and-white visual identity.
 * 
 * @param {Object} props
 * @param {Array} props.logs - List of log entries
 * @param {boolean} props.isConnected - WebSocket connection status
 * @param {Function} props.onClearLogs - Callback to clear log buffer
 */
export function LogViewer({ logs = [], isConnected = false, onClearLogs }) {
  const [filterLevel, setFilterLevel] = useState('all'); // 'all' | 'info' | 'warn' | 'error'
  const [filterTaskId, setFilterTaskId] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const logContainerRef = useRef(null);

  // Auto-scroll to bottom on new log records
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const filteredLogs = logs.filter(log => {
    if (filterLevel !== 'all' && log.level !== filterLevel) {
      return false;
    }
    if (filterTaskId && !log.taskId.toLowerCase().includes(filterTaskId.toLowerCase())) {
      return false;
    }
    return true;
  });

  const formatTimestamp = (isoString) => {
    if (!isoString) return '--:--:--';
    try {
      const d = new Date(isoString);
      return d.toTimeString().split(' ')[0] + '.' + String(d.getMilliseconds()).padStart(3, '0');
    } catch (_) {
      return isoString;
    }
  };

  return (
    <div className="log-viewer">
      <div className="log-viewer-header">
        <div className="log-viewer-title-group">
          <span className="log-viewer-title">EXECUTION TELEMETRY</span>
          <span className={`ws-badge ${isConnected ? 'ws-connected' : 'ws-disconnected'}`}>
            <span className="ws-dot"></span>
            {isConnected ? 'LIVE WS' : 'DISCONNECTED'}
          </span>
          <span className="log-count-tag">{filteredLogs.length} entries</span>
        </div>

        <div className="log-viewer-controls">
          <div className="log-filter-group">
            {['all', 'info', 'warn', 'error'].map(lvl => (
              <button
                key={lvl}
                type="button"
                className={`filter-btn ${filterLevel === lvl ? 'filter-btn-active' : ''}`}
                onClick={() => setFilterLevel(lvl)}
              >
                {lvl.toUpperCase()}
              </button>
            ))}
          </div>

          <input
            type="text"
            className="task-filter-input"
            placeholder="Filter by Task ID..."
            value={filterTaskId}
            onChange={(e) => setFilterTaskId(e.target.value)}
          />

          <label className="auto-scroll-toggle">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
            />
            <span>Auto-scroll</span>
          </label>

          {onClearLogs && (
            <button
              type="button"
              className="clear-logs-btn"
              onClick={onClearLogs}
              title="Clear visible logs"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="log-viewer-body" ref={logContainerRef}>
        {filteredLogs.length === 0 ? (
          <div className="log-empty-state">
            <span className="empty-state-prompt">&gt;</span> No execution logs recorded yet. Run a workflow to observe real-time telemetry.
          </div>
        ) : (
          filteredLogs.map((log, idx) => (
            <div key={log._id || `${log.timestamp}-${idx}`} className={`log-line log-level-${log.level}`}>
              <span className="log-time">[{formatTimestamp(log.timestamp)}]</span>
              <span className={`log-tag log-tag-${log.level}`}>
                [{log.level.toUpperCase()}]
              </span>
              <span className="log-task">[{log.taskId}]</span>
              <span className="log-message">{log.message}</span>
              {log.details && (
                <pre className="log-details">
                  {typeof log.details === 'object' ? JSON.stringify(log.details, null, 2) : String(log.details)}
                </pre>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

