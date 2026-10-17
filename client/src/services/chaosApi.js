import { API_BASE } from './apiConfig';

/**
 * Client API utility for Worker Fleet Health & Chaos Engineering.
 */
async function handleResponse(response) {
  const json = await response.json();
  if (!response.ok) {
    const errorMsg = json.error?.message || json.message || 'Request failed';
    throw new Error(errorMsg);
  }
  return json;
}

export async function fetchWorkers() {
  const res = await fetch(`${API_BASE}/workers`);
  return handleResponse(res);
}

export async function expireWorkerLease(workerId, pastMs = 60000) {
  const res = await fetch(`${API_BASE}/chaos/expire-lease`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workerId, pastMs })
  });
  return handleResponse(res);
}

export async function triggerReaperSweep(leaseTimeoutMs = 15000) {
  const res = await fetch(`${API_BASE}/chaos/trigger-reaper`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ leaseTimeoutMs })
  });
  return handleResponse(res);
}

