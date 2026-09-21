import { useEffect, Suspense, lazy } from 'react';
import type { FC, ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { CartDrawer } from './components/CartDrawer';
import { StickyCartBar } from './components/StickyCartBar';
import { ContactHub } from './components/ContactHub';
import { CartProvider } from './store/CartProvider';
import { useCart } from './store/cart';
import { AppProviders } from './app/providers';
import { HomePage } from './pages/HomePage';
import { MenuPage } from './pages/MenuPage';
import { ReservationPage } from './pages/ReservationPage';
import { LocationPage } from './pages/LocationPage';
import { TableResolvePage } from './features/table-session';
import { LoginPage, AuthCallbackPage } from './features/auth';
import { ErrorBoundary } from './components/ErrorBoundary';

// Protected Customer Account Routes (lazy loaded for bundle efficiency)
import { CustomerRouteGuard } from './features/account/CustomerRouteGuard';
const AccountLayout = lazy(() => import('./features/account/AccountLayout').then((m) => ({ default: m.AccountLayout })));
const AccountOverviewPage = lazy(() => import('./features/account/AccountOverviewPage').then((m) => ({ default: m.AccountOverviewPage })));
const AccountOrdersPage = lazy(() => import('./features/account/AccountOrdersPage').then((m) => ({ default: m.AccountOrdersPage })));
const AccountReservationsPage = lazy(() => import('./features/account/AccountReservationsPage').then((m) => ({ default: m.AccountReservationsPage })));
const AccountAddressesPage = lazy(() => import('./features/account/AccountAddressesPage').then((m) => ({ default: m.AccountAddressesPage })));
const AccountFavoritesPage = lazy(() => import('./features/account/AccountFavoritesPage').then((m) => ({ default: m.AccountFavoritesPage })));
const AccountProfilePage = lazy(() => import('./features/account/AccountProfilePage').then((m) => ({ default: m.AccountProfilePage })));

// Protected Admin Routes (lazy loaded for bundle efficiency)
import { AdminRouteGuard } from './features/admin/auth/AdminRouteGuard';
const AdminLoginPage = lazy(() => import('./features/admin/auth/AdminLoginPage').then((m) => ({ default: m.AdminLoginPage })));
const AdminLayout = lazy(() => import('./features/admin/layout/AdminLayout').then((m) => ({ default: m.AdminLayout })));
const AdminDashboardPage = lazy(() => import('./features/admin/dashboard/AdminDashboardPage').then((m) => ({ default: m.AdminDashboardPage })));
const AdminOrdersPage = lazy(() => import('./features/admin/orders/AdminOrdersPage').then((m) => ({ default: m.AdminOrdersPage })));
const AdminTablesPage = lazy(() => import('./features/admin/tables/AdminTablesPage').then((m) => ({ default: m.AdminTablesPage })));
const AdminReservationsPage = lazy(() => import('./features/admin/reservations/AdminReservationsPage').then((m) => ({ default: m.AdminReservationsPage })));
const AdminInvoicesPage = lazy(() => import('./features/admin/invoices/AdminInvoicesPage').then((m) => ({ default: m.AdminInvoicesPage })));
const AdminMenuPage = lazy(() => import('./features/admin/menu/AdminMenuPage').then((m) => ({ default: m.AdminMenuPage })));
const AdminReportsPage = lazy(() => import('./features/admin/reports/AdminReportsPage').then((m) => ({ default: m.AdminReportsPage })));
const AdminAccountsPage = lazy(() => import('./features/admin/accounts/AdminAccountsPage').then((m) => ({ default: m.AdminAccountsPage })));
const AdminSettingsPage = lazy(() => import('./features/admin/settings/AdminSettingsPage').then((m) => ({ default: m.AdminSettingsPage })));

const RouteFallback: FC = () => (
  <div className="flex items-center justify-center min-h-[40vh] py-12">
    <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin" />
  </div>
);

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

const PublicShell: FC = () => {
  const { cartItems, updateQty, remove, clear, isCartOpen, setCartOpen } = useCart();

  return (
    <div className="min-h-screen bg-[#fbf9f6] text-[#000000] font-body selection:bg-[#ffc400] selection:text-[#234386] relative">
      <Header />

      <main>
        <PageTransition>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/menu" element={<MenuPage />} />
            <Route path="/thuc-don" element={<MenuPage />} />
            <Route path="/table/:token" element={<TableResolvePage />} />
            <Route path="/reservation" element={<ReservationPage />} />
            <Route path="/reservations" element={<ReservationPage />} />
            <Route path="/location" element={<LocationPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/auth/callback" element={<AuthCallbackPage />} />
            {/* Protected Customer Account Routes */}
            <Route
              path="/account"
              element={
                <CustomerRouteGuard>
                  <Suspense fallback={<RouteFallback />}>
                    <AccountLayout />
                  </Suspense>
                </CustomerRouteGuard>
              }
            >
              <Route index element={<Suspense fallback={<RouteFallback />}><AccountOverviewPage /></Suspense>} />
              <Route path="orders" element={<Suspense fallback={<RouteFallback />}><AccountOrdersPage /></Suspense>} />
              <Route path="reservations" element={<Suspense fallback={<RouteFallback />}><AccountReservationsPage /></Suspense>} />
              <Route path="addresses" element={<Suspense fallback={<RouteFallback />}><AccountAddressesPage /></Suspense>} />
              <Route path="favorites" element={<Suspense fallback={<RouteFallback />}><AccountFavoritesPage /></Suspense>} />
              <Route path="profile" element={<Suspense fallback={<RouteFallback />}><AccountProfilePage /></Suspense>} />
            </Route>
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
      <ContactHub />
    </div>
  );
};

const AppRoutes: FC = () => {
  return (
    <>
      <ScrollToTop />
      <Routes>
        {/* Admin Login Route (No Public Shell, No Guard) */}
        <Route
          path="/admin/login"
          element={
            <ErrorBoundary fallbackTitle="Lỗi trang Đăng nhập Quản trị">
              <Suspense fallback={<RouteFallback />}>
                <AdminLoginPage />
              </Suspense>
            </ErrorBoundary>
          }
        />

        {/* Protected Admin Routes (Isolated Layout, No Public Shell) */}
        <Route
          path="/admin"
          element={
            <ErrorBoundary fallbackTitle="Lỗi Hệ thống Quản trị">
              <AdminRouteGuard>
                <Suspense fallback={<RouteFallback />}>
                  <AdminLayout />
                </Suspense>
              </AdminRouteGuard>
            </ErrorBoundary>
          }
        >
          <Route index element={<Suspense fallback={<RouteFallback />}><AdminDashboardPage /></Suspense>} />
          <Route path="orders" element={<Suspense fallback={<RouteFallback />}><AdminOrdersPage /></Suspense>} />
          <Route path="reservations" element={<Suspense fallback={<RouteFallback />}><AdminReservationsPage /></Suspense>} />
          <Route path="tables" element={<Suspense fallback={<RouteFallback />}><AdminTablesPage /></Suspense>} />
          <Route path="invoices" element={<Suspense fallback={<RouteFallback />}><AdminInvoicesPage /></Suspense>} />
          <Route path="menu" element={<Suspense fallback={<RouteFallback />}><AdminMenuPage /></Suspense>} />
          <Route path="reports" element={<Suspense fallback={<RouteFallback />}><AdminReportsPage /></Suspense>} />
          <Route path="accounts" element={<Suspense fallback={<RouteFallback />}><AdminAccountsPage /></Suspense>} />
          <Route path="settings" element={<Suspense fallback={<RouteFallback />}><AdminSettingsPage /></Suspense>} />
        </Route>

        {/* Public Customer Shell & Routes */}
        <Route path="/*" element={<PublicShell />} />
      </Routes>
    </>
  );
};

export default function App() {
  return (
    <BrowserRouter>
      <AppProviders>
        <CartProvider>
          <AppRoutes />
        </CartProvider>
      </AppProviders>
    </BrowserRouter>
  );
}

