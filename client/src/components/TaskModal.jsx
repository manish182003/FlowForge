import React, { useState, useEffect } from 'react';

const ALLOWED_TYPES = [
  { value: 'simulated', label: 'Simulated Task' },
  { value: 'http_request', label: 'HTTP Request (Allowlisted)' },
  { value: 'file_validation', label: 'File Validation (CSV/JSON)' },
  { value: 'data_transformation', label: 'Data Transformation' },
  { value: 'report_generation', label: 'Report Generation' }
];

export function TaskModal({ isOpen, onClose, onSave, existingTask, allTasks = [] }) {
  const [taskId, setTaskId] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState('simulated');
  const [priority, setPriority] = useState(5);
  const [maxRetries, setMaxRetries] = useState(3);
  const [backoffMs, setBackoffMs] = useState(1000);
  const [dependencies, setDependencies] = useState([]);
  const [rawInput, setRawInput] = useState('{}');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (existingTask) {
      setTaskId(existingTask.taskId || '');
      setName(existingTask.name || '');
      setType(existingTask.type || 'simulated');
      setPriority(existingTask.priority || 5);
      setMaxRetries(existingTask.retryPolicy?.maxRetries ?? 3);
      setBackoffMs(existingTask.retryPolicy?.backoffMs ?? 1000);
      setDependencies(existingTask.dependencies || []);
      setRawInput(JSON.stringify(existingTask.input || {}, null, 2));
    } else {
      const generatedId = `task_${Date.now().toString().slice(-4)}`;
      setTaskId(generatedId);
      setName('');
      setType('simulated');
      setPriority(5);
      setMaxRetries(3);
      setBackoffMs(1000);
      setDependencies([]);
      setRawInput('{}');
    }
    setError(null);
  }, [existingTask, isOpen]);

  if (!isOpen) return null;

  const toggleDependency = (depId) => {
    setDependencies(prev => 
      prev.includes(depId) 
        ? prev.filter(id => id !== depId) 
        : [...prev, depId]
    );
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    setError(null);

    if (!taskId.trim()) {
      setError('Task ID is required');
      return;
    }
    if (!name.trim()) {
      setError('Task Name is required');
      return;
    }

    let parsedInput = {};
    try {
      parsedInput = JSON.parse(rawInput);
    } catch (_) {
      setError('Input configuration must be valid JSON');
      return;
    }

    const taskData = {
      taskId: taskId.trim(),
      name: name.trim(),
      type,
      priority: Number(priority),
      retryPolicy: {
        maxRetries: Number(maxRetries),
        backoffMs: Number(backoffMs)
      },
      dependencies,
      input: parsedInput,
      uiPosition: existingTask?.uiPosition || {
        x: 100 + (allTasks.length * 70) % 400,
        y: 100 + (allTasks.length * 60) % 300
      }
    };

    onSave(taskData);
  };

  // Other tasks that can be dependencies (cannot depend on itself)
  const availablePrerequisites = allTasks.filter(t => t.taskId !== taskId);

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-header">
          <h3>{existingTask ? 'Edit Task' : 'Add New Task'}</h3>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        {error && <div className="modal-error">{error}</div>}

        <form onSubmit={handleFormSubmit} className="modal-form">
          <div className="form-row">
            <div className="form-group">
              <label>Task Identifier (Unique)</label>
              <input 
                type="text" 
                value={taskId} 
                onChange={e => setTaskId(e.target.value)}
                disabled={!!existingTask}
                placeholder="e.g. download_csv"
                className="input-field"
                required
              />
            </div>
            <div className="form-group">
              <label>Task Name</label>
              <input 
                type="text" 
                value={name} 
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Download File"
                className="input-field"
                required
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Task Type</label>
              <select 
                value={type} 
                onChange={e => setType(e.target.value)}
                className="input-field"
              >
                {ALLOWED_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Priority (1-10, Higher = Scheduled First)</label>
              <input 
                type="number" 
                min="1" 
                max="10" 
                value={priority} 
                onChange={e => setPriority(e.target.value)}
                className="input-field"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Max Retries</label>
              <input 
                type="number" 
                min="0" 
                max="10" 
                value={maxRetries} 
                onChange={e => setMaxRetries(e.target.value)}
                className="input-field"
              />
            </div>
            <div className="form-group">
              <label>Retry Backoff (ms)</label>
              <input 
                type="number" 
                min="100" 
                step="500" 
                value={backoffMs} 
                onChange={e => setBackoffMs(e.target.value)}
                className="input-field"
              />
            </div>
          </div>

          {/* Dependencies / Prerequisites Selection */}
          <div className="form-group">
            <label>Prerequisites (Tasks that must succeed before this task runs)</label>
            {availablePrerequisites.length === 0 ? (
              <div className="empty-hint">No other tasks in workflow yet.</div>
            ) : (
              <div className="checkbox-list">
                {availablePrerequisites.map(prereq => (
                  <label key={prereq.taskId} className="checkbox-item">
                    <input 
                      type="checkbox"
                      checked={dependencies.includes(prereq.taskId)}
                      onChange={() => toggleDependency(prereq.taskId)}
                    />
                    <span>{prereq.name} <code>({prereq.taskId})</code></span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Quick Presets for Simulated Tasks */}
          {type === 'simulated' && (
            <div className="form-group">
              <label>Failure Injection & Chaos Presets</label>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ fontSize: '11px', padding: '3px 8px' }}
                  onClick={() => setRawInput(JSON.stringify({ delayMs: 100, sampleData: { status: 'success' } }, null, 2))}
                >
                  Normal (100ms)
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ fontSize: '11px', padding: '3px 8px' }}
                  onClick={() => setRawInput(JSON.stringify({ delayMs: 200, failAttempts: 2, failureMessage: 'Transient simulated timeout' }, null, 2))}
                >
                  Fail 2x then Succeed
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ fontSize: '11px', padding: '3px 8px' }}
                  onClick={() => setRawInput(JSON.stringify({ simulateTimeout: true, timeoutMs: 1000 }, null, 2))}
                >
                  Simulate Timeout (1s)
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ fontSize: '11px', padding: '3px 8px' }}
                  onClick={() => setRawInput(JSON.stringify({ shouldFail: true, failureMessage: 'Intentional fatal error' }, null, 2))}
                >
                  Fatal Failure
                </button>
              </div>
            </div>
          )}

          {/* Raw Input JSON */}
          <div className="form-group">
            <label>Task Payload Input (JSON)</label>
            <textarea 
              value={rawInput} 
              onChange={e => setRawInput(e.target.value)}
              className="textarea-field"
              rows="3"
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Save Task
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

