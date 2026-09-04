import { emailLayout } from "./Emaillayout.js";
import { productGrid } from "./ProductCard.js";

type Product = {
    name: string;
    image?: string | null;
    price: number;
    originalPrice?: number | null;
};

type MonthlyOffersInput = {
    userName: string;
    deals: Product[];
    shopUrl: string;
};

/**
 * Email de ofertas mensuales ("Fresh Picks Just For You!").
 * Se llama una vez por usuario dentro del batch de envío en
 * sendMonthlyOffers (jobs/inngest.ts).
 */
export function monthlyOffersTemplate({ userName, deals, shopUrl }: MonthlyOffersInput) {
    const bodyHtml = `
    <p style="margin: 0 0 20px; font-size: 15px; color: #374151;">
      Hi <strong>${userName}</strong>, check out this month's top picks!
    </p>

    ${productGrid(deals, 3)}

    <div style="text-align: center; margin-top: 24px;">
      <a href="${shopUrl}"
         style="display: inline-block; background: #16a34a; color: #fff; padding: 12px 32px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 14px;">
         Shop All Deals →
      </a>
    </div>
  `;

    return emailLayout({
        title: "Fresh Picks Just For You!",
        subtitle: "Exclusive offers to kick off your month right",
        gradient: { from: "#f97316", to: "#fb923c" },
        bodyHtml,
    });
}