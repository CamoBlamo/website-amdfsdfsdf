document.addEventListener('DOMContentLoaded', async () => {
  const page = document.body && document.body.dataset ? document.body.dataset.page : '';
  const excludedPages = new Set(['employee-panel', 'employee-profile', 'employee-settings', 'admin-panel', 'signin', 'signup', 'login']);
  if (excludedPages.has(page)) return;
  if (!window.isAuthenticated || !window.fetchWithAuth) return;
  if (!window.isAuthenticated()) return;
  if (document.getElementById('customerTicketLauncher')) return;

  let panelOpen = false;
  let pollTimer = null;
  let tickets = [];
  let selectedTicketId = null;
  let selectedAttachment = null;
  let activeView = 'home';

  const LAST_SEEN_KEY = 'customer_ticket_last_seen_at';

  function getLastSeenAt() {
    const raw = localStorage.getItem(LAST_SEEN_KEY);
    const value = Number.parseInt(String(raw || ''), 10);
    return Number.isFinite(value) ? value : 0;
  }

  function setLastSeenAt() {
    localStorage.setItem(LAST_SEEN_KEY, String(Date.now()));
  }

  const launcherWrap = document.createElement('div');
  launcherWrap.className = 'ticket-launcher';
  launcherWrap.innerHTML = `
    <button id="customerTicketLauncher" class="ticket-launcher-btn" type="button" aria-label="Open support messenger" aria-expanded="false" title="Open support messenger">
      <span class="ticket-launcher-icon" aria-hidden="true">✉</span>
      <span id="customerTicketUnreadBadge" class="ticket-launcher-badge" hidden>0</span>
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
          <strong>DevDock Messenger</strong>
          <span>Usually replies in under 20 minutes</span>
        </div>
      </div>
      <div class="messenger-head-actions">
        <button id="closeCustomerTicketPanel" class="messenger-close" type="button" aria-label="Close support messenger">×</button>
      </div>
    </header>

    <div class="messenger-content">
      <section id="customerMessengerHome" class="messenger-view">
        <h3 class="messenger-home-title">How can we help?</h3>
        <p class="messenger-home-subtitle">Talk to customer support, share files, and track replies in one place.</p>
        <div class="messenger-home-actions">
          <button id="messengerStartConversation" class="messenger-contact-card" type="button">
            <span class="messenger-contact-title">Ask a new question</span>
            <span class="messenger-contact-sub">Open a conversation with DevDock support</span>
            <span class="messenger-contact-arrow" aria-hidden="true">›</span>
          </button>
          <button id="messengerGoMessages" class="messenger-secondary-btn" type="button">View conversations</button>
        </div>
      </section>

      <section id="customerMessengerMessages" class="messenger-view" hidden>
        <p id="customerTicketMessage" class="workspace-message" hidden></p>
        <div class="ticket-chat-surface">
          <section class="ticket-chat-list-panel">
            <div class="messenger-list-head">
              <h4>Your conversations</h4>
              <button id="messengerRefreshChats" class="messenger-inline-btn" type="button">Refresh</button>
            </div>
            <div id="customerTicketList" class="ticket-chat-list"></div>
          </section>

          <section class="ticket-chat-thread-panel">
            <div class="messenger-conversation-head">
              <div id="customerTicketThreadMeta" class="ticket-chat-meta muted">Start a conversation with support.</div>
              <span id="customerTicketUpdated" class="messenger-conversation-time">Now</span>
            </div>
            <div id="customerQueueStatus" class="customer-queue-status" hidden></div>
            <div id="customerTicketMessages" class="ticket-thread ticket-thread-empty">No messages yet.</div>

            <div class="messenger-quick-actions">
              <button id="messengerQuickDemo" class="messenger-chip" type="button">demo</button>
              <button id="messengerQuickBug" class="messenger-chip" type="button">Bug report</button>
              <button id="messengerQuickBilling" class="messenger-chip" type="button">Billing issue</button>
            </div>

            <form id="customerReplyForm" class="ticket-reply-form">
              <input id="customerAttachmentInput" type="file" accept="image/*,application/pdf,text/plain" hidden />
              <div id="customerAttachmentMeta" class="messenger-attachment-meta" hidden></div>
              <div class="messenger-input-row">
                <button id="customerAttachButton" class="messenger-attach-btn" type="button" aria-label="Attach a file" title="Attach file">📎</button>
                <textarea id="customerReplyInput" rows="1" maxlength="2000" placeholder="Send us a message..."></textarea>
                <button id="sendCustomerReply" class="messenger-send-btn" type="submit" aria-label="Send message">➤</button>
              </div>
            </form>
          </section>
        </div>
      </section>

      <div class="messenger-bottom-nav">
        <button id="messengerTabHome" class="messenger-tab active" type="button" aria-current="page">
          <span class="messenger-tab-icon" aria-hidden="true">⌂</span>
          <span>Home</span>
        </button>
        <button id="messengerTabMessages" class="messenger-tab" type="button">
          <span class="messenger-tab-icon" aria-hidden="true">✉</span>
          <span>Messages</span>
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(launcherWrap);
  document.body.appendChild(panel);

  const launcherButton = document.getElementById('customerTicketLauncher');
  const unreadBadge = document.getElementById('customerTicketUnreadBadge');
  const closePanelButton = document.getElementById('closeCustomerTicketPanel');
  const messengerHome = document.getElementById('customerMessengerHome');
  const messengerMessages = document.getElementById('customerMessengerMessages');
  const tabHome = document.getElementById('messengerTabHome');
  const tabMessages = document.getElementById('messengerTabMessages');
  const startConversationButton = document.getElementById('messengerStartConversation');
  const goMessagesButton = document.getElementById('messengerGoMessages');
  const refreshChatsButton = document.getElementById('messengerRefreshChats');
  const ticketList = document.getElementById('customerTicketList');
  const ticketMessage = document.getElementById('customerTicketMessage');
  const threadMeta = document.getElementById('customerTicketThreadMeta');
  const updatedTime = document.getElementById('customerTicketUpdated');
  const queueStatus = document.getElementById('customerQueueStatus');
  const ticketMessages = document.getElementById('customerTicketMessages');
  const replyForm = document.getElementById('customerReplyForm');
  const replyInput = document.getElementById('customerReplyInput');
  const replyButton = document.getElementById('sendCustomerReply');
  const attachButton = document.getElementById('customerAttachButton');
  const attachmentInput = document.getElementById('customerAttachmentInput');
  const attachmentMeta = document.getElementById('customerAttachmentMeta');
  const quickDemoButton = document.getElementById('messengerQuickDemo');
  const quickBugButton = document.getElementById('messengerQuickBug');
  const quickBillingButton = document.getElementById('messengerQuickBilling');

  if (
    !launcherButton || !unreadBadge || !closePanelButton || !messengerHome || !messengerMessages || !tabHome || !tabMessages ||
    !startConversationButton || !goMessagesButton || !refreshChatsButton || !ticketList || !ticketMessage || !threadMeta || !updatedTime ||
    !queueStatus || !ticketMessages || !replyForm || !replyInput || !replyButton || !attachButton || !attachmentInput || !attachmentMeta ||
    !quickDemoButton || !quickBugButton || !quickBillingButton
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

  function setActiveView(view) {
    activeView = view === 'messages' ? 'messages' : 'home';
    messengerHome.hidden = activeView !== 'home';
    messengerMessages.hidden = activeView !== 'messages';
    tabHome.classList.toggle('active', activeView === 'home');
    tabMessages.classList.toggle('active', activeView === 'messages');
    tabHome.setAttribute('aria-current', activeView === 'home' ? 'page' : 'false');
    tabMessages.setAttribute('aria-current', activeView === 'messages' ? 'page' : 'false');

    if (activeView === 'messages') {
      replyInput.focus();
    }
  }

  function getUnreadCount(items) {
    const lastSeenAt = getLastSeenAt();
    if (!Array.isArray(items) || !items.length) return 0;

    let count = 0;
    items.forEach((ticket) => {
      const messages = normalizeMessages(ticket);
      const lastMessage = messages[messages.length - 1];
      if (!lastMessage) return;
      const authorType = String(lastMessage.authorType || '').toLowerCase();
      const createdAt = new Date(lastMessage.createdAt || ticket.updatedAt || ticket.createdAt || 0).getTime();
      if (authorType === 'employee' && createdAt > lastSeenAt) {
        count += 1;
      }
    });

    return count;
  }

  function renderUnreadBadge() {
    const unreadCount = getUnreadCount(tickets);
    if (!unreadCount) {
      unreadBadge.hidden = true;
      unreadBadge.textContent = '0';
      launcherButton.classList.remove('has-unread');
      return;
    }

    unreadBadge.hidden = false;
    unreadBadge.textContent = unreadCount > 9 ? '9+' : String(unreadCount);
    launcherButton.classList.add('has-unread');
  }

  function autosizeReplyInput() {
    replyInput.style.height = 'auto';
    const nextHeight = Math.max(42, Math.min(132, replyInput.scrollHeight));
    replyInput.style.height = `${nextHeight}px`;
  }

  function renderConversationList() {
    if (!tickets.length) {
      ticketList.innerHTML = '<div class="ticket-chat-meta muted">No conversations yet.</div>';
      return;
    }

    ticketList.innerHTML = tickets.map((ticket) => {
      const messages = normalizeMessages(ticket);
      const lastMessage = messages[messages.length - 1] || null;
      const preview = lastMessage && lastMessage.text
        ? String(lastMessage.text)
        : String(ticket.description || 'No message yet.');

      const lastStampRaw = lastMessage && lastMessage.createdAt
        ? lastMessage.createdAt
        : (ticket.updatedAt || ticket.createdAt);
      const updatedLabel = formatRelativeTime(lastStampRaw);
      const status = String(ticket.status || 'pending').toLowerCase();
      const isActive = selectedTicketId === ticket.id;

      return `
        <button class="ticket-chat-item${isActive ? ' active' : ''}" type="button" data-chat-id="${escapeHtml(ticket.id)}">
          <span class="ticket-chat-title">${escapeHtml(ticket.reason || 'Support chat')}</span>
          <p class="ticket-chat-preview">${escapeHtml(preview.slice(0, 110))}</p>
          <span class="ticket-chat-meta">${escapeHtml(status)} • ${escapeHtml(updatedLabel)}</span>
        </button>
      `;
    }).join('');
  }

  function getSelectedTicket() {
    return tickets.find((ticket) => ticket.id === selectedTicketId) || null;
  }

  function getPreferredTicketId(items) {
    const openTicket = items.find((ticket) => {
      const status = String(ticket && ticket.status ? ticket.status : '').toLowerCase();
      return status !== 'resolved' && status !== 'dismissed';
    });
    return openTicket ? openTicket.id : (items[0] ? items[0].id : null);
  }

  function normalizeMessages(ticket) {
    return Array.isArray(ticket && ticket.messages) ? ticket.messages : [];
  }

  function setReplyBusy(isBusy) {
    replyButton.disabled = isBusy;
    attachButton.disabled = isBusy;
    replyButton.textContent = isBusy ? '…' : '➤';
  }

  function upsertLocalTicket(ticket) {
    tickets = [ticket, ...tickets.filter((item) => item.id !== ticket.id)];
    selectedTicketId = ticket.id;
  }

  function renderThread() {
    const selected = getSelectedTicket();
    renderConversationList();
    renderUnreadBadge();

    if (!selected) {
      threadMeta.textContent = 'Start a conversation with support.';
      updatedTime.textContent = 'Now';
      queueStatus.hidden = true;
      queueStatus.textContent = '';
      ticketMessages.className = 'ticket-thread ticket-thread-empty';
      ticketMessages.innerHTML = 'No messages yet.';
      return;
    }

    const messages = normalizeMessages(selected);
    threadMeta.textContent = `${selected.reason || 'Support Chat'} • ${selected.status || 'pending'}`;
    updatedTime.textContent = formatRelativeTime(selected.updatedAt || selected.createdAt || Date.now());

    if (selected.queueState === 'waiting') {
      const position = selected.queuePosition || 1;
      const wait = selected.estimatedWaitMinutes || 1;
      queueStatus.hidden = false;
      queueStatus.className = 'customer-queue-status waiting';
      queueStatus.textContent = `You are #${position} in queue. Estimated wait: ${wait} min.`;
    } else if (selected.queueState === 'active') {
      queueStatus.hidden = false;
      queueStatus.className = 'customer-queue-status active';
      queueStatus.textContent = 'A support agent is active on your chat.';
    } else if (selected.queueState === 'closed') {
      queueStatus.hidden = false;
      queueStatus.className = 'customer-queue-status closed';
      queueStatus.textContent = 'This chat is closed. Send a message to reopen it.';
    } else {
      queueStatus.hidden = true;
      queueStatus.textContent = '';
    }

    if (!messages.length) {
      ticketMessages.className = 'ticket-thread ticket-thread-empty';
      ticketMessages.innerHTML = 'No messages yet.';
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
      selectedTicketId = getPreferredTicketId(tickets);
    }

    renderThread();
    renderUnreadBadge();

    if (!silent) {
      const label = tickets.length
        ? `Loaded ${tickets.length} message${tickets.length === 1 ? '' : 's'}.`
        : 'No messages yet. Start a new conversation.';
      setMessage(label, 'info');
    }
  }

  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(() => {
      if (!panelOpen) return;
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
      setLastSeenAt();
      renderUnreadBadge();
      startPolling();
      return;
    }

    stopPolling();
  }

  launcherButton.addEventListener('click', async () => {
    const opening = !panelOpen;
    setPanelOpen(opening);

    if (!opening) return;
    await loadTickets(false);
    setActiveView('messages');
  });

  closePanelButton.addEventListener('click', () => {
    setPanelOpen(false);
  });

  tabHome.addEventListener('click', () => {
    setActiveView('home');
  });

  tabMessages.addEventListener('click', () => {
    setActiveView('messages');
  });

  startConversationButton.addEventListener('click', () => {
    setActiveView('messages');
    if (!selectedTicketId) {
      replyInput.value = 'Hi team, I need help with ';
      autosizeReplyInput();
    }
  });

  goMessagesButton.addEventListener('click', () => {
    setActiveView('messages');
  });

  refreshChatsButton.addEventListener('click', async () => {
    setMessage('Refreshing conversations...', 'info');
    await loadTickets(false);
  });

  ticketList.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-chat-id]');
    if (!trigger) return;

    const ticketId = trigger.getAttribute('data-chat-id');
    if (!ticketId) return;

    selectedTicketId = ticketId;
    renderThread();
  });

  quickDemoButton.addEventListener('click', () => {
    replyInput.value = 'demo';
    autosizeReplyInput();
    setActiveView('messages');
    replyInput.focus();
  });

  quickBugButton.addEventListener('click', () => {
    replyInput.value = 'I found a bug where ';
    autosizeReplyInput();
    setActiveView('messages');
    replyInput.focus();
  });

  quickBillingButton.addEventListener('click', () => {
    replyInput.value = 'I need help with billing for ';
    autosizeReplyInput();
    setActiveView('messages');
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

  replyInput.addEventListener('input', autosizeReplyInput);

  replyForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const selected = getSelectedTicket();
    const message = String(replyInput.value || '').trim();

    if (!message && !selectedAttachment) {
      setMessage('Message or attachment is required.', 'error');
      return;
    }

    setReplyBusy(true);
    setMessage('Sending message...', 'info');

    try {
      const response = await fetchWithAuth('/api/tickets?mode=customer', {
        method: selected ? 'PATCH' : 'POST',
        body: JSON.stringify(selected
          ? {
              ticketId: selected.id,
              action: 'reply',
              message,
              attachment: selectedAttachment,
            }
          : {
              category: 'support',
              subject: (message.split('\n')[0].trim().replace(/\s+/g, ' ').slice(0, 120) || (selectedAttachment ? selectedAttachment.name : 'Support request')),
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
      autosizeReplyInput();
      clearSelectedAttachment();
      renderThread();
      setMessage('Message sent.', 'success');
      setLastSeenAt();
      renderUnreadBadge();
      replyInput.focus();
    } catch (error) {
      console.error('Customer reply error:', error);
      setMessage('Network error while sending message.', 'error');
    } finally {
      setReplyBusy(false);
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
      setLastSeenAt();
      renderUnreadBadge();
      startPolling();
      loadTickets(true).catch((error) => {
        console.error('Customer messenger refresh error:', error);
      });
    }
  });

  window.addEventListener('beforeunload', stopPolling);

  autosizeReplyInput();
  setActiveView('home');
  loadTickets(true).catch((error) => {
    console.error('Initial customer messenger load error:', error);
  });
});
