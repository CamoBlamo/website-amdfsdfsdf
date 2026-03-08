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

  const launcherWrap = document.createElement('div');
  launcherWrap.className = 'ticket-launcher';
  launcherWrap.innerHTML = `
    <button id="customerTicketLauncher" class="ticket-launcher-btn" type="button" aria-label="Open support ticket" aria-expanded="false" title="Open support ticket">
      <span aria-hidden="true">✉</span>
    </button>
  `;

  const panel = document.createElement('section');
  panel.id = 'customerTicketPanel';
  panel.className = 'ticket-panel';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Support Ticket');
  panel.innerHTML = `
    <div class="ticket-panel-head">
      <div>
        <h3>Support</h3>
        <p>Open a ticket with the DevDock team.</p>
      </div>
      <button id="closeCustomerTicketPanel" class="btn btn-secondary" type="button">Close</button>
    </div>

    <p id="customerTicketMessage" class="workspace-message"></p>

    <form id="customerTicketForm" class="workspace-form ticket-panel-form">
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
      <input id="customerTicketSubject" type="text" maxlength="120" placeholder="Short ticket subject" required />

      <label for="customerTicketDescription">Message</label>
      <textarea id="customerTicketDescription" rows="4" placeholder="Describe your issue or request." required></textarea>

      <div class="button-row">
        <button id="submitCustomerTicket" class="btn btn-primary" type="submit">Send Ticket</button>
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

  if (!launcherButton || !closePanelButton || !ticketMessage || !ticketForm || !ticketWorkspace || !ticketCategory || !ticketSubject || !ticketDescription || !submitButton) {
    panel.remove();
    launcherWrap.remove();
    return;
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

  function setPanelOpen(nextOpen) {
    panelOpen = !!nextOpen;
    panel.hidden = !panelOpen;
    launcherButton.classList.toggle('active', panelOpen);
    launcherButton.setAttribute('aria-expanded', String(panelOpen));

    if (panelOpen) {
      ticketSubject.focus();
    }
  }

  function setSubmitBusy(isBusy) {
    submitButton.disabled = isBusy;
    submitButton.textContent = isBusy ? 'Sending...' : 'Send Ticket';
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
      setMessage('No workspaces available. Create a workspace before opening a ticket.', 'error');
      submitButton.disabled = true;
      return false;
    }

    submitButton.disabled = false;
    return true;
  }

  launcherButton.addEventListener('click', async () => {
    const opening = !panelOpen;
    setPanelOpen(opening);

    if (!opening || workspacesLoaded) {
      return;
    }

    setMessage('Loading workspaces...', 'info');
    try {
      workspacesLoaded = await loadWorkspaces();
      if (workspacesLoaded) {
        setMessage('', 'info');
      }
    } catch (error) {
      console.error('Failed to load workspaces for ticket widget:', error);
      setMessage('Unable to load workspaces right now.', 'error');
    }
  });

  closePanelButton.addEventListener('click', () => {
    setPanelOpen(false);
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

  ticketForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const workspaceId = ticketWorkspace.value;
    const category = ticketCategory.value;
    const subject = ticketSubject.value.trim();
    const message = ticketDescription.value.trim();

    if (!workspaceId || !subject || !message) {
      setMessage('Workspace, subject, and message are required.', 'error');
      return;
    }

    setSubmitBusy(true);
    setMessage('Sending ticket...', 'info');

    try {
      const response = await fetchWithAuth('/api/customer-tickets', {
        method: 'POST',
        body: JSON.stringify({ workspaceId, category, subject, message }),
      });

      if (!response) {
        setMessage('Session expired. Please sign in again.', 'error');
        return;
      }

      const payload = await response.json();
      if (!payload.success) {
        setMessage(payload.error || 'Unable to send ticket.', 'error');
        return;
      }

      ticketSubject.value = '';
      ticketDescription.value = '';
      setMessage('Ticket sent. Our team will follow up in your workspace support queue.', 'success');
    } catch (error) {
      console.error('Customer ticket submit error:', error);
      setMessage('Network error while sending ticket.', 'error');
    } finally {
      setSubmitBusy(false);
    }
  });
});
