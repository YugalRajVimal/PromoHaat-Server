import mongoose from "mongoose";
import razorpay from "../../config/razorpay.config.js";
import Package from "../../Schema/packages.schema.js";
import { User } from "../../Schema/user.schema.js";
import Payment from "../../Schema/payment.schema.js";
import crypto from "crypto";


class PaymentController {

   
    async generateUniqueReferralCode() {
      function makeCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const nums = '0123456789';
        let part1 = '';
        let part2 = '';
        for (let i = 0; i < 4; i++) {
          part1 += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        for (let i = 0; i < 4; i++) {
          part2 += nums.charAt(Math.floor(Math.random() * nums.length));
        }
        return part1 + part2;
      }
      let unique = false;
      let code;
      while (!unique) {
        code = makeCode();
        // Check DB for collision
        // Assumes referralCode is a field in User model
        const existing = await User.findOne({ referralCode: code });
        if (!existing) unique = true;
      }
      return code;
    }

    /**
     * Checks and credits promotional income for a user (referredBy) based on weekly matched BV
     * - For the given user (referral leader), for each week: 
     *     - Get left and right users directly referred (referredOn = 'left'/'right') who purchased a package.
     *     - For each week, sum their BV including previous week's carry.
     *     - Find min(left, right) for the week as matchedBV, and pay matchedBV*100 to wallet.
     *     - Remaining left/right is carried over for next week.
     *     - Save weekly summary in promotionalIncome, do not pay twice.
     */
    async checkAndPayPromotionalIncome(referralCode) {
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            // Find the parent user by userId
            const user = await User.findOne({ referralCode }).session(session);

            if (!user || !user.referralCode) {
                await session.abortTransaction();
                session.endSession();
                return;
            }

            // Get all users referred by this user (direct downlines, left and right separately)
            const referredUsers = await User.find({
                referredBy: user.referralCode,
                packagePurchasedAt: { $ne: null }
            })
                .select('referredOn package packagePurchasedAt')
                .populate('package', 'bv')
                .session(session); // to get package.bv

            // Group downline users by side and get relevant details for BV calculation
            const leftDownlines = referredUsers
                .filter(u => u.referredOn === 'left' && u.package && u.packagePurchasedAt)
                .map(u => ({
                    bv: Number((u.package.bv ?? 0)),
                    purchasedAt: u.packagePurchasedAt,
                }));
            const rightDownlines = referredUsers
                .filter(u => u.referredOn === 'right' && u.package && u.packagePurchasedAt)
                .map(u => ({
                    bv: Number((u.package.bv ?? 0)),
                    purchasedAt: u.packagePurchasedAt,
                }));

            // Find the earliest date among purchases to establish the week 1 start
            const allDates = [...leftDownlines, ...rightDownlines].map(u => u.purchasedAt);
            if (allDates.length === 0) {
                await session.commitTransaction();
                session.endSession();
                return; // No eligible downlines
            }

            // Week timeline logic (assume week starts from Monday 00:00:00)
            const earliestDate = new Date(Math.min(...allDates.map(d => d.getTime())));
            function getWeekNumber(date) {
                const msInWeek = 7 * 24 * 60 * 60 * 1000;
                const startOfWeek = new Date(earliestDate);
                const msSinceStart = date - startOfWeek;
                return Math.floor(msSinceStart / msInWeek) + 1;
            }
            // Group BV per week per side
            const leftBVByWeek = {};
            const rightBVByWeek = {};
            leftDownlines.forEach(u => {
                const week = getWeekNumber(u.purchasedAt);
                leftBVByWeek[week] = (leftBVByWeek[week] || 0) + (parseFloat(u.bv) || 0);
            });
            rightDownlines.forEach(u => {
                const week = getWeekNumber(u.purchasedAt);
                rightBVByWeek[week] = (rightBVByWeek[week] || 0) + (parseFloat(u.bv) || 0);
            });

            // Get previous week's carry from user document if available, else 0
            let prevLeftCarry = user.leftCarry || 0;
            let prevRightCarry = user.rightCarry || 0;

            // Find already paid weeks to prevent double payout
            const paidWeeks = Array.isArray(user.promotionalIncome)
                ? user.promotionalIncome.map(pi => pi.week)
                : [];

            // Compute for all weeks up to the latest, but skip calculating the current week if today is not Saturday or Sunday
            const allWeeks = new Set([...Object.keys(leftBVByWeek), ...Object.keys(rightBVByWeek)].map(Number));
            const sortedWeeks = Array.from(allWeeks).sort((a, b) => a - b);

            const now = new Date();
            const msInWeek = 7 * 24 * 60 * 60 * 1000;
            const startOfWeek = new Date(earliestDate);
            const msSinceStart = now - startOfWeek;
            const currentWeekNumber = Math.floor(msSinceStart / msInWeek) + 1;

            const todayDay = now.getDay(); // 0 = Sunday, 6 = Saturday

            for (let week of sortedWeeks) {
                if (
                    week === currentWeekNumber &&
                    todayDay !== 0 &&
                    todayDay !== 6
                ) {
                    continue; // Do not calculate for this week unless it's Saturday or Sunday
                }

                if (paidWeeks.includes(week)) {
                    // Already paid for this week, skip
                    prevLeftCarry += leftBVByWeek[week] || 0;
                    prevRightCarry += rightBVByWeek[week] || 0;
                    continue;
                }

                const weekLeftBV = (leftBVByWeek[week] || 0) + prevLeftCarry;
                const weekRightBV = (rightBVByWeek[week] || 0) + prevRightCarry;

                const matchedBV = Math.min(weekLeftBV, weekRightBV);

                // Carry forward is what's left after matching
                const leftCarryRem = weekLeftBV - matchedBV;
                const rightCarryRem = weekRightBV - matchedBV;

                // Compose promo income record
                const promoIncomeRecord = {
                    week: week,
                    from: new Date(earliestDate.getTime() + (week - 1) * 7 * 24 * 60 * 60 * 1000),
                    to: new Date(earliestDate.getTime() + week * 7 * 24 * 60 * 60 * 1000 - 1),
                    leftbv: weekLeftBV,
                    rightbv: weekRightBV,
                    matchedBV: matchedBV > 0 ? matchedBV : 0,
                    leftCarryRem,
                    rightCarryRem,
                };

                if (matchedBV > 0) {
                    // Credit to user's wallet
                    user.wallet = (user.wallet || 0) + matchedBV * 100;
                    user.transactionHistory = [
                        ...(user.transactionHistory || []),
                        {
                            type: 'credit',
                            amount: matchedBV * 100,
                            description: `Promotional income for week #${week} (matched BV: ${matchedBV})`,
                            relatedOrderId: null,
                            date: new Date(),
                        },
                    ];
                    user.promotionalIncome = [
                        ...(user.promotionalIncome || []),
                        promoIncomeRecord,
                    ];
                } else {
                    user.promotionalIncome = [
                        ...(user.promotionalIncome || []),
                        promoIncomeRecord,
                    ];
                }

                prevLeftCarry = leftCarryRem;
                prevRightCarry = rightCarryRem;
            }

            // Update user carries for next time
            user.leftCarry = prevLeftCarry;
            user.rightCarry = prevRightCarry;

            await user.save({ session });

            await session.commitTransaction();
            session.endSession();
        } catch (err) {
            await session.abortTransaction();
            session.endSession();
            throw err;
        }
    }

    createOrder = async (req, res) => {
        try {
          const userId = req.user.id;
          const { packageId } = req.body;
      
          if (!packageId) {
            return res.status(400).json({
              success: false,
              message: "Package ID required",
            });
          }
      
          const selectedPackage = await Package.findById(packageId);
      
          if (!selectedPackage) {
            return res.status(404).json({
              success: false,
              message: "Package not found",
            });
          }
      
          const user = await User.findById(userId);
      
          if (!user) {
            return res.status(401).json({
              success: false,
              message: "User not found",
            });
          }
      
          if (
            user.package &&
            user.packageExpiresAt > new Date()
          ) {
            return res.status(400).json({
              success: false,
              message: "Active package exists",
            });
          }
      
          const amount = selectedPackage.price * 100;
      
          const order = await razorpay.orders.create({
            amount,
            currency: "INR",
            receipt: `rcpt_${Date.now()}`,
          });
      
          /* ✅ Save payment */
          const payment = await Payment.create({
            user: userId,
            package: packageId,
            orderId: order.id,
            amount: selectedPackage.price,
            status: "CREATED",
          });
      
          return res.json({
            success: true,
            order,
            paymentId: payment._id,
          });
      
        } catch (err) {
          console.error(err);
          res.status(500).json({
            success: false,
            message: "Order failed",
          });
        }
    };

    verifyPayment = async (req, res) => {
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            paymentId,
        } = req.body;
        
        const userId = req.user.id;
        
        let session;
        
        try {
            session = await mongoose.startSession();
            session.startTransaction();
        
            /* 1️⃣ Fetch Payment */
            const payment = await Payment.findById(paymentId).session(session);
        
            if (!payment || payment.status === "PAID") {
                throw new Error("Invalid payment");
            }
        
            /* 2️⃣ Verify Order Match */
            if (payment.orderId !== razorpay_order_id) {
                throw new Error("Order mismatch");
            }
        
            /* 3️⃣ Verify Signature */
            const body =
                razorpay_order_id + "|" + razorpay_payment_id;
        
            const expected = crypto
                .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
                .update(body)
                .digest("hex");
        
            if (expected !== razorpay_signature) {
                throw new Error("Signature mismatch");
            }
        
            /* 4️⃣ Fetch User + Package */
            const user = await User.findById(userId).session(session);
        
            const selectedPackage = await Package.findById(
                payment.package
            ).session(session);
        
            if (!user || !selectedPackage) {
                throw new Error("Invalid user/package");
            }

            /* 🆕 Generate referral code if not present */
            if (!user.referralCode) {
                // Assumes generateReferralCode is a method of this controller
                user.referralCode = await this.generateUniqueReferralCode();
            }
        
            /* 5️⃣ Validate Amount */
            if (payment.amount !== selectedPackage.price) {
                throw new Error("Amount mismatch");
            }
        
            /* 6️⃣ Update Payment */
            payment.status = "PAID";
            payment.paymentId = razorpay_payment_id;
            payment.signature = razorpay_signature;
        
            await payment.save({ session });
        
            /* 7️⃣ Activate Package */
            user.package = selectedPackage._id;
            user.packagePurchasedAt = new Date();
            user.packageExpiresAt =
                new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        
            user.isAnyPackagePurchased = true;
        
            await user.save({ session });
        
            await session.commitTransaction();
            session.endSession();

            // Call checkAndPayPromotionalIncome after successful payment & package activation
            // Not awaiting it, as it's not critical to this response; can be awaited if needed
            this.checkAndPayPromotionalIncome(user.referralCode);
        
            return res.json({
                success: true,
                message: "Payment verified & package activated",
            });
        
        } catch (err) {
            if (session) {
                await session.abortTransaction();
                session.endSession();
            }
        
            console.error(err);
        
            return res.status(400).json({
                success: false,
                message: err.message,
            });
        }
    };
}

export default PaymentController;
