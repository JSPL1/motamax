/* Motamax India — site interactions & content */
(function () {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const icon = (id) => `<svg><use href="#${id}"/></svg>`;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ------------------------------------------------------------------ */
  /* Content (from the Motamax company profile)                          */
  /* ------------------------------------------------------------------ */

  const DOMAINS = {
    arch: [
      ['i-server', 'bg-navy', 'IT Infrastructure', 'Desktops, laptops, servers, MFPs, office automation, and IT operation & support services.'],
      ['i-cable', 'bg-sky', 'Structured Cabling', 'UTP and fibre backbones with Panduit & Fluke networks, racks, splicing and OTDR testing.'],
      ['i-cam', 'bg-red', 'CCTV & Security', 'Surveillance, analytics, access control, biometrics, boom barriers, flap & turnstile barriers.'],
      ['i-clock', 'bg-orange', 'Time‑lapse Systems', 'Construction progress monitoring with high‑definition time‑lapse cameras.'],
      ['i-phone', 'bg-green', 'Telecom Solutions', 'EPABX / IPPBX, SIP & VoIP, intercom and telecom infrastructure build‑up.'],
      ['i-speaker', 'bg-purple', 'PA Systems', 'Public address & voice alarm (PA & VA) for plants, campuses and terminals.'],
      ['i-video', 'bg-teal', 'AVSI & Conferencing', 'Audio‑video system integration, audio & video conferencing and telepresence.'],
      ['i-display', 'bg-pink', 'Indoor & Outdoor Displays', 'Video walls, LED/LCD, interactive panels, control rooms and industrial monitors.'],
      ['i-db', 'bg-navy', 'Data Centre Infrastructure', 'Complete data‑centre build‑up — racks, power, cabling and active equipment.'],
      ['i-radio', 'bg-red', 'Critical Walkie‑Talkie Comms', 'Emergency & critical communication over MCX, DMR, TETRA and private 4G/5G.']
    ],
    auto: [
      ['i-gear', 'bg-navy', 'Electrical Switch Automation', 'Smart switching and remote control of electrical loads for plants and buildings.'],
      ['i-scale', 'bg-orange', 'Weighbridge Automation', 'Unmanned weighbridges with cameras, RFID, boom barriers and ERP integration.'],
      ['i-flow', 'bg-sky', 'Business Process Automation', 'HRMS, CLMS and office management solutions that digitise day‑to‑day operations.'],
      ['i-ai', 'bg-purple', 'AI & Analytics', 'Computer vision, CCTV video analytics, and process optimisation for time and resources.'],
      ['i-chart', 'bg-green', 'Fleet & Vehicle Tracking', 'Real‑time tracking of fleets and vehicles across plants, mines and logistics yards.'],
      ['i-class', 'bg-pink', 'Smart Classrooms', 'Interactive boards, integrated digital classrooms and campus AV solutions.']
    ],
    infra: [
      ['i-net', 'bg-sky', 'Wired & Wireless Networking', 'LAN/WAN, indoor & outdoor access points, P2P links, RF, switches, routers & firewalls.'],
      ['i-cable', 'bg-navy', 'OFC & FTTx', 'Underground and overhead OFC, FTTx / IBD projects and NLD‑OFC by HDD.'],
      ['i-light', 'bg-orange', 'Street Lighting', 'Street and area lighting for townships, plants, corridors and industrial yards.'],
      ['i-bolt', 'bg-red', 'Electrical Works (HT & LT)', 'Substations from 16 kVA, HT/LT construction, panels, DISCOM liaisoning to charging.'],
      ['i-sun', 'bg-green', 'Solar Solutions', 'Solar panels, inverters, batteries and solar‑powered lighting & CCTV.'],
      ['i-battery', 'bg-purple', 'Power Backup', 'DG supply, hiring, swapping & inspection; online/offline UPS and battery systems.'],
      ['i-tools', 'bg-teal', 'Industrial Tools & Equipment', 'Tools, measuring instruments, dust suppression, utilities air & gas services.'],
      ['i-build', 'bg-pink', 'EPC & Site Preparation', 'EPC services, temporary facilities and complete construction‑site packages.']
    ]
  };

  const EXPERTISE = [
    ['i-bolt', 'bg-red', 'Electrical Services', [
      'End‑to‑end process from application and DISCOM liaisoning to inspection and charging',
      'HT & LT construction',
      'Electrical transformation — single pole, double pole and plinth‑mounted substations from 16 kVA, with overhead & underground cabling and civil foundations',
      'Electrical lighting solutions for industries',
      'All types of electrical panels and distribution boards',
      'Industrial HT & LT motors',
      'Compliance inspection consultancy for new and renewal installations',
      'DG supply & installation, DG hiring, inspection and swapping services in the telecom sector',
      'HVAC — equipment, filters, AHU, ducting, clean rooms and modular OT',
      'Offline & online UPS, battery systems and telecom ODC electrical activities'
    ]],
    ['i-server', 'bg-navy', 'Information Technology (IT)', [
      'IT hardware — desktops, laptops, multifunction printers and servers',
      'Office automation products',
      'Complete wired & wireless network infrastructure — indoor/outdoor access points, P2P links, RF devices',
      'Active devices — switches, routers, firewalls and IT security solutions',
      'Passive infrastructure — OFC (UG/overhead) and UTP cabling',
      'Racks, splicing and OTDR; Panduit and Fluke networks',
      'Complete data‑centre infrastructure build‑up',
      'IT operation and support services'
    ]],
    ['i-cam', 'bg-sky', 'CCTV Surveillance & Security', [
      'Solution architecture and project build‑up of CCTV surveillance for industries, plants and corporates',
      'CCTV analytics solutions',
      'Access control & biometric attendance systems',
      'Fire detection systems, boom barriers, flap and turnstile barriers',
      'Drones — from idea forge to civil and security applications',
      'High‑definition cameras & monitoring for schools, colleges, corporate, industrial and home segments',
      'Digital, wired, wireless, GSM SIM‑based and solar‑based CCTV'
    ]],
    ['i-ai', 'bg-purple', 'AI & Business Process Automation', [
      'Computer vision',
      'Time‑lapse solutions',
      'Video analytics using CCTV & AI',
      'Industry process optimisation for time and resources',
      'Fleet and vehicle tracking system',
      'Weighbridge automation',
      'Electrical switch automation',
      'HRMS, CLMS and other office management solutions'
    ]],
    ['i-phone', 'bg-green', 'Communication Engineering', [
      'Telecom infrastructure build‑up',
      'EPABX / IPPBX / SIP and VoIP solutions',
      'FTTx / IBD project construction',
      'NLD‑OFC by HDD',
      'PA & VA systems',
      'Audio and video conferencing solutions',
      'AVSI (Audio Video System Integration)',
      'Telepresence systems'
    ]],
    ['i-radio', 'bg-orange', 'Walkie‑Talkie Services', [
      'Emergency and critical communications using walkie‑talkies',
      'MCX', 'DMR', 'TETRA', '4G / 5G public and private networks'
    ]],
    ['i-display', 'bg-pink', 'Display Solutions', [
      'All types of display solutions', 'Video walls', 'All‑in‑one systems', 'Indoor & outdoor LED / LCD displays',
      'Interactive panels', 'Control room solutions', 'Industrial monitors'
    ]],
    ['i-class', 'bg-teal', 'Smart Classroom Solutions', [
      'Interactive board solutions', 'Complete integrated solutions', 'Digital classrooms'
    ]],
    ['i-sun', 'bg-green', 'Solar', [
      'Solar panels', 'Inverters', 'Batteries', 'Lighting & other industrial applications'
    ]],
    ['i-tools', 'bg-navy', 'Industrial Project Requirements', [
      'All types of tools & equipment', 'Measuring instruments', 'Environmental (Bio & Agri) solutions',
      'Dust suppression systems', 'Utilities — air and gas services'
    ]],
    ['i-build', 'bg-red', 'One‑Stop Solution for Project Construction', [
      'EPC services', 'Temporary facilities & site preparation',
      'Design, installation, testing and commissioning of IT, electrical, telecom, CCTV, fire‑fighting & security works'
    ]]
  ];

  const STAGES = [
    ['Consult', 'Requirement analysis', 'Site survey and discussion with your team to understand operational needs, constraints and compliance.'],
    ['Design', 'Solution architecture', 'Selecting the right mix of IT, electrical, security, communication and automation systems for the site.'],
    ['Engineer', 'Engineering & approvals', 'Detailed design, drawings and BOQ — including statutory liaisoning such as DISCOM applications.'],
    ['Supply', 'Procurement & supply', 'Sourcing and supplying the specified equipment, materials, tools and instruments.'],
    ['Install', 'Installation', 'Site execution — civil foundations, cabling, mounting and system integration.'],
    ['Commission', 'Testing & commissioning', 'Inspection, testing and charging through to go‑live, with results documented.'],
    ['Train', 'Training & handover', 'Training for operators and handover of systems and documentation to your team.'],
    ['Maintain', 'Operational maintenance', 'Ongoing operation and support services to keep systems running after handover.']
  ];

  const INDUSTRIES = [
    { name: 'Steel & Metals', note: 'Large, continuous‑process plants where networks, surveillance and power have to run without interruption.', sol: ['Industrial IT & networking', 'CCTV & video analytics', 'Electrical works (HT & LT)', 'Weighbridge automation', 'Control‑room displays', 'Critical walkie‑talkie communication'], served: 'JSW Group · Jindal Steel & Power (JSPL) · Jindal Stainless · IMFA · Hindalco' },
    { name: 'Mining', note: 'Remote, spread‑out operations that depend on reliable communication, surveillance and power.', sol: ['CCTV & surveillance', 'Networking', 'Communication systems', 'Electrical infrastructure', 'Automation', 'Displays / control room', 'Industrial tools'], served: 'Hindustan Copper · NLC India (Ministry of Coal) · OMC · mines across Odisha, Rajasthan and MP' },
    { name: 'Manufacturing', note: 'Plants that need IT, automation and electrical systems engineered to work together.', sol: ['Industrial IT', 'CCTV', 'Automation', 'Electrical', 'Communication', 'Control room & displays', 'Networking'], served: 'Reliance Industries · Aditya Birla Group · UltraTech · MP Birla Group' },
    { name: 'Construction', note: 'Projects and townships where systems are installed while the site is still being built.', sol: ['IT & networking', 'Telecom / intercom', 'CCTV — perimeter, common areas, lifts', 'Access control', 'Boom barriers', 'Biometric attendance', 'Electrical infrastructure', 'Time‑lapse progress monitoring'], served: 'AMSB Infra · DN Group · Vaterland Group · Falcon Crest · Shradha Saboori Group · OEYE MEP' },
    { name: 'Government & PSU', note: 'Public‑sector facilities with defined specifications and documentation requirements.', sol: ['IT infrastructure', 'CCTV & security', 'Data centre infrastructure', 'Audio & video conferencing', 'Electrical works', 'Networking'], served: 'CPWD · AG Office Bhubaneswar · DRDO · LIC · OMC' },
    { name: 'Telecom', note: 'Network build‑out and site electrical work for telecom operators and infrastructure providers.', sol: ['Telecom infrastructure build‑up', 'OFC & FTTx', 'NLD‑OFC by HDD', 'DG & power backup', 'Telecom ODC electrical activities'], served: 'Bharti Airtel · STL' },
    { name: 'Ports & Logistics', note: 'Large perimeters and heavy vehicle movement.', sol: ['CCTV & perimeter surveillance', 'Weighbridge automation', 'Networking', 'Critical walkie‑talkie communication', 'Street lighting'], served: 'Paradip Port Authority · KICTPL · Mahindra Logistics' },
    { name: 'Railways & Transport', note: 'Stations, terminals and corridors that need communication, display and power systems.', sol: ['CCTV', 'PA systems', 'Display solutions', 'OFC', 'Electrical works'], served: 'Indian Railways · RITES · BMRCL' },
    { name: 'Education & Research', note: 'Campuses, labs and classrooms.', sol: ['Smart classroom solutions', 'Interactive panels', 'Campus networking', 'CCTV', 'AV systems'], served: 'IIT · DRDO · Siksha ‘O’ Anusandhan' },
    { name: 'Energy & Utilities', note: 'Power generation, distribution and renewable installations.', sol: ['Electrical works (HT & LT)', 'Solar solutions', 'Power backup', 'Street lighting', 'CCTV'], served: 'Tata Power · OHPC · NLC India' },
    { name: 'Enterprise & Media', note: 'Corporate offices and broadcast facilities.', sol: ['AV & conferencing', 'Display solutions', 'IT infrastructure', 'Networking', 'PA systems'], served: 'OTV · Luminous Infoways · Indian Oil · The HHI' }
  ];

  const STORIES = [
    { cat: 'Industrial', color: 'bg-navy', img: 'i7', title: 'Surveillance & networks for integrated steel plants', client: 'JSW Group · Jindal Steel & Power (JSPL)', text: 'Plant‑wide IT and security systems for continuous‑process steel operations, where networks, cameras and power must run around the clock.', tags: ['CCTV & analytics', 'Industrial networking', 'Weighbridge automation', 'Control room'] },
    { cat: 'Mining', color: 'bg-orange', img: 'i5', title: 'Connected, secured mines across three states', client: 'Hindustan Copper · NLC India · mines in Odisha, Rajasthan & MP', text: 'Communication, surveillance and power for remote, spread‑out mining operations — including solar‑powered CCTV where grid power is not available.', tags: ['Solar CCTV', 'Walkie‑talkie comms', 'Electrical HT/LT', 'Networking'] },
    { cat: 'Industrial', color: 'bg-purple', img: 'i13', title: 'IT & automation for large manufacturing groups', client: 'Reliance Industries · Aditya Birla Group · Mahindra Group', text: 'IT infrastructure, automation and electrical works engineered to work together on manufacturing and logistics sites.', tags: ['IT infrastructure', 'Automation', 'Electrical', 'Displays'] },
    { cat: 'Telecom', color: 'bg-green', img: 'i20', title: 'OFC roll‑out & telecom site power', client: 'Bharti Airtel · STL', text: 'Telecom infrastructure build‑up including OFC / FTTx, NLD‑OFC by horizontal directional drilling, and DG & ODC electrical activities.', tags: ['OFC & FTTx', 'HDD', 'DG services', 'Telecom ODC'] },
    { cat: 'Government', color: 'bg-red', img: 'i11', title: 'Secure IT for defence, research & public offices', client: 'DRDO · IIT · CPWD · AG Office Bhubaneswar', text: 'IT infrastructure, data‑centre components, CCTV and conferencing delivered to defined Government specifications and documentation standards.', tags: ['Data centre', 'CCTV & security', 'AV conferencing', 'Networking'] },
    { cat: 'Government', color: 'bg-sky', img: 'i8', title: 'Perimeter security for ports & terminals', client: 'Paradip Port Authority · KICTPL', text: 'Large‑perimeter CCTV, weighbridge automation and critical communications for high‑traffic port and logistics environments.', tags: ['Perimeter CCTV', 'Weighbridge', 'Critical comms', 'Street lighting'] },
    { cat: 'Industrial', color: 'bg-teal', img: 'e4', title: 'Substations & HT/LT electrical works', client: 'Industrial plants, utilities & OMC', text: 'From DISCOM application and liaisoning through transformer installation, panels and inspection to charging — complete electrical delivery.', tags: ['Substations', 'HT & LT', 'Panels', 'DISCOM liaison'] },
    { cat: 'Government', color: 'bg-pink', img: 'i15', title: 'Communication & power along rail corridors', client: 'Indian Railways · RITES · BMRCL', text: 'CCTV, PA systems, displays, OFC and electrical works for stations, terminals and transport corridors.', tags: ['PA systems', 'Displays', 'OFC', 'CCTV'] },
    { cat: 'Construction', color: 'bg-orange', img: 'i3', title: 'Smart security for townships & terminals', client: 'OEYE MEP — Baibhav Group, Metro Group, Police Housing', text: 'Access control, biometric attendance, boom barriers and CCTV for residential towers, police housing projects and truck / bus terminals.', tags: ['Access control', 'Boom barriers', 'Biometrics', 'Lift CCTV'] },
    { cat: 'Construction', color: 'bg-navy', img: 'i14', title: 'IOCL township expansion project', client: 'Shradha Saboori Group', text: 'IT, telecom / intercom, CCTV and security systems installed alongside construction for the IOCL township expansion.', tags: ['Intercom', 'CCTV', 'Networking', 'Security'] }
  ];

  const CLIENTS = [
    ['Reliance Industries', 'Energy & Petrochem'], ['Indian Oil', 'Oil & Gas'], ['CPWD', 'Government'], ['Aditya Birla (Hindalco)', 'Metals'],
    ['Bharti Airtel', 'Telecom'], ['JSW Group', 'Steel'], ['Jindal Steel & Power', 'Steel'], ['Mahindra Logistics', 'Logistics'],
    ['CSM Technologies', 'IT'], ['Paradip Port Authority', 'Ports'], ['BMRCL', 'Metro Rail'], ['MP Birla Group', 'Cement'],
    ['Alexis', 'Enterprise'], ['Luminous Infoways', 'IT'], ['KCC', 'Infrastructure'], ['STL', 'Telecom'],
    ['Power HF', 'Power'], ['RITES Limited', 'Railways PSU'], ['Vaterland Group', 'Construction'], ['The HHI Bhubaneswar', 'Hospitality'],
    ['KICTPL', 'Ports'], ['AE Commercial', 'Commercial'], ['DRDO', 'Defence R&D'], ['IIT', 'Education'],
    ['OHPC', 'Hydro Power'], ['Siksha ‘O’ Anusandhan', 'Education'], ['LIC of India', 'Insurance'], ['Odisha TV (OTV)', 'Media'],
    ['Tushali', 'Hospitality'], ['UltraTech Cement', 'Cement'], ['Indian Railways', 'Railways'], ['NLC India', 'Ministry of Coal'],
    ['Hindustan Copper', 'Mining PSU'], ['IMFA', 'Ferro Alloys'], ['Manikstu', 'Agro'], ['Jindal Stainless', 'Steel'],
    ['AG Office Bhubaneswar', 'Government'], ['OEYE MEP Engineers', 'MEP'], ['Tata Power', 'Power'], ['OMC', 'Mining PSU']
  ];

  const GALLERY = [
    ['e1', 'Electrical', 'Substation structure'], ['e2', 'Electrical', 'Pole‑mounted transformer'], ['e3', 'Electrical', 'Overhead line work'], ['e4', 'Electrical', 'Transformer installation'],
    ['e5', 'Electrical', 'Site electrical works'], ['e6', 'Electrical', 'Street lighting pole'], ['e7', 'Electrical', 'Electrical control panel'], ['e8', 'Electrical', 'Distribution panel'],
    ['i1', 'IT & Networking', 'Fibre splice enclosure'], ['i2', 'IT & Networking', 'Aerial cabling'], ['i3', 'CCTV & Security', 'Biometric / access terminal'], ['i4', 'IT & Networking', 'Site survey'],
    ['i5', 'CCTV & Security', 'Solar‑powered CCTV'], ['i6', 'Automation', 'Weighbridge automation layout'], ['i7', 'CCTV & Security', 'CCTV monitoring station'], ['i8', 'CCTV & Security', 'Pole‑mounted cameras'],
    ['i9', 'Automation', 'Smart switch panel'], ['i10', 'IT & Networking', 'Tower installation'], ['i11', 'IT & Networking', 'Network rack'], ['i12', 'IT & Networking', 'Wall‑mounted network equipment'],
    ['i13', 'IT & Networking', 'Network cabinet'], ['i14', 'IT & Networking', 'Cable tray routing'], ['i15', 'Civil & OFC', 'Site corridor works'], ['i16', 'Civil & OFC', 'Excavation'],
    ['i17', 'Civil & OFC', 'Trenching'], ['i18', 'Civil & OFC', 'Road corridor route'], ['i19', 'Civil & OFC', 'Drilling site'], ['i20', 'Civil & OFC', 'HDD rig']
  ].map(([id, cat, cap]) => ({ src: `assets/site/${id}.jpg`, cat, cap }));

  const MONO_COLORS = ['bg-navy', 'bg-sky', 'bg-red', 'bg-green', 'bg-orange', 'bg-purple', 'bg-teal', 'bg-pink'];

  /* ------------------------------------------------------------------ */
  /* Rendering                                                           */
  /* ------------------------------------------------------------------ */

  // Marquee (duplicated for a seamless loop)
  const mq = $('#marquee');
  if (mq) {
    const names = CLIENTS.map((c) => `<span>${esc(c[0])}</span>`).join('');
    mq.innerHTML = names + names;
  }

  // Domain panels
  const panels = $('#domainPanels');
  if (panels) {
    panels.innerHTML = Object.entries(DOMAINS).map(([key, items], i) => `
      <div class="domain-panel${i === 0 ? ' active' : ''}" data-panel="${key}" role="tabpanel">
        <div class="svc-grid">
          ${items.map(([ic, bg, t, d]) => `
            <article class="svc glass">
              <span class="card-icon ${bg}">${icon(ic)}</span>
              <h4>${esc(t)}</h4><p>${esc(d)}</p>
            </article>`).join('')}
        </div>
      </div>`).join('');
  }
  $$('#domainTabs button').forEach((b) => b.addEventListener('click', () => {
    $$('#domainTabs button').forEach((x) => x.classList.toggle('active', x === b));
    $$('.domain-panel').forEach((p) => p.classList.toggle('active', p.dataset.panel === b.dataset.domain));
  }));

  // Expertise accordions
  const exp = $('#expertise');
  if (exp) {
    exp.innerHTML = EXPERTISE.map(([ic, bg, t, list], i) => `
      <details class="acc glass reveal"${i < 2 ? ' open' : ''}>
        <summary><span class="card-icon ${bg}">${icon(ic)}</span>${esc(t)}
          <span class="count">${list.length} items</span><span class="chev"><svg width="14" height="14"><use href="#i-down"/></svg></span></summary>
        <ul>${list.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
      </details>`).join('');
  }

  // Process
  const proc = $('#process-grid');
  if (proc) {
    proc.innerHTML = STAGES.map(([k, t, d]) => `
      <div class="step glass reveal"><span class="num">${esc(k)}</span><h4>${esc(t)}</h4><p>${esc(d)}</p><span class="bar"></span></div>`).join('');
  }

  // Industries
  const indList = $('#indList');
  const indDetail = $('#indDetail');
  function showIndustry(i) {
    const d = INDUSTRIES[i];
    $$('button', indList).forEach((b, j) => { b.classList.toggle('active', j === i); b.setAttribute('aria-selected', j === i); });
    indDetail.innerHTML = `
      <span class="eyebrow">Industry ${String(i + 1).padStart(2, '0')} / ${INDUSTRIES.length}</span>
      <h3 style="margin-top:16px">${esc(d.name)}</h3>
      <p class="note">${esc(d.note)}</p>
      <div class="chips">${d.sol.map((s) => `<span class="chip">${esc(s)}</span>`).join('')}</div>
      <div class="served"><small>Clients served</small><p>${esc(d.served)}</p></div>`;
    indDetail.animate?.([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'ease-out' });
  }
  if (indList && indDetail) {
    indList.innerHTML = INDUSTRIES.map((d) => `<button role="tab">${esc(d.name)}</button>`).join('');
    $$('button', indList).forEach((b, i) => b.addEventListener('click', () => showIndustry(i)));
    showIndustry(0);
  }

  // Success stories
  const sg = $('#storyGrid');
  if (sg) {
    sg.innerHTML = STORIES.map((s) => `
      <article class="story glass reveal" data-cat="${esc(s.cat)}">
        <div class="thumb"><img src="assets/site/${s.img}.jpg" alt="${esc(s.title)}" loading="lazy"><span class="story-tag ${s.color}">${esc(s.cat)}</span></div>
        <div class="s-body">
          <h4>${esc(s.title)}</h4>
          <div class="client">${esc(s.client)}</div>
          <p>${esc(s.text)}</p>
          <div class="delivered">${s.tags.map((t) => `<span>${esc(t)}</span>`).join('')}</div>
        </div>
      </article>`).join('');
  }
  $$('#storyFilter button').forEach((b) => b.addEventListener('click', () => {
    $$('#storyFilter button').forEach((x) => x.classList.toggle('active', x === b));
    const f = b.dataset.filter;
    $$('.story').forEach((s) => s.classList.toggle('hide', f !== 'all' && s.dataset.cat !== f));
    const feat = $('#featuredStory');
    if (feat) feat.style.display = (f === 'all' || f === 'Construction') ? '' : 'none';
  }));

  // Clients
  const cg = $('#clientGrid');
  if (cg) {
    cg.innerHTML = CLIENTS.map(([n, s], i) => {
      const initials = n.replace(/[^A-Za-z ]/g, '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
      return `<div class="client glass reveal"><span class="mono ${MONO_COLORS[i % MONO_COLORS.length]}">${initials}</span><div><b>${esc(n)}</b><small>${esc(s)}</small></div></div>`;
    }).join('');
  }

  // Gallery + lightbox
  const gg = $('#galleryGrid');
  let visible = GALLERY.slice();
  let lbIndex = 0;
  if (gg) {
    gg.innerHTML = GALLERY.map((g, i) => `
      <figure class="g-item" data-cat="${esc(g.cat)}" data-i="${i}">
        <img src="${g.src}" alt="${esc(g.cap)}" loading="lazy">
        <figcaption>${esc(g.cap)}<small>${esc(g.cat)}</small></figcaption>
      </figure>`).join('');
    gg.addEventListener('click', (e) => {
      const fig = e.target.closest('.g-item');
      if (!fig) return;
      const g = GALLERY[+fig.dataset.i];
      lbIndex = visible.indexOf(g);
      openLb();
    });
  }
  $$('#galleryFilter button').forEach((b) => b.addEventListener('click', () => {
    $$('#galleryFilter button').forEach((x) => x.classList.toggle('active', x === b));
    const f = b.dataset.filter;
    visible = GALLERY.filter((g) => f === 'all' || g.cat === f);
    $$('.g-item').forEach((el) => el.classList.toggle('hide', f !== 'all' && el.dataset.cat !== f));
  }));
  const lb = $('#lightbox');
  function renderLb() {
    const g = visible[lbIndex];
    $('#lbImg').src = g.src; $('#lbImg').alt = g.cap;
    $('#lbCap').textContent = `${g.cap} · ${g.cat}  (${lbIndex + 1}/${visible.length})`;
  }
  function openLb() { renderLb(); lb.classList.add('open'); document.body.style.overflow = 'hidden'; }
  function closeLb() { lb.classList.remove('open'); document.body.style.overflow = ''; }
  function stepLb(d) { lbIndex = (lbIndex + d + visible.length) % visible.length; renderLb(); }
  if (lb) {
    $('.lb-close', lb).addEventListener('click', closeLb);
    $('.lb-prev', lb).addEventListener('click', () => stepLb(-1));
    $('.lb-next', lb).addEventListener('click', () => stepLb(1));
    lb.addEventListener('click', (e) => { if (e.target === lb) closeLb(); });
    document.addEventListener('keydown', (e) => {
      if (!lb.classList.contains('open')) return;
      if (e.key === 'Escape') closeLb();
      if (e.key === 'ArrowLeft') stepLb(-1);
      if (e.key === 'ArrowRight') stepLb(1);
    });
  }

  /* ------------------------------------------------------------------ */
  /* UI behaviour                                                        */
  /* ------------------------------------------------------------------ */

  // Theme toggle
  const themeBtn = $('#themeToggle');
  function isDark() {
    const t = document.documentElement.getAttribute('data-theme');
    return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  }
  function syncThemeIcon() { if (themeBtn) themeBtn.innerHTML = icon(isDark() ? 'i-sun' : 'i-moon'); }
  if (themeBtn) {
    syncThemeIcon();
    themeBtn.addEventListener('click', () => {
      const next = isDark() ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('mmx-theme', next); } catch (e) { /* storage unavailable */ }
      syncThemeIcon();
    });
  }

  // Mobile menu
  const burger = $('#burger');
  const menu = $('#mobileMenu');
  if (burger && menu) {
    burger.addEventListener('click', () => {
      const open = menu.classList.toggle('open');
      burger.setAttribute('aria-expanded', open);
    });
    $$('a', menu).forEach((a) => a.addEventListener('click', () => { menu.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); }));
  }

  // Active nav link on scroll
  const links = $$('.nav-links a');
  const sections = links.map((a) => $(a.getAttribute('href'))).filter(Boolean);
  const navIO = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) links.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + en.target.id));
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  sections.forEach((s) => navIO.observe(s));

  // Reveal on scroll + counters
  const revealIO = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      en.target.classList.add('in');
      $$('[data-count]', en.target).forEach(countUp);
      revealIO.unobserve(en.target);
    });
  }, { threshold: 0.12 });
  $$('.reveal').forEach((el) => revealIO.observe(el));

  function countUp(el) {
    if (el.dataset.done) return;
    el.dataset.done = '1';
    const target = +el.dataset.count;
    const start = performance.now();
    const dur = 1400;
    (function tick(now) {
      const p = Math.min(1, (now - start) / dur);
      el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(tick);
    })(start);
  }

  // Toast
  const toast = $('#toast');
  let toastTimer;
  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 4200);
  }

  // Contact form → mailto
  const form = $('#contactForm');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(form));
      if (!d.name.trim() || !/^\S+@\S+\.\S+$/.test(d.email) || !d.message.trim()) {
        showToast('Please add your name, a valid email and project details.');
        return;
      }
      const body = `Name: ${d.name}\nOrganisation: ${d.org}\nEmail: ${d.email}\nPhone: ${d.phone}\nArea of interest: ${d.domain}\n\n${d.message}`;
      window.location.href = `mailto:info@motamaxindia.com?subject=${encodeURIComponent('Project enquiry — ' + (d.org || d.name))}&body=${encodeURIComponent(body)}`;
      showToast('Opening your email app…');
    });
  }

  const yr = $('#year');
  if (yr) yr.textContent = new Date().getFullYear();
})();
