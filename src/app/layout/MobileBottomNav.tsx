import { NavLink, useLocation } from 'react-router-dom';
import { useCart } from '@/features/cart';
import { useAuth } from '@/features/auth';
import './MobileBottomNav.css';

type TabIconName = 'home' | 'menu' | 'cart' | 'account';

/** Tiger's own 28px icon set: rounded strokes and warm selected details. */
function TabIcon({ name, active }: { name: TabIconName; active: boolean }) {
  const surface = active ? 'currentColor' : 'none';
  return (
    <svg viewBox="0 0 28 28" width="28" height="28" fill="none" aria-hidden="true"
      stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {name === 'home' && <>
        <path d="M6 13v10h16V13" fill={surface} />
        <path className="tiger-bottom-nav__accent" d="m4 10 2.5-5h15L24 10v1a3.3 3.3 0 0 1-5 2.8 3.3 3.3 0 0 1-5 0 3.3 3.3 0 0 1-5 0A3.3 3.3 0 0 1 4 11Z" fill={surface} />
        <path className="tiger-bottom-nav__detail" d="M11 23v-6h6v6" fill={active ? '#fffdf9' : 'none'} />
        <path className="tiger-bottom-nav__detail" d="M10 5 9 10m9-5 1 5" />
      </>}
      {name === 'menu' && <>
        <path d="M14 7c-2.5-2-6-2.5-10-1v17c4-1.5 7.5-1 10 1 2.5-2 6-2.5 10-1V6c-4-1.5-7.5-1-10 1Z" fill={surface} />
        <path className="tiger-bottom-nav__detail" d="M14 7v17m4-13h3m-3 4h3m-3 4h2" />
        <path className="tiger-bottom-nav__accent" d="M7 14h4a2 2 0 0 1-4 0Zm1-4 1-1m1 2 1-1" />
      </>}
      {name === 'cart' && <>
        <path d="M6.5 9h15L23 24H5Z" fill={surface} />
        <path d="M10 10V7a4 4 0 0 1 8 0v3" />
        <path className="tiger-bottom-nav__accent" d="m10 15 2 2m1-3 2 2m1-3 2 2" />
        <path className="tiger-bottom-nav__detail" d="M11 20h6" />
      </>}
      {name === 'account' && <>
        <circle className="tiger-bottom-nav__accent" cx="14" cy="9" r="4.5" fill={surface} />
        <path d="M5.5 24v-1.5a8.5 8.5 0 0 1 17 0V24Z" fill={surface} />
        <path className="tiger-bottom-nav__detail" d="M11.5 19a4.2 4.2 0 0 0 5 0" />
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
  const accountActive = !isCartOpen && (pathname === '/login' || pathname === '/account' || pathname.startsWith('/account/'));
  const menuActive = !isCartOpen && (pathname === '/menu' || pathname === '/thuc-don');

  const homeActive = pathname === '/' && !isCartOpen;

  return (
    <nav aria-label="Điều hướng chính trên điện thoại" className="tiger-bottom-nav">
      <NavLink to="/" end className="tiger-bottom-nav__item" data-active={homeActive}>
        <span className="tiger-bottom-nav__icon"><TabIcon name="home" active={homeActive} /></span>
        <span>Trang chủ</span>
      </NavLink>
      <NavLink to="/menu" className="tiger-bottom-nav__item" data-active={menuActive}
        aria-current={pathname === '/thuc-don' ? 'page' : undefined}>
        <span className="tiger-bottom-nav__icon"><TabIcon name="menu" active={menuActive} /></span>
        <span>Thực đơn</span>
      </NavLink>
      <NavLink to="/cart" className="tiger-bottom-nav__item" data-active={cartActive}
        aria-label={`Giỏ hàng${totalCount > 0 ? `, ${totalCount} món` : ''}`}>
        <span className="tiger-bottom-nav__icon"><TabIcon name="cart" active={cartActive} />
          {totalCount > 0 && <span aria-hidden="true" className="tiger-bottom-nav__badge">{totalCount > 99 ? '99+' : totalCount}</span>}
        </span>
        <span>Giỏ hàng</span>
      </NavLink>
      <NavLink to={role === 'admin' ? '/admin' : !isLoading && !user ? '/login?returnTo=%2Faccount' : '/account'}
        className="tiger-bottom-nav__item" data-active={accountActive}>
        <span className="tiger-bottom-nav__icon"><TabIcon name="account" active={accountActive} /></span>
        <span>Tài khoản</span>
      </NavLink>
    </nav>
  );
}
