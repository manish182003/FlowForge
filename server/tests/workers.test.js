const { simulationHandler } = require('../src/task-handlers/simulation.handler');
const { 
  httpRequestHandler, 
  validateTargetUrl, 
  isRestrictedIp 
} = require('../src/task-handlers/http.handler');
const { fileValidationHandler } = require('../src/task-handlers/fileValidation.handler');
const { dataTransformHandler } = require('../src/task-handlers/dataTransform.handler');
const { reportGenerationHandler } = require('../src/task-handlers/reportGeneration.handler');
const { executeTaskHandler } = require('../src/task-handlers/registry');

describe('Module 5: Task Handlers & Distributed Workers', () => {
  describe('Simulation Handler', () => {
    it('should successfully execute with configurable delay and return sample output', async () => {
      const result = await simulationHandler({
        delayMs: 10,
        sampleData: { status: 'ok', value: 42 }
      }, { attempt: 0 });

      expect(result.simulated).toBe(true);
      expect(result.data.value).toBe(42);
    });

    it('should throw an error when shouldFail is true', async () => {
      await expect(simulationHandler({
        shouldFail: true,
        failureMessage: 'Database connection dropped'
      })).rejects.toThrow('Database connection dropped');
    });

    it('should fail N times and then succeed on attempt >= N', async () => {
      const input = {
        failAttempts: 2,
        failureMessage: 'Transient timeout'
      };

      // Attempt 0 (first try) -> fails
      await expect(simulationHandler(input, { attempt: 0 }))
        .rejects.toThrow(/Transient failure on attempt 1 of 2/);

      // Attempt 1 (second try) -> fails
      await expect(simulationHandler(input, { attempt: 1 }))
        .rejects.toThrow(/Transient failure on attempt 2 of 2/);

      // Attempt 2 (third try) -> succeeds!
      const result = await simulationHandler(input, { attempt: 2 });
      expect(result.simulated).toBe(true);
    });
  });

  describe('HTTP Request Handler (SSRF Defense)', () => {
    it('should reject loopback addresses (localhost, 127.0.0.1, ::1)', () => {
      expect(() => validateTargetUrl('http://localhost:3000/api'))
        .toThrow(/SSRF Protection: Requests to loopback host/);

      expect(() => validateTargetUrl('http://127.0.0.1:8080/metrics'))
        .toThrow(/SSRF Protection: Requests to loopback host/);

      expect(() => validateTargetUrl('http://[::1]:5000'))
        .toThrow(/SSRF Protection/);
    });

    it('should reject AWS / Cloud Metadata endpoint (169.254.169.254)', () => {
      expect(() => validateTargetUrl('http://169.254.169.254/latest/meta-data/'))
        .toThrow(/SSRF Protection: Requests to private\/link-local address/);
    });

    it('should reject private RFC 1918 subnets', () => {
      // 10.0.0.0/8
      expect(() => validateTargetUrl('http://10.0.0.5/admin'))
        .toThrow(/SSRF Protection: Requests to private/);

      // 172.16.0.0/12
      expect(() => validateTargetUrl('http://172.20.1.1:8080'))
        .toThrow(/SSRF Protection: Requests to private/);

      // 192.168.0.0/16
      expect(() => validateTargetUrl('http://192.168.1.100'))
        .toThrow(/SSRF Protection: Requests to private/);
    });

    it('should accept valid public HTTP/HTTPS URLs', () => {
      expect(() => validateTargetUrl('https://api.github.com/users'))
        .not.toThrow();
    });
  });

  describe('File Validation Handler', () => {
    it('should validate structured JSON data and report schema headers', async () => {
      const jsonContent = JSON.stringify([
        { id: 1, name: 'Alice', role: 'admin' },
        { id: 2, name: 'Bob', role: 'user' }
      ]);

      const result = await fileValidationHandler({
        format: 'json',
        content: jsonContent,
        requiredFields: ['id', 'name']
      });

      expect(result.valid).toBe(true);
      expect(result.recordCount).toBe(2);
      expect(result.headers).toEqual(['id', 'name', 'role']);
    });

    it('should reject JSON missing required fields', async () => {
      const jsonContent = JSON.stringify([
        { name: 'Alice' } // Missing 'id'
      ]);

      await expect(fileValidationHandler({
        format: 'json',
        content: jsonContent,
        requiredFields: ['id', 'name']
      })).rejects.toThrow(/Missing required fields: \[id\]/);
    });

    it('should validate CSV format and extract column headers', async () => {
      const csvContent = "user_id,email,active\n101,test@example.com,true\n102,user@example.com,false";

      const result = await fileValidationHandler({
        format: 'csv',
        content: csvContent,
        requiredFields: ['user_id', 'email']
      });

      expect(result.valid).toBe(true);
      expect(result.recordCount).toBe(2);
      expect(result.headers).toEqual(['user_id', 'email', 'active']);
    });
  });

  describe('Data Transformation Handler', () => {
    const dataset = [
      { id: 1, city: 'NY', amount: 100, comment: null },
      { id: 2, city: 'SF', amount: 300, comment: 'priority' },
      { id: 3, city: 'NY', amount: 200, comment: undefined },
      { id: 4, city: 'SF', amount: 150, comment: '' }
    ];

    it('should clean null and empty fields with clean_nulls operation', async () => {
      const result = await dataTransformHandler({
        records: dataset,
        operation: 'clean_nulls'
      });

      expect(result.transformedRecords[0]).toEqual({ id: 1, city: 'NY', amount: 100 });
      expect(result.transformedRecords[0]).not.toHaveProperty('comment');
    });

    it('should filter records using comparison operators', async () => {
      const result = await dataTransformHandler({
        records: dataset,
        operation: 'filter',
        config: { field: 'amount', operator: 'gt', value: 150 }
      });

      expect(result.outputCount).toBe(2);
      expect(result.transformedRecords.map(r => r.id)).toEqual([2, 3]);
    });

    it('should aggregate records by group and compute metrics', async () => {
      const result = await dataTransformHandler({
        records: dataset,
        operation: 'aggregate',
        config: { groupBy: 'city', metricField: 'amount', metricType: 'sum' }
      });

      const ny = result.transformedRecords.find(r => r.city === 'NY');
      const sf = result.transformedRecords.find(r => r.city === 'SF');

      expect(ny.value).toBe(300); // 100 + 200
      expect(sf.value).toBe(450); // 300 + 150
    });
  });

  describe('Report Generation Handler', () => {
    it('should compile structured JSON and Markdown summary reports', async () => {
      const input = {
        reportTitle: 'ETL Pipeline Run #42',
        format: 'markdown',
        summaryMetrics: { processedRows: 5000, errorRate: '0.00%' },
        sections: [
          { heading: 'Overview', content: 'Pipeline finished with zero anomalies.' }
        ]
      };

      const result = await reportGenerationHandler(input, { runId: 'run-99' });

      expect(result.format).toBe('markdown');
      expect(result.markdownText).toContain('# ETL Pipeline Run #42');
      expect(result.markdownText).toContain('- **processedRows:** 5000');
      expect(result.markdownText).toContain('### Overview');
    });
  });

  describe('Task Handler Registry Dispatcher', () => {
    it('should dispatch registered handlers by type string', async () => {
      const result = await executeTaskHandler('simulated', {
        sampleData: { hello: 'world' }
      });

      expect(result.simulated).toBe(true);
      expect(result.data.hello).toBe('world');
    });

    it('should throw an informative error when an unknown type is requested', async () => {
      await expect(executeTaskHandler('unknown_custom_handler', {}))
        .rejects.toThrow(/No registered handler found for task type/);
    });
  });
});
