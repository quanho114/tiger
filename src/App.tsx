import { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { HeroSection } from './components/HeroSection';
import { HighlightStrip } from './components/HighlightStrip';
import { FeaturedDishesSection } from './components/FeaturedDishesSection';
import { MenuSection } from './components/MenuSection';
import { ReservationSection } from './components/ReservationSection';
import { LocationSection } from './components/LocationSection';
import { Footer } from './components/Footer';
import { CartDrawer, type CartItem } from './components/CartDrawer';
import type { MenuItem } from './data/restaurantData';
import { ArrowRight } from 'lucide-react';

export default function App() {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [addedNotificationDishId, setAddedNotificationDishId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string>('home');
  const [reservationDishNote, setReservationDishNote] = useState<string>('');

  // Cart operations
  const handleAddToCart = (dish: MenuItem) => {
    setCartItems((prev) => {
      const existing = prev.find((item) => item.dish.id === dish.id);
      if (existing) {
        return prev.map((item) =>
          item.dish.id === dish.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { dish, quantity: 1 }];
    });

    // Visual feedback trigger
    setAddedNotificationDishId(dish.id);
    setTimeout(() => {
      setAddedNotificationDishId(null);
    }, 1800);
  };

  const handleUpdateQuantity = (dishId: string, delta: number) => {
    setCartItems((prev) => {
      return prev
        .map((item) => {
          if (item.dish.id === dishId) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[];
    });
  };

  const handleRemoveItem = (dishId: string) => {
    setCartItems((prev) => prev.filter((item) => item.dish.id !== dishId));
  };

  const handleClearCart = () => {
    setCartItems([]);
  };

  // Scroll navigation helpers
  const scrollToSection = (sectionId: string) => {
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleBookTableForDish = (dishName: string) => {
    setReservationDishNote(`Thực khách mong muốn thưởng thức món: ${dishName}`);
    scrollToSection('reservation');
  };

  // Intersection observer to track active section for header
  useEffect(() => {
    const sections = ['home', 'menu', 'reservation', 'location'];
    const handleScroll = () => {
      const scrollPos = window.scrollY + 180;
      for (const sectionId of sections) {
        const el = document.getElementById(sectionId);
        if (el) {
          const top = el.offsetTop;
          const height = el.offsetHeight;
          if (scrollPos >= top && scrollPos < top + height) {
            setActiveSection(sectionId);
            break;
          }
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const totalCartCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);
  const cartSubtotal = cartItems.reduce((acc, item) => acc + item.dish.price * item.quantity, 0);

  return (
    <div className="min-h-screen bg-[#fbf9f6] text-[#000000] font-body selection:bg-[#ffc400] selection:text-[#234386] relative">
      
      {/* Header */}
      <Header
        cartCount={totalCartCount}
        onOpenCart={() => setIsCartOpen(true)}
        activeSection={activeSection}
      />

      {/* Main Content */}
      <main>
        {/* Section 2: Hero */}
        <HeroSection
          onExploreMenu={() => scrollToSection('menu')}
          onBookTable={() => scrollToSection('reservation')}
        />

        {/* Section 3: Highlight Strip */}
        <HighlightStrip />

        {/* Section 4: Featured Dishes */}
        <FeaturedDishesSection
          onAddToCart={handleAddToCart}
          onNavigateToMenu={() => scrollToSection('menu')}
          addedItemId={addedNotificationDishId}
        />

        {/* Section 5: Menu Experience (Core Section) */}
        <MenuSection
          onAddToCart={handleAddToCart}
          onBookTableForDish={handleBookTableForDish}
          addedItemId={addedNotificationDishId}
        />

        {/* Section 6: Reservation */}
        <ReservationSection prefilledNote={reservationDishNote} />

        {/* Section 7: Location / Contact */}
        <LocationSection />
      </main>

      {/* Section 8: Footer */}
      <Footer />

      {/* Cart Drawer for Delivery Mode */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cartItems={cartItems}
        onUpdateQuantity={handleUpdateQuantity}
        onRemoveItem={handleRemoveItem}
        onClearCart={handleClearCart}
      />

      {/* Floating Bottom Cart Bar (appears when items are in cart and cart is closed) */}
      {totalCartCount > 0 && !isCartOpen && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-[90%] max-w-md animate-in slide-in-from-bottom-6 duration-300">
          <button
            type="button"
            onClick={() => setIsCartOpen(true)}
            className="w-full bg-[#ed7328] hover:bg-[#d86218] text-white p-3.5 sm:p-4 rounded-full shadow-2xl flex items-center justify-between border-2 border-white/80 transition-all hover:scale-[1.02]"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-semibold text-xs">
                {totalCartCount}
              </div>
              <span className="font-semibold text-xs sm:text-sm">
                Giỏ hàng giao tận nơi
              </span>
            </div>
            <div className="flex items-center gap-2 font-['Be_Vietnam_Pro',sans-serif] font-semibold text-sm sm:text-base">
              <span>{cartSubtotal.toLocaleString('vi-VN')} đ</span>
              <ArrowRight size={18} />
            </div>
          </button>
        </div>
      )}

    </div>
  );
}
