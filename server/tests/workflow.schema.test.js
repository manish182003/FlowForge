const { workflowCreateSchema } = require('../src/schemas/workflow.schema');

describe('Module 2: Workflow Schema & Graph Validation', () => {
  it('should accept a valid workflow with valid task dependencies', () => {
    const validData = {
      name: 'ETL Data Pipeline',
      description: 'Downloads CSV, validates, and transforms data',
      tasks: [
        {
          taskId: 'download_csv',
          name: 'Download CSV File',
          type: 'http_request',
          priority: 8,
          input: { url: 'https://api.example.com/data.csv' },
          uiPosition: { x: 100, y: 150 }
        },
        {
          taskId: 'validate_csv',
          name: 'Validate CSV Format',
          type: 'file_validation',
          dependencies: ['download_csv'],
          priority: 5,
          uiPosition: { x: 300, y: 150 }
        },
        {
          taskId: 'transform_data',
          name: 'Transform Records',
          type: 'data_transformation',
          dependencies: ['validate_csv'],
          priority: 5,
          uiPosition: { x: 500, y: 150 }
        }
      ]
    };

    const result = workflowCreateSchema.safeParse(validData);
    expect(result.success).toBe(true);
    expect(result.data.tasks.length).toBe(3);
    expect(result.data.tasks[1].dependencies).toEqual(['download_csv']);
  });

  it('should reject duplicate taskIds within the same workflow', () => {
    const duplicateData = {
      name: 'Duplicate Tasks Workflow',
      tasks: [
        {
          taskId: 'step_1',
          name: 'First Step',
          type: 'simulated'
        },
        {
          taskId: 'step_1', // Duplicate ID
          name: 'Conflicting Step',
          type: 'simulated'
        }
      ]
    };

    const result = workflowCreateSchema.safeParse(duplicateData);
    expect(result.success).toBe(false);
    const issue = result.error.issues.find(i => i.message.includes('Duplicate taskId'));
    expect(issue).toBeDefined();
    expect(issue.message).toBe('Duplicate taskId found: "step_1"');
  });

  it('should reject a task that depends on itself (self-loop)', () => {
    const selfLoopData = {
      name: 'Self Loop Workflow',
      tasks: [
        {
          taskId: 'self_dep_task',
          name: 'Self Dependent',
          type: 'simulated',
          dependencies: ['self_dep_task'] // Depends on itself
        }
      ]
    };

    const result = workflowCreateSchema.safeParse(selfLoopData);
    expect(result.success).toBe(false);
    const issue = result.error.issues.find(i => i.message.includes('cannot depend on itself'));
    expect(issue).toBeDefined();
    expect(issue.message).toBe('Task "self_dep_task" cannot depend on itself');
  });

  it('should reject a task referencing a non-existent dependency ID', () => {
    const missingDepData = {
      name: 'Missing Prerequisite Workflow',
      tasks: [
        {
          taskId: 'final_task',
          name: 'Final Reporting',
          type: 'report_generation',
          dependencies: ['non_existent_prerequisite']
        }
      ]
    };

    const result = workflowCreateSchema.safeParse(missingDepData);
    expect(result.success).toBe(false);
    const issue = result.error.issues.find(i => i.message.includes('does not exist'));
    expect(issue).toBeDefined();
    expect(issue.message).toBe('Dependency "non_existent_prerequisite" does not exist in the workflow');
  });

  it('should reject non-allowlisted task types', () => {
    const invalidTypeData = {
      name: 'Hostile Task Type Workflow',
      tasks: [
        {
          taskId: 'shell_exec',
          name: 'Run Shell Command',
          type: 'arbitrary_bash_command' // Forbidden
        }
      ]
    };

    const result = workflowCreateSchema.safeParse(invalidTypeData);
    expect(result.success).toBe(false);
    const issue = result.error.issues.find(i => i.path.includes('type'));
    expect(issue).toBeDefined();
  });

  it('should enforce priority bounds between 1 and 10', () => {
    const invalidPriorityData = {
      name: 'Out of bounds priority',
      tasks: [
        {
          taskId: 'task_low',
          name: 'Low Priority',
          type: 'simulated',
          priority: 0 // Min is 1
        }
      ]
    };

    const result = workflowCreateSchema.safeParse(invalidPriorityData);
    expect(result.success).toBe(false);
  });
});

