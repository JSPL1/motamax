/* Motamax — social networks: names, brand colours, icons and URL detection (shared by the website and the portal) */
(function () {
  'use strict';
  var S = ' fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  var NETWORKS = {
    facebook: { name: 'Facebook', color: '#1877F2', hint: 'https://www.facebook.com/yourpage', match: /facebook\.com|fb\.(com|me)/i,
      svg: '<path fill="currentColor" d="M14 8h3V4h-3c-2.8 0-4.5 1.8-4.5 4.6V11H7v4h2.5v9h4v-9h3l.5-4h-3.5V8.8c0-.5.3-.8.5-.8z"/>' },
    x: { name: 'X (Twitter)', color: '#14171A', hint: 'https://x.com/yourhandle', match: /(^|\/\/|\.)(x|twitter)\.com/i,
      svg: '<path fill="currentColor" d="M18.2 2.3h3.3l-7.2 8.3 8.5 11.1h-6.6l-5.2-6.8-6 6.8H1.7l7.7-8.8L1.3 2.3H8l4.7 6.2 5.5-6.2zm-1.2 17.5h1.8L7.1 4.1H5.1l11.9 15.7z"/>' },
    instagram: { name: 'Instagram', color: '#E1306C', hint: 'https://www.instagram.com/yourhandle', match: /instagram\.com|instagr\.am/i,
      svg: '<rect x="3" y="3" width="18" height="18" rx="5"' + S + '/><circle cx="12" cy="12" r="4"' + S + '/><circle cx="17.5" cy="6.5" r="1.2" fill="currentColor"/>' },
    linkedin: { name: 'LinkedIn', color: '#0A66C2', hint: 'https://www.linkedin.com/company/yourcompany', match: /linkedin\.com|lnkd\.in/i,
      svg: '<path fill="currentColor" d="M4.98 3.5a2.5 2.5 0 11-.01 5 2.5 2.5 0 01.01-5zM3 9.5h4V21H3zM9.5 9.5h3.8v1.6h.1c.5-1 1.8-2 3.8-2 4 0 4.8 2.6 4.8 6V21h-4v-5.2c0-1.2 0-2.9-1.8-2.9s-2 1.4-2 2.8V21h-4z"/>' },
    youtube: { name: 'YouTube', color: '#FF0000', hint: 'https://www.youtube.com/@yourchannel', match: /youtube\.com|youtu\.be/i,
      svg: '<path fill="currentColor" fill-rule="evenodd" d="M23 7.2a3 3 0 00-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 001 7.2 31 31 0 00.5 12a31 31 0 00.5 4.8 3 3 0 002.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 002.1-2.1 31 31 0 00.5-4.8 31 31 0 00-.5-4.8zM9.8 15.1V8.9l5.8 3.1z"/>' },
    whatsapp: { name: 'WhatsApp', color: '#25D366', hint: '919938041356 or https://wa.me/…', match: /wa\.me|whatsapp\.com/i,
      svg: '<path fill="currentColor" d="M17.5 14.4c-.3-.1-1.8-.9-2-1-.3-.1-.5-.1-.7.1-.2.3-.8 1-.9 1.2-.2.2-.3.2-.6.1-.3-.1-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.4-.5c.2-.2.2-.3.3-.5.1-.2.1-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5.1 4.5 2.5 1 3 .8 3.6.7.6-.1 1.8-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.1-.3-.2-.6-.3zM12 2a10 10 0 00-8.6 15.1L2 22l5-1.3A10 10 0 1012 2z"/>' },
    telegram: { name: 'Telegram', color: '#26A5E4', hint: 'https://t.me/yourchannel', match: /t\.me|telegram\.(me|org)/i,
      svg: '<path fill="currentColor" d="M21.9 4.3 18.7 19.4c-.2 1-.9 1.3-1.7.8l-4.8-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.3-4.9 8.9-8c.4-.3-.1-.5-.6-.2L6.5 13.2 1.8 11.7c-1-.3-1-1 .2-1.5L20.5 3c.9-.3 1.6.2 1.4 1.3z"/>' },
    pinterest: { name: 'Pinterest', color: '#E60023', hint: 'https://www.pinterest.com/yourprofile', match: /pinterest\.|pin\.it/i,
      svg: '<path fill="currentColor" d="M12 2a10 10 0 00-3.6 19.3c-.1-.8-.2-2 0-2.9l1.3-5.4s-.3-.7-.3-1.6c0-1.5.9-2.6 2-2.6.9 0 1.4.7 1.4 1.5 0 .9-.6 2.3-.9 3.6-.3 1.1.5 2 1.6 2 1.9 0 3.4-2 3.4-4.9 0-2.6-1.9-4.4-4.5-4.4-3.1 0-4.9 2.3-4.9 4.7 0 .9.4 1.9.8 2.5.1.1.1.2.1.3l-.3 1.2c0 .2-.2.3-.4.2-1.4-.6-2.2-2.7-2.2-4.3 0-3.5 2.5-6.7 7.3-6.7 3.8 0 6.8 2.7 6.8 6.4 0 3.8-2.4 6.9-5.8 6.9-1.1 0-2.2-.6-2.6-1.3l-.7 2.7c-.3 1-1 2.2-1.4 2.9A10 10 0 1012 2z"/>' },
    threads: { name: 'Threads', color: '#14171A', hint: 'https://www.threads.net/@yourhandle', match: /threads\.(net|com)/i,
      svg: '<path fill="currentColor" d="M16.5 11.2l-.3-.1c-.2-3-1.8-4.7-4.6-4.7-1.7 0-3.1.7-4 2l1.6 1.1c.6-.9 1.6-1.1 2.4-1.1 1 0 1.7.3 2.2.9.3.4.5 1 .7 1.7-.8-.1-1.6-.2-2.5-.1-2.5.1-4.1 1.6-4 3.6.1 1 .6 1.9 1.4 2.5.7.5 1.6.7 2.6.6 1.3-.1 2.3-.5 3-1.4.5-.7.9-1.5 1-2.6.6.4 1.1.8 1.4 1.4.5 1.1.5 2.8-.9 4.2-1.2 1.2-2.7 1.7-4.9 1.7-2.5 0-4.3-.8-5.5-2.3C6 16.7 5.4 14.6 5.4 12s.6-4.7 1.7-6.2C8.3 4.3 10.1 3.5 12.6 3.5s4.4.8 5.6 2.3c.6.7 1 1.7 1.3 2.7l1.9-.5c-.4-1.3-.9-2.4-1.7-3.4C18.2 2.6 15.8 1.6 12.6 1.6c-3.1 0-5.5 1-7.1 3C4.1 6.4 3.4 8.9 3.4 12s.7 5.6 2.1 7.4c1.6 2 4 3 7.1 3 2.7 0 4.6-.7 6.2-2.3 2.1-2.1 2-4.7 1.3-6.3-.5-1.1-1.4-2-2.6-2.6zm-4.3 4.1c-1.1.1-2.2-.4-2.3-1.4 0-.8.6-1.6 2.3-1.7h.6c.6 0 1.2.1 1.7.2-.2 2.4-1.3 2.8-2.3 2.9z"/>' },
    maps: { name: 'Google Maps / Business', color: '#EA4335', hint: 'https://maps.app.goo.gl/…', match: /maps\.(app\.)?goo|google\.[a-z.]+\/maps|g\.page/i,
      svg: '<path d="M12 22s7-6.1 7-12a7 7 0 10-14 0c0 5.9 7 12 7 12z"' + S + '/><circle cx="12" cy="10" r="2.6"' + S + '/>' },
    email: { name: 'Email', color: '#1A9BD7', hint: 'info@motamaxindia.com', match: /^mailto:|^[^\s/:]+@[^\s/]+\.[a-z]{2,}$/i,
      svg: '<rect x="2.5" y="4.5" width="19" height="15" rx="2.5"' + S + '/><path d="M3 6l9 7 9-7"' + S + '/>' },
    phone: { name: 'Phone', color: '#22B45A', hint: '+91 99380 41356', match: /^tel:|^\+?[\d\s()-]{8,}$/,
      svg: '<path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1.9.4 1.8.7 2.7a2 2 0 01-.5 2.1L8.1 9.8a16 16 0 006 6l1.3-1.3a2 2 0 012.1-.4c.9.3 1.8.6 2.7.7a2 2 0 011.8 2z"' + S + '/>' },
    website: { name: 'Website / other', color: '#8E5CF5', hint: 'https://…', match: /.^/,
      svg: '<circle cx="12" cy="12" r="10"' + S + '/><path d="M2 12h20M12 2a15 15 0 010 20M12 2a15 15 0 000 20"' + S + '/>' },
  };
  var ORDER = ['facebook', 'x', 'instagram', 'linkedin', 'youtube', 'whatsapp', 'telegram', 'pinterest', 'threads', 'maps', 'email', 'phone', 'website'];

  function icon(network, size) {
    var n = NETWORKS[network] || NETWORKS.website;
    return '<svg viewBox="0 0 24 24" width="' + (size || 18) + '" height="' + (size || 18) + '" aria-hidden="true">' + n.svg + '</svg>';
  }
  // guess the network from a pasted address (phone is checked after WhatsApp links)
  function detect(url) {
    var s = String(url || '').trim();
    if (!s) return null;
    for (var i = 0; i < ORDER.length; i++) if (NETWORKS[ORDER[i]].match.test(s)) return ORDER[i];
    return /^(https?:\/\/)?[\w-]+(\.[\w-]+)+/i.test(s) ? 'website' : null;
  }
  // only web, mail and phone links are ever rendered on the website
  function safe(url) { return /^(https?:\/\/|mailto:|tel:)/i.test(String(url || '')) ? String(url) : null; }

  window.MMX_SOCIAL = { networks: NETWORKS, order: ORDER, icon: icon, detect: detect, safe: safe };
})();
