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
  let lastComposerScope = '__new__';
  let previousUnreadCount = 0;
  let hasLoadedTicketsOnce = false;

  const LAST_SEEN_KEY = 'customer_ticket_last_seen_at';
  const DRAFTS_KEY = 'customer_ticket_drafts_v1';
  const REACTIONS_KEY = 'customer_ticket_reactions_v1';
  const PINNED_KEY = 'customer_ticket_pinned_v1';
  const SOUND_ENABLED_KEY = 'customer_ticket_sound_enabled_v1';
  const SNOOZE_KEY = 'customer_ticket_snooze_v1';

  function getLastSeenAt() {
    const raw = localStorage.getItem(LAST_SEEN_KEY);
    const value = Number.parseInt(String(raw || ''), 10);
    return Number.isFinite(value) ? value : 0;
  }

  function setLastSeenAt() {
    localStorage.setItem(LAST_SEEN_KEY, String(Date.now()));
  }

  function loadDraftMap() {
    try {
      const raw = localStorage.getItem(DRAFTS_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function saveDraftMap(map) {
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(map || {}));
  }

  function getComposerScope() {
    return selectedTicketId || '__new__';
  }

  function writeDraft(scope, value) {
    const key = String(scope || '__new__');
    const text = String(value || '');
    const map = loadDraftMap();
    if (!text.trim()) {
      delete map[key];
    } else {
      map[key] = text.slice(0, 2000);
    }
    saveDraftMap(map);
  }

  function readDraft(scope) {
    const key = String(scope || '__new__');
    const map = loadDraftMap();
    return typeof map[key] === 'string' ? map[key] : '';
  }

  function syncComposerDraft(force = false) {
    const scope = getComposerScope();
    if (!force && scope === lastComposerScope) {
      return;
    }

    lastComposerScope = scope;
    replyInput.value = readDraft(scope);
    autosizeReplyInput();
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
        <button id="messengerSoundToggle" class="messenger-sound-toggle" type="button" aria-label="Toggle sound notifications" title="Toggle sound notifications">🔔</button>
        <button id="closeCustomerTicketPanel" class="messenger-close" type="button" aria-label="Close support messenger">×</button>
      </div>
    </header>

    <div class="messenger-content">
      <div class="messenger-tabs" role="tablist" aria-label="Messenger sections">
        <button id="messengerTabHome" class="messenger-tab active" type="button" role="tab" aria-selected="true" aria-controls="customerMessengerHome" tabindex="0">
          <span class="messenger-tab-icon" aria-hidden="true">⌂</span>
          <span>Home</span>
        </button>
        <button id="messengerTabMessages" class="messenger-tab" type="button" role="tab" aria-selected="false" aria-controls="customerMessengerMessages" tabindex="-1">
          <span class="messenger-tab-icon" aria-hidden="true">✉</span>
          <span>Messages</span>
          <span id="messengerTabUnreadBadge" class="messenger-tab-badge" hidden>0</span>
        </button>
      </div>

      <section id="customerMessengerHome" class="messenger-view" role="tabpanel" aria-labelledby="messengerTabHome" tabindex="0">
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
        <section class="messenger-analytics" aria-label="Conversation analytics">
          <article class="messenger-analytics-card">
            <span class="messenger-analytics-label">Conversations</span>
            <strong id="messengerAnalyticsTotal">0</strong>
          </article>
          <article class="messenger-analytics-card">
            <span class="messenger-analytics-label">Open</span>
            <strong id="messengerAnalyticsOpen">0</strong>
          </article>
          <article class="messenger-analytics-card">
            <span class="messenger-analytics-label">Avg first response</span>
            <strong id="messengerAnalyticsResponse">-</strong>
          </article>
        </section>
      </section>

      <section id="customerMessengerMessages" class="messenger-view" role="tabpanel" aria-labelledby="messengerTabMessages" tabindex="0" hidden>
        <p id="customerTicketMessage" class="workspace-message" hidden></p>
        <div class="ticket-chat-surface">
          <section class="ticket-chat-list-panel">
            <div class="messenger-list-head">
              <h4>Your conversations</h4>
              <div class="messenger-list-actions">
                <button id="messengerNewConversation" class="messenger-inline-btn" type="button">New</button>
                <button id="messengerRefreshChats" class="messenger-inline-btn" type="button">Refresh</button>
              </div>
            </div>
            <input id="messengerSearchInput" class="messenger-search" type="search" placeholder="Search conversations" aria-label="Search conversations" />
            <div id="customerTicketList" class="ticket-chat-list"></div>
          </section>

          <section class="ticket-chat-thread-panel">
            <div class="messenger-conversation-head">
              <div id="customerTicketThreadMeta" class="ticket-chat-meta muted">Start a conversation with support.</div>
              <div class="messenger-conversation-actions">
                <span id="customerTicketUpdated" class="messenger-conversation-time">Now</span>
                <button id="messengerSnoozeButton" class="messenger-inline-btn" type="button">Snooze 1h</button>
              </div>
            </div>
            <div id="customerQueueStatus" class="customer-queue-status" hidden></div>
            <div id="customerTicketMessages" class="ticket-thread ticket-thread-empty">No messages yet.</div>
            <div id="customerTypingIndicator" class="ticket-typing" hidden>
              <span class="ticket-typing-dot"></span>
              <span class="ticket-typing-dot"></span>
              <span class="ticket-typing-dot"></span>
              <span class="ticket-typing-text">Support is typing...</span>
            </div>

            <div class="messenger-quick-actions">
              <button id="messengerQuickDemo" class="messenger-chip" type="button">demo</button>
              <button id="messengerQuickBug" class="messenger-chip" type="button">Bug report</button>
              <button id="messengerQuickBilling" class="messenger-chip" type="button">Billing issue</button>
            </div>

            <div id="messengerSmartReplies" class="messenger-smart-replies"></div>

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

    </div>
  `;

  document.body.appendChild(launcherWrap);
  document.body.appendChild(panel);

  const launcherButton = document.getElementById('customerTicketLauncher');
  const unreadBadge = document.getElementById('customerTicketUnreadBadge');
  const soundToggleButton = document.getElementById('messengerSoundToggle');
  const closePanelButton = document.getElementById('closeCustomerTicketPanel');
  const messengerHome = document.getElementById('customerMessengerHome');
  const messengerMessages = document.getElementById('customerMessengerMessages');
  const analyticsTotal = document.getElementById('messengerAnalyticsTotal');
  const analyticsOpen = document.getElementById('messengerAnalyticsOpen');
  const analyticsResponse = document.getElementById('messengerAnalyticsResponse');
  const tabHome = document.getElementById('messengerTabHome');
  const tabMessages = document.getElementById('messengerTabMessages');
  const tabUnreadBadge = document.getElementById('messengerTabUnreadBadge');
  const startConversationButton = document.getElementById('messengerStartConversation');
  const goMessagesButton = document.getElementById('messengerGoMessages');
  const newConversationButton = document.getElementById('messengerNewConversation');
  const refreshChatsButton = document.getElementById('messengerRefreshChats');
  const searchInput = document.getElementById('messengerSearchInput');
  const ticketList = document.getElementById('customerTicketList');
  const ticketMessage = document.getElementById('customerTicketMessage');
  const threadMeta = document.getElementById('customerTicketThreadMeta');
  const updatedTime = document.getElementById('customerTicketUpdated');
  const snoozeButton = document.getElementById('messengerSnoozeButton');
  const queueStatus = document.getElementById('customerQueueStatus');
  const ticketMessages = document.getElementById('customerTicketMessages');
  const typingIndicator = document.getElementById('customerTypingIndicator');
  const replyForm = document.getElementById('customerReplyForm');
  const replyInput = document.getElementById('customerReplyInput');
  const replyButton = document.getElementById('sendCustomerReply');
  const attachButton = document.getElementById('customerAttachButton');
  const attachmentInput = document.getElementById('customerAttachmentInput');
  const attachmentMeta = document.getElementById('customerAttachmentMeta');
  const quickDemoButton = document.getElementById('messengerQuickDemo');
  const quickBugButton = document.getElementById('messengerQuickBug');
  const quickBillingButton = document.getElementById('messengerQuickBilling');
  const smartReplies = document.getElementById('messengerSmartReplies');

  if (
    !launcherButton || !unreadBadge || !soundToggleButton || !closePanelButton || !messengerHome || !messengerMessages || !analyticsTotal || !analyticsOpen || !analyticsResponse || !tabHome || !tabMessages || !tabUnreadBadge ||
    !startConversationButton || !goMessagesButton || !newConversationButton || !refreshChatsButton || !searchInput || !ticketList || !ticketMessage || !threadMeta || !updatedTime ||
    !snoozeButton || !queueStatus || !ticketMessages || !typingIndicator || !replyForm || !replyInput || !replyButton || !attachButton || !attachmentInput || !attachmentMeta ||
    !quickDemoButton || !quickBugButton || !quickBillingButton || !smartReplies
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

  function getPresenceLabel(ticket) {
    const messages = normalizeMessages(ticket);
    const lastEmployeeMessage = [...messages].reverse().find((message) => {
      return String(message.authorType || '').toLowerCase() === 'employee';
    });

    if (lastEmployeeMessage && lastEmployeeMessage.createdAt) {
      return `Active ${formatRelativeTime(lastEmployeeMessage.createdAt)} ago`;
    }

    return `Updated ${formatRelativeTime(ticket.updatedAt || ticket.createdAt || Date.now())} ago`;
  }

  function loadReactionMap() {
    try {
      const raw = localStorage.getItem(REACTIONS_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function loadPinnedMap() {
    try {
      const raw = localStorage.getItem(PINNED_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function loadSnoozeMap() {
    try {
      const raw = localStorage.getItem(SNOOZE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function saveSnoozeMap(map) {
    localStorage.setItem(SNOOZE_KEY, JSON.stringify(map || {}));
  }

  function getSnoozeUntil(ticketId) {
    const key = String(ticketId || '');
    if (!key) return 0;
    const map = loadSnoozeMap();
    const until = Number(map[key] || 0);
    if (!Number.isFinite(until) || until <= Date.now()) {
      if (map[key]) {
        delete map[key];
        saveSnoozeMap(map);
      }
      return 0;
    }
    return until;
  }

  function isSnoozed(ticketId) {
    return getSnoozeUntil(ticketId) > Date.now();
  }

  function toggleSnooze(ticketId, minutes = 60) {
    const key = String(ticketId || '');
    if (!key) return;
    const map = loadSnoozeMap();
    if (isSnoozed(key)) {
      delete map[key];
    } else {
      map[key] = Date.now() + (minutes * 60 * 1000);
    }
    saveSnoozeMap(map);
  }

  function formatDuration(ms) {
    const totalMinutes = Math.max(1, Math.floor(ms / 60000));
    if (totalMinutes < 60) return `${totalMinutes}m`;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  function savePinnedMap(map) {
    localStorage.setItem(PINNED_KEY, JSON.stringify(map || {}));
  }

  function isPinned(ticketId) {
    const map = loadPinnedMap();
    return !!map[String(ticketId || '')];
  }

  function togglePinned(ticketId) {
    const key = String(ticketId || '');
    if (!key) return;
    const map = loadPinnedMap();
    map[key] = !map[key];
    if (!map[key]) delete map[key];
    savePinnedMap(map);
  }

  function getTicketUpdatedAt(ticket) {
    const messages = normalizeMessages(ticket);
    const lastMessage = messages[messages.length - 1] || null;
    return new Date((lastMessage && lastMessage.createdAt) || ticket.updatedAt || ticket.createdAt || 0).getTime();
  }

  function isSoundEnabled() {
    return localStorage.getItem(SOUND_ENABLED_KEY) !== 'false';
  }

  function setSoundEnabled(enabled) {
    localStorage.setItem(SOUND_ENABLED_KEY, enabled ? 'true' : 'false');
  }

  function updateSoundToggle() {
    const enabled = isSoundEnabled();
    soundToggleButton.textContent = enabled ? '🔔' : '🔕';
    soundToggleButton.title = enabled ? 'Mute notifications' : 'Unmute notifications';
    soundToggleButton.setAttribute('aria-label', enabled ? 'Mute notifications' : 'Unmute notifications');
  }

  function playIncomingChime() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const context = new AudioCtx();
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, context.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(1174, context.currentTime + 0.12);
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.05, context.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.22);

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.24);

      window.setTimeout(() => {
        context.close().catch(() => {});
      }, 260);
    } catch (error) {
      // Intentionally swallow sound errors; UI remains functional without audio.
    }
  }

  function getDeliveryState(messages, index, selectedTicket) {
    const current = messages[index];
    if (!current || String(current.authorType || '').toLowerCase() !== 'customer') {
      return '';
    }

    const hasLaterEmployeeReply = messages.slice(index + 1).some((message) => {
      return String(message.authorType || '').toLowerCase() === 'employee';
    });
    if (hasLaterEmployeeReply) return 'Seen';

    if (index < messages.length - 1) return 'Delivered';

    const queueState = String((selectedTicket && selectedTicket.queueState) || '').toLowerCase();
    if (queueState === 'active' || queueState === 'waiting') return 'Delivered';

    return 'Sent';
  }

  function saveReactionMap(map) {
    localStorage.setItem(REACTIONS_KEY, JSON.stringify(map || {}));
  }

  function getMessageReaction(ticketId, messageId) {
    const map = loadReactionMap();
    const key = `${ticketId || 'unknown'}:${messageId || 'unknown'}`;
    return typeof map[key] === 'string' ? map[key] : '';
  }

  function setMessageReaction(ticketId, messageId, emoji) {
    const map = loadReactionMap();
    const key = `${ticketId || 'unknown'}:${messageId || 'unknown'}`;
    const next = String(emoji || '').trim();

    if (!next) {
      delete map[key];
    } else {
      map[key] = next;
    }

    saveReactionMap(map);
  }

  function inferSmartReplies(selectedTicket) {
    const fallback = ['Thanks, that helps', 'Can you share more details?', 'I fixed it'];
    if (!selectedTicket) return fallback;

    const messages = normalizeMessages(selectedTicket);
    const lastText = String((messages[messages.length - 1] && messages[messages.length - 1].text) || '').toLowerCase();
    if (!lastText) return fallback;

    if (/billing|invoice|charge|payment|refund/.test(lastText)) {
      return ['Please check my invoice', 'I was charged twice', 'Can I get a refund?'];
    }

    if (/bug|error|issue|broken|crash|not work/.test(lastText)) {
      return ['I can share screenshots', 'Steps to reproduce are:', 'It started after I updated'];
    }

    if (/access|login|password|2fa|verify/.test(lastText)) {
      return ['I cannot log in', '2FA code is not working', 'Please reset my access'];
    }

    return fallback;
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
    tabHome.setAttribute('aria-selected', activeView === 'home' ? 'true' : 'false');
    tabMessages.setAttribute('aria-selected', activeView === 'messages' ? 'true' : 'false');
    tabHome.tabIndex = activeView === 'home' ? 0 : -1;
    tabMessages.tabIndex = activeView === 'messages' ? 0 : -1;

    if (activeView === 'messages') {
      replyInput.focus();
    }
  }

  function moveTabFocus(direction) {
    const tabs = [tabHome, tabMessages];
    const currentIndex = activeView === 'messages' ? 1 : 0;
    let nextIndex = currentIndex;

    if (direction === 'next') {
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (direction === 'prev') {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (direction === 'first') {
      nextIndex = 0;
    } else if (direction === 'last') {
      nextIndex = tabs.length - 1;
    }

    const nextView = nextIndex === 1 ? 'messages' : 'home';
    setActiveView(nextView);
    tabs[nextIndex].focus();
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
      if (!isSnoozed(ticket.id) && authorType === 'employee' && createdAt > lastSeenAt) {
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
      tabUnreadBadge.hidden = true;
      tabUnreadBadge.textContent = '0';
      launcherButton.classList.remove('has-unread');
      return;
    }

    const badgeValue = unreadCount > 9 ? '9+' : String(unreadCount);
    unreadBadge.hidden = false;
    unreadBadge.textContent = badgeValue;
    tabUnreadBadge.hidden = false;
    tabUnreadBadge.textContent = badgeValue;
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

    const lastSeenAt = getLastSeenAt();
    const searchValue = String(searchInput.value || '').trim().toLowerCase();
    const orderedTickets = [...tickets].sort((left, right) => {
      const leftPinned = isPinned(left.id) ? 1 : 0;
      const rightPinned = isPinned(right.id) ? 1 : 0;
      if (leftPinned !== rightPinned) return rightPinned - leftPinned;
      return getTicketUpdatedAt(right) - getTicketUpdatedAt(left);
    });

    const filteredTickets = orderedTickets.filter((ticket) => {
      if (!searchValue) return true;
      const messages = normalizeMessages(ticket);
      const lastMessage = messages[messages.length - 1] || null;
      const blob = `${ticket.reason || ''} ${ticket.description || ''} ${(lastMessage && lastMessage.text) || ''}`.toLowerCase();
      return blob.includes(searchValue);
    });

    if (!filteredTickets.length) {
      ticketList.innerHTML = '<div class="ticket-chat-meta muted">No conversations match that search.</div>';
      return;
    }

    ticketList.innerHTML = filteredTickets.map((ticket) => {
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
      const lastAuthor = String((lastMessage && lastMessage.authorType) || '').toLowerCase();
      const lastCreatedAt = new Date(lastStampRaw || 0).getTime();
      const hasUnread = lastAuthor === 'employee' && lastCreatedAt > lastSeenAt;
      const statusTone = status === 'resolved' ? 'resolved' : (status === 'active' ? 'active' : 'pending');
      const pinned = isPinned(ticket.id);
      const snoozed = isSnoozed(ticket.id);
      const snoozeUntil = getSnoozeUntil(ticket.id);

      const presenceLabel = getPresenceLabel(ticket);

      return `
        <button class="ticket-chat-item${isActive ? ' active' : ''}${hasUnread && !snoozed ? ' unread' : ''}" type="button" data-chat-id="${escapeHtml(ticket.id)}">
          <span class="ticket-chat-item-top">
            <span class="ticket-chat-title">${escapeHtml(ticket.reason || 'Support chat')}</span>
            <span class="ticket-chat-meta-actions">
              <span class="ticket-chat-status ${escapeHtml(statusTone)}">${escapeHtml(status)}</span>
              <span class="ticket-chat-pin${pinned ? ' pinned' : ''}" data-pin-id="${escapeHtml(ticket.id)}" title="${pinned ? 'Unpin conversation' : 'Pin conversation'}" aria-label="${pinned ? 'Unpin conversation' : 'Pin conversation'}" role="button">★</span>
            </span>
          </span>
          <p class="ticket-chat-preview">${escapeHtml(preview.slice(0, 110))}</p>
          <span class="ticket-chat-meta">${hasUnread && !snoozed ? '<span class="ticket-chat-dot" aria-hidden="true"></span>New • ' : ''}${escapeHtml(updatedLabel)} • ${escapeHtml(presenceLabel)}${snoozed ? ` • Snoozed ${escapeHtml(formatDuration(snoozeUntil - Date.now()))}` : ''}</span>
        </button>
      `;
    }).join('');
  }

  function updateAnalytics() {
    const total = tickets.length;
    const open = tickets.filter((ticket) => {
      const status = String(ticket.status || '').toLowerCase();
      return status !== 'resolved' && status !== 'dismissed';
    }).length;

    const firstResponseMinutes = tickets.map((ticket) => {
      const messages = normalizeMessages(ticket);
      let customerTime = 0;
      let employeeTime = 0;

      messages.forEach((message) => {
        const author = String(message.authorType || '').toLowerCase();
        const stamp = new Date(message.createdAt || 0).getTime();
        if (!Number.isFinite(stamp) || stamp <= 0) return;
        if (!customerTime && author === 'customer') customerTime = stamp;
        if (customerTime && !employeeTime && author === 'employee' && stamp >= customerTime) {
          employeeTime = stamp;
        }
      });

      if (!customerTime || !employeeTime) return null;
      return Math.max(1, Math.round((employeeTime - customerTime) / 60000));
    }).filter((value) => Number.isFinite(value));

    const avgResponse = firstResponseMinutes.length
      ? `${Math.round(firstResponseMinutes.reduce((sum, value) => sum + value, 0) / firstResponseMinutes.length)}m`
      : '-';

    analyticsTotal.textContent = String(total);
    analyticsOpen.textContent = String(open);
    analyticsResponse.textContent = avgResponse;
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
    updateAnalytics();

    if (!selected) {
      threadMeta.textContent = 'Start a conversation with support.';
      updatedTime.textContent = 'Now';
      queueStatus.hidden = true;
      queueStatus.textContent = '';
      ticketMessages.className = 'ticket-thread ticket-thread-empty';
      ticketMessages.innerHTML = 'No messages yet.';
      typingIndicator.hidden = true;
      snoozeButton.textContent = 'Snooze 1h';
      syncComposerDraft();
      return;
    }

    const messages = normalizeMessages(selected);
    threadMeta.textContent = `${selected.reason || 'Support Chat'} • ${selected.status || 'pending'}`;
    updatedTime.textContent = formatRelativeTime(selected.updatedAt || selected.createdAt || Date.now());
    snoozeButton.textContent = isSnoozed(selected.id) ? 'Unsnooze' : 'Snooze 1h';

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
      typingIndicator.hidden = true;
      syncComposerDraft();
      return;
    }

    const lastSeenAt = getLastSeenAt();
    let insertedUnreadDivider = false;
    ticketMessages.className = 'ticket-thread';
    ticketMessages.innerHTML = messages.map((message, messageIndex) => {
      const authorType = String(message.authorType || 'customer').toLowerCase();
      let bubbleClass = 'ticket-msg ticket-msg--customer';
      if (authorType === 'employee') {
        bubbleClass = 'ticket-msg ticket-msg--employee';
      } else if (authorType === 'system') {
        bubbleClass = 'ticket-msg ticket-msg--system';
      }

      const createdAt = new Date(message.createdAt || 0).getTime();
      let divider = '';
      if (!insertedUnreadDivider && authorType === 'employee' && createdAt > lastSeenAt) {
        divider = '<div class="ticket-thread-divider">New messages</div>';
        insertedUnreadDivider = true;
      }

      const messageId = String(message.id || `${message.createdAt || ''}:${message.authorType || ''}:${message.text || ''}`);
      const reaction = getMessageReaction(selected.id, messageId);
      const deliveryState = getDeliveryState(messages, messageIndex, selected);

      return `
        ${divider}
        <article class="${bubbleClass}" data-message-id="${escapeHtml(messageId)}">
          <div class="ticket-msg-author">${escapeHtml(message.authorName || (authorType === 'employee' ? 'Support' : 'You'))}</div>
          <p class="ticket-msg-text">${escapeHtml(message.text || '')}</p>
          ${renderMessageAttachment(message.attachment)}
          <div class="ticket-msg-actions">
            <button class="ticket-msg-react" type="button" data-react="👍" title="React with thumbs up">👍</button>
            <button class="ticket-msg-react" type="button" data-react="❤️" title="React with heart">❤️</button>
            <button class="ticket-msg-react" type="button" data-react="✅" title="React with check">✅</button>
            <span class="ticket-msg-reaction${reaction ? ' active' : ''}">${escapeHtml(reaction || '')}</span>
          </div>
          <div class="ticket-msg-time">${escapeHtml(formatDate(message.createdAt))}</div>
          ${deliveryState ? `<div class="ticket-msg-delivery">${escapeHtml(deliveryState)}</div>` : ''}
        </article>
      `;
    }).join('');

    const lastMessage = messages[messages.length - 1] || null;
    const lastAuthorType = String((lastMessage && lastMessage.authorType) || '').toLowerCase();
    const queueState = String(selected.queueState || '').toLowerCase();
    typingIndicator.hidden = !(activeView === 'messages' && queueState === 'active' && lastAuthorType === 'customer');

    const chipValues = inferSmartReplies(selected);
    smartReplies.innerHTML = chipValues.map((value) => {
      return `<button class="messenger-chip messenger-chip-smart" type="button" data-smart-reply="${escapeHtml(value)}">${escapeHtml(value)}</button>`;
    }).join('');

    ticketMessages.scrollTop = ticketMessages.scrollHeight;
    syncComposerDraft();
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

    const unreadNow = getUnreadCount(tickets);
    if (hasLoadedTicketsOnce && (document.hidden || !panelOpen) && isSoundEnabled() && unreadNow > previousUnreadCount) {
      playIncomingChime();
    }
    hasLoadedTicketsOnce = true;
    previousUnreadCount = unreadNow;

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

  soundToggleButton.addEventListener('click', () => {
    const next = !isSoundEnabled();
    setSoundEnabled(next);
    updateSoundToggle();
  });

  tabHome.addEventListener('click', () => {
    setActiveView('home');
  });

  tabMessages.addEventListener('click', () => {
    setActiveView('messages');
    syncComposerDraft(true);
  });

  [tabHome, tabMessages].forEach((tab) => {
    tab.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        moveTabFocus('next');
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        moveTabFocus('prev');
        return;
      }

      if (event.key === 'Home') {
        event.preventDefault();
        moveTabFocus('first');
        return;
      }

      if (event.key === 'End') {
        event.preventDefault();
        moveTabFocus('last');
      }
    });
  });

  startConversationButton.addEventListener('click', () => {
    setActiveView('messages');
    if (!selectedTicketId) {
      replyInput.value = 'Hi team, I need help with ';
      autosizeReplyInput();
      writeDraft(getComposerScope(), replyInput.value);
    }
  });

  goMessagesButton.addEventListener('click', () => {
    setActiveView('messages');
  });

  refreshChatsButton.addEventListener('click', async () => {
    setMessage('Refreshing conversations...', 'info');
    await loadTickets(false);
  });

  searchInput.addEventListener('input', () => {
    renderConversationList();
  });

  snoozeButton.addEventListener('click', () => {
    const selected = getSelectedTicket();
    if (!selected) {
      setMessage('Select a conversation to snooze.', 'error');
      return;
    }

    toggleSnooze(selected.id, 60);
    renderThread();
    setMessage(isSnoozed(selected.id) ? 'Conversation snoozed for 1 hour.' : 'Conversation unsnoozed.', 'info');
  });

  newConversationButton.addEventListener('click', () => {
    writeDraft(getComposerScope(), replyInput.value);
    selectedTicketId = null;
    renderThread();
    setActiveView('messages');
    syncComposerDraft(true);
    replyInput.focus();
  });

  ticketList.addEventListener('click', (event) => {
    const pin = event.target.closest('[data-pin-id]');
    if (pin) {
      event.preventDefault();
      event.stopPropagation();
      const pinId = pin.getAttribute('data-pin-id');
      if (!pinId) return;
      togglePinned(pinId);
      renderConversationList();
      return;
    }

    const trigger = event.target.closest('[data-chat-id]');
    if (!trigger) return;

    const ticketId = trigger.getAttribute('data-chat-id');
    if (!ticketId) return;

    writeDraft(getComposerScope(), replyInput.value);
    selectedTicketId = ticketId;
    renderThread();
    syncComposerDraft(true);
  });

  ticketMessages.addEventListener('click', (event) => {
    const reactionButton = event.target.closest('[data-react]');
    if (!reactionButton) return;

    const article = reactionButton.closest('[data-message-id]');
    const selected = getSelectedTicket();
    if (!article || !selected) return;

    const messageId = article.getAttribute('data-message-id');
    const emoji = reactionButton.getAttribute('data-react');
    if (!messageId || !emoji) return;

    const current = getMessageReaction(selected.id, messageId);
    setMessageReaction(selected.id, messageId, current === emoji ? '' : emoji);
    renderThread();
  });

  smartReplies.addEventListener('click', (event) => {
    const chip = event.target.closest('[data-smart-reply]');
    if (!chip) return;

    const value = chip.getAttribute('data-smart-reply');
    if (!value) return;

    const existing = String(replyInput.value || '').trim();
    replyInput.value = existing ? `${existing}\n${value}` : value;
    autosizeReplyInput();
    writeDraft(getComposerScope(), replyInput.value);
    replyInput.focus();
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
    const shouldSend = (event.key === 'Enter' && !event.shiftKey) || (event.key === 'Enter' && (event.metaKey || event.ctrlKey));
    if (!shouldSend) return;
    event.preventDefault();
    if (!replyButton.disabled) {
      replyForm.requestSubmit();
    }
  });

  replyInput.addEventListener('input', () => {
    autosizeReplyInput();
    writeDraft(getComposerScope(), replyInput.value);
  });

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
      writeDraft(getComposerScope(), '');
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
  updateSoundToggle();
  setActiveView('home');
  updateAnalytics();
  syncComposerDraft(true);
  loadTickets(true).catch((error) => {
    console.error('Initial customer messenger load error:', error);
  });
});
