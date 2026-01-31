import express from "express";
import adminRouter from "./Routers/admin.routes.js";
import authRouter from "./Routers/auth.routes.js";
import parentRouter from "./Routers/user.routes.js";
import paymentRouter from "./Routers/Payment/payment.routes.js";
// import therapistRouter from "./Routers/therapist.routes.js";
// import superAdminRouter from "./Routers/super-admin.routes.js";


const router = express.Router();

router.get("/", (req, res) => {
  res.send("Welcome to EV App Server APIs");
});

router.use("/auth", authRouter);
router.use("/admin", adminRouter);
// router.use("/super-admin", superAdminRouter);
router.use("/user", parentRouter); 
router.use("/payment", paymentRouter); 

// router.use("/therapist", therapistRouter);


export default router;
