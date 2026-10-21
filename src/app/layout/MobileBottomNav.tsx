import { NavLink, useLocation } from 'react-router-dom';
import { useCart } from '@/features/cart';
import { useAuth } from '@/features/auth';

type TabIconName = 'home' | 'menu' | 'cart' | 'account';

/** Matching outline / solid silhouettes keep selected tabs easy to recognize. */
function TabIcon({ name, active }: { name: TabIconName; active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"
      className={`h-[25px] w-[25px] transition-transform duration-200 motion-reduce:transition-none ${active ? '-translate-y-0.5' : ''}`}
      stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
      {name === 'home' && (active ? <>
        <path d="m3 10 9-7.5 9 7.5v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" fill="currentColor" stroke="currentColor" />
        <path d="M10 10h4" stroke="#fffdf9" />
      </> : <>
        <path d="m2.5 10 9.5-8 9.5 8M4.5 8.5V21H9v-7h6v7h4.5V8.5" />
        <path d="M10 9h4" />
      </>)}
      {name === 'menu' && <>
        <path d="M4 3.5h6a3 3 0 0 1 2 1 3 3 0 0 1 2-1h6v16h-6a3 3 0 0 0-2 1 3 3 0 0 0-2-1H4Z"
          fill={active ? 'currentColor' : 'none'} />
        <g stroke={active ? '#fffdf9' : 'currentColor'}>
          <path d="M12 5v13M7 8h2M7 11h2M15 8h2M15 11h2M15 14h2" />
        </g>
      </>}
      {name === 'cart' && <>
        <path d="M5 7h14l1 14H4Z" fill={active ? 'currentColor' : 'none'} />
        <path d="M8 7V5a4 4 0 0 1 8 0v2" />
        <path d="M9 11a3 3 0 0 0 6 0" stroke={active ? '#fffdf9' : 'currentColor'} />
      </>}
      {name === 'account' && <>
        <circle cx="12" cy="7" r="4" fill={active ? 'currentColor' : 'none'} />
        <path d="M4.5 21v-2a7.5 7.5 0 0 1 15 0v2Z" fill={active ? 'currentColor' : 'none'} />
      </>}
    </svg>
  );
}

/** Primary destinations within thumb reach; checkout stays in the existing drawer. */
export function MobileBottomNav() {
  const { totalCount, isCartOpen } = useCart();
  const { role, user, isLoading } = useAuth();
  const { pathname } = useLocation();
  const cartActive = pathname === '/cart' || isCartOpen;
  const itemClass = (active: boolean) =>
    `relative flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-[#234386] ${active ? 'font-semibold text-[#4D6655]' : 'text-[#85827d] hover:text-[#234386]'}`;
  const iconClass = 'relative flex h-7 w-8 items-center justify-center';
  const accountActive = !isCartOpen && (pathname === '/login' || pathname === '/account' || pathname.startsWith('/account/'));
  const menuActive = !isCartOpen && (pathname === '/menu' || pathname === '/thuc-don');

  return (
    <nav aria-label="Điều hướng chính trên điện thoại"
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-[#234386]/10 bg-[#fffdf9]/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_20px_rgba(35,67,134,0.04)] backdrop-blur-md md:hidden">
      <NavLink to="/" end className={({ isActive }) => itemClass(isActive && !isCartOpen)}>
        {({ isActive }) => <><span className={iconClass}><TabIcon name="home" active={isActive && !isCartOpen} /></span><span>Trang chủ</span></>}
      </NavLink>
      <NavLink to="/menu" className={() => itemClass(menuActive)}
        aria-current={pathname === '/thuc-don' ? 'page' : undefined}>
        <span className={iconClass}><TabIcon name="menu" active={menuActive} /></span><span>Thực đơn</span>
      </NavLink>
      <NavLink to="/cart" className={itemClass(cartActive)}
        aria-label={`Giỏ hàng${totalCount > 0 ? `, ${totalCount} món` : ''}`}>
        <span className={iconClass}><TabIcon name="cart" active={cartActive} />
          {totalCount > 0 && <span aria-hidden="true" className="absolute -top-1 -right-1.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full border-2 border-[#fffdf9] bg-[#ed7328] px-1 text-[9px] font-bold leading-none text-white">{totalCount > 99 ? '99+' : totalCount}</span>}
        </span><span>Giỏ hàng</span>
      </NavLink>
      <NavLink to={role === 'admin' ? '/admin' : !isLoading && !user ? '/login?returnTo=%2Faccount' : '/account'} className={itemClass(accountActive)}>
        <span className={iconClass}><TabIcon name="account" active={accountActive} /></span><span>Tài khoản</span>
      </NavLink>
    </nav>
  );
}
