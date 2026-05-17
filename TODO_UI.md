# UI Upgrade Plan (No Functionality Changes)

- [x] Inspect existing HTML pages and shared CSS (`public/style.css`).
- [x] Add shared, professional layout helpers to CSS only (typography, spacing, buttons, inputs, tables, modals, timeline, cards).
- [x] Update `public/index.html` to reduce inline footer/section styling using new CSS classes.
- [ ] Update `public/order.html` to reduce inline panel styling (file list + modal surfaces) using new CSS classes.
- [x] Update `public/tracking.html` to reduce inline panel styling (uploaded files + spacing) using new CSS classes.
- [ ] Update `public/admin1.html` to reduce inline styling where safe (without touching JS selectors/IDs).
- [x] Run a quick smoke test by starting the server and loading each page to ensure no visual regression breaks functionality.


