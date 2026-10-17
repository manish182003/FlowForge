const { z } = require('zod');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env file if present
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
// Also allow local server/.env fallback
dotenv.config();

/**
 * Strict schema for environment variables using Zod.
 * Fails fast during application startup if any critical configuration is missing or invalid.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().transform(val => parseInt(val, 10)).default('5000'),
  CLIENT_URL: z.string().default('http://localhost:5173'),
  MONGODB_URI: z.string().default('mongodb://localhost:27017/flowforge'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info')
});

let parsedEnv;

try {
  parsedEnv = envSchema.parse(process.env);
} catch (error) {
  console.error('====================================================');
  console.error('FATAL: Environment validation failed on startup:');
  console.error(error.errors || error.message);
  console.error('====================================================');
  process.exit(1);
}

module.exports = parsedEnv;

