const message = document.getElementById('message');
const submit = document.getElementById('submit');

(async function init() {
  const user = await guard('tester');
  if (!user) return;
  renderTopbar(user, '/report.html');

  const meta = await api('/api/meta');
  fill('module', meta.MODULES, 'Choose a module');
  fill('issue_type', meta.ISSUE_TYPES, 'Choose a type');
  fill('priority', meta.PRIORITIES, 'Choose a priority', 'Medium');

  // Prefill the device from the browser so mobile testers type less.
  document.getElementById('device').value = guessDevice();
})();

function fill(id, values, placeholder, preselect) {
  const select = document.getElementById(id);
  select.innerHTML =
    `<option value="">${placeholder}</option>` +
    values.map((v) => `<option value="${v}"${v === preselect ? ' selected' : ''}>${v}</option>`).join('');
}

function guessDevice() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  const android = ua.match(/Android [\d.]+; ([^;)]+)/);
  if (android) return android[1].trim();
  return '';
}

submit.addEventListener('click', async () => {
  message.className = 'alert';
  message.textContent = '';

  const form = new FormData();
  ['title', 'module', 'issue_type', 'priority', 'description', 'steps',
   'expected_result', 'actual_result', 'device', 'app_version']
    .forEach((f) => form.append(f, document.getElementById(f).value));

  const file = document.getElementById('screenshot').files[0];
  if (file) form.append('screenshot', file);

  submit.disabled = true;
  submit.textContent = 'Reporting…';

  try {
    const ticket = await api('/api/tickets', { method: 'POST', body: form });
    location.replace(`/ticket.html?id=${ticket.id}&created=${ticket.ticket_number}`);
  } catch (err) {
    showError(message, err.message);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    submit.disabled = false;
    submit.textContent = 'Report issue';
  }
});
