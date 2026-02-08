
import express from "express";
import UserAdminController from "../../Controllers/Admin/user.controller.js";

const userAdminRouter = express.Router();
const userAdminController = new UserAdminController();

/**
 * @route GET /admin/users
 * @desc Get all users (excluding password)
 */
userAdminRouter.get("/", (req, res) => userAdminController.getAllUsers(req, res));



/**
 * @route GET /admin/users/root
 * @desc Get all root users (users with no parent)
 */
userAdminRouter.get("/roots", (req, res) => userAdminController.getAllRootUsers(req, res));
/**
 * @route GET /admin/users/tree/:id
 * @desc Get a user's basic details and their immediate left/right children (admin view)
 */

userAdminRouter.get("/tree/:id", (req, res) => userAdminController.getUserTree(req, res));


/**
 * @route POST /admin/kyc/auto-approve
 * @desc Toggle KYC auto-approve setting for all admins
 */
userAdminRouter.post("/kyc/auto-approve", (req, res) => userAdminController.toggleKYCAutoApprove(req, res));

/**
 * @route POST /admin/kyc/approve
 * @desc Approve a user's KYC (admin action)
 */
userAdminRouter.post("/kyc/approve", (req, res) => userAdminController.approveKYC(req, res));
userAdminRouter.post("/kyc/approve-all", (req, res) => userAdminController.approveAllUsersKYC(req, res));

/**
 * @route GET /admin/payments
 * @desc Get all payments, populated with user and package info
 */
userAdminRouter.get("/payments", (req, res) => userAdminController.getAllPayments(req, res));


export default userAdminRouter;

