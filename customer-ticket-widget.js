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

  const currentUser = window.getCurrentUser ? window.getCurrentUser() : null;
  const displayNameRaw = currentUser && (currentUser.name || currentUser.username || currentUser.email)
    ? (currentUser.name || currentUser.username || String(currentUser.email || '').split('@')[0])
    : 'there';
  const displayName = String(displayNameRaw || 'there').trim() || 'there';
  const avatarInitial = (displayName.match(/[A-Za-z0-9]/g) || ['U']).slice(0, 2).join('').toUpperCase();

  let panelOpen = false;
  let pollTimer = null;
  let workspacesLoaded = false;
  let ticketsLoaded = false;
  let tickets = [];
  let selectedTicketId = null;
  let activeTab = 'home';
  let messagesSubview = 'list';

  const launcherWrap = document.createElement('div');
  launcherWrap.className = 'ticket-launcher';
  launcherWrap.innerHTML = `
    <button id="customerTicketLauncher" class="ticket-launcher-btn" type="button" aria-label="Open support messenger" aria-expanded="false" title="Open support messenger">
      <span aria-hidden="true">✉</span>
    </button>
  `;

  const panel = document.createElement('section');
  panel.id = 'customerTicketPanel';
  panel.className = 'ticket-panel ticket-panel--messenger';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Support Messenger');
  panel.innerHTML = `
    <header class="messenger-top">
      <span class="messenger-brand-mark" aria-hidden="true">dd</span>
      <h3 id="messengerHeaderTitle" class="messenger-header-title">Home</h3>
      <div class="messenger-head-actions">
        <div class="messenger-avatar-stack" aria-hidden="true">
          <span class="messenger-avatar messenger-avatar--user">${avatarInitial}</span>
          <span class="messenger-avatar messenger-avatar--support">DD</span>
        </div>
        <button id="closeCustomerTicketPanel" class="messenger-close" type="button" aria-label="Close support messenger">×</button>
      </div>
    </header>

    <div class="messenger-content">
      <p id="customerTicketMessage" class="workspace-message" hidden></p>

      <section id="messengerHomeView" class="messenger-view">
        <h2 class="messenger-home-title">Hey ${displayName.replace(/</g, '&lt;').replace(/>/g, '&gt;')},<br />How can we help?</h2>

        <button id="messengerOpenComposer" class="messenger-contact-card" type="button">
          <span class="messenger-contact-title">Contact us</span>
          <span class="messenger-contact-sub">We typically reply in under 20 minutes</span>
          <span class="messenger-contact-arrow" aria-hidden="true">➤</span>
        </button>

        <article class="messenger-status-card">
          <div class="messenger-status-row">
            <span class="messenger-status-dot" aria-hidden="true">✓</span>
            <div>
              <strong>Panora Connect</strong>
              <p>We’re fully operational.</p>
            </div>
          </div>
          <button id="messengerSubscribeUpdates" class="messenger-subscribe-btn" type="button">Subscribe to updates</button>
        </article>

        <a id="messengerCommunityLink" class="messenger-link-card" href="https://discord.gg/Mp7BtYehDY" target="_blank" rel="noopener noreferrer">
          <span>Community Discord</span>
          <span aria-hidden="true">↗</span>
        </a>
      </section>

      <section id="messengerMessagesView" class="messenger-view" hidden>
        <div id="messengerListView" class="messenger-subview">
          <div class="messenger-list-head">
            <h4>Messages</h4>
            <button id="messengerOpenComposerFromMessages" class="messenger-inline-btn" type="button">Contact us</button>
          </div>

          <div id="customerTicketList" class="ticket-chat-list"></div>
          <p id="customerTicketEmpty" class="muted" style="display:none;">No chats yet. Start one with Contact us.</p>
        </div>

        <div id="messengerThreadView" class="messenger-subview" hidden>
          <button id="messengerBackFromThread" class="messenger-inline-btn" type="button">← Back to messages</button>
          <div id="customerTicketThreadMeta" class="ticket-chat-meta muted">Select a chat to view details.</div>
          <div id="customerTicketMessages" class="ticket-thread ticket-thread-empty">No messages yet.</div>

          <form id="customerReplyForm" class="ticket-reply-form">
            <label for="customerReplyInput">Reply</label>
            <textarea id="customerReplyInput" rows="2" maxlength="2000" placeholder="Type your message..." disabled></textarea>
            <div class="button-row">
              <button id="sendCustomerReply" class="btn btn-primary" type="submit" disabled>Send</button>
            </div>
          </form>
        </div>

        <div id="messengerComposerView" class="messenger-subview" hidden>
          <button id="messengerBackFromComposer" class="messenger-inline-btn" type="button">← Back to messages</button>

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
        </div>
      </section>
    </div>

    <nav class="messenger-bottom-nav" aria-label="Support messenger tabs">
      <button id="messengerTabHome" class="messenger-tab active" type="button" aria-current="page">
        <span class="messenger-tab-icon" aria-hidden="true">⌂</span>
        <span>Home</span>
      </button>
      <button id="messengerTabMessages" class="messenger-tab" type="button">
        <span class="messenger-tab-icon" aria-hidden="true">✉</span>
        <span>Messages</span>
      </button>
    </nav>
  `;

  document.body.appendChild(launcherWrap);
  document.body.appendChild(panel);

  const launcherButton = document.getElementById('customerTicketLauncher');
  const closePanelButton = document.getElementById('closeCustomerTicketPanel');
  const headerTitle = document.getElementById('messengerHeaderTitle');
  const homeView = document.getElementById('messengerHomeView');
  const messagesView = document.getElementById('messengerMessagesView');
  const homeTabButton = document.getElementById('messengerTabHome');
  const messagesTabButton = document.getElementById('messengerTabMessages');
  const openComposerFromHome = document.getElementById('messengerOpenComposer');
  const openComposerFromMessages = document.getElementById('messengerOpenComposerFromMessages');
  const subscribeUpdatesButton = document.getElementById('messengerSubscribeUpdates');
  const listSubview = document.getElementById('messengerListView');
  const threadSubview = document.getElementById('messengerThreadView');
  const composerSubview = document.getElementById('messengerComposerView');
  const backFromThread = document.getElementById('messengerBackFromThread');
  const backFromComposer = document.getElementById('messengerBackFromComposer');
  const ticketMessage = document.getElementById('customerTicketMessage');
  const ticketList = document.getElementById('customerTicketList');
  const ticketEmpty = document.getElementById('customerTicketEmpty');
  const threadMeta = document.getElementById('customerTicketThreadMeta');
  const ticketMessages = document.getElementById('customerTicketMessages');
  const replyForm = document.getElementById('customerReplyForm');
  const replyInput = document.getElementById('customerReplyInput');
  const replyButton = document.getElementById('sendCustomerReply');
  const ticketForm = document.getElementById('customerTicketForm');
  const ticketWorkspace = document.getElementById('customerTicketWorkspace');
  const ticketCategory = document.getElementById('customerTicketCategory');
  const ticketSubject = document.getElementById('customerTicketSubject');
  const ticketDescription = document.getElementById('customerTicketDescription');
  const submitButton = document.getElementById('submitCustomerTicket');

  if (
    !launcherButton || !closePanelButton || !headerTitle || !homeView || !messagesView || !homeTabButton || !messagesTabButton ||
    !openComposerFromHome || !openComposerFromMessages || !subscribeUpdatesButton || !listSubview || !threadSubview || !composerSubview ||
    !backFromThread || !backFromComposer || !ticketMessage || !ticketList || !ticketEmpty || !threadMeta || !ticketMessages ||
    !replyForm || !replyInput || !replyButton || !ticketForm || !ticketWorkspace || !ticketCategory || !ticketSubject ||
    !ticketDescription || !submitButton
  ) {
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

  function formatRelativeTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';

    const seconds = Math.max(1, Math.floor((Date.now() - date.getTime()) / 1000));
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d`;
    const months = Math.floor(days / 30);
    return `${months}mo`;
  }

  function setMessage(message, type = 'info') {
    ticketMessage.textContent = message || '';
    ticketMessage.hidden = !message;

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

  function setCreateBusy(isBusy) {
    submitButton.disabled = isBusy;
    submitButton.textContent = isBusy ? 'Starting...' : 'Start Chat';
  }

  function setReplyBusy(isBusy) {
    replyButton.disabled = isBusy;
    replyButton.textContent = isBusy ? 'Sending...' : 'Send';
  }

  function upsertLocalTicket(ticket) {
    tickets = [ticket, ...tickets.filter((item) => item.id !== ticket.id)];
    selectedTicketId = ticket.id;
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

  function renderThread() {
    const selected = getSelectedTicket();
    if (!selected) {
      threadMeta.textContent = 'Select a chat to view details.';
      ticketMessages.className = 'ticket-thread ticket-thread-empty';
      ticketMessages.innerHTML = 'No messages yet.';
      setReplyEnabled(false);
      return;
    }

    const messages = normalizeMessages(selected);
    threadMeta.textContent = `${selected.reason || 'Support Chat'} • ${selected.workspaceName || 'Workspace'} • ${selected.status || 'pending'}`;

    if (!messages.length) {
      ticketMessages.className = 'ticket-thread ticket-thread-empty';
      ticketMessages.innerHTML = 'No messages yet.';
      setReplyEnabled(true);
      return;
    }

    ticketMessages.className = 'ticket-thread';
    ticketMessages.innerHTML = messages.map((message) => {
      const authorType = String(message.authorType || 'customer').toLowerCase();
      let bubbleClass = 'ticket-msg ticket-msg--customer';
      if (authorType === 'employee') {
        bubbleClass = 'ticket-msg ticket-msg--employee';
      } else if (authorType === 'system') {
        bubbleClass = 'ticket-msg ticket-msg--system';
      }

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
        <div class="messenger-conversation-head">
          <span class="ticket-chat-title">${escapeHtml(ticket.reason || 'Support Chat')}</span>
          <span class="messenger-conversation-time">${escapeHtml(formatRelativeTime(stamp))}</span>
        </div>
        <p class="ticket-chat-preview">${escapeHtml(String(preview).slice(0, 120))}</p>
      `;

      ticketList.appendChild(button);
    });
  }

  async function ensureWorkspacesLoaded() {
    if (workspacesLoaded) return true;

    const response = await fetchWithAuth('/api/workspaces');
    if (!response) {
      setMessage('Session expired. Please sign in again.', 'error');
      return false;
    }

    const payload = await response.json();
    const workspaces = Array.isArray(payload.workspaces) ? payload.workspaces : [];
    renderWorkspaceOptions(workspaces);

    if (!workspaces.length) {
      setMessage('No workspaces available. Create one before opening support chat.', 'error');
      submitButton.disabled = true;
      return false;
    }

    submitButton.disabled = false;
    workspacesLoaded = true;
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
    } else if (!tickets.some((ticket) => ticket.id === selectedTicketId)) {
      selectedTicketId = tickets[0] ? tickets[0].id : null;
    }

    renderTicketList();
    if (messagesSubview === 'thread') {
      if (!selectedTicketId && tickets[0]) {
        selectedTicketId = tickets[0].id;
      }
      renderThread();
    }

    if (!silent) {
      const label = tickets.length
        ? `Loaded ${tickets.length} message${tickets.length === 1 ? '' : 's'}.`
        : 'No chats yet. Start one with Contact us.';
      setMessage(label, 'info');
    }
  }

  async function ensureTicketsLoaded() {
    if (ticketsLoaded) return;
    await loadTickets(false);
    ticketsLoaded = true;
  }

  function renderMessagesSubview() {
    const isList = messagesSubview === 'list';
    const isThread = messagesSubview === 'thread';
    const isComposer = messagesSubview === 'composer';

    listSubview.hidden = !isList;
    threadSubview.hidden = !isThread;
    composerSubview.hidden = !isComposer;

    if (isList) {
      renderTicketList();
      return;
    }

    if (isThread) {
      renderThread();
      return;
    }

    ticketSubject.focus();
  }

  async function setActiveTab(tab) {
    activeTab = tab === 'messages' ? 'messages' : 'home';

    const onHome = activeTab === 'home';
    homeView.hidden = !onHome;
    messagesView.hidden = onHome;

    headerTitle.textContent = onHome ? 'Home' : 'Messages';
    homeTabButton.classList.toggle('active', onHome);
    homeTabButton.setAttribute('aria-current', onHome ? 'page' : 'false');
    messagesTabButton.classList.toggle('active', !onHome);
    messagesTabButton.setAttribute('aria-current', !onHome ? 'page' : 'false');

    if (onHome) {
      return;
    }

    await ensureTicketsLoaded();
    renderMessagesSubview();
  }

  async function setMessagesSubview(nextSubview) {
    messagesSubview = nextSubview;

    if (messagesSubview === 'composer') {
      await ensureWorkspacesLoaded();
    }

    renderMessagesSubview();
  }

  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(() => {
      if (!panelOpen || activeTab !== 'messages') return;
      loadTickets(true).catch((error) => {
        console.error('Customer messenger polling error:', error);
      });
    }, 5000);
  }

  function stopPolling() {
    if (!pollTimer) return;
    clearInterval(pollTimer);
    pollTimer = null;
  }

  function setPanelOpen(nextOpen) {
    panelOpen = !!nextOpen;
    panel.hidden = !panelOpen;
    launcherButton.classList.toggle('active', panelOpen);
    launcherButton.setAttribute('aria-expanded', String(panelOpen));

    if (panelOpen) {
      startPolling();
      return;
    }

    stopPolling();
  }

  launcherButton.addEventListener('click', async () => {
    const opening = !panelOpen;
    setPanelOpen(opening);

    if (!opening) return;

    await setActiveTab(activeTab);
  });

  closePanelButton.addEventListener('click', () => {
    setPanelOpen(false);
  });

  homeTabButton.addEventListener('click', async () => {
    await setActiveTab('home');
  });

  messagesTabButton.addEventListener('click', async () => {
    await setActiveTab('messages');
    await setMessagesSubview('list');
  });

  openComposerFromHome.addEventListener('click', async () => {
    await setActiveTab('messages');
    await setMessagesSubview('composer');
  });

  openComposerFromMessages.addEventListener('click', async () => {
    await setMessagesSubview('composer');
  });

  subscribeUpdatesButton.addEventListener('click', () => {
    setMessage('Status subscription is coming soon. You can track updates in Community Discord.', 'info');
  });

  backFromThread.addEventListener('click', async () => {
    await setMessagesSubview('list');
  });

  backFromComposer.addEventListener('click', async () => {
    await setMessagesSubview('list');
  });

  ticketList.addEventListener('click', async (event) => {
    const trigger = event.target.closest('[data-ticket-id]');
    if (!trigger) return;

    selectedTicketId = trigger.dataset.ticketId;
    await setMessagesSubview('thread');
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

      upsertLocalTicket(payload.ticket);
      replyInput.value = '';
      renderTicketList();
      renderThread();
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

      upsertLocalTicket(payload.ticket);
      ticketSubject.value = '';
      ticketDescription.value = '';
      renderTicketList();
      await setMessagesSubview('thread');
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
