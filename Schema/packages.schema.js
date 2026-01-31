import mongoose from "mongoose";

const packageSchema = new mongoose.Schema(
  {
    name: { // Package Name
      type: String,
      required: true,
      trim: true,
    },
    price: { // Package Price
      type: Number,
      required: true,
    },
    tasksPerDay: { // Tasks Per Day
      type: Number,
      required: true,
    },
    taskRate: { // Rate of each task
      type: Number,
      required: true,
    },
    features: [{ // Array of features
      type: String,
      trim: true,
    }],
    bv: { // bv field, can be a decimal number
      type: Number,
      required: true,
    },
  },
  {
    timestamps: true, // adds createdAt and updatedAt
  }
);

const Package = mongoose.model("Package", packageSchema);

export default Package;
