import express from "express";


import PaymentController from "../../Controllers/Payment/payment.controller.js";
import jwtAuth from "../../middlewares/Auth/auth.middleware.js";

const paymentRouter = express.Router();

const paymentController = new PaymentController();


paymentRouter.post("/create-order",jwtAuth,  (req, res) => {
    paymentController.createOrder(req,res)
  });

  paymentRouter.post("/verify-payment",jwtAuth,  (req, res) => {
    paymentController.verifyPayment(req,res)
  });



export default paymentRouter;
