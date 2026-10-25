# Tiger345 Concierge · SVG concept 01

16 standalone SVG assets, drawn from the supplied Tiger345 chef reference.
All illustrations use editable vector geometry, gradients and SVG shadows;
no raster image is embedded. The plush reference is interpreted rather than
reproduced exactly. All assets have transparent backgrounds except app icons.

Preview: http://localhost:5173/brand/tiger345/concierge/index.html

- `tiger-chat-launcher.svg`: floating chat illustration
- `tiger-avatar.svg`: head avatar
- `tiger-app-{orange,navy,cream}.svg`: rounded app icons
- `tiger-{greeting,happy,curious,wink,surprised,love,thinking,sorry}.svg`: expressions
- `tiger-{idle,menu,serving}.svg`: additional poses
- `manifest.json`: labels, filenames and palette

Regenerate SVGs from the repository root:

    python3 scripts/design/generate-concierge-mascots.py

Use as external images (`<img src="/brand/tiger345/concierge/tiger-avatar.svg" alt="" />`).
Each standalone file uses local gradient IDs; when inlining multiple SVGs in
one document, prefix the IDs and their references per instance.

This delivery is an asset preview. It does not modify the running chatbot,
provider configuration, session state, cart or order flows.
