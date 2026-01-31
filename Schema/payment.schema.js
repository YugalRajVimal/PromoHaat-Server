// models/Payment.js

import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },

  package: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Package",
  },

  orderId: String,
  paymentId: String,
  signature: String,

  amount: Number,

  status: {
    type: String,
    enum: ["CREATED", "PAID", "FAILED"],
    default: "CREATED",
  },
}, { timestamps: true });

const Payment = mongoose.model("Payment", paymentSchema);
export default Payment;
