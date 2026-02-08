
import express from "express";
import TasksAdminController from "../../Controllers/Admin/task.controller.js";

const tasksAdminRouter = express.Router();
const tasksAdminController = new TasksAdminController();

/**
 * @route POST /admin/tasks
 * @desc Add a new task
 */
tasksAdminRouter.post("/", (req, res) => tasksAdminController.addTasks(req, res));

/**
 * @route POST /admin/tasks/multiple
 * @desc Add multiple tasks in bulk
 */
tasksAdminRouter.post("/multiple", (req, res) => tasksAdminController.addMultipleTasks(req, res));

/**
 * @route GET /admin/tasks
 * @desc Fetch all tasks with pagination
 *       Query params: page, limit (optional)
 */
tasksAdminRouter.get("/", (req, res) => tasksAdminController.fetchAllTask(req, res));

/**
 * @route DELETE /admin/tasks/:id
 * @desc Delete a single task by id
 */
tasksAdminRouter.delete("/:id", (req, res) => tasksAdminController.deleteTask(req, res));

/**
 * @route DELETE /admin/tasks/delete/selected
 * @desc Bulk delete selected tasks by array of ids
 *       Body: { ids: [...] }
 */
tasksAdminRouter.delete("/delete/selected", (req, res) => tasksAdminController.deleteSelectedTask(req, res));

/**
 * @route DELETE /admin/tasks/delete/all
 * @desc Delete all tasks from the collection
 */
tasksAdminRouter.delete("/delete/all", (req, res) => tasksAdminController.deleteAllTask(req, res));



export default tasksAdminRouter;

