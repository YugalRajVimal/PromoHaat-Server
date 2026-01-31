// User Schema Only

import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ["user"],
      required: true,
    },
    name: { type: String, required: true },
    email: { type: String, sparse: true },
    phone: { type: String, default: "" },
    address: {
      street: { type: String, default: "" },
      city: { type: String, default: "" },
      state: { type: String, default: "" },
      postalCode: { type: String, default: "" },
      country: { type: String, default: "" },
    },
    authProvider: {
      type: String,
      enum: ["otp", "password"],
      required: true,
    },

    // For superadmin ONLY: passwordHash is required.
    // For others, passwordHash remains undefined/not used.
    passwordHash: {
      type: String,
      required: function () {
        return this.role === "superadmin";
      },
    },
    // OTP fields are available for all users.
    otp: { type: String }, // Last sent OTP
    otpExpiresAt: { type: Date }, // Expiry time for current OTP
    otpGeneratedAt: { type: Date }, // When was the OTP generated
    otpAttempts: { type: Number, default: 0 }, // Attempts for the current OTP
    phoneVerified: { type: Boolean, default: false },
    emailVerified: { type: Boolean, default: false },

    status: {
      type: String,
      enum: ["active", "suspended", "deleted"],
      default: "active",
    },
    isDisabled: { type: Boolean, default: false },
    incompleteProfile: { type: Boolean, default: true },

    // KYC Fields
    // See: CompleteKYC.tsx for frontend names and validations
    isKYCCompleted: { type: Boolean, default: false },
    kyc: {
      aadharNumber: { type: String, default: "" }, // 12-digit
      aadharFrontUrl: { type: String, default: "" },
      aadharBackUrl: { type: String, default: "" },
      panNumber: { type: String, default: "" }, // 10-character
      panCardUrl: { type: String, default: "" },
      kycSubmittedAt: { type: Date }, // when was KYC uploaded
      kycVerifiedAt: { type: Date }, // when admin verified
      kycStatus: {
        type: String,
        enum: ["pending", "approved", "rejected", "none"],
        default: "none", // "none": never submitted, "pending": needs review, etc.
      },
      kycRejectionReason: { type: String, default: "" }, // if rejected, why
    },



    isAnyPackagePurchased: {
      type: Boolean,
      default: false,
    },    // Fields to track package purchase and expiry (valid for a month)
    package: {
      type: mongoose.Schema.Types.ObjectId, // Reference to the purchased package (if any)
      ref: "Package",
    },
    packagePurchasedAt: {
      type: Date,
      default: null,
    },
    packageExpiresAt: {
      type: Date,
      default: null,
    },

    referralCode: {
      type: String,
      required: false,
      unique: true,
      trim: true,
      default: null
    },
    referredOn: {
      type: String,
      enum: ["left", "right"],
      default: null
    },
    referredBy: {
      type: String,
      required: false,
      trim: true,
      default: null
    },


    // Task History: Array to keep a log of completed tasks (with relevant info)
    taskHistory: [
      {
        _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
        name: { type: String, required: true },
        description: { type: String, default: "" },
        link: { type: String, default: "" },
        completedAt: { type: Date, required: true }
      }
    ],
    // Array of user tasks, each with a date and optional fields
    tasks: [
      {
        _id: { type: mongoose.Schema.Types.ObjectId, auto: true }, // task id
        name: { type: String, required: true },
        description: { type: String, default: "" },
        link: { type: String, default: "" },
        date: { type: Date, required: true }, // When the task is assigned 
        completed: { type: Boolean, default: false },
        completedAt: { type: Date, default: null }
      }
    ],

  leftCarry: {
    type: Number,
    default: 0,
    min: 0,
  },
  rightCarry: {
    type: Number,
    default: 0,
    min: 0,
  },

  wallet: {
    type: Number,
    default: 0,
    min: 0
  },
  transactionHistory: [
    {
      _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
      type: {
        type: String,
        enum: ["credit", "debit"],
        required: true
      },
      amount: {
        type: Number,
        required: true,
        min: 0
      },
      description: {
        type: String,
        default: ""
      },
      relatedOrderId: {
        type: String,
        default: null
      },
      date: {
        type: Date,
        default: Date.now
      }
    }
  ],

  promotionalIncome: [
    {
      week: { type: Number, required: true }, // week number, e.g. 1 for week 1
      from: { type: Date, required: true }, // start date of the week
      to: { type: Date, required: true },   // end date of the week
      leftbv: { type: Number, required: true, default: 0 }, // left business volume for the week
      rightbv: { type: Number, required: true, default: 0 }, // right business volume for the week
      matchedBV: { type: Number, required: true, default: 0 }, // matched BV for the week
      leftCarryRem: { type: Number, required: true, default: 0 }, // left carry remaining for the week
      rightCarryRem: { type: Number, required: true, default: 0 }, // right carry remaining for the week
    }
  ],

 
  },
  { timestamps: true }
);

export const User = mongoose.model("User", UserSchema);
