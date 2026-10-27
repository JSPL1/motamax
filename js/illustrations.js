/* Motamax — animated SVG illustrations, injected into any element with data-illus="<key>" */
(function () {
  'use strict';
  const C = { sky: '#1A9BD7', violet: '#8E5CF5', red: '#E3342F', green: '#22B45A', amber: '#FF9F0A', navy: '#23246E' };
  const wrap = (inner, label) => `<svg viewBox="0 0 400 300" role="img" aria-label="${label}" class="illus-svg">${inner}</svg>`;
  const ground = `<path class="il-ground" d="M10 262 H390"/><path class="il-grid" d="M30 272 H370 M60 282 H340"/>`;
  const flow = (d, color, dur = 2.4, delay = 0) => `<path d="${d}" class="il-flow" stroke="${color}" style="animation-duration:${dur}s;animation-delay:${delay}s"/>`;
  const dotOn = (d, color, dur = 3, begin = 0, r = 4) => `<circle r="${r}" fill="${color}"><animateMotion dur="${dur}s" begin="${begin}s" repeatCount="indefinite" path="${d}"/></circle>`;

  const ART = {
    /* integrated site: tower, CCTV, solar, transformer, server rack, all linked to a control room */
    services: () => wrap(`
      ${ground}
      <!-- telecom tower -->
      <g class="il-tower"><path d="M70 262 L88 120 L106 262 M76 220 H100 M80 185 H96 M84 150 H92 M76 220 L96 185 M100 220 L80 185 M80 185 L92 150 M96 185 L84 150" class="il-stroke" stroke="${C.navy}"/>
        <circle cx="88" cy="114" r="5" fill="${C.red}"><animate attributeName="opacity" values="1;.2;1" dur="1.4s" repeatCount="indefinite"/></circle>
        ${[16, 28, 40].map((r, i) => `<path d="M${88 - r} ${114 - r * 0.5} Q88 ${114 - r * 1.2} ${88 + r} ${114 - r * 0.5}" class="il-wave" stroke="${C.sky}" style="animation-delay:${i * 0.4}s"/>`).join('')}</g>
      <!-- CCTV pole -->
      <g><path d="M150 262 V170" class="il-stroke" stroke="${C.navy}"/>
        <g class="il-cam"><rect x="150" y="160" width="34" height="14" rx="4" fill="${C.sky}"/><rect x="180" y="163" width="8" height="8" rx="2" fill="${C.navy}"/>
          <path d="M188 167 L240 140 L240 196 Z" fill="${C.sky}" opacity=".14"/></g></g>
      <!-- solar -->
      <g><path d="M255 262 V236 M300 262 V230" class="il-stroke" stroke="${C.navy}"/>
        <path d="M240 240 L268 214 H322 L296 240 Z" fill="${C.navy}"/><path d="M254 227 H308 M262 240 L290 214 M280 240 L306 214" stroke="${C.sky}" stroke-width="1.4"/>
        <g class="il-sun"><circle cx="330" cy="70" r="16" fill="${C.amber}"/>${Array.from({ length: 8 }, (_, k) => { const a = k * Math.PI / 4; return `<path d="M${330 + 22 * Math.cos(a)} ${70 + 22 * Math.sin(a)} L${330 + 30 * Math.cos(a)} ${70 + 30 * Math.sin(a)}" stroke="${C.amber}" stroke-width="3" stroke-linecap="round"/>`; }).join('')}</g>
        ${flow('M322 92 L296 210', C.amber, 1.6)}</g>
      <!-- transformer -->
      <g><rect x="200" y="214" width="40" height="48" rx="4" fill="${C.violet}"/><path d="M208 214 V204 M220 214 V200 M232 214 V204" class="il-stroke" stroke="${C.navy}"/>
        <path d="M216 230 L224 230 L218 242 L226 242 L214 256 L218 244 L211 244 Z" fill="${C.amber}"><animate attributeName="opacity" values="1;.3;1" dur="1.2s" repeatCount="indefinite"/></path></g>
      <!-- server rack -->
      <g><rect x="335" y="176" width="44" height="86" rx="5" fill="${C.navy}"/>
        ${[0, 1, 2, 3, 4].map((k) => `<rect x="341" y="${184 + k * 15}" width="32" height="10" rx="2" fill="#2E3A8C"/><circle cx="366" cy="${189 + k * 15}" r="2.4" fill="${[C.green, C.sky, C.amber, C.green, C.red][k]}"><animate attributeName="opacity" values="1;.2;1" dur="${0.8 + k * 0.3}s" repeatCount="indefinite"/></circle>`).join('')}</g>
      <!-- links -->
      ${flow('M106 250 C150 250 170 230 200 238', C.sky, 2)}
      ${flow('M167 190 C190 200 200 208 210 214', C.violet, 2.2)}
      ${flow('M240 250 C280 255 310 250 335 240', C.green, 1.8)}
      ${dotOn('M106 250 C150 250 170 230 200 238', C.sky, 2.6)}${dotOn('M240 250 C280 255 310 250 335 240', C.green, 2.2, .6)}`,
      'Integrated site with telecom tower, CCTV, solar panels, transformer and server rack'),

    /* sustainability rings */
    about: () => wrap(`
      <g class="il-spin-slow" style="transform-origin:200px 150px">${[0, 1, 2].map((k) => { const a = -Math.PI / 2 + k * 2 * Math.PI / 3; return `<circle cx="${200 + 38 * Math.cos(a)}" cy="${150 + 38 * Math.sin(a)}" r="62" fill="${[C.green, C.violet, C.amber][k]}" fill-opacity=".16" stroke="${[C.green, C.violet, C.amber][k]}" stroke-width="3"/>`; }).join('')}</g>
      <circle cx="200" cy="150" r="22" fill="${C.navy}"/><path d="M188 158 L194 142 L200 154 L206 142 L212 158" stroke="#fff" stroke-width="3" fill="none" stroke-linejoin="round"/>
      <g font-family="Inter,system-ui,sans-serif" font-weight="700" font-size="13" text-anchor="middle">
        <text x="200" y="40" fill="${C.green}">ENVIRONMENT</text><text x="88" y="232" fill="${C.violet}">SOCIAL</text><text x="312" y="232" fill="${C.amber}">ECONOMIC</text></g>
      <circle r="5" fill="${C.sky}"><animateMotion dur="9s" repeatCount="indefinite" path="M200 40 A110 110 0 1 1 199.9 40"/></circle>
      <circle r="4" fill="${C.red}"><animateMotion dur="13s" repeatCount="indefinite" path="M200 270 A120 120 0 1 0 200.1 270"/></circle>`,
      'Three pillars of sustainability: environmental, social and economic'),

    /* industrial skyline */
    industries: () => wrap(`
      ${ground}
      <g><rect x="30" y="180" width="90" height="82" fill="${C.navy}"/><path d="M30 180 L50 160 L50 180 L70 160 L70 180 L90 160 L90 180" fill="${C.navy}"/>
        <rect x="95" y="120" width="14" height="60" fill="${C.violet}"/>
        ${[0, 1, 2].map((k) => `<circle cx="102" cy="112" r="${7 + k * 2}" fill="#9AA6C8" opacity=".6" class="il-smoke" style="animation-delay:${k * 1}s"/>`).join('')}
        ${[0, 1, 2].map((k) => `<rect x="${40 + k * 24}" y="205" width="14" height="14" fill="${C.amber}" opacity=".85"/>`).join('')}</g>
      <g><rect x="140" y="110" width="56" height="152" fill="${C.sky}"/>${Array.from({ length: 12 }, (_, k) => `<rect x="${148 + (k % 3) * 15}" y="${122 + Math.floor(k / 3) * 30}" width="9" height="16" fill="#fff" opacity="${k % 4 ? .75 : .35}"/>`).join('')}</g>
      <g class="il-crane"><path d="M250 262 V90 M250 92 H350 M250 110 L280 92" class="il-stroke" stroke="${C.red}"/><g class="il-hook"><path d="M320 92 V150" stroke="${C.navy}" stroke-width="2"/><rect x="306" y="150" width="28" height="18" fill="${C.amber}"/></g></g>
      <g class="il-truck"><rect x="215" y="232" width="52" height="22" rx="3" fill="${C.green}"/><rect x="267" y="238" width="18" height="16" rx="3" fill="${C.navy}"/><circle cx="228" cy="258" r="6" fill="${C.navy}"/><circle cx="276" cy="258" r="6" fill="${C.navy}"/></g>
      <g><path d="M300 262 L320 210 L340 262 Z M330 262 L352 200 L374 262 Z" fill="${C.violet}" opacity=".85"/></g>`,
      'Industrial skyline with factory, buildings, port crane and mining truck'),

    /* growth chart + trophy */
    stories: () => wrap(`
      <path d="M40 260 H370 M40 260 V40" class="il-stroke" stroke="#9AA6C8"/>
      ${[0, 1, 2, 3, 4, 5].map((k) => { const h = [50, 80, 70, 115, 150, 190][k]; const col = [C.sky, C.violet, C.red, C.amber, C.green, C.sky][k]; return `<rect x="${60 + k * 48}" y="${260 - h}" width="30" height="${h}" rx="6" fill="${col}" class="il-bar" style="animation-delay:${k * 0.12}s"/>`; }).join('')}
      <path d="M75 200 L123 172 L171 182 L219 138 L267 104 L315 62" fill="none" stroke="${C.navy}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" class="il-draw"/>
      ${[[75, 200], [123, 172], [171, 182], [219, 138], [267, 104], [315, 62]].map(([x, y], k) => `<circle cx="${x}" cy="${y}" r="5" fill="#fff" stroke="${C.navy}" stroke-width="3" class="il-pop" style="animation-delay:${1 + k * 0.12}s"/>`).join('')}
      <g class="il-float"><path d="M330 30 h36 v14 a18 18 0 0 1 -36 0 z" fill="${C.amber}"/><rect x="342" y="62" width="12" height="10" fill="${C.amber}"/><rect x="334" y="72" width="28" height="7" rx="2" fill="${C.navy}"/>
        <path d="M348 36 l2 5 5 .4 -4 3 1.3 5 -4.3 -2.8 -4.3 2.8 1.3 -5 -4 -3 5 -.4z" fill="#fff"/></g>`,
      'Rising growth chart with a trophy'),

    /* client network */
    clients: () => {
      // gold Motamax emblem in the middle, client logos orbiting it (logos stay upright while the ring turns)
      const LOGOS = ['reliance', 'indianoil', 'airtel', 'tata-power', 'lic', 'drdo', 'jsw', 'ultratech'];
      const cols = [C.sky, C.violet, C.red, C.green, C.amber, C.sky, C.violet, C.red];
      const R = 158, cx = 200, cy = 200, spin = 70;
      const nodes = LOGOS.map((_, k) => { const a = k * Math.PI / 4 - Math.PI / 2; return [cx + R * Math.cos(a), cy + R * Math.sin(a)]; });
      return `<svg viewBox="0 0 400 400" role="img" aria-label="Motamax and its client network" class="illus-svg">
        <defs><clipPath id="emblemClip"><circle cx="${cx}" cy="${cy}" r="104"/></clipPath>
          <radialGradient id="emblemGlow"><stop offset="55%" stop-color="#FFC857" stop-opacity=".45"/><stop offset="100%" stop-color="#FFC857" stop-opacity="0"/></radialGradient></defs>
        <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#9AA6C8" stroke-dasharray="3 7" opacity=".45"/>
        <g><animateTransform attributeName="transform" type="rotate" from="0 ${cx} ${cy}" to="360 ${cx} ${cy}" dur="${spin}s" repeatCount="indefinite"/>
          ${nodes.map(([x, y], k) => `<path d="M${cx + 112 * (x - cx) / R} ${cy + 112 * (y - cy) / R} L${x} ${y}" stroke="${cols[k]}" stroke-width="1.6" opacity=".45"/>
            ${dotOn(`M${x} ${y} L${cx + 112 * (x - cx) / R} ${cy + 112 * (y - cy) / R}`, cols[k], 2.4, k * 0.3, 3)}`).join('')}
          ${nodes.map(([x, y], k) => `<g class="il-pop" style="animation-delay:${k * 0.08}s"><g>
            <animateTransform attributeName="transform" type="rotate" from="0 ${x} ${y}" to="-360 ${x} ${y}" dur="${spin}s" repeatCount="indefinite"/>
            <circle cx="${x}" cy="${y}" r="24" fill="#fff" stroke="${cols[k]}" stroke-width="2.5"/>
            <image href="assets/clients/${LOGOS[k]}.png?v=hd1" x="${x - 20}" y="${y - 15}" width="40" height="30" preserveAspectRatio="xMidYMid meet"/></g></g>`).join('')}
        </g>
        <circle cx="${cx}" cy="${cy}" r="124" fill="url(#emblemGlow)" class="il-glow"/>
        <circle cx="${cx}" cy="${cy}" r="113" fill="none" stroke="#FFC857" stroke-width="1.5" stroke-dasharray="2 6" opacity=".7">
          <animateTransform attributeName="transform" type="rotate" from="360 ${cx} ${cy}" to="0 ${cx} ${cy}" dur="40s" repeatCount="indefinite"/></circle>
        <image href="assets/badges/badge-1.webp" x="${cx - 104}" y="${cy - 104}" width="208" height="208" clip-path="url(#emblemClip)"/>
      </svg>`;
    },

    /* gallery frames + camera */
    work: () => wrap(`
      ${[[-10, 60, 70, C.sky], [6, 150, 50, C.violet], [-4, 230, 80, C.green]].map(([rot, x, y, col], k) => `
        <g class="il-float" style="animation-delay:${k * 0.6}s"><g transform="rotate(${rot} ${x + 50} ${y + 60})">
          <rect x="${x}" y="${y}" width="100" height="120" rx="8" fill="#fff" stroke="#D5DBEA" stroke-width="2"/>
          <rect x="${x + 8}" y="${y + 8}" width="84" height="80" rx="4" fill="${col}" opacity=".2"/>
          <path d="M${x + 12} ${y + 82} L${x + 38} ${y + 52} L${x + 56} ${y + 70} L${x + 70} ${y + 58} L${x + 88} ${y + 82} Z" fill="${col}"/>
          <circle cx="${x + 72}" cy="${y + 28}" r="8" fill="${C.amber}"/>
          <rect x="${x + 10}" y="${y + 96}" width="60" height="6" rx="3" fill="#D5DBEA"/></g></g>`).join('')}
      <g transform="translate(150 196)"><rect width="100" height="64" rx="12" fill="${C.navy}"/><rect x="16" y="-10" width="30" height="14" rx="4" fill="${C.navy}"/>
        <circle cx="50" cy="32" r="22" fill="#2E3A8C" stroke="${C.sky}" stroke-width="4"/><circle cx="50" cy="32" r="10" fill="${C.sky}"><animate attributeName="r" values="10;6;10" dur="2.4s" repeatCount="indefinite"/></circle>
        <circle cx="84" cy="14" r="4" fill="${C.red}"><animate attributeName="opacity" values="1;.2;1" dur="1s" repeatCount="indefinite"/></circle></g>`,
      'Photo frames from project sites and a camera'),

    /* contact: headset hub with phone, mail and location */
    contact: () => wrap(`
      ${[[80, 70, C.sky, 'phone'], [320, 70, C.red, 'mail'], [80, 230, C.green, 'chat'], [320, 230, C.amber, 'pin']].map(([x, y, col, kind], k) => `
        <path d="M200 150 L${x} ${y}" stroke="${col}" stroke-width="2.5" stroke-dasharray="6 6" class="il-dash"/>
        ${dotOn(`M${x} ${y} L200 150`, col, 2, k * 0.5, 4)}
        <g class="il-pop" style="animation-delay:${k * 0.1}s"><circle cx="${x}" cy="${y}" r="30" fill="${col}"/>
        ${kind === 'phone' ? `<path d="M${x - 10} ${y - 12} q-4 14 10 26 l6 -6 -7 -6 -4 3 q-6 -5 -8 -12 l4 -3 -4 -8 z" fill="#fff"/>` : ''}
        ${kind === 'mail' ? `<rect x="${x - 14}" y="${y - 10}" width="28" height="20" rx="3" fill="#fff"/><path d="M${x - 14} ${y - 8} L${x} ${y + 3} L${x + 14} ${y - 8}" stroke="${col}" stroke-width="2.5" fill="none"/>` : ''}
        ${kind === 'chat' ? `<path d="M${x - 14} ${y - 10} h28 v18 h-16 l-8 7 v-7 h-4 z" fill="#fff"/>` : ''}
        ${kind === 'pin' ? `<path d="M${x} ${y + 15} c-12 -14 -14 -20 -14 -25 a14 14 0 0 1 28 0 c0 5 -2 11 -14 25z" fill="#fff"/><circle cx="${x}" cy="${y - 10}" r="5" fill="${col}"/>` : ''}</g>`).join('')}
      <circle cx="200" cy="150" r="46" fill="${C.navy}"/><circle cx="200" cy="150" r="46" fill="none" stroke="${C.violet}" stroke-width="3" class="il-ring"/>
      <path d="M178 156 v-8 a22 22 0 0 1 44 0 v8" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/>
      <rect x="172" y="150" width="12" height="20" rx="4" fill="${C.sky}"/><rect x="216" y="150" width="12" height="20" rx="4" fill="${C.sky}"/>
      <path d="M222 170 q0 10 -16 10" stroke="#fff" stroke-width="3" fill="none"/>`,
      'Contact hub linking phone, email, chat and location'),
  };
  ART.site = ART.services;

  document.querySelectorAll('[data-illus]').forEach((el) => {
    const make = ART[el.dataset.illus];
    if (make) el.innerHTML = make();
  });
})();
