import Stripe from "stripe";
import { Request, Response } from "express";
import { prisma } from "../prisma.js";
import { inngest } from "../../inngest/index.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

export const stripeWebhook = async (request: Request, response: Response) => {
    let event: Stripe.Event;

    // 1. Verificación de firma (Requiere el body en formato raw/Buffer)
    if (endpointSecret) {
        const signature = request.headers['stripe-signature'];
        try {
            event = stripe.webhooks.constructEvent(
                request.body, // ⚠️ Debe ser un Buffer, no un JSON parseado
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
            // ✅ Evento de pago exitoso
            case 'payment_intent.succeeded': {
                const paymentIntent = event.data.object as Stripe.PaymentIntent;

                // 🚀 OPTIMIZACIÓN: Los metadatos se copian automáticamente al PaymentIntent.
                // Ya no necesitamos hacer stripe.checkout.sessions.list()
                const orderId = paymentIntent.metadata?.orderId;

                if (!orderId) {
                    console.log("⚠️ No orderId found in PaymentIntent metadata");
                    break;
                }

                // 2. IDEMPOTENCIA: Buscamos la orden para evitar procesarla dos veces
                const currentOrder = await prisma.order.findUnique({ where: { id: orderId } });
                if (!currentOrder) {
                    console.log(`⚠️ Order ${orderId} not found in database.`);
                    break;
                }

                // Si ya está pagada, ignoramos el evento (Stripe a veces reenvía el mismo webhook)
                if (currentOrder.isPaid) {
                    console.log(`✅ Order ${orderId} already processed. Ignoring duplicate webhook.`);
                    break;
                }

                // 3. Actualizar estado y descontar stock en una transacción segura
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

                // 4. Enviar eventos a Inngest
                await inngest.send({
                    name: "order/placed",
                    data: { orderId }
                });

                const orderItems = Array.isArray(currentOrder.items) ? currentOrder.items as any[] : [];
                for (const item of orderItems) {
                    await inngest.send({
                        name: "inventory/stock.updated", // Asegúrate que coincida con tu listener de Inngest
                        data: { productId: item.product }
                    });
                }
                break;
            }

            // ✅ PAGO FALLIDO O CANCELADO (Manejamos ambos juntos porque la lógica es la misma)
            case 'payment_intent.payment_failed':
            case 'payment_intent.canceled': {
                const paymentIntent = event.data.object as Stripe.PaymentIntent;
                const failureOrderId = paymentIntent.metadata?.orderId;

                if (failureOrderId) {
                    try {
                        await prisma.order.delete({ where: { id: failureOrderId } });
                        console.log(`🗑️ Order ${failureOrderId} deleted due to ${event.type}.`);
                        // Práctica recomendada: En lugar de borrarla directamente, es mejor actualizar su estado para mantener historial.
                        //  await prisma.order.update({
                        //    where: { id: failureOrderId },
                        //    data: { 
                        //    paymentStatus: "Failed",
                        //   }
                        // });
                        // O si usas statusHistory:
                        // statusHistory: [..., { status: "Canceled", note: "Payment failed", timestamp: new Date() }]


                    } catch (err: any) {
                        // Si la orden ya fue borrada (por un webhook duplicado), simplemente la ignoramos
                        if (err.code === 'P2025') { // Código de error de Prisma para "Record not found"
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
        // Si hay un error, devolvemos 500 para que Stripe reintente el webhook más tarde
        return response.status(500).json({ error: "Webhook handler failed" });
    }

    // Responder 200 OK rápidamente para que Stripe sepa que lo recibimos
    response.json({ received: true });
};