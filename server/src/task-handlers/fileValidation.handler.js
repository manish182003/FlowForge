/**
 * File Validation Handler
 * Validates CSV or JSON records against schema constraints, required headers, and limits.
 */
async function fileValidationHandler(input = {}, context = {}) {
  const {
    format = 'json',
    content = null,
    requiredFields = [],
    maxRecords = 10000,
    strict = true
  } = input;

  if (content === null || content === undefined) {
    throw new Error('File Validation Handler requires a "content" payload in input.');
  }

  let records = [];
  let detectedHeaders = [];

  if (format.toLowerCase() === 'json') {
    let parsed;
    try {
      parsed = typeof content === 'string' ? JSON.parse(content) : content;
    } catch (parseErr) {
      throw new Error(`JSON Syntax Error: ${parseErr.message}`);
    }

    if (Array.isArray(parsed)) {
      records = parsed;
    } else if (typeof parsed === 'object') {
      records = [parsed];
    } else {
      throw new Error('JSON content must be an object or an array of objects.');
    }

    if (records.length > 0 && typeof records[0] === 'object') {
      detectedHeaders = Object.keys(records[0]);
    }
  } else if (format.toLowerCase() === 'csv') {
    const rawCsv = String(content).trim();
    if (!rawCsv) {
      throw new Error('CSV content cannot be empty.');
    }

    const lines = rawCsv.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length < 1) {
      throw new Error('CSV must contain at least a header row.');
    }

    detectedHeaders = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
    
    // Parse rows
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
      if (strict && values.length !== detectedHeaders.length) {
        throw new Error(`Row ${i + 1} has ${values.length} columns, expected ${detectedHeaders.length}.`);
      }
      const rowObj = {};
      detectedHeaders.forEach((header, idx) => {
        rowObj[header] = values[idx] !== undefined ? values[idx] : null;
      });
      records.push(rowObj);
    }
  } else {
    throw new Error(`Unsupported format "${format}". Only "csv" and "json" are supported.`);
  }

  // Enforce Max Records
  if (records.length > maxRecords) {
    throw new Error(`Record count (${records.length}) exceeds max limit of ${maxRecords}.`);
  }

  // Validate Required Fields
  if (requiredFields.length > 0) {
    const missing = requiredFields.filter(field => !detectedHeaders.includes(field));
    if (missing.length > 0) {
      throw new Error(`Validation failed: Missing required fields: [${missing.join(', ')}]`);
    }
  }

  return {
    valid: true,
    format: format.toLowerCase(),
    recordCount: records.length,
    headers: detectedHeaders,
    sampleRecord: records[0] || null
  };
}

module.exports = { fileValidationHandler };

