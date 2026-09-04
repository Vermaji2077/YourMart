import { Navigate, NavLink, Outlet } from "react-router-dom";
import { PlusIcon, PackageSearchIcon, ShoppingBagIcon, LogOutIcon, BarChart3Icon, ShieldIcon, Truck } from "lucide-react";
import Navbar from "../../components/NavbarComponent";
import { useAuth } from "../../context/AuthContext";

const AdminLinkData = [
  { to: "/admin", label: "Dashboard", icon: BarChart3Icon },
  { to: "/admin/products/new", label: "Add Product", icon: PlusIcon },
  { to: "/admin/products", label: "Products", icon: PackageSearchIcon },
  { to: "/admin/orders", label: "Orders", icon: ShoppingBagIcon },
  { to: "/admin/delivery-partners", label: "Delivery Partners", icon: Truck },
  { to: "/", label: "Exit", icon: LogOutIcon },
];

/**
 * Componente de diseño (layout) para la sección de administración.
 * Estructura la interfaz en una barra lateral de navegación responsiva 
 * (con indicadores de ruta activa) y un área principal dinámica.
 * Incluye un Navbar superior que se oculta automáticamente en móviles.
 * 
 * @component
 * @example
 * // Se utiliza como layout contenedor en React Router
 * <Route path="/admin" element={<AdminLayout />} />
 * 
 * @param {Object} props - Propiedades del componente.
 * @param {React.ReactNode} [props.children] - Contenido renderizado dinámicamente por <Outlet />.
 */
export default function AdminLayout() {

  const { user } = useAuth();   // Solo los administradores pueden acceder a esta ruta
  if (!user?.isAdmin) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="h-screen overflow-hidden">
      <div className="max-lg:hidden">
        <Navbar />
      </div>

      <div className="flex flex-col h-full lg:flex-row gap-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
        <aside className="w-full lg:w-64 shrink-0 h-fit bg-white rounded-2xl p-4 border border-app-border">
          <div className="pb-4 mb-4 border-b border-app-border">
            <h2 className="text-lg font-semibold text-app-green flex items-center gap-2 px-2">
              <ShieldIcon className="size-5 text-green-900" /> Admin Panel
            </h2>
          </div>

          <nav className="flex flex-col gap-1.5">
            {AdminLinkData.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                // Nota: 'end' es crucial aquí. Sin él, el enlace "Dashboard" 
                // permanecería activo (iluminado) en todas las subrutas de /admin/*
                end={true}
                className={({ isActive }) => `flex items-center gap-3 p-2.5 rounded-md text-sm transition-colors ${isActive
                  ? "bg-app-green text-white"
                  : "text-app-text-light hover:bg-orange-50 hover:text-zinc-900"
                  }`}
              >
                <link.icon className="size-4" /> {link.label}
              </NavLink>
            ))}
          </nav>
        </aside>

        <main className="flex-1 overflow-y-auto no-scrollbar pb-20">
          <Outlet />
        </main>
      </div>
    </div>
  );
}