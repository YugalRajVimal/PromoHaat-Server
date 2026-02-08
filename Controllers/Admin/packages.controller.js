
import Package from "../../Schema/packages.schema.js";

class PackagesAdminController {
  // Fetch only the first 3 packages (fetch All 3 packages)
  async getTop3Packages(req, res) {
    try {
      const packages = await Package.find().sort({ createdAt: -1 }).limit(3);
      return res.status(200).json({ packages });
    } catch (error) {
      console.error("[PackagesAdminController][getTop3Packages] Error:", error);
      return res.status(500).json({ message: "Failed to fetch packages." });
    }
  }

  // Edit/update an individual package by id
  async updatePackage(req, res) {
    try {
      const { id } = req.params;
      const { name, price, tasksPerDay, taskRate, features, bv } = req.body;

      // Only update provided fields
      const updateData = {};
      if (name !== undefined) updateData.name = name;
      if (price !== undefined) updateData.price = price;
      if (tasksPerDay !== undefined) updateData.tasksPerDay = tasksPerDay;
      if (taskRate !== undefined) updateData.taskRate = taskRate;
      if (features !== undefined) updateData.features = Array.isArray(features) ? features : [];
      if (bv !== undefined) updateData.bv = bv;

      const updated = await Package.findByIdAndUpdate(id, updateData, { new: true });
      if (!updated) {
        return res.status(404).json({ message: "Package not found." });
      }
      return res.status(200).json({ message: "Package updated successfully.", package: updated });
    } catch (error) {
      console.error("[PackagesAdminController][updatePackage] Error:", error);
      return res.status(500).json({ message: "Failed to update package." });
    }
  }
}

export default PackagesAdminController;
