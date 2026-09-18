import { cron, Inngest } from "inngest";
import { prisma } from "../config/prisma.js";
import sendEmail from "../config/nodemailer.js";
import { monthlyOffersTemplate } from "../templates/Monthlyoffers.js";
import { lowStockAlertTemplate } from "../templates/Lowstockalert.js";
const LOW_STOCK_THRESHOLD = 10;
export const inngest = new Inngest({
    id: "Yourmart",
    isDev: true,
    baseUrl: "http://localhost:8288",
});
// Low Stock Alert to Admin Email
const checkLowStock = inngest.createFunction({
    id: "check-low-stock",
    name: "Low Stock Alert",
    triggers: [{ event: "inventory/stock.updated" }]
}, async ({ event, step }) => {
    const { productId } = event.data;
    const product = await step.run("fetch-product", async () => {
        return await prisma.product.findUnique({
            where: { id: productId }
        });
    });
    if (!product || product.stock === null || product.stock >= LOW_STOCK_THRESHOLD) {
        return { skipped: true, stock: product?.stock };
    }
    await step.run("send-low-stock-email", async () => {
        const adminEmails = process.env.ADMIN_EMAILS
            ? process.env.ADMIN_EMAILS.split(",").map((e) => e.trim())
            : [];
        if (adminEmails.length === 0)
            return { skipped: true, reason: "No admin emails" };
        await sendEmail({
            to: adminEmails.join(","),
            subject: `Low Stock Alert: "${product.name}`,
            body: lowStockAlertTemplate(product),
        });
    });
    return {
        alerted: true,
        product: product.name,
        stock: product.stock
    };
});
// Monthly Offers Email (1st of every month - payday)
const sendMonthlyOffers = inngest.createFunction({
    id: "send-monthly-offers",
    name: "Monthly Payday Offers",
    triggers: [cron("0 10 1 * *")] // El día 1 de cada mes a las 10:00. Inngest se encarga de "despertar" la función automáticamente sin que nadie tenga que llamarla.
}, async ({ step }) => {
    const { deals, users } = await step.run("fetch-deals-and-users", async () => {
        // Get top discounted products as featured deals
        const products = await prisma.product.findMany({
            where: { stock: { gt: 0 } },
            take: 6,
            orderBy: { originalPrice: "desc" },
        });
        const allUsers = await prisma.user.findMany({ select: { email: true, name: true } }); // Obtiene el email y nombre de todos los usuarios.
        return {
            deals: products,
            users: allUsers
        };
    });
    if (users.length === 0 || deals.length === 0) { // Simplemente evita seguir si no hay usuarios o no hay productos con stock
        return { skipped: true, reason: "No users or deals found" };
    }
    let sentCount = 0;
    // Se envian por lotes de 10 para no saturar el servidor de correo. Cada lote es un step.
    const batchSize = 10;
    for (let i = 0; i < users.length; i += batchSize) {
        const batch = users.slice(i, i + batchSize);
        await step.run(`send-offers-batch-${i / batchSize + 1}`, async () => {
            for (const u of batch) {
                await sendEmail({
                    to: u.email,
                    subject: `Fresh Picks Just For You!`,
                    body: monthlyOffersTemplate({
                        userName: u.name,
                        deals,
                        shopUrl: `${process.env.CLIENT_URL || "http://localhost:5173"}/products`,
                    }),
                });
            }
        });
        sentCount += batch.length;
    }
    return {
        sent: sentCount
    };
});
// Auto-Assign Rider after 5 minutes
const autoAssignRider = inngest.createFunction({
    id: "auto-assign-rider",
    name: "Auto Assign Delivery Rider",
    triggers: [{ event: "order/placed" }]
}, async ({ event, step }) => {
    const { orderId } = event.data;
    // Wait 5 minutes before attempting assignment
    await step.sleep("wait-5-min", "5m");
    const result = await step.run("assign-rider", async () => {
        const order = await prisma.order.findUnique({
            where: { id: orderId },
        });
        if (!order)
            return { skipped: true, reason: "Order not found" }; // Si no existe la orden salta esta funcion
        if (order.deliveryPartnerId)
            return { skipped: true, reason: "Already assigned" }; // Si ya tiene un repartidor asignado salta esta funcion
        if (["Cancelled", "Delivered"].includes(order.status))
            return { skipped: true, reason: `Order is ${order.status}` }; // Si la orden esta cancelada o entregada salta esta funcion
        // Find an active rider not currently delivering
        const busyOrders = await prisma.order.findMany({
            where: {
                status: { in: ["Assigned", "Packed", "Out for Delivery"] },
                deliveryPartnerId: { not: null }
            },
            select: { deliveryPartnerId: true }, // Coge solo el id del repartidor
        });
        const busyRiderIds = busyOrders.map((o) => {
            return o.deliveryPartnerId;
        });
        const availableRider = await prisma.deliveryPartner.findFirst({
            where: {
                isActive: true,
                id: { notIn: busyRiderIds }
            }
        });
        if (!availableRider)
            return { skipped: true, reason: "No available riders" };
        // Generate 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const history = (Array.isArray(order.statusHistory) // Creo un historial si no existe en la order
            ? order.statusHistory
            : []);
        history.push({
            status: "Assigned",
            note: `Auto-assigned to ${availableRider.name}`,
            timestamp: new Date().toISOString()
        });
        await prisma.order.update({
            where: { id: orderId },
            data: {
                deliveryPartnerId: availableRider.id,
                deliveryOtp: otp,
                status: "Assigned",
                statusHistory: history
            }
        });
        return {
            assigned: true,
            riderId: availableRider.id,
            riderName: availableRider.name,
            orderId: orderId
        };
    });
    return result;
});
// Create an empty array where we'll export future Inngest functions
export const functions = [checkLowStock, sendMonthlyOffers, autoAssignRider];
