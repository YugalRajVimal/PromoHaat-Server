import express from "express";
import UserController from "../Controllers/User/user.controller.js"; // Rename your controller if appropriate, but for now updating variable to user
import jwtAuth from "../middlewares/Auth/auth.middleware.js";
import { upload } from "../middlewares/fileUpload.middleware.js";

const userRouter = express.Router();
const userController = new UserController();





userRouter.post(
  '/kyc/upload',
  jwtAuth,
  upload.fields([
    { name: 'aadharFrontFile', maxCount: 1 },
    { name: 'aadharBackFile', maxCount: 1 },
    { name: 'panFile', maxCount: 1 }
  ]),
  (req, res) => userController.completeKYC(req, res)
);

// Route: GET /user/packages
userRouter.get(
  '/packages',
  jwtAuth,
  (req, res) => userController.getAllPackages(req, res)
);

// Route: POST /user/purchase-package
userRouter.post(
  '/purchase-package',
  jwtAuth,
  (req, res) => userController.purchasePackage(req, res)
);

// Route: GET /user/tasks
userRouter.get(
  '/tasks',
  jwtAuth,
  (req, res) => userController.getUserTasks(req, res)
);

// Route: POST /user/complete-task
userRouter.post(
  '/complete-task',
  jwtAuth,
  (req, res) => userController.completeTask(req, res)
);

// Route: GET /user/referral-page
userRouter.get(
  '/referral-page',
  jwtAuth,
  (req, res) => userController.getReferralPage(req, res)
);


// Route: GET /user/promotional-income
userRouter.get(
  '/promotional-income',
  jwtAuth,
  (req, res) => userController.getPromotionalIncome(req, res)
);


// Route: GET /user/wallet-history
userRouter.get(
  '/wallet-history',
  jwtAuth,
  (req, res) => userController.getWalletAndHistory(req, res)
);

// Route: GET /user/profile
userRouter.get(
  '/profile',
  jwtAuth,
  (req, res) => userController.getProfileDetails(req, res)
);

// Route: GET /user/dashboard
userRouter.get(
  '/dashboard',
  jwtAuth,
  (req, res) => userController.getDashboardDetails(req, res)
);









// // User sign up - Send OTP
// userRouter.post('/signup', (req, res) => userController.parentSignUpSendOTP(req, res));

// // User sign up - Verify OTP
// userRouter.post('/verify-otp', (req, res) => userController.parentSignUpVerifyOTP(req, res));

// // Complete user profile (and create child profile/patientProfile)
// // Protected: requires authentication
// userRouter.post('/complete-profile', jwtAuth, (req, res) => userController.completeParentProfile(req, res));

// // Dashboard details for user
// userRouter.get('/dashboard', jwtAuth, (req, res) => userController.getDashboardDetails(req, res));

// // Get profile details for user
// userRouter.get('/profile', jwtAuth, (req, res) => userController.getProfileDetails(req, res));

// // Get all children for the user
// userRouter.get('/childrens', jwtAuth, (req, res) => userController.getAllChildrens(req, res));

// // Get all appointments for the user's children
// userRouter.get('/appointments', jwtAuth, (req, res) => userController.getAllAppointments(req, res));

// userRouter.get('/request-appointment-homepage', jwtAuth, (req, res) => userController.getRequestAppointmentHomePage(req, res));

// userRouter.get('/all-bookings', (req, res) =>
//   userController.allBookings(req, res)
// );

// userRouter.post('/create-booking-request', (req, res) => userController.createBookingRequest(req, res));
// userRouter.put('/booking-request/:id', (req, res) => userController.updateBookingRequest(req, res));

// userRouter.get('/booking-requests', jwtAuth, (req, res) => userController.getAllBookingRequests(req, res));
// userRouter.delete('/booking-request/:id', (req, res) => userController.deleteBookingRequest(req, res));

// userRouter.get('/booking-requests/:id', (req, res) => userController.getBookingRequestById(req, res));

// // Session Edit Request CRUD routes
// userRouter.post('/session-edit-request-bulk', (req, res) => userController.createSessionEditRequest(req, res));
// userRouter.get('/session-edit-request', (req, res) => userController.getSessionEditRequests(req, res));
// userRouter.put('/session-edit-request/:id', (req, res) => userController.updateSessionEditRequest(req, res));
// userRouter.delete('/session-edit-request/:id', (req, res) => userController.deleteSessionEditRequest(req, res));

// // Route to get invoice and payment details for user's bookings/appointments
// userRouter.get('/invoice-and-payment', jwtAuth, (req, res) => userController.getInvoiceAndPayment(req, res));

export default userRouter;
