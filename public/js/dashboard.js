let filterStatus = '';
let searchTerm = '';
let stats = null;

(async function init() {
  const user = await guard('tester');
  if (!user) return;

  renderTopbar(user, '/dashboard.html');
  document.getElementById('greeting').textContent = 'Hi ' + user.name.split(' ')[0];

  document.getElementById('search').addEventListener('input', (e) => {
    searchTerm = e.target.value.trim();
    loadTickets();
  });

  await Promise.all([loadStats(), loadTickets(), loadOverview()]);
})();

/* Status filtering is shared by the stat tiles, the legend, and the tabs. */
function setStatus(next) {
  filterStatus = filterStatus === next ? '' : next;
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
  renderCallout();
}

const TILES = [
  ['My tickets', 'total', '', '#0c66e4'],
  ['New', 'new', 'NEW', '#2a78d6'],
  ['In progress', 'in_progress', 'IN PROGRESS', '#eda100'],
  ['Waiting on you', 'retest', 'RETEST', '#4a3aa7'],
  ['Closed', 'closed', 'CLOSED', '#008300'],
];

function renderStats() {
  document.getElementById('stats').innerHTML = TILES.map(([label, key, status, tone]) => `
    <a class="stat${filterStatus && filterStatus === status ? ' selected' : ''}"
       href="#" data-status="${status}" style="--tone:${tone}">
      <div class="label">${label}</div>
      <div class="value">${stats[key]}</div>
      <div class="foot">${status ? (filterStatus === status ? 'Filtering — click to clear' : 'Click to filter') : 'Everything you reported'}</div>
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
    <button class="tab${filterStatus === status ? ' active' : ''}" data-status="${status}">
      ${label}<span class="count">${count}</span>
    </button>`).join('');

  document.querySelectorAll('#tabs .tab').forEach((el) => {
    el.addEventListener('click', () => {
      // The All tab clears rather than toggles.
      filterStatus = el.dataset.status;
      renderStats();
      renderTabs();
      renderStatusChart();
      loadTickets();
    });
  });
}

function renderStatusChart() {
  const box = document.getElementById('status-chart');
  renderStatusStack(box, stats, filterStatus);
  box.querySelectorAll('[data-status]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      setStatus(el.dataset.status);
    });
  });
}

function renderCallout() {
  // Anything waiting on the tester gets called out above the fold.
  const callout = document.getElementById('retest-callout');
  callout.innerHTML = stats.retest
    ? `<div class="callout">
         <span class="callout-icon">${icon('bell')}</span>
         <div class="msg">${stats.retest} ${plural(stats.retest, 'fix is', 'fixes are')} ready for you to retest
           <small>Install the latest build, try the steps again, then pass or fail each fix.</small></div>
         <div class="btn-row"><button class="btn btn-primary" id="show-retest">Show them</button></div>
       </div>`
    : '';

  const btn = document.getElementById('show-retest');
  if (btn) {
    btn.addEventListener('click', () => {
      filterStatus = 'RETEST';
      renderStats();
      renderTabs();
      renderStatusChart();
      loadTickets();
      document.getElementById('list').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
}

/* The overview charts describe every ticket you have, not the filtered view,
   so they are loaded once from the unfiltered list. */
async function loadOverview() {
  const { tickets } = await api('/api/tickets');
  const order = ['Critical', 'High', 'Medium', 'Low'];
  const counts = countBy(tickets, 'priority');

  renderBars(
    document.getElementById('priority-chart'),
    order.map((label) => ({
      label,
      value: (counts.find((c) => c.label === label) || {}).value || 0,
      tone: PRIORITY_TONE[label],
    })),
    'Report your first issue and the priority mix shows up here.'
  );
}

async function loadTickets() {
  const params = new URLSearchParams();
  if (filterStatus) params.set('status', filterStatus);
  if (searchTerm) params.set('q', searchTerm);

  const { tickets } = await api('/api/tickets?' + params.toString());
  renderTicketTable(document.getElementById('list'), tickets, false);

  document.getElementById('result-count').textContent =
    `${tickets.length} ${plural(tickets.length, 'ticket')}${filterStatus ? ' in ' + filterStatus : ''}`;
}
