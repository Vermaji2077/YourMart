import { useEffect, useRef, useState } from "react";
import { PackageIcon, NavigationIcon } from "lucide-react";
import OtpModal from "../../components/Delivery/OtpModal";
import CancelModal from "../../components/Delivery/CancelModal";
import DeliveryOrderCard from "../../components/Delivery/DeliveryOrderCard";
import Loading from "../../components/Loading";
import type { Order } from "../../types";
import axios from "axios";
import toast from "react-hot-toast";

/**
 * Panel de control para socios de entrega (repartidores).
 * Gestiona la visualización de pedidos activos y completados mediante pestañas, 
 * permite compartir la ubicación en tiempo real y orquesta los modales para 
 * confirmar entregas (vía OTP) o cancelar pedidos.
 */

const API_URL = import.meta.env.VITE_BASE_URL || "http://localhost:3000/api"

const getAuthHeaders = () => {
  const token = localStorage.getItem("delivery_token");
  return {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };
}


export default function DeliveryDashboard() {

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"active" | "completed">("active");
  const [tracking, setTracking] = useState(false);

  // OTP modal
  const [otpModal, setOtpModal] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Cancel modal
  const [cancelModal, setCancelModal] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const watchIdRef = useRef<number | null>(null);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API_URL}/delivery/my-deliveries?status=${tab}`, getAuthHeaders());
      setOrders(data.orders);
    } catch (error: any) {
      toast.error(error.response.data.message || "Failed to load deliveries");
      console.log(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [tab]);

  // Send location every 10s for active deliveries
  useEffect(() => {                                                                                           // El rastreo solo se activa si se cumplen dos condiciones al inicio del useEffect:
    const activeOrders = orders.filter((o) => ["Assigned", "Packed", "Out for delivery"].includes(o.status))  // Debe haber al menos un pedido en estado activo y el usuario debe haber habilitado el botón de compartir ubicación.
    if (activeOrders.length === 0 || !tracking) {                                                             // Si no se cumple alguna de estas condiciones, el efecto se detiene.
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null
      }
      return
    }

    const sendLocation = async (pos: GeolocationPosition) => {                                                // Función que toma la posición actual (lat, lng) y la envía a la API.
      const { latitude: lat, longitude: lng } = pos.coords                                                      // Descompresión de la posición actual.
      activeOrders.forEach((order) => {                                                                       // Itera sobre cada pedido activo.
        axios.put(`${API_URL}/delivery/my-deliveries/${order.id}/location`, { lat, lng }, getAuthHeaders())     // Envía la posición a la API.
          .catch(() => { })
      })
    }

    watchIdRef.current = navigator.geolocation.watchPosition(                                                 // Inicia el seguimiento de la posición del usuario con una precisión alta y un intervalo de actualización de 10 segundos.
      sendLocation,
      (error) => console.log("Error tracking location", error),
      { enableHighAccuracy: true, maximumAge: 10000 }
    )

    // Also send on interval for more consistent updates
    const interval = setInterval(() => {                                                                      // Se establece un intervalo de 10 segundos para enviar actualizaciones de posición adicionales.
      navigator.geolocation.getCurrentPosition(
        sendLocation,
        () => { },
        { enableHighAccuracy: true }
      )
    }, 10000)

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null
      }
      clearInterval(interval)
    }
  }, [orders, tracking])



  const handleUpdateStatus = async (orderId: string, status: string) => {                                      // Función que actualiza el estado de un pedido.
    try {
      await axios.put(`${API_URL}/delivery/my-deliveries/${orderId}/status`, { status }, getAuthHeaders());
      toast.success(`Status updated to ${status}`);
      fetchOrders();
    } catch (error: any) {
      toast.error(error?.response?.data.message || "Failed to update status");
    }
  };

  const handleComplete = async () => {                                                                          // Función que completa un pedido.
    if (!otpModal || !otp) return;
    setSubmitting(true);
    try {
      await axios.put(`${API_URL}/delivery/my-deliveries/${otpModal}/complete`, { otp }, getAuthHeaders());
      toast.success("Delivery completed");
      setOtpModal(null);
      setOtp("")
      fetchOrders();
    } catch (error: any) {
      toast.error(error?.response?.data.message || error?.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!cancelModal) return;
    setSubmitting(true);
    try {
      await axios.put(`${API_URL}/delivery/my-deliveries/${cancelModal}/cancel`, { reason: cancelReason }, getAuthHeaders());
      toast.success("Delivery cancelled");
      setCancelModal(null);
      setCancelReason("")
      fetchOrders();
    } catch (error: any) {
      toast.error(error?.response?.data.message || "Failed to cancel delivery");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 flex-wrap">
        {(["active", "completed"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`
                        px-4 py-2 text-sm font-medium rounded-xl transition-colors 
                        ${tab === t
                ? "bg-app-green text-white"
                : "bg-white text-zinc-600 hover:bg-app-cream border border-app-border"
              }`
            }
          >
            {t === "active" ? "Active" : "Completed"}
          </button>
        ))}

        <div className="ml-auto">
          <button
            onClick={() => setTracking((prev) => !prev)}
            className={`
                        px-4 py-2 text-sm font-medium rounded-xl transition-colors flex items-center gap-1.5 
                        ${tracking
                ? "bg-green-600 text-white"
                : "bg-white text-zinc-600 border border-app-border hover:bg-app-cream"
              }`
            }
          >
            <NavigationIcon className={`w-3.5 h-3.5 ${tracking ? "animate-pulse" : ""}`} />
            {tracking ? "Sharing Location" : "Share Location"}
          </button>
        </div>
      </div>

      {loading ? (
        <Loading />
      ) : orders.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-app-border">
          <PackageIcon className="size-12 text-app-border mx-auto mb-3" />
          <p className="text-lg font-semibold text-zinc-900 mb-1">No {tab} deliveries</p>
          <p className="text-sm text-zinc-500">{tab === "active" ? "You'll see new assignments here" : "Completed deliveries will appear here"}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => <DeliveryOrderCard key={order.id} order={order} tab={tab} handleUpdateStatus={handleUpdateStatus} setOtpModal={setOtpModal} setCancelModal={setCancelModal} />)}
        </div>
      )}

      {otpModal && (
        <OtpModal
          setOtpModal={setOtpModal}
          otp={otp}
          setOtp={setOtp}
          handleComplete={handleComplete}
          submitting={submitting}
        />
      )}

      {cancelModal && (
        <CancelModal
          setCancelModal={setCancelModal}
          cancelReason={cancelReason}
          setCancelReason={setCancelReason}
          handleCancel={handleCancel}
          submitting={submitting}
        />
      )}
    </div>
  );
}