import React, { useState, useRef } from 'react';

const NODE_WIDTH = 190;
const NODE_HEIGHT = 74;

/**
 * Native SVG Directed Graph Canvas
 * Renders workflow tasks as DAG nodes connected by directed dependency arrows.
 * Supports dragging nodes to rearrange graph topology.
 */
export function GraphCanvas({ tasks = [], onSelectTask, onUpdateTaskPosition, selectedTaskId }) {
  const [draggingTask, setDraggingTask] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const svgRef = useRef(null);

  // Map tasks by taskId for fast coordinate lookup
  const taskMap = new Map();
  tasks.forEach(t => taskMap.set(t.taskId, t));

  // Compute directed edges: dependency -> task
  const edges = [];
  tasks.forEach(task => {
    (task.dependencies || []).forEach(depId => {
      const parentTask = taskMap.get(depId);
      if (parentTask) {
        const sourceX = (parentTask.uiPosition?.x ?? 100) + NODE_WIDTH;
        const sourceY = (parentTask.uiPosition?.y ?? 100) + NODE_HEIGHT / 2;
        const targetX = task.uiPosition?.x ?? 100;
        const targetY = (task.uiPosition?.y ?? 100) + NODE_HEIGHT / 2;

        const controlDelta = Math.max(40, Math.abs(targetX - sourceX) / 2);
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

  // Drag handling
  const handleMouseDown = (e, task) => {
    e.stopPropagation();
    if (!svgRef.current) return;
    const svgRect = svgRef.current.getBoundingClientRect();
    const mouseX = e.clientX - svgRect.left;
    const mouseY = e.clientY - svgRect.top;

    setDraggingTask(task.taskId);
    setDragOffset({
      x: mouseX - (task.uiPosition?.x ?? 100),
      y: mouseY - (task.uiPosition?.y ?? 100)
    });
    if (onSelectTask) {
      onSelectTask(task);
    }
  };

  const handleMouseMove = (e) => {
    if (!draggingTask || !svgRef.current) return;
    const svgRect = svgRef.current.getBoundingClientRect();
    const currentX = e.clientX - svgRect.left;
    const currentY = e.clientY - svgRect.top;

    const newX = Math.max(10, Math.round(currentX - dragOffset.x));
    const newY = Math.max(10, Math.round(currentY - dragOffset.y));

    if (onUpdateTaskPosition) {
      onUpdateTaskPosition(draggingTask, { x: newX, y: newY });
    }
  };

  const handleMouseUp = () => {
    setDraggingTask(null);
  };

  return (
    <div 
      className="graph-canvas-container"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <svg 
        ref={svgRef} 
        className="graph-svg" 
        width="100%" 
        height="500"
      >
        <defs>
          {/* Subtle grid pattern */}
          <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
            <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#1f1f1f" strokeWidth="0.8" />
          </pattern>

          {/* Directed arrow marker */}
          <marker 
            id="arrow" 
            viewBox="0 0 10 10" 
            refX="9" 
            refY="5" 
            markerWidth="6" 
            markerHeight="6" 
            orient="auto"
          >
            <path d="M 0 1 L 9 5 L 0 9 z" fill="#888888" />
          </marker>
        </defs>

        {/* Canvas Background Grid */}
        <rect width="100%" height="100%" fill="url(#grid)" />

        {/* Directed Edges */}
        <g className="edges-layer">
          {edges.map(edge => (
            <path
              key={edge.id}
              d={edge.pathData}
              fill="none"
              stroke="#555555"
              strokeWidth="1.8"
              markerEnd="url(#arrow)"
            />
          ))}
        </g>

        {/* Graph Nodes (Tasks) */}
        <g className="nodes-layer">
          {tasks.map(task => {
            const x = task.uiPosition?.x ?? 100;
            const y = task.uiPosition?.y ?? 100;
            const isSelected = selectedTaskId === task.taskId;

            return (
              <g 
                key={task.taskId} 
                transform={`translate(${x}, ${y})`}
                className={`graph-node ${isSelected ? 'node-selected' : ''}`}
                onMouseDown={(e) => handleMouseDown(e, task)}
                style={{ cursor: 'move' }}
              >
                {/* Node Box */}
                <rect 
                  width={NODE_WIDTH} 
                  height={NODE_HEIGHT} 
                  rx="3" 
                  ry="3"
                  fill="#171717"
                  stroke={isSelected ? '#ffffff' : '#333333'}
                  strokeWidth={isSelected ? '2' : '1'}
                />

                {/* Left Accent Bar for Priority */}
                <rect 
                  x="0" 
                  y="0" 
                  width="4" 
                  height={NODE_HEIGHT} 
                  rx="1"
                  fill={task.priority >= 8 ? '#ffffff' : (task.priority >= 5 ? '#888888' : '#444444')}
                />

                {/* Node Title */}
                <text 
                  x="14" 
                  y="24" 
                  fill="#f5f5f5" 
                  fontSize="12" 
                  fontWeight="600"
                  fontFamily="system-ui, sans-serif"
                >
                  {task.name.length > 20 ? task.name.slice(0, 19) + '…' : task.name}
                </text>

                {/* Task ID Label */}
                <text 
                  x="14" 
                  y="42" 
                  fill="#888888" 
                  fontSize="10" 
                  fontFamily="monospace"
                >
                  id: {task.taskId}
                </text>

                {/* Type & Priority Tag */}
                <text 
                  x="14" 
                  y="60" 
                  fill="#aaaaaa" 
                  fontSize="9" 
                  fontFamily="monospace"
                >
                  [{task.type.toUpperCase()}] P:{task.priority}
                </text>

                {/* Input Connection Point */}
                <circle cx="0" cy={NODE_HEIGHT / 2} r="3.5" fill="#666666" />
                {/* Output Connection Point */}
                <circle cx={NODE_WIDTH} cy={NODE_HEIGHT / 2} r="3.5" fill="#666666" />
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
