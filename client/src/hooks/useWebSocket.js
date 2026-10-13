import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Custom React hook for robust, self-healing WebSocket connection.
 * 
 * Features:
 * - Exponential backoff reconnection on drops.
 * - Automatic subscription to active workflow runId.
 * - Heartbeat ping keep-alive.
 * - Snapshot healing callback on re-connection.
 * 
 * @param {Object} options
 * @param {string|null} options.runId - Active runId to subscribe to
 * @param {Function} [options.onTaskStateChange]
 * @param {Function} [options.onWorkflowStateChange]
 * @param {Function} [options.onLogMessage]
 * @param {Function} [options.onReconnect]
 */
export function useWebSocket({
  runId = null,
  onTaskStateChange,
  onWorkflowStateChange,
  onLogMessage,
  onReconnect
} = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const [status, setStatus] = useState('disconnected'); // 'connecting' | 'connected' | 'disconnected'
  const wsRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef(null);
  const pingIntervalRef = useRef(null);
  const wasPreviouslyConnectedRef = useRef(false);

  // Keep latest callbacks in refs to avoid reconnection loops
  const callbacksRef = useRef({
    onTaskStateChange,
    onWorkflowStateChange,
    onLogMessage,
    onReconnect
  });
  callbacksRef.current = {
    onTaskStateChange,
    onWorkflowStateChange,
    onLogMessage,
    onReconnect
  };

  const getWsUrl = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Connect to same host via Vite proxy in dev or direct in prod
    return `${protocol}//${window.location.host}/ws`;
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    setStatus('connecting');
    const wsUrl = getWsUrl();
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      setStatus('connected');
      reconnectAttemptsRef.current = 0;

      // Start ping heartbeat
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'PING' }));
        }
      }, 25000);

      // If we reconnected after a drop, trigger snapshot reconciliation
      if (wasPreviouslyConnectedRef.current && callbacksRef.current.onReconnect && runId) {
        callbacksRef.current.onReconnect(runId);
      }
      wasPreviouslyConnectedRef.current = true;

      // Subscribe to active run if specified
      if (runId) {
        ws.send(JSON.stringify({ type: 'SUBSCRIBE', runId }));
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const { type, payload } = data;

        if (type === 'TASK_STATE_CHANGED' && callbacksRef.current.onTaskStateChange) {
          callbacksRef.current.onTaskStateChange(payload);
        } else if (type === 'WORKFLOW_STATE_CHANGED' && callbacksRef.current.onWorkflowStateChange) {
          callbacksRef.current.onWorkflowStateChange(payload);
        } else if (type === 'LOG_MESSAGE' && callbacksRef.current.onLogMessage) {
          callbacksRef.current.onLogMessage(payload);
        }
      } catch (err) {
        console.error('[WebSocket] Failed to parse message:', err);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      setStatus('disconnected');
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }

      // Exponential backoff reconnect: 1s, 1.5s, 2.25s ... max 10s
      const delay = Math.min(1000 * Math.pow(1.5, reconnectAttemptsRef.current), 10000);
      reconnectAttemptsRef.current += 1;

      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = setTimeout(() => {
        connect();
      }, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [getWsUrl, runId]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // Prevent reconnect on intentional unmount
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  // Handle runId change: subscribe to new runId
  useEffect(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && runId) {
      wsRef.current.send(JSON.stringify({ type: 'SUBSCRIBE', runId }));
    }
  }, [runId]);

  const sendMessage = useCallback((type, data = {}) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, ...data }));
    }
  }, []);

  return {
    isConnected,
    status,
    sendMessage
  };
}

