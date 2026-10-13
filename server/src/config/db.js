const mongoose = require('mongoose');

const readyStates = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting'
};

/**
 * Returns a human-readable string and code for the current Mongoose connection state.
 */
function getDatabaseState() {
  const stateCode = mongoose.connection.readyState;
  return {
    code: stateCode,
    state: readyStates[stateCode] || 'unknown',
    name: mongoose.connection.name || null
  };
}

/**
 * Establishes a connection to MongoDB with connection event listeners.
 * @param {string} uri - MongoDB connection string
 */
async function connectDB(uri) {
  // If already connected, return early
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  mongoose.connection.on('connected', () => {
    console.log(`[Database] MongoDB connection established successfully (${mongoose.connection.name}).`);
  });

  mongoose.connection.on('error', (err) => {
    console.error('[Database] MongoDB connection error:', err.message);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('[Database] MongoDB disconnected.');
  });

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000 // Timeout early (5s) instead of hanging indefinitely
    });
    return mongoose.connection;
  } catch (error) {
    console.error(`[Database] Failed to connect to MongoDB at ${uri}:`, error.message);
    throw error;
  }
}

/**
 * Cleanly disconnects from MongoDB.
 */
async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

module.exports = {
  connectDB,
  disconnectDB,
  getDatabaseState
};

