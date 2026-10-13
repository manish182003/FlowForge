const { WebSocketServer, WebSocket } = require('ws');

let wss = null;
let heartbeatInterval = null;
const runSubscriptions = new Map(); // runId -> Set<WebSocket>

/**
 * Initializes WebSocket Server attached to existing Node.js HTTP server.
 * 
 * @param {import('http').Server} httpServer
 */
function initWebSocketServer(httpServer) {
  wss = new WebSocketServer({ 
    server: httpServer,
    path: '/ws'
  });

  wss.on('connection', (ws, req) => {
    ws.isAlive = true;
    ws.subscribedRuns = new Set();

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        handleClientMessage(ws, message);
      } catch (err) {
        ws.send(JSON.stringify({ 
          type: 'ERROR', 
          error: 'Invalid JSON payload' 
        }));
      }
    });

    ws.on('close', () => {
      cleanupClient(ws);
    });

    ws.on('error', (err) => {
      cleanupClient(ws);
    });

    // Send initial handshake confirmation
    ws.send(JSON.stringify({
      type: 'CONNECTED',
      timestamp: new Date().toISOString(),
      message: 'FlowForge Real-Time WebSocket Telemetry Connected'
    }));
  });

  // Heartbeat ping loop: detect and clean up dead half-open sockets
  heartbeatInterval = setInterval(() => {
    if (!wss) return;
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        cleanupClient(ws);
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  console.log('[WebSocket] WebSocket Server initialized on path /ws.');
  return wss;
}

/**
 * Handles incoming client commands (subscriptions/unsubscriptions).
 */
function handleClientMessage(ws, message) {
  const { type, runId } = message;

  if (type === 'SUBSCRIBE' && runId) {
    if (!runSubscriptions.has(runId)) {
      runSubscriptions.set(runId, new Set());
    }
    runSubscriptions.get(runId).add(ws);
    ws.subscribedRuns.add(runId);

    ws.send(JSON.stringify({
      type: 'SUBSCRIBED',
      runId,
      timestamp: new Date().toISOString()
    }));
  } else if (type === 'UNSUBSCRIBE' && runId) {
    if (runSubscriptions.has(runId)) {
      runSubscriptions.get(runId).delete(ws);
    }
    ws.subscribedRuns.delete(runId);
  } else if (type === 'PING') {
    ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
  }
}

/**
 * Removes socket handle from all active subscription rooms.
 */
function cleanupClient(ws) {
  if (ws.subscribedRuns) {
    for (const runId of ws.subscribedRuns) {
      if (runSubscriptions.has(runId)) {
        runSubscriptions.get(runId).delete(ws);
        if (runSubscriptions.get(runId).size === 0) {
          runSubscriptions.delete(runId);
        }
      }
    }
  }
}

/**
 * Broadcasts an event to relevant WebSocket subscribers.
 * 
 * Rules:
 * - If payload has a runId, dispatches to clients subscribed to that specific runId,
 *   as well as any client subscribed to all runs ('*').
 * - If no runId, broadcasts to all connected clients.
 * 
 * @param {string} eventType
 * @param {Object} payload
 */
function broadcastEvent(eventType, payload = {}) {
  if (!wss) return;

  const message = JSON.stringify({
    type: eventType,
    payload,
    timestamp: new Date().toISOString()
  });

  const targetRunId = payload.runId;

  if (targetRunId && runSubscriptions.has(targetRunId)) {
    const clients = runSubscriptions.get(targetRunId);
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  } else {
    // Broadcast to all active sockets
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }
}

function closeWebSocketServer() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  if (wss) {
    wss.close();
    wss = null;
  }
  runSubscriptions.clear();
}

module.exports = {
  initWebSocketServer,
  broadcastEvent,
  closeWebSocketServer
};

