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


