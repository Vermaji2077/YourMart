
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { CartProvider } from './context/CartContex.tsx'
import { AuthProvider } from './context/AuthContext.tsx'

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <AuthProvider>
      <CartProvider>                    {/* Se envuelve la aplicacion en el provider del carrito */}
        <App />
      </CartProvider>
    </AuthProvider>
  </BrowserRouter>

)
