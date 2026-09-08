# Responsive layout

The app uses the device viewport and retains browser zoom. CSS handles the layout before JavaScript loads; the live navigation subscribes to screen-size changes after hydration.

| Available width | Live workspace |
| --- | --- |
| Up to 640 CSS pixels | One-column content, labelled record cards for all four data tables, stacked forms and full-width primary actions |
| 641–1023 CSS pixels | Full-width tablet workspace, two-column property/plan cards, contained table scrolling and a navigation drawer |
| 1024–1599 CSS pixels | Persistent sidebar and desktop tables with flexible content widths |
| 1600 CSS pixels and above | Wider, capped workspace with larger headings; content does not stretch indefinitely |

The drawer has a backdrop, Escape/close handling, focus trapping and restoration, and an inert page underneath. Closed navigation is hidden from keyboard interaction. It scrolls independently in short landscape screens. The top bar remains available while scrolling.

Phone tables retain their headers and explicit table/row/cell semantics while showing visible field labels on each record. Long names, emails and references wrap. Inputs use 16px text on smaller devices to avoid iOS focus zoom, touch controls have a 44px minimum height, and QR codes scale within their card. Safe-area spacing accommodates notches and home indicators. The marketing navigation remains reachable on small screens through a horizontally scrollable navigation row.

## Visual acceptance checks still to run

No connected browser was available during this update; these are target checks, not claimed visual test results. Build/type checks and the existing production HTTP workflow are run separately.

- Review at 320, 390, 640, 768, 1024, 1366 and 1920 CSS-pixel widths, including long organisation names and emails.
- Open/close the drawer by touch, keyboard and Escape; rotate or resize with it open. Confirm focus restoration and scroll locking.
- Review every live workspace tab and the separate demo roles. Check all table actions at phone width, and contained table scrolling on tablets.
- Use enrolment, login, recovery, visitor and report forms with the onscreen keyboard open. Confirm every field and submit button stays reachable.
- Check the visitor QR at narrow widths, scan it on a physical device, and print/save its PDF.
- Check landscape phones, notched devices, 200% browser zoom, reduced-motion settings and a screen reader.
