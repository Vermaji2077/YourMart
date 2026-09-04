import { Request, Response } from "express";
import { prisma } from "../prisma.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { timeStamp } from "node:console";

const generateToken = (id: string) => {
  return jwt.sign({
    id,
    role: "delivery"
  },
    process.env.JWT_SECRET as string, { expiresIn: "30d" })
}


// Login Delivery Partner
// POST /api/delivery/login

export const loginPartner = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Please provide email and password" })
  }

  const partner = await prisma.deliveryPartner.findUnique({
    where: {                  // busca en la tabla deliveryPartner por el email del partner (pasado a minuscula para evitar errores de capitalizacion)
      email: email.toLowerCase()
    }
  })

  if (!partner) {
    return res.status(401).json({ message: "Please provide email and password" })
  }

  if (!partner.isActive) {
    return res.status(403).json({ message: "Your account is not active" })
  }

  const isMatch = await bcrypt.compare(password, partner.password);                 // compara la contraseña en texto plano con el hash en la bd
  if (!isMatch) {
    return res.status(401).json({ message: "Invalid email or password" })
  }

  const token = generateToken(partner.id);                                          // genera el token
  const { password: _, ...partnerData } = partner                                   // spread operator para extraer el password y guardar el resto en partnerData

  res.json({ token, partner: partnerData })                                         // devuelve el partnerData con el nuevo token
}

// Get assigned deliveries
// GET /api/delivery/my-deliveries
export const getMyDeliveries = async (req: Request, res: Response) => {
  const { status } = req.query;                                                     // extrae el status del query

  const where: any = { deliveryPartnerId: req.partner!.id }                         // crea un objeto where con el id del partner

  if (status === "active") {                                                        // si el status es active
    where.status = { in: ["Assigned", "Packed", "Out for delivery"] }               // filtra las entregas que esten en estado Assigned, Packed u Out for delivery
  } else if (status === "completed") {                                              // si el status es completed
    where.status = { in: ["Delivered", "Cancelled"] }                               // filtra las entregas que esten en estado Delivered o Cancelled
  }

  const orders = await prisma.order.findMany({
    where,
    include: { user: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" }
  })

  res.json({ orders })                                                              // devuelve las ordenes
}

// Get single delivery detail
// GET /api/delivery/my-deliveries/:id
export const getDeliveryDetail = async (req: Request, res: Response) => {
  const order = await prisma.order.findFirst({
    where: {
      id: req.params.id as string,
      deliveryPartnerId: req.partner!.id
    },
    include: { user: { select: { name: true, email: true, phone: true } } }
  })

  if (!order) {
    return res.status(404).json({ message: "Order not found" })
  }

  res.json({ order })
}

// Complete delivery with otp
// PUT /api/delivery/my-deliveries/:id/complete

export const completeDelivery = async (req: Request, res: Response) => {
  const { otp } = req.body;
  const order = await prisma.order.findFirst({
    where: {
      id: req.params.id as string,
      deliveryPartnerId: req.partner!.id,
    }
  })

  if (!order || order.status === "Cancelled" || order.status === "Delivered") {
    return res.status(400).json({ message: "Invalid Request" })
  }

  if (order.deliveryOtp !== otp) {
    return res.status(500).json({ message: "Invalid OTP" })
  }

  const history = order.statusHistory as any[];

  history.push({
    status: "Delivered",
    note: "Delivered by partener",
    timeStamp: new Date()
  })

  const updateOrder = await prisma.order.update({
    where: { id: order.id },
    data: {
      status: "Delivered",
      statusHistory: history,
      deliveryOtp: ""
    }
  })

  res.json({ order: updateOrder, message: "Delivery completed" })
}

// Cancel Delivery
// PUT /api/delivery/my-deliveries/:id/cancel

export const cancelDelivery = async (req: Request, res: Response) => {
  const { reason } = req.body;

  const order = await prisma.order.findFirst({
    where: {
      id: req.params.id as string,
      deliveryPartnerId: req.partner?.id,
    }
  })

  if (order!.status === "Delivered") {
    return res.status(400).json({ message: "Can not cancel a delivered order" })
  }

  const history = order?.statusHistory as any[];

  history.push({
    status: "Cancelled",
    note: reason || "",
    timeStamp: new Date()
  })

  const updateOrder = await prisma.order.update({
    where: { id: order!.id },
    data: {
      status: "Cancelled",
      statusHistory: history,
    }
  })

  res.json({ order: updateOrder, message: "Delivery cancelled" })
}

// Update order status
// PUT /api/delivery/my-deliveries/:id/status

export const updateDeliveryStatus = async (req: Request, res: Response) => {
  const { status } = req.body;
  const allowedStatus = ["Packed", "Out for delivery"];

  if (!allowedStatus.includes(status)) {
    return res.status(400).json({ message: "Invalid status update" })
  }

  const order = await prisma.order.findFirst({
    where: {
      id: req.params.id as string,
      deliveryPartnerId: req.partner?.id,
    }
  })

  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }

  const history = order!.statusHistory as any[];

  history.push({
    status,
    note: `Status updated to ${status}`,
    timeStamp: new Date()
  })

  const updateOrder = await prisma.order.update({
    where: { id: order!.id },
    data: {
      status,
      statusHistory: history,
    }
  })

  res.json({ order: updateOrder, message: "Status updated" })
}

// Update live location
// PUT /api/delivery/my-deliveries/:id/location
export const updateLocation = async (req: Request, res: Response) => {
  const { lat, lng } = req.body;

  const order = await prisma.order.findFirst({
    where: {
      id: req.params.id as string,
      deliveryPartnerId: req.partner?.id,
      status: { in: ["Assigned", "Packed", "Out for Delivery"] }
    }
  })

  await prisma.order.update({
    where: { id: order!.id },
    data: {
      liveLocation: {
        lat,
        lng,
        updatedAt: new Date()
      }
    }
  })

  res.json({ success: true })
}

