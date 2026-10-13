const net = require('net');

/**
 * Validates if an IP address is a private, loopback, link-local, or cloud metadata address.
 * 
 * Blocks:
 * - 127.0.0.0/8 (Loopback)
 * - 10.0.0.0/8 (Private RFC 1918)
 * - 172.16.0.0/12 (Private RFC 1918)
 * - 192.168.0.0/16 (Private RFC 1918)
 * - 169.254.0.0/16 (Link-local & AWS/GCP Metadata 169.254.169.254)
 * - 0.0.0.0
 * - ::1 (IPv6 Loopback)
 * - fe80::/10 (IPv6 Link-local)
 */
function isRestrictedIp(ip) {
  if (!ip) return true;

  if (ip === '::1' || ip === '0.0.0.0' || ip === '::') return true;

  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(p => parseInt(p, 10));
    if (parts.length !== 4) return true;

    // 127.0.0.0/8 (Loopback)
    if (parts[0] === 127) return true;

    // 10.0.0.0/8 (Private RFC 1918)
    if (parts[0] === 10) return true;

    // 172.16.0.0/12 (Private RFC 1918)
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;

    // 192.168.0.0/16 (Private RFC 1918)
    if (parts[0] === 192 && parts[1] === 168) return true;

    // 169.254.0.0/16 (Link-Local & Cloud Metadata)
    if (parts[0] === 169 && parts[1] === 254) return true;

    // 0.0.0.0/8
    if (parts[0] === 0) return true;
  }

  // IPv6 link-local
  if (net.isIPv6(ip) && ip.toLowerCase().startsWith('fe80:')) {
    return true;
  }

  return false;
}

/**
 * Validates a target URL against SSRF attacks.
 */
function validateTargetUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch (_) {
    throw new Error(`Invalid URL format: "${rawUrl}"`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Forbidden protocol: "${parsed.protocol}". Only HTTP and HTTPS are permitted.`);
  }

  const hostname = parsed.hostname.toLowerCase();
  const cleanHost = hostname.replace(/^\[|\]$/g, '');

  // Block localhost and common loopback aliases
  if (
    cleanHost === 'localhost' ||
    cleanHost.endsWith('.localhost') ||
    cleanHost === '127.0.0.1' ||
    cleanHost === '::1' ||
    cleanHost === '0.0.0.0'
  ) {
    throw new Error(`SSRF Protection: Requests to loopback host "${hostname}" are forbidden.`);
  }

  // Block direct IP entry if in restricted range
  if (net.isIP(cleanHost) && isRestrictedIp(cleanHost)) {
    throw new Error(`SSRF Protection: Requests to private/link-local address "${hostname}" are forbidden.`);
  }

  return parsed;
}

/**
 * SSRF-Protected HTTP Request Handler.
 */
async function httpRequestHandler(input = {}, context = {}) {
  const {
    url,
    method = 'GET',
    headers = {},
    body = null,
    timeoutMs = 10000
  } = input;

  if (!url) {
    throw new Error('HTTP Request Handler requires a valid "url" parameter in input.');
  }

  const validatedUrl = validateTargetUrl(url);

  // Enforce execution timeout via AbortController
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), Math.min(timeoutMs, 30000));

  try {
    const fetchOptions = {
      method: method.toUpperCase(),
      headers: {
        'User-Agent': 'FlowForge-Worker/1.0',
        'Accept': 'application/json, text/plain, */*',
        ...headers
      },
      signal: controller.signal,
      redirect: 'follow'
    };

    if (body && ['POST', 'PUT', 'PATCH'].includes(fetchOptions.method)) {
      fetchOptions.body = typeof body === 'object' ? JSON.stringify(body) : String(body);
      if (!fetchOptions.headers['Content-Type']) {
        fetchOptions.headers['Content-Type'] = 'application/json';
      }
    }

    const startTime = Date.now();
    const response = await fetch(validatedUrl.toString(), fetchOptions);
    const durationMs = Date.now() - startTime;

    // Check if redirect ended up on an internal address
    validateTargetUrl(response.url);

    let responseData;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      responseData = await response.json();
    } else {
      responseData = await response.text();
      if (responseData.length > 50000) {
        responseData = responseData.slice(0, 50000) + '... (truncated)';
      }
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    return {
      status: response.status,
      statusText: response.statusText,
      durationMs,
      data: responseData
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = {
  httpRequestHandler,
  validateTargetUrl,
  isRestrictedIp
};
