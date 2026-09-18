import { useState, useEffect } from "react";

import { TruckIcon } from "lucide-react";

import toast from "react-hot-toast";

import type { DeliveryPartner } from "../../types";

import Loading from "../../components/Loading";

import OtpModal from "../../components/Delivery/OtpModal";

import api from "../../config/api";

/**
 * @component
 */

export default function AdminOrders() {
  const currency = import.meta.env.VITE_CURRENCY_SYMBOL || "$";

  const [orders, setOrders] = useState<any[]>([]);
  const [partners, setPartners] = useState<DeliveryPartner[]>([]);
  const [loading, setLoading] = useState(true);

  // Assign delivery partner modal
  const [assignModal, setAssignModal] = useState<string | null>(null);
  const [selectedPartner, setSelectedPartner] = useState("");

  // OTP modal
  const [otpModal, setOtpModal] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // =========================
  // FETCH ORDERS
  // =========================
  const fetchOrders = async () => {
    try {
      const { data } = await api.get("/orders/all");

      setOrders(data.orders);
    } catch (error: any) {
      toast.error(
        error.response?.data?.message || "Failed to load orders"
      );
    } finally {
      setLoading(false);
    }
  };

  // =========================
  // FETCH DELIVERY PARTNERS
  // =========================
  const fetchPartners = async () => {
    try {
      const { data } = await api.get("/admin/delivery-partners");

      setPartners(
        data.filter((p: DeliveryPartner) => p.isActive)
      );
    } catch (error: any) {
      console.log(error);
    }
  };

  // =========================
  // INITIAL LOAD
  // =========================
  useEffect(() => {
    fetchOrders();
    fetchPartners();
  }, []);

  // =========================
  // STATUS CHANGE
  // =========================
  const handleStatusChange = async (
    id: string,
    newStatus: string
  ) => {
    /*
     * IMPORTANT:
     * Delivered requires OTP verification.
     *
     * Do NOT directly call the normal status API here.
     */
    if (newStatus === "Delivered") {
      setOtpModal(id);
      setOtp("");
      return;
    }

    const previous = orders;

    // Optimistic UI update
    setOrders((prev) =>
      prev.map((o) =>
        o.id === id
          ? {
              ...o,
              status: newStatus,
            }
          : o
      )
    );

    try {
      await api.put(`/orders/${id}/status`, {
        status: newStatus,
      });

      toast.success("Order status updated successfully");
    } catch (error: any) {
      // Restore previous orders if request fails
      setOrders(previous);

      toast.error(
        error.response?.data?.message ||
          "Failed to update order status"
      );
    }
  };

  // =========================
  // VERIFY DELIVERY OTP
  // =========================
  const handleComplete = async () => {
    if (!otpModal) return;

    if (otp.length !== 6) {
      toast.error("Please enter a 6-digit OTP");
      return;
    }

    setSubmitting(true);

    try {
      /*
       * Backend should:
       * 1. Find the order
       * 2. Compare the OTP with order.deliveryOtp
       * 3. If correct, mark order as Delivered
       * 4. If incorrect, reject the request
       */
      await api.put(
        `/orders/${otpModal}/verify-delivery-otp`,
        {
          otp,
        }
      );

      toast.success("Order delivered successfully");

      // Close OTP modal
      setOtpModal(null);
      setOtp("");

      // Refresh orders from backend
      await fetchOrders();
    } catch (error: any) {
      toast.error(
        error.response?.data?.message ||
          "Invalid OTP"
      );
    } finally {
      setSubmitting(false);
    }
  };

  // =========================
  // ASSIGN DELIVERY PARTNER
  // =========================
  const handleAssign = async () => {
    if (!assignModal || !selectedPartner) return;

    try {
      await api.put(
        `/admin/orders/${assignModal}/assign`,
        {
          partnerId: selectedPartner,
        }
      );

      toast.success(
        "Delivery partner assigned successfully"
      );

      setAssignModal(null);
      setSelectedPartner("");

      fetchOrders();
    } catch (error: any) {
      console.log(error);

      toast.error(
        error.response?.data?.message ||
          "Failed to assign delivery partner"
      );
    }
  };

  // =========================
  // STATUS OPTIONS
  // =========================
  const statusOptions = [
    "Placed",
    "Confirmed",
    "Assigned",
    "Packed",
    "Out for Delivery",
    "Delivered",
    "Cancelled",
  ];

  // =========================
  // STATUS COLORS
  // =========================
  const statusColors: any = {
    Placed: "bg-blue-100 text-blue-800",

    Confirmed:
      "bg-amber-100 text-amber-800",

    Assigned:
      "bg-indigo-100 text-indigo-800",

    Packed:
      "bg-cyan-100 text-cyan-800",

    "Out for Delivery":
      "bg-purple-100 text-purple-800",

    Delivered:
      "bg-green-100 text-green-800",

    Cancelled:
      "bg-red-100 text-red-800",
  };

  // =========================
  // LOADING
  // =========================
  if (loading) {
    return <Loading />;
  }

  // =========================
  // UI
  // =========================
  return (
    <>
      {/* =========================
          ORDERS TABLE
      ========================= */}
      <div className="bg-white rounded-2xl shadow-sm border border-app-border overflow-hidden">
        {/* HEADER */}
        <div className="px-6 py-5 border-b border-app-border">
          <h2 className="text-xl font-semibold text-zinc-900">
            Orders
          </h2>
        </div>

        {/* TABLE */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">

            {/* TABLE HEADER */}
            <thead className="bg-app-cream/50 text-zinc-500 uppercase text-xs font-semibold">
              <tr>
                <th className="px-6 py-4">
                  Order Details
                </th>

                <th className="px-6 py-4">
                  Customer
                </th>

                <th className="px-6 py-4">
                  Total
                </th>

                <th className="px-6 py-4">
                  Delivery Partner
                </th>

                <th className="px-6 py-4">
                  Status
                </th>
              </tr>
            </thead>

            {/* TABLE BODY */}
            <tbody className="divide-y divide-app-border">

              {/* NO ORDERS */}
              {orders.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-8 text-center text-zinc-500"
                  >
                    No orders found.
                  </td>
                </tr>
              ) : (
                orders.map((order: any) => (
                  <tr
                    key={order.id}
                    className="hover:bg-zinc-50/50 transition-colors"
                  >

                    {/* =========================
                        ORDER DETAILS
                    ========================= */}
                    <td className="px-6 py-4">
                      <p className="font-semibold text-zinc-900">
                        #{order.id.slice(-8)}
                      </p>

                      <p className="text-xs text-zinc-500">
                        {new Date(
                          order.createdAt
                        ).toLocaleString()}
                      </p>
                    </td>

                    {/* =========================
                        CUSTOMER
                    ========================= */}
                    <td className="px-6 py-4">
                      <p className="font-medium text-zinc-900">
                        {order.user?.name ||
                          "Unknown User"}
                      </p>

                      <p className="text-xs text-zinc-500">
                        {order.user?.email ||
                          "No email"}
                      </p>
                    </td>

                    {/* =========================
                        TOTAL
                    ========================= */}
                    <td className="px-6 py-4 font-medium">
                      {currency}
                      {order.total.toFixed(2)}
                    </td>

                    {/* =========================
                        DELIVERY PARTNER
                    ========================= */}
                    <td className="px-6 py-4">
                      {order.deliveryPartner ? (
                        <div className="flex items-center gap-2">

                          <div className="size-6 rounded-full bg-app-green flex-center">
                            <span className="text-white text-[10px] font-semibold">
                              {order.deliveryPartner.name?.charAt(
                                0
                              )}
                            </span>
                          </div>

                          <div>
                            <p className="text-xs font-medium text-zinc-900">
                              {order.deliveryPartner.name}
                            </p>

                            <p className="text-[10px] text-zinc-500">
                              {order.deliveryPartner.phone}
                            </p>
                          </div>

                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setAssignModal(order.id);
                            setSelectedPartner("");
                          }}
                          className="px-3 py-1.5 text-xs font-medium bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-colors flex items-center gap-1"
                        >
                          <TruckIcon className="size-3" />

                          Assign
                        </button>
                      )}
                    </td>

                    {/* =========================
                        STATUS
                    ========================= */}
                    <td className="px-6 py-4">
                      <select
                        value={order.status}
                        onChange={(e) =>
                          handleStatusChange(
                            order.id,
                            e.target.value
                          )
                        }
                        className={`
                          px-3 py-1.5 rounded-lg text-xs font-semibold
                          border-r-8 border-transparent
                          outline-none cursor-pointer leading-tight
                          ${
                            statusColors[
                              order.status
                            ] ||
                            "bg-zinc-100 text-zinc-800"
                          }
                        `}
                      >
                        {statusOptions.map(
                          (status) => (
                            <option
                              key={status}
                              value={status}
                            >
                              {status}
                            </option>
                          )
                        )}
                      </select>
                    </td>

                  </tr>
                ))
              )}

            </tbody>
          </table>
        </div>
      </div>

      {/* =========================
          ASSIGN DELIVERY PARTNER MODAL
      ========================= */}
      {assignModal && (
        <>
          {/* BACKDROP */}
          <div
            className="fixed inset-0 bg-app-cream/80 backdrop-blur z-50"
            onClick={() =>
              setAssignModal(null)
            }
          />

          {/* MODAL CONTAINER */}
          <div className="fixed inset-0 z-50 flex-center p-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm animate-fade-in">

              <h3 className="text-lg font-semibold text-app-green mb-4">
                Assign Delivery Partner
              </h3>

              {/* NO PARTNERS */}
              {partners.length === 0 ? (
                <p className="text-sm text-zinc-500 mb-4">
                  No active delivery partners.
                  Please onboard a partner first.
                </p>
              ) : (

                /* PARTNER LIST */
                <div className="space-y-2 mb-5 max-h-60 overflow-y-auto">
                  {partners.map(
                    (p: DeliveryPartner) => (
                      <label
                        key={p.id}
                        className={`
                          flex items-center gap-3 p-3 rounded-xl
                          border cursor-pointer transition-colors
                          ${
                            selectedPartner === p.id
                              ? "border-app-green bg-app-green/5"
                              : "border-app-border hover:bg-app-cream"
                          }
                        `}
                      >

                        {/* RADIO */}
                        <input
                          type="radio"
                          name="partner"
                          value={p.id}
                          checked={
                            selectedPartner ===
                            p.id
                          }
                          onChange={() =>
                            setSelectedPartner(
                              p.id
                            )
                          }
                          className="text-app-green"
                        />

                        {/* AVATAR */}
                        <div className="size-8 rounded-full bg-app-green flex-center">
                          <span className="text-white text-xs font-semibold">
                            {p.name.charAt(0)}
                          </span>
                        </div>

                        {/* DETAILS */}
                        <div>
                          <p className="text-sm font-medium text-zinc-900">
                            {p.name}
                          </p>

                          <p className="text-xs text-zinc-500 capitalize">
                            {p.vehicleType} •{" "}
                            {p.phone}
                          </p>
                        </div>

                      </label>
                    )
                  )}
                </div>
              )}

              {/* BUTTONS */}
              <div className="flex gap-2">

                <button
                  onClick={() =>
                    setAssignModal(null)
                  }
                  className="flex-1 py-2.5 text-sm font-medium text-zinc-600 bg-zinc-100 rounded-xl hover:bg-zinc-200 transition-colors"
                >
                  Cancel
                </button>

                <button
                  onClick={handleAssign}
                  disabled={!selectedPartner}
                  className="flex-1 py-2.5 text-sm font-medium text-white bg-app-green rounded-xl hover:bg-app-green-light transition-colors disabled:opacity-50"
                >
                  Assign
                </button>

              </div>
            </div>
          </div>
        </>
      )}

      {/* =========================
          OTP MODAL
      ========================= */}
      {otpModal && (
        <OtpModal
          setOtpModal={setOtpModal}
          otp={otp}
          setOtp={setOtp}
          handleComplete={handleComplete}
          submitting={submitting}
        />
      )}
    </>
  );
}