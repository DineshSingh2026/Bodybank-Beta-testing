/* Shared helpers: API calls, session guard, top bar, formatting. */

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

/* Top bar -------------------------------------------------------------- */

function renderTopbar(user, active) {
  const links = user.role === 'developer'
    ? [['/developer.html', 'Tickets'], ['/testers.html', 'Testers']]
    : [['/dashboard.html', 'My tickets'], ['/report.html', 'Report an issue']];

  const nav = links
    .map(([href, label]) =>
      `<a href="${href}"${active === href ? ' class="active"' : ''}>${label}</a>`)
    .join('');

  document.getElementById('topbar').innerHTML = `
    <div class="topbar-inner">
      <a class="wordmark" href="${homeFor(user)}">bodybank<span>beta</span></a>
      <nav class="topnav">${nav}</nav>
      <div class="topbar-user">
        <span class="who"><strong>${escapeHtml(user.name)}</strong> · ${user.role}</span>
        <button class="btn btn-ghost" id="signout">Sign out</button>
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

function priorityTag(priority) {
  return `<span class="prio p-${priority.toLowerCase()}">${priority}</span>`;
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

function showError(el, message) {
  el.className = 'alert alert-error';
  el.textContent = message;
}

/* Ticket list ---------------------------------------------------------- */

// Renders the shared ticket table. `showTester` adds the Tester column (Dinesh only).
function renderTicketTable(container, tickets, showTester) {
  if (!tickets.length) {
    container.innerHTML = `
      <div class="empty">
        <strong>No tickets here yet</strong>
        ${showTester
          ? 'Tickets appear as soon as a tester reports an issue.'
          : 'Found something broken? Report it and it goes straight to Dinesh.'}
      </div>`;
    return;
  }

  const cols = showTester
    ? '104px minmax(0,1fr) 130px 92px 116px 92px'
    : '104px minmax(0,1fr) 92px 116px 92px';

  const head = showTester
    ? ['Ticket', 'Title', 'Tester', 'Priority', 'Status', 'Updated']
    : ['Ticket', 'Title', 'Priority', 'Status', 'Updated'];

  const rows = tickets.map((t) => `
    <a class="tbl-row" style="--cols: ${cols}" href="/ticket.html?id=${t.id}">
      <span class="c-id ticket-id">${t.ticket_number}</span>
      <span class="c-title title">${escapeHtml(t.title)}</span>
      ${showTester ? `<span class="c-tester meta">${escapeHtml(t.tester_name)}</span>` : ''}
      <span class="c-prio">${priorityTag(t.priority)}</span>
      <span class="c-status">${statusBadge(t.status)}</span>
      <span class="c-updated meta">${timeAgo(t.updated_at)}</span>
    </a>`).join('');

  container.innerHTML = `
    <div class="tbl-head" style="--cols: ${cols}">
      ${head.map((h) => `<span>${h}</span>`).join('')}
    </div>${rows}`;
}
