document.addEventListener('DOMContentLoaded', async () => {
  const page = document.body && document.body.dataset ? document.body.dataset.page : '';
  const excludedPages = new Set(['employee-panel', 'employee-profile', 'employee-settings', 'admin-panel', 'signin', 'signup', 'login']);
  if (excludedPages.has(page)) {
    return;
  }

  if (!window.isAuthenticated || !window.fetchWithAuth) {
    return;
  }

  if (!window.isAuthenticated()) {
    return;
  }

  if (document.getElementById('customerTicketLauncher')) {
    return;
  }

  let panelOpen = false;
  let workspacesLoaded = false;
  let ticketsLoaded = false;
  let pollTimer = null;
  let tickets = [];
  let selectedTicketId = null;

  const launcherWrap = document.createElement('div');
  launcherWrap.className = 'ticket-launcher';
  launcherWrap.innerHTML = `
    <button id="customerTicketLauncher" class="ticket-launcher-btn" type="button" aria-label="Open support chat" aria-expanded="false" title="Open support chat">
      <span aria-hidden="true">✉</span>
    </button>
  `;

  const panel = document.createElement('section');
  panel.id = 'customerTicketPanel';
  panel.className = 'ticket-panel';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Support Chat');
  panel.innerHTML = `
    <div class="ticket-panel-head">
      <div>
        <h3>Support Chat</h3>
        <p>Message the DevDock team in real time.</p>
      </div>
      <button id="closeCustomerTicketPanel" class="btn btn-secondary" type="button">Close</button>
    </div>

    <p id="customerTicketMessage" class="workspace-message"></p>

    <div class="ticket-chat-surface">
      <section class="ticket-chat-list-panel">
        <h4>Conversations</h4>
        <div id="customerTicketList" class="ticket-chat-list"></div>
        <p id="customerTicketEmpty" class="muted" style="display:none;">No chats yet. Start one below.</p>
      </section>

      <section class="ticket-chat-thread-panel">
        <div id="customerTicketThreadMeta" class="ticket-chat-meta muted">Start or select a chat.</div>
        <div id="customerTicketMessages" class="ticket-thread ticket-thread-empty">No messages yet.</div>
        <form id="customerReplyForm" class="ticket-reply-form">
          <label for="customerReplyInput">Reply</label>
          <textarea id="customerReplyInput" rows="2" maxlength="2000" placeholder="Type your message..." disabled></textarea>
          <div class="button-row">
            <button id="sendCustomerReply" class="btn btn-primary" type="submit" disabled>Send</button>
          </div>
        </form>
      </section>
    </div>

    <form id="customerTicketForm" class="workspace-form ticket-panel-form">
      <h4>Start New Chat</h4>
      <label for="customerTicketWorkspace">Workspace</label>
      <select id="customerTicketWorkspace" required>
        <option value="">Select a workspace</option>
      </select>

      <label for="customerTicketCategory">Category</label>
      <select id="customerTicketCategory">
        <option value="support">Support</option>
        <option value="bug">Bug</option>
        <option value="billing">Billing</option>
        <option value="access">Access</option>
        <option value="feature">Feature Request</option>
        <option value="other">Other</option>
      </select>

      <label for="customerTicketSubject">Subject</label>
      <input id="customerTicketSubject" type="text" maxlength="120" placeholder="Short chat subject" required />

      <label for="customerTicketDescription">First Message</label>
      <textarea id="customerTicketDescription" rows="3" placeholder="Describe your issue or request." required></textarea>

      <div class="button-row">
        <button id="submitCustomerTicket" class="btn btn-primary" type="submit">Start Chat</button>
      </div>
    </form>
  `;

  document.body.appendChild(launcherWrap);
  document.body.appendChild(panel);

  const launcherButton = document.getElementById('customerTicketLauncher');
  const closePanelButton = document.getElementById('closeCustomerTicketPanel');
  const ticketMessage = document.getElementById('customerTicketMessage');
  const ticketForm = document.getElementById('customerTicketForm');
  const ticketWorkspace = document.getElementById('customerTicketWorkspace');
  const ticketCategory = document.getElementById('customerTicketCategory');
  const ticketSubject = document.getElementById('customerTicketSubject');
  const ticketDescription = document.getElementById('customerTicketDescription');
  const submitButton = document.getElementById('submitCustomerTicket');
  const ticketList = document.getElementById('customerTicketList');
  const ticketEmpty = document.getElementById('customerTicketEmpty');
  const threadMeta = document.getElementById('customerTicketThreadMeta');
  const ticketMessages = document.getElementById('customerTicketMessages');
  const replyForm = document.getElementById('customerReplyForm');
  const replyInput = document.getElementById('customerReplyInput');
  const replyButton = document.getElementById('sendCustomerReply');

  if (!launcherButton || !closePanelButton || !ticketMessage || !ticketForm || !ticketWorkspace || !ticketCategory || !ticketSubject || !ticketDescription || !submitButton || !ticketList || !ticketEmpty || !threadMeta || !ticketMessages || !replyForm || !replyInput || !replyButton) {
    panel.remove();
    launcherWrap.remove();
    return;
  }

  function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }

  function setMessage(message, type = 'info') {
    ticketMessage.textContent = message || '';

    if (!message) {
      ticketMessage.className = 'workspace-message';
      return;
    }

    if (type === 'error') {
      ticketMessage.className = 'workspace-message error-message';
      return;
    }

    if (type === 'success') {
      ticketMessage.className = 'workspace-message success-message';
      return;
    }

    ticketMessage.className = 'workspace-message muted';
  }

  function getSelectedTicket() {
    return tickets.find((ticket) => ticket.id === selectedTicketId) || null;
  }

  function normalizeMessages(ticket) {
    return Array.isArray(ticket && ticket.messages) ? ticket.messages : [];
  }

  function setReplyEnabled(enabled) {
    replyInput.disabled = !enabled;
    replyButton.disabled = !enabled;
  }

  function renderThread() {
    const selected = getSelectedTicket();
    if (!selected) {
      threadMeta.textContent = 'Start or select a chat.';
      ticketMessages.className = 'ticket-thread ticket-thread-empty';
      ticketMessages.innerHTML = 'No messages yet.';
      setReplyEnabled(false);
      return;
    }

    const messages = normalizeMessages(selected);
    threadMeta.textContent = `${selected.reason || 'Chat'} • ${selected.workspaceName || 'Workspace'} • ${selected.status || 'pending'}`;

    if (!messages.length) {
      ticketMessages.className = 'ticket-thread ticket-thread-empty';
      ticketMessages.innerHTML = 'No messages yet.';
      setReplyEnabled(true);
      return;
    }

    ticketMessages.className = 'ticket-thread';
    ticketMessages.innerHTML = messages.map((message) => {
      const authorType = String(message.authorType || 'customer').toLowerCase();
      const bubbleClass = authorType === 'employee' ? 'ticket-msg ticket-msg--employee' : 'ticket-msg ticket-msg--customer';

      return `
        <article class="${bubbleClass}">
          <div class="ticket-msg-author">${escapeHtml(message.authorName || (authorType === 'employee' ? 'Support' : 'You'))}</div>
          <p class="ticket-msg-text">${escapeHtml(message.text || '')}</p>
          <div class="ticket-msg-time">${escapeHtml(formatDate(message.createdAt))}</div>
        </article>
      `;
    }).join('');

    ticketMessages.scrollTop = ticketMessages.scrollHeight;
    setReplyEnabled(true);
  }

  function renderTicketList() {
    ticketList.innerHTML = '';

    if (!tickets.length) {
      ticketEmpty.style.display = '';
      renderThread();
      return;
    }

    ticketEmpty.style.display = 'none';

    tickets.forEach((ticket) => {
      const messages = normalizeMessages(ticket);
      const lastMessage = messages.length ? messages[messages.length - 1] : null;
      const preview = lastMessage ? lastMessage.text : (ticket.description || 'No messages yet');
      const stamp = lastMessage ? lastMessage.createdAt : ticket.createdAt;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = `ticket-chat-item${ticket.id === selectedTicketId ? ' active' : ''}`;
      button.dataset.ticketId = ticket.id;
      button.innerHTML = `
        <div class="ticket-chat-title">${escapeHtml(ticket.reason || 'Support Chat')}</div>
        <p class="ticket-chat-preview">${escapeHtml(String(preview).slice(0, 100))}</p>
        <div class="ticket-chat-meta">${escapeHtml(formatDate(stamp))}</div>
      `;
      ticketList.appendChild(button);
    });

    if (!selectedTicketId && tickets[0]) {
      selectedTicketId = tickets[0].id;
    }

    renderThread();
  }

  function setPanelOpen(nextOpen) {
    panelOpen = !!nextOpen;
    panel.hidden = !panelOpen;
    launcherButton.classList.toggle('active', panelOpen);
    launcherButton.setAttribute('aria-expanded', String(panelOpen));

    if (!panelOpen) {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      return;
    }

    if (!pollTimer) {
      pollTimer = setInterval(() => {
        if (panelOpen) {
          loadTickets(true).catch((error) => {
            console.error('Customer chat polling error:', error);
          });
        }
      }, 5000);
    }

    if (!selectedTicketId) {
      ticketSubject.focus();
    } else {
      replyInput.focus();
    }
  }

  function setCreateBusy(isBusy) {
    submitButton.disabled = isBusy;
    submitButton.textContent = isBusy ? 'Starting...' : 'Start Chat';
  }

  function setReplyBusy(isBusy) {
    replyButton.disabled = isBusy;
    replyButton.textContent = isBusy ? 'Sending...' : 'Send';
  }

  function renderWorkspaceOptions(workspaces) {
    ticketWorkspace.innerHTML = '<option value="">Select a workspace</option>';

    workspaces.forEach((workspace) => {
      const option = document.createElement('option');
      option.value = workspace.id;
      option.textContent = workspace.name || workspace.id;
      ticketWorkspace.appendChild(option);
    });

    if (workspaces.length === 1) {
      ticketWorkspace.value = workspaces[0].id;
    }
  }

  async function loadWorkspaces() {
    const response = await fetchWithAuth('/api/workspaces');
    if (!response) {
      setMessage('Session expired. Please sign in again.', 'error');
      return false;
    }

    const payload = await response.json();
    const workspaces = Array.isArray(payload.workspaces) ? payload.workspaces : [];
    renderWorkspaceOptions(workspaces);

    if (!workspaces.length) {
      setMessage('No workspaces available. Create a workspace before opening support chat.', 'error');
      submitButton.disabled = true;
      return false;
    }

    submitButton.disabled = false;
    return true;
  }

  async function loadTickets(silent = false) {
    const response = await fetchWithAuth('/api/tickets?mode=customer');
    if (!response) {
      if (!silent) setMessage('Session expired. Please sign in again.', 'error');
      return;
    }

    const payload = await response.json();
    if (!payload.success || !Array.isArray(payload.tickets)) {
      if (!silent) setMessage(payload.error || 'Unable to load chats.', 'error');
      return;
    }

    const previousSelected = selectedTicketId;
    tickets = payload.tickets;

    if (previousSelected && tickets.some((ticket) => ticket.id === previousSelected)) {
      selectedTicketId = previousSelected;
    } else {
      selectedTicketId = tickets[0] ? tickets[0].id : null;
    }

    renderTicketList();

    if (!silent) {
      setMessage(tickets.length ? `Loaded ${tickets.length} chat${tickets.length === 1 ? '' : 's'}.` : 'No chats yet. Start one below.', 'info');
    }
  }

  launcherButton.addEventListener('click', async () => {
    const opening = !panelOpen;
    setPanelOpen(opening);

    if (!opening) {
      return;
    }

    if (!workspacesLoaded) {
      setMessage('Loading workspaces...', 'info');
      try {
        workspacesLoaded = await loadWorkspaces();
      } catch (error) {
        console.error('Failed to load workspaces for ticket widget:', error);
        setMessage('Unable to load workspaces right now.', 'error');
      }
    }

    if (!ticketsLoaded) {
      try {
        await loadTickets(false);
        ticketsLoaded = true;
      } catch (error) {
        console.error('Failed to load customer chats:', error);
        setMessage('Unable to load chats right now.', 'error');
      }
    }
  });

  closePanelButton.addEventListener('click', () => {
    setPanelOpen(false);
  });

  ticketList.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-ticket-id]');
    if (!trigger) return;

    selectedTicketId = trigger.dataset.ticketId;
    renderTicketList();
  });

  replyForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const selected = getSelectedTicket();
    const message = String(replyInput.value || '').trim();
    if (!selected) {
      setMessage('Select a chat first.', 'error');
      return;
    }

    if (!message) {
      setMessage('Message is required.', 'error');
      return;
    }

    setReplyBusy(true);
    setMessage('Sending message...', 'info');

    try {
      const response = await fetchWithAuth('/api/tickets?mode=customer', {
        method: 'PATCH',
        body: JSON.stringify({
          ticketId: selected.id,
          action: 'reply',
          message,
        }),
      });

      if (!response) {
        setMessage('Session expired. Please sign in again.', 'error');
        return;
      }

      const payload = await response.json();
      if (!payload.success || !payload.ticket) {
        setMessage(payload.error || 'Unable to send message.', 'error');
        return;
      }

      tickets = [payload.ticket, ...tickets.filter((ticket) => ticket.id !== payload.ticket.id)];
      selectedTicketId = payload.ticket.id;
      replyInput.value = '';
      renderTicketList();
      setMessage('Message sent.', 'success');
    } catch (error) {
      console.error('Customer reply error:', error);
      setMessage('Network error while sending message.', 'error');
    } finally {
      setReplyBusy(false);
    }
  });

  ticketForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const workspaceId = ticketWorkspace.value;
    const category = ticketCategory.value;
    const subject = ticketSubject.value.trim();
    const message = ticketDescription.value.trim();

    if (!workspaceId || !subject || !message) {
      setMessage('Workspace, subject, and first message are required.', 'error');
      return;
    }

    setCreateBusy(true);
    setMessage('Starting chat...', 'info');

    try {
      const response = await fetchWithAuth('/api/tickets?mode=customer', {
        method: 'POST',
        body: JSON.stringify({ workspaceId, category, subject, message }),
      });

      if (!response) {
        setMessage('Session expired. Please sign in again.', 'error');
        return;
      }

      const payload = await response.json();
      if (!payload.success || !payload.ticket) {
        setMessage(payload.error || 'Unable to start chat.', 'error');
        return;
      }

      tickets = [payload.ticket, ...tickets.filter((ticket) => ticket.id !== payload.ticket.id)];
      selectedTicketId = payload.ticket.id;

      ticketSubject.value = '';
      ticketDescription.value = '';
      renderTicketList();
      setMessage('Chat started. A team member will reply shortly.', 'success');
    } catch (error) {
      console.error('Customer ticket submit error:', error);
      setMessage('Network error while starting chat.', 'error');
    } finally {
      setCreateBusy(false);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && panelOpen) {
      setPanelOpen(false);
    }
  });

  document.addEventListener('click', (event) => {
    if (!panelOpen) return;
    const withinPanel = panel.contains(event.target);
    const withinLauncher = launcherWrap.contains(event.target);
    if (!withinPanel && !withinLauncher) {
      setPanelOpen(false);
    }
  });
});
