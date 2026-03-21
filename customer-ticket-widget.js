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
  const displayNameRaw = currentUser && (currentUser.username || currentUser.name || currentUser.email)
    ? (currentUser.username || currentUser.name || String(currentUser.email || '').split('@')[0])
    : 'there';
  const displayName = String(displayNameRaw || 'there').trim() || 'there';

  let panelOpen = false;
  let pollTimer = null;
  let ticketsLoaded = false;
  let tickets = [];
  let selectedTicketId = null;
  let activeTab = 'home';
  let messagesSubview = 'list';
  let selectedAttachment = null;

  const launcherWrap = document.createElement('div');
  launcherWrap.className = 'ticket-launcher';
  launcherWrap.innerHTML = `
    <button id="customerTicketLauncher" class="ticket-launcher-btn" type="button" aria-label="Open support messenger" aria-expanded="false" title="Open support messenger">
      <span class="ticket-launcher-icon" aria-hidden="true">✉</span>
      <span class="ticket-launcher-label">Support</span>
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
      <div class="messenger-brand-block">
        <span class="messenger-brand-mark" aria-hidden="true">●</span>
        <div class="messenger-brand-copy">
          <strong id="messengerHeaderTitle">Live Chat System</strong>
          <span>Typically replies in under 20 minutes</span>
        </div>
      </div>
      <div class="messenger-head-actions">
        <button id="closeCustomerTicketPanel" class="messenger-close" type="button" aria-label="Close support messenger">×</button>
      </div>
    </header>

    <div class="messenger-content">
      <p id="customerTicketMessage" class="workspace-message" hidden></p>

      <section id="messengerHomeView" class="messenger-view">
        <h2 class="messenger-home-title">Hey ${displayName.replace(/</g, '&lt;').replace(/>/g, '&gt;')},</h2>
        <p class="messenger-home-subtitle">Ask a question and our team will reply right here.</p>

        <div class="messenger-home-actions">
          <button id="messengerOpenComposer" class="messenger-contact-card" type="button">
            <span class="messenger-contact-title">Send us a message</span>
            <span class="messenger-contact-sub">Start a new conversation</span>
            <span class="messenger-contact-arrow" aria-hidden="true">➤</span>
          </button>

          <button id="messengerOpenMessages" class="messenger-secondary-btn" type="button">View your messages</button>
        </div>
      </section>

      <section id="messengerMessagesView" class="messenger-view" hidden>
        <div id="messengerListView" class="messenger-subview">
          <div class="messenger-list-head">
            <h4>Messages</h4>
            <button id="messengerOpenComposerFromMessages" class="messenger-inline-btn" type="button">New</button>
          </div>

          <div id="customerTicketList" class="ticket-chat-list"></div>
          <p id="customerTicketEmpty" class="muted" style="display:none;">No messages yet. Start a new conversation.</p>
        </div>

        <div id="messengerThreadView" class="messenger-subview" hidden>
          <button id="messengerBackFromThread" class="messenger-inline-btn" type="button">← Back to messages</button>
          <div id="customerTicketThreadMeta" class="ticket-chat-meta muted">Select a chat to view details.</div>
          <div id="customerTicketMessages" class="ticket-thread ticket-thread-empty">No messages yet.</div>
          <div class="messenger-quick-actions">
            <button id="messengerQuickDemo" class="messenger-chip" type="button">demo</button>
          </div>

          <form id="customerReplyForm" class="ticket-reply-form">
            <input id="customerAttachmentInput" type="file" accept="image/*,application/pdf,text/plain" hidden />
            <div id="customerAttachmentMeta" class="messenger-attachment-meta" hidden></div>
            <div class="messenger-input-row">
              <button id="customerAttachButton" class="messenger-attach-btn" type="button" aria-label="Attach a file" title="Attach file" disabled>📎</button>
              <textarea id="customerReplyInput" rows="1" maxlength="2000" placeholder="Enter your message here" disabled></textarea>
              <button id="sendCustomerReply" class="messenger-send-btn" type="submit" disabled aria-label="Send message">➤</button>
            </div>
          </form>
        </div>

        <div id="messengerComposerView" class="messenger-subview" hidden>
          <button id="messengerBackFromComposer" class="messenger-inline-btn" type="button">← Back to messages</button>

          <form id="customerTicketForm" class="workspace-form ticket-panel-form">
            <h4>New Conversation</h4>

            <label for="customerTicketDescription">Message</label>
            <textarea id="customerTicketDescription" rows="4" placeholder="Write your message..." required></textarea>

            <div class="button-row">
              <button id="submitCustomerTicket" class="btn btn-primary" type="submit">Send message</button>
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
  const openMessagesFromHome = document.getElementById('messengerOpenMessages');
  const openComposerFromMessages = document.getElementById('messengerOpenComposerFromMessages');
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
  const attachButton = document.getElementById('customerAttachButton');
  const attachmentInput = document.getElementById('customerAttachmentInput');
  const attachmentMeta = document.getElementById('customerAttachmentMeta');
  const quickDemoButton = document.getElementById('messengerQuickDemo');
  const ticketForm = document.getElementById('customerTicketForm');
  const ticketDescription = document.getElementById('customerTicketDescription');
  const submitButton = document.getElementById('submitCustomerTicket');

  if (
    !launcherButton || !closePanelButton || !headerTitle || !homeView || !messagesView || !homeTabButton || !messagesTabButton ||
    !openComposerFromHome || !openMessagesFromHome || !openComposerFromMessages || !listSubview || !threadSubview || !composerSubview ||
    !backFromThread || !backFromComposer || !ticketMessage || !ticketList || !ticketEmpty || !threadMeta || !ticketMessages ||
    !replyForm || !replyInput || !replyButton || !attachButton || !attachmentInput || !attachmentMeta || !quickDemoButton || !ticketForm ||
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

  function formatFileSize(bytes) {
    const value = Number(bytes || 0);
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${Math.round(value / 102.4) / 10} KB`;
    return `${Math.round(value / 10485.76) / 100} MB`;
  }

  function clearSelectedAttachment() {
    selectedAttachment = null;
    attachmentInput.value = '';
    attachmentMeta.hidden = true;
    attachmentMeta.innerHTML = '';
  }

  function renderSelectedAttachment() {
    if (!selectedAttachment) {
      attachmentMeta.hidden = true;
      attachmentMeta.innerHTML = '';
      return;
    }

    attachmentMeta.hidden = false;
    attachmentMeta.innerHTML = `
      <span class="messenger-attachment-chip">
        <span class="messenger-attachment-name">${escapeHtml(selectedAttachment.name)}</span>
        <span class="messenger-attachment-size">${escapeHtml(formatFileSize(selectedAttachment.size))}</span>
        <button type="button" class="messenger-attachment-remove" id="removeCustomerAttachment" aria-label="Remove attachment">×</button>
      </span>
    `;

    const removeButton = document.getElementById('removeCustomerAttachment');
    if (removeButton) {
      removeButton.addEventListener('click', () => {
        clearSelectedAttachment();
      });
    }
  }

  function renderMessageAttachment(attachment) {
    if (!attachment || !attachment.dataUrl || !attachment.name) return '';

    const safeName = escapeHtml(attachment.name);
    const safeType = escapeHtml(attachment.type || 'file');
    const safeSize = escapeHtml(formatFileSize(attachment.size || 0));
    const safeDataUrl = escapeHtml(attachment.dataUrl);
    const isImage = String(attachment.type || '').toLowerCase().startsWith('image/');
    const imagePreview = isImage
      ? `<img class="ticket-msg-attachment-preview" src="${safeDataUrl}" alt="${safeName}" loading="lazy" />`
      : '';

    return `
      <div class="ticket-msg-attachment">
        ${imagePreview}
        <a class="ticket-msg-attachment-link" href="${safeDataUrl}" download="${safeName}" target="_blank" rel="noopener">
          <span>${safeName}</span>
          <small>${safeType} • ${safeSize}</small>
        </a>
      </div>
    `;
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
    attachButton.disabled = !enabled;
  }

  function setCreateBusy(isBusy) {
    submitButton.disabled = isBusy;
    submitButton.textContent = isBusy ? 'Sending...' : 'Send message';
  }

  function setReplyBusy(isBusy) {
    replyButton.disabled = isBusy;
    replyButton.textContent = isBusy ? '…' : '➤';
  }

  function upsertLocalTicket(ticket) {
    tickets = [ticket, ...tickets.filter((item) => item.id !== ticket.id)];
    selectedTicketId = ticket.id;
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
    threadMeta.textContent = `${selected.reason || 'Support Chat'} • ${selected.status || 'pending'}`;

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
          ${renderMessageAttachment(message.attachment)}
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
      const preview = lastMessage
        ? (lastMessage.text || (lastMessage.attachment ? `Sent attachment: ${lastMessage.attachment.name || 'file'}` : 'No message text'))
        : (ticket.description || 'No messages yet');
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
        : 'No messages yet. Start a new conversation.';
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

    ticketDescription.focus();
  }

  async function setActiveTab(tab) {
    activeTab = tab === 'messages' ? 'messages' : 'home';

    const onHome = activeTab === 'home';
    homeView.hidden = !onHome;
    messagesView.hidden = onHome;

    headerTitle.textContent = onHome ? 'Live Chat System' : 'Your Messages';
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

  homeTabButton.addEventListener('click', () => {
    setMessagesSubview('list').catch((error) => {
      console.error('Failed to switch support home view:', error);
    });
    setActiveTab('home').catch((error) => {
      console.error('Failed to switch support home tab:', error);
    });
  });

  messagesTabButton.addEventListener('click', async () => {
    await setActiveTab('messages');
    await setMessagesSubview('list');
  });

  openComposerFromHome.addEventListener('click', async () => {
    await setActiveTab('messages');
    await setMessagesSubview('composer');
  });

  openMessagesFromHome.addEventListener('click', async () => {
    await setActiveTab('messages');
    await setMessagesSubview('list');
  });

  openComposerFromMessages.addEventListener('click', async () => {
    await setMessagesSubview('composer');
  });

  backFromThread.addEventListener('click', async () => {
    clearSelectedAttachment();
    await setMessagesSubview('list');
  });

  quickDemoButton.addEventListener('click', () => {
    if (replyInput.disabled) return;
    replyInput.value = 'demo';
    replyInput.focus();
  });

  attachButton.addEventListener('click', () => {
    if (attachButton.disabled) return;
    attachmentInput.click();
  });

  attachmentInput.addEventListener('change', () => {
    const file = attachmentInput.files && attachmentInput.files[0] ? attachmentInput.files[0] : null;
    if (!file) {
      clearSelectedAttachment();
      return;
    }

    const allowed = ['image/', 'application/pdf', 'text/plain'];
    const mimeType = String(file.type || '').toLowerCase();
    const isAllowed = allowed.some((entry) => (entry.endsWith('/') ? mimeType.startsWith(entry) : mimeType === entry));
    const maxBytes = 2 * 1024 * 1024;

    if (!isAllowed) {
      clearSelectedAttachment();
      setMessage('Unsupported file type. Use image, PDF, or text files.', 'error');
      return;
    }

    if (file.size > maxBytes) {
      clearSelectedAttachment();
      setMessage('File too large. Maximum size is 2 MB.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      selectedAttachment = {
        name: file.name,
        type: mimeType,
        size: file.size,
        dataUrl: String(reader.result || ''),
      };
      renderSelectedAttachment();
      setMessage(`Attached ${file.name}.`, 'info');
    };

    reader.onerror = () => {
      clearSelectedAttachment();
      setMessage('Failed to read file. Try again.', 'error');
    };

    reader.readAsDataURL(file);
  });

  replyInput.addEventListener('keydown', async (event) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    if (!replyButton.disabled) {
      replyForm.requestSubmit();
    }
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

    if (!message && !selectedAttachment) {
      setMessage('Message or attachment is required.', 'error');
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
          attachment: selectedAttachment,
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
      clearSelectedAttachment();
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

    const message = ticketDescription.value.trim();
    const subject = message.split('\n')[0].trim().replace(/\s+/g, ' ').slice(0, 120) || 'Support request';

    if (!message) {
      setMessage('Message is required.', 'error');
      return;
    }

    setCreateBusy(true);
    setMessage('Sending message...', 'info');

    try {
      const response = await fetchWithAuth('/api/tickets?mode=customer', {
        method: 'POST',
        body: JSON.stringify({ category: 'support', subject, message }),
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
      ticketDescription.value = '';
      renderTicketList();
      await setMessagesSubview('thread');
      setMessage('Message sent. A team member will reply shortly.', 'success');
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

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopPolling();
      return;
    }

    if (panelOpen) {
      startPolling();
      if (activeTab === 'messages') {
        loadTickets(true).catch((error) => {
          console.error('Customer messenger refresh error:', error);
        });
      }
    }
  });

  window.addEventListener('beforeunload', stopPolling);

  await setActiveTab('home');
});
