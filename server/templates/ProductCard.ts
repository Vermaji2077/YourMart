type ProductCardInput = {
    name: string;
    image?: string | null;
    price: number;
    originalPrice?: number | null;
};

/**
 * Tarjeta individual de producto, pensada para ir dentro de un <td>
 * de la tabla de ofertas mensuales.
 */
export function productCard(p: ProductCardInput) {
    const hasDiscount = !!p.originalPrice && p.originalPrice > p.price;

    return `
    <div style="border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; text-align: center;">
      ${p.image
            ? `<img src="${p.image}" alt="${p.name}" style="width: 100%; height: 100px; object-fit: cover;" />`
            : ""
        }
      <div style="padding: 10px;">
        <p style="margin: 0; font-size: 13px; font-weight: 600; color: #111827;">
          ${p.name}
        </p>
        <p style="margin: 4px 0 0; font-size: 15px; font-weight: 700; color: #16a34a;">
          $${p.price.toFixed(2)}
          ${hasDiscount
            ? `<span style="font-size: 11px; color: #9ca3af; text-decoration: line-through; margin-left: 4px;">$${p.originalPrice!.toFixed(2)}</span>`
            : ""
        }
        </p>
      </div>
    </div>
  `;
}

/**
 * Agrupa un array de productos en filas de N columnas (por defecto 3)
 * y devuelve el HTML de la tabla completa con las tarjetas dentro.
 */
export function productGrid(products: ProductCardInput[], columns = 3) {
    const rows: ProductCardInput[][] = [];
    for (let i = 0; i < products.length; i += columns) {
        rows.push(products.slice(i, i + columns));
    }

    const rowsHtml = rows
        .map(
            (row) => `
        <tr>
          ${row
                    .map(
                        (p) => `
                <td style="width: ${100 / columns}%; padding: 8px; vertical-align: top;">
                  ${productCard(p)}
                </td>`
                    )
                    .join("")}
        </tr>`
        )
        .join("");

    return `<table width="100%" cellpadding="0" cellspacing="0">${rowsHtml}</table>`;
}