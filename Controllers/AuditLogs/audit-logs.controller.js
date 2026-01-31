import { AuditLog } from "../../Schema/logs.schema.js";

class AuditLogService {
  async addLog({
    action,
    user,
    role,
    resource = null,
    resourceId = null,
    details = {},
    ipAddress = null,
    userAgent = null,
  }) {
    // Audit logs must NEVER block the request
    try {
      if (!action || !user || !role) return;

      await AuditLog.create({
        action: action.toUpperCase(), // normalize
        user,
        role,
        resource,
        resourceId,
        details,
        ipAddress,
        userAgent,
      });
    } catch (err) {
      // Log internally, but NEVER throw
      console.error("Audit log failed:", err.message);
    }
  }

  /**
   * Fetch all audit logs (with optional pagination, filtering).
   * @param {Object} params Supports: { filter, sort, page, limit }
   * @returns {Promise<{ logs: Array, total: Number }>}
   */
  async getAllLogs({ filter = {}, sort = { createdAt: -1 }, page = 1, limit = 50 } = {}) {
    try {
      const skip = (page - 1) * limit;
      // Lean returns plain objects, typically useful for API
      const logs = await AuditLog.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean();
      const total = await AuditLog.countDocuments(filter);
      return { logs, total };
    } catch (err) {
      console.error("Failed to fetch audit logs:", err.message);
      // Return empty logs on error (do not throw)
      return { logs: [], total: 0 };
    }
  }
}

export default new AuditLogService();
