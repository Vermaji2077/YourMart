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

// ======================================================
// CREATE ORDER
// POST /api/orders
// ======================================================

export const createOrder = async (
  req: Request,
  res: Response
) => {
  const {
    items,
    shippingAddress,
    paymentMethod,
  } = req.body;

  if (!items || items.length === 0) {
    return res.status(400).json({
      message: "No order items",
    });
  }

  try {
    const order = await prisma.$transaction(
      async (tx) => {
        // ----------------------------------------------
        // Get product IDs
        // ----------------------------------------------

        const productIds = items.map(
          (i: any) => i.product
        );

        // ----------------------------------------------
        // Get products from database
        // ----------------------------------------------

        const products =
          await tx.product.findMany({
            where: {
              id: {
                in: productIds,
              },
            },
          });

        // ----------------------------------------------
        // Create product map
        // ----------------------------------------------

        const productMap: Record<
          string,
          (typeof products)[0]
        > = {};

        products.forEach(
          (p) => (productMap[p.id] = p)
        );

        // ----------------------------------------------
        // Prepare order items
        // ----------------------------------------------

        const orderItems: OrderItem[] =
          items.map((item: any) => {
            const dbProduct =
              productMap[item.product];

            if (!dbProduct) {
              throw new Error(
                `Product ${item.product} not found`
              );
            }

            if (
              (dbProduct.stock ?? 0) <
              item.quantity
            ) {
              throw new Error(
                `Product ${dbProduct.name} is out of stock`
              );
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

        // ----------------------------------------------
        // Calculate totals
        // ----------------------------------------------

        const subtotal =
          orderItems.reduce(
            (sum, item) =>
              sum +
              item.price * item.quantity,
            0
          );

        const deliveryFee =
          subtotal > 100 ? 0 : 25;

        const tax =
          Math.round(
            subtotal * 0.08 * 100
          ) / 100;

        const total =
          Math.round(
            (subtotal +
              deliveryFee +
              tax) *
              100
          ) / 100;

        // ----------------------------------------------
        // Initial status
        // ----------------------------------------------

        const initialStatus =
          paymentMethod === "card"
            ? "Pending"
            : "Placed";

        // ----------------------------------------------
        // Create order
        // ----------------------------------------------

        const created =
          await tx.order.create({
            data: {
              userId: req.user!.id,

              items: orderItems,

              shippingAddress,

              paymentMethod,

              subtotal,

              deliveryFee,

              tax,

              total,

              statusHistory: [
                {
                  status: initialStatus,
                  note: "Order created",
                  timestamp:
                    new Date().toISOString(),
                },
              ],
            },
          });

        // ----------------------------------------------
        // Reduce stock for non-card orders
        // ----------------------------------------------

        if (paymentMethod !== "card") {
          for (const item of orderItems) {
            const result =
              await tx.product.updateMany({
                where: {
                  id: item.product,
                  stock: {
                    gte: item.quantity,
                  },
                },

                data: {
                  stock: {
                    decrement:
                      item.quantity,
                  },
                },
              });

            if (result.count === 0) {
              throw new Error(
                `Product ${item.name} is out of stock`
              );
            }
          }
        }

        return created;
      }
    );

    // ==================================================
    // STRIPE PAYMENT
    // ==================================================

    if (paymentMethod === "card") {
      const stripe = new Stripe(
        process.env
          .STRIPE_SECRET_KEY as string
      );

      const session =
        await stripe.checkout.sessions.create({
          success_url: `${req.headers.origin}/orders?clearCart=true`,

          cancel_url: `${req.headers.origin}/checkout`,

          line_items: [
            {
              price_data: {
                currency: "inr",

                product_data: {
                  name: "Payment Groceries",
                },

                unit_amount:
                  Math.round(
                    order.total * 100
                  ),
              },

              quantity: 1,
            },
          ],

          mode: "payment",

          metadata: {
            orderId: order.id,
          },

          payment_intent_data: {
            metadata: {
              orderId: order.id,
            },
          },
        });

      return res.json({
        url: session.url,
      });
    }

    // ==================================================
    // SEND INNGEST EVENTS
    // ==================================================

    try {
      const orderItems =
        order.items as any[];

      // ----------------------------------------------
      // Stock updated events
      // ----------------------------------------------

      for (const item of orderItems) {
        await inngest.send({
          name: "inventory/stock.updated",

          data: {
            productId: item.product,
          },
        });
      }

      // ----------------------------------------------
      // Order placed event
      // ----------------------------------------------

      await inngest.send({
        name: "order/placed",

        data: {
          orderId: order.id,
        },
      });
    } catch (inngestErr) {
      console.error(
        "Failed to send events to Inngest:",
        inngestErr
      );
    }

    return res.json({
      order,
    });
  } catch (err: any) {
    return res.status(400).json({
      message:
        err.message ??
        "Could not create order",
    });
  }
};

// ======================================================
// GET USER ORDERS
// GET /api/orders
// ======================================================

export const getUserOrders = async (
  req: Request,
  res: Response
) => {
  try {
    const { status } = req.query;

    const where: any = {
      userId: req.user!.id,

      NOT: [
        {
          paymentMethod: "card",
          isPaid: false,
        },
      ],
    };

    if (
      status &&
      status !== "all"
    ) {
      where.status = status;
    }

    const orders =
      await prisma.order.findMany({
        where,

        include: {
          deliveryPartner: {
            select: {
              name: true,
              phone: true,
            },
          },
        },

        orderBy: {
          createdAt: "desc",
        },
      });

    return res.json({
      orders,
    });
  } catch (error: any) {
    return res.status(400).json({
      message:
        error.message ??
        "Could not get orders",
    });
  }
};

// ======================================================
// GET SINGLE ORDER
// GET /api/orders/:id
// ======================================================

export const getOrder = async (
  req: Request,
  res: Response
) => {
  try {
    const order =
      await prisma.order.findFirst({
        where: {
          id: req.params.id as string,

          userId: req.user!.id,
        },

        include: {
          deliveryPartner: {
            select: {
              name: true,
              phone: true,
              avatar: true,
              vehicleType: true,
            },
          },
        },
      });

    if (!order) {
      return res.status(404).json({
        message: "Order not found",
      });
    }

    return res.json({
      order,
    });
  } catch (error: any) {
    return res.status(400).json({
      message:
        error.message ??
        "Could not get order",
    });
  }
};

// ======================================================
// UPDATE ORDER STATUS
// PUT /api/orders/:id/status
// ======================================================

export const updateOrderStatus = async (
  req: Request,
  res: Response
) => {
  try {
    const { status, note } =
      req.body;

    const order =
      await prisma.order.findUnique({
        where: {
          id: req.params.id as string,
        },
      });

    if (!order) {
      return res.status(404).json({
        message: "Order not found",
      });
    }

    // ==================================================
    // IMPORTANT
    // Delivered MUST use OTP verification
    // ==================================================

    if (status === "Delivered") {
      return res.status(400).json({
        message:
          "OTP verification is required before marking the order as delivered",
      });
    }

    // ----------------------------------------------
    // Status history
    // ----------------------------------------------

    const history = (
      Array.isArray(
        order.statusHistory
      )
        ? order.statusHistory
        : []
    ) as any[];

    history.push({
      status,

      note:
        note ||
        `Order ${status.toLowerCase()}`,

      timestamp:
        new Date().toISOString(),
    });

    // ----------------------------------------------
    // Update order
    // ----------------------------------------------

    const updatedOrder =
      await prisma.order.update({
        where: {
          id: req.params.id as string,
        },

        data: {
          status,

          statusHistory: history,
        },
      });

    return res.json({
      order: updatedOrder,
    });
  } catch (error: any) {
    console.error(
      "Update order status error:",
      error
    );

    return res.status(400).json({
      message:
        error.message ??
        "Could not update order status",
    });
  }
};

// ======================================================
// VERIFY DELIVERY OTP
// PUT /api/orders/:id/verify-delivery-otp
// ======================================================

export const verifyDeliveryOtp = async (
  req: Request,
  res: Response
) => {
  try {
    const orderId =
      req.params.id as string;

    const { otp } = req.body;

    // ----------------------------------------------
    // Validate OTP
    // ----------------------------------------------

    if (!otp) {
      return res.status(400).json({
        message:
          "Delivery OTP is required",
      });
    }

    const enteredOtp =
      String(otp).trim();

    if (!/^\d{6}$/.test(enteredOtp)) {
      return res.status(400).json({
        message:
          "OTP must be exactly 6 digits",
      });
    }

    // ----------------------------------------------
    // Find order
    // ----------------------------------------------

    const order =
      await prisma.order.findUnique({
        where: {
          id: orderId,
        },
      });

    if (!order) {
      return res.status(404).json({
        message: "Order not found",
      });
    }

    // ----------------------------------------------
    // Check OTP exists
    // ----------------------------------------------

    if (!order.deliveryOtp) {
      return res.status(400).json({
        message:
          "No delivery OTP has been generated for this order",
      });
    }

    const storedOtp =
      String(order.deliveryOtp).trim();

    // ----------------------------------------------
    // Compare OTP
    // ----------------------------------------------

    if (enteredOtp !== storedOtp) {
      return res.status(400).json({
        message: "Invalid delivery OTP",
      });
    }

    // ----------------------------------------------
    // Prevent delivering already delivered order
    // ----------------------------------------------

    if (order.status === "Delivered") {
      return res.status(400).json({
        message:
          "Order has already been delivered",
      });
    }

    // ----------------------------------------------
    // Status history
    // ----------------------------------------------

    const history = (
      Array.isArray(
        order.statusHistory
      )
        ? order.statusHistory
        : []
    ) as any[];

    history.push({
      status: "Delivered",

      note:
        "Delivery completed after OTP verification",

      timestamp:
        new Date().toISOString(),
    });

    // ----------------------------------------------
    // Mark order delivered
    // ----------------------------------------------

    const updatedOrder =
      await prisma.order.update({
        where: {
          id: orderId,
        },

        data: {
          status: "Delivered",

          statusHistory: history,

          // OTP can no longer be reused
          deliveryOtp: null,
        },
      });

    return res.json({
      message:
        "OTP verified. Order delivered successfully.",

      order: updatedOrder,
    });
  } catch (error: any) {
    console.error(
      "Verify delivery OTP error:",
      error
    );

    return res.status(500).json({
      message:
        error.message ??
        "Could not verify delivery OTP",
    });
  }
};

// ======================================================
// GET ALL ORDERS
// GET /api/orders/all
// ======================================================

export const getAllOrders = async (
  req: Request,
  res: Response
) => {
  try {
    const orders =
      await prisma.order.findMany({
        where: {
          NOT: [
            {
              paymentMethod: "card",
              isPaid: false,
            },
          ],
        },

        include: {
          user: {
            select: {
              name: true,
              email: true,
            },
          },

          deliveryPartner: {
            select: {
              name: true,
              phone: true,
            },
          },
        },

        orderBy: {
          createdAt: "desc",
        },
      });

    return res.json({
      orders,
    });
  } catch (error: any) {
    return res.status(400).json({
      message:
        error.message ??
        "Could not get orders",
    });
  }
};

// ======================================================
// GET ORDER LOCATION
// GET /api/orders/:id/location
// ======================================================

export const getOrderLocation = async (
  req: Request,
  res: Response
) => {
  try {
    const order =
      await prisma.order.findFirst({
        where: {
          id: req.params.id as string,

          userId: req.user!.id,
        },

        select: {
          liveLocation: true,

          status: true,
        },
      });

    if (!order) {
      return res.status(404).json({
        message: "Order not found",
      });
    }

    return res.json({
      liveLocation:
        order.liveLocation,

      status: order.status,
    });
  } catch (error: any) {
    return res.status(400).json({
      message:
        error.message ??
        "Could not get order location",
    });
  }
};