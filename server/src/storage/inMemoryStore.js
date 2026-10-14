const mongoose = require('mongoose');

// In-memory collections for degraded mode when local MongoDB is not running
const workflows = new Map();
const workflowRuns = new Map();
const taskRuns = new Map();
const executionLogs = new Map();

// Seed initial blueprints
const seedBlueprints = [
  {
    _id: '66fa00000000000000000001',
    name: 'ETL Pipeline Demo',
    description: 'Download CSV -> Validate Schema -> Transform Records -> Generate Report',
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tasks: [
      {
        taskId: 'download_data',
        name: 'Download CSV Data',
        type: 'http_request',
        priority: 8,
        dependencies: [],
        retryPolicy: { maxRetries: 3, backoffMs: 1000 },
        input: { url: 'https://example.com/data.csv' },
        uiPosition: { x: 60, y: 190 }
      },
      {
        taskId: 'validate_schema',
        name: 'Validate CSV Format',
        type: 'file_validation',
        priority: 7,
        dependencies: ['download_data'],
        retryPolicy: { maxRetries: 2, backoffMs: 1000 },
        input: { format: 'csv', strict: true },
        uiPosition: { x: 340, y: 100 }
      },
      {
        taskId: 'sanitize_rows',
        name: 'Sanitize Bad Rows',
        type: 'data_transformation',
        priority: 5,
        dependencies: ['download_data'],
        retryPolicy: { maxRetries: 2, backoffMs: 1000 },
        input: { op: 'clean_nulls' },
        uiPosition: { x: 340, y: 280 }
      },
      {
        taskId: 'aggregate_metrics',
        name: 'Transform & Aggregate',
        type: 'data_transformation',
        priority: 6,
        dependencies: ['validate_schema', 'sanitize_rows'],
        retryPolicy: { maxRetries: 3, backoffMs: 2000 },
        input: { groupBy: 'region' },
        uiPosition: { x: 620, y: 190 }
      },
      {
        taskId: 'export_report',
        name: 'Generate Final PDF',
        type: 'report_generation',
        priority: 9,
        dependencies: ['aggregate_metrics'],
        retryPolicy: { maxRetries: 1, backoffMs: 5000 },
        input: { format: 'pdf' },
        uiPosition: { x: 900, y: 190 }
      }
    ]
  },
  {
    _id: '66fa00000000000000000002',
    name: 'Parallel Diamond Fan-Out',
    description: 'Ingest Event -> 3 Concurrent Workers (Inventory, Fraud, Tax) -> Join Settlement',
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tasks: [
      {
        taskId: 'ingest_order',
        name: 'Ingest Order Event',
        type: 'http_request',
        priority: 8,
        dependencies: [],
        retryPolicy: { maxRetries: 2, backoffMs: 1000 },
        input: { url: 'https://example.com/api/order' },
        uiPosition: { x: 60, y: 190 }
      },
      {
        taskId: 'check_inventory',
        name: 'Check Warehouse Stock',
        type: 'simulated',
        priority: 7,
        dependencies: ['ingest_order'],
        retryPolicy: { maxRetries: 2, backoffMs: 1000 },
        input: { simulateDelayMs: 600 },
        uiPosition: { x: 340, y: 70 }
      },
      {
        taskId: 'fraud_check',
        name: 'Run ML Fraud Model',
        type: 'simulated',
        priority: 9,
        dependencies: ['ingest_order'],
        retryPolicy: { maxRetries: 3, backoffMs: 1000 },
        input: { simulateDelayMs: 900 },
        uiPosition: { x: 340, y: 190 }
      },
      {
        taskId: 'tax_calc',
        name: 'Calculate Regional Tax',
        type: 'data_transformation',
        priority: 6,
        dependencies: ['ingest_order'],
        retryPolicy: { maxRetries: 2, backoffMs: 1000 },
        input: { op: 'calculate_tax' },
        uiPosition: { x: 340, y: 310 }
      },
      {
        taskId: 'payment_settlement',
        name: 'Capture Payment & Join',
        type: 'simulated',
        priority: 10,
        dependencies: ['check_inventory', 'fraud_check', 'tax_calc'],
        retryPolicy: { maxRetries: 2, backoffMs: 2000 },
        input: { simulateDelayMs: 1200 },
        uiPosition: { x: 620, y: 190 }
      },
      {
        taskId: 'emit_receipt',
        name: 'Generate Customer Receipt',
        type: 'report_generation',
        priority: 5,
        dependencies: ['payment_settlement'],
        retryPolicy: { maxRetries: 1, backoffMs: 1000 },
        input: { format: 'pdf' },
        uiPosition: { x: 900, y: 190 }
      }
    ]
  },
  {
    _id: '66fa00000000000000000003',
    name: 'Fault-Tolerant Resilience Loop',
    description: 'Demonstrates exponential backoff retry when a worker encounters transient failure',
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tasks: [
      {
        taskId: 'init_connection',
        name: 'Initialize Remote Session',
        type: 'simulated',
        priority: 8,
        dependencies: [],
        retryPolicy: { maxRetries: 2, backoffMs: 1000 },
        input: { simulateDelayMs: 400 },
        uiPosition: { x: 80, y: 170 }
      },
      {
        taskId: 'flaky_fetch',
        name: 'Flaky Remote Ingestion',
        type: 'simulated',
        priority: 7,
        dependencies: ['init_connection'],
        retryPolicy: { maxRetries: 3, backoffMs: 1500 },
        input: { failCount: 2, simulateDelayMs: 800 },
        uiPosition: { x: 380, y: 170 }
      },
      {
        taskId: 'finalize_sync',
        name: 'Persist Synced Records',
        type: 'report_generation',
        priority: 6,
        dependencies: ['flaky_fetch'],
        retryPolicy: { maxRetries: 2, backoffMs: 1000 },
        input: { format: 'json' },
        uiPosition: { x: 680, y: 170 }
      }
    ]
  }
];

seedBlueprints.forEach(bp => workflows.set(bp._id, bp));

module.exports = {
  workflows,
  workflowRuns,
  taskRuns,
  executionLogs
};

