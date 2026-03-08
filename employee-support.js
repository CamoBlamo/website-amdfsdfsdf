document.addEventListener('DOMContentLoaded', async () => {
    const supportDesk = document.getElementById('employeeSupportDesk')
    if (!supportDesk) return

    const ticketList = document.getElementById('employeeTicketList')
    const ticketEmpty = document.getElementById('employeeTicketEmpty')
    const ticketDetail = document.getElementById('employeeTicketDetail')
    const ticketForm = document.getElementById('employeeTicketForm')
    const ticketWorkspace = document.getElementById('employeeTicketWorkspace')
    const ticketCategory = document.getElementById('employeeTicketCategory')
    const ticketSubject = document.getElementById('employeeTicketSubject')
    const ticketDescription = document.getElementById('employeeTicketDescription')
    const clearFormButton = document.getElementById('clearEmployeeTicketForm')
    const refreshButton = document.getElementById('refreshEmployeeTickets')
    const closePanelButton = document.getElementById('closeEmployeeSupportPanel')
    const submitButton = document.getElementById('submitEmployeeTicket')
    const ticketMessage = document.getElementById('employeeTicketMessage')

    if (!ticketList || !ticketDetail || !ticketForm || !ticketWorkspace || !ticketCategory || !ticketSubject || !ticketDescription || !ticketMessage) {
        return
    }

    let tickets = []
    let selectedTicketId = null
    let launcherButton = null
    let panelOpen = false

    function normalizeRole(role) {
        return window.normalizeGlobalRole
            ? window.normalizeGlobalRole(role)
            : String(role || 'user').toLowerCase().trim()
    }

    function canAccessEmployeeSupport(role) {
        return window.isEmployeeRole
            ? window.isEmployeeRole(role)
            : ['staff', 'moderator', 'administrator', 'co-owner', 'owner'].includes(normalizeRole(role))
    }

    function formatDate(value) {
        const date = new Date(value)
        if (Number.isNaN(date.getTime())) return '-'
        return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    }

    function escapeHtml(value) {
        const div = document.createElement('div')
        div.textContent = value == null ? '' : String(value)
        return div.innerHTML
    }

    function toStatusClass(status) {
        const normalized = String(status || '').toLowerCase()
        if (normalized === 'in-progress') return 'status-reviewed'
        if (normalized === 'resolved') return 'status-resolved'
        if (normalized === 'dismissed') return 'status-dismissed'
        return 'status-pending'
    }

    function toStatusLabel(status) {
        const normalized = String(status || 'pending').toLowerCase()
        if (normalized === 'in-progress') return 'In Progress'
        return normalized.charAt(0).toUpperCase() + normalized.slice(1)
    }

    function setMessage(message, type = 'info') {
        ticketMessage.textContent = message || ''
        if (!message) {
            ticketMessage.className = 'workspace-message'
            return
        }
        if (type === 'error') {
            ticketMessage.className = 'workspace-message error-message'
            return
        }
        if (type === 'success') {
            ticketMessage.className = 'workspace-message success-message'
            return
        }
        ticketMessage.className = 'workspace-message muted'
    }

    function ensureLauncher() {
        if (launcherButton) return launcherButton

        const launcherWrap = document.createElement('div')
        launcherWrap.className = 'ticket-launcher ticket-launcher-employee'
        launcherWrap.innerHTML = `
            <button id="employeeSupportLauncher" class="ticket-launcher-btn" type="button" aria-label="Open internal support inbox" aria-expanded="false" title="Open internal support inbox">
                <span aria-hidden="true">✉</span>
            </button>
        `

        document.body.appendChild(launcherWrap)
        launcherButton = launcherWrap.querySelector('#employeeSupportLauncher')
        if (launcherButton) {
            launcherButton.addEventListener('click', () => {
                setPanelOpen(!panelOpen)
            })
        }

        return launcherButton
    }

    function setPanelOpen(nextOpen) {
        panelOpen = !!nextOpen
        supportDesk.hidden = !panelOpen
        supportDesk.classList.toggle('open', panelOpen)
        if (launcherButton) {
            launcherButton.classList.toggle('active', panelOpen)
            launcherButton.setAttribute('aria-expanded', String(panelOpen))
        }

        if (panelOpen) {
            ticketSubject.focus()
        }
    }

    function setSubmitBusy(isBusy) {
        submitButton.disabled = isBusy
        submitButton.textContent = isBusy ? 'Opening...' : 'Open Ticket'
    }

    function resetForm() {
        ticketCategory.value = 'task'
        ticketSubject.value = ''
        ticketDescription.value = ''
    }

    function renderTicketDetail(ticket) {
        if (!ticket) {
            ticketDetail.className = 'employee-ticket-detail employee-ticket-detail-empty'
            ticketDetail.innerHTML = 'Select a conversation to view full details.'
            return
        }

        ticketDetail.className = 'employee-ticket-detail'
        ticketDetail.innerHTML = `
            <div class="employee-ticket-detail-head">
                <div>
                    <h4 class="employee-ticket-detail-title">${escapeHtml(ticket.reason || 'Ticket')}</h4>
                    <div class="employee-ticket-meta">
                        <span class="status-badge ${toStatusClass(ticket.status)}">${escapeHtml(toStatusLabel(ticket.status))}</span>
                        <span>${escapeHtml(ticket.workspaceName || 'Unknown Workspace')}</span>
                    </div>
                </div>
                <div class="employee-ticket-actions">
                    <button class="btn btn-secondary" type="button" data-ticket-action="mark-progress" data-ticket-id="${escapeHtml(ticket.id)}">Mark In Progress</button>
                    <button class="btn btn-primary" type="button" data-ticket-action="mark-resolved" data-ticket-id="${escapeHtml(ticket.id)}">Mark Resolved</button>
                </div>
            </div>
            <p class="employee-ticket-detail-message">${escapeHtml(ticket.description || 'No message provided.')}</p>
            <div class="employee-ticket-detail-metadata">
                <span><strong>Ticket ID:</strong> ${escapeHtml(ticket.id)}</span>
                <span><strong>Created:</strong> ${escapeHtml(formatDate(ticket.createdAt))}</span>
                <span><strong>Reporter:</strong> ${escapeHtml(ticket.reporterName || ticket.reporterEmail || 'You')}</span>
            </div>
        `
    }

    function renderTicketList() {
        ticketList.innerHTML = ''

        if (!tickets.length) {
            ticketEmpty.style.display = ''
            renderTicketDetail(null)
            return
        }

        ticketEmpty.style.display = 'none'

        tickets.forEach((ticket) => {
            const button = document.createElement('button')
            button.type = 'button'
            button.className = `employee-ticket-item${ticket.id === selectedTicketId ? ' active' : ''}`
            button.dataset.ticketId = ticket.id
            button.innerHTML = `
                <div class="employee-ticket-item-top">
                    <span class="employee-ticket-subject">${escapeHtml(ticket.reason || 'Ticket')}</span>
                    <span class="status-badge ${toStatusClass(ticket.status)}">${escapeHtml(toStatusLabel(ticket.status))}</span>
                </div>
                <p class="employee-ticket-preview">${escapeHtml((ticket.description || '').slice(0, 120) || 'No message provided.')}</p>
                <div class="employee-ticket-meta">
                    <span>${escapeHtml(ticket.workspaceName || 'Unknown Workspace')}</span>
                    <span>${escapeHtml(formatDate(ticket.createdAt))}</span>
                </div>
            `
            ticketList.appendChild(button)
        })

        const selected = tickets.find((ticket) => ticket.id === selectedTicketId) || tickets[0]
        if (selected) {
            selectedTicketId = selected.id
            renderTicketDetail(selected)
            const selectedEl = Array.from(ticketList.querySelectorAll('[data-ticket-id]')).find((element) => element.dataset.ticketId === selected.id)
            if (selectedEl) selectedEl.classList.add('active')
        }
    }

    async function fetchWorkspaces() {
        const response = await fetchWithAuth('/api/workspaces')
        if (!response) return []
        const payload = await response.json()
        return Array.isArray(payload.workspaces) ? payload.workspaces : []
    }

    function renderWorkspaceOptions(workspaces) {
        ticketWorkspace.innerHTML = '<option value="">Select a workspace</option>'
        workspaces.forEach((workspace) => {
            const option = document.createElement('option')
            option.value = workspace.id
            option.textContent = workspace.name || workspace.id
            ticketWorkspace.appendChild(option)
        })
    }

    async function loadTickets() {
        const response = await fetchWithAuth('/api/tickets?mode=employee')
        if (!response) {
            setMessage('Session expired. Please sign in again.', 'error')
            return
        }

        const payload = await response.json()
        if (!payload.success || !Array.isArray(payload.tickets)) {
            const message = payload.error || 'Failed to load tickets.'
            setMessage(message, 'error')
            return
        }

        tickets = payload.tickets
        renderTicketList()

        if (!tickets.length) {
            setMessage('No internal support tickets yet.', 'info')
            return
        }

        setMessage(`Loaded ${tickets.length} ticket${tickets.length === 1 ? '' : 's'}.`, 'info')
    }

    async function updateTicketStatus(ticketId, status) {
        const response = await fetchWithAuth('/api/tickets?mode=employee', {
            method: 'PATCH',
            body: JSON.stringify({ ticketId, status })
        })
        if (!response) {
            setMessage('Session expired. Please sign in again.', 'error')
            return
        }

        const payload = await response.json()
        if (!payload.success || !payload.ticket) {
            setMessage(payload.error || 'Failed to update ticket.', 'error')
            return
        }

        const updatedTicket = payload.ticket
        tickets = tickets.map((ticket) => (ticket.id === updatedTicket.id ? updatedTicket : ticket))
        selectedTicketId = updatedTicket.id
        renderTicketList()
        setMessage(`Ticket marked ${toStatusLabel(updatedTicket.status)}.`, 'success')
    }

    async function init() {
        try {
            const meResponse = await fetchWithAuth('/api/me')
            if (!meResponse) {
                setMessage('Session expired. Please sign in again.', 'error')
                return
            }

            const mePayload = await meResponse.json()
            if (!mePayload.success || !mePayload.user) {
                setMessage('Unable to verify session.', 'error')
                return
            }

            const role = normalizeRole(mePayload.user.role)
            if (!canAccessEmployeeSupport(role)) {
                supportDesk.style.display = 'none'
                return
            }

            ensureLauncher()
            setPanelOpen(false)

            const workspaces = await fetchWorkspaces()
            renderWorkspaceOptions(workspaces)
            if (workspaces.length === 1) {
                ticketWorkspace.value = workspaces[0].id
            }

            await loadTickets()
        } catch (error) {
            console.error('Employee support init error:', error)
            setMessage('Unable to initialize support inbox.', 'error')
        }
    }

    ticketList.addEventListener('click', (event) => {
        const trigger = event.target.closest('[data-ticket-id]')
        if (!trigger) return

        const ticketId = trigger.dataset.ticketId
        if (!ticketId) return

        selectedTicketId = ticketId
        renderTicketList()
    })

    ticketDetail.addEventListener('click', async (event) => {
        const actionTrigger = event.target.closest('[data-ticket-action]')
        if (!actionTrigger) return

        const ticketId = actionTrigger.dataset.ticketId
        const action = actionTrigger.dataset.ticketAction
        if (!ticketId || !action) return

        if (action === 'mark-progress') {
            await updateTicketStatus(ticketId, 'in-progress')
            return
        }

        if (action === 'mark-resolved') {
            await updateTicketStatus(ticketId, 'resolved')
        }
    })

    ticketForm.addEventListener('submit', async (event) => {
        event.preventDefault()

        const workspaceId = ticketWorkspace.value
        const category = ticketCategory.value
        const subject = ticketSubject.value.trim()
        const message = ticketDescription.value.trim()

        if (!workspaceId || !subject || !message) {
            setMessage('Workspace, subject, and message are required.', 'error')
            return
        }

        setSubmitBusy(true)
        setMessage('Opening ticket...', 'info')

        try {
            const response = await fetchWithAuth('/api/tickets?mode=employee', {
                method: 'POST',
                body: JSON.stringify({ workspaceId, category, subject, message })
            })

            if (!response) {
                setMessage('Session expired. Please sign in again.', 'error')
                return
            }

            const payload = await response.json()
            if (!payload.success || !payload.ticket) {
                setMessage(payload.error || 'Unable to open ticket.', 'error')
                return
            }

            tickets.unshift(payload.ticket)
            selectedTicketId = payload.ticket.id
            renderTicketList()
            resetForm()
            setMessage('Ticket opened successfully.', 'success')
        } catch (error) {
            console.error('Open ticket error:', error)
            setMessage('Network error while opening ticket.', 'error')
        } finally {
            setSubmitBusy(false)
        }
    })

    if (refreshButton) {
        refreshButton.addEventListener('click', async () => {
            setMessage('Refreshing inbox...', 'info')
            await loadTickets()
        })
    }

    if (closePanelButton) {
        closePanelButton.addEventListener('click', () => {
            setPanelOpen(false)
        })
    }

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && panelOpen) {
            setPanelOpen(false)
        }
    })

    document.addEventListener('click', (event) => {
        if (!panelOpen || !launcherButton) return
        const withinPanel = supportDesk.contains(event.target)
        const withinLauncher = launcherButton.closest('.ticket-launcher')?.contains(event.target)
        if (!withinPanel && !withinLauncher) {
            setPanelOpen(false)
        }
    })

    if (clearFormButton) {
        clearFormButton.addEventListener('click', () => {
            resetForm()
            setMessage('', 'info')
        })
    }

    await init()
})
