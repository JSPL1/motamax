# Motamax India — Website

Static website for **Motamax India Private Limited** (Bhubaneswar, Odisha) — Solution Architecture, Automation and Infrastructure Development.

- `index.html` — home: animated capability map, client strip, key numbers, links to every page
- `about.html` — mission, vision, values, delivery process, credentials
- `services.html` — 3 domains + detailed expertise
- `industries.html` — 11 sectors with solutions and clients served
- `stories.html` — success stories with sector filter
- `clients.html` — key clients
- `work.html` — site photo gallery with lightbox
- `contact.html` — addresses, phone, WhatsApp, email, enquiry form
- `login.html` — login page with a Back button
- `css/style.css`, `css/motion.css`, `css/pages.css` — glass design system, animations, page layouts
- `js/main.js` — content data and interactions
- `assets/` — logo, site photos and the downloadable company profile PDF

## Run locally

```bash
python -m http.server 5510
```

Then open http://localhost:5510.

## Login

The login page has no backend yet. Set `AUTH_ENDPOINT` in `login.html` to your authentication API to enable sign-in.

## Deploy

Works as-is on GitHub Pages (Settings → Pages → deploy from `main`, root).
