/**
 * FlowForge API Client Utility
 * Wraps browser Fetch API with error handling and response normalization.
 */

import { API_BASE } from './apiConfig';

export async function fetchHealth() {
  const response = await fetch(`${API_BASE}/health`, {
    headers: {
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    let errorDetails = 'Server responded with an error';
    try {
      const errorJson = await response.json();
      errorDetails = errorJson.message || errorDetails;
    } catch (_) {
      // Non-JSON response
    }
    throw new Error(`[${response.status}] ${errorDetails}`);
  }

  return response.json();
}

