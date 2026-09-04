import React, { useEffect, useState } from 'react'
import type { Address } from '../types'
import { MapPinIcon, PlusIcon } from 'lucide-react';
import Loading from '../components/Loading';
import AddressCard from '../components/AddressCard';
import AddressForm from '../components/AddressForm';
import { useAuth } from '../context/AuthContext';
import api from '../config/api';
import toast from 'react-hot-toast';

const Adressess = () => {

  const { updateUser } = useAuth();

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    label: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    isDefault: false,
  })

  const resetForm = () => {
    setForm({
      label: "",
      address: "",
      city: "",
      state: "",
      zip: "",
      isDefault: false,
    });
    setShowForm(false);
    setEditingId(null);
  };

  const getLocation = (): Promise<{ lat: number | null, lng: number | null }> => {
    if (!navigator.geolocation) {
      return Promise.resolve({ lat: null, lng: null });
    }

    const locationPromise = new Promise<{ lat: number | null, lng: number | null }>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
        () => resolve({ lat: null, lng: null }),   // En caso de error, continuar sin coords
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
      );
    });

    // Hard timeout: si el navegador no responde en 9s, continuamos sin coords
    const timeoutPromise = new Promise<{ lat: null, lng: null }>((resolve) =>
      setTimeout(() => resolve({ lat: null, lng: null }), 9000)
    );

    return Promise.race([locationPromise, timeoutPromise]);
  }

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const coords = await getLocation();                                        // Obtenemos la ubicacion del usuario
      const payload = { ...form, ...coords };                                    // Creamos el payload con los datos del formulario y la ubicación

      if (editingId) {                                                           // Si hay un ID de edición
        const { data } = await api.put(`/addresses/${editingId}`, payload)       // Actualizamos la dirección en bd
        setAddresses(data.addresses)                                             // Actualizamos el estado 
        updateUser({ addresses: data.addresses })                                // Actualizamos el usuario en el estado localstorage
        toast.success("Address updated successfully")                            // Mostramos un mensaje de éxito
      } else {                                                                   // Si no hay un ID de edición
        const { data } = await api.post(`/addresses`, payload)                   // Creamos la dirección
        setAddresses(data.addresses)                                             // Actualizamos el estado local
        updateUser({ addresses: data.addresses })                                // Actualizamos el usuario en el estado localstorage
        toast.success("Address added successfully")
      }
      resetForm();                                                               // Reiniciamos el formulario
    } catch (error: any) {
      const msg = error?.response?.data?.message || error?.message || "Unexpected error";
      toast.error(msg);
      console.error("handleSubmit error:", error);
    } finally {
      setSubmitting(false);
    }
  };


  const onEditHandler = (address: Address) => {
    setForm({
      label: address.label,
      address: address.address,
      city: address.city,
      state: address.state,
      zip: address.zip,
      isDefault: address.isDefault,
    });
    setEditingId(address.id);
    setShowForm(true);
  };

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    api.get("/addresses", { signal: controller.signal })
      .then(({ data }) => {
        setAddresses(data.addresses);
      })
      .catch((error) => {
        if (error.name === "CanceledError" || error.code === "ERR_CANCELED") {
          console.warn("Request timed out");
          toast.error("Request timed out. Please try again.");
        } else {
          console.error("Error fetching addresses:", error);
          toast.error(error?.response?.data?.message || "Error fetching addresses");
        }
      })
      .finally(() => {
        clearTimeout(timeout);
        setLoading(false);
      });

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, []);


  return (
    <div className='min-h-screen bg-app-cream'>
      <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8'>
        {/* page header */}
        <div className='flex items-center justify-between mb-8'>
          <h1 className='text-2xl font-semibold text-app-green'>My Addresses</h1>
          <button
            onClick={() => { resetForm(); setShowForm(true) }}
            className='px-4 py-2 bg-app-green text-white text-sm font-semibold rounded-xl hover:bg-app-green-light transition-colors flex items-center gap-2'
          >
            <PlusIcon className='size-4' /> Add Address
          </button>
        </div>

        {/* Form Modal */}
        {showForm && <AddressForm
          resetForm={resetForm}
          handleSubmit={handleSubmit}
          form={form}
          setForm={setForm}
          editingId={editingId}
          submitting={submitting}
        />}

        {/* Addresses List */}


        {loading ? (
          <Loading />
        ) : addresses.length === 0 ? (
          <div className='text-center py-16'>
            <MapPinIcon className='size-16 text-app-border mx-auto mb-4' />
            <h2 className='text-lg font-semibold text-app-green mb-2'>No addresses saved</h2>
            <p className='text-sm text-app-text-light'>Add an address for faster checkout</p>
          </div>
        ) : (
          <div className='space-y-4'>
            {addresses.map((add) => (
              <AddressCard
                key={add.id}
                addr={add}
                onEditHandler={onEditHandler}
                setAddresses={setAddresses}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default Adressess