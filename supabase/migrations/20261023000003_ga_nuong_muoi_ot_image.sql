-- AI-assisted restyling of the restaurant-supplied chicken photograph.
-- Keep the illustration label because the serving arrangement was edited.
UPDATE public.menu_items
SET image_path = '/images/menu/dishes/ga-nuong-muoi-ot.webp',
    image_source = 'illustration'
WHERE slug = 'ga-nuong-muoi-ot';
