-- Keep the signature chicken and bamboo rice together in the featured rail.
UPDATE public.menu_items AS item
SET featured_rank = priority.rank
FROM (VALUES
    ('ga-nuong-muoi-ot', 1),
    ('com-lam', 2),
    ('ga-u-muoi', 3),
    ('suon-nuong-tay-bac', 4),
    ('suon-thai-chua-cay', 5),
    ('oc-nhoi-ong-tre', 6),
    ('goi-rau-ma-tep-dong', 7),
    ('combo-doi-sun', 8)
) AS priority(slug, rank)
WHERE item.slug = priority.slug;
