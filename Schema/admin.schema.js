// Admin Schema Only

import mongoose from "mongoose";

const AdminSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ["admin"],
      required: true,
      default: "admin",
    },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, sparse: true, lowercase: true, trim: true },
    phone: { type: String, default: "" },
    // OTP fields for admin sign-in
    otp: { type: String }, // Last sent OTP
    otpExpiresAt: { type: Date }, // Expiry time for current OTP
    otpGeneratedAt: { type: Date }, // When was the OTP generated
    otpAttempts: { type: Number, default: 0 }, // Attempts for the current OTP

    kycAutoApprove: {
      type: Boolean,
      default: false,
      required: false,
      // If true, user KYC is auto-approved on upload; if false, manual admin review is required
    },

   
    lastLogin: { type: Date, default: null },

    // Audit fields for tracking who added/edited this admin
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: false },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: false },
  },
  { timestamps: true }
);

export const Admin = mongoose.model("Admin", AdminSchema);
