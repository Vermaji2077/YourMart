import { Truck, X, Zap } from 'lucide-react';
import { useState } from 'react'

const Banner = () => {

  const [bannerVisible, setBannerVisible] = useState<boolean>(() => { // Se muestra un banner solo una vez por sesión del navegador.
    return sessionStorage.getItem('banner_dismissed') !== "true";     // Si existe en sessionStorage -> true, true no cumple la condición -> Rdo false -> no se muestra el banner
  })                                                                  // Si no existe -> null, null cumple la condición -> Rdo true -> se muestra el banner   

  const dismissBanner = () => {                                       // Función para ocultar el banner
    setBannerVisible(false)
    sessionStorage.setItem('banner_dismissed', "true")
  }

  return (
    <div>
      {bannerVisible && (
        <div className='bg-linear-to-r from-app-green via-emerald-800 to-app-green text-white text-xs sm:text-sm relative overflow-hidden'>
          <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex flex-center gap-6'>
            <div className='flex-center gap-2'>
              <Truck className='size-4 shrink-0' />
              <span className='font-medium'>Free delivery on orders above ₹100</span>
            </div>

            <span className='hidden sm:inline text-white/40'> | </span>

            <div className='hidden sm:flex items-center gap-2'>
              <Zap className='size-3.5 fill-yellow-400 text-yellow-400 shrink-0' />
              <span>Farm-fresh produce delivered daily</span>
            </div>
          </div>

          <button
            onClick={dismissBanner}
            className='absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-white/10 rounded-full transition-colors'
          >
            <X className='size-3.5' />
          </button>
        </div>
      )}
    </div>
  )
}

export default Banner