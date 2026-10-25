# Bestseller menu images — 2026-10-23

## Delivered

Six generated photo-style illustrations saved in `public/images/menu/dishes/`:
- `ga-u-muoi.webp` — revised after the first image was rejected as resembling boiled chicken.
- `suon-nuong-tay-bac.webp`
- `suon-thai-chua-cay.webp`
- `oc-nhoi-ong-tre.webp`
- `goi-rau-ma-tep-dong.webp`
- `combo-doi-sun.webp`

Created using the built-in image_gen tool. Complete final prompts and source/output paths are in [bestseller-prompts.json](bestseller-prompts.json).
The images remain labeled `illustration`; these are not actual photographs supplied by Tiger.
Gà nướng muối ớt and cơm lam were excluded and their asset hashes were verified unchanged.

## Integration and verification

- Applied image-only SQL to local development PostgreSQL at 127.0.0.1:54322; exactly six rows updated.
- Preserved previous image fields in `bestseller-image-before.json`.
- Added migration `20261023000004_bestseller_dish_images.sql` and appended the same mapping to seed.sql.
- No prices, descriptions, availability, ranks, cart contents or orders were changed.
- Checked actual Tiger at http://localhost:5173/menu on 2026-10-23, approximately 22:46–22:47 Asia/Ho_Chi_Minh.
- Browser DOM confirmed the four changed bestseller-rail images loaded from the new local paths. Both excluded rail images kept their old paths.
- Browser search confirmed gỏi rau má tép đồng and combo dồi sụn images loaded from their new local paths.
- Opened gà ủ muối details at 390 × 844 and saved `ga-u-muoi-menu-mobile.jpg`.
- The existing rail shows six cards; all eight bestseller records retain their existing ranks.
- A subsequent desktop viewport check timed out and browser reconnection also timed out. A new desktop screenshot after the image update was not obtained. Mobile rendering and all six image loads were verified before that interruption.
- npm run typecheck: PASS.
- npm run lint: exit 0, existing warnings in unrelated source/test files.
- npm run test:unit: 40 test files, 238 tests PASS.
- npm run build: PASS; rerun after image export and confirmed generated assets in dist.
- git diff --check: PASS.
- Local database updated; no remote deployment performed.

## Self-evaluation

| Axis | Score | Evidence / remaining improvement |
| --- | --- | --- |
| Accuracy | 4/5 | Dish-specific ingredients and preparation follow the current catalog; the revised chicken has not yet been approved by the user against Tiger's actual plating. |
| Completeness | 4/5 | All six requested remaining bestsellers updated; final desktop visual check was interrupted. |
| Clarity | 4/5 | Illustration labels preserved; final prompts and screenshot included. Restaurant-supplied references would establish exact plating. |
| Actionability | 5/5 | Local menu already serves the files; seed and migration retain the mapping. |
| Conciseness | 4/5 | Deliverable kept to assets and image mappings; verification details moved into this report. |

Overall: 4.2/5. Highest-impact follow-up would be matching an actual Tiger photograph for any dish where plating differs. Do not infer user approval from generated appearance or passing tests.
