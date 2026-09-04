


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
    // Usamos $transaction para crear la orden de manera atómica: 
    // si algo falla, se revierte todo. Recordar que tenemos 3 operaciones
    // que podrían fallar: tx.product.findMany, tx.order.create, tx.product.updateMany 
    // 1. Transacción de BD: Validar stock, crear orden y (si aplica) descontar stock
    const order = await prisma.$transaction(async (tx) => {
      const productIds = items.map((i: any) => i.product);                               // Cada elemento i es un objeto: { "product": "64f1a2b3c4d5e6f7", "quantity": 2 }. De este objeto obtenemos el product que corresponde con el id
      const products = await tx.product.findMany({ where: { id: { in: productIds } } }); // Buscamos todos los productos que coincidan con los ids obtenidos
      const productMap: Record<string, (typeof products)[0]> = {};                       // Creamos un objeto para poder acceder a los productos por su id
      products.forEach((p) => (productMap[p.id] = p));                                   // Recorremos el array de productos y los añadimos al objeto

      const orderItems: OrderItem[] = items.map((item: any) => {                         // Se recorre cada item del carrito 
        const dbProduct = productMap[item.product];                                      // y se verifica, contra productMap
        if (!dbProduct) throw new Error(`Product ${item.product} not found`);            // que exista
        if ((dbProduct.stock ?? 0) < item.quantity) {                                    // y que haya stock suficiente
          throw new Error(`Product ${dbProduct.name} is out of stock`);
        }
        return {                                                                         // se forma el objeto orderItem
          product: dbProduct.id,
          name: dbProduct.name,
          image: dbProduct.image,
          price: dbProduct.price,
          quantity: item.quantity,
          unit: dbProduct.unit,
        };
      });

      const subtotal = orderItems.reduce((s, i) => s + i.price * i.quantity, 0);         // suma de price * quantity de cada item.   
      const deliveryFee = subtotal > 20 ? 0 : 1.99;                                      // deliveryFee = gratis si subtotal > 20, sino 1.99.
      const tax = Math.round(subtotal * 0.08 * 100) / 100;                               // tax = 8% del subtotal redondeado a 2 decimales.
      const total = Math.round((subtotal + deliveryFee + tax) * 100) / 100;              // total = suma de los tres, también redondeado.

      // Si es tarjeta, el estado inicial es "Pending". Si es otro método, es "Placed".
      const initialStatus = paymentMethod === "card" ? "Pending" : "Placed";

      const created = await tx.order.create({                                            // Se crea el registro Order en la base de datos con todos los datos calculados, más un statusHistory inicial con estado "Placed". En este punto la orden ya existe en la BD, pero el stock todavía no se descontó y el pago todavía no se procesó. 
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

      // 2. Si NO es pago con tarjeta, descontamos el stock aquí mismo
      // Para tarjeta, el stock se descuenta en el webhook cuando Stripe confirma el pago
      if (paymentMethod !== "card") {
        for (const item of orderItems) {                                                    // Se procede a decrementar el stock de cada producto
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
    });// Fin de la transacción de Prisma

    // 3. Si es pago con tarjeta, creamos la sesión de Stripe FUERA de la transacción
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
          metadata: { orderId: order.id } // ⚠️ NECESARIO: los metadata del session NO se copian automáticamente al PaymentIntent
        }
      });

      // Devolvemos la URL para que el frontend redirija a Stripe
      return res.json({ url: session.url })
    }

    // 4º Enviar eventos a Inngest fuera de la transacción solo si el pago no es con tarjeta
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
  const { status } = req.query;                                                             // status será "Placed", "Confirmed", "Shipped", "Delivered", "Cancelled" o undefined

  const where: any = {                                                                      // Objeto que define filtros de búsqueda para órdenes
    userId: req.user!.id,                                                                   // Filtra solo órdenes del usuario actual
    NOT: [{ paymentMethod: "card", isPaid: false }]                                         // Excluye órdenes pagadas con tarjeta que aún no están pagadas
  }

  if (status && status !== "all") {                                                         // Si recibimos parámetro de status
    where.status = status;                                                                  // Filtramos por el estado recibido
  }

  const orders = await prisma.order.findMany({                                              // Buscamos las órdenes del usuario con filtros aplicados
    where,                                                                                  // Filtros de búsqueda definidos arriba
    include: { deliveryPartner: { select: { name: true, phone: true } } },                  // Incluye datos del repartidor
    orderBy: { createdAt: "desc" }                                                          // Ordena por fecha de creación descendente
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
    const { status, note } = req.body;                                                          // Se recibe el status del body de la petición.

    const order = await prisma.order.findUnique({                                             // Se busca la orden por id que viene el url                                                                
      where: { id: req.params.id as string },
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const history = (Array.isArray(order.statusHistory)                                        // Si order.statusHistory es un array, lo asigna a history, si no, lo asigna a un array vacío.
      ? order.statusHistory
      : []
    ) as any[];

    history.push({                                                                             // Añadimos el nuevo estado al historial.
      status, note: note || `Order ${status.toLowerCase()}`,
      timestamp: new Date()
    });

    const updatedOrder = await prisma.order.update({                                           // Actualizamos la orden con el nuevo estado.
      where: { id: req.params.id as string },
      data: { status, statusHistory: history }
    })

    res.json({ order: updatedOrder });                                                          // Respondemos con la orden actualizada.

  } catch (error: any) {
    res.status(400).json({ message: error.message ?? "Could not get order" });
  }
}

// Get all orders (admin)
// GET /api/orders/all

export const getAllOrders = async (req: Request, res: Response) => {
  const orders = await prisma.order.findMany({                                              // Buscamos las órdenes del usuario con filtros aplicados
    where: { NOT: [{ paymentMethod: "card", isPaid: false }] },                             // Excluimos órdenes pagadas con tarjeta que aún no están pagadas
    include: {                                                                              // Incluimos datos del usuario y del repartidor
      user: { select: { name: true, email: true } },
      deliveryPartner: { select: { name: true, phone: true } }
    },
    orderBy: { createdAt: "desc" }                                                          // Ordena por fecha de creación descendente
  });

  res.json({ orders })
};

// Get Order Location
// GET /api/orders/:id/location

export const getOrderLocation = async (req: Request, res: Response) => {
  try {
    const order = await prisma.order.findFirst({                                            // Se busca la orden por                                                                 
      where: {
        id: req.params.id as string,                                                        // ID de la orden que viene en el url
        userId: req.user!.id                                                                // ID del usuario actual
      },
      select: { liveLocation: true, status: true },                                         // Seleccionamos solo la ubicación en tiempo real y el estado de la orden
    });

    if (!order) return res.status(404).json({ message: "Order not found" });

    res.json({                                                                              // Respondemos con la ubicación en tiempo real y el estado de la orden
      liveLocation: order.liveLocation,
      status: order.status
    })


  } catch (error: any) {
    res.status(400).json({ message: error.message ?? "Could not get order location" });
  }
}
