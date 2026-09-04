import { createContext, useContext, useEffect, useState } from "react";
import type { CartItem, Product } from "../types";


interface CartContexType {
  items: CartItem[];
  addToCart: (product: Product, quantity?: number) => void;
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  cartCount: number;
  cartTotal: number;
  isCartOpen: boolean;
  setIsCartOpen: (open: boolean) => void;
}

const CartContext = createContext<CartContexType | undefined>(undefined);     // Se crea el contexto

export function CartProvider({ children }: { children: React.ReactNode }) {   // Se crea el provider que va a envolver la aplicacion

  const [items, setItems] = useState<CartItem[]>(() => {                      // Se crea el estado del carrito inicializando con lo que hay en localStorage
    const saved = localStorage.getItem("app_cart")
    return saved ? JSON.parse(saved) : []
  });

  const [isCartOpen, setIsCartOpen] = useState(false);                        // Estado para manejar la visibilidad del carrito

  useEffect(() => {
    localStorage.setItem("app_cart", JSON.stringify(items))                   // Se guarda el estado del carrito en localStorage
  }, [items]);                                                                // Se ejecuta cada vez que cambia el estado del carrito

  const addToCart = (product: Product, quantity: number = 1) => {                // Se crea la funcion addToCart que agrega un producto al carrito
    setItems(prev => {
      const existing = prev.find((item) => item.product.id === product.id)
      if (existing) {
        return prev.map((item) => (item.product.id === product.id
          ? { ...item, quantity: item.quantity + quantity }
          : item
        ))
      }
      return [...prev, { product, quantity }]
    })
    setIsCartOpen(true)
  }

  const removeFromCart = (productId: string) => {                               // Se crea la funcion removeFromCart que elimina un producto del carrito
    setItems(prev => prev.filter((item) => item.product.id !== productId))     // Se filtra el carrito eliminando el producto con el id proporcionado
  };

  const updateQuantity = (productId: string, quantity: number) => {             // Se crea la funcion updateQuantity que actualiza la cantidad de un producto en el carrito
    if (quantity <= 0) return removeFromCart(productId);                         // Si la cantidad es menor o igual a 0, se elimina el producto
    setItems(prev => prev.map((item) => (item.product.id === productId
      ? { ...item, quantity }
      : item)))
  };

  const clearCart = () => {
    setItems([]);
    setIsCartOpen(false);
  }

  const cartCount = items.reduce((sum, item) => sum + item.quantity, 0)                        // Se calcula la cantidad total de productos en el carrito
  const cartTotal = items.reduce((sum, item) => sum + (item.product.price * item.quantity), 0) // Se calcula el total del carrito

  return (
    <CartContext.Provider value={{   // El provider recibe los valores que se van a compartir con la aplicacion y se almacenan en el context
      items,
      addToCart,
      removeFromCart,
      updateQuantity,
      clearCart,
      cartCount,
      cartTotal,
      isCartOpen,
      setIsCartOpen
    }}>

      {children}
    </CartContext.Provider>
  )
}

export function useCart() {                                                       // Se crea la funcion useCart que retorna el contexto del carrito
  const context = useContext(CartContext)
  if (!context) throw new Error("useCart must be used within CartProvider ")
  return context
}