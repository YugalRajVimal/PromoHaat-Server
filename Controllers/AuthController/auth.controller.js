
import jwt from "jsonwebtoken";
import {
  User
} from "../../Schema/user.schema.js";
import ExpiredTokenModel from "../../Schema/expired-token.schema.js";
import { Admin } from "../../Schema/admin.schema.js";

// Allowed roles from user.schema.js (see enum in file_context_2 line 8)
// Changed "patient" to "user"
const ALLOWED_ROLES = ["user", "admin"];

class AuthController {
  // Check Authorization with user.schema.js roles & maintenance
  checkAuth = async (req, res) => {
    try {
      const { id, role } = req.user || {};
      console.log("[checkAuth] User id from req.user:", id);
      console.log("[checkAuth] User role from req.user:", role);

      // Role check: should be strictly 'user' only
      if (role !== "user") {
        console.log("[checkAuth] Role is not 'user':", role);
        return res.status(401).json({ message: "Unauthorized: Only user role allowed" });
      }

      // Check if user with provided id and user role exists in the database
      const dbUser = await User.findOne({ _id: id, role: "user" });
      console.log("[checkAuth] Looked up user from DB:", dbUser ? dbUser._id : "NOT FOUND");

      if (!dbUser) {
        console.log("[checkAuth] No user found in DB for id and role.");
        return res.status(401).json({ message: "Unauthorized: User not found" });
      }

      if (dbUser.status === "suspended") {
        console.log("[checkAuth] User status is suspended.");
        return res.status(403).json({ message: "Your account has been suspended. Please contact support." });
      }
      if (dbUser.status === "deleted") {
        console.log("[checkAuth] User status is deleted.");
        return res.status(403).json({ message: "Your account has been deleted. Please contact support." });
      }

      // Check KYC completion (fail with 425 Too Early if not completed)
      if (!dbUser.isKYCCompleted) {
        console.log("[checkAuth] User KYC not completed.");
        return res.status(425).json({
          message: "Your KYC is not completed. Please complete your KYC to continue.",
          name: dbUser.name,
          email: dbUser.email
        });
      }


      // Check KYC status and provide custom error messages based on KYC state, using unique status codes
      if (dbUser.kyc && dbUser.kyc.kycStatus) {
        if (dbUser.kyc.kycStatus === "pending") {
          console.log("[checkAuth] KYC status is pending.");
          // 429 Too Many Requests (used here for "KYC under review")
          return res.status(429).json({
            message: "Your KYC is under review. Please wait for verification.",
            name: dbUser.name,
            email: dbUser.email,
            kycStatus: "pending"
          });
        }
      }

      // Check package purchase. If not purchased, fail with 426 Upgrade Required
      if (!dbUser.isAnyPackagePurchased) {
        console.log("[checkAuth] User has not purchased any package.");
        return res.status(426).json({
          message: "You must purchase a package to continue.",
          name: dbUser.name,
          email: dbUser.email
        });
      }

      // Check if user has a package but it has expired
      if (dbUser.packageExpiresAt && dbUser.packageExpiresAt < new Date()) {
        console.log("[checkAuth] User's package has expired.");
        return res.status(426).json({
          message: "Your package has expired. Please purchase a new package to continue.",
          name: dbUser.name,
          email: dbUser.email
        });
      }

      // Removed therapist-specific checks: not relevant for strict "user" role

      // If user and incompleteParentProfile is true, return error with unique status code
      if (dbUser.incompleteParentProfile === true) {
        console.log("[checkAuth] User profile is incomplete.");
        // 428 Precondition Required, as above
        return res.status(428).json({ 
          message: "User profile is incomplete. Please complete your profile to continue.",
          name: dbUser.name,
          email: dbUser.email
        });
      }

      console.log("[checkAuth] User is authorized.");
      return res.status(200).json({ 
        message: "Authorized",
        name: dbUser.name,
        email: dbUser.email
      });
    } catch (error) {
      console.error("[checkAuth] Error encountered:", error);
      return res.status(401).json({ message: "Unauthorized" });
    }
  };

  // Verify Account with OTP (user only)
  verifyAccount = async (req, res) => {
    try {
      let { email, otp, role } = req.body;

      if (!email || !otp || !role) {
        return res.status(400).json({ message: "Email, OTP, and Role are required" });
      }

      email = email.trim().toLowerCase();
      role = role.trim();

      // Only allow 'user' role
      if (role !== "user") {
        return res.status(400).json({ message: "Invalid user role. Only 'user' role is allowed." });
      }

      // Find user by email, role 'user' and OTP (atomic find+verify OTP+clear OTP)
      const user = await User.findOneAndUpdate(
        {
          email,
          role: "user",
          otp
        },
        { $unset: { otp: 1 }, lastLogin: new Date() },
        { new: true }
      ).lean();

      if (!user) {
        return res.status(401).json({ message: "Invalid credentials or OTP" });
      }

      // Generate JWT with profile info optionally
      const tokenPayload = {
        id: user._id,
        email: user.email,
        role: user.role
      };

      // Set token to expire in 1 day
      const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: "1d" });

      await ExpiredTokenModel.create({
        token,
        tokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000), // 1 day expiry
      });

      console.log("Stored issued token in expired-tokens collection:", token);

      return res
        .status(200)
        .json({ message: "Account verified successfully", token });
    } catch (error) {
      console.error("VerifyAccount Error:", error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  };

  // Sign In → Send OTP, only for user role
  signin = async (req, res) => {
    try {
      let { email, role } = req.body;

      if (!email || !role) {
        return res.status(400).json({ message: "Email and role are required" });
      }

      email = email.trim().toLowerCase();
      role = role.trim();

      console.log(email, role);

      // Only allow 'user' role
      if (role !== "user") {
        return res.status(400).json({ message: "Invalid user role. Only 'user' role is allowed." });
      }

      const user = await User.findOne({ email, role: "user" }).lean();
      if (user && user.role !== "user") {
        return res.status(400).json({ message: "Role does not match for this user." });
      }
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Generate 6-digit OTP
      // const otp = Math.floor(100000 + Math.random() * 900000).toString();

      // Save OTP with expiry (10 min)
      await User.findByIdAndUpdate(
        user._id,
        {
          otp: "000000",
          otpExpiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 min expiry
        },
        { new: true }
      );

      // Send OTP via mail
      // sendMail(email, "Your OTP Code", `Your OTP is: ${otp}`).catch(console.error);

      return res.status(200).json({ message: "OTP sent successfully" });
    } catch (error) {
      console.error("Signin Error:", error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  };

  // Signup → Register new user with OTP (Default OTP: 000000)
  signup = async (req, res) => {
    try {
      let { name, email, phone, address, role, referralCode, referredOn } = req.body;

      // Basic validation
      if (
        !name || typeof name !== "string" ||
        !email || typeof email !== "string" ||
        !phone || typeof phone !== "string" ||
        !address || typeof address !== "object"
      ) {
        return res.status(400).json({ message: "Name, email, phone, and address are required and must be valid." });
      }

      const trimmedEmail = email.trim().toLowerCase();

      // Normalize phone: remove spaces, remove "+91" if present, keep last 10 digits
      let normalizedPhone = phone.trim().replace(/\s+/g, "");
      if (normalizedPhone.startsWith("+91")) {
        normalizedPhone = normalizedPhone.slice(3);
      }
      // Make sure we keep only last 10 digits
      normalizedPhone = normalizedPhone.replace(/\D/g, "");
      if (normalizedPhone.length > 10) {
        normalizedPhone = normalizedPhone.slice(-10);
      }
      if (normalizedPhone.length !== 10) {
        return res.status(400).json({ message: "Phone number must be 10 digits (Indian format)." });
      }
      const userRole = role && typeof role === "string" ? role.trim() : "user";

      // Check for allowed roles
      if (!ALLOWED_ROLES.includes(userRole)) {
        return res.status(400).json({ message: "Invalid user role." });
      }

      // Check if user already exists with this email & role
      const existingUser = await User.findOne({ email: trimmedEmail, role: userRole });
      if (existingUser) {
        return res.status(409).json({ message: "A user with this email already exists." });
      }

      // Check if phone number is already used by any user
      const existingPhone = await User.findOne({ phone: normalizedPhone });
      if (existingPhone) {
        return res.status(409).json({ message: "This phone number is already associated with another account." });
      }

      // ===== Handle Referral Logic and Parent/Child Relationships, allowing multiple leftChildren/rightChildren per @user.schema.js =====

      let referredBy = null;
      let finalReferredOn = null;
      let parent = null;

      if (referralCode) {
        // Find the user for the given referral code
        const referringUser = await User.findOne({ referralCode: referralCode.trim() });
        if (!referringUser) {
          return res.status(400).json({ message: "Invalid referral code." });
        }

        // referredOn is required if referralCode is present
        if (!referredOn || typeof referredOn !== "string") {
          return res.status(400).json({ message: "referredOn is required if referralCode is provided." });
        }

        // Validate referredOn value
        const allowedReferredOn = ["left", "right", "auto"];
        if (!allowedReferredOn.includes(referredOn)) {
          return res.status(400).json({ message: "referredOn must be one of left, right, or auto." });
        }

        // Choose left or right for placement: 'auto' will select the side with fewer users
        if (referredOn === "auto") {
          // Count the number of left and right children (array length)
          const leftCount = referringUser.leftChildren ? referringUser.leftChildren.length : 0;
          const rightCount = referringUser.rightChildren ? referringUser.rightChildren.length : 0;
          finalReferredOn = (leftCount <= rightCount) ? "left" : "right";
        } else {
          finalReferredOn = referredOn;
        }

        referredBy = referralCode.trim();
        parent = referringUser._id;
        // No need to check if side is "full" as both arrays can have multiple children
      }

      // Default OTP for demo; replace with random generation in production
      const otp = "000000";
      const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min from now

      const newUserData = {
        name: name.trim(),
        email: trimmedEmail,
        phone: normalizedPhone,
        address: {
          street: address.street || "",
          city: address.city || "",
          state: address.state || "",
          postalCode: address.postalCode || "",
          country: address.country || ""
        },
        role: userRole,
        authProvider: "otp",
        otp,
        otpExpiresAt,
        otpGeneratedAt: new Date(),
        status: "active",
        isDisabled: false,
        incompleteProfile: false,
      };

      // Set referral fields if provided
      if (referredBy) {
        newUserData.referredBy = referredBy;
        newUserData.referredOn = finalReferredOn;
        newUserData.parent = parent;
      }

      const newUser = new User(newUserData);
      await newUser.save();

      // If referred, push the user into parent's leftChildren or rightChildren array
      if (parent) {
        if (finalReferredOn === "left") {
          await User.findByIdAndUpdate(parent, { $addToSet: { leftChildren: newUser._id } });
        } else if (finalReferredOn === "right") {
          await User.findByIdAndUpdate(parent, { $addToSet: { rightChildren: newUser._id } });
        }
      }

      // In production: send OTP via SMS or email

      return res.status(201).json({
        message: "Signup successful. OTP sent to user.",
        userId: newUser._id
      });
    } catch (error) {
      console.error("Signup Error:", error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  };

  // Sign Out → Mark token as immediately expired
  signOut = async (req, res) => {
    try {
      // Get token from Authorization header
      const token = req.headers["authorization"];
      if (!token) {
        return res.status(401).json({ message: "Unauthorized: Token missing" });
      }

      // Set tokenExpiry to now so it is immediately considered expired
      const now = new Date();

      await ExpiredTokenModel.create({
        token,
        tokenExpiry: now,
      });

      return res.status(200).json({ message: "Signed out successfully" });
    } catch (error) {
      console.error("SignOut Error:", error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  };

  // ===================== ADMIN ONLY: checkAuth, signin, verifyAccount =====================



  // Admin: Check Auth (admin dashboard)
  adminCheckAuth = async (req, res) => {
    try {
      const { id, role } = req.user || {};
      if (!id || role !== "admin") {
        return res.status(401).json({ message: "Unauthorized: Admin only" });
      }

      const admin = await Admin.findOne({ _id: id, role: "admin" });
      if (!admin) {
        return res.status(401).json({ message: "Admin not found" });
      }

      // No status or suspend support in Admin schema, so skip
      return res.status(200).json({
        message: "Admin authorized",
        name: admin.name,
        email: admin.email
      });
    } catch (error) {
      console.error("[adminCheckAuth] Error encountered:", error);
      return res.status(401).json({ message: "Unauthorized" });
    }
  };

  // Admin: Sign In → Send OTP
  adminSignin = async (req, res) => {
    try {
      let { email, role } = req.body;

      if (!email || !role) {
        return res.status(400).json({ message: "Email and role are required" });
      }

      email = email.trim().toLowerCase();
      role = role.trim();

      if (role !== "admin") {
        return res.status(400).json({ message: "Role must be admin for this endpoint" });
      }

      const admin = await Admin.findOne({ email, role: "admin" }).lean();
      if (!admin) {
        return res.status(404).json({ message: "Admin not found" });
      }

      // Generate 6-digit OTP (or 000000 in dev)
      // const otp = Math.floor(100000 + Math.random() * 900000).toString();
      // For now, set constant OTP
      const otp = "000000";

      // Save OTP with expiry (10 min)
      await Admin.findByIdAndUpdate(
        admin._id,
        {
          otp,
          otpExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
          otpGeneratedAt: new Date(),
          otpAttempts: 0
        },
        { new: true }
      );

      // Optionally: Send OTP via email

      return res.status(200).json({ message: "OTP sent successfully" });
    } catch (error) {
      console.error("AdminSignin Error:", error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  };

  // Admin: Verify OTP & Generate Token
  adminVerifyAccount = async (req, res) => {
    try {
      let { email, otp, role } = req.body;

      if (!email || !otp || !role) {
        return res.status(400).json({ message: "Email, OTP, and Role are required" });
      }

      email = email.trim().toLowerCase();
      role = role.trim();

      if (role !== "admin") {
        return res.status(400).json({ message: "Invalid user role." });
      }

      // Find admin by email, role and OTP
      const admin = await Admin.findOneAndUpdate(
        {
          email,
          role: "admin",
          otp
        },
        { $unset: { otp: 1 }, lastLogin: new Date(), otpExpiresAt: 1, otpAttempts: 1, otpGeneratedAt: 1 },
        { new: true }
      ).lean();

      if (!admin) {
        return res.status(401).json({ message: "Invalid credentials or OTP" });
      }

      // Generate token
      const tokenPayload = {
        id: admin._id,
        email: admin.email,
        role: "admin"
      };

      const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: "1d" });

      // NOTE: Do NOT log tokens for admin into ExpiredTokenModel at creation time (that would immediately revoke),
      // only mark them expired on signout. So this is omitted here.

      return res
        .status(200)
        .json({ message: "Account verified successfully", token });
    } catch (error) {
      console.error("AdminVerifyAccount Error:", error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  };
}

export default AuthController;
