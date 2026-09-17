import { useEffect } from 'react';
import type { FC, ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { CartDrawer } from './components/CartDrawer';
import { StickyCartBar } from './components/StickyCartBar';
import { CartProvider } from './store/CartProvider';
import { useCart } from './store/cart';
import { HomePage } from './pages/HomePage';
import { MenuPage } from './pages/MenuPage';
import { ReservationPage } from './pages/ReservationPage';
import { LocationPage } from './pages/LocationPage';

/** Calm route change: start at top on every navigation. */
const ScrollToTop: FC = () => {
  const { pathname, search } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [pathname, search]);
  return null;
};

/** Subtle page transition wrapper (replays per route). */
const PageTransition: FC<{ children: ReactNode }> = ({ children }) => {
  const { pathname } = useLocation();
  return (
    <div key={pathname} className="page-enter">
      {children}
    </div>
  );
};

const Shell: FC = () => {
  const { cartItems, updateQty, remove, clear, isCartOpen, setCartOpen } = useCart();

  return (
    <div className="min-h-screen bg-[#fbf9f6] text-[#000000] font-body selection:bg-[#ffc400] selection:text-[#234386] relative">
      <ScrollToTop />
      <Header />

      <main>
        <PageTransition>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/menu" element={<MenuPage />} />
            <Route path="/reservation" element={<ReservationPage />} />
            <Route path="/location" element={<LocationPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </PageTransition>
      </main>

      <Footer />

      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setCartOpen(false)}
        cartItems={cartItems}
        onUpdateQuantity={updateQty}
        onRemoveItem={remove}
        onClearCart={clear}
      />

      <StickyCartBar />
    </div>
  );
};

export default function App() {
  return (
    <BrowserRouter>
      <CartProvider>
        <Shell />
      </CartProvider>
    </BrowserRouter>
  );
}
