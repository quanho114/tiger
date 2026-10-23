-- Photo-style generated illustrations; never label these as restaurant photographs.
-- Change only image fields; keep prices, availability and bestseller ordering intact.
UPDATE public.menu_items AS item
SET image_path = '/images/menu/dishes/' || images.slug || '.webp',
    image_source = 'illustration'
FROM (VALUES
    ('ga-u-muoi'),
    ('suon-nuong-tay-bac'),
    ('suon-thai-chua-cay'),
    ('oc-nhoi-ong-tre'),
    ('goi-rau-ma-tep-dong'),
    ('combo-doi-sun')
) AS images(slug)
WHERE item.slug = images.slug;
