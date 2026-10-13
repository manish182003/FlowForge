/**
 * Simulation Task Handler
 * Supports configurable delays, intentional failures, fail-N-times-then-succeed,
 * and timeout simulations.
 */
async function simulationHandler(input = {}, context = {}) {
  const {
    delayMs = 100,
    shouldFail = false,
    failureMessage = 'Simulated task failure',
    failAttempts = 0,
    simulateTimeout = false,
    sampleData = { message: 'Simulation executed successfully' }
  } = input;

  const currentAttempt = context.attempt || 0;

  // 1. Simulate Timeout
  if (simulateTimeout) {
    // Sleep longer than reasonable execution timeout
    await new Promise(resolve => setTimeout(resolve, 60000));
  }

  // 2. Configurable Delay
  if (delayMs > 0) {
    await new Promise(resolve => setTimeout(resolve, Math.min(delayMs, 10000)));
  }

  // 3. Fail N times then succeed
  if (failAttempts > 0 && currentAttempt < failAttempts) {
    throw new Error(`Transient failure on attempt ${currentAttempt + 1} of ${failAttempts}: ${failureMessage}`);
  }

  // 4. Intentional Absolute Failure
  if (shouldFail) {
    throw new Error(failureMessage);
  }

  return {
    simulated: true,
    executedAt: new Date().toISOString(),
    attempt: currentAttempt,
    data: sampleData
  };
}

module.exports = { simulationHandler };
