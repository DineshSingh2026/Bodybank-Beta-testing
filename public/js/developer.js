const filters = { status: '', q: '', module: '', priority: '' };
let stats = null;

(async function init() {
  const user = await guard('developer');
  if (!user) return;
  renderTopbar(user, '/developer.html');

  const meta = await api('/api/meta');
  option('module', meta.MODULES, 'All modules');
  option('priority', meta.PRIORITIES, 'All priorities');

  document.getElementById('search').addEventListener('input', (e) => {
    filters.q = e.target.value.trim();
    loadTickets();
  });
  ['module', 'priority'].forEach((id) => {
    document.getElementById(id).addEventListener('change', (e) => {
      filters[id] = e.target.value;
      loadTickets();
    });
  });

  await Promise.all([loadStats(), loadTickets(), loadOverview()]);
})();

function option(id, values, placeholder) {
  document.getElementById(id).innerHTML =
    `<option value="">${placeholder}</option>` +
    values.map((v) => `<option value="${v}">${v}</option>`).join('');
}

/* Status filtering is shared by the stat tiles, the legend, and the tabs. */
function setStatus(next) {
  filters.status = filters.status === next ? '' : next;
  renderStats();
  renderTabs();
  renderStatusChart();
  loadTickets();
}

async function loadStats() {
  stats = await api('/api/tickets/stats');
  renderStats();
  renderTabs();
  renderStatusChart();
  renderAttention();
}

const TILES = [
  ['Total', 'total', '', '#44546f'],
  ['New', 'new', 'NEW', '#2a78d6'],
  ['In progress', 'in_progress', 'IN PROGRESS', '#eda100'],
  ['With testers', 'retest', 'RETEST', '#4a3aa7'],
  ['Reopened', 'reopened', 'REOPENED', '#e34948'],
  ['Closed', 'closed', 'CLOSED', '#008300'],
];

const TILE_FOOT = {
  total: 'Reported so far',
  new: 'Not started',
  in_progress: 'You are on these',
  retest: 'Awaiting a retest',
  reopened: 'A fix did not hold',
  closed: 'Passed retest',
};

function renderStats() {
  document.getElementById('stats').innerHTML = TILES.map(([label, key, status, tone]) => `
    <a class="stat${filters.status && filters.status === status ? ' selected' : ''}"
       href="#" data-status="${status}" style="--tone:${tone}">
      <div class="label">${label}</div>
      <div class="value">${stats[key]}</div>
      <div class="foot">${TILE_FOOT[key]}</div>
    </a>`).join('');

  document.querySelectorAll('#stats .stat').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      setStatus(el.dataset.status);
    });
  });
}

function renderTabs() {
  const tabs = [
    ['All', '', stats.total],
    ['New', 'NEW', stats.new],
    ['In progress', 'IN PROGRESS', stats.in_progress],
    ['Retest', 'RETEST', stats.retest],
    ['Reopened', 'REOPENED', stats.reopened],
    ['Closed', 'CLOSED', stats.closed],
  ];

  document.getElementById('tabs').innerHTML = tabs.map(([label, status, count]) => `
    <button class="tab${filters.status === status ? ' active' : ''}" data-status="${status}">
      ${label}<span class="count">${count}</span>
    </button>`).join('');

  document.querySelectorAll('#tabs .tab').forEach((el) => {
    el.addEventListener('click', () => {
      filters.status = el.dataset.status;
      renderStats();
      renderTabs();
      renderStatusChart();
      loadTickets();
    });
  });
}

function renderStatusChart() {
  const box = document.getElementById('status-chart');
  renderStatusStack(box, stats, filters.status);
  box.querySelectorAll('[data-status]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      setStatus(el.dataset.status);
    });
  });
}

/* Everything that is sitting with Dinesh rather than with a tester. */
function renderAttention() {
  const waiting = stats.new + stats.reopened;
  const box = document.getElementById('attention');

  if (!waiting) {
    box.innerHTML = stats.total
      ? `<div class="callout callout-done">
           <span class="callout-icon">${icon('check')}</span>
           <div class="msg">Nothing is waiting on you
             <small>Every reported ticket is either in progress, with a tester, or closed.</small></div>
         </div>`
      : '';
    return;
  }

  const parts = [];
  if (stats.new) parts.push(`${stats.new} new`);
  if (stats.reopened) parts.push(`${stats.reopened} reopened`);

  box.innerHTML = `
    <div class="callout${stats.reopened ? ' callout-alert' : ''}">
      <span class="callout-icon">${icon(stats.reopened ? 'alert' : 'inbox')}</span>
      <div class="msg">${waiting} ${plural(waiting, 'ticket needs', 'tickets need')} you
        <small>${parts.join(' · ')}. Reopened tickets failed a retest, so they come first.</small></div>
      <div class="btn-row">
        ${stats.reopened ? '<button class="btn btn-danger" data-jump="REOPENED">Show reopened</button>' : ''}
        ${stats.new ? '<button class="btn btn-primary" data-jump="NEW">Show new</button>' : ''}
      </div>
    </div>`;

  box.querySelectorAll('[data-jump]').forEach((btn) => {
    btn.addEventListener('click', () => {
      filters.status = btn.dataset.jump;
      renderStats();
      renderTabs();
      renderStatusChart();
      loadTickets();
      document.getElementById('list').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

/* The overview describes every ticket, not the filtered table, so it reads
   the unfiltered list once. */
async function loadOverview() {
  const { tickets } = await api('/api/tickets');

  const order = ['Critical', 'High', 'Medium', 'Low'];
  const byPriority = countBy(tickets, 'priority');
  renderBars(
    document.getElementById('priority-chart'),
    order.map((label) => ({
      label,
      value: (byPriority.find((c) => c.label === label) || {}).value || 0,
      tone: PRIORITY_TONE[label],
    })),
    'No tickets yet.'
  );

  renderBars(
    document.getElementById('module-chart'),
    countBy(tickets, 'module', 6).map((m) => ({ ...m, tone: '#2a78d6' })),
    'Module hotspots appear once tickets come in.'
  );

  renderOldest(tickets);
}

/* Open tickets, oldest first — the queue that tells you what is going stale. */
function renderOldest(tickets) {
  const open = tickets
    .filter((t) => t.status !== 'CLOSED')
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .slice(0, 5);

  const box = document.getElementById('oldest');

  if (!open.length) {
    box.innerHTML = `<div class="empty">${icon('check')}<strong>Nothing is open</strong>
      Every ticket reported so far has been closed.</div>`;
    return;
  }

  box.innerHTML = open.map((t) => `
    <a class="tbl-row row-compact" style="--cols: 96px minmax(0,1fr) 128px 88px" href="/ticket.html?id=${t.id}">
      <span class="c-id ticket-id">${t.ticket_number}</span>
      <span class="c-title title">${escapeHtml(t.title)}</span>
      <span class="c-status">${statusBadge(t.status)}</span>
      <span class="c-updated meta" title="Reported ${formatDate(t.created_at)}">${timeAgo(t.created_at)}</span>
    </a>`).join('');
}

async function loadTickets() {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });

  const { tickets } = await api('/api/tickets?' + params.toString());
  renderTicketTable(document.getElementById('list'), tickets, true);

  const active = Object.entries(filters).filter(([, v]) => v).length;
  document.getElementById('result-count').textContent =
    `${tickets.length} ${plural(tickets.length, 'ticket')}${active ? ' · ' + active + ' ' + plural(active, 'filter') + ' active' : ''}`;
}
