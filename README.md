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

## Enquiry portal

- Website visitors choose an enquiry type (quotation, site survey, call-back, AMC/support, brochure, vendor/partner) on **Contact** or via the floating **Enquire** button on every page.
- Staff log in at `/login.html` → `/portal/`.
  - **Tele-callers** see the *Open pool*, **take** enquiries into *My bucket*, update status (New → Contacted → Follow-up → Site visit → Quotation sent → Won / Lost), set follow-ups, add call notes and email the customer.
  - **Admins** also see every enquiry, who took it, team performance graphs, CSV export, team management and mail settings.
- **Mail settings** (admin): SMTP for sending (with optional IMAP to save a copy in the Sent folder). Emails can attach the company brochure; brochure requests from the website are answered automatically.

## Run locally

```bash
npm install
cp .env.example .env   # set ADMIN_EMAIL / ADMIN_PASSWORD
npm start              # http://localhost:5510
```

Without `DATABASE_URL`, data is stored in `data/db.json`.

## Brochure

`brochure/brochure.html` is the source of the company profile. Rebuild the PDF (needs Edge or Chrome installed):

```bash
npm run brochure       # -> assets/Motamax-Company-Profile.pdf
```

## Deploy (Render)

`render.yaml` defines the Node web service. In Render set `ADMIN_NAME`, `ADMIN_USERNAME` (or `ADMIN_EMAIL`) and `ADMIN_PASSWORD`: that admin is created at start-up if missing (never overwritten). `SESSION_SECRET` is generated automatically.

Admins manage the team under **Team**: create users (username and/or email), edit, reset passwords, and **suspend / reactivate** (suspended users are signed out immediately; their open enquiries can be returned to the pool).
