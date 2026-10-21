import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMenuFavorites } from '../useMenuFavorites';
import { fetchCustomerFavorites, addCustomerFavorite, removeCustomerFavorite } from '@/features/account/api';
vi.mock('@/features/account/api', () => ({ fetchCustomerFavorites: vi.fn(), addCustomerFavorite: vi.fn(), removeCustomerFavorite: vi.fn() }));
beforeEach(() => { vi.resetAllMocks(); vi.mocked(fetchCustomerFavorites).mockResolvedValue([]); });
describe('menu favorites', () => {
  it('does not trigger another full menu render when a guest opens the page', () => {
    let renders = 0;
    renderHook(() => { renders++; return useMenuFavorites('guest'); });
    expect(renders).toBe(1);
  });
  it('asks guests to log in without marking or saving the dish', async () => {
    const { result } = renderHook(() => useMenuFavorites('guest'));
    await act(() => result.current.toggle('dish'));
    expect(result.current.notice?.login).toBe(true);
    expect(result.current.favorites.dish).toBeUndefined();
    expect(addCustomerFavorite).not.toHaveBeenCalled();
  });
  it('loads saved dishes and removes a favorite', async () => {
    vi.mocked(fetchCustomerFavorites).mockResolvedValue([{ menu_item_id: 'dish' }] as Awaited<ReturnType<typeof fetchCustomerFavorites>>);
    const { result } = renderHook(() => useMenuFavorites('customer', 'user'));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.favorites.dish).toBe(true);
    await act(() => result.current.toggle('dish'));
    expect(removeCustomerFavorite).toHaveBeenCalledWith('dish');
    expect(result.current.favorites.dish).toBe(false);
    expect(result.current.notice?.text).toContain('Đã bỏ');
  });
  it('rolls back a failed save and reports the failure', async () => {
    vi.mocked(addCustomerFavorite).mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useMenuFavorites('customer', 'user'));
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(() => result.current.toggle('dish'));
    expect(result.current.favorites.dish).toBe(false);
    expect(result.current.notice?.error).toBe(true);
    expect(result.current.pending.dish).toBe(false);
  });
  it('ignores a rapid second click while saving', async () => {
    let finish!: () => void;
    vi.mocked(addCustomerFavorite).mockImplementation(() => new Promise((resolve) => { finish = () => resolve({} as Awaited<ReturnType<typeof addCustomerFavorite>>); }));
    const { result } = renderHook(() => useMenuFavorites('customer', 'user'));
    await waitFor(() => expect(result.current.ready).toBe(true));
    let saving!: Promise<void>;
    act(() => { saving = result.current.toggle('dish'); void result.current.toggle('dish'); });
    expect(addCustomerFavorite).toHaveBeenCalledTimes(1);
    await act(async () => { finish(); await saving; });
    expect(result.current.notice?.text).toContain('Đã lưu');
  });
});
