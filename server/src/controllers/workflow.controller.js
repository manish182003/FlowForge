const mongoose = require('mongoose');
const Workflow = require('../models/Workflow');
const { workflowCreateSchema, workflowUpdateSchema } = require('../schemas/workflow.schema');

/**
 * Validates if a string is a valid MongoDB ObjectId.
 */
function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

/**
 * POST /api/workflows
 * Creates a new workflow document after validating task schemas and dependency references.
 */
async function createWorkflow(req, res, next) {
  try {
    const parseResult = workflowCreateSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Workflow validation failed',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          details: parseResult.error.errors
        }
      });
    }

    const workflow = new Workflow(parseResult.data);
    const savedWorkflow = await workflow.save();

    res.status(201).json({
      success: true,
      data: savedWorkflow
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/workflows
 * Lists workflows with pagination and sorting.
 */
async function listWorkflows(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const [workflows, total] = await Promise.all([
      Workflow.find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Workflow.countDocuments()
    ]);

    res.status(200).json({
      success: true,
      data: workflows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/workflows/:id
 * Retrieves a single workflow by its ID.
 */
async function getWorkflowById(req, res, next) {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        error: {
          message: `Invalid workflow ID format: ${id}`,
          code: 'INVALID_ID',
          statusCode: 400
        }
      });
    }

    const workflow = await Workflow.findById(id).lean();
    if (!workflow) {
      return res.status(404).json({
        success: false,
        error: {
          message: `Workflow not found with ID: ${id}`,
          code: 'NOT_FOUND',
          statusCode: 404
        }
      });
    }

    res.status(200).json({
      success: true,
      data: workflow
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/workflows/:id
 * Updates an existing workflow.
 */
async function updateWorkflow(req, res, next) {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        error: {
          message: `Invalid workflow ID format: ${id}`,
          code: 'INVALID_ID',
          statusCode: 400
        }
      });
    }

    const parseResult = workflowUpdateSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Workflow update validation failed',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          details: parseResult.error.errors
        }
      });
    }

    const updatedWorkflow = await Workflow.findByIdAndUpdate(
      id,
      { $set: parseResult.data },
      { new: true, runValidators: true }
    ).lean();

    if (!updatedWorkflow) {
      return res.status(404).json({
        success: false,
        error: {
          message: `Workflow not found with ID: ${id}`,
          code: 'NOT_FOUND',
          statusCode: 404
        }
      });
    }

    res.status(200).json({
      success: true,
      data: updatedWorkflow
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/workflows/:id
 * Deletes a workflow by ID.
 */
async function deleteWorkflow(req, res, next) {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        error: {
          message: `Invalid workflow ID format: ${id}`,
          code: 'INVALID_ID',
          statusCode: 400
        }
      });
    }

    const deleted = await Workflow.findByIdAndDelete(id).lean();
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: {
          message: `Workflow not found with ID: ${id}`,
          code: 'NOT_FOUND',
          statusCode: 404
        }
      });
    }

    res.status(200).json({
      success: true,
      message: `Workflow ${id} successfully deleted`
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createWorkflow,
  listWorkflows,
  getWorkflowById,
  updateWorkflow,
  deleteWorkflow
};
