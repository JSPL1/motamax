# Motamax India — Website

Static website for **Motamax India Private Limited** (Bhubaneswar, Odisha) — Solution Architecture, Automation and Infrastructure Development.

- `index.html` — main site: about, services (3 domains + detailed expertise), delivery process, industries, success stories, clients, site gallery, credentials, contact
- `login.html` — login page with a Back button
- `css/style.css` — iOS-style glass design system (light & dark mode)
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
