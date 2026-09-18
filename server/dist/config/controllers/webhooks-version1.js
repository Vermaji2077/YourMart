import Stripe from "stripe";
import { prisma } from "../prisma.js";
import { inngest } from "../../inngest/index.js";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
export const stripeWebhook = async (request, response) => {
    let event;
    // ==========================================
    // VERIFY WEBHOOK
    // ==========================================
    if (endpointSecret) {
        const signature = request.headers["stripe-signature"];
        try {
            event = stripe.webhooks.constructEvent(request.body, signature, endpointSecret);
        }
        catch (err) {
            console.log("⚠️ Webhook signature verification failed:", err.message);
            return response.sendStatus(400);
        }
    }
    else {
        event = request.body;
    }
    // ==========================================
    // HANDLE EVENTS
    // ==========================================
    try {
        switch (event.type) {
            // ==========================================
            // PAYMENT SUCCESS
            // ==========================================
            case "payment_intent.succeeded": {
                const paymentIntent = event.data.object;
                console.log("\n================================");
                console.log("💳 PAYMENT SUCCESS");
                console.log("Payment Intent:", paymentIntent.id);
                console.log("Metadata:", paymentIntent.metadata);
                console.log("================================\n");
                // Get order ID directly from PaymentIntent metadata
                const orderId = paymentIntent.metadata?.orderId;
                if (!orderId) {
                    console.log("⚠️ No orderId found in PaymentIntent metadata");
                    break;
                }
                console.log("🛒 Order ID:", orderId);
                // ==========================================
                // FIND ORDER
                // ==========================================
                const order = await prisma.order.findUnique({
                    where: {
                        id: orderId,
                    },
                });
                if (!order) {
                    console.log(`⚠️ Order ${orderId} not found`);
                    break;
                }
                // ==========================================
                // PREVENT DUPLICATE WEBHOOK
                // ==========================================
                if (order.isPaid) {
                    console.log(`✅ Order ${orderId} is already paid`);
                    break;
                }
                // ==========================================
                // GET ORDER ITEMS
                // ==========================================
                const orderItems = Array.isArray(order.items)
                    ? order.items
                    : [];
                // ==========================================
                // MARK ORDER AS PAID
                // ==========================================
                await prisma.$transaction(async (tx) => {
                    await tx.order.update({
                        where: {
                            id: orderId,
                        },
                        data: {
                            isPaid: true,
                        },
                    });
                    // ==========================================
                    // DECREASE STOCK
                    // ==========================================
                    for (const item of orderItems) {
                        await tx.product.updateMany({
                            where: {
                                id: item.product,
                            },
                            data: {
                                stock: {
                                    decrement: item.quantity,
                                },
                            },
                        });
                    }
                });
                console.log(`✅ Order ${orderId} marked as PAID`);
                // ==========================================
                // SEND ORDER PLACED EVENT
                // ==========================================
                await inngest.send({
                    name: "order/placed",
                    data: {
                        orderId: orderId,
                    },
                });
                console.log(`🚚 order/placed event sent for ${orderId}`);
                // ==========================================
                // SEND STOCK UPDATE EVENTS
                // ==========================================
                for (const item of orderItems) {
                    await inngest.send({
                        name: "inventory/stock.updated",
                        data: {
                            productId: item.product,
                        },
                    });
                    console.log(`📦 Stock event sent for ${item.product}`);
                }
                break;
            }
            // ==========================================
            // PAYMENT FAILED
            // ==========================================
            case "payment_intent.payment_failed":
            case "payment_intent.canceled": {
                const paymentIntent = event.data.object;
                const orderId = paymentIntent.metadata?.orderId;
                console.log(`❌ Payment failed for order: ${orderId}`);
                if (!orderId) {
                    break;
                }
                try {
                    await prisma.order.delete({
                        where: {
                            id: orderId,
                        },
                    });
                    console.log(`🗑️ Order ${orderId} deleted`);
                }
                catch (err) {
                    if (err.code === "P2025") {
                        console.log(`⚠️ Order ${orderId} already deleted`);
                    }
                    else {
                        console.error("❌ Error deleting failed order:", err);
                    }
                }
                break;
            }
            // ==========================================
            // OTHER EVENTS
            // ==========================================
            default:
                console.log(`ℹ️ Unhandled Stripe event: ${event.type}`);
        }
        return response.json({
            received: true,
        });
    }
    catch (error) {
        console.error("❌ Error processing Stripe webhook:", error);
        return response.status(500).json({
            error: "Webhook handler failed",
        });
    }
};
