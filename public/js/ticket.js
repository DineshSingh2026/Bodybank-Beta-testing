const params = new URLSearchParams(location.search);
const ticketId = params.get('id');
const messageEl = document.getElementById('message');
const contentEl = document.getElementById('content');

let me = null;

(async function init() {
  me = await guard();
  if (!me) return;

  renderTopbar(me, null);
  document.getElementById('back').href = homeFor(me);

  const created = params.get('created');
  if (created) {
    document.getElementById('banner').innerHTML =
      `<div class="alert alert-success">Ticket ${escapeHtml(created)} created successfully. Dinesh has it now.</div>`;
  }

  wireFailModal();
  await load();
})();

async function load() {
  try {
    const data = await api('/api/tickets/' + ticketId);
    render(data);
  } catch (err) {
    contentEl.innerHTML = `<div class="card"><div class="empty"><strong>${escapeHtml(err.message)}</strong>
      <a href="${homeFor(me)}">Back to tickets</a></div></div>`;
  }
}

/* ------------------------------------------------------------- rendering */

const RAIL_INDEX = { 'NEW': 0, 'IN PROGRESS': 1, 'REOPENED': 1, 'FIXED': 2, 'RETEST': 2, 'CLOSED': 3 };

function rail(status) {
  const steps = status === 'REOPENED'
    ? ['NEW', 'REOPENED', 'RETEST', 'CLOSED']
    : ['NEW', 'IN PROGRESS', 'RETEST', 'CLOSED'];
  const current = RAIL_INDEX[status];

  return steps.map((label, i) => {
    const state = i < current ? 'done' : i === current ? 'current' : '';
    const reopen = label === 'REOPENED' ? ' reopen' : '';
    const line = i < steps.length - 1
      ? `<span class="rail-line${i < current ? ' done' : ''}"></span>` : '';
    return `<div class="rail-step ${state}${reopen}">
              <span class="rail-dot"></span><span class="rail-label">${label}</span>
            </div>${line}`;
  }).join('');
}

function block(title, value) {
  return `<div class="block"><h3>${title}</h3>${
    value ? `<p>${escapeHtml(value)}</p>` : '<p class="none">Not provided</p>'
  }</div>`;
}

function render({ ticket, comments, history }) {
  const isDev = me.role === 'developer';

  contentEl.innerHTML = `
    <div class="page-head">
      <div>
        <div class="detail-title">
          <span class="ticket-id" style="font-size:15px;">${ticket.ticket_number}</span>
          ${statusBadge(ticket.status)}
          ${priorityTag(ticket.priority)}
        </div>
        <h1>${escapeHtml(ticket.title)}</h1>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px;">
      <div class="rail">${rail(ticket.status)}</div>
    </div>

    <div id="actions"></div>

    <div class="detail">
      <div>
        <div class="card" style="margin-bottom:20px;">
          <div class="card-body">
            ${block('Description', ticket.description)}
            ${block('Steps to reproduce', ticket.steps)}
            ${block('Expected result', ticket.expected_result)}
            ${block('Actual result', ticket.actual_result)}
            <div class="block">
              <h3>Screenshot</h3>
              ${ticket.screenshot
                ? `<a href="${ticket.screenshot}" target="_blank" rel="noopener">
                     <img class="shot" src="${ticket.screenshot}" alt="Screenshot for ${ticket.ticket_number}"></a>`
                : '<p class="none">No screenshot attached</p>'}
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h2>Comments</h2></div>
          <div class="card-body">
            <div id="comments">${renderComments(comments)}</div>
            <div style="margin-top:18px;border-top:1px solid var(--line);padding-top:18px;">
              <div id="comment-error" class="alert"></div>
              <div class="field">
                <label for="comment">Add a comment</label>
                <textarea id="comment" placeholder="${isDev
                  ? 'Ask the tester for more detail, or note what you found.'
                  : 'Add anything else that helps Dinesh reproduce it.'}"></textarea>
              </div>
              <div class="field">
                <label for="comment-shot">Screenshot <span class="hint">— optional</span></label>
                <input type="file" id="comment-shot" accept="image/*">
              </div>
              <button class="btn btn-outline" id="post-comment">Post comment</button>
            </div>
          </div>
        </div>
      </div>

      <aside>
        <div class="card" style="margin-bottom:20px;">
          <div class="card-head"><h2>Details</h2></div>
          <div class="card-body">
            <dl class="facts">
              <div><dt>Tester</dt><dd>${escapeHtml(ticket.tester_name)}</dd></div>
              <div><dt>Assigned to</dt><dd>${escapeHtml(ticket.developer_name || 'Unassigned')}</dd></div>
              <div><dt>Module</dt><dd>${escapeHtml(ticket.module)}</dd></div>
              <div><dt>Issue type</dt><dd>${escapeHtml(ticket.issue_type)}</dd></div>
              <div><dt>Device</dt><dd class="mono">${escapeHtml(ticket.device || '—')}</dd></div>
              <div><dt>App version</dt><dd class="mono">${escapeHtml(ticket.app_version || '—')}</dd></div>
              <div><dt>Created</dt><dd>${formatDate(ticket.created_at)}</dd></div>
              <div><dt>Updated</dt><dd>${timeAgo(ticket.updated_at)}</dd></div>
            </dl>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h2>Activity</h2></div>
          <div class="card-body">
            <ul class="history">${history.map((h) => `
              <li>${escapeHtml(h.action)}<time>${formatDateTime(h.created_at)}</time></li>`).join('')}
            </ul>
          </div>
        </div>
      </aside>
    </div>`;

  renderActions(ticket);

  document.getElementById('post-comment').addEventListener('click', () => postComment(ticket));
}

function renderComments(comments) {
  if (!comments.length) return '<p class="block none" style="margin:0;">No comments yet.</p>';
  return comments.map((c) => `
    <div class="comment">
      <div class="who">
        <strong>${escapeHtml(c.author)}</strong><span class="role">${c.role}</span>
        <time>${formatDateTime(c.created_at)}</time>
      </div>
      <p>${escapeHtml(c.comment)}</p>
      ${c.screenshot ? `<a href="${c.screenshot}" target="_blank" rel="noopener">
        <img class="shot" src="${c.screenshot}" alt="Comment screenshot" style="max-width:280px;"></a>` : ''}
    </div>`).join('');
}

/* --------------------------------------------------------------- actions */

function renderActions(ticket) {
  const box = document.getElementById('actions');
  const isDev = me.role === 'developer';
  let html = '';

  if (isDev) {
    if (ticket.status === 'NEW') {
      html = callout('This ticket is waiting on you',
        'Start working on it, or mark it fixed to send it straight back for retest.',
        `<button class="btn btn-outline" data-act="start">Start working</button>
         <button class="btn btn-primary" data-act="fix">Mark as fixed</button>`);
    } else if (ticket.status === 'REOPENED') {
      html = callout('The retest failed — this is back with you',
        'Read the tester\u2019s latest comment, then fix it and send it for retest again.',
        `<button class="btn btn-outline" data-act="start">Start working</button>
         <button class="btn btn-primary" data-act="fix">Mark as fixed</button>`, 'callout-alert');
    } else if (ticket.status === 'IN PROGRESS') {
      html = callout('You are working on this ticket',
        'When the fix is in a build the tester can install, mark it fixed.',
        `<button class="btn btn-primary" data-act="fix">Mark as fixed</button>`, 'callout-info');
    } else if (ticket.status === 'RETEST') {
      html = callout(`Waiting for ${ticket.tester_name} to retest`,
        'You will see it again only if the retest fails.', '', 'callout-info');
    } else if (ticket.status === 'CLOSED') {
      html = callout('This ticket is closed',
        `${ticket.tester_name} passed the retest.`, '', 'callout-done');
    }
  } else {
    if (ticket.status === 'RETEST') {
      html = callout(`${ticket.ticket_number} is ready for retest`,
        'Install the latest build, try the steps again, then pass or fail the fix.',
        `<button class="btn btn-primary" data-act="pass">✅ Pass</button>
         <button class="btn btn-danger" data-act="fail">❌ Fail</button>`);
    } else if (ticket.status === 'CLOSED') {
      html = callout('This ticket is closed',
        'You passed the retest. Nothing left to do here.', '', 'callout-done');
    } else if (ticket.status === 'REOPENED') {
      html = callout('Back with Dinesh',
        'You failed the retest, so this ticket is being worked on again.', '', 'callout-info');
    } else {
      html = callout('Dinesh has this ticket',
        'You will get a retest request here once a fix is ready.', '', 'callout-info');
    }
  }

  box.innerHTML = html;
  box.querySelectorAll('[data-act]').forEach((btn) => {
    btn.addEventListener('click', () => runAction(btn.dataset.act, btn));
  });
}

function callout(title, sub, buttons, variant) {
  return `<div class="callout ${variant || ''}">
    <div class="msg">${escapeHtml(title)}<small>${escapeHtml(sub)}</small></div>
    <div class="btn-row">${buttons}</div>
  </div>`;
}

async function runAction(action, btn) {
  if (action === 'fail') return openFailModal();

  messageEl.className = 'alert';
  messageEl.textContent = '';
  btn.disabled = true;

  try {
    await apiJson(`/api/tickets/${ticketId}/${action}`, 'POST');
    await load();
  } catch (err) {
    showError(messageEl, err.message);
    btn.disabled = false;
  }
}

async function postComment(ticket) {
  const errorEl = document.getElementById('comment-error');
  const button = document.getElementById('post-comment');
  errorEl.className = 'alert';
  errorEl.textContent = '';

  const form = new FormData();
  form.append('comment', document.getElementById('comment').value);
  const file = document.getElementById('comment-shot').files[0];
  if (file) form.append('screenshot', file);

  button.disabled = true;
  try {
    await api(`/api/tickets/${ticket.id}/comments`, { method: 'POST', body: form });
    await load();
  } catch (err) {
    showError(errorEl, err.message);
    button.disabled = false;
  }
}

/* ----------------------------------------------------------- fail modal */

function openFailModal() {
  document.getElementById('fail-modal').hidden = false;
  document.getElementById('fail-comment').focus();
}

function wireFailModal() {
  const modal = document.getElementById('fail-modal');
  const errorEl = document.getElementById('fail-error');
  const submit = document.getElementById('fail-submit');

  document.getElementById('fail-cancel').addEventListener('click', () => { modal.hidden = true; });
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.hidden = true; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') modal.hidden = true; });

  submit.addEventListener('click', async () => {
    errorEl.className = 'alert';
    errorEl.textContent = '';

    const form = new FormData();
    form.append('comment', document.getElementById('fail-comment').value);
    const file = document.getElementById('fail-screenshot').files[0];
    if (file) form.append('screenshot', file);

    submit.disabled = true;
    try {
      await api(`/api/tickets/${ticketId}/fail`, { method: 'POST', body: form });
      modal.hidden = true;
      document.getElementById('fail-comment').value = '';
      document.getElementById('fail-screenshot').value = '';
      await load();
    } catch (err) {
      showError(errorEl, err.message);
    } finally {
      submit.disabled = false;
    }
  });
}
