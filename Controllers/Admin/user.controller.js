import { Admin } from "../../Schema/admin.schema.js";
import Payment from "../../Schema/payment.schema.js";
import { User } from "../../Schema/user.schema.js";



class UserAdminController {

    // Get all users - returns all users in the database except password field
    getAllUsers = async (req, res) => {
        try {
            // Fetch all users, excluding password field
            const users = await User.find({}).select("-password");

            // Fetch the kycAutoApprove setting from Admin
            // By design it's stored in admin.schema.js, usually fetched from the first Admin (could also be global config)
            const admin = await Admin.findOne({});
            const kycAutoApprove = admin?.kycAutoApprove ?? false;

            return res.status(200).json({
                success: true,
                data: users,
                kycAutoApprove,
                message: "All users fetched successfully."
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: "Failed to fetch users.",
                error: error.message
            });
        }
    }

    // Get user tree by ID - returns user and their immediate left/right children (names only)
    /**
     * getUserTree - Fetch a user and their immediate left/right children with more info.
     * Returns: user's basic info + left/right child basic info (name, _id, email, phone, status)
     */

    /**
     * fetAllRootUsers - Fetch all users that have no parent (parent is null, i.e. root nodes of the user tree)
     * Returns: Array of user objects (basic info)
     * Query params (optional): ?status=active|suspended|deleted, ?search=<string>
     */
    getAllRootUsers = async (req, res) => {
        try {
            const { status, search } = req.query;

            // Find users where parent is null (root users)
            const query = { parent: null };

            if (status) {
                query.status = status;
            }

            // Optional fuzzy search by name/email/phone
            if (search) {
                const regex = new RegExp(search, "i");
                query.$or = [
                    { name: regex },
                    { email: regex },
                    { phone: regex }
                ];
            }

            // Add console.log checks for debugging
            console.log("[getAllRootUsers] Query object:", query);

            // Select basic info fields
            const users = await User.find(query)
                .select("_id name email phone status createdAt");

            console.log("[getAllRootUsers] Fetched users count:", users.length);

            return res.status(200).json({
                success: true,
                data: users,
                message: "All root users fetched successfully."
            });
        } catch (error) {
            console.log("[getAllRootUsers] Error:", error);
            return res.status(500).json({
                success: false,
                message: "Failed to fetch root users.",
                error: error.message
            });
        }
    }

    buildSubTree = async (userId, depth = 2) => {
        if (!userId || depth === 0) return null;
      
        const user = await User.findById(userId)
          .select("_id name status phone email referredOn leftChildren rightChildren");
      
        if (!user) return null;
      
        // Load children recursively
        const loadChildren = async (childrenIds) => {
          const result = [];
      
          for (const childId of childrenIds || []) {
            const childTree = await this.buildSubTree(childId, depth - 1);
      
            if (childTree) result.push(childTree);
          }
      
          return result;
        };
      
        const left = await loadChildren(user.leftChildren);
        const right = await loadChildren(user.rightChildren);
      
        return {
          _id: user._id,
          name: user.name,
          status: user.status,
          phone: user.phone,
          email: user.email,
          referredOn: user.referredOn,
      
          left,
          right,
        };
      };
      
      
      getUserTree = async (req, res) => {
        try {
          const { id } = req.params;
      
          // Load 3 levels at once (you can change)
          const tree = await this.buildSubTree(id, 5);
      
          if (!tree) {
            return res.status(404).json({
              success: false,
              message: "User not found",
            });
          }
      
          res.json({
            success: true,
            data: tree,
          });
        } catch (err) {
          console.error("Tree Error:", err);
      
          res.status(500).json({
            success: false,
            message: "Failed to load tree",
          });
        }
      };
      

    

    // Toggle KYC AutoApprove - enables or disables automatic KYC approval for new submissions
    toggleKYCAutoApprove = async (req, res) => {
        try {
            const { enable } = req.body;
            if (typeof enable !== "boolean") {
                return res.status(400).json({
                    success: false,
                    message: "Missing or invalid 'enable' field. Must be boolean (true/false)."
                });
            }

            // Update the kycAutoApprove field for all admins
            // Uses the Admin mongoose model (not User)

            const result = await Admin.updateMany(
                {},
                { $set: { kycAutoApprove: enable } }
            );

            return res.status(200).json({
                success: true,
                message: `KYC Auto-Approve has been ${enable ? "enabled" : "disabled"}.`,
                modifiedCount: result.modifiedCount
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: "Failed to toggle KYC AutoApprove.",
                error: error.message
            });
        }
    }

    // Approve KYC - sets the user's kyc.kycStatus to 'approved' and sets verification timestamp
    approveKYC = async (req, res) => {
        try {
            const { userId } = req.body;
            if (!userId) {
                return res.status(400).json({
                    success: false,
                    message: "User ID is required to approve KYC."
                });
            }

            // Update the nested KYC fields appropriately
            const updateFields = {
                "kyc.kycStatus": "approved",
                "kyc.kycVerifiedAt": new Date(),
                "kyc.kycRejectionReason": "",
                isKYCCompleted: true
            };

            const updatedUser = await User.findByIdAndUpdate(
                userId,
                { $set: updateFields },
                { new: true, runValidators: true }
            ).select("-passwordHash -otp");

            if (!updatedUser) {
                return res.status(404).json({
                    success: false,
                    message: "User not found."
                });
            }

            return res.status(200).json({
                success: true,
                message: "KYC approved successfully.",
                data: updatedUser
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: "Failed to approve KYC.",
                error: error.message
            });
        }
    }

    // Approve All Users' KYC - sets all users with "pending" KYC to "approved"
    approveAllUsersKYC = async (req, res) => {
        try {
            // Only update users whose KYC is currently pending
            const filter = {
                "kyc.kycStatus": "pending"
            };
            const update = {
                $set: {
                    "kyc.kycStatus": "approved",
                    "kyc.kycVerifiedAt": new Date(),
                    "kyc.kycRejectionReason": "",
                    isKYCCompleted: true
                }
            };

            const result = await User.updateMany(filter, update);

            return res.status(200).json({
                success: true,
                message: `${result.modifiedCount} user(s) KYC approved successfully.`,
                modifiedCount: result.modifiedCount
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: "Failed to approve all pending KYC.",
                error: error.message
            });
        }
    }

    // Get all payments, populated with user info
    getAllPayments = async (req, res) => {
        try {
            const payments = await Payment.find()
                .populate('user', 'name email phone status') // only select needed user fields
                .populate('package', 'name price'); // populate only the "name" field of the package

            return res.status(200).json({
                success: true,
                message: "Payments fetched successfully.",
                data: payments
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: "Failed to fetch payments.",
                error: error.message
            });
        }
    }

}

export default UserAdminController;

