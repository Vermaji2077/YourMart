import Stripe from "stripe";
import { Request, Response } from "express";
import { prisma } from "../prisma.js";
import { inngest } from "../../inngest/index.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

export const stripeWebhook = async (request: Request, response: Response) => {
    let event: Stripe.Event;

    if (endpointSecret) {
        const signature = request.headers['stripe-signature'];
        try {
            event = stripe.webhooks.constructEvent(
                request.body, 
                signature as string,
                endpointSecret
            );
        } catch (err: any) {
            console.log(`⚠️ Webhook signature verification failed.`, err.message);
            return response.sendStatus(400);
        }
    } else {
        event = request.body;
    }

    try {
        switch (event.type) {
            case 'payment_intent.succeeded': {
                const paymentIntent = event.data.object as Stripe.PaymentIntent;

                const orderId = paymentIntent.metadata?.orderId;

                if (!orderId) {
                    console.log("⚠️ No orderId found in PaymentIntent metadata");
                    break;
                }

                const currentOrder = await prisma.order.findUnique({ where: { id: orderId } });
                if (!currentOrder) {
                    console.log(`⚠️ Order ${orderId} not found in database.`);
                    break;
                }

                if (currentOrder.isPaid) {
                    console.log(`✅ Order ${orderId} already processed. Ignoring duplicate webhook.`);
                    break;
                }

                await prisma.$transaction(async (tx) => {
                    await tx.order.update({
                        where: { id: orderId },
                        data: { isPaid: true }
                    });

                    const orderItems = Array.isArray(currentOrder.items) ? currentOrder.items as any[] : [];
                    for (const item of orderItems) {
                        await tx.product.updateMany({
                            where: { id: item.product },
                            data: { stock: { decrement: item.quantity } }
                        });
                    }
                });

                await inngest.send({
                    name: "order/placed",
                    data: { orderId }
                });

                const orderItems = Array.isArray(currentOrder.items) ? currentOrder.items as any[] : [];
                for (const item of orderItems) {
                    await inngest.send({
                        name: "inventory/stock.updated", 
                        data: { productId: item.product }
                    });
                }
                break;
            }

        
            case 'payment_intent.payment_failed':
            case 'payment_intent.canceled': {
                const paymentIntent = event.data.object as Stripe.PaymentIntent;
                const failureOrderId = paymentIntent.metadata?.orderId;

                if (failureOrderId) {
                    try {
                        await prisma.order.delete({ where: { id: failureOrderId } });
                        console.log(`🗑️ Order ${failureOrderId} deleted due to ${event.type}.`);
                      

                    } catch (err: any) {
                      
                        if (err.code === 'P2025') { 
                            console.log(`⚠️ Order ${failureOrderId} was already deleted.`);
                        } else {
                            console.log(`⚠️ Error deleting order ${failureOrderId}:`, err.message);
                        }
                    }
                }
                break;
            }

            default:
                console.log(`ℹ️ Unhandled event type: ${event.type}`);
        }
    } catch (error) {
        console.error("❌ Error processing webhook event:", error);
   
        return response.status(500).json({ error: "Webhook handler failed" });
    }

    response.json({ received: true });
};