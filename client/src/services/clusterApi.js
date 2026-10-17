import { API_BASE } from './apiConfig';

/**
 * Client API utility for Consistent Hashing & Cluster Sharding.
 */
async function handleResponse(response) {
  const json = await response.json();
  if (!response.ok) {
    const errorMsg = json.error?.message || json.error || json.message || 'Request failed';
    throw new Error(errorMsg);
  }
  return json;
}

export async function fetchRingState() {
  const res = await fetch(`${API_BASE}/cluster/ring`);
  return handleResponse(res);
}

export async function addWorkerToRing(workerId, weight = 1) {
  const res = await fetch(`${API_BASE}/cluster/ring/workers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workerId, weight })
  });
  return handleResponse(res);
}

export async function removeWorkerFromRing(workerId) {
  const res = await fetch(`${API_BASE}/cluster/ring/workers/${encodeURIComponent(workerId)}`, {
    method: 'DELETE'
  });
  return handleResponse(res);
}

export async function routeKeyOnRing(key) {
  const res = await fetch(`${API_BASE}/cluster/ring/route`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key })
  });
  return handleResponse(res);
}

export async function simulateRingMigration(sampleSize = 500, targetWorkerId = 'worker-delta', action = 'add') {
  const res = await fetch(`${API_BASE}/cluster/ring/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sampleSize, targetWorkerId, action })
  });
  return handleResponse(res);
}

export async function syncRingWorkers() {
  const res = await fetch(`${API_BASE}/cluster/ring/sync`, {
    method: 'POST'
  });
  return handleResponse(res);
}

export async function resetRingWorkers() {
  const res = await fetch(`${API_BASE}/cluster/ring/reset`, {
    method: 'POST'
  });
  return handleResponse(res);
}

