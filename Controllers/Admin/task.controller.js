import { Tasks } from "../../Schema/task.schema.js";


class TasksAdminController {

    addTasks = async (req, res) => {
        try {
            // Validate input
            const { name, description = "", link } = req.body;

            if (!name || typeof name !== "string" || !name.trim()) {
                return res.status(400).json({ success: false, message: "Task 'name' is required." });
            }

            // Ensure link is provided, is a string, and not empty/null
            if (typeof link !== "string" || !link.trim()) {
                return res.status(400).json({ success: false, message: "Task 'link' is required and cannot be null or empty." });
            }

            const trimmedLink = link.trim();

            // Validate that link is a valid URL starting with http/https
            try {
                const urlObj = new URL(trimmedLink);
                if (!/^https?:/.test(urlObj.protocol)) {
                    return res.status(400).json({ success: false, message: "Task 'link' must start with http or https." });
                }
            } catch {
                return res.status(400).json({ success: false, message: "Task 'link' must be a valid URL." });
            }

            // Check if a task with the same link already exists
            const existedTask = await Tasks.findOne({ link: trimmedLink });
            if (existedTask) {
                return res.status(400).json({ success: false, message: "Task with the same link already exists." });
            }

            const newTask = new Tasks({
                name: name.trim(),
                description: description && description.trim ? description.trim() : "",
                link: trimmedLink
            });

            const savedTask = await newTask.save();

            return res.status(201).json({ success: true, data: savedTask, message: "Task added successfully." });
        } catch (error) {
            return res.status(500).json({ success: false, message: "Failed to add task.", error: error.message });
        }
    }

    addMultipleTasks = async (req, res) => {
        try {
            // Expects an array of tasks in req.body.tasks
            const { tasks } = req.body;

            if (!Array.isArray(tasks) || tasks.length === 0) {
                return res.status(400).json({ success: false, message: "No tasks provided." });
            }

            // Validate each task object and remove duplicates by name before db check
            const validTasks = [];
            const namesSet = new Set(); // for duplicate filter in incoming data
            for (const task of tasks) {
                if (!task.name || typeof task.name !== "string" || !task.name.trim()) {
                    return res.status(400).json({
                        success: false,
                        message: "Each task must have a non-empty 'name' field."
                    });
                }

                // Ensure that each task's link is provided, is a string, and not empty/null
                if (typeof task.link !== "string" || !task.link.trim()) {
                    return res.status(400).json({
                        success: false,
                        message: "Each task 'link' is required and cannot be null or empty."
                    });
                }

                const trimmedName = task.name.trim();
                const trimmedLink = task.link.trim();

                if (namesSet.has(trimmedName)) {
                    continue; // skip duplicate task in input array
                }
                namesSet.add(trimmedName);

                // Validate link: must be valid and start with http/https
                try {
                    const urlObj = new URL(trimmedLink);
                    if (!/^https?:/.test(urlObj.protocol)) {
                        return res.status(400).json({
                            success: false,
                            message: "Each task 'link' must start with http or https."
                        });
                    }
                } catch {
                    return res.status(400).json({
                        success: false,
                        message: "Each task 'link' must be a valid URL."
                    });
                }

                validTasks.push({
                    name: trimmedName,
                    description: task.description && typeof task.description === "string"
                        ? task.description.trim()
                        : "",
                    link: trimmedLink
                });
            }

            // Check for existing tasks in DB (by link only, since link is now required and must be unique)
            const incomingLinks = validTasks.map(t => t.link);

            const existingTasks = await Tasks.find({ 
                link: { $in: incomingLinks }
            });

            const existingNames = new Set(existingTasks.map(t => t.name));
            const existingLinks = new Set(existingTasks.map(t => t.link).filter(link => link));

            const tasksToInsert = validTasks.filter(t => 
                !existingNames.has(t.name) && !existingLinks.has(t.link)
            );

            if (tasksToInsert.length === 0) {
                return res.status(200).json({
                    success: true,
                    data: [],
                    message: "No new tasks were added. All provided tasks already exist."
                });
            }

            // Insert new, non-duplicate tasks only
            const insertedTasks = await Tasks.insertMany(tasksToInsert);

            return res.status(201).json({
                success: true,
                data: insertedTasks,
                message: `${insertedTasks.length} task(s) added successfully.`
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: "Failed to add multiple tasks.",
                error: error.message
            });
        }
    }

}

export default TasksAdminController;

