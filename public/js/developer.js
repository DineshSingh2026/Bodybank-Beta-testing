const filters = { status: '', q: '', module: '', priority: '' };

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

  await Promise.all([loadStats(), loadTickets()]);
})();

function option(id, values, placeholder) {
  document.getElementById(id).innerHTML =
    `<option value="">${placeholder}</option>` +
    values.map((v) => `<option value="${v}">${v}</option>`).join('');
}

async function loadStats() {
  const s = await api('/api/tickets/stats');
  const cards = [
    ['Total tickets', s.total, ''],
    ['New', s.new, 'NEW'],
    ['In progress', s.in_progress, 'IN PROGRESS'],
    ['Retest', s.retest, 'RETEST'],
    ['Reopened', s.reopened, 'REOPENED'],
    ['Closed', s.closed, 'CLOSED'],
  ];

  document.getElementById('stats').innerHTML = cards.map(([label, value, status]) => `
    <a class="stat${filters.status && filters.status === status ? ' selected' : ''}" href="#" data-status="${status}">
      <div class="label">${label}</div>
      <div class="value">${value}</div>
    </a>`).join('');

  document.querySelectorAll('#stats .stat').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const next = el.dataset.status;
      filters.status = filters.status === next ? '' : next;
      loadStats();
      loadTickets();
    });
  });
}

async function loadTickets() {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });

  const { tickets } = await api('/api/tickets?' + params.toString());
  renderTicketTable(document.getElementById('list'), tickets, true);
}
