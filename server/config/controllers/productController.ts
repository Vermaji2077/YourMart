import { Request, Response } from "express";
import { prisma } from "../prisma.js"


// GET /api/products/flash-deals
export const getFlashDeals = async (req: Request, res: Response) => {
  const products = await prisma.product.findMany({
    where: { stock: { gt: 0 } },
    orderBy: { originalPrice: "desc" }
  });

  const productsWithDiscount = products.map((p: any) => {
    const discount = p.originalPrice && p.price
      ? Math.round(((p.originalPrice - p.price) / p.originalPrice) * 100)
      : 0;
    return { ...p, discount }
  });

  res.json({ products: productsWithDiscount.slice(0, 8) })
}

// GET /api/products
// export const getProducts = async (req: Request, res: Response) => {
//   const { category, search, minPrice, maxPrice, sort } = req.query;                 // Todo lo que venga en ?category=ropa&search=zap&sort=price-low se desempaqueta.

//   const where: any = {};                                                            // Inicializamos un objeto "where" que usaremos para construir la query de prisma.
//   if (category && category !== "all") where.category = category as string;          // Si envían "category" y no es "all", añadimos la condición de filtro por categoría a where
//   if (search) where.name = { contains: search as string, mode: "insensitive" };     // Si envían búsqueda, añadimos a where la condición de filtro por nombre con el value de dicha busqueda
//   if (minPrice || maxPrice) {                                                       // Si envían un rango de precios, añadimos a where la condición de filtro por precio
//     where.price = {};
//     if (minPrice) where.price.gte = Number(minPrice);
//     if (maxPrice) where.price.lte = Number(maxPrice);
//   }

//   const orderBy: any = {};                                                          // Inicializamos un objeto "orderBy" que usaremos para construir la query de prisma.
//   if (sort === "price-low") orderBy.price = "asc"                                   // Si envían "sort" y es "price-low", ordenamos por precio ascendente
//   else if (sort === "price-high") orderBy.price = "desc"                            // Si envían "sort" y es "price-high", ordenamos por precio descendente
//   else orderBy.createdAt = "desc"                                                   // Por defecto, ordenamos por fecha de creación descendente

//   const products = await prisma.product.findMany({                                  // Usamos prisma para buscar los productos con las condiciones de "where" y "orderBy"
//     where, orderBy
//   });

//   const productsWithDiscount = products.map((p: any) => {                           // Recorremos el array de productos para calcular el descuento de cada uno
//     const discount = p.originalPrice && p.price
//       ? Math.round(((p.originalPrice - p.price) / p.originalPrice) * 100)
//       : 0;
//     return { ...p, discount }                                                     // Devolvemos el producto con el descuento añadido
//   });

//   res.json({ products: productsWithDiscount });                                     // Devolvemos el array de productos con el descuento añadido 
// }
export const getProducts = async (req: Request, res: Response) => {
  const { category, search, minPrice, maxPrice, sort, organic, page, limit } = req.query;

  const where: any = {};
  if (category && category !== "all") where.category = category as string;
  if (search) where.name = { contains: search as string, mode: "insensitive" };
  if (organic === "true") where.isOrganic = true;
  if (minPrice || maxPrice) {
    where.price = {};
    if (minPrice) where.price.gte = Number(minPrice);
    if (maxPrice) where.price.lte = Number(maxPrice);
  }

  const orderBy: any = [];
  if (sort === "price_asc") orderBy.push({ price: "asc" });
  else if (sort === "price_desc") orderBy.push({ price: "desc" });
  else if (sort === "rating") orderBy.push({ rating: "desc" });
  else if (sort === "name") orderBy.push({ name: "asc" });
  else orderBy.push({ createdAt: "desc" });
  orderBy.push({ id: "asc" });

  const isPaginated = page !== undefined || limit !== undefined;

  let products;
  let total;
  let totalPages = 1;
  let pageNumber = 1;

  // Si se envían parámetros de paginación, se hace una transacción con findMany y count.
  if (isPaginated) {
    pageNumber = Number(page) || 1;
    const limitNumber = Number(limit) || 12;
    const skip = (pageNumber - 1) * limitNumber;

    const [paginatedProducts, count] = await prisma.$transaction([
      prisma.product.findMany({ where, orderBy, skip, take: limitNumber }),
      prisma.product.count({ where })
    ]);
    products = paginatedProducts;
    total = count;
    totalPages = Math.ceil(total / limitNumber);
  } else {
    // Si no se envían parámetros de paginación, se hace una búsqueda normal.
    products = await prisma.product.findMany({ where, orderBy });
    total = products.length;
  }

  const productsWithDiscount = products.map((p: any) => {
    const discount = p.originalPrice && p.price
      ? Math.round(((p.originalPrice - p.price) / p.originalPrice) * 100)
      : 0;
    return { ...p, discount };
  });

  res.json({
    products: productsWithDiscount,
    totalPages,
    currentPage: pageNumber,
    total
  });
};

// GET /api/products/:id
export const getProduct = async (req: Request, res: Response) => {
  const product = await prisma.product.findUnique({
    where: { id: req.params.id as string }
  });

  if (!product) {
    res.status(404).json({ message: "Product not found" });
    return
  }

  const discount = product.originalPrice && product.price
    ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
    : 0;

  res.json({ product: { ...product, discount } })
}

// POST /api/products
export const createProduct = async (req: Request, res: Response) => {
  try {
    const { name, description, price, originalPrice, image, category, unit, stock, isOrganic } = req.body;
    const product = await prisma.product.create({
      data: { name, description, price, originalPrice, image, category, unit, stock, isOrganic }
    });
    res.status(201).json({ product });
  } catch (error: any) {
    console.error(error);
    res.status(400).json({ message: error.message });
  }
}

// PUT /api/products/:id
export const updateProduct = async (req: Request, res: Response) => {
  try {
    const { name, description, price, originalPrice, image, category, unit, stock, isOrganic } = req.body;
    const product = await prisma.product.update({
      where: { id: req.params.id as string },
      data: { name, description, price, originalPrice, image, category, unit, stock, isOrganic }
    });
    res.json({ product });
  } catch (error: any) {
    console.error(error);
    res.status(400).json({ message: error.message });
  }
};

// DELETE /api/products/:id
export const deleteProduct = async (req: Request, res: Response) => {
  const product = await prisma.product.update({
    where: { id: req.params.id as string },
    data: { stock: Number(0) }
  });
  res.json({ message: "Product Updated (Out of Stock)" })
};


