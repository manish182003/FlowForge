import React, { useState, useEffect } from 'react';
import {
  fetchRingState,
  addWorkerToRing,
  removeWorkerFromRing,
  routeKeyOnRing,
  simulateRingMigration,
  syncRingWorkers,
  resetRingWorkers
} from '../services/clusterApi';

/**
 * ConsistentHashVisualizer
 * 
 * Interactive Monochrome Cluster Hash Ring Visualizer and Migration Simulator.
 * Demonstrates:
 * 1. Circular 32-bit keyspace [0, 2^32 - 1] mapped to 360 degrees.
 * 2. Virtual nodes (Vnodes) smoothing distribution across the circumference.
 * 3. O(log K) Clockwise Binary Search (lower_bound) key routing.
 * 4. Karger's Theorem: adding/removing a node reassigns only ~1/N keys vs ~(N-1)/N in modulo hashing.
 */
export default function ConsistentHashVisualizer({ isOpen, onClose }) {
  const [ringState, setRingState] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Key routing state
  const [keyInput, setKeyInput] = useState('task-sample-101');
  const [routingResult, setRoutingResult] = useState(null);
  const [routingLoading, setRoutingLoading] = useState(false);

  // New worker form
  const [newWorkerId, setNewWorkerId] = useState('');
  const [newWorkerWeight, setNewWorkerWeight] = useState(1);

  // Migration simulation state
  const [simSampleSize, setSimSampleSize] = useState(500);
  const [simTargetWorker, setSimTargetWorker] = useState('worker-delta');
  const [simAction, setSimAction] = useState('add');
  const [simResult, setSimResult] = useState(null);
  const [simLoading, setSimLoading] = useState(false);

  // Visualizer tabs: 'canvas' | 'simulation' | 'theory'
  const [activeTab, setActiveTab] = useState('canvas');

  // Load initial ring state when modal opens
  useEffect(() => {
    if (isOpen) {
      loadRingState();
    }
  }, [isOpen]);

  async function loadRingState() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchRingState();
      setRingState(res.data);
      // Auto-route the default key on initial load
      if (keyInput) {
        handleRouteKey(keyInput);
      }
    } catch (err) {
      setError(err.message || 'Failed to load hash ring state');
    } finally {
      setLoading(false);
    }
  }

  async function handleRouteKey(keyToRoute = keyInput) {
    if (!keyToRoute.trim()) return;
    setRoutingLoading(true);
    try {
      const res = await routeKeyOnRing(keyToRoute.trim());
      setRoutingResult(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setRoutingLoading(false);
    }
  }

  async function handleAddWorker(e) {
    e.preventDefault();
    if (!newWorkerId.trim()) return;
    setError(null);
    try {
      const res = await addWorkerToRing(newWorkerId.trim(), Number(newWorkerWeight) || 1);
      setRingState(res.data);
      setNewWorkerId('');
      if (keyInput) handleRouteKey(keyInput);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRemoveWorker(workerId) {
    setError(null);
    try {
      const res = await removeWorkerFromRing(workerId);
      setRingState(res.data);
      if (keyInput) handleRouteKey(keyInput);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSyncWorkers() {
    setError(null);
    try {
      const res = await syncRingWorkers();
      setRingState(res.data);
      if (keyInput) handleRouteKey(keyInput);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleResetDefaults() {
    setError(null);
    try {
      const res = await resetRingWorkers();
      setRingState(res.data);
      setSimResult(null);
      if (keyInput) handleRouteKey(keyInput);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRunSimulation() {
    setSimLoading(true);
    setError(null);
    try {
      const res = await simulateRingMigration(simSampleSize, simTargetWorker, simAction);
      setSimResult(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSimLoading(false);
    }
  }

  if (!isOpen) return null;

  // Geometry helpers for 360-degree circular SVG
  const cx = 190;
  const cy = 190;
  const radius = 135;

  function degreeToCoordinates(degree, r = radius) {
    // 0 deg is at 12 o'clock (top), moving clockwise
    const rad = (degree * Math.PI) / 180;
    return {
      x: cx + r * Math.sin(rad),
      y: cy - r * Math.cos(rad)
    };
  }

  // Draw clockwise arc from keyDeg to targetDeg
  function createClockwiseArcPath(startDeg, endDeg, r = radius) {
    let diff = endDeg - startDeg;
    if (diff < 0) diff += 360;
    const largeArc = diff > 180 ? 1 : 0;
    const start = degreeToCoordinates(startDeg, r);
    const end = degreeToCoordinates(endDeg, r);
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
  }

  // Distinct monochrome node symbols for up to 6 workers
  const workerSymbols = ['●', '■', '▲', '◆', '○', '□'];

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
      <div
        className="modal-container"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '960px',
          maxWidth: '96vw',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-primary)',
          color: 'var(--text-primary)'
        }}
      >
        {/* Header */}
        <div
          className="modal-header"
          style={{
            padding: 'var(--space-4) var(--space-6)',
            borderBottom: '1px solid var(--border-primary)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <div>
            <h2 style={{ fontSize: 'var(--text-lg)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Cluster Sharding & Consistent Hash Ring
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
              Karger et al. (1997) • Circular Keyspace [0, 2³² - 1] • Virtual Nodes • O(log K) Binary Search
            </p>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button
              className="btn btn-secondary"
              onClick={handleSyncWorkers}
              title="Sync with active MongoDB WorkerHeartbeat nodes"
              style={{ fontSize: 'var(--text-xs)', padding: '4px 10px' }}
            >
              Sync Active Fleet
            </button>
            <button
              className="btn btn-secondary"
              onClick={handleResetDefaults}
              title="Reset ring to 3 default demonstration workers"
              style={{ fontSize: 'var(--text-xs)', padding: '4px 10px' }}
            >
              Reset Ring
            </button>
            <button
              className="btn btn-secondary"
              onClick={onClose}
              style={{ fontSize: 'var(--text-xs)', padding: '4px 10px' }}
            >
              ✕ Close
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--border-primary)',
            backgroundColor: 'var(--bg-secondary)',
            padding: '0 var(--space-6)'
          }}
        >
          {[
            { id: 'canvas', label: 'Ring Visualizer & Key Router' },
            { id: 'simulation', label: 'Rehash Avalanche Simulator' },
            { id: 'theory', label: 'System Design & C++ Comparison' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: 'var(--space-3) var(--space-4)',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === tab.id ? '2px solid var(--border-active)' : '2px solid transparent',
                color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-muted)',
                fontWeight: activeTab === tab.id ? 600 : 400,
                fontSize: 'var(--text-sm)',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Modal Body */}
        <div style={{ padding: 'var(--space-6)', overflowY: 'auto', flex: 1 }}>
          {error && (
            <div
              style={{
                padding: 'var(--space-3)',
                marginBottom: 'var(--space-4)',
                border: '1px solid var(--status-danger-border)',
                backgroundColor: 'var(--status-danger-bg)',
                color: 'var(--text-primary)',
                fontSize: 'var(--text-xs)'
              }}
            >
              Error: {error}
            </div>
          )}

          {/* TAB 1: RING VISUALIZER & KEY ROUTER */}
          {activeTab === 'canvas' && (
            <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: 'var(--space-6)' }}>
              {/* SVG Ring Canvas */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-primary)',
                  padding: 'var(--space-4)'
                }}
              >
                <svg
                  viewBox="0 0 380 380"
                  width="360"
                  height="360"
                  style={{ overflow: 'visible', userSelect: 'none' }}
                >
                  {/* Outer Circular Track */}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={radius}
                    fill="none"
                    stroke="var(--border-primary)"
                    strokeWidth="2"
                  />

                  {/* 4 Cardinal Axis Ticks & 32-Bit Hex Labels */}
                  {[
                    { deg: 0, label: '0x00000000 (0°)', anchor: 'middle', dy: -12, dx: 0 },
                    { deg: 90, label: '0x40000000 (90°)', anchor: 'start', dy: 4, dx: 12 },
                    { deg: 180, label: '0x80000000 (180°)', anchor: 'middle', dy: 20, dx: 0 },
                    { deg: 270, label: '0xC0000000 (270°)', anchor: 'end', dy: 4, dx: -12 }
                  ].map((axis, i) => {
                    const pt = degreeToCoordinates(axis.deg, radius);
                    const tickPt = degreeToCoordinates(axis.deg, radius + 6);
                    return (
                      <g key={i}>
                        <line
                          x1={pt.x}
                          y1={pt.y}
                          x2={tickPt.x}
                          y2={tickPt.y}
                          stroke="var(--border-muted)"
                          strokeWidth="2"
                        />
                        <text
                          x={pt.x + axis.dx}
                          y={pt.y + axis.dy}
                          textAnchor={axis.anchor}
                          fill="var(--text-muted)"
                          fontSize="9"
                          fontFamily="monospace"
                        >
                          {axis.label}
                        </text>
                      </g>
                    );
                  })}

                  {/* Virtual Nodes (Vnodes) plotted around the circumference */}
                  {ringState?.vnodePoints?.map((vn, idx) => {
                    const pt = degreeToCoordinates(vn.degree, radius);
                    const workerIndex = ringState.workers.indexOf(vn.workerId);
                    const symbol = workerSymbols[workerIndex % workerSymbols.length];
                    const isTargetVnode = routingResult && routingResult.assignedVnodeHash === vn.hash;

                    return (
                      <g key={idx}>
                        <title>{`${vn.workerId} [vnode]\nHash: 0x${vn.hash.toString(16).toUpperCase()}\nPosition: ${vn.degree}°`}</title>
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r={isTargetVnode ? 5 : 2.5}
                          fill={isTargetVnode ? '#ffffff' : 'var(--text-secondary)'}
                          stroke="#0a0a0a"
                          strokeWidth={isTargetVnode ? 2 : 1}
                        />
                      </g>
                    );
                  })}

                  {/* Routing Arc from Key to Clockwise Worker Vnode */}
                  {routingResult && (
                    <>
                      <path
                        d={createClockwiseArcPath(
                          Number(routingResult.ringPositionDegrees),
                          Number(routingResult.vnodePositionDegrees),
                          radius
                        )}
                        fill="none"
                        stroke="#ffffff"
                        strokeWidth="2"
                        strokeDasharray="4 3"
                      />

                      {/* Key point on ring */}
                      {(() => {
                        const keyPt = degreeToCoordinates(Number(routingResult.ringPositionDegrees), radius);
                        return (
                          <g>
                            <circle
                              cx={keyPt.x}
                              cy={keyPt.y}
                              r="6"
                              fill="#0a0a0a"
                              stroke="#ffffff"
                              strokeWidth="2"
                            />
                            <text
                              x={keyPt.x}
                              y={keyPt.y - 10}
                              textAnchor="middle"
                              fill="#ffffff"
                              fontSize="10"
                              fontWeight="bold"
                              fontFamily="monospace"
                            >
                              KEY
                            </text>
                          </g>
                        );
                      })()}
                    </>
                  )}

                  {/* Center HUD / Readout */}
                  <circle cx={cx} cy={cy} r="60" fill="var(--bg-primary)" stroke="var(--border-muted)" />
                  <text
                    x={cx}
                    y={cy - 20}
                    textAnchor="middle"
                    fill="var(--text-muted)"
                    fontSize="9"
                    letterSpacing="1"
                  >
                    ROUTED TO
                  </text>
                  <text
                    x={cx}
                    y={cy}
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize="13"
                    fontWeight="bold"
                    fontFamily="monospace"
                  >
                    {routingResult ? routingResult.assignedWorker : (ringState?.workers[0] || 'EMPTY')}
                  </text>
                  <text
                    x={cx}
                    y={cy + 18}
                    textAnchor="middle"
                    fill="var(--text-secondary)"
                    fontSize="9"
                    fontFamily="monospace"
                  >
                    {routingResult ? `Angle: ${routingResult.ringPositionDegrees}°` : `${ringState?.totalVnodes || 0} Vnodes`}
                  </text>
                  <text
                    x={cx}
                    y={cy + 32}
                    textAnchor="middle"
                    fill="var(--text-muted)"
                    fontSize="8"
                    fontFamily="monospace"
                  >
                    {routingResult ? `0x${routingResult.keyHash.toString(16).toUpperCase().padStart(8, '0')}` : 'Keyspace [0, 2³²-1]'}
                  </text>
                </svg>

                <div style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                  Clockwise Walk: Key → First Vnode (lower_bound)
                </div>
              </div>

              {/* Controls Column */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                {/* 1. Interactive Key Routing Box */}
                <div
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-primary)',
                    padding: 'var(--space-4)'
                  }}
                >
                  <h4 style={{ margin: '0 0 var(--space-2)', fontSize: 'var(--text-sm)', textTransform: 'uppercase' }}>
                    1. Test Deterministic Key Routing
                  </h4>
                  <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
                    <input
                      type="text"
                      className="input"
                      value={keyInput}
                      onChange={(e) => setKeyInput(e.target.value)}
                      placeholder="e.g. task-id, workflow-id, partition-key"
                      style={{ flex: 1, fontFamily: 'monospace', fontSize: 'var(--text-xs)' }}
                    />
                    <button
                      className="btn btn-primary"
                      onClick={() => handleRouteKey(keyInput)}
                      disabled={routingLoading}
                      style={{ fontSize: 'var(--text-xs)' }}
                    >
                      {routingLoading ? 'Routing...' : 'Route Key'}
                    </button>
                  </div>

                  {routingResult && (
                    <div
                      style={{
                        backgroundColor: 'var(--bg-primary)',
                        border: '1px solid var(--border-muted)',
                        padding: 'var(--space-3)',
                        fontFamily: 'monospace',
                        fontSize: 'var(--text-xs)',
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '6px'
                      }}
                    >
                      <div><strong>Key:</strong> {routingResult.key}</div>
                      <div><strong>Worker:</strong> <span style={{ color: '#ffffff', fontWeight: 'bold' }}>{routingResult.assignedWorker}</span></div>
                      <div><strong>Hash (uint32):</strong> 0x{routingResult.keyHash.toString(16).toUpperCase().padStart(8, '0')}</div>
                      <div><strong>Ring Angle:</strong> {routingResult.ringPositionDegrees}°</div>
                      <div><strong>Target Vnode:</strong> 0x{routingResult.assignedVnodeHash.toString(16).toUpperCase().padStart(8, '0')}</div>
                      <div><strong>Vnode Angle:</strong> {routingResult.vnodePositionDegrees}°</div>
                    </div>
                  )}
                </div>

                {/* 2. Worker Fleet & Keyspace Distribution Table */}
                <div
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-primary)',
                    padding: 'var(--space-4)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                    <h4 style={{ margin: 0, fontSize: 'var(--text-sm)', textTransform: 'uppercase' }}>
                      2. Active Workers & Keyspace Share
                    </h4>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                      {ringState?.totalWorkers || 0} Workers • {ringState?.totalVnodes || 0} Vnodes
                    </span>
                  </div>

                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-primary)', textAlign: 'left', color: 'var(--text-muted)' }}>
                        <th style={{ padding: '6px 8px' }}>Worker ID</th>
                        <th style={{ padding: '6px 8px' }}>Vnodes</th>
                        <th style={{ padding: '6px 8px' }}>Keyspace Share</th>
                        <th style={{ padding: '6px 8px', textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ringState?.distribution?.map((d) => (
                        <tr key={d.workerId} style={{ borderBottom: '1px solid var(--border-muted)' }}>
                          <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontWeight: 600 }}>
                            {d.workerId}
                          </td>
                          <td style={{ padding: '6px 8px', color: 'var(--text-secondary)' }}>
                            {d.vnodeCount}
                          </td>
                          <td style={{ padding: '6px 8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div
                                style={{
                                  width: '60px',
                                  height: '6px',
                                  backgroundColor: 'var(--bg-primary)',
                                  border: '1px solid var(--border-muted)'
                                }}
                              >
                                <div
                                  style={{
                                    width: `${Math.min(100, d.keyspaceSharePercent)}%`,
                                    height: '100%',
                                    backgroundColor: '#ffffff'
                                  }}
                                />
                              </div>
                              <span>{d.keyspaceSharePercent}%</span>
                            </div>
                          </td>
                          <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                            <button
                              className="btn btn-secondary"
                              onClick={() => handleRemoveWorker(d.workerId)}
                              style={{ fontSize: '10px', padding: '2px 8px', color: 'var(--status-danger-text)' }}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Add Worker Inline Form */}
                  <form
                    onSubmit={handleAddWorker}
                    style={{
                      display: 'flex',
                      gap: 'var(--space-2)',
                      marginTop: 'var(--space-3)',
                      alignItems: 'center'
                    }}
                  >
                    <input
                      type="text"
                      className="input"
                      placeholder="New worker ID (e.g. worker-delta)"
                      value={newWorkerId}
                      onChange={(e) => setNewWorkerId(e.target.value)}
                      style={{ flex: 1, fontSize: 'var(--text-xs)' }}
                    />
                    <select
                      className="input"
                      value={newWorkerWeight}
                      onChange={(e) => setNewWorkerWeight(Number(e.target.value))}
                      style={{ width: '90px', fontSize: 'var(--text-xs)' }}
                    >
                      <option value={1}>1x (30 vn)</option>
                      <option value={2}>2x (60 vn)</option>
                      <option value={3}>3x (90 vn)</option>
                    </select>
                    <button
                      type="submit"
                      className="btn btn-secondary"
                      style={{ fontSize: 'var(--text-xs)', whiteSpace: 'nowrap' }}
                    >
                      + Add Worker
                    </button>
                  </form>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: REHASH AVALANCHE SIMULATOR */}
          {activeTab === 'simulation' && (
            <div>
              <div
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-primary)',
                  padding: 'var(--space-4)',
                  marginBottom: 'var(--space-4)'
                }}
              >
                <h3 style={{ margin: '0 0 var(--space-2)', fontSize: 'var(--text-base)', textTransform: 'uppercase' }}>
                  The Rehash Avalanche Problem vs. Consistent Hashing
                </h3>
                <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  In naive clustering using <code>hash(key) % N</code>, adding or removing a single node forces nearly all keys
                  to jump to completely different nodes: <strong>(N - 1) / N</strong> keys migrate (~80% for N=5, ~99% for N=100).
                  In Consistent Hashing (Karger et al.), adding node N+1 moves only <strong>1 / (N + 1)</strong> fraction of keys!
                </p>

                {/* Simulation Parameters */}
                <div
                  style={{
                    display: 'flex',
                    gap: 'var(--space-4)',
                    marginTop: 'var(--space-4)',
                    alignItems: 'center',
                    backgroundColor: 'var(--bg-primary)',
                    padding: 'var(--space-3)',
                    border: '1px solid var(--border-muted)'
                  }}
                >
                  <div>
                    <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>
                      SAMPLE SIZE (KEYS)
                    </label>
                    <input
                      type="number"
                      className="input"
                      value={simSampleSize}
                      onChange={(e) => setSimSampleSize(Number(e.target.value))}
                      style={{ width: '100px', fontSize: 'var(--text-xs)' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>
                      ACTION
                    </label>
                    <select
                      className="input"
                      value={simAction}
                      onChange={(e) => setSimAction(e.target.value)}
                      style={{ width: '110px', fontSize: 'var(--text-xs)' }}
                    >
                      <option value="add">Add Worker</option>
                      <option value="remove">Remove Worker</option>
                    </select>
                  </div>

                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>
                      TARGET WORKER ID
                    </label>
                    <input
                      type="text"
                      className="input"
                      value={simTargetWorker}
                      onChange={(e) => setSimTargetWorker(e.target.value)}
                      style={{ width: '100%', fontSize: 'var(--text-xs)' }}
                    />
                  </div>

                  <button
                    className="btn btn-primary"
                    onClick={handleRunSimulation}
                    disabled={simLoading}
                    style={{ alignSelf: 'flex-end', height: '32px', fontSize: 'var(--text-xs)' }}
                  >
                    {simLoading ? 'Running Simulation...' : 'Execute Simulation'}
                  </button>
                </div>
              </div>

              {/* Simulation Results Display */}
              {simResult && (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
                    {/* Consistent Hashing Outcome */}
                    <div
                      style={{
                        backgroundColor: 'var(--bg-secondary)',
                        border: '1px solid #ffffff',
                        padding: 'var(--space-4)'
                      }}
                    >
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                        FlowForge Consistent Hashing
                      </div>
                      <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 'bold', margin: '8px 0' }}>
                        {simResult.consistentHashing.reassignedPercent}% Moved
                      </div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                        Reassigned: <strong>{simResult.consistentHashing.reassignedCount}</strong> / {simResult.totalKeys} keys
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Theoretical Expectation: ~{simResult.consistentHashing.theoreticalExpectedPercent}% (1 / N)
                      </div>
                      <div
                        style={{
                          marginTop: 'var(--space-3)',
                          padding: '6px',
                          backgroundColor: 'var(--bg-primary)',
                          fontSize: '11px',
                          border: '1px solid var(--border-muted)'
                        }}
                      >
                        ✓ Zero avalanche. Only keys in the newcomer's interval were reassigned. All other keys retained their existing workers.
                      </div>
                    </div>

                    {/* Naive Modulo Hashing Outcome */}
                    <div
                      style={{
                        backgroundColor: 'var(--bg-secondary)',
                        border: '1px solid var(--border-primary)',
                        padding: 'var(--space-4)'
                      }}
                    >
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                        Traditional Modulo (hash % N)
                      </div>
                      <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 'bold', margin: '8px 0', color: '#a3a3a3' }}>
                        {simResult.moduloHashing.reassignedPercent}% Moved
                      </div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                        Reassigned: <strong>{simResult.moduloHashing.reassignedCount}</strong> / {simResult.totalKeys} keys
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Avalanche Ratio: ~(N - 1) / N
                      </div>
                      <div
                        style={{
                          marginTop: 'var(--space-3)',
                          padding: '6px',
                          backgroundColor: 'var(--bg-primary)',
                          fontSize: '11px',
                          border: '1px solid var(--border-muted)'
                        }}
                      >
                        ⚠ Catastrophic reshuffle. Adding 1 node broke nearly all worker cache affiliations cluster-wide.
                      </div>
                    </div>
                  </div>

                  {/* Sample Moved Keys Breakdown */}
                  <div
                    style={{
                      backgroundColor: 'var(--bg-secondary)',
                      border: '1px solid var(--border-primary)',
                      padding: 'var(--space-3)'
                    }}
                  >
                    <div style={{ fontSize: 'var(--text-xs)', fontWeight: 'bold', marginBottom: 'var(--space-2)' }}>
                      Sample Keys Reassigned by Consistent Hashing:
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '6px' }}>
                      {simResult.reassignedSample.map((item, idx) => (
                        <div
                          key={idx}
                          style={{
                            padding: '4px 8px',
                            backgroundColor: 'var(--bg-primary)',
                            border: '1px solid var(--border-muted)',
                            fontFamily: 'monospace',
                            fontSize: '10px'
                          }}
                        >
                          <span style={{ color: 'var(--text-muted)' }}>{item.key}:</span>{' '}
                          <span style={{ textDecoration: 'line-through' }}>{item.oldWorker}</span> → <strong>{item.newWorker}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: SYSTEM DESIGN & INTERVIEW DEFENSE */}
          {activeTab === 'theory' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {/* Interview Defense Alert Box */}
              <div
                style={{
                  border: '1px solid #ffffff',
                  backgroundColor: 'var(--bg-secondary)',
                  padding: 'var(--space-4)'
                }}
              >
                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '6px' }}>
                  Interview Trap: "Does Consistent Hashing Guarantee Safe Distributed Ownership?"
                </div>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  <strong style={{ color: '#ffffff' }}>Answer: Absolutely NOT.</strong>
                  <br />
                  Consistent hashing is strictly an <em>affinity and routing heuristic</em>. In a real-world asynchronous distributed system:
                  <ul style={{ margin: '6px 0 0 20px', padding: 0 }}>
                    <li>Network delays, heartbeat lag, or split-brain partitions cause different nodes to observe different ring topologies temporarily.</li>
                    <li>If two workers believe they own the same key, both will execute the job, violating mutual exclusion!</li>
                    <li><strong>Defense:</strong> True exactly-once job execution requires <em>distributed leases with fencing tokens</em> (such as FlowForge's Redis lease watchdog) or database atomic conditional updates (e.g. <code>findOneAndUpdate</code> with state transitions).</li>
                  </ul>
                </div>
              </div>

              {/* C++ vs JavaScript Implementation Comparison */}
              <div
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-primary)',
                  padding: 'var(--space-4)'
                }}
              >
                <h4 style={{ margin: '0 0 var(--space-2)', fontSize: 'var(--text-sm)', textTransform: 'uppercase' }}>
                  C++ STL vs. JavaScript Binary Search (lower_bound)
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                  {/* C++ Box */}
                  <div
                    style={{
                      backgroundColor: 'var(--bg-primary)',
                      border: '1px solid var(--border-muted)',
                      padding: 'var(--space-3)',
                      fontFamily: 'monospace',
                      fontSize: '11px'
                    }}
                  >
                    <div style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>// C++ (Red-Black Tree: std::map)</div>
                    <pre style={{ margin: 0, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
{`std::map<uint32_t, string> ring;

string getNode(const string& key) {
  if (ring.empty()) return "";
  uint32_t h = hashFn(key);
  auto it = ring.lower_bound(h);
  if (it == ring.end()) {
    it = ring.begin(); // Wraparound
  }
  return it->second;
}`}
                    </pre>
                  </div>

                  {/* JavaScript Box */}
                  <div
                    style={{
                      backgroundColor: 'var(--bg-primary)',
                      border: '1px solid var(--border-muted)',
                      padding: 'var(--space-3)',
                      fontFamily: 'monospace',
                      fontSize: '11px'
                    }}
                  >
                    <div style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>// FlowForge JavaScript (Sorted Array + Binary Search)</div>
                    <pre style={{ margin: 0, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
{`// ringKeys is sorted array: [h0, h1, ...]
let low = 0, high = ringKeys.length - 1;
let res = -1;
while (low <= high) {
  let mid = Math.floor((low + high) / 2);
  if (ringKeys[mid] >= keyHash) {
    res = mid;
    high = mid - 1;
  } else {
    low = mid + 1;
  }
}
return ring.get(ringKeys[res === -1 ? 0 : res]);`}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
