import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { StatusBadge } from './components/StatusBadge';
import { GraphCanvas } from './components/GraphCanvas';
import { TaskModal } from './components/TaskModal';
import { ChaosPanel } from './components/ChaosPanel';
import { LogViewer } from './components/LogViewer';
import { useWebSocket } from './hooks/useWebSocket';
import { fetchHealth } from './services/api';
import { 
  fetchWorkflows, 
  createWorkflow, 
  updateWorkflow, 
  deleteWorkflow,
  triggerWorkflowRun,
  fetchWorkflowRuns,
  fetchRunSnapshot,
  fetchRunLogs,
  cancelRun
} from './services/workflowApi';

// Sample blueprint for quick onboarding and testing
const SAMPLE_WORKFLOW = {
  name: 'ETL Pipeline Demo',
  description: 'Download CSV -> Validate Schema -> Transform Records -> Generate Report',
  tasks: [
    {
      taskId: 'download_data',
      name: 'Download CSV Data',
      type: 'http_request',
      priority: 8,
      dependencies: [],
      retryPolicy: { maxRetries: 3, backoffMs: 1000 },
      input: { url: 'https://example.com/data.csv' },
      uiPosition: { x: 50, y: 180 }
    },
    {
      taskId: 'validate_schema',
      name: 'Validate CSV Format',
      type: 'file_validation',
      priority: 7,
      dependencies: ['download_data'],
      retryPolicy: { maxRetries: 2, backoffMs: 1000 },
      input: { format: 'csv', strict: true },
      uiPosition: { x: 300, y: 100 }
    },
    {
      taskId: 'sanitize_rows',
      name: 'Sanitize Bad Rows',
      type: 'data_transformation',
      priority: 5,
      dependencies: ['download_data'],
      retryPolicy: { maxRetries: 2, backoffMs: 1000 },
      input: { op: 'clean_nulls' },
      uiPosition: { x: 300, y: 260 }
    },
    {
      taskId: 'aggregate_metrics',
      name: 'Transform & Aggregate',
      type: 'data_transformation',
      priority: 6,
      dependencies: ['validate_schema', 'sanitize_rows'],
      retryPolicy: { maxRetries: 3, backoffMs: 2000 },
      input: { groupBy: 'region' },
      uiPosition: { x: 560, y: 180 }
    },
    {
      taskId: 'export_report',
      name: 'Generate Final PDF',
      type: 'report_generation',
      priority: 9,
      dependencies: ['aggregate_metrics'],
      retryPolicy: { maxRetries: 1, backoffMs: 5000 },
      input: { format: 'pdf' },
      uiPosition: { x: 820, y: 180 }
    }
  ]
};

export function App() {
  const [activeTab, setActiveTab] = useState('workflows');
  const [healthData, setHealthData] = useState(null);
  const [workflows, setWorkflows] = useState([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState(null);
  const [loading, setLoading] = useState(false);
  const [bannerMessage, setBannerMessage] = useState(null);
  const [bannerError, setBannerError] = useState(null);

  // Task Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isChaosModalOpen, setIsChaosModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [selectedTaskId, setSelectedTaskId] = useState(null);

  const [activeRun, setActiveRun] = useState(null);
  const [runHistory, setRunHistory] = useState([]);
  const [executionLogs, setExecutionLogs] = useState([]);

  // Module 6: Real-Time WebSocket Telemetry
  const { isConnected: isWsConnected } = useWebSocket({
    runId: activeRun?.workflowRun?._id || null,
    onTaskStateChange: (payload) => {
      setActiveRun(prev => {
        if (!prev || !prev.taskRuns) return prev;
        const updatedTaskRuns = prev.taskRuns.map(tr => {
          if (tr._id === payload.taskRunId || tr.taskId === payload.taskId) {
            return { ...tr, ...payload };
          }
          return tr;
        });
        return { ...prev, taskRuns: updatedTaskRuns };
      });
    },
    onWorkflowStateChange: (payload) => {
      setActiveRun(prev => {
        if (!prev || !prev.workflowRun) return prev;
        return {
          ...prev,
          workflowRun: { ...prev.workflowRun, ...payload }
        };
      });
      // Refresh run history status
      if (selectedWorkflow?._id) {
        loadRuns(selectedWorkflow._id, false);
      }
    },
    onLogMessage: (payload) => {
      setExecutionLogs(prev => [...prev, payload]);
    },
    onReconnect: async (currentRunId) => {
      if (currentRunId) {
        try {
          const [snapshotRes, logsRes] = await Promise.all([
            fetchRunSnapshot(currentRunId),
            fetchRunLogs(currentRunId)
          ]);
          setActiveRun(snapshotRes.data);
          setExecutionLogs(logsRes.data || []);
        } catch (_) {}
      }
    }
  });

  // Fetch health and workflows on mount
  useEffect(() => {
    loadHealth();
    loadWorkflows();
  }, []);

  const loadHealth = async () => {
    try {
      const data = await fetchHealth();
      setHealthData(data);
    } catch (_) {
      setHealthData(null);
    }
  };

  const loadRuns = async (workflowId, selectFirst = true) => {
    if (!workflowId) return;
    try {
      const res = await fetchWorkflowRuns(workflowId);
      setRunHistory(res.data || []);
      if (res.data?.length > 0 && (selectFirst || !activeRun)) {
        const snapshot = await fetchRunSnapshot(res.data[0]._id);
        setActiveRun(snapshot.data);
        const logsRes = await fetchRunLogs(res.data[0]._id);
        setExecutionLogs(logsRes.data || []);
      }
    } catch (_) {}
  };

  const loadWorkflows = async () => {
    try {
      setLoading(true);
      const res = await fetchWorkflows();
      setWorkflows(res.data || []);
      if (res.data?.length > 0 && !selectedWorkflow) {
        setSelectedWorkflow(res.data[0]);
        loadRuns(res.data[0]._id, true);
      }
    } catch (err) {
      setBannerError('Failed to load workflows: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectRun = async (runId) => {
    try {
      const [snapshotRes, logsRes] = await Promise.all([
        fetchRunSnapshot(runId),
        fetchRunLogs(runId)
      ]);
      setActiveRun(snapshotRes.data);
      setExecutionLogs(logsRes.data || []);
    } catch (err) {
      showError('Failed to load run snapshot: ' + err.message);
    }
  };

  const handleRunWorkflow = async () => {
    if (!selectedWorkflow?._id) {
      showError('Please save the workflow first before executing.');
      return;
    }
    try {
      setLoading(true);
      setExecutionLogs([]);
      const res = await triggerWorkflowRun(selectedWorkflow._id);
      setActiveRun(res.data);
      showNotification(`Execution triggered! Run ID: ${res.data.workflowRun._id}`);
      loadRuns(selectedWorkflow._id, false);
    } catch (err) {
      showError('Failed to trigger execution: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelRun = async () => {
    if (!activeRun?.workflowRun?._id) return;
    try {
      await cancelRun(activeRun.workflowRun._id, 'Manually cancelled from UI');
      const snapshot = await fetchRunSnapshot(activeRun.workflowRun._id);
      setActiveRun(snapshot.data);
      showNotification('Workflow run cancelled');
    } catch (err) {
      showError('Failed to cancel run: ' + err.message);
    }
  };

  const showNotification = (msg) => {
    setBannerMessage(msg);
    setBannerError(null);
    setTimeout(() => setBannerMessage(null), 4000);
  };

  const showError = (err) => {
    setBannerError(err);
    setBannerMessage(null);
  };

  // Node position update from canvas dragging
  const handleUpdateTaskPosition = (taskId, newPos) => {
    if (!selectedWorkflow) return;
    setSelectedWorkflow(prev => ({
      ...prev,
      tasks: prev.tasks.map(t => 
        t.taskId === taskId ? { ...t, uiPosition: newPos } : t
      )
    }));
  };

  // Save new task or update existing
  const handleSaveTask = (taskData) => {
    if (!selectedWorkflow) return;

    const exists = selectedWorkflow.tasks.some(t => t.taskId === taskData.taskId);
    let updatedTasks;

    if (exists) {
      updatedTasks = selectedWorkflow.tasks.map(t => 
        t.taskId === taskData.taskId ? taskData : t
      );
    } else {
      updatedTasks = [...selectedWorkflow.tasks, taskData];
    }

    setSelectedWorkflow(prev => ({
      ...prev,
      tasks: updatedTasks
    }));

    setIsModalOpen(false);
    setEditingTask(null);
  };

  // Delete task from current workflow
  const handleDeleteTask = (taskIdToDelete) => {
    if (!selectedWorkflow) return;
    setSelectedWorkflow(prev => ({
      ...prev,
      tasks: prev.tasks
        .filter(t => t.taskId !== taskIdToDelete)
        // Also remove as a dependency from any downstream tasks
        .map(t => ({
          ...t,
          dependencies: (t.dependencies || []).filter(dep => dep !== taskIdToDelete)
        }))
    }));
    setSelectedTaskId(null);
  };

  // Save workflow to backend
  const handlePersistWorkflow = async () => {
    if (!selectedWorkflow) return;
    try {
      setLoading(true);
      if (selectedWorkflow._id) {
        const res = await updateWorkflow(selectedWorkflow._id, selectedWorkflow);
        setSelectedWorkflow(res.data);
        showNotification('Workflow saved successfully to database');
      } else {
        const res = await createWorkflow(selectedWorkflow);
        setSelectedWorkflow(res.data);
        showNotification('New workflow created and persisted');
      }
      loadWorkflows();
    } catch (err) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Create new blank workflow
  const handleCreateNewWorkflow = () => {
    const newWf = {
      name: `Workflow ${workflows.length + 1}`,
      description: 'Custom directed workflow graph',
      tasks: []
    };
    setSelectedWorkflow(newWf);
    setSelectedTaskId(null);
  };

  // Load sample pipeline
  const handleLoadSample = () => {
    setSelectedWorkflow({ ...SAMPLE_WORKFLOW });
    setSelectedTaskId(null);
    showNotification('Sample ETL Pipeline loaded. Click "Save Workflow" to persist.');
  };

  // Delete active workflow
  const handleDeleteActiveWorkflow = async () => {
    if (!selectedWorkflow?._id) {
      setSelectedWorkflow(null);
      return;
    }
    if (!window.confirm(`Delete workflow "${selectedWorkflow.name}"?`)) return;

    try {
      setLoading(true);
      await deleteWorkflow(selectedWorkflow._id);
      showNotification('Workflow deleted');
      setSelectedWorkflow(null);
      loadWorkflows();
    } catch (err) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const isServerHealthy = healthData && healthData.status === 'ok';

  return (
    <div className="app-container">
      <Header isHealthy={isServerHealthy} serverStatus={healthData} wsConnected={isWsConnected} />

      <main className="main-content">
        {/* Navigation Tabs */}
        <div className="tabs-nav">
          <button 
            className={`tab-btn ${activeTab === 'workflows' ? 'active' : ''}`}
            onClick={() => setActiveTab('workflows')}
          >
            [01] WORKFLOWS & DAG CANVAS
          </button>
          <button 
            className={`tab-btn ${activeTab === 'diagnostics' ? 'active' : ''}`}
            onClick={() => setActiveTab('diagnostics')}
          >
            [02] SYSTEM DIAGNOSTICS & ROADMAP
          </button>
        </div>

        {/* Banner Alerts (Monochrome) */}
        {bannerMessage && (
          <div className="panel" style={{ padding: '12px 16px', borderColor: '#ffffff' }}>
            <strong>NOTICE:</strong> {bannerMessage}
          </div>
        )}
        {bannerError && (
          <div className="panel" style={{ padding: '12px 16px', borderColor: '#ffffff', backgroundColor: '#1a1010' }}>
            <strong>ERROR:</strong> {bannerError}
          </div>
        )}

        {/* TAB 1: WORKFLOWS & GRAPH CANVAS */}
        {activeTab === 'workflows' && (
          <div className="workflow-editor-grid">
            {/* Sidebar */}
            <aside className="workflow-sidebar">
              <div className="panel">
                <div className="panel-header">
                  <span className="panel-title">Workflows</span>
                  <button className="btn btn-primary" onClick={handleCreateNewWorkflow}>
                    + New
                  </button>
                </div>
                <div className="panel-body">
                  <div className="workflow-list">
                    {workflows.length === 0 ? (
                      <div className="empty-hint">No saved workflows found in database.</div>
                    ) : (
                      workflows.map(wf => (
                        <div 
                          key={wf._id}
                          className={`workflow-list-item ${selectedWorkflow?._id === wf._id ? 'selected' : ''}`}
                          onClick={() => {
                            setSelectedWorkflow(wf);
                            setSelectedTaskId(null);
                            loadRuns(wf._id, true);
                          }}
                        >
                          <div className="workflow-item-name">{wf.name}</div>
                          <div className="workflow-item-meta">
                            {wf.tasks?.length || 0} tasks • {wf.status}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="panel">
                <div className="panel-header">
                  <span className="panel-title">Templates</span>
                </div>
                <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <button className="btn btn-secondary" onClick={handleLoadSample}>
                    Load ETL Pipeline Demo
                  </button>
                </div>
              </div>

              {/* Execution Run History */}
              {selectedWorkflow?._id && (
                <div className="panel">
                  <div className="panel-header">
                    <span className="panel-title">Run History</span>
                    <span className="badge badge-default">{runHistory.length}</span>
                  </div>
                  <div className="panel-body" style={{ maxHeight: '200px', overflowY: 'auto', padding: '8px' }}>
                    {runHistory.length === 0 ? (
                      <div className="empty-hint">No executions recorded yet.</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {runHistory.map(run => (
                          <div
                            key={run._id}
                            className={`workflow-list-item ${activeRun?.workflowRun?._id === run._id ? 'selected' : ''}`}
                            style={{ padding: '6px 8px', cursor: 'pointer' }}
                            onClick={() => handleSelectRun(run._id)}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>
                                #{run._id.slice(-6)}
                              </span>
                              <span className={`badge ${run.status === 'SUCCEEDED' ? 'badge-connected' : 'badge-disconnected'}`} style={{ fontSize: '10px', padding: '1px 5px' }}>
                                {run.status}
                              </span>
                            </div>
                            <div style={{ fontSize: '10px', color: '#888888', marginTop: '2px' }}>
                              {new Date(run.startedAt).toLocaleTimeString()}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </aside>

            {/* Main Canvas Workspace */}
            <section className="workflow-workspace">
              {selectedWorkflow ? (
                <div className="panel">
                  {/* Canvas Toolbar */}
                  <div className="canvas-toolbar">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <input 
                        type="text" 
                        value={selectedWorkflow.name}
                        onChange={(e) => setSelectedWorkflow({ ...selectedWorkflow, name: e.target.value })}
                        className="input-field"
                        style={{ fontSize: '1rem', fontWeight: 600, width: '260px' }}
                        placeholder="Workflow Name"
                      />
                      <span className="workflow-item-meta">
                        {selectedWorkflow.tasks.length} Vertices • {
                          selectedWorkflow.tasks.reduce((sum, t) => sum + (t.dependencies?.length || 0), 0)
                        } Directed Edges
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button 
                        className="btn btn-secondary"
                        onClick={() => {
                          setEditingTask(null);
                          setIsModalOpen(true);
                        }}
                      >
                        + Add Task
                      </button>
                      <button 
                        className="btn btn-secondary"
                        onClick={handlePersistWorkflow}
                        disabled={loading}
                      >
                        {loading ? 'Saving...' : 'Save Workflow'}
                      </button>
                      <button 
                        className="btn btn-primary"
                        onClick={handleRunWorkflow}
                        disabled={loading || !selectedWorkflow._id}
                        title={!selectedWorkflow._id ? 'Save workflow first' : 'Execute workflow'}
                      >
                        ▶ Run Workflow
                      </button>
                      <button 
                        className="btn btn-secondary"
                        onClick={handleDeleteActiveWorkflow}
                      >
                        Delete
                      </button>
                      <button 
                        className="btn btn-secondary"
                        onClick={() => setIsChaosModalOpen(true)}
                        title="Simulate worker crashes & trigger the Reaper"
                      >
                        ⚡ Chaos & Fleet
                      </button>
                    </div>
                  </div>

                  {/* SVG Directed Graph Canvas */}
                  <GraphCanvas 
                    tasks={selectedWorkflow.tasks}
                    taskRuns={activeRun?.taskRuns || []}
                    selectedTaskId={selectedTaskId}
                    onSelectTask={(task) => {
                      setSelectedTaskId(task.taskId);
                      setEditingTask(task);
                    }}
                    onUpdateTaskPosition={handleUpdateTaskPosition}
                  />

                  {/* Active Run Execution Monitor */}
                  {activeRun && (
                    <div className="panel-body" style={{ borderTop: '1px solid #282828', backgroundColor: '#131313' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{ fontSize: '0.75rem', color: '#888888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Run Monitor:
                          </span>
                          <span className={`badge ${activeRun.workflowRun?.status === 'SUCCEEDED' ? 'badge-connected' : 'badge-disconnected'}`}>
                            {activeRun.workflowRun?.status || 'UNKNOWN'}
                          </span>
                          <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#888888' }}>
                            ID: {activeRun.workflowRun?._id}
                          </span>
                        </div>
                        {activeRun.workflowRun?.status === 'RUNNING' && (
                          <button className="btn btn-secondary" onClick={handleCancelRun}>
                            Cancel Run
                          </button>
                        )}
                      </div>

                      <div className="stats-grid">
                        <div className="stat-card" style={{ padding: '12px' }}>
                          <span className="stat-label">Total Tasks</span>
                          <span className="stat-value">{activeRun.taskRuns?.length || 0}</span>
                        </div>
                        <div className="stat-card" style={{ padding: '12px' }}>
                          <span className="stat-label">Succeeded</span>
                          <span className="stat-value">
                            {activeRun.taskRuns?.filter(t => t.status === 'SUCCEEDED').length || 0}
                          </span>
                        </div>
                        <div className="stat-card" style={{ padding: '12px' }}>
                          <span className="stat-label">Queued / Running</span>
                          <span className="stat-value">
                            {activeRun.taskRuns?.filter(t => ['QUEUED', 'RUNNING'].includes(t.status)).length || 0}
                          </span>
                        </div>
                        <div className="stat-card" style={{ padding: '12px' }}>
                          <span className="stat-label">Blocked</span>
                          <span className="stat-value">
                            {activeRun.taskRuns?.filter(t => t.status === 'BLOCKED').length || 0}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Real-Time Telemetry & Log Viewer */}
                  {activeRun && (
                    <div style={{ borderTop: '1px solid #282828' }}>
                      <LogViewer 
                        logs={executionLogs} 
                        isConnected={isWsConnected} 
                        onClearLogs={() => setExecutionLogs([])} 
                      />
                    </div>
                  )}

                  {/* Selected Task Details Bar */}
                  {selectedTaskId && (
                    <div className="panel-body" style={{ borderTop: '1px solid #222222', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong>Selected Task:</strong> <code>{selectedTaskId}</code>
                        <span style={{ marginLeft: '16px', color: '#888888' }}>
                          Drag node to reposition on canvas. Click "Edit Task Details" to change prerequisites or priority.
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button 
                          className="btn btn-secondary" 
                          onClick={() => setIsModalOpen(true)}
                        >
                          Edit Task Details
                        </button>
                        <button 
                          className="btn btn-secondary" 
                          onClick={() => handleDeleteTask(selectedTaskId)}
                        >
                          Remove Task
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="panel" style={{ padding: '60px 20px', textAlign: 'center' }}>
                  <h3>No Workflow Selected</h3>
                  <p style={{ color: '#888888', margin: '12px 0 24px' }}>
                    Select an existing workflow from the sidebar or load the ETL sample template.
                  </p>
                  <button className="btn btn-primary" onClick={handleLoadSample}>
                    Load Sample Pipeline
                  </button>
                </div>
              )}
            </section>
          </div>
        )}

        {/* TAB 2: SYSTEM DIAGNOSTICS & ROADMAP */}
        {activeTab === 'diagnostics' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <section className="panel">
              <div className="panel-header">
                <span className="panel-title">System Status Diagnostics</span>
                <button className="btn btn-secondary" onClick={loadHealth}>
                  Refresh
                </button>
              </div>
              <div className="panel-body">
                <div className="stats-grid">
                  <div className="stat-card">
                    <span className="stat-label">API Health</span>
                    <span className="stat-value">{isServerHealthy ? '200 OK' : 'OFFLINE'}</span>
                    <span className="stat-hint">{healthData?.service || '—'}</span>
                  </div>
                  <div className="stat-card">
                    <span className="stat-label">Database Connection</span>
                    <span className="stat-value">{healthData?.database?.state || 'UNAVAILABLE'}</span>
                    <span className="stat-hint">Atlas / Local Instance</span>
                  </div>
                  <div className="stat-card">
                    <span className="stat-label">Process Uptime</span>
                    <span className="stat-value">
                      {healthData?.uptime ? `${Math.floor(healthData.uptime)}s` : '0s'}
                    </span>
                    <span className="stat-hint">PID: {healthData?.pid || '—'}</span>
                  </div>
                  <div className="stat-card">
                    <span className="stat-label">Module Progress</span>
                    <span className="stat-value">MODULE 07</span>
                    <span className="stat-hint">Failure Injection & Resilience</span>
                  </div>
                </div>
              </div>
            </section>

            <section className="panel">
              <div className="panel-header">
                <span className="panel-title">Phased Roadmap Status</span>
              </div>
              <div className="panel-body">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Module</th>
                      <th>Scope</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>01</td>
                      <td>Foundation: Express, Mongoose, Zod Env, Monochrome System</td>
                      <td>COMPLETED</td>
                    </tr>
                    <tr>
                      <td>02</td>
                      <td>Workflow Creation: Mongoose Schemas, SVG Canvas, Referential Validation</td>
                      <td>COMPLETED</td>
                    </tr>
                    <tr>
                      <td>03</td>
                      <td>Graph Algorithms: Kahn's Topo Sort, Cycle Detection, Heap Scheduling, Critical Path</td>
                      <td>COMPLETED</td>
                    </tr>
                    <tr>
                      <td>04</td>
                      <td>Execution Engine: State Machine, BullMQ, Redis Leases, Idempotency</td>
                      <td>COMPLETED</td>
                    </tr>
                    <tr>
                      <td>05</td>
                      <td>Distributed Workers: Multi-Process Pool, Heartbeats, Sandboxed Handlers</td>
                      <td>COMPLETED</td>
                    </tr>
                    <tr>
                      <td>06</td>
                      <td>Real-Time Observability: Native WebSockets, Telemetry Stream, Self-Healing State</td>
                      <td>COMPLETED</td>
                    </tr>
                    <tr>
                      <td>07</td>
                      <td>Failure Injection & Resilience: Execution Watchdog, Worker Reaper, Chaos Controls</td>
                      <td>COMPLETED</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </main>

      {/* Task Modal */}
      <TaskModal 
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingTask(null);
        }}
        onSave={handleSaveTask}
        existingTask={editingTask}
        allTasks={selectedWorkflow?.tasks || []}
      />

      {/* Chaos & Fleet Watchdog Modal */}
      <ChaosPanel
        isOpen={isChaosModalOpen}
        onClose={() => setIsChaosModalOpen(false)}
        onActionLogged={(msg) => showNotification(msg)}
      />

      <footer className="app-footer">
        <span>FlowForge Distributed Scheduler</span>
        <span>Module 07: Failure Injection, Worker Recovery & Resilience</span>
      </footer>
    </div>
  );
}

export default App;
