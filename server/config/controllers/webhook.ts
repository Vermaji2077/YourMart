import Stripe from "stripe";
import { Request, Response } from "express";
import { prisma } from "../prisma.js";
import { inngest } from "../../inngest/index.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

export const stripeWebhook = async (
  request: Request,
  response: Response
) => {
  let event: Stripe.Event;

  // ==========================================
  // VERIFY STRIPE WEBHOOK
  // ==========================================

  if (endpointSecret) {
    const signature = request.headers["stripe-signature"];

    try {
      event = stripe.webhooks.constructEvent(
        request.body,
        signature as string,
        endpointSecret
      );
    } catch (err: any) {
      console.log(
        "⚠️ Webhook signature verification failed:",
        err.message
      );

      return response.sendStatus(400);
    }
  } else {
    event = request.body;
  }

  try {
    // ==========================================
    // PAYMENT SUCCESS
    // ==========================================

    switch (event.type) {
      case "payment_intent.succeeded": {
        const paymentIntent =
          event.data.object as Stripe.PaymentIntent;

        console.log("\n=================================");
        console.log("💳 PAYMENT SUCCEEDED");
        console.log("Payment Intent ID:", paymentIntent.id);
        console.log(
          "Payment Intent metadata:",
          paymentIntent.metadata
        );
        console.log("=================================\n");

        // Get order ID from Stripe metadata
        const orderId = paymentIntent.metadata?.orderId;

        if (!orderId) {
          console.log(
            "⚠️ No orderId found in PaymentIntent metadata"
          );

          break;
        }

        console.log("🛒 Order ID:", orderId);

        // ==========================================
        // FIND ORDER
        // ==========================================

        const currentOrder = await prisma.order.findUnique({
          where: {
            id: orderId,
          },
        });

        if (!currentOrder) {
          console.log(
            `⚠️ Order ${orderId} not found in database`
          );

          break;
        }

        // ==========================================
        // PREVENT DUPLICATE PROCESSING
        // ==========================================

        if (currentOrder.isPaid) {
          console.log(
            `✅ Order ${orderId} already processed`
          );

          break;
        }

        // ==========================================
        // MARK ORDER AS PAID + UPDATE STOCK
        // ==========================================

        const orderItems = Array.isArray(currentOrder.items)
          ? (currentOrder.items as any[])
          : [];

        await prisma.$transaction(async (tx) => {
          // Mark order as paid
          await tx.order.update({
            where: {
              id: orderId,
            },
            data: {
              isPaid: true,
            },
          });

          // Decrease product stock
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

        console.log(
          `📦 Sending order/placed event for ${orderId}`
        );

        await inngest.send({
          name: "order/placed",
          data: {
            orderId,
          },
        });

        console.log(
          `✅ order/placed event sent for ${orderId}`
        );

        // ==========================================
        // SEND STOCK EVENTS
        // ==========================================

        for (const item of orderItems) {
          await inngest.send({
            name: "inventory/stock.updated",
            data: {
              productId: item.product,
            },
          });

          console.log(
            `📦 Stock update event sent for product ${item.product}`
          );
        }

        console.log(
          `🚚 Delivery process started for order ${orderId}`
        );

        break;
      }

      // ==========================================
      // PAYMENT FAILED
      // ==========================================

      case "payment_intent.payment_failed":
      case "payment_intent.canceled": {
        const paymentIntent =
          event.data.object as Stripe.PaymentIntent;

        const failureOrderId =
          paymentIntent.metadata?.orderId;

        console.log(
          `❌ Payment failed/canceled: ${failureOrderId}`
        );

        if (failureOrderId) {
          try {
            await prisma.order.delete({
              where: {
                id: failureOrderId,
              },
            });

            console.log(
              `🗑️ Order ${failureOrderId} deleted`
            );
          } catch (err: any) {
            if (err.code === "P2025") {
              console.log(
                `⚠️ Order ${failureOrderId} was already deleted`
              );
            } else {
              console.log(
                `⚠️ Error deleting order ${failureOrderId}:`,
                err.message
              );
            }
          }
        }

        break;
      }

      // ==========================================
      // OTHER EVENTS
      // ==========================================

      default:
        console.log(
          `ℹ️ Unhandled Stripe event: ${event.type}`
        );
    }
  } catch (error: any) {
    console.error(
      "❌ Error processing webhook event:",
      error
    );

    return response.status(500).json({
      error: "Webhook handler failed",
    });
  }

  return response.json({
    received: true,
  });
};