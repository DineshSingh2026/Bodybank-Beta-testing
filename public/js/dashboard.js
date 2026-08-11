let filterStatus = '';
let searchTerm = '';

(async function init() {
  const user = await guard('tester');
  if (!user) return;

  renderTopbar(user, '/dashboard.html');
  document.getElementById('greeting').textContent = 'Hi ' + user.name.split(' ')[0];

  document.getElementById('search').addEventListener('input', (e) => {
    searchTerm = e.target.value.trim();
    loadTickets();
  });

  await Promise.all([loadStats(), loadTickets()]);
})();

async function loadStats() {
  const s = await api('/api/tickets/stats');
  const cards = [
    ['My tickets', s.total, ''],
    ['New', s.new, 'NEW'],
    ['In progress', s.in_progress, 'IN PROGRESS'],
    ['Retest', s.retest, 'RETEST'],
    ['Closed', s.closed, 'CLOSED'],
  ];

  document.getElementById('stats').innerHTML = cards.map(([label, value, status]) => `
    <a class="stat${filterStatus && filterStatus === status ? ' selected' : ''}" href="#" data-status="${status}">
      <div class="label">${label}</div>
      <div class="value">${value}</div>
    </a>`).join('');

  document.querySelectorAll('#stats .stat').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const next = el.dataset.status;
      filterStatus = filterStatus === next ? '' : next;
      loadStats();
      loadTickets();
    });
  });

  // Anything waiting on the tester gets called out above the fold.
  const callout = document.getElementById('retest-callout');
  callout.innerHTML = s.retest
    ? `<div class="callout">
         <div class="msg">${s.retest} ${s.retest === 1 ? 'fix is' : 'fixes are'} ready for retest
           <small>Check the fix on your device, then pass or fail it.</small></div>
         <button class="btn btn-outline" id="show-retest">Show them</button>
       </div>`
    : '';

  const btn = document.getElementById('show-retest');
  if (btn) {
    btn.addEventListener('click', () => {
      filterStatus = 'RETEST';
      loadStats();
      loadTickets();
    });
  }
}

async function loadTickets() {
  const params = new URLSearchParams();
  if (filterStatus) params.set('status', filterStatus);
  if (searchTerm) params.set('q', searchTerm);

  const { tickets } = await api('/api/tickets?' + params.toString());
  renderTicketTable(document.getElementById('list'), tickets, false);
}
