import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchCustomerFavorites, addCustomerFavorite, removeCustomerFavorite } from '@/features/account/api';

const EMPTY_FLAGS: Record<string, boolean> = {};

export function useMenuFavorites(role: string, userId?: string) {
  const [favorites, setFavorites] = useState<Record<string, boolean>>(EMPTY_FLAGS);
  const [pending, setPending] = useState<Record<string, boolean>>(EMPTY_FLAGS);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<{ text: string; login?: boolean; error?: boolean } | null>(null);
  const [reload, setReload] = useState(0);
  const generation = useRef(0);
  const inFlight = useRef(new Set<string>());

  useEffect(() => {
    const current = ++generation.current;
    inFlight.current.clear();
    setFavorites(EMPTY_FLAGS);
    setPending(EMPTY_FLAGS);
    setReady(false);
    setNotice(null);
    if (role === 'customer') {
      fetchCustomerFavorites().then((items) => {
        if (generation.current !== current) return;
        setFavorites(Object.fromEntries(items.map((item) => [item.menu_item_id, true])));
        setReady(true);
      }).catch(() => {
        if (generation.current === current) setNotice({ text: 'Chưa tải được món yêu thích. Vui lòng thử lại.', error: true });
      });
    }
    return () => { generation.current++; };
  }, [role, userId, reload]);

  const toggle = useCallback(async (id: string) => {
    if (role !== 'customer') {
      setNotice(role === 'admin'
        ? { text: 'Tính năng yêu thích dành cho tài khoản khách hàng.' }
        : { text: 'Đăng nhập để lưu món yêu thích.', login: true });
      return;
    }
    if (!ready || inFlight.current.has(id)) return;
    const current = generation.current;
    const next = !favorites[id];
    inFlight.current.add(id);
    setPending((prev) => ({ ...prev, [id]: true }));
    setFavorites((prev) => ({ ...prev, [id]: next }));
    try {
      if (next) await addCustomerFavorite(id);
      else await removeCustomerFavorite(id);
      if (generation.current === current) setNotice({ text: next ? 'Đã lưu món yêu thích.' : 'Đã bỏ món khỏi yêu thích.' });
    } catch {
      if (generation.current === current) {
        setFavorites((prev) => ({ ...prev, [id]: !next }));
        setNotice({ text: 'Không lưu được thay đổi. Vui lòng thử lại.', error: true });
      }
    } finally {
      if (generation.current === current) {
        inFlight.current.delete(id);
        setPending((prev) => ({ ...prev, [id]: false }));
      }
    }
  }, [role, ready, favorites]);
  return { favorites, pending, ready, notice, dismiss: () => setNotice(null), retry: () => setReload((n) => n + 1), toggle };
}
