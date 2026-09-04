import { User, DeliveryPartner } from "../../generated/prisma/client.js";

// This file is used to extend the Request interface of Express to include user and partner
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string,
        isAdmin?: boolean
      };
      partner?: DeliveryPartner
    }
  }
}

export { }