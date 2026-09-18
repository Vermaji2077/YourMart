import express from "express";
import auth from "../middleware/auth.js";
import admin from "../middleware/admin.js";
import { createOrder, getAllOrders, getOrder, getOrderLocation, getUserOrders, updateOrderStatus, verifyDeliveryOtp, } from "../config/controllers/orderController.js";
const orderRouter = express.Router();
// ======================================================
// CUSTOMER ROUTES
// ======================================================
// Create order
// POST /api/orders
orderRouter.post("/", auth, createOrder);
// Get logged-in user's orders
// GET /api/orders
orderRouter.get("/", auth, getUserOrders);
// ======================================================
// ADMIN ROUTES
// ======================================================
// Get all orders
// GET /api/orders/all
//
// IMPORTANT:
// This MUST come before /:id
orderRouter.get("/all", auth, admin, getAllOrders);
// Update order status
// PUT /api/orders/:id/status
//
// Delivered is blocked inside updateOrderStatus.
// It must use OTP.
orderRouter.put("/:id/status", auth, admin, updateOrderStatus);
// Verify OTP and mark Delivered
// PUT /api/orders/:id/verify-delivery-otp
orderRouter.put("/:id/verify-delivery-otp", auth, admin, verifyDeliveryOtp);
// ======================================================
// CUSTOMER SINGLE ORDER ROUTES
// ======================================================
// Get order location
// GET /api/orders/:id/location
//
// IMPORTANT:
// This MUST come before /:id
orderRouter.get("/:id/location", auth, getOrderLocation);
// Get single order
// GET /api/orders/:id
orderRouter.get("/:id", auth, getOrder);
export default orderRouter;
