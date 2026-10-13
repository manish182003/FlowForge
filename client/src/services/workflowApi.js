/**
 * Client API utility for Workflow CRUD operations.
 */
const BASE_URL = '/api/workflows';

async function handleResponse(response) {
  const json = await response.json();
  if (!response.ok) {
    const errorMsg = json.error?.message || json.message || 'Request failed';
    const errorDetails = json.error?.details ? json.error.details.map(d => d.message).join('; ') : '';
    throw new Error(errorDetails ? `${errorMsg}: ${errorDetails}` : errorMsg);
  }
  return json;
}

export async function fetchWorkflows(page = 1, limit = 20) {
  const res = await fetch(`${BASE_URL}?page=${page}&limit=${limit}`);
  return handleResponse(res);
}

export async function fetchWorkflowById(id) {
  const res = await fetch(`${BASE_URL}/${id}`);
  return handleResponse(res);
}

export async function createWorkflow(workflowData) {
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(workflowData)
  });
  return handleResponse(res);
}

export async function updateWorkflow(id, workflowData) {
  const res = await fetch(`${BASE_URL}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(workflowData)
  });
  return handleResponse(res);
}

export async function deleteWorkflow(id) {
  const res = await fetch(`${BASE_URL}/${id}`, {
    method: 'DELETE'
  });
  return handleResponse(res);
}

