/* Shared helpers: API calls, session guard, navigation, formatting, charts. */

async function api(path, options = {}) {
  const res = await fetch(path, { credentials: 'same-origin', ...options });
  let data = {};
  try { data = await res.json(); } catch (_) { /* empty body */ }
  if (!res.ok) {
    const err = new Error(data.error || 'Something went wrong.');
    err.status = res.status;
    throw err;
  }
  return data;
}

const apiJson = (path, method, body) =>
  api(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });

/* Session ------------------------------------------------------------- */

async function currentUser() {
  try {
    const { user } = await api('/api/auth/me');
    return user;
  } catch (_) {
    return null;
  }
}

// Sends people to where they belong; returns the signed-in user.
async function guard(role) {
  const user = await currentUser();
  if (!user) {
    location.replace('/');
    return null;
  }
  if (role && user.role !== role) {
    location.replace(user.role === 'developer' ? '/developer.html' : '/dashboard.html');
    return null;
  }
  return user;
}

function homeFor(user) {
  return user.role === 'developer' ? '/developer.html' : '/dashboard.html';
}

/* Icons ---------------------------------------------------------------- */

const ICONS = {
  tickets: '<path d="M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4a2 2 0 0 0 0-4z"/><path d="M13 5v2M13 11v2M13 17v2"/>',
  report: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  people: '<path d="M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1"/><circle cx="9" cy="7" r="4"/><path d="M22 19v-1a4 4 0 0 0-3-3.87"/><path d="M16 3.13A4 4 0 0 1 16 11"/>',
  signout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
  bell: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
};

function icon(name, extra) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"
    stroke-linecap="round" stroke-linejoin="round"${extra ? ' ' + extra : ''} aria-hidden="true">${ICONS[name]}</svg>`;
}

/* People --------------------------------------------------------------- */

// Fixed set, all dark enough to carry white initials.
const AVATAR_TONES = ['#0055cc', '#216e4e', '#ae2e24', '#5e4db2', '#206a83', '#a54800', '#943d73', '#44546f'];

function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/);
  const first = parts[0] ? parts[0][0] : '?';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

// The same person keeps the same colour on every screen.
function avatarTone(name) {
  const text = String(name || '');
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

function avatar(name, size) {
  const cls = size ? ' avatar-' + size : '';
  return `<span class="avatar${cls}" style="--av:${avatarTone(name)}" title="${escapeHtml(name)}"
    aria-hidden="true">${escapeHtml(initials(name))}</span>`;
}

/* Navigation ----------------------------------------------------------- */

// Kept as renderTopbar so every page keeps calling it the same way.
function renderTopbar(user, active) {
  const links = user.role === 'developer'
    ? [['/developer.html', 'All tickets', 'tickets'], ['/testers.html', 'Testers', 'people']]
    : [['/dashboard.html', 'My tickets', 'tickets'], ['/report.html', 'Report an issue', 'report']];

  const nav = links
    .map(([href, label, ic]) =>
      `<a href="${href}"${active === href ? ' class="active" aria-current="page"' : ''}>${icon(ic)}${label}</a>`)
    .join('');

  document.getElementById('topbar').innerHTML = `
    <div class="sidebar-inner">
      <a class="wordmark" href="${homeFor(user)}">
        <span class="wordmark-mark">b</span>
        <span class="wordmark-text">bodybank<em>beta tracker</em></span>
      </a>
      <div class="sidenav-label">Workspace</div>
      <nav class="sidenav">${nav}</nav>
      <div class="sidebar-foot">
        ${avatar(user.name)}
        <span class="who"><strong>${escapeHtml(user.name)}</strong><span>${user.role}</span></span>
        <button class="btn-signout" id="signout" title="Sign out" aria-label="Sign out">${icon('signout')}</button>
      </div>
    </div>`;

  document.getElementById('signout').addEventListener('click', async () => {
    await api('/api/auth/logout', { method: 'POST' });
    location.replace('/');
  });
}

/* Formatting ----------------------------------------------------------- */

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function statusBadge(status) {
  const key = 's-' + status.toLowerCase().replace(/[^a-z]/g, '');
  return `<span class="badge ${key}">${status}</span>`;
}

// An arrow plus the word — urgency is never left to colour alone.
const PRIORITY_ARROW = {
  Critical: '<path d="M12 19V6"/><path d="M6 11l6-6 6 6"/><path d="M6 17l6-6 6 6"/>',
  High: '<path d="M12 19V7"/><path d="M6 12l6-6 6 6"/>',
  Medium: '<path d="M5 10h14"/><path d="M5 15h14"/>',
  Low: '<path d="M12 5v12"/><path d="M6 12l6 6 6-6"/>',
};

function priorityTag(priority) {
  const path = PRIORITY_ARROW[priority] || PRIORITY_ARROW.Medium;
  return `<span class="prio p-${priority.toLowerCase()}" title="${priority} priority">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>${priority}</span>`;
}

function timeAgo(iso) {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return mins + 'm ago';
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + 'h ago';
  const days = Math.floor(hours / 24);
  if (days < 7) return days + 'd ago';
  return formatDate(iso);
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function formatDateTime(iso) {
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  });
}

function plural(n, one, many) {
  return n === 1 ? one : (many || one + 's');
}

function showError(el, message) {
  el.className = 'alert alert-error';
  el.textContent = message;
}

/* Charts ---------------------------------------------------------------- */

/* Status colours are validated as a set for colour-vision deficiency, and the
   order below is what keeps adjacent segments apart. Reordering them would
   put red next to green in the stack, which is exactly the pair that fails.
   Every segment also carries a legend row with its own count, so the chart
   never depends on colour being read correctly. */
const STATUS_SERIES = [
  { key: 'new',         label: 'New',         status: 'NEW',         tone: '#2a78d6' },
  { key: 'reopened',    label: 'Reopened',    status: 'REOPENED',    tone: '#e34948' },
  { key: 'in_progress', label: 'In progress', status: 'IN PROGRESS', tone: '#eda100', onLight: true },
  { key: 'retest',      label: 'Retest',      status: 'RETEST',      tone: '#4a3aa7' },
  { key: 'closed',      label: 'Closed',      status: 'CLOSED',      tone: '#008300' },
];

// Priority is an ordered scale, so it gets one hue stepped light to dark
// rather than four unrelated colours.
const PRIORITY_TONE = {
  Critical: '#184f95',
  High: '#2a78d6',
  Medium: '#5598e7',
  Low: '#86b6ef',
};

/**
 * Horizontal stacked bar of ticket status, plus a legend that doubles as the
 * status filter. `active` is the currently filtered status, if any.
 */
function renderStatusStack(container, stats, active) {
  const total = STATUS_SERIES.reduce((sum, s) => sum + (stats[s.key] || 0), 0);

  if (!total) {
    container.innerHTML = `<div class="chart-empty">No tickets yet — the breakdown appears once the first one is reported.</div>`;
    return;
  }

  const present = STATUS_SERIES.filter((s) => (stats[s.key] || 0) > 0);

  const segments = present.map((s) => {
    const n = stats[s.key];
    const pct = (n / total) * 100;
    // Only label the segment when there is room; the legend always has the number.
    const showNumber = pct >= 9;
    return `<div class="stack-seg${s.onLight ? ' on-light' : ''}" style="--tone:${s.tone};width:${pct}%"
      title="${s.label}: ${n} of ${total} (${Math.round(pct)}%)">${showNumber ? `<span>${n}</span>` : ''}</div>`;
  }).join('');

  const legend = STATUS_SERIES.map((s) => {
    const n = stats[s.key] || 0;
    const pct = total ? Math.round((n / total) * 100) : 0;
    const selected = active === s.status ? ' selected' : '';
    return `<a class="legend-row${selected}" href="#" data-status="${s.status}" style="--tone:${s.tone}">
      <span class="legend-swatch"></span>
      <span>${s.label}</span>
      <span class="n">${n}</span>
      <span class="pct">${pct}%</span>
    </a>`;
  }).join('');

  container.innerHTML =
    `<div class="stack" role="img" aria-label="Tickets by status: ${
      present.map((s) => `${s.label} ${stats[s.key]}`).join(', ')}">${segments}</div>
     <div class="chart-legend">${legend}</div>`;
}

/**
 * Simple magnitude bars. `items` is [{ label, value, tone?, prefix? }].
 * Bars are scaled against the largest value, and every row shows its number.
 */
function renderBars(container, items, emptyText) {
  const rows = items.filter((i) => i.value > 0);
  if (!rows.length) {
    container.innerHTML = `<div class="chart-empty">${escapeHtml(emptyText || 'Nothing to show yet.')}</div>`;
    return;
  }

  const max = Math.max(...rows.map((i) => i.value));
  container.innerHTML = `<div class="bars">${rows.map((i) => `
    <div class="bar-row" title="${escapeHtml(i.label)}: ${i.value}">
      <span class="k">${i.prefix || ''}<span>${escapeHtml(i.label)}</span></span>
      <span class="bar-track"><span class="bar-fill" style="--tone:${i.tone || '#2a78d6'};width:${(i.value / max) * 100}%"></span></span>
      <span class="n">${i.value}</span>
    </div>`).join('')}</div>`;
}

/* Counts a field across a list of tickets, biggest first. */
function countBy(tickets, field, limit) {
  const tally = new Map();
  tickets.forEach((t) => tally.set(t[field], (tally.get(t[field]) || 0) + 1));
  const sorted = [...tally.entries()].sort((a, b) => b[1] - a[1]);
  return (limit ? sorted.slice(0, limit) : sorted).map(([label, value]) => ({ label, value }));
}

/* Ticket list ---------------------------------------------------------- */

// Renders the shared ticket table. `showTester` adds the Tester column (Dinesh only).
function renderTicketTable(container, tickets, showTester) {
  if (!tickets.length) {
    container.innerHTML = `
      <div class="empty">
        ${icon('inbox')}
        <strong>No tickets match</strong>
        ${showTester
          ? 'Try clearing the filters, or wait for a tester to report something.'
          : 'Nothing here right now. Found something broken? Report it and it goes straight to Dinesh.'}
      </div>`;
    return;
  }

  const cols = showTester
    ? '96px minmax(0,1fr) 150px 108px 128px 92px'
    : '96px minmax(0,1fr) 108px 128px 92px';

  const head = showTester
    ? ['Key', 'Summary', 'Reported by', 'Priority', 'Status', 'Updated']
    : ['Key', 'Summary', 'Priority', 'Status', 'Updated'];

  const rows = tickets.map((t) => `
    <a class="tbl-row" style="--cols: ${cols}" href="/ticket.html?id=${t.id}">
      <span class="c-id ticket-id">${t.ticket_number}</span>
      <span class="c-title title">${escapeHtml(t.title)}</span>
      ${showTester ? `<span class="c-tester who">${avatar(t.tester_name, 'sm')}<span>${escapeHtml(t.tester_name)}</span></span>` : ''}
      <span class="c-prio">${priorityTag(t.priority)}</span>
      <span class="c-status">${statusBadge(t.status)}</span>
      <span class="c-updated meta">${timeAgo(t.updated_at)}</span>
    </a>`).join('');

  container.innerHTML = `
    <div class="tbl-head" style="--cols: ${cols}">
      ${head.map((h) => `<span>${h}</span>`).join('')}
    </div>${rows}`;
}
