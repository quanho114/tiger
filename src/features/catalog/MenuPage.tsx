/**
 * Importers/Callers: src/routes.tsx, router configuration
 * Affected API: CatalogContext consumption in MenuPage
 * Data schemas: Category, MenuItem, OrderMode
 * User verbatim instruction: "Không thể tải danh mục món ăn - Lỗi hệ thống (502)" / "ủa sao tên món lạ z ko giống tui đưa á"
 */
import { memo, useCallback, useState, useMemo, useRef, useEffect, useContext } from 'react';
import type { FC } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import {
  Utensils,
  Bike,
  Search,
  Plus,
  Minus,
  Heart,
  Clock,
  ChevronLeft,
  ChevronRight,
  Wine,
  Calendar,
  QrCode,
  ShoppingBag,
  AlertCircle,
  RefreshCw,
  MapPin,
  Loader2,
  ArrowRight,
  X,
  Info
} from 'lucide-react';
import { toLegacyMenuItem, type MenuItem } from '@/features/catalog/legacyMenuItem';
import { DishImage } from '@/features/catalog/components/DishImage';
import { normalizeVietnamese } from '@/shared/lib/normalizeVietnamese';
import { useCatalog, CatalogContext } from '@/features/catalog';
import { useCart } from '@/features/cart';
import { useTableSession, type TableSession } from '@/features/table-session';
import { Dialog } from '@/shared/ui/Dialog';
import { Field } from '@/shared/ui/Field';
import { useAuth } from '@/features/auth';
import { useConciergeSession } from '@/features/concierge/ConciergeProvider';
import { FALLBACK_DELIVERY_ZONES } from '@/features/ordering/delivery/zones';
import { useMenuFavorites } from './useMenuFavorites';
import { useVisibleMenuItems } from './useVisibleMenuItems';

type OrderMode = 'dine-in' | 'delivery' | 'takeaway';

const orderModeOptions = [
  { value: 'dine-in', label: 'Tại quán', icon: Utensils },
  { value: 'delivery', label: 'Giao tận nơi', icon: Bike },
  { value: 'takeaway', label: 'Mang đi', icon: ShoppingBag },
] as const;

function extractQrToken(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/\/table\/([^/?#\s]+)/);
  return match ? match[1] : trimmed;
}

function featuredPrice(dish: MenuItem): string {
  if (dish.pricing_mode === 'market') return 'Theo thời giá';
  if (dish.pricing_mode === 'unknown') return 'Liên hệ';
  if (dish.pricing_mode === 'range') {
    return `${(dish.price_min ?? dish.price).toLocaleString('vi-VN')} – ${(dish.price_max ?? dish.price).toLocaleString('vi-VN')} đ`;
  }
  return `${dish.price.toLocaleString('vi-VN')} đ`;
}

interface MenuDishCardProps {
  dish: MenuItem;
  categoryName?: string;
  activeMode: OrderMode;
  quantity: number;
  isFav: boolean;
  favoritePending: boolean;
  favoritesDisabled: boolean;
  onSelect: (dish: MenuItem) => void;
  onToggleFavorite: (id: string, event: React.MouseEvent) => void;
  onAdd: (dish: MenuItem) => void;
  onDecrease: (dish: MenuItem) => void;
}

// Category tracking and dialog state must not rebuild the entire catalog.
const MenuDishCard = memo(function MenuDishCard({
  dish, categoryName, activeMode, quantity, isFav, favoritePending,
  favoritesDisabled, onSelect, onToggleFavorite, onAdd, onDecrease,
}: MenuDishCardProps) {
  const isAvailable = dish.available !== false;
  return (
    <article
      data-dish-id={dish.id}
      className={`[content-visibility:auto] [contain-intrinsic-size:auto_113px] sm:[contain-intrinsic-size:auto_400px] group flex flex-row sm:flex-col bg-transparent sm:bg-white rounded-none sm:rounded-[18px] border-0 border-b border-[#234386]/10 sm:border sm:border-[#d2b68c]/30 py-2.5 sm:p-3 gap-2.5 sm:gap-0 transition-colors duration-200 ${
        isAvailable
          ? 'sm:hover:shadow-md'
          : 'opacity-75 bg-[#fbf9f6]'
      }`}
    >
      {/* Dish Image */}
      <div
        onClick={() => onSelect(dish)}
        className="relative w-[92px] h-[92px] shrink-0 sm:w-auto sm:h-auto sm:aspect-[4/3] rounded-xl overflow-hidden bg-[#234386]/5 cursor-pointer"
      >
        <DishImage
          dish={dish}
          categoryName={categoryName}
          isAvailable={isAvailable}
        />

        {/* Badge: Đặc sản / Signature / Bán chạy / Mới */}
        <div className="absolute top-2.5 left-2.5 hidden sm:block">
          {dish.featured_rank ? (
            <span className="inline-block bg-[#ed7328] text-white text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full shadow-xs">
              ★ Đặc sản #{dish.featured_rank}
            </span>
          ) : dish.isSignature ? (
            <span className="inline-block bg-[#ed7328] text-white text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full shadow-xs">
              ★ Đặc sản
            </span>
          ) : dish.isBestseller ? (
            <span className="inline-block bg-[#234386] text-white text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full shadow-xs">
              Bán chạy
            </span>
          ) : dish.isNew ? (
            <span className="inline-block bg-[#3d5a45] text-white text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full shadow-xs">
              Món mới
            </span>
          ) : null}
        </div>

        {/* Badge: Tạm hết (khi available = false) */}
        {!isAvailable && (
          <div className="absolute inset-0 bg-black/45 backdrop-blur-[1px] flex items-center justify-center">
            <span className="bg-black/80 text-white font-medium text-xs px-3 py-1 rounded-full border border-white/20">
              Tạm hết
            </span>
          </div>
        )}

        {/* Favorite Heart Icon */}
        <button
          type="button"
          onClick={(e) => onToggleFavorite(dish.id, e)}
          className="absolute top-0 right-0 w-11 h-11 text-[#000000]/60 hover:text-red-500 flex items-center justify-center transition-colors active:scale-95"
          aria-label={`${isFav ? 'Bỏ yêu thích' : 'Yêu thích'} ${dish.name}`}
          aria-pressed={isFav}
          aria-busy={favoritePending}
          disabled={favoritesDisabled}
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/90">
            <Heart size={12} className={isFav ? 'fill-red-500 text-red-500' : ''} />
          </span>
        </button>

        {/* Mode-specific Badge */}
        {activeMode === 'delivery' && dish.deliveryETA && (
          <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-xs text-white text-[9px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
            <Clock size={10} />
            <span>{dish.deliveryETA}</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 sm:p-1.5 sm:pt-2.5 flex flex-col justify-between">
        <div>
          <h3
            className="mb-1 font-body text-sm font-semibold leading-snug text-deep-indigo line-clamp-2 sm:font-heading sm:text-base"
          >
            <button type="button" onClick={() => onSelect(dish)} className="text-left hover:text-burnt-orange focus-visible:outline-2 focus-visible:outline-deep-indigo">{dish.name}</button>
          </h3>
          <p className="font-['Be_Vietnam_Pro',sans-serif] text-[12px] text-[#000000]/70 line-clamp-1 sm:line-clamp-2 leading-4 mb-1 sm:mb-2 font-normal">
            {dish.description}
          </p>

          {/* Dine-in pairing note chip */}
          {activeMode === 'dine-in' && dish.pairingNote && (
            <div className="p-1.5 rounded-lg bg-[#ffc400]/15 text-[10px] text-[#234386] mb-1.5 sm:mb-3 flex items-center gap-1.5 line-clamp-1">
              <Wine size={12} className="text-[#ed7328] shrink-0" />
              <span className="italic truncate">{dish.pairingNote}</span>
            </div>
          )}
        </div>

        {/* Price & Action Row */}
        <div className="pt-1 sm:pt-2 sm:border-t sm:border-[#d2b68c]/20 flex items-center justify-between mt-auto gap-2">
          <div className="min-w-0 flex-1">
            <span className="block font-body text-sm font-semibold leading-5 tabular-nums text-deep-indigo">{featuredPrice(dish)}</span>
          </div>

          {dish.pricing_mode === 'range' ? (
            <button
              type="button"
              onClick={() => onSelect(dish)}
              className="inline-flex min-h-11 items-center gap-1 px-3 py-2 rounded-full text-xs font-semibold bg-burnt-orange/10 text-deep-indigo hover:bg-burnt-orange hover:text-white transition-colors cursor-pointer shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep-indigo"
            >
              <span>Tùy phần</span>
              <ArrowRight size={12} />
            </button>
          ) : dish.pricing_mode === 'market' ? (
            <button
              type="button"
              onClick={() => onSelect(dish)}
              className="inline-flex min-h-11 items-center gap-1 px-3 py-2 rounded-full text-xs font-semibold bg-deep-indigo/10 text-deep-indigo hover:bg-deep-indigo hover:text-white transition-colors cursor-pointer shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep-indigo"
            >
              <span>Hỏi giá</span>
              <ArrowRight size={12} />
            </button>
          ) : dish.pricing_mode === 'unknown' ? (
            <button
              type="button"
              onClick={() => onSelect(dish)}
              className="inline-flex min-h-11 items-center gap-1 px-3 py-2 rounded-full text-xs font-semibold bg-ink-black/5 text-ink-black/70 hover:bg-deep-indigo hover:text-white transition-colors cursor-pointer shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep-indigo"
            >
              <span>Liên hệ</span>
              <ArrowRight size={12} />
            </button>
          ) : quantity > 0 ? (
            <div role="group" aria-label={`Số phần ${dish.name}`} className="inline-flex shrink-0 items-center">
              <button type="button" onClick={() => onDecrease(dish)} aria-label={`Giảm số lượng ${dish.name}`}
                className="flex h-11 w-9 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-deep-indigo">
                <span className="flex size-6 items-center justify-center rounded-full border border-[#ed7328]/40 bg-white text-[#d86218]"><Minus size={13} aria-hidden="true" /></span>
              </button>
              <output aria-label={`Số lượng ${dish.name}`} className="min-w-4 text-center text-xs font-semibold tabular-nums text-deep-indigo">{quantity}</output>
              <button type="button" disabled={!isAvailable} onClick={() => onAdd(dish)} aria-label={`Tăng số lượng ${dish.name}`}
                className="flex h-11 w-9 items-center justify-center rounded-full disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-deep-indigo">
                <span className={`flex size-6 items-center justify-center rounded-full text-white ${activeMode === 'delivery' ? 'bg-[#234386]' : 'bg-[#ed7328]'}`}><Plus size={13} aria-hidden="true" /></span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={!isAvailable}
              onClick={() => isAvailable && onAdd(dish)}
              aria-label={!isAvailable ? 'Tạm hết' : 'Thêm món'}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-transparent p-1.5 text-xs font-semibold shrink-0 cursor-pointer disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep-indigo"
            >
              <span className={`inline-flex h-6 min-w-6 items-center justify-center gap-1.5 rounded-full transition-colors sm:h-8 sm:px-3.5 ${!isAvailable ? 'px-2.5' : 'w-6 sm:w-auto'} ${
                !isAvailable
                  ? 'bg-[#000000]/15 text-[#000000]/40 cursor-not-allowed'
                  : activeMode === 'delivery'
                  ? 'bg-[#234386] hover:bg-[#ed7328] text-white shadow-2xs active:scale-95'
                  : 'bg-[#ed7328] hover:bg-[#d86218] text-white shadow-2xs active:scale-95'
              }`}>
              {!isAvailable ? (
                <span>Tạm hết</span>
              ) : (
                <>
                  <Plus size={13} strokeWidth={2} aria-hidden="true" />
                  <span className="hidden sm:inline">Thêm món</span>
                </>
              )}
              </span>
            </button>
          )}
        </div>

      </div>
    </article>
  );
});

export const MenuPage: FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const {
    items: catalogItems,
    categories: catalogCategories,
    isLoading,
    isError,
    error,
    menuError,
    refreshMenu,
  } = useCatalog();
  const {
    add,
    updateQty,
    setCartOpen,
    cartItems,
    clear: clearCart,
    setContext: setCartContext,
    context: cartContext,
  } = useCart();
  const quantityByDish = useMemo(() => {
    const quantities = new Map<string, number>();
    for (const item of cartItems) quantities.set(item.dish.id, (quantities.get(item.dish.id) ?? 0) + item.quantity);
    return quantities;
  }, [cartItems]);
  const decreaseDish = useCallback((dish: MenuItem) => {
    const line = cartItems.find(item => item.dish.id === dish.id && !item.note)
      ?? cartItems.find(item => item.dish.id === dish.id);
    if (line) updateQty(dish.id, -1, line.note);
  }, [cartItems, updateQty]);
  const { session, resolveToken } = useTableSession();
  const { role, user } = useAuth();
  const { setViewedMenuItemId } = useConciergeSession();
  const catalogContext = useContext(CatalogContext);

  // Mode from URL query: ?mode=dine-in, ?mode=delivery or ?mode=takeaway
  const modeParam = searchParams.get('mode');
  const activeMode: OrderMode =
    modeParam === 'delivery'
      ? 'delivery'
      : modeParam === 'takeaway'
        ? 'takeaway'
        : 'dine-in';

  const [pendingModeChange, setPendingModeChange] = useState<OrderMode | null>(null);

  // Auto-sync table session to cart context if in dine-in mode and table details are missing
  useEffect(() => {
    if (activeMode === 'dine-in' && session) {
      if (cartContext.mode !== 'dine-in' || cartContext.tableId !== session.tableId) {
        setCartContext({
          mode: 'dine-in',
          tableId: session.tableId,
          tableCode: session.tableCode,
          tableName: session.tableName,
          visitId: session.visitId,
        });
      }
    }
  }, [activeMode, session, cartContext, setCartContext]);

  const handleModeSelect = (targetMode: OrderMode) => {
    if (targetMode === activeMode) return;

    // Check if cart has items from different mode
    const hasCartItems = cartItems.length > 0;
    const isDifferentMode = cartContext.mode !== targetMode;

    if (hasCartItems && isDifferentMode) {
      setPendingModeChange(targetMode);
      return;
    }

    applyModeChange(targetMode);
  };

  const applyModeChange = (targetMode: OrderMode) => {
    if (targetMode === 'delivery') {
      setCartContext({ mode: 'delivery' });
      setSearchParams({ mode: 'delivery' }, { replace: true });
    } else if (targetMode === 'takeaway') {
      setCartContext({ mode: 'takeaway' });
      setSearchParams({ mode: 'takeaway' }, { replace: true });
    } else {
      if (session) {
        setCartContext({
          mode: 'dine-in',
          tableId: session.tableId,
          tableCode: session.tableCode,
          tableName: session.tableName,
          visitId: session.visitId,
        });
      } else {
        setCartContext({
          mode: 'dine-in',
          tableId: '',
          tableCode: '',
          tableName: '',
          visitId: '',
        });
      }
      setSearchParams({}, { replace: true });
    }
  };

  const confirmModeChange = () => {
    if (!pendingModeChange) return;
    clearCart();
    applyModeChange(pendingModeChange);
    setPendingModeChange(null);
  };

  const currentModeLabel =
    cartContext.mode === 'dine-in'
      ? cartContext.tableName
        ? `Bàn ${cartContext.tableName}`
        : 'Tại quán'
      : cartContext.mode === 'takeaway'
        ? 'Mang đi'
        : 'Giao tận nơi';

  // QR table link dialog state
  const [isQrDialogOpen, setIsQrDialogOpen] = useState(false);
  const [qrInput, setQrInput] = useState('');
  const [qrError, setQrError] = useState<string | null>(null);
  const [isResolvingQr, setIsResolvingQr] = useState(false);
  const [pendingTableSession, setPendingTableSession] = useState<TableSession | null>(null);

  // Delivery address dialog state
  const [isAddressDialogOpen, setIsAddressDialogOpen] = useState(false);
  const [addressDraft, setAddressDraft] = useState({
    recipientName: '',
    phone: '',
    address: '',
    zoneId: '',
  });
  const [addressError, setAddressError] = useState<string | null>(null);

  const deliveryZoneOptions =
    catalogContext?.settings?.delivery_zones?.length
      ? catalogContext.settings.delivery_zones
      : FALLBACK_DELIVERY_ZONES;

  const applyResolvedTable = (resolved: TableSession) => {
    setCartContext({
      mode: 'dine-in',
      tableId: resolved.tableId,
      tableCode: resolved.tableCode,
      tableName: resolved.tableName,
      visitId: resolved.visitId,
    });
    setSearchParams({}, { replace: true });
  };

  const handleResolveQr = async () => {
    const token = extractQrToken(qrInput);
    if (!token) {
      setQrError('Vui lòng dán liên kết hoặc mã QR bàn.');
      return;
    }
    setIsResolvingQr(true);
    setQrError(null);
    try {
      const resolved = await resolveToken(token);
      const hasCartItems = cartItems.length > 0;
      const isDifferentTable =
        cartContext.mode === 'dine-in' && cartContext.tableId !== resolved.tableId;
      const isDifferentMode = cartContext.mode !== 'dine-in';
      if (hasCartItems && (isDifferentTable || isDifferentMode)) {
        setPendingTableSession(resolved);
        setIsQrDialogOpen(false);
        setQrInput('');
        return;
      }
      applyResolvedTable(resolved);
      setIsQrDialogOpen(false);
      setQrInput('');
    } catch (err) {
      setQrError(
        err instanceof Error
          ? err.message
          : 'Không thể xác thực mã QR bàn. Vui lòng liên hệ nhân viên.'
      );
    } finally {
      setIsResolvingQr(false);
    }
  };

  const confirmTableReassign = () => {
    if (!pendingTableSession) return;
    clearCart();
    applyResolvedTable(pendingTableSession);
    setPendingTableSession(null);
  };

  const openAddressDialog = () => {
    setAddressDraft({
      recipientName: cartContext.mode === 'delivery' ? (cartContext.recipientName ?? '') : '',
      phone: cartContext.mode === 'delivery' ? (cartContext.phone ?? '') : '',
      address: cartContext.mode === 'delivery' ? (cartContext.address ?? '') : '',
      zoneId: cartContext.mode === 'delivery' ? (cartContext.zoneId ?? '') : '',
    });
    setAddressError(null);
    setIsAddressDialogOpen(true);
  };

  const confirmAddressDraft = () => {
    if (!addressDraft.address.trim()) {
      setAddressError('Vui lòng nhập địa chỉ giao món.');
      return;
    }
    if (!addressDraft.zoneId) {
      setAddressError('Vui lòng chọn khu vực giao hàng.');
      return;
    }
    setCartContext({
      mode: 'delivery',
      recipientName: addressDraft.recipientName.trim() || undefined,
      phone: addressDraft.phone.trim() || undefined,
      address: addressDraft.address.trim(),
      zoneId: addressDraft.zoneId,
    });
    setAddressError(null);
    setIsAddressDialogOpen(false);
  };

  const [activeCategory, setActiveCategory] = useState('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [hasSwipedHighlights, setHasSwipedHighlights] = useState(false);
  const { favorites, pending: favoritePending, ready: favoritesReady, notice: favoriteNotice, dismiss: dismissFavoriteNotice, retry: retryFavorites, toggle: toggleMenuFavorite } = useMenuFavorites(role, user?.id);
  const [selectedDishDetail, setSelectedDishDetail] = useState<MenuItem | null>(null);
  useEffect(() => {
    setViewedMenuItemId(selectedDishDetail?.id ?? null);
    return () => setViewedMenuItemId(null);
  }, [selectedDishDetail?.id, setViewedMenuItemId]);

  const categoryScrollRef = useRef<HTMLDivElement>(null);
  const categoryNavRef = useRef<HTMLElement>(null);
  const menuListRef = useRef<HTMLDivElement>(null);
  const categoryButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const toggleFavorite = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    void toggleMenuFavorite(id);
  }, [toggleMenuFavorite]);

  const scrollCategories = (direction: 'left' | 'right') => {
    const rail = categoryScrollRef.current;
    if (!rail) return;
    rail.scrollBy({ left: direction === 'left' ? -rail.clientWidth : rail.clientWidth, behavior: 'instant' });
  };

  const categoryMap = useMemo(() => {
    const map = new Map<string, string>();
    catalogCategories?.forEach((cat) => {
      map.set(cat.id, cat.name);
      map.set(cat.slug, cat.name);
    });
    return map;
  }, [catalogCategories]);

  const dishes = useMemo(() => {
    return catalogItems.map(toLegacyMenuItem);
  }, [catalogItems]);

  const filteredDishes = useMemo(() => {
    const query = normalizeVietnamese(searchQuery.trim());
    return dishes.filter(dish => dish.modes.includes(activeMode) && (
      !query || [dish.name, dish.description, ...(dish.tags ?? [])].some(value => normalizeVietnamese(value).includes(query))
    ));
  }, [dishes, activeMode, searchQuery]);

  const menuSections = useMemo(() => {
    const categories = [...catalogCategories].sort((a, b) => a.sort_order - b.sort_order);
    const sections = categories.map(category => ({
      id: category.id,
      name: category.name,
      dishes: filteredDishes.filter(dish => dish.category_id === category.id),
    })).filter(section => section.dishes.length > 0);
    const assigned = new Set(sections.flatMap(section => section.dishes.map(dish => dish.id)));
    const remaining = filteredDishes.filter(dish => !assigned.has(dish.id));
    if (remaining.length > 0) sections.push({ id: 'uncategorized', name: 'Món khác', dishes: remaining });
    return sections;
  }, [catalogCategories, filteredDishes]);

  const currentCategory = menuSections.some(section => section.id === activeCategory)
    ? activeCategory
    : menuSections[0]?.id;
  const visibleSections = useMemo(() => searchQuery.trim()
    ? menuSections
    : menuSections.filter(section => section.id === currentCategory), [menuSections, currentCategory, searchQuery]);
  const orderedDishes = useMemo(() => visibleSections.flatMap(section => section.dishes), [visibleSections]);
  const { isVisible: isDishVisible, registerSlot, reveal: revealDishes } = useVisibleMenuItems(orderedDishes);

  const navigateToCategory = (id: string) => {
    setSearchQuery('');
    setActiveCategory(id);
    const list = menuListRef.current;
    const nav = categoryNavRef.current;
    if (!list || !nav) return;
    const offset = (Number.parseFloat(getComputedStyle(nav).top) || 0) + nav.offsetHeight;
    window.scrollTo({ top: Math.max(0, window.scrollY + list.getBoundingClientRect().top - offset), behavior: 'instant' });
  };

  useEffect(() => {
    const rail = categoryScrollRef.current;
    const button = currentCategory ? categoryButtonRefs.current[currentCategory] : null;
    if (!rail || !button) return;
    const railBounds = rail.getBoundingClientRect();
    const buttonBounds = button.getBoundingClientRect();
    const delta = buttonBounds.left < railBounds.left
      ? buttonBounds.left - railBounds.left
      : buttonBounds.right > railBounds.right ? buttonBounds.right - railBounds.right : 0;
    if (delta) rail.scrollBy({ left: delta, behavior: 'instant' });
  }, [currentCategory]);

  const highlightedMenu = useMemo(() => {
    const available = dishes.filter((dish) => dish.available !== false && dish.modes.includes(activeMode));
    const bestsellers = available.filter((dish) => dish.isBestseller);
    const items = bestsellers.length > 0 ? bestsellers : available.filter((dish) =>
      dish.is_featured || dish.isSignature || (dish.featured_rank ?? 0) > 0,
    ).sort((a, b) => (a.featured_rank ?? Infinity) - (b.featured_rank ?? Infinity));
    return { title: bestsellers.length > 0 ? 'Món bán chạy' : 'Tiger gợi ý', items: items.slice(0, 6) };
  }, [dishes, activeMode]);

  const handleBookTableForDish = (dishName: string) => {
    navigate('/reservation', { state: { dishName } });
  };

  // Close modal on escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedDishDetail(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="pt-[3.75rem] pb-6 md:pt-32 md:pb-28 bg-[#fbf9f6] min-h-screen">
      {favoriteNotice && (
        <div role={favoriteNotice.error ? 'alert' : 'status'} className="fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-md items-center justify-between gap-3 rounded-xl border border-[#234386]/15 bg-white px-4 py-3 text-sm text-[#234386] shadow-md md:bottom-6">
          <span>{favoriteNotice.text}</span>
          {favoriteNotice.login && <Link to="/login?returnTo=%2Fmenu" className="shrink-0 font-semibold underline">Đăng nhập</Link>}
          {favoriteNotice.error && !favoritesReady && <button type="button" onClick={retryFavorites} className="shrink-0 font-semibold underline">Thử lại</button>}
          <button type="button" onClick={dismissFavoriteNotice} aria-label="Đóng thông báo yêu thích" className="min-h-10 min-w-10 text-xl">×</button>
        </div>
      )}
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10">

        <div className="mb-6 hidden items-end justify-between gap-6 border-b border-warm-sand/30 pb-6 md:flex">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-burnt-orange">Bếp Tiger 345</p>
            <h1 className="font-heading text-4xl font-bold tracking-tight text-deep-indigo lg:text-5xl">Thực đơn</h1>
          </div>
          <p className="text-sm text-ink-black/60">Chọn món ngon, dùng theo cách bạn thích.</p>
        </div>
        <h1 className="sr-only md:hidden">Thực đơn</h1>

        <div className="mb-1 py-2 md:mb-2">
          <fieldset className="relative isolate m-0 grid min-w-0 grid-cols-3 rounded-full border-0 bg-[#234386]/[0.055] p-1 font-sans md:max-w-lg">
            <legend className="sr-only">Chọn hình thức thưởng thức</legend>
            <div aria-hidden="true" className="pointer-events-none absolute inset-1 -z-10">
              <span
                className="block h-full w-1/3 rounded-full bg-white shadow-[0_1px_4px_rgba(35,67,134,0.08)] transition-transform duration-250 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none"
                style={{ transform: `translateX(${orderModeOptions.findIndex(option => option.value === activeMode) * 100}%)` }}
              />
            </div>
            {orderModeOptions.map(({ value, label, icon: Icon }) => (
              <label key={value} className="relative min-w-0 cursor-pointer">
                <input
                  type="radio"
                  name="order-mode"
                  value={value}
                  checked={activeMode === value}
                  onChange={() => handleModeSelect(value)}
                  className="peer sr-only"
                />
                <span className="relative flex min-h-11 items-center justify-center gap-1.5 rounded-full px-2 py-2 text-center text-xs font-medium leading-5 text-[#77736d] transition-colors duration-200 hover:text-[#234386] peer-checked:text-[#234386] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#234386] motion-reduce:transition-none md:gap-2 md:text-sm">
                  <Icon size={16} strokeWidth={1.7} className="shrink-0" aria-hidden="true" />
                  <span>{label}</span>
                </span>
              </label>
            ))}
          </fieldset>
        </div>

        <div className="mb-3 flex min-h-11 items-center justify-between gap-3 border-b border-warm-sand/30 pb-2 text-xs text-deep-indigo md:mb-5 md:max-w-lg">
          {activeMode === 'dine-in' ? (
            <>
              <button type="button" onClick={() => { setQrError(null); setIsQrDialogOpen(true); }}
                className="flex min-h-11 min-w-0 items-center gap-2 text-left hover:text-burnt-orange focus-visible:outline-2 focus-visible:outline-deep-indigo">
                <QrCode size={16} className="shrink-0" aria-hidden="true" />
                <span className="truncate">{session ? session.tableName : 'Chưa chọn bàn'}</span>
                <span className="shrink-0 font-semibold underline underline-offset-4">{session ? 'Đổi bàn' : 'Nhập số bàn'}</span>
              </button>
              {session ? (
                <button type="button" onClick={() => setCartOpen(true)} className="min-h-11 shrink-0 font-semibold hover:text-burnt-orange">Món đã chọn ({cartItems.length})</button>
              ) : (
                <Link to="/reservation" className="flex min-h-11 shrink-0 items-center gap-1 text-ink-black/60 hover:text-deep-indigo">Đặt bàn <ChevronRight size={13} aria-hidden="true" /></Link>
              )}
            </>
          ) : activeMode === 'delivery' ? (
            <>
              <button type="button" onClick={openAddressDialog} className="flex min-h-11 min-w-0 items-center gap-2 text-left hover:text-burnt-orange">
                <MapPin size={16} className="shrink-0" aria-hidden="true" />
                <span className="truncate">{cartContext.mode === 'delivery' && cartContext.address ? cartContext.address : 'Nhập địa chỉ giao'}</span>
                <ChevronRight size={14} className="shrink-0" aria-hidden="true" />
              </button>
              <button type="button" onClick={() => setCartOpen(true)} className="min-h-11 shrink-0 font-semibold hover:text-burnt-orange">Xem giỏ hàng</button>
            </>
          ) : (
            <>
              <span className="flex min-w-0 items-center gap-2"><ShoppingBag size={16} className="shrink-0" aria-hidden="true" />Nhận món tại Tiger 345</span>
              <button type="button" onClick={() => setCartOpen(true)} className="min-h-11 shrink-0 font-semibold hover:text-burnt-orange">Xem giỏ hàng</button>
            </>
          )}
        </div>

        <div className="relative mb-3 md:mb-5 md:max-w-lg">
          <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-deep-indigo/50" aria-hidden="true" />
          <input
            type="search"
            aria-label="Tìm món"
            placeholder="Tìm món, nguyên liệu…"
            value={searchQuery}
            onChange={event => setSearchQuery(event.target.value)}
            className="min-h-12 w-full rounded-xl border border-deep-indigo/10 bg-white py-3 pl-11 pr-12 text-base text-ink-black placeholder:text-ink-black/45 focus:border-deep-indigo/40 focus:outline-2 focus:outline-deep-indigo/15 md:text-sm [&::-webkit-search-cancel-button]:appearance-none"
          />
          {searchQuery && (
            <button type="button" aria-label="Xóa tìm kiếm" onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-ink-black/50 hover:text-deep-indigo focus-visible:outline-2 focus-visible:outline-deep-indigo">
              <X size={18} aria-hidden="true" />
            </button>
          )}
        </div>

        {menuSections.length > 0 && (
          <nav ref={categoryNavRef} aria-label="Danh mục món ăn"
            className="sticky top-14 z-30 -mx-4 mb-2 border-b border-warm-sand/40 bg-cream-paper px-4 sm:-mx-6 sm:px-6 md:top-20 md:mb-4 lg:-mx-10 lg:px-10">
            <div className="flex items-center gap-2">
              <div ref={categoryScrollRef} className="flex min-w-0 flex-1 gap-6 overflow-x-auto overscroll-x-contain scrollbar-none">
                {menuSections.map(section => (
                  <button key={section.id} type="button" ref={element => { categoryButtonRefs.current[section.id] = element; }}
                    onClick={() => navigateToCategory(section.id)}
                    aria-current={currentCategory === section.id ? 'location' : undefined}
                    aria-controls={`menu-section-${section.id}`}
                    className={`min-h-12 shrink-0 whitespace-nowrap border-b-2 py-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-deep-indigo ${
                      currentCategory === section.id ? 'border-burnt-orange text-deep-indigo' : 'border-transparent text-ink-black/55 hover:text-deep-indigo'
                    }`}>
                    {section.name}
                  </button>
                ))}
              </div>
              <div className="hidden shrink-0 items-center lg:flex">
                <button type="button" onClick={() => scrollCategories('left')} aria-label="Cuộn danh mục sang trái"
                  className="flex size-11 items-center justify-center rounded-full text-deep-indigo hover:bg-deep-indigo/5 focus-visible:outline-2 focus-visible:outline-deep-indigo"><ChevronLeft size={18} /></button>
                <button type="button" onClick={() => scrollCategories('right')} aria-label="Cuộn danh mục sang phải"
                  className="flex size-11 items-center justify-center rounded-full text-deep-indigo hover:bg-deep-indigo/5 focus-visible:outline-2 focus-visible:outline-deep-indigo"><ChevronRight size={18} /></button>
              </div>
            </div>
          </nav>
        )}

        {!searchQuery.trim() && highlightedMenu.items.length > 0 && (
          <section aria-label={highlightedMenu.title} className="relative isolate -mx-4 mb-5 overflow-hidden bg-[#e8eee4] pb-5 pt-5 sm:hidden">
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[185px] bg-[url('/images/menu/mountain-mist.svg')] bg-cover bg-bottom bg-no-repeat" />
            <div aria-hidden="true" className="pointer-events-none absolute -right-5 -top-3 -z-10 h-[150px] w-[200px] bg-[url('/images/menu/bamboo-corner.svg')] bg-contain bg-no-repeat opacity-65" />
            <div aria-hidden="true" className="pointer-events-none absolute -bottom-10 -left-12 -z-10 h-[150px] w-[200px] rotate-180 bg-[url('/images/menu/bamboo-corner.svg')] bg-contain bg-no-repeat opacity-35" />
            <div className="mb-2.5 flex items-center justify-between gap-3 px-4">
              <div className="flex items-center gap-2.5">
                <h2 className="font-['Noto_Serif',serif] text-lg sm:text-xl font-bold tracking-tight text-[#294936]">{highlightedMenu.title}</h2>
              </div>
              {!hasSwipedHighlights && (<span className="flex items-center gap-1 text-[11px] font-medium text-[#98451f]">Vuốt xem <ArrowRight size={13} aria-hidden="true" /></span>)}
            </div>
            <div className="flex snap-x snap-proximity scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 scrollbar-none"
              onScroll={event => {
                if (!hasSwipedHighlights && event.currentTarget.scrollLeft > 8) setHasSwipedHighlights(true);
              }}>
              {highlightedMenu.items.map((dish) => (
                <button key={dish.id} type="button" onClick={() => setSelectedDishDetail(dish)}
                  data-bestseller={dish.isBestseller || undefined}
                  className="menu-featured-card w-[156px] shrink-0 snap-start overflow-hidden rounded-xl border border-[#b7c4b0] bg-[#fffdf9] text-left shadow-[0_3px_8px_rgba(35,63,43,0.10)] transition-colors hover:border-[#ed7328] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#294936]">
                  <div className="relative aspect-[4/3] overflow-hidden bg-[#234386]/5">
                    <DishImage dish={dish} categoryName={categoryMap.get(dish.category)} isAvailable />
                    {dish.isBestseller && (
                      <span className="menu-bestseller-label absolute left-2 top-2 overflow-hidden rounded-full px-2.5 py-1 text-[10px] font-bold leading-4 tracking-wide">
                        Bán chạy
                      </span>
                    )}
                  </div>
                  <span className="block p-2.5">
                    <span className="block min-h-10 text-[13px] font-semibold leading-5 text-[#234386] line-clamp-2">{dish.name}</span>
                    <span className="mt-1.5 block text-[11px] font-semibold leading-4 text-[#b44d12]">{featuredPrice(dish)}</span>
                    <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-[#746c62]">Xem món <ChevronRight size={12} aria-hidden="true" /></span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ========================================================================= */}
        {/* DISH CARDS GRID */}
        {/* ========================================================================= */}
        {searchQuery.trim() && <p role="status" className="py-3 text-sm text-ink-black/60">{filteredDishes.length} món phù hợp</p>}
        {isLoading && catalogItems.length === 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-0 sm:gap-4">
            {Array.from({ length: 8 }).map((_, idx) => (
              <div
                key={`menu-skeleton-${idx}`}
                className="animate-pulse flex flex-row sm:flex-col gap-3 py-3 sm:p-3.5 sm:bg-white sm:rounded-[18px] border-b sm:border border-[#d2b68c]/30"
              >
                <div className="w-[92px] h-[92px] shrink-0 sm:w-auto sm:h-auto sm:aspect-[4/3] rounded-xl bg-[#234386]/10 sm:mb-3" />
                <div className="flex-1 space-y-2.5 p-2">
                  <div className="h-4 bg-[#234386]/10 rounded-sm w-3/4" />
                  <div className="h-3 bg-[#234386]/10 rounded-sm w-full" />
                  <div className="h-3 bg-[#234386]/10 rounded-sm w-2/3" />
                  <div className="pt-3 border-t border-[#d2b68c]/20 flex justify-between items-center">
                    <div className="h-4 bg-[#ed7328]/20 rounded-sm w-1/3" />
                    <div className="h-7 bg-[#234386]/10 rounded-full w-20" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : catalogItems.length === 0 && (menuError || isError) ? (
          <div role="alert" className="py-16 text-center space-y-4 bg-white rounded-3xl border border-red-200 p-8 shadow-xs max-w-lg mx-auto">
            <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto">
              <AlertCircle size={24} />
            </div>
            <h3 className="font-['Noto_Serif',serif] text-lg font-bold text-[#000000]">
              Không thể tải danh mục món ăn
            </h3>
            <p className="text-xs text-[#000000]/65 max-w-sm mx-auto">
              {menuError || error?.message || 'Đã có lỗi kết nối tới máy chủ. Vui lòng kiểm tra đường truyền và thử lại.'}
            </p>
            <button
              type="button"
              onClick={() => refreshMenu()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#234386] hover:bg-[#1a3468] text-white text-xs font-semibold shadow-xs active:scale-95 transition-all"
            >
              <RefreshCw size={13} />
              <span>Thử tải lại</span>
            </button>
          </div>
        ) : filteredDishes.length === 0 ? (
          <div className="py-20 text-center space-y-3 bg-white rounded-3xl border border-[#d2b68c]/30 p-8">
            <div className="w-14 h-14 rounded-full bg-[#fbf9f6] text-[#000000]/40 flex items-center justify-center mx-auto">
              <Search size={24} />
            </div>
            <h3 className="font-['Noto_Serif',serif] text-lg font-bold text-[#000000]/80">
              Không tìm thấy món ăn phù hợp
            </h3>
            <p className="text-xs text-[#000000]/60 max-w-sm mx-auto">
              Thử tên món hoặc nguyên liệu khác, hoặc xóa tìm kiếm để xem thực đơn.
            </p>
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="mt-2 px-5 py-2 rounded-full bg-[#234386] text-white text-xs font-semibold"
            >
              Xem tất cả món
            </button>
          </div>
        ) : (
          <div ref={menuListRef} className="space-y-8 md:space-y-10">
            {visibleSections.map(section => (
              <section key={section.id} id={`menu-section-${section.id}`} aria-labelledby={`menu-heading-${section.id}`}>
                <div className="flex items-baseline gap-3 border-b border-warm-sand/30 pb-3 pt-4">
                  <h2 id={`menu-heading-${section.id}`} className="font-heading text-2xl font-bold tracking-tight text-deep-indigo">{section.name}</h2>
                  <span className="text-xs tabular-nums text-ink-black/45">{section.dishes.length} món</span>
                </div>
                <div className="grid grid-cols-1 gap-0 sm:grid-cols-2 sm:gap-4 sm:pt-4 lg:grid-cols-4">
            {section.dishes.map(dish => (
              <div key={dish.id} data-menu-slot-id={dish.id}
                ref={isDishVisible(dish.id) ? undefined : element => registerSlot(dish.id, element)}>
              {isDishVisible(dish.id) ? <MenuDishCard dish={dish} activeMode={activeMode}
                categoryName={categoryMap.get(dish.category) || categoryMap.get(dish.category_id || '')}
                quantity={quantityByDish.get(dish.id) ?? 0} isFav={!!favorites[dish.id]}
                favoritePending={!!favoritePending[dish.id]}
                favoritesDisabled={!!favoritePending[dish.id] || (role === 'customer' && !favoritesReady)}
                onSelect={setSelectedDishDetail} onToggleFavorite={toggleFavorite} onAdd={add} onDecrease={decreaseDish} /> : (
                  <button type="button" aria-label={`Xem món ${dish.name}`}
                    onFocus={() => revealDishes([dish.id])} onClick={() => setSelectedDishDetail(dish)}
                    className="flex h-[113px] w-full items-center border-b border-deep-indigo/10 text-left text-sm font-semibold text-deep-indigo sm:aspect-[3/5] sm:h-auto sm:rounded-[18px] sm:border sm:bg-white sm:p-3">
                    {dish.name}
                  </button>
                )}
              </div>
            ))}
                </div>
              </section>
            ))}
          </div>
        )}

      </div>

      {/* ========================================================================= */}
      {/* DISH DETAIL MODAL */}
      {/* ========================================================================= */}
      <Dialog
        isOpen={Boolean(selectedDishDetail)}
        onClose={() => setSelectedDishDetail(null)}
        title={selectedDishDetail?.name}
        description={selectedDishDetail?.description}
        className="rounded-[24px] sm:rounded-[28px]"
      >
        {selectedDishDetail && (
          <div>
            <div className="relative aspect-video overflow-hidden rounded-t-[24px] sm:rounded-t-[28px] bg-[#234386]/5">
              <DishImage
                dish={selectedDishDetail}
                categoryName={categoryMap.get(selectedDishDetail.category) || categoryMap.get(selectedDishDetail.category_id || '')}
                isAvailable={selectedDishDetail.available !== false}
              />
              <button
                type="button"
                onClick={() => setSelectedDishDetail(null)}
                aria-label="Đóng chi tiết món ăn"
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors text-xs cursor-pointer z-20"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-['Noto_Serif',serif] text-xl font-bold text-[#234386]">
                    {selectedDishDetail.name}
                  </h3>
                  {selectedDishDetail.servingSize && (
                    <span className="text-xs text-[#000000]/60">Khẩu phần: {selectedDishDetail.servingSize}</span>
                  )}
                </div>
                {selectedDishDetail.pricing_mode === 'market' ? (
                  <span className="font-['Noto_Serif',serif] text-lg sm:text-xl font-bold text-[#ed7328] shrink-0">
                    Theo thời giá
                  </span>
                ) : selectedDishDetail.pricing_mode === 'unknown' ? (
                  <span className="font-['Noto_Serif',serif] text-lg sm:text-xl font-bold text-[#ed7328] shrink-0">
                    Liên hệ
                  </span>
                ) : selectedDishDetail.pricing_mode === 'range' ? (
                  <span className="font-['Noto_Serif',serif] text-base sm:text-xl font-bold text-[#ed7328] shrink-0 text-right">
                    {(selectedDishDetail.price_min ?? selectedDishDetail.price).toLocaleString('vi-VN')} – {(selectedDishDetail.price_max ?? selectedDishDetail.price).toLocaleString('vi-VN')} đ
                  </span>
                ) : (
                  <span className="font-['Noto_Serif',serif] text-xl font-bold text-[#ed7328] shrink-0">
                    {selectedDishDetail.price.toLocaleString('vi-VN')} đ
                  </span>
                )}
              </div>

              <p className="text-xs sm:text-sm text-[#000000]/75 leading-relaxed font-normal">
                {selectedDishDetail.description}
              </p>

              {/* Pricing Mode Explanatory Notice */}
              {selectedDishDetail.pricing_mode === 'range' && (
                <div className="p-3 rounded-xl bg-[#ed7328]/10 text-xs text-[#ed7328] flex items-start gap-2.5">
                  <Info size={16} className="shrink-0 mt-0.5 text-[#ed7328]" />
                  <div>
                    <span className="font-semibold block text-[#ed7328]">Món ăn tùy chọn phần / trọng lượng</span>
                    <span className="text-[#000000]/75 leading-relaxed">
                      Giá thực tế sẽ dao động theo kích cỡ hoặc số lượng khách. Quý khách vui lòng ghi chú hoặc trao đổi cùng nhân viên phục vụ khi đặt món.
                    </span>
                  </div>
                </div>
              )}

              {selectedDishDetail.pricing_mode === 'market' && (
                <div className="p-3 rounded-xl bg-[#234386]/10 text-xs text-[#234386] flex items-start gap-2.5">
                  <Info size={16} className="shrink-0 mt-0.5 text-[#234386]" />
                  <div>
                    <span className="font-semibold block text-[#234386]">Thực phẩm tươi sống tính theo thời giá</span>
                    <span className="text-[#000000]/75 leading-relaxed">
                      Nguyên liệu nhập mới trong ngày. Nhân viên Tiger 345 sẽ báo giá chuẩn xác theo thời điểm quý khách thưởng thức.
                    </span>
                  </div>
                </div>
              )}

              {selectedDishDetail.pricing_mode === 'unknown' && (
                <div className="p-3 rounded-xl bg-[#000000]/5 text-xs text-[#000000]/80 flex items-start gap-2.5">
                  <Info size={16} className="shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold block">Món phục vụ theo liên hệ</span>
                    <span className="text-[#000000]/70 leading-relaxed">
                      Vui lòng liên hệ nhân viên hoặc hotline quán để được tư vấn và báo giá chi tiết.
                    </span>
                  </div>
                </div>
              )}

              {selectedDishDetail.pairingNote && (
                <div className="p-3 rounded-xl bg-[#ffc400]/15 text-xs text-[#234386] flex items-center gap-2">
                  <Wine size={15} className="text-[#ed7328] shrink-0" />
                  <span className="italic">{selectedDishDetail.pairingNote}</span>
                </div>
              )}

              <div className="pt-3 border-t border-[#d2b68c]/25 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedDishDetail(null)}
                  className="px-4 py-2.5 text-xs font-semibold text-[#000000]/60 hover:text-[#000000] text-center cursor-pointer"
                >
                  Đóng
                </button>

                {/* Fixed pricing mode allows adding to cart */}
                {(!selectedDishDetail.pricing_mode || selectedDishDetail.pricing_mode === 'fixed') ? (
                  activeMode !== 'dine-in' || session ? (
                    <button
                      type="button"
                      disabled={selectedDishDetail.available === false}
                      onClick={() => {
                        if (selectedDishDetail.available === false) return;
                        add(selectedDishDetail);
                        setSelectedDishDetail(null);
                      }}
                      className={`inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full text-xs font-semibold shadow-xs transition-all ${
                        selectedDishDetail.available === false
                          ? 'bg-[#000000]/15 text-[#000000]/40 cursor-not-allowed'
                          : 'bg-[#ed7328] hover:bg-[#d86218] text-white active:scale-95 cursor-pointer'
                      }`}
                    >
                      {selectedDishDetail.available === false ? (
                        <span>Món này hiện đang tạm hết</span>
                      ) : (
                        <>
                          <Plus size={14} />
                          <span>
                            {session
                              ? `Thêm vào bàn (${session.tableName})`
                              : activeMode === 'takeaway'
                                ? 'Thêm vào giỏ mang đi'
                                : 'Thêm vào giỏ giao hàng'}
                          </span>
                        </>
                      )}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        const dish = selectedDishDetail;
                        setSelectedDishDetail(null);
                        handleBookTableForDish(dish.name);
                      }}
                      className="inline-flex items-center justify-center gap-1.5 px-6 py-2.5 rounded-full bg-[#234386] text-white text-xs font-semibold shadow-xs hover:bg-[#1a3468] active:scale-95 transition-all cursor-pointer"
                    >
                      <Calendar size={14} />
                      <span>Đặt bàn thưởng thức món này</span>
                    </button>
                  )
                ) : null}
              </div>
            </div>
          </div>
        )}
      </Dialog>

      {/* ========================================================================= */}
      {/* MODE CHANGE CONFIRMATION DIALOG */}
      {/* ========================================================================= */}
      <Dialog
        isOpen={Boolean(pendingModeChange)}
        onClose={() => setPendingModeChange(null)}
        title="Thay Đổi Hình Thức Phục Vụ?"
        description="Xác nhận đổi chế độ phục vụ"
      >
        <div className="p-6 text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-[#ed7328]/15 text-[#ed7328] flex items-center justify-center mx-auto">
            <Utensils size={28} />
          </div>
          <h3 className="font-['Noto_Serif',serif] text-lg font-bold text-[#234386]">
            Thay Đổi Hình Thức Phục Vụ?
          </h3>
          <p className="text-sm text-black/70 leading-relaxed">
            Bạn đang có <strong className="text-[#ed7328]">{cartItems.length} món</strong> trong giỏ hàng
            thuộc hình thức <strong>{currentModeLabel}</strong>.
            <br />
            Bạn có muốn chuyển sang hình thức <strong>{pendingModeChange === 'delivery' ? 'Giao tận nơi' : pendingModeChange === 'takeaway' ? 'Mang đi' : 'Tại quán'}</strong> và làm mới giỏ hàng không?
          </p>
          <div className="pt-2 space-y-2.5">
            <button
              type="button"
              onClick={confirmModeChange}
              className="w-full py-3 px-4 rounded-full bg-[#ed7328] hover:bg-[#d86218] text-white font-semibold text-xs shadow-md transition-all cursor-pointer"
            >
              Đồng ý chuyển & làm mới giỏ hàng
            </button>
            <button
              type="button"
              onClick={() => setPendingModeChange(null)}
              className="w-full py-2.5 px-4 rounded-full border border-black/15 text-black/70 hover:bg-black/5 font-medium text-xs transition-colors cursor-pointer"
            >
              Giữ giỏ hàng hiện tại
            </button>
          </div>
        </div>
      </Dialog>

      {/* ========================================================================= */}
      {/* QR / TABLE LINK DIALOG — paste link or QR code to connect to a table */}
      {/* ========================================================================= */}
      <Dialog
        isOpen={isQrDialogOpen}
        onClose={() => {
          setIsQrDialogOpen(false);
          setQrError(null);
        }}
        title="Nhập số bàn"
        description="Kết nối giỏ hàng với bàn của bạn tại nhà hàng"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleResolveQr();
          }}
          className="p-6 space-y-4"
        >
          <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-[#234386]/5 border border-[#234386]/15">
            <div className="p-2 rounded-xl bg-[#234386] text-[#ffc400] shrink-0">
              <QrCode size={20} />
            </div>
            <div className="text-xs text-black/75 leading-relaxed space-y-1">
              <p className="font-semibold text-[#234386]">Quét QR</p>
              <p>
                Quét mã QR trên bàn để gọi món hoặc nhập số bàn nếu bạn đang có mặt tại nhà hàng.
                Mở camera điện thoại, quét mã trên bàn, rồi dán liên kết hoặc mã QR vào ô bên dưới.
              </p>
            </div>
          </div>

          {qrError && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-600 flex items-center gap-2"
            >
              <AlertCircle size={14} className="shrink-0" />
              <span>{qrError}</span>
            </div>
          )}

          <Field label="Liên kết hoặc mã QR bàn" required>
            <input
              type="text"
              required
              placeholder="Dán liên kết /table/... hoặc mã QR"
              value={qrInput}
              onChange={(e) => setQrInput(e.target.value)}
              className="w-full text-sm sm:text-xs px-3.5 py-2.5 rounded-xl border border-[#d2b68c]/50 focus:outline-none focus:border-[#234386] bg-[#fbf9f6]"
            />
          </Field>

          <button
            type="submit"
            disabled={isResolvingQr}
            className="w-full py-3 rounded-full bg-[#ed7328] hover:bg-[#d86218] text-white font-semibold text-sm shadow-md flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
          >
            {isResolvingQr ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Đang xác thực bàn ăn...</span>
              </>
            ) : (
              <>
                <span>Kết nối tới bàn</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>
      </Dialog>

      {/* ========================================================================= */}
      {/* TABLE REASSIGN CONFIRMATION DIALOG */}
      {/* ========================================================================= */}
      <Dialog
        isOpen={Boolean(pendingTableSession)}
        onClose={() => setPendingTableSession(null)}
        title="Thay Đổi Bàn Phục Vụ?"
        description="Xác nhận đổi bàn phục vụ"
      >
        <div className="p-6 text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-[#ed7328]/15 text-[#ed7328] flex items-center justify-center mx-auto">
            <Utensils size={28} />
          </div>
          <p className="text-sm text-black/70 leading-relaxed">
            Bạn đang có <strong className="text-[#ed7328]">{cartItems.length} món</strong> trong giỏ hàng
            thuộc hình thức <strong>{currentModeLabel}</strong>.
            <br />
            Bạn có muốn chuyển sang gọi món tại <strong>{pendingTableSession?.tableName}</strong> và làm mới giỏ hàng không?
          </p>
          <div className="pt-2 space-y-2.5">
            <button
              type="button"
              onClick={confirmTableReassign}
              className="w-full py-3 px-4 rounded-full bg-[#ed7328] hover:bg-[#d86218] text-white font-semibold text-xs shadow-md transition-all cursor-pointer"
            >
              Đổi sang {pendingTableSession?.tableName} (Làm mới giỏ)
            </button>
            <button
              type="button"
              onClick={() => setPendingTableSession(null)}
              className="w-full py-2.5 px-4 rounded-full border border-black/15 text-black/70 hover:bg-black/5 font-medium text-xs transition-colors cursor-pointer"
            >
              Giữ giỏ hàng hiện tại
            </button>
          </div>
        </div>
      </Dialog>

      {/* ========================================================================= */}
      {/* DELIVERY ADDRESS DIALOG */}
      {/* ========================================================================= */}
      <Dialog
        isOpen={isAddressDialogOpen}
        onClose={() => {
          setIsAddressDialogOpen(false);
          setAddressError(null);
        }}
        title="Nhập địa chỉ giao"
        description="Lưu địa chỉ và khu vực để ước tính phí giao hàng"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            confirmAddressDraft();
          }}
          className="p-6 space-y-3"
        >
          {addressError && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-600 flex items-center gap-2"
            >
              <AlertCircle size={14} className="shrink-0" />
              <span>{addressError}</span>
            </div>
          )}

          <Field label="Họ và tên người nhận">
            <input
              type="text"
              placeholder="Ví dụ: Nguyễn Văn A"
              value={addressDraft.recipientName}
              onChange={(e) => setAddressDraft((prev) => ({ ...prev, recipientName: e.target.value }))}
              className="w-full text-sm sm:text-xs px-3.5 py-2.5 rounded-xl border border-[#d2b68c]/50 focus:outline-none focus:border-[#234386] bg-[#fbf9f6]"
            />
          </Field>

          <Field label="Số điện thoại liên hệ">
            <input
              type="tel"
              placeholder="Ví dụ: 090 280 99 29"
              value={addressDraft.phone}
              onChange={(e) => setAddressDraft((prev) => ({ ...prev, phone: e.target.value }))}
              className="w-full text-sm sm:text-xs px-3.5 py-2.5 rounded-xl border border-[#d2b68c]/50 focus:outline-none focus:border-[#234386] bg-[#fbf9f6]"
            />
          </Field>

          <Field label="Địa chỉ giao" required>
            <input
              type="text"
              required
              placeholder="Số nhà, đường, khu dân cư..."
              value={addressDraft.address}
              onChange={(e) => setAddressDraft((prev) => ({ ...prev, address: e.target.value }))}
              className="w-full text-sm sm:text-xs px-3.5 py-2.5 rounded-xl border border-[#d2b68c]/50 focus:outline-none focus:border-[#234386] bg-[#fbf9f6]"
            />
          </Field>

          <Field label="Khu vực" required>
            <select
              required
              value={addressDraft.zoneId}
              onChange={(e) => setAddressDraft((prev) => ({ ...prev, zoneId: e.target.value }))}
              className="w-full text-sm sm:text-xs px-3.5 py-2.5 rounded-xl border border-[#d2b68c]/50 focus:outline-none focus:border-[#234386] bg-[#fbf9f6]"
            >
              <option value="" disabled>
                Chọn khu vực giao hàng
              </option>
              {deliveryZoneOptions.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.name} — {zone.fee_vnd.toLocaleString('vi-VN')} đ
                </option>
              ))}
            </select>
          </Field>

          <button
            type="submit"
            className="w-full py-3 rounded-full bg-[#ed7328] hover:bg-[#d86218] text-white font-semibold text-sm shadow-md flex items-center justify-center gap-2 transition-all active:scale-95"
          >
            <MapPin size={16} />
            <span>Lưu địa chỉ giao</span>
          </button>
        </form>
      </Dialog>

    </div>
  );
};
