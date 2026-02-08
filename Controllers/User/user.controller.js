
import { deleteUploadedFiles } from "../../middlewares/fileDelete.middleware.js";
import userRouter from "../../Routers/user.routes.js";
import { Admin } from "../../Schema/admin.schema.js";
import Package from "../../Schema/packages.schema.js";
import { Tasks } from "../../Schema/task.schema.js";
import { User } from "../../Schema/user.schema.js";

class UserController {

  async completeKYC(req, res) {
    try {
      // Fetch KYC auto-approve value from Admin collection
      const admin = await Admin.findOne(); // Adjust: If multiple admins, select an appropriate one
      const autoApprove = admin?.kycAutoApprove ?? false;
      // Auth: req.user must exist (protected route on backend)
      if (!req.user || !req.user.id) {
        deleteUploadedFiles(req.files);
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      // These may vary depending on your upload middleware (Multer preferred)
      // Field names should match frontend: aadharFrontFile, aadharBackFile, panFile
      // E.g.: req.files = { aadharFrontFile: [file1], aadharBackFile: [file2], panFile: [file3] }
      const { aadharNumber, panNumber } = req.body;
      const files = req.files || {};
      const aadharFrontFile = files.aadharFrontFile?.[0] || files.aadharFrontFile;
      const aadharBackFile = files.aadharBackFile?.[0] || files.aadharBackFile;
      const panFile = files.panFile?.[0] || files.panFile;

      // Validate required fields
      if (
        !aadharNumber ||
        typeof aadharNumber !== "string" ||
        !/^\d{12}$/.test(aadharNumber)
      ) {
        deleteUploadedFiles(req.files);
        return res
          .status(400)
          .json({ success: false, message: "Valid 12-digit Aadhar number required." });
      }
      if (
        !panNumber ||
        typeof panNumber !== "string" ||
        !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(panNumber.toUpperCase())
      ) {
        deleteUploadedFiles(req.files);
        return res
          .status(400)
          .json({ success: false, message: "Valid 10-character PAN required (e.g. ABCDE1234F)." });
      }
      if (!aadharFrontFile || !aadharBackFile || !panFile) {
        deleteUploadedFiles(req.files);
        return res
          .status(400)
          .json({ success: false, message: "All document images (Aadhar front/back, PAN) required." });
      }

      // File storage: assume an upload middleware has already saved files and set .path or .location (for S3)
      // Construct URLs -- use .location for S3, else .path/public for local
      function getFileUrl(file) {
        if (!file) return "";
        if (file.location) return file.location; // S3 style
        if (file.path) {
          // Example: '/uploads/kyc/123abc.png' -> serve as '/public/uploads/kyc/123abc.png'
          return file.path.replace(/^.*\/public\//, "/public/");
        }
        return "";
      }

      const aadharFrontUrl = getFileUrl(aadharFrontFile);
      const aadharBackUrl = getFileUrl(aadharBackFile);
      const panCardUrl = getFileUrl(panFile);

      // Get the user from DB

      const user = await User.findById(req.user.id);
      if (!user) {
        deleteUploadedFiles(req.files);
        return res.status(404).json({ success: false, message: "User not found." });
      }

      user.isKYCCompleted = true;

      // Update user's KYC fields (do NOT mark isKYCCompleted=true yet!)
      user.kyc = {
        aadharNumber: aadharNumber.trim(),
        aadharFrontUrl,
        aadharBackUrl,
        panNumber: panNumber.trim().toUpperCase(),
        panCardUrl,
        kycSubmittedAt: new Date(),
        kycVerifiedAt: null,
        kycStatus: autoApprove ? "approved" : "pending",
        kycRejectionReason: ""
      };
      // user.isKYCCompleted = false; // Admin must approve
      await user.save();

      return res.status(200).json({
        success: true,
        message: "KYC documents uploaded successfully! Please wait for verification.",
        kycStatus: user.kyc.kycStatus
      });
    } catch (error) {
      console.error("[KYC Upload Error]", error);
      // If any error is thrown, delete uploaded files
      deleteUploadedFiles(req.files);
      res.status(500).json({
        success: false,
        message: "Failed to upload KYC documents.",
        error: error.message
      });
    }
  }

/**
 * Get all available packages
 * Returns all package documents from the database.
 * Route: GET /api/user/packages
 */
async getAllPackages(req, res) {
  try {

    const packages = await Package.find({});
    return res.status(200).json({
      success: true,
      data: packages,
      message: "Packages fetched successfully"
    });
  } catch (error) {
    console.error("[Get Packages Error]", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch packages",
      error: error.message
    });
  }
}


/**
 * Purchase a package for the logged-in user.
 * Validates the package, updates user with purchased package, sets purchase/expiry timestamps (valid 1 month), and sends confirmation.
 * Route: POST /api/user/purchase-package
 * Body: { packageId: string }
 */
async purchasePackage(req, res) {
  try {
    const userId = req.user.id;
    const { packageId } = req.body;

    if (!packageId) {
      return res.status(400).json({
        success: false,
        message: "Package ID is required.",
      });
    }

    // Fetch the package
    const selectedPackage = await Package.findById(packageId);
    if (!selectedPackage) {
      return res.status(404).json({
        success: false,
        message: "Package not found.",
      });
    }

    // Fetch user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found.",
      });
    }

    // Check if user already has a package and it has not expired yet
    if (
      user.package &&
      user.packageExpiresAt &&
      user.packageExpiresAt > new Date()
    ) {
      return res.status(400).json({
        success: false,
        message: "User already has an active package.",
      });
    }

    // Assign the package and update timestamps (valid for 1 month from purchase)
    user.package = selectedPackage._id;
    user.packagePurchasedAt = new Date();
    user.packageExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // Mark isAnyPackagePurchased as true
    user.isAnyPackagePurchased = true;

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Package purchased successfully.",
      data: {
        package: selectedPackage,
        packagePurchasedAt: user.packagePurchasedAt,
        packageExpiresAt: user.packageExpiresAt,
        isAnyPackagePurchased: user.isAnyPackagePurchased,
      },
    });
  } catch (error) {
    console.error("[Purchase Package Error]", error);
    return res.status(500).json({
      success: false,
      message: "Failed to purchase package.",
      error: error.message,
    });
  }
}

/**
 * @desc Get all user tasks (assigned/uncompleted/completed)
 * @route GET /user/tasks
 * @access Protected (Requires auth)
 */
getUserTasks = async (req, res) => {
  try {
    const userId = req.user.id;
    console.log("[Step 1] Fetched userId:", userId);

    // Fetch the user + package details
    const user = await User.findById(userId)
      .populate("package")
      .exec();

    console.log("[Step 2] Fetched user from DB:", !!user);

    if (!user) {
      console.log("[Step 2a] User not found");
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    // Check if package exists and is not expired
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Midnight UTC+local
    console.log("[Step 3] Today's date:", today);

    let now = new Date();
    now.setHours(0, 0, 0, 0); // Use actual today
    now.setMilliseconds(0);
    console.log("[Step 4] Using 'now' as today at midnight:", now);

    let activePackage = null;
    if (
      user.package &&
      user.packageExpiresAt &&
      user.packageExpiresAt > today
    ) {
      activePackage = user.package;
      console.log("[Step 5] User's package is active (not expired). PackageID:", activePackage._id);
    } else {
      console.log("[Step 5a] User does not have an active subscription.");
      return res.status(400).json({
        success: false,
        message: "No active subscription found. Please buy a package to receive tasks.",
      });
    }

    // Helper function
    function getMonday(d) {
      const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      const day = date.getUTCDay();
      const diff = (day + 6) % 7;
      date.setUTCDate(date.getUTCDate() - diff);
      date.setUTCHours(0, 0, 0, 0);
      return date;
    }

    // Use 'now' (today) for assignment logic
    const weekMondayDate = getMonday(now);
    const currentDayIdx = now.getDay(); // 0=Sun, ... 6=Sat
    console.log("[Step 6] weekMondayDate:", weekMondayDate, "currentDayIdx (0=Sun):", currentDayIdx);

    // If it's Sat or Sun (should not happen, but preserve for consistency)
    if (currentDayIdx === 0 || currentDayIdx === 6) {
      console.log("[Step 6a] It's weekend. No tasks assigned.");
      return res.status(200).json({
        success: true,
        message: "No tasks assigned on weekends.",
        data: [],
      });
    }

    // For Monday to Friday: assign tasks for whole current week up to today if not assigned yet
    let resetNeeded = false;
    if (user.tasks && user.tasks.length > 0) {
      const hasCurrentWeekTask = user.tasks.some(t =>
        t.date && (new Date(t.date) >= weekMondayDate)
      );
      console.log("[Step 7] User has tasks. Has task in this week?", hasCurrentWeekTask);
      if (!hasCurrentWeekTask) resetNeeded = true;
    } else {
      resetNeeded = true;
      console.log("[Step 7a] User has no tasks. Will reset tasks array.");
    }

    if (resetNeeded) {
      console.log("[Step 8] Resetting user's tasks array.");
      user.tasks = [];
    }

    const tasksPerDay = activePackage.tasksPerDay || 0;
    console.log("[Step 9] Package tasksPerDay:", tasksPerDay);
    if (!tasksPerDay || tasksPerDay <= 0) {
      console.log("[Step 9a] tasksPerDay misconfigured or not set.");
      return res.status(400).json({
        success: false,
        message: "Subscription package tasksPerDay misconfigured.",
      });
    }

    // Build dates for weekdays for this week up to 'now' (actual today)
    let assignDays = [];
    for (let d = 1; d <= currentDayIdx; d++) { // Monday=1, ... today
      if (d === 6 || d === 0) continue;
      let assignDate = new Date(weekMondayDate);
      assignDate.setUTCDate(assignDate.getUTCDate() + (d - 1));
      assignDate.setUTCHours(0, 0, 0, 0);
      assignDays.push(assignDate);
    }
    console.log("[Step 10] Assign days for this week:", assignDays.map(d => d.toISOString()));

    // Collect all links user has ever seen (assigned or completed, history too)
    let allAssignedOrCompletedLinks = new Set(
      (user.tasks || [])
        .map(t => t.link)
        .filter(Boolean)
    );
    console.log(
      "[Step 11] All links ever assigned to user (history):",
      Array.from(allAssignedOrCompletedLinks)
    );

    let updateNeeded = false;
    let adminContactNeeded = false;
    let adminNotice = null;

    for (const dayDate of assignDays) {
      const dayStart = new Date(dayDate);
      const dayEnd = new Date(dayDate);
      dayEnd.setUTCHours(23, 59, 59, 999);
      // Find tasks assigned to this day already
      const dayHasTasks = (user.tasks || []).filter(
        t =>
          t.date &&
          new Date(t.date) >= dayStart &&
          new Date(t.date) <= dayEnd
      );
      console.log(`[Step 12] Tasks for day ${dayStart.toISOString()}:`, dayHasTasks.length);

      if (dayHasTasks.length < tasksPerDay) {
        const nToAssign = tasksPerDay - dayHasTasks.length;
        console.log(`[Step 13] Need to assign ${nToAssign} task(s) for this day.`);

        // Find tasks never assigned or completed by user (not in user.tasks.link ever)
        const availableTasks = await Tasks.find({
          link: { $nin: Array.from(allAssignedOrCompletedLinks) }
        }).limit(nToAssign);

        console.log(`[Step 14] Found ${availableTasks.length} assignable tasks for this user (never in history).`);

        if (availableTasks.length < nToAssign) {
          // Not enough unique (never seen) tasks to assign
          // Custom message to contact admin for more tasks
          adminContactNeeded = true;
          adminNotice = "Not enough tasks available to assign to your account this week. Please contact admin for more tasks.";

          // Assign as many as possible (if availableTasks.length > 0)
          if (availableTasks.length > 0) {
            const toAssign = availableTasks.map(task => ({
              name: task.name,
              description: task.description,
              link: task.link,
              date: dayStart,
              completed: false,
              completedAt: null
            }));

            user.tasks = user.tasks.concat(toAssign);
            for (const task of toAssign) {
              allAssignedOrCompletedLinks.add(task.link);
            }
            updateNeeded = true;
            console.log(`[Step 15a] Partial tasks assigned for day. Assigned ${availableTasks.length} tasks instead of needed ${nToAssign}.`);
          } else {
            console.log(`[Step 15b] No tasks left to assign for this day. User should contact admin.`);
          }
          // Skip further days as not enough tasks for full requirement
          break;
        }

        // Only assign unique, never-before-seen tasks
        const toAssign = availableTasks.map(task => ({
          name: task.name,
          description: task.description,
          link: task.link,
          date: dayStart,
          completed: false,
          completedAt: null
        }));

        user.tasks = user.tasks.concat(toAssign);
        for (const task of toAssign) {
          allAssignedOrCompletedLinks.add(task.link);
        }
        updateNeeded = true;
        console.log(`[Step 15] Assigned ${toAssign.length} new tasks for day.`);
      } else {
        console.log(`[Step 15] Already have enough tasks for this day. Skipping assignment.`);
      }
    }

    if (resetNeeded || updateNeeded) {
      console.log("[Step 16] Saving user with updated reset or new tasks.");
      await user.save();
    } else {
      console.log("[Step 16] No user update needed. Skipping save.");
    }

    const allCurrentWeekTasks = (user.tasks || []).filter(t => {
      if (!t.date) return false;
      const d = new Date(t.date);
      return (
        d >= weekMondayDate &&
        d <= now &&
        d.getDay() !== 0 && d.getDay() !== 6
      );
    });
    console.log("[Step 17] Returning", allCurrentWeekTasks.length, "tasks for current week.");

    if (adminContactNeeded) {
      return res.status(200).json({
        success: true,
        message: adminNotice,
        data: allCurrentWeekTasks,
      });
    }

    return res.status(200).json({
      success: true,
      message: "User tasks for this week (up to today) fetched successfully.",
      data: allCurrentWeekTasks,
    });

  } catch (error) {
    console.error("[Get User Tasks Error]", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch user tasks.",
      error: error.message,
    });
  }
}

/**
 * @desc Mark a single task as completed for the user
 * @route POST /user/complete-task
 * @access Protected (Requires auth)
 * Expects: { taskId: string }
 */
completeTask = async (req, res) => {
  try {
    const userId = req.user.id;
    const { taskId } = req.body;

    if (!taskId) {
      return res.status(400).json({
        success: false,
        message: "Task ID is required.",
      });
    }

    // Load user with current package data
    const user = await User.findById(userId).populate('package');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    // Find task in user's tasks array
    const task = user.tasks.find(
      t => t._id?.toString?.() === taskId || t.id?.toString?.() === taskId
    );

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found.",
      });
    }

    if (task.completed) {
      return res.status(400).json({
        success: false,
        message: "Task already marked as completed.",
      });
    }

    // Mark as completed
    task.completed = true;
    task.completedAt = new Date();

    // --- Add to user's task history ---
    if (!Array.isArray(user.taskHistory)) {
      user.taskHistory = [];
    }
    // Clone task to avoid mutating original further in the future
    const completedTaskHistory = {
      ...(task.toObject ? task.toObject() : { ...task }),
      completedAt: task.completedAt,
      completed: true,
      historyAddedAt: new Date(),
    };
    user.taskHistory.push(completedTaskHistory);
    // --- End add to history ---

    // --- Add amount to user's wallet based on package.pricePerTask ---
    let amountCredited = 0;
    if (user.package && typeof user.package.taskRate === 'number') {
      amountCredited = user.package.taskRate;
      user.wallet = (user.wallet ?? 0) + amountCredited;

      // Add to transaction history if property exists
      if (!Array.isArray(user.transactionHistory)) {
        user.transactionHistory = [];
      }
      user.transactionHistory.push({
        type: "credit",
        amount: amountCredited,
        description: `Task completion reward for task '${task.name || "Task"}'`,
        relatedOrderId: null,
        date: new Date()
      });
    }

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Task marked as completed successfully.",
      data: {
        task,
        amountCredited,
        wallet: user.wallet
      },
    });
  } catch (error) {
    console.error("[Complete Task Error]", error);
    return res.status(500).json({
      success: false,
      message: "Failed to complete task.",
      error: error.message,
    });
  }
}

/**
 * Get Referral Page for the logged-in user.
 * Returns user's referral code, total successful referrals, and a list of referred users.
 * Route: GET /api/user/referral-page
 */
async getReferralPage(req, res) {
  try {
    const userId = req.user.id;

    // Fetch the user (to get their referralCode)
    const user = await User.findById(userId).select('referralCode name email');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    // Find all users who were referred by this user's referral code
    // Also SELECT referredOn (which is "left" | "right" from schema)
    const referredUsersRaw = await User.find(
      { referredBy: user.referralCode },
      { name: 1, email: 1, createdAt: 1, package: 1, isAnyPackagePurchased: 1, referredOn: 1 }
    ).lean();

    // No need to map unless you want to rename/extract, so just return as is, with referredOn included
    const referredUsers = referredUsersRaw;

    // Successful referrals can be defined as those who purchased a package
    const totalSuccessfulReferrals = referredUsers.filter(r => r.isAnyPackagePurchased).length;

    return res.status(200).json({
      success: true,
      data: {
        myReferralCode: user.referralCode,
        totalSuccessfulReferrals,
        referredUsers,
      },
      message: "Referral page fetched successfully"
    });
  } catch (error) {
    console.error("[Get Referral Page Error]", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch referral page",
      error: error.message
    });
  }
}


/**
 * Get promotional income summary for the logged-in user.
 * Route: GET /api/user/promotional-income
 * Returns the user's promotional income records and current left/right carry values.
 */
async getPromotionalIncome(req, res) {
  try {
    const userId = req.user.id;

    // Fetch user with promotionalIncome and current carry
    const user = await User.findById(userId)
      .select('promotionalIncome leftCarry rightCarry');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        promotionalIncome: user.promotionalIncome || [],
        leftCarry: user.leftCarry || 0,
        rightCarry: user.rightCarry || 0,
      },
      message: "Promotional income summary fetched successfully"
    });
  } catch (error) {
    console.error("[Get Promotional Income Error]", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch promotional income",
      error: error.message
    });
  }
}


/**
 * Get wallet details and transaction history for the logged-in user.
 * Route: GET /api/user/wallet-history
 * Returns the user's wallet balance and an array of wallet transaction records.
 */
async getWalletAndHistory(req, res) {
  try {
    const userId = req.user.id;

    // Fetch user wallet and transaction history
    const user = await User.findById(userId)
      .select('wallet transactionHistory');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        walletBalance: user.wallet || 0,
        transactions: Array.isArray(user.transactionHistory) ? user.transactionHistory : []
      },
      message: "Wallet details and transaction history fetched successfully"
    });
  } catch (error) {
    console.error("[Get Wallet and History Error]", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch wallet and transaction history",
      error: error.message
    });
  }
}

/**
 * Get user's profile details.
 * Route: GET /api/user/profile
 * Returns the profile information for the logged-in user.
 */
async getProfileDetails(req, res) {
  try {
    const userId = req.user.id;

    // Exclude sensitive fields (ex: password, OTPs, etc) 
    const user = await User.findById(userId)
      .select('-password -otp -otpExpires -__v')
      .populate('package');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    return res.status(200).json({
      success: true,
      data: user,
      message: "Profile details fetched successfully"
    });
  } catch (error) {
    console.error("[Get Profile Details Error]", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch profile details",
      error: error.message
    });
  }
}

/**
 * Get dashboard details for user.
 * Route: GET /api/user/dashboard
 * Returns aggregations: pending/completed tasks, wallet, referrals, income, etc.
 */
async getDashboardDetails(req, res) {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId)
      .populate('package')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    // Pending and completed tasks count
    const pendingTasks = (user.tasks || []).filter(task => !task.completed).length;
    const completedTasks = (user.tasks || []).filter(task => task.completed).length;

    // Wallet balance
    const walletBalance = user.wallet || 0;

    // Promotional Income
    // Total promotional income should be calculated as matchedBV * 10 (assuming 1 BV = ₹10), sum for all weeks.
    // Calculate total promotional income as the sum of matchedBV for each week, using only non-negative matchedBV
    // Each BV is worth ₹10
    const promotionalIncome = Array.isArray(user.promotionalIncome)
      ? user.promotionalIncome.reduce((sum, rec) => {
          const matchedBV = typeof rec.matchedBV === "number" && rec.matchedBV > 0 ? rec.matchedBV : 0;
          return sum + (matchedBV * 10);
        }, 0)
      : 0;

    // Find referred users (by referralCode)
    let totalReferred = 0;
    let leftUsers = 0;
    let rightUsers = 0;
    let successfulReferrals = 0;

    if (user.referralCode) {
      const referredUsers = await User.find({ referredBy: user.referralCode }).select("package referredOn isAnyPackagePurchased").lean();

      totalReferred = referredUsers.length;
      leftUsers = referredUsers.filter(u => u.referredOn === "left").length;
      rightUsers = referredUsers.filter(u => u.referredOn === "right").length;
      successfulReferrals = referredUsers.filter(u => u.isAnyPackagePurchased === true).length;
    }

    return res.status(200).json({
      success: true,
      data: {
        pendingTasks,
        completedTasks,
        totalReferredUsers: totalReferred,
        leftUsers,
        rightUsers,
        successfulReferralsWhoPurchasedPackage: successfulReferrals,
        totalPromotionalIncome: promotionalIncome,
        walletBalance,
      },
      message: "Dashboard details fetched successfully",
    });

  } catch (error) {
    console.error("[Get Dashboard Details Error]", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch dashboard details",
      error: error.message
    });
  }
}






}

export default UserController;
