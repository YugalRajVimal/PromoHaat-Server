
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

export default tasksAdminRouter;

