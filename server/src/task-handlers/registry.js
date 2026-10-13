const { simulationHandler } = require('./simulation.handler');
const { httpRequestHandler } = require('./http.handler');
const { fileValidationHandler } = require('./fileValidation.handler');
const { dataTransformHandler } = require('./dataTransform.handler');
const { reportGenerationHandler } = require('./reportGeneration.handler');

const HANDLER_REGISTRY = {
  simulated: simulationHandler,
  http_request: httpRequestHandler,
  file_validation: fileValidationHandler,
  data_transformation: dataTransformHandler,
  report_generation: reportGenerationHandler
};

/**
 * Dispatches a task to its corresponding handler.
 * 
 * @param {string} type - Allowlisted task type
 * @param {Object} input - Task input payload
 * @param {Object} context - Execution context (taskId, runId, attempt, workerId)
 * @returns {Promise<Object>} Handler execution result
 */
async function executeTaskHandler(type, input = {}, context = {}) {
  const handler = HANDLER_REGISTRY[type];

  if (!handler) {
    throw new Error(
      `No registered handler found for task type: "${type}". ` +
      `Supported types: [${Object.keys(HANDLER_REGISTRY).join(', ')}]`
    );
  }

  const timeoutMs = input.timeoutMs || context.timeoutMs || 30000;

  let timerId;
  const timeoutPromise = new Promise((_, reject) => {
    timerId = setTimeout(() => {
      const err = new Error(`Task execution timed out after ${timeoutMs}ms`);
      err.code = 'TASK_TIMEOUT';
      reject(err);
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([
      handler(input, context),
      timeoutPromise
    ]);
    return result;
  } finally {
    clearTimeout(timerId);
  }
}

module.exports = {
  HANDLER_REGISTRY,
  executeTaskHandler
};

