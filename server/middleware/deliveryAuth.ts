import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../config/prisma.js";


/*
* deliveryAuth verifica que el usuario es un delivery partner (socio repartidor)
*/
const deliveryAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;                                                        // extrae el token del header
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "No token provided" })
    }

    const token = authHeader.split(" ")[1]                                                                // divide el token en dos y toma la segunda parte
    if (!token) {
      return res.status(401).json({ message: "No token provided" })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as { id: string, role: string }   // verify el token con la clave secreta y lo castea a { id: string, role: string }
    if (decoded.role !== "delivery") {                                                                      // verifica si el rol es delivery (socio repartidor)
      return res.status(403).json({ message: "Access denied. Delivery partner only." })
    }

    const partner = await prisma.deliveryPartner.findUnique({                                             // Busca en la tabla deliveryPartner por el id del partner 
      where: { id: decoded.id }
    })
    if (!partner || !partner.isActive) {
      return res.status(401).json({ message: "Account is deactivated" })
    }

    req.partner = partner;                                                                                // asigna el partner al objeto request
    next();                                                                                               // continua con la siguiente funcion  

  } catch (error) {
    console.log(error);
    return res.status(401).json({ message: "Invalid or expired token" })
  }
}

export default deliveryAuth;