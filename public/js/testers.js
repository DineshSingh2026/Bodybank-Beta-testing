const message = document.getElementById('message');
const submit = document.getElementById('submit');

(async function init() {
  const user = await guard('developer');
  if (!user) return;
  renderTopbar(user, '/testers.html');

  document.getElementById('password').value = suggestPassword();
  await loadTesters();
})();

function suggestPassword() {
  return 'bb-' + Math.random().toString(36).slice(2, 8);
}

async function loadTesters() {
  const { testers } = await api('/api/auth/testers');
  const list = document.getElementById('list');

  if (!testers.length) {
    list.innerHTML = `<div class="empty"><strong>No testers yet</strong>
      Add the first one above to start collecting bug reports.</div>`;
    return;
  }

  const cols = 'minmax(0,1fr) minmax(0,1.2fr) 110px 110px';
  list.innerHTML = `
    <div class="tbl-head" style="--cols:${cols}">
      <span>Name</span><span>Email</span><span>Tickets</span><span>Added</span>
    </div>` +
    testers.map((t) => `
      <div class="tbl-row" style="--cols:${cols}">
        <span class="title">${escapeHtml(t.name)}</span>
        <span class="meta">${escapeHtml(t.email)}</span>
        <span class="meta">${t.ticket_count}</span>
        <span class="meta">${formatDate(t.created_at)}</span>
      </div>`).join('');
}

submit.addEventListener('click', async () => {
  message.className = 'alert';
  message.textContent = '';
  submit.disabled = true;

  const password = document.getElementById('password').value;

  try {
    const { tester } = await apiJson('/api/auth/testers', 'POST', {
      name: document.getElementById('name').value,
      email: document.getElementById('email').value,
      password,
    });

    message.className = 'alert alert-success';
    message.textContent =
      `${tester.name} can now sign in with ${tester.email} and the password ${password}.`;

    document.getElementById('name').value = '';
    document.getElementById('email').value = '';
    document.getElementById('password').value = suggestPassword();
    await loadTesters();
  } catch (err) {
    showError(message, err.message);
  } finally {
    submit.disabled = false;
  }
});
