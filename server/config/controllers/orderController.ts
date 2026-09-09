


// Create order

import { Request, Response } from "express";
import { prisma } from "../prisma.js";
import { inngest } from "../../inngest/index.js";
import Stripe from "stripe";





type OrderItem = {
  product: string;
  name: string;
  image: string;
  price: number;
  quantity: number;
  unit: string;
};

export const createOrder = async (req: Request, res: Response) => {
  const { items, shippingAddress, paymentMethod } = req.body;

  if (!items || items.length === 0) {
    return res.status(400).json({ message: "No order items" });
  }

  try {
   
    const order = await prisma.$transaction(async (tx) => {
      const productIds = items.map((i: any) => i.product);                             
      const products = await tx.product.findMany({ where: { id: { in: productIds } } }); 
      const productMap: Record<string, (typeof products)[0]> = {};                      
      products.forEach((p) => (productMap[p.id] = p));                                  

      const orderItems: OrderItem[] = items.map((item: any) => {                      
        const dbProduct = productMap[item.product];                       
        if (!dbProduct) throw new Error(`Product ${item.product} not found`);          
        if ((dbProduct.stock ?? 0) < item.quantity) {                                 
          throw new Error(`Product ${dbProduct.name} is out of stock`);
        }
        return {                                                                        
          product: dbProduct.id,
          name: dbProduct.name,
          image: dbProduct.image,
          price: dbProduct.price,
          quantity: item.quantity,
          unit: dbProduct.unit,
        };
      });

      const subtotal = orderItems.reduce((s, i) => s + i.price * i.quantity, 0);         
      const deliveryFee = subtotal > 100 ? 0 : 0.10;                                     
      const tax = Math.round(subtotal * 0.08 * 100) / 100;                              
      const total = Math.round((subtotal + deliveryFee + tax) * 100) / 100;             

      const initialStatus = paymentMethod === "card" ? "Pending" : "Placed";

      const created = await tx.order.create({                                        
        data: {
          userId: req.user!.id,
          items: orderItems,
          shippingAddress,
          paymentMethod,
          subtotal,
          deliveryFee,
          tax,
          total,
          statusHistory: [{ status: initialStatus, note: "Order created", timestamp: new Date() }],
        },
      });

      if (paymentMethod !== "card") {
        for (const item of orderItems) {                                                 
          const result = await tx.product.updateMany({
            where: { id: item.product, stock: { gte: item.quantity } },
            data: { stock: { decrement: item.quantity } },
          });
          if (result.count === 0) {
            throw new Error(`Product ${item.name} is out of stock`);
          }
        }
      }

      return created;
    });
    if (paymentMethod === "card") {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string)

      const session = await stripe.checkout.sessions.create({
        success_url: `${req.headers.origin}/orders?clearCart=true`,
        cancel_url: `${req.headers.origin}/checkout`,
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: "Payment Groceries"
              },
              unit_amount: Math.round(order.total * 100),
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        metadata: { orderId: order.id },
        payment_intent_data: {
          metadata: { orderId: order.id } 
        }
      });

      return res.json({ url: session.url })
    }
    try {
      const orderItems = order.items as any[];
      for (const item of orderItems) {
        await inngest.send({
          name: "inventory/stock.updated",
          data: { productId: item.product },
        });
      }

      await inngest.send({
        name: "order/placed",
        data: { orderId: order.id },
      });
    } catch (inngestErr) {
      console.error("Failed to send events to Inngest:", inngestErr);
    }

    res.json({ order });
  } catch (err: any) {
    res.status(400).json({ message: err.message ?? "Could not create order" });
  }
};

// Get user's orders
// GET /api/orders

export const getUserOrders = async (req: Request, res: Response) => {
  const { status } = req.query;                                                           

  const where: any = {                                                             
    userId: req.user!.id,        
    NOT: [{ paymentMethod: "card", isPaid: false }]                                         
  }

  if (status && status !== "all") {                                       
    where.status = status;                                                                  
  }

  const orders = await prisma.order.findMany({                                              
    where,                                               
    include: { deliveryPartner: { select: { name: true, phone: true } } },                
    orderBy: { createdAt: "desc" }                                                    
  });

  res.json({ orders })
};

// Get single order
// GET /api/orders/:id

export const getOrder = async (req: Request, res: Response) => {
  try {
    const order = await prisma.order.findFirst({
      where: { id: req.params.id as string, userId: req.user!.id },
      include: { deliveryPartner: { select: { name: true, phone: true, avatar: true, vehicleType: true } } },
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    res.json({ order });
  } catch (error: any) {
    res.status(400).json({ message: error.message ?? "Could not get order" });
  }
}

// Update order status (admin)
// PUT /api/orders/:id/status

export const updateOrderStatus = async (req: Request, res: Response) => {
  try {
    const { status, note } = req.body;                                                       

    const order = await prisma.order.findUnique({                                                             
      where: { id: req.params.id as string },
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const history = (Array.isArray(order.statusHistory)                                    
      ? order.statusHistory
      : []
    ) as any[];

    history.push({            
      status, note: note || `Order ${status.toLowerCase()}`,
      timestamp: new Date()
    });

    const updatedOrder = await prisma.order.update({ 
      where: { id: req.params.id as string },
      data: { status, statusHistory: history }
    })

    res.json({ order: updatedOrder });
  } catch (error: any) {
    res.status(400).json({ message: error.message ?? "Could not get order" });
  }
}

// Get all orders (admin)
// GET /api/orders/all

export const getAllOrders = async (req: Request, res: Response) => {
  const orders = await prisma.order.findMany({                                            
    where: { NOT: [{ paymentMethod: "card", isPaid: false }] },
    include: {                                                                           
      user: { select: { name: true, email: true } },
      deliveryPartner: { select: { name: true, phone: true } }
    },
    orderBy: { createdAt: "desc" }                                                          
  });

  res.json({ orders })
};

// Get Order Location
// GET /api/orders/:id/location

export const getOrderLocation = async (req: Request, res: Response) => {
  try {
    const order = await prisma.order.findFirst({                                                                                               
      where: {
        id: req.params.id as string,                                                      
        userId: req.user!.id                                                             
      },
      select: { liveLocation: true, status: true },                                    
    });

    if (!order) return res.status(404).json({ message: "Order not found" });

    res.json({                                                                           
      liveLocation: order.liveLocation,
      status: order.status
    })


  } catch (error: any) {
    res.status(400).json({ message: error.message ?? "Could not get order location" });
  }
}
