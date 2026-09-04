
import { Outlet } from 'react-router-dom'
import Banner from '../components/Banner'
import NavbarComponent from '../components/NavbarComponent'
import Footer from '../components/Footer'
import CartSidebar from '../components/Home/CartSidebar'

const Applayout = () => {
  return (
    <>
      <Banner />
      <NavbarComponent />

      <main className='min-h-screen'>
        <Outlet />
      </main>

      <Footer />
      <CartSidebar />
    </>
  )
}

export default Applayout