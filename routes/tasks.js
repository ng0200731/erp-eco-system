import express from 'express';

const router = express.Router();

/**
 * Create task routes
 * @param {Object} deps - Dependencies
 * @param {Function} deps.createTask - Create task function
 * @param {Function} deps.getTaskById - Get task by ID function
 * @param {Function} deps.listTasks - List tasks function
 * @param {Function} deps.updateTaskStatus - Update task status function
 * @param {Object} deps.TASK_STATUS - Task status constants
 */
export function createTaskRoutes(deps) {
  const { createTask, getTaskById, listTasks, updateTaskStatus, TASK_STATUS } = deps;

  // List tasks with optional status filter
  router.get('/', async (req, res) => {
    try {
      const status = req.query.status ? String(req.query.status) : undefined;
      const tasks = await listTasks({ status });
      res.json({ success: true, tasks });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err.message || 'Failed to list tasks',
        code: err.code || 'UNKNOWN',
      });
    }
  });

  // Get task by ID
  router.get('/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!id || isNaN(id)) {
        return res.status(400).json({ success: false, error: 'Invalid task id' });
      }
      const task = await getTaskById(id);
      if (!task) {
        return res.status(404).json({ success: false, error: 'Task not found' });
      }
      res.json({ success: true, task });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err.message || 'Failed to get task',
        code: err.code || 'UNKNOWN',
      });
    }
  });

  // Create new task
  router.post('/', async (req, res) => {
    try {
      const {
        type,
        status,
        sourceEmailUid,
        sourceSubject,
        customerEmail,
        notes,
      } = req.body || {};

      const created = await createTask({
        type,
        status: status || TASK_STATUS.NEW,
        sourceEmailUid: sourceEmailUid ?? null,
        sourceSubject: sourceSubject ?? null,
        customerEmail: customerEmail ?? null,
        notes: notes ?? null,
      });

      res.json({ success: true, task: created });
    } catch (err) {
      res.status(400).json({
        success: false,
        error: err.message || 'Failed to create task',
        code: err.code || 'BAD_REQUEST',
      });
    }
  });

  // Update task status
  router.post('/:id/status', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { status } = req.body || {};
      if (!id || isNaN(id)) {
        return res.status(400).json({ success: false, error: 'Invalid task id' });
      }
      if (!status || typeof status !== 'string') {
        return res.status(400).json({ success: false, error: 'Invalid status' });
      }
      const updated = await updateTaskStatus(id, status);
      if (!updated) {
        return res.status(404).json({ success: false, error: 'Task not found' });
      }
      res.json({ success: true, task: updated });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err.message || 'Failed to update task status',
        code: err.code || 'UNKNOWN',
      });
    }
  });

  return router;
}
