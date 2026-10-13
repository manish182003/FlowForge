/**
 * Data Transformation Handler
 * Performs in-memory operations on structured datasets:
 * - clean_nulls: removes null or undefined values
 * - filter: evaluates conditions (gt, lt, eq, neq, contains)
 * - aggregate: groups by key and calculates sum, count, or average
 * - sort: sorts dataset by key
 */
async function dataTransformHandler(input = {}, context = {}) {
  const {
    records = [],
    operation = 'clean_nulls',
    config = {}
  } = input;

  if (!Array.isArray(records)) {
    throw new Error('Data Transformation Handler requires an array of "records".');
  }

  let result = [...records];

  switch (operation) {
    case 'clean_nulls': {
      result = result.map(record => {
        if (typeof record !== 'object' || record === null) return record;
        const cleaned = {};
        for (const [k, v] of Object.entries(record)) {
          if (v !== null && v !== undefined && v !== '') {
            cleaned[k] = v;
          }
        }
        return cleaned;
      });
      break;
    }

    case 'filter': {
      const { field, operator = 'eq', value } = config;
      if (!field) throw new Error('Filter operation requires a "field" in config.');

      result = result.filter(record => {
        const val = record[field];
        if (operator === 'eq') return val === value;
        if (operator === 'neq') return val !== value;
        if (operator === 'gt') return Number(val) > Number(value);
        if (operator === 'lt') return Number(val) < Number(value);
        if (operator === 'contains') return String(val).includes(String(value));
        return true;
      });
      break;
    }

    case 'aggregate': {
      const { groupBy, metricField, metricType = 'sum' } = config;
      if (!groupBy) throw new Error('Aggregate operation requires a "groupBy" field in config.');

      const groups = new Map();
      for (const record of result) {
        const key = record[groupBy] ?? 'unknown';
        if (!groups.has(key)) {
          groups.set(key, []);
        }
        groups.get(key).push(record);
      }

      const aggregated = [];
      for (const [key, items] of groups.entries()) {
        let metricValue = 0;
        if (metricType === 'count') {
          metricValue = items.length;
        } else if (metricField) {
          const numbers = items.map(i => Number(i[metricField]) || 0);
          const sum = numbers.reduce((a, b) => a + b, 0);
          metricValue = metricType === 'avg' ? (sum / numbers.length) : sum;
        }

        aggregated.push({
          [groupBy]: key,
          count: items.length,
          metric: metricType,
          value: Number(metricValue.toFixed(2))
        });
      }
      result = aggregated;
      break;
    }

    case 'sort': {
      const { field, direction = 'asc' } = config;
      if (!field) throw new Error('Sort operation requires a "field" in config.');
      const dir = direction === 'desc' ? -1 : 1;

      result.sort((a, b) => {
        if (a[field] < b[field]) return -1 * dir;
        if (a[field] > b[field]) return 1 * dir;
        return 0;
      });
      break;
    }

    default:
      throw new Error(`Unsupported transformation operation: "${operation}".`);
  }

  return {
    operation,
    inputCount: records.length,
    outputCount: result.length,
    transformedRecords: result
  };
}

module.exports = { dataTransformHandler };

