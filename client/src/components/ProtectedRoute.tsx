import { Navigate, Outlet } from "react-router-dom"
import { useAuth } from "../context/AuthContext"
import Loading from "./Loading";



const ProtectedRoute = () => {

  const { user, loading } = useAuth();         // Obtenemos el usuario y el loading del contexto
  if (loading) return <Loading />              // Si esta cargando, muestra el componente Loading
  if (!user) return <Navigate to="/login" />   // Si no hay usuario, redirige al login

  return (
    <Outlet />                                 // Si hay usuario y no esta cargando, muestra el contenido del outlet
  )
}

export default ProtectedRoute