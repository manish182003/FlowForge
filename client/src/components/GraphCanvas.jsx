import React, { useState, useRef, useEffect, useCallback } from 'react';

const NODE_WIDTH = 210;
const NODE_HEIGHT = 80;

/**
 * Production-Grade Native SVG Directed Graph Canvas
 * 
 * Features:
 * - Interactive Pan & Zoom (0.4x to 2.5x) with Fit-to-View.
 * - Topological Sugiyama Auto-Layout (orders vertices by dependency depth).
 * - Interactive node dragging with real-time dependency curve updates.
 * - Critical path bottleneck highlighting (Amdahl's law path).
 * - Animated running state indicators.
 * - Floating canvas HUD with zoom controls, mini-legend, and shortcut hints.
 */
export function GraphCanvas({ 
  tasks = [], 
  taskRuns = [],
  criticalPath = [],
  onSelectTask, 
  onUpdateTaskPosition,
  onAutoLayoutTasks,
  selectedTaskId 
}) {
  const [draggingTask, setDraggingTask] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Pan & Zoom state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  const containerRef = useRef(null);
  const svgRef = useRef(null);

  // Map task runs by taskId
  const taskRunMap = new Map();
  (taskRuns || []).forEach(tr => taskRunMap.set(tr.taskId, tr));

  // Map tasks by taskId for fast coordinate lookup
  const taskMap = new Map();
  tasks.forEach(t => taskMap.set(t.taskId, t));

  // Compute directed edges: dependency -> task
  const edges = [];
  tasks.forEach(task => {
    (task.dependencies || []).forEach(depId => {
      const parentTask = taskMap.get(depId);
      if (parentTask) {
        const sourceX = (parentTask.uiPosition?.x ?? 80) + NODE_WIDTH;
        const sourceY = (parentTask.uiPosition?.y ?? 80) + NODE_HEIGHT / 2;
        const targetX = task.uiPosition?.x ?? 80;
        const targetY = (task.uiPosition?.y ?? 80) + NODE_HEIGHT / 2;

        const controlDelta = Math.max(50, Math.abs(targetX - sourceX) / 2);
        const pathData = `M ${sourceX} ${sourceY} C ${sourceX + controlDelta} ${sourceY}, ${targetX - controlDelta} ${targetY}, ${targetX} ${targetY}`;

        edges.push({
          id: `${depId}->${task.taskId}`,
          pathData,
          source: depId,
          target: task.taskId
        });
      }
    });
  });

  // Fit graph to view
  const handleFitView = useCallback(() => {
    if (!tasks || tasks.length === 0 || !containerRef.current) return;
    const container = containerRef.current.getBoundingClientRect();

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    tasks.forEach(t => {
      const x = t.uiPosition?.x ?? 80;
      const y = t.uiPosition?.y ?? 80;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + NODE_WIDTH);
      maxY = Math.max(maxY, y + NODE_HEIGHT);
    });

    const graphWidth = maxX - minX + 120;
    const graphHeight = maxY - minY + 120;

    const scaleX = container.width / graphWidth;
    const scaleY = container.height / graphHeight;
    const newZoom = Math.min(1.2, Math.max(0.5, Math.min(scaleX, scaleY) * 0.9));

    const newPanX = (container.width - graphWidth * newZoom) / 2 - (minX - 60) * newZoom;
    const newPanY = (container.height - graphHeight * newZoom) / 2 - (minY - 60) * newZoom;

    setZoom(Number(newZoom.toFixed(2)));
    setPan({ x: Math.round(newPanX), y: Math.round(newPanY) });
  }, [tasks]);

  // Topological Auto-Layout (Left-to-Right Sugiyama Depth Leveling)
  const handleAutoLayout = () => {
    if (!tasks || tasks.length === 0) return;

    // 1. Calculate topological depth of each vertex
    const depths = new Map();
    const calculateDepth = (taskId, visited = new Set()) => {
      if (visited.has(taskId)) return 0; // prevent cycle loop
      visited.add(taskId);
      if (depths.has(taskId)) return depths.get(taskId);

      const t = taskMap.get(taskId);
      if (!t || !t.dependencies || t.dependencies.length === 0) {
        depths.set(taskId, 0);
        return 0;
      }

      let maxParentDepth = -1;
      for (const parentId of t.dependencies) {
        maxParentDepth = Math.max(maxParentDepth, calculateDepth(parentId, new Set(visited)));
      }
      const myDepth = maxParentDepth + 1;
      depths.set(taskId, myDepth);
      return myDepth;
    };

    tasks.forEach(t => calculateDepth(t.taskId));

    // 2. Group vertices by depth level
    const levelColumns = new Map();
    tasks.forEach(t => {
      const d = depths.get(t.taskId) || 0;
      if (!levelColumns.has(d)) levelColumns.set(d, []);
      levelColumns.get(d).push(t);
    });

    // 3. Assign coordinates
    const startX = 60;
    const startY = 60;
    const colSpacing = 280;
    const rowSpacing = 120;

    const maxRows = Math.max(...Array.from(levelColumns.values()).map(arr => arr.length));
    const targetHeight = Math.max(480, maxRows * rowSpacing);

    levelColumns.forEach((taskList, depth) => {
      const x = startX + depth * colSpacing;
      const count = taskList.length;
      const verticalOffset = (targetHeight - count * rowSpacing) / 2;

      taskList.forEach((task, index) => {
        const y = Math.max(startX, Math.round(startY + verticalOffset + index * rowSpacing));
        if (onUpdateTaskPosition) {
          onUpdateTaskPosition(task.taskId, { x, y });
        }
      });
    });

    if (onAutoLayoutTasks) {
      onAutoLayoutTasks();
    }
  };

  // Node Dragging Handling
  const handleNodeMouseDown = (e, task) => {
    e.stopPropagation();
    if (e.button !== 0) return; // Only primary mouse button

    setDraggingTask(task.taskId);
    setDragOffset({
      x: (e.clientX - pan.x) / zoom - (task.uiPosition?.x ?? 80),
      y: (e.clientY - pan.y) / zoom - (task.uiPosition?.y ?? 80)
    });

    if (onSelectTask) {
      onSelectTask(task);
    }
  };

  // Canvas Pan Handling
  const handleCanvasMouseDown = (e) => {
    // If clicking on canvas background, start pan
    if (e.button === 0) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e) => {
    if (draggingTask) {
      const newX = Math.max(10, Math.round((e.clientX - pan.x) / zoom - dragOffset.x));
      const newY = Math.max(10, Math.round((e.clientY - pan.y) / zoom - dragOffset.y));

      if (onUpdateTaskPosition) {
        onUpdateTaskPosition(draggingTask, { x: newX, y: newY });
      }
    } else if (isPanning) {
      setPan({
        x: Math.round(e.clientX - panStart.x),
        y: Math.round(e.clientY - panStart.y)
      });
    }
  };

  const handleMouseUp = () => {
    setDraggingTask(null);
    setIsPanning(false);
  };

  // Wheel Zoom support
  const handleWheel = (e) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const newZoom = Math.min(2.5, Math.max(0.4, Number((zoom * zoomFactor).toFixed(2))));
    setZoom(newZoom);
  };

  return (
    <div 
      ref={containerRef}
      className="graph-canvas-container"
      onMouseDown={handleCanvasMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      style={{
        width: '100%',
        minHeight: '620px',
        height: '65vh',
        backgroundColor: '#0d0d0d',
        position: 'relative',
        overflow: 'hidden',
        cursor: isPanning ? 'grabbing' : (draggingTask ? 'move' : 'default'),
        border: '1px solid var(--border-primary)',
        borderRadius: '2px'
      }}
    >
      {/* Canvas Floating Control Bar (Top-Right) */}
      <div
        style={{
          position: 'absolute',
          top: '12px',
          right: '12px',
          zIndex: 10,
          display: 'flex',
          gap: '6px',
          backgroundColor: 'rgba(23, 23, 23, 0.92)',
          border: '1px solid var(--border-primary)',
          padding: '4px 6px',
          borderRadius: '4px',
          backdropFilter: 'blur(4px)'
        }}
      >
        <button
          className="btn btn-secondary"
          onClick={() => setZoom(z => Math.max(0.4, Number((z - 0.15).toFixed(2))))}
          title="Zoom Out"
          style={{ padding: '3px 8px', fontSize: '11px', fontFamily: 'monospace' }}
        >
          −
        </button>
        <button
          className="btn btn-secondary"
          onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
          title="Reset Zoom to 100%"
          style={{ padding: '3px 8px', fontSize: '10px', fontFamily: 'monospace', minWidth: '46px' }}
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          className="btn btn-secondary"
          onClick={() => setZoom(z => Math.min(2.5, Number((z + 0.15).toFixed(2))))}
          title="Zoom In"
          style={{ padding: '3px 8px', fontSize: '11px', fontFamily: 'monospace' }}
        >
          +
        </button>
        <div style={{ width: '1px', backgroundColor: 'var(--border-muted)', margin: '2px 2px' }} />
        <button
          className="btn btn-secondary"
          onClick={handleFitView}
          title="Fit DAG to Canvas Viewport"
          style={{ padding: '3px 8px', fontSize: '10px' }}
        >
          ⛶ Fit View
        </button>
        <button
          className="btn btn-secondary"
          onClick={handleAutoLayout}
          title="Auto-organize DAG into topological dependency columns"
          style={{ padding: '3px 8px', fontSize: '10px', fontWeight: 600 }}
        >
          ✨ Auto-Layout
        </button>
      </div>

      {/* Canvas Mini-Legend Pill (Bottom-Left) */}
      <div
        style={{
          position: 'absolute',
          bottom: '12px',
          left: '12px',
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          backgroundColor: 'rgba(23, 23, 23, 0.92)',
          border: '1px solid var(--border-primary)',
          padding: '5px 10px',
          borderRadius: '4px',
          fontSize: '10px',
          fontFamily: 'monospace',
          color: 'var(--text-secondary)',
          backdropFilter: 'blur(4px)'
        }}
      >
        <span><strong style={{ color: '#ffffff' }}>●</strong> Succeeded</span>
        <span><strong style={{ color: '#ffffff' }}>⚡</strong> Running</span>
        <span><strong style={{ color: '#888888' }}>■</strong> Queued/Blocked</span>
        <span><strong style={{ color: '#ffffff' }}>━━</strong> Critical Path</span>
        <span style={{ color: 'var(--text-muted)' }}>| Drag Canvas to Pan • Scroll to Zoom</span>
      </div>

      {/* Main SVG Graphics Surface */}
      <svg 
        ref={svgRef} 
        width="100%" 
        height="100%"
        style={{ display: 'block', overflow: 'visible' }}
      >
        <defs>
          {/* Infinite Cartesian Grid Pattern */}
          <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
            <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#1c1c1c" strokeWidth="0.8" />
          </pattern>

          {/* Standard Dependency Edge Arrowhead */}
          <marker 
            id="arrow" 
            viewBox="0 0 10 10" 
            refX="9" 
            refY="5" 
            markerWidth="6" 
            markerHeight="6" 
            orient="auto"
          >
            <path d="M 0 1 L 9 5 L 0 9 z" fill="#777777" />
          </marker>

          {/* Selected Connection Arrowhead */}
          <marker 
            id="arrow-selected" 
            viewBox="0 0 10 10" 
            refX="9" 
            refY="5" 
            markerWidth="7" 
            markerHeight="7" 
            orient="auto"
          >
            <path d="M 0 1 L 9 5 L 0 9 z" fill="#f5f5f5" />
          </marker>

          {/* Critical Path Arrowhead Marker */}
          <marker 
            id="arrow-critical" 
            viewBox="0 0 10 10" 
            refX="9" 
            refY="5" 
            markerWidth="8" 
            markerHeight="8" 
            orient="auto"
          >
            <path d="M 0 1 L 9 5 L 0 9 z" fill="#ffffff" />
          </marker>
        </defs>

        {/* Scaled & Panned Group */}
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* Endless Background Grid */}
          <rect 
            x="-5000" 
            y="-5000" 
            width="10000" 
            height="10000" 
            fill="url(#grid)" 
          />

          {/* Directed Edges (Dependencies) */}
          <g className="edges-layer">
            {edges.map(edge => {
              const isCriticalEdge = criticalPath.length > 1 &&
                criticalPath.includes(edge.source) &&
                criticalPath.includes(edge.target) &&
                criticalPath.indexOf(edge.target) === criticalPath.indexOf(edge.source) + 1;

              const isConnectedToSelected = selectedTaskId && 
                (edge.source === selectedTaskId || edge.target === selectedTaskId);

              let edgeStroke = '#444444';
              let edgeWidth = '1.6';
              let edgeDash = 'none';
              let marker = 'url(#arrow)';

              if (isCriticalEdge) {
                edgeStroke = '#ffffff';
                edgeWidth = '2.8';
                edgeDash = '6 3';
                marker = 'url(#arrow-critical)';
              } else if (isConnectedToSelected) {
                edgeStroke = '#f5f5f5';
                edgeWidth = '2.2';
                marker = 'url(#arrow-selected)';
              }

              return (
                <path
                  key={edge.id}
                  d={edge.pathData}
                  fill="none"
                  stroke={edgeStroke}
                  strokeWidth={edgeWidth}
                  strokeDasharray={edgeDash}
                  markerEnd={marker}
                  style={{ transition: 'stroke 0.15s ease, stroke-width 0.15s ease' }}
                />
              );
            })}
          </g>

          {/* Graph Vertices (Task Cards) */}
          <g className="nodes-layer">
            {tasks.map(task => {
              const x = task.uiPosition?.x ?? 80;
              const y = task.uiPosition?.y ?? 80;
              const isSelected = selectedTaskId === task.taskId;

              const runData = taskRunMap.get(task.taskId);
              const status = runData?.status;

              let borderColor = isSelected ? '#ffffff' : '#2e2e2e';
              let strokeWidth = isSelected ? '2' : '1';
              let strokeDasharray = 'none';

              const isCritical = (criticalPath || []).includes(task.taskId);
              if (isCritical) {
                borderColor = '#ffffff';
                strokeWidth = isSelected ? '2.5' : '1.8';
              } else if (status === 'RUNNING') {
                borderColor = '#ffffff';
                strokeWidth = '2';
                strokeDasharray = '5 3';
              } else if (status === 'SUCCEEDED') {
                borderColor = '#999999';
              } else if (status === 'FAILED') {
                borderColor = '#ffffff';
                strokeDasharray = '4 2';
              } else if (status === 'CANCELLED') {
                borderColor = '#444444';
                strokeDasharray = '2 2';
              }

              // Priority indicator shading
              const priorityColor = task.priority >= 8 ? '#ffffff' : (task.priority >= 5 ? '#888888' : '#3e3e3e');

              return (
                <g 
                  key={task.taskId} 
                  transform={`translate(${x}, ${y})`}
                  className={`graph-node ${isSelected ? 'node-selected' : ''}`}
                  onMouseDown={(e) => handleNodeMouseDown(e, task)}
                  style={{ cursor: 'move', userSelect: 'none' }}
                >
                  {/* Node Background Card */}
                  <rect 
                    width={NODE_WIDTH} 
                    height={NODE_HEIGHT} 
                    rx="4" 
                    ry="4"
                    fill="#141414"
                    stroke={borderColor}
                    strokeWidth={strokeWidth}
                    strokeDasharray={strokeDasharray}
                  />

                  {/* Left Priority Accent Bar */}
                  <rect 
                    x="0" 
                    y="0" 
                    width="4" 
                    height={NODE_HEIGHT} 
                    rx="1"
                    fill={priorityColor}
                  />

                  {/* Status Indicator (Right aligned) */}
                  {status ? (
                    <text
                      x={NODE_WIDTH - 8}
                      y="18"
                      fill={status === 'SUCCEEDED' ? '#ffffff' : '#a3a3a3'}
                      fontSize="9"
                      fontWeight="700"
                      fontFamily="monospace"
                      textAnchor="end"
                    >
                      [{status}]
                    </text>
                  ) : (
                    <text
                      x={NODE_WIDTH - 8}
                      y="18"
                      fill="#737373"
                      fontSize="9"
                      fontFamily="monospace"
                      textAnchor="end"
                    >
                      P:{task.priority}
                    </text>
                  )}

                  {/* Critical Path Badge */}
                  {isCritical && (
                    <g transform={`translate(${NODE_WIDTH - 68}, ${NODE_HEIGHT - 18})`}>
                      <rect width="60" height="13" rx="2" fill="#ffffff" />
                      <text x="30" y="9.5" fill="#000000" fontSize="8" fontWeight="800" fontFamily="monospace" textAnchor="middle">
                        CRITICAL
                      </text>
                    </g>
                  )}

                  {/* Node Title */}
                  <text 
                    x="12" 
                    y="24" 
                    fill="#f5f5f5" 
                    fontSize="12" 
                    fontWeight="600"
                    fontFamily="system-ui, sans-serif"
                  >
                    {task.name.length > 21 ? task.name.slice(0, 20) + '…' : task.name}
                  </text>

                  {/* Task ID Label */}
                  <text 
                    x="12" 
                    y="43" 
                    fill="#888888" 
                    fontSize="10" 
                    fontFamily="monospace"
                  >
                    id: {task.taskId}
                  </text>

                  {/* Type Tag & Details */}
                  <text 
                    x="12" 
                    y="63" 
                    fill="#a3a3a3" 
                    fontSize="9" 
                    fontFamily="monospace"
                  >
                    [{task.type.toUpperCase()}] {task.dependencies?.length ? `• deps: ${task.dependencies.length}` : '• root'}
                  </text>

                  {/* Connection Points (Left In, Right Out) */}
                  <circle cx="0" cy={NODE_HEIGHT / 2} r="3.5" fill="#555555" stroke="#141414" strokeWidth="1" />
                  <circle cx={NODE_WIDTH} cy={NODE_HEIGHT / 2} r="3.5" fill="#555555" stroke="#141414" strokeWidth="1" />
                </g>
              );
            })}
          </g>
        </g>
      </svg>
    </div>
  );
}

export default GraphCanvas;
