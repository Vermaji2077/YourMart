import axios from "axios";

const api = axios.create({
    baseURL: import.meta.env.VITE_BASE_URL || 'http://localhost:3000/api'
})

// Inject JWT token from localStorage into every request
api.interceptors.request.use(config => {                         // Esta es una funcion que se ejecuta antes de cada peticion
    const token = localStorage.getItem('auth_token')             // Obtiene el token del localStorage
    if (token) {                                                 // Si hay token,
        config.headers.Authorization = `Bearer ${token}`         // agregar el token al header de la peticion
    }
    return config
});

// Handle auth errors globally
api.interceptors.response.use(                                   // Esta es una funcion que se ejecuta antes de cada respuesta
    (response) => response,                                        // Si la respuesta es exitosa, la devuelve
    (error) => {                                                   // Si hay un error,
        if (error.response?.status === 401) {                        // y es 401,
            localStorage.removeItem("auth_token");                   // elimina el token
            localStorage.removeItem("auth_user");                    // elimina el usuario
            // Only redirect if not already on auth pages
            if (!window.location.pathname.includes("/login") && !window.location.pathname.includes("/register")) { // si no esta en login o register,
                window.location.href = "/login";                                                                 // lo redirige a login
            }
        }

        return Promise.reject(error);                                                                            // y finalmentedevuelve el error
    }
)

export default api;                                                                                              // exporta la instancia de axios