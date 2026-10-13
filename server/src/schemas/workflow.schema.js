const { z } = require('zod');

// Allowlisted task types as mandated by the project specification
const TASK_TYPES = [
  'simulated',
  'http_request',
  'file_validation',
  'data_transformation',
  'report_generation'
];

const taskSchema = z.object({
  taskId: z.string().min(1, 'taskId is required').max(64),
  name: z.string().min(1, 'Task name is required').max(128),
  type: z.enum(TASK_TYPES, {
    errorMap: () => ({ message: `Type must be one of: ${TASK_TYPES.join(', ')}` })
  }),
  dependencies: z.array(z.string()).default([]),
  priority: z.number().int().min(1).max(10).default(5),
  retryPolicy: z.object({
    maxRetries: z.number().int().min(0).max(10).default(3),
    backoffMs: z.number().int().min(100).max(60000).default(1000)
  }).default({}),
  input: z.record(z.any()).default({}),
  uiPosition: z.object({
    x: z.number().default(100),
    y: z.number().default(100)
  }).default({ x: 100, y: 100 })
});

const workflowBaseSchema = z.object({
  name: z.string().min(1, 'Workflow name is required').max(128),
  description: z.string().max(512).default(''),
  tasks: z.array(taskSchema).default([])
});

function validateGraphReferences(data, ctx) {
  if (!data.tasks) return;

  // 1. Verify all taskIds are unique within the workflow
  const taskIdSet = new Set();
  data.tasks.forEach((task, index) => {
    if (taskIdSet.has(task.taskId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate taskId found: "${task.taskId}"`,
        path: ['tasks', index, 'taskId']
      });
    }
    taskIdSet.add(task.taskId);
  });

  // 2. Verify all dependency IDs exist and are not self-referential
  data.tasks.forEach((task, index) => {
    if (!task.dependencies) return;
    task.dependencies.forEach((depId) => {
      if (depId === task.taskId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Task "${task.taskId}" cannot depend on itself`,
          path: ['tasks', index, 'dependencies']
        });
      }
      if (!taskIdSet.has(depId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Dependency "${depId}" does not exist in the workflow`,
          path: ['tasks', index, 'dependencies']
        });
      }
    });
  });
}

const workflowCreateSchema = workflowBaseSchema.superRefine(validateGraphReferences);
const workflowUpdateSchema = workflowBaseSchema.partial().superRefine(validateGraphReferences);

module.exports = {
  TASK_TYPES,
  taskSchema,
  workflowBaseSchema,
  workflowCreateSchema,
  workflowUpdateSchema
};
