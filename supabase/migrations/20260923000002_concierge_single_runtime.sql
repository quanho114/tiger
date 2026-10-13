-- The browser and public API now use one Concierge runtime.
DELETE FROM public.system_settings WHERE key = 'concierge_v2_enabled';
