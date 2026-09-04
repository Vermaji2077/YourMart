import { createContext, useContext, useEffect, useState } from "react";
import type { User } from "../types";
import { useNavigate } from "react-router-dom";
import api from "../config/api";
import toast from "react-hot-toast";

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  updateUser: (userData: Partial<User>) => void; // Partial es una utilidad de TS que permite crear un tipo con solo algunas propiedades del tipo original
}


const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {

  const navigate = useNavigate()
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {                                                  // Se ejecuta al cargar la aplicacion
    const savedToken = localStorage.getItem("auth_token")          // Obtiene el token del localStorage
    const savedUser = localStorage.getItem("auth_user")            // Obtiene el usuario del localStorage

    if (savedToken && savedUser) {                                 // Si hay token y usuario
      setToken(savedToken)                                       // lo establece como estado local.
      setUser(JSON.parse(savedUser))
    }
    setLoading(false)
  }, []);

  const login = async (email: string, password: string) => {
    try {
      setLoading(true)
      const { data } = await api.post("/auth/login", { email, password })
      setUser(data.user)
      setToken(data.token)
      localStorage.setItem("auth_token", data.token)
      localStorage.setItem("auth_user", JSON.stringify(data.user))
      toast.success("Login successful")
      navigate("/")
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const register = async (name: string, email: string, password: string) => {
    try {
      setLoading(true)
      const { data } = await api.post("/auth/register", { name, email, password })
      setUser(data.user)
      setToken(data.token)
      localStorage.setItem("auth_token", data.token)
      localStorage.setItem("auth_user", JSON.stringify(data.user))
      toast.success("Registration successful")
      navigate("/")
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const logout = () => {
    setUser(null);
    setToken(null)
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
  }

  const updateUser = (userData: Partial<User>) => {                        // Se crea la funcion updateUser que actualiza el usuario
    if (user) {                                                            // Si hay usuario
      const updatedUser = { ...user, ...userData }                         // Se crea un nuevo objeto con los datos actualizados
      setUser(updatedUser);                                                // Se actualiza el estado local
      localStorage.setItem("auth_user", JSON.stringify(updatedUser))       // Se actualiza el localStorage
    }
  }


  return <AuthContext.Provider value={{ user, token, login, register, logout, updateUser, loading }}>
    {children}
  </AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth must be used within AuthProvider")
  return context
}