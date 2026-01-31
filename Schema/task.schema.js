import mongoose from "mongoose";

const TasksSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: false,
      default: "",
      trim: true,
    },
    link: {
      type: String,
      required: false,
      trim: true,
      default: "",
    }
  },
  {
    timestamps: true,
  }
);

export const Tasks = mongoose.model("Tasks", TasksSchema);
