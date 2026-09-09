import { prisma } from "../prisma.js"
import type { Request, Response } from "express"
import bcrypt from "bcrypt"

export const getAdminStats = async (req: Request, res: Response) => {
  const [totalOrders, totalUsers, totalProducts, outOfStock, totalPartners] =
    await Promise.all([
      prisma.order.count({ where: { NOT: [{ paymentMethod: "card", isPaid: false }] } }),
      prisma.user.count(),
      prisma.product.count(),
      prisma.product.count({ where: { stock: 0 } }),
      prisma.deliveryPartner.count(),
    ])

  const recentOrders = await prisma.order.findMany({
    where: { NOT: [{ paymentMethod: "card", isPaid: false }] },
    orderBy: { createdAt: "desc" },
    take: 8,
    include: {
      user: { select: { name: true, email: true } },
      deliveryPartner: { select: { name: true, phone: true } },
    },
  })

  res.json({ totalOrders, totalUsers, totalProducts, outOfStock, totalPartners, recentOrders })
}

// get delivery partners list for admin
export const getDeliveryPartners = async (req: Request, res: Response) => {
  const partners = await prisma.deliveryPartner.findMany(
    { orderBy: { name: "desc" } })

  res.json(partners)
}

// create delivery partner profile
export const createDeliveryPartner = async (req: Request, res: Response) => {
  const { name, email, password, phone, vehicleType } = req.body;
  if (!name || !email || !password || !phone) {
    res.status(400).json({ message: "Please provide all required fields" })
    return;
  }

  const hashedPassword = bcrypt.hashSync(password, 10)

  const partner = await prisma.deliveryPartner.create({
    data: {
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      phone,
      vehicleType
    },
  })

  res.status(201).json(partner)
}

// update delivery partner profile
export const updateDeliveryPartner = async (req: Request, res: Response) => {
  const { name, phone, vehicleType, isActive } = req.body;
  const data: any = {};
  if (name) data.name = name;
  if (phone) data.phone = phone;
  if (vehicleType) data.vehicleType = vehicleType;
  if (isActive !== undefined) {
    data.isActive = isActive;
  }

  try {
    const partner = await prisma.deliveryPartner.update({
      where: { id: req.params.id as string },
      data,
    });
    res.json(partner);
  } catch (error) {
    res.status(500).json({ message: "Error updating delivery partner" });
  }
}

// assign delivery partner for order
export const assignDeliveryPartner = async (req: Request, res: Response) => {
  const { partnerId } = req.body;                                                                    
  try {
    const order = await prisma.order.findUnique({      
      where: { id: req.params.id as string },
    });

    const partner = await prisma.deliveryPartner.findUnique({                               
      where: { id: partnerId },
    });

    const otp = String(Math.floor(100000 + Math.random() * 900000))

    let status = order!.status;

    const history: any[] = Array.isArray(order!.statusHistory) ? order!.statusHistory : [];       

    if (order!.status === "Placed" || order!.status === "Confirmed") {                              
      status = "Assigned";                                                                         
      history.push({
        status: "Assigned",                                                     
        note: `Assigned to ${partner!.name}`,                                                      
      })
    }

    await prisma.order.update({
      where: { id: order!.id },                                                  
      data: {
        deliveryPartnerId: partner!.id,                                               
        deliveryOtp: otp,                                            
        statusHistory: history                                                                     
      }
    })

    res.json({ order })                                                                              
  } catch (error) {
    res.status(500).json({ message: "Error assigning order for delivery" });
  }
}
