
import express from "express";
import PackagesAdminController from "../../Controllers/Admin/packages.controller.js";

const packagesAdminRouter = express.Router();
const packagesAdminController = new PackagesAdminController();

/**
 * @route GET /admin/packages/top3
 * @desc Get the top 3 most recently created packages
 */
packagesAdminRouter.get("/top3", (req, res) => packagesAdminController.getTop3Packages(req, res));

/**
 * @route PUT /admin/packages/:id
 * @desc Update a package by ID (admin only)
 */
packagesAdminRouter.put("/:id", (req, res) => packagesAdminController.updatePackage(req, res));

export default packagesAdminRouter;


