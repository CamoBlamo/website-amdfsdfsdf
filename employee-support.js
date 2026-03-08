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
    const submitButton = document.getElementById('submitEmployeeTicket')
    const ticketMessage = document.getElementById('employeeTicketMessage')
    const queueTabButton = document.getElementById('employeeTabQueue')
    const closedTabButton = document.getElementById('employeeTabClosed')
    const createTabButton = document.getElementById('employeeTabCreate')
    const queuePane = document.getElementById('employeeQueueView')
    const createPane = document.getElementById('employeeCreateView')
    const queueTitle = document.getElementById('employeeQueueTitle')
    const queueSubtitle = document.getElementById('employeeQueueSubtitle')
    const ownershipFilters = document.getElementById('employeeOwnershipFilters')
    const ownerFilterAllButton = document.getElementById('employeeOwnerFilterAll')
    const ownerFilterMineButton = document.getElementById('employeeOwnerFilterMine')
    const ownerFilterUnclaimedButton = document.getElementById('employeeOwnerFilterUnclaimed')

    if (!ticketList || !ticketDetail || !ticketForm || !ticketWorkspace || !ticketCategory || !ticketSubject || !ticketDescription || !ticketMessage || !queueTabButton || !closedTabButton || !createTabButton || !queuePane || !createPane || !queueTitle || !queueSubtitle || !ownershipFilters || !ownerFilterAllButton || !ownerFilterMineButton || !ownerFilterUnclaimedButton) {
        return
    }

    let tickets = []
    let selectedTicketId = null
    let pollTimer = null
    let activeView = 'queue'
    let activeOwnershipFilter = 'all'
    let currentUserId = ''

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

    function getTicketMessages(ticket) {
        return Array.isArray(ticket && ticket.messages) ? ticket.messages : []
    }

    function getLastMessage(ticket) {
        const messages = getTicketMessages(ticket)
        if (!messages.length) return null
        return messages[messages.length - 1]
    }

    function getSelectedTicket() {
        return tickets.find((ticket) => ticket.id === selectedTicketId) || null
    }

    function isClosedStatus(status) {
        const normalized = String(status || '').toLowerCase().trim()
        return normalized === 'resolved' || normalized === 'dismissed'
    }

    function isClosedTicket(ticket) {
        return isClosedStatus(ticket && ticket.status)
    }

    function getClaimedById(ticket) {
        return String(ticket && ticket.claimedById ? ticket.claimedById : '').trim()
    }

    function getOpenTickets() {
        return tickets.filter((ticket) => !isClosedTicket(ticket))
    }

    function getClosedTickets() {
        return tickets.filter(isClosedTicket)
    }

    function renderTabLabels() {
        queueTabButton.textContent = `Queue (${getOpenTickets().length})`
        closedTabButton.textContent = `Closed (${getClosedTickets().length})`
    }

    function renderOwnershipFilterLabels() {
        const openTickets = getOpenTickets()
        const allCount = openTickets.length
        const mineCount = currentUserId
            ? openTickets.filter((ticket) => getClaimedById(ticket) === currentUserId).length
            : 0
        const unclaimedCount = openTickets.filter((ticket) => !getClaimedById(ticket)).length

        ownerFilterAllButton.textContent = `All (${allCount})`
        ownerFilterMineButton.textContent = `Mine (${mineCount})`
        ownerFilterUnclaimedButton.textContent = `Unclaimed (${unclaimedCount})`
    }

    function normalizeOwnershipFilter(filter) {
        if (filter === 'mine') return 'mine'
        if (filter === 'unclaimed') return 'unclaimed'
        return 'all'
    }

    function setOwnershipFilter(filter) {
        const normalizedFilter = normalizeOwnershipFilter(filter)
        activeOwnershipFilter = normalizedFilter

        ownerFilterAllButton.classList.toggle('active', normalizedFilter === 'all')
        ownerFilterMineButton.classList.toggle('active', normalizedFilter === 'mine')
        ownerFilterUnclaimedButton.classList.toggle('active', normalizedFilter === 'unclaimed')

        ownerFilterAllButton.setAttribute('aria-pressed', String(normalizedFilter === 'all'))
        ownerFilterMineButton.setAttribute('aria-pressed', String(normalizedFilter === 'mine'))
        ownerFilterUnclaimedButton.setAttribute('aria-pressed', String(normalizedFilter === 'unclaimed'))

        syncQueueCopy()
    }

    function getQueueSubtitle() {
        if (activeView === 'closed') {
            return 'Resolved and dismissed tickets.'
        }

        if (activeOwnershipFilter === 'mine') {
            return 'Open tickets currently claimed by you.'
        }

        if (activeOwnershipFilter === 'unclaimed') {
            return 'Open tickets waiting to be claimed by a team member.'
        }

        return 'Open and active tickets assigned to the support queue.'
    }

    function getEmptyStateText() {
        if (activeView === 'closed') {
            return 'No closed tickets.'
        }

        if (activeOwnershipFilter === 'mine') {
            return 'No open tickets claimed by you.'
        }

        if (activeOwnershipFilter === 'unclaimed') {
            return 'No unclaimed open tickets.'
        }

        return 'No open tickets.'
    }

    function syncQueueCopy() {
        queueTitle.textContent = activeView === 'closed' ? 'Closed Tickets' : 'Ticket Queue'
        queueSubtitle.textContent = getQueueSubtitle()
        ticketEmpty.textContent = getEmptyStateText()
    }

    function matchesOwnershipFilter(ticket) {
        if (activeOwnershipFilter === 'all') {
            return true
        }

        const claimedById = getClaimedById(ticket)
        if (activeOwnershipFilter === 'unclaimed') {
            return !claimedById
        }

        return Boolean(currentUserId) && claimedById === currentUserId
    }

    function getVisibleTickets() {
        if (activeView === 'closed') {
            return getClosedTickets()
        }

        return getOpenTickets()
            .filter(matchesOwnershipFilter)
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

    function setActiveView(view) {
        const normalizedView = view === 'create' ? 'create' : (view === 'closed' ? 'closed' : 'queue')
        const showCreate = normalizedView === 'create'
        const showClosed = normalizedView === 'closed'
        activeView = normalizedView

        queuePane.hidden = showCreate
        createPane.hidden = !showCreate
        ownershipFilters.hidden = showCreate || showClosed

        queueTabButton.classList.toggle('active', !showCreate && !showClosed)
        closedTabButton.classList.toggle('active', showClosed)
        createTabButton.classList.toggle('active', showCreate)

        queueTabButton.setAttribute('aria-selected', String(!showCreate && !showClosed))
        closedTabButton.setAttribute('aria-selected', String(showClosed))
        createTabButton.setAttribute('aria-selected', String(showCreate))

        syncQueueCopy()

        if (!showCreate) {
            renderTicketList()
        }

        if (showCreate) {
            ticketSubject.focus()
        }
    }

    function startPolling() {
        if (pollTimer) return
        pollTimer = setInterval(() => {
            loadTickets(true).catch((error) => {
                console.error('Employee ticket polling error:', error)
            })
        }, 5000)
    }

    function stopPolling() {
        if (!pollTimer) return
        clearInterval(pollTimer)
        pollTimer = null
    }

    function setSubmitBusy(isBusy) {
        submitButton.disabled = isBusy
        submitButton.textContent = isBusy ? 'Creating...' : 'Create Ticket'
    }

    function resetForm() {
        ticketCategory.value = 'task'
        ticketSubject.value = ''
        ticketDescription.value = ''
    }

    function renderTicketDetail(ticket) {
        if (!ticket) {
            ticketDetail.className = 'employee-ticket-detail employee-ticket-detail-empty'
            ticketDetail.innerHTML = 'Select a ticket to view full details.'
            return
        }

        const closedTicket = isClosedTicket(ticket)
        const claimedByName = String(ticket.claimedByName || '').trim()
        const claimedAt = ticket.claimedAt ? formatDate(ticket.claimedAt) : ''
        const claimLabel = claimedByName
            ? `Claimed by ${claimedByName}${claimedAt && claimedAt !== '-' ? ` • ${claimedAt}` : ''}`
            : 'Unclaimed'
        const actionButtons = closedTicket
            ? `<button class="btn btn-secondary" type="button" data-ticket-action="mark-progress" data-ticket-id="${escapeHtml(ticket.id)}">Reopen Ticket</button>`
            : `
                    <button class="btn btn-secondary" type="button" data-ticket-action="mark-progress" data-ticket-id="${escapeHtml(ticket.id)}">Mark In Progress</button>
                    <button class="btn btn-primary" type="button" data-ticket-action="mark-resolved" data-ticket-id="${escapeHtml(ticket.id)}">Close Ticket</button>
              `

        const messages = getTicketMessages(ticket)
        const messageHtml = messages.length
            ? messages.map((message) => {
                const authorType = String(message.authorType || 'customer').toLowerCase()
                let bubbleClass = 'ticket-msg ticket-msg--customer'
                if (authorType === 'employee') {
                    bubbleClass = 'ticket-msg ticket-msg--employee'
                } else if (authorType === 'system') {
                    bubbleClass = 'ticket-msg ticket-msg--system'
                }

                return `
                    <article class="${bubbleClass}">
                        <div class="ticket-msg-author">${escapeHtml(message.authorName || (authorType === 'employee' ? 'Employee' : 'Customer'))}</div>
                        <p class="ticket-msg-text">${escapeHtml(message.text || '')}</p>
                        <div class="ticket-msg-time">${escapeHtml(formatDate(message.createdAt))}</div>
                    </article>
                `
            }).join('')
            : '<div class="ticket-thread-empty">No messages yet.</div>'

        ticketDetail.className = 'employee-ticket-detail'
        ticketDetail.innerHTML = `
            <div class="employee-ticket-detail-head">
                <div>
                    <h4 class="employee-ticket-detail-title">${escapeHtml(ticket.reason || 'Ticket')}</h4>
                    <div class="employee-ticket-meta">
                        <span class="status-badge ${toStatusClass(ticket.status)}">${escapeHtml(toStatusLabel(ticket.status))}</span>
                        <span>${escapeHtml(ticket.workspaceName || 'Unknown Workspace')}</span>
                        <span>${escapeHtml(claimLabel)}</span>
                    </div>
                </div>
                <div class="employee-ticket-actions">
                    ${actionButtons}
                </div>
            </div>

            <div class="ticket-thread">${messageHtml}</div>

            <form class="ticket-reply-form" data-ticket-reply-form>
                <label for="employeeReply_${escapeHtml(ticket.id)}">Reply as DevDock Team</label>
                <textarea id="employeeReply_${escapeHtml(ticket.id)}" data-ticket-reply-input rows="2" maxlength="2000" placeholder="Type your response..." required></textarea>
                <div class="button-row">
                    <button class="btn btn-primary" type="submit" data-ticket-reply-send data-ticket-id="${escapeHtml(ticket.id)}">Send Reply</button>
                </div>
            </form>

            <div class="employee-ticket-detail-metadata">
                <span><strong>Ticket ID:</strong> ${escapeHtml(ticket.id)}</span>
                <span><strong>Created:</strong> ${escapeHtml(formatDate(ticket.createdAt))}</span>
                <span><strong>Reporter:</strong> ${escapeHtml(ticket.reporterName || ticket.reporterEmail || 'You')}</span>
                <span><strong>Claimer:</strong> ${escapeHtml(claimLabel)}</span>
            </div>
        `

        const thread = ticketDetail.querySelector('.ticket-thread')
        if (thread) {
            thread.scrollTop = thread.scrollHeight
        }
    }

    function renderTicketList() {
        ticketList.innerHTML = ''
        renderTabLabels()
        renderOwnershipFilterLabels()
        syncQueueCopy()
        const visibleTickets = getVisibleTickets()

        if (!visibleTickets.length) {
            ticketEmpty.style.display = ''
            renderTicketDetail(null)
            return
        }

        ticketEmpty.style.display = 'none'

        visibleTickets.forEach((ticket) => {
            const lastMessage = getLastMessage(ticket)
            const preview = lastMessage ? lastMessage.text : (ticket.description || 'No message provided.')
            const stamp = lastMessage ? lastMessage.createdAt : ticket.createdAt
            const claimedByName = String(ticket.claimedByName || '').trim()
            const claimLine = claimedByName ? `Claimed by ${claimedByName}` : 'Unclaimed'

            const button = document.createElement('button')
            button.type = 'button'
            button.className = `employee-ticket-item${ticket.id === selectedTicketId ? ' active' : ''}`
            button.dataset.ticketId = ticket.id
            button.innerHTML = `
                <div class="employee-ticket-item-top">
                    <span class="employee-ticket-subject">${escapeHtml(ticket.reason || 'Ticket')}</span>
                    <span class="status-badge ${toStatusClass(ticket.status)}">${escapeHtml(toStatusLabel(ticket.status))}</span>
                </div>
                <p class="employee-ticket-preview">${escapeHtml(String(preview).slice(0, 120) || 'No message provided.')}</p>
                <div class="employee-ticket-meta">
                    <span>${escapeHtml(ticket.workspaceName || 'Unknown Workspace')}</span>
                    <span>${escapeHtml(formatDate(stamp))}</span>
                    <span>${escapeHtml(claimLine)}</span>
                </div>
            `
            ticketList.appendChild(button)
        })

        const selected = visibleTickets.find((ticket) => ticket.id === selectedTicketId) || visibleTickets[0]
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

    async function loadTickets(silent = false) {
        const response = await fetchWithAuth('/api/tickets?mode=employee')
        if (!response) {
            if (!silent) setMessage('Session expired. Please sign in again.', 'error')
            return
        }

        const payload = await response.json()
        if (!payload.success || !Array.isArray(payload.tickets)) {
            const message = payload.error || 'Failed to load tickets.'
            if (!silent) setMessage(message, 'error')
            return
        }

        const previousSelected = selectedTicketId
        tickets = payload.tickets

        if (previousSelected && tickets.some((ticket) => ticket.id === previousSelected)) {
            selectedTicketId = previousSelected
        } else {
            selectedTicketId = tickets[0] ? tickets[0].id : null
        }

        renderTicketList()

        if (!tickets.length) {
            if (!silent) setMessage('No tickets yet.', 'info')
            return
        }

        if (!silent) {
            const visibleCount = getVisibleTickets().length
            const label = activeView === 'closed'
                ? 'closed ticket'
                : (activeOwnershipFilter === 'mine' ? 'my open ticket' : (activeOwnershipFilter === 'unclaimed' ? 'unclaimed open ticket' : 'open ticket'))
            setMessage(`Loaded ${visibleCount} ${label}${visibleCount === 1 ? '' : 's'}.`, 'info')
        }
    }

    function upsertLocalTicket(ticket) {
        tickets = [ticket, ...tickets.filter((item) => item.id !== ticket.id)]
        selectedTicketId = ticket.id
        renderTicketList()
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

        upsertLocalTicket(payload.ticket)
        setMessage(`Ticket marked ${toStatusLabel(payload.ticket.status)}.`, 'success')
    }

    async function sendTicketReply(ticketId, message) {
        const response = await fetchWithAuth('/api/tickets?mode=employee', {
            method: 'PATCH',
            body: JSON.stringify({
                ticketId,
                action: 'reply',
                message,
            })
        })

        if (!response) {
            setMessage('Session expired. Please sign in again.', 'error')
            return null
        }

        const payload = await response.json()
        if (!payload.success || !payload.ticket) {
            setMessage(payload.error || 'Failed to send reply.', 'error')
            return null
        }

        upsertLocalTicket(payload.ticket)
        setMessage('Reply sent.', 'success')
        return payload.ticket
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
                supportDesk.hidden = true
                return
            }

            currentUserId = String(mePayload.user.id || '').trim()

            supportDesk.hidden = false
            setOwnershipFilter('all')
            setActiveView('queue')

            const workspaces = await fetchWorkspaces()
            renderWorkspaceOptions(workspaces)
            if (workspaces.length === 1) {
                ticketWorkspace.value = workspaces[0].id
            }

            await loadTickets(false)
            startPolling()
        } catch (error) {
            console.error('Employee support init error:', error)
            setMessage('Unable to initialize tickets section.', 'error')
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

    ticketDetail.addEventListener('submit', async (event) => {
        const form = event.target.closest('[data-ticket-reply-form]')
        if (!form) return
        event.preventDefault()

        const selectedTicket = getSelectedTicket()
        if (!selectedTicket) {
            setMessage('Select a ticket first.', 'error')
            return
        }

        const input = form.querySelector('[data-ticket-reply-input]')
        const sendButton = form.querySelector('[data-ticket-reply-send]')
        const message = input ? String(input.value || '').trim() : ''

        if (!message) {
            setMessage('Reply message is required.', 'error')
            return
        }

        if (sendButton) {
            sendButton.disabled = true
            sendButton.textContent = 'Sending...'
        }

        try {
            const updated = await sendTicketReply(selectedTicket.id, message)
            if (updated && input) {
                input.value = ''
            }
        } catch (error) {
            console.error('Employee reply error:', error)
            setMessage('Network error while sending reply.', 'error')
        } finally {
            if (sendButton) {
                sendButton.disabled = false
                sendButton.textContent = 'Send Reply'
            }
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
        setMessage('Creating ticket...', 'info')

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

            upsertLocalTicket(payload.ticket)
            resetForm()
            setActiveView('queue')
            setMessage('Ticket created successfully.', 'success')
        } catch (error) {
            console.error('Open ticket error:', error)
            setMessage('Network error while creating ticket.', 'error')
        } finally {
            setSubmitBusy(false)
        }
    })

    if (refreshButton) {
        refreshButton.addEventListener('click', async () => {
            setMessage('Refreshing tickets...', 'info')
            await loadTickets(false)
        })
    }

    queueTabButton.addEventListener('click', () => {
        setActiveView('queue')
    })

    closedTabButton.addEventListener('click', () => {
        setActiveView('closed')
    })

    createTabButton.addEventListener('click', () => {
        setActiveView('create')
    })

    ownerFilterAllButton.addEventListener('click', () => {
        setOwnershipFilter('all')
        renderTicketList()
    })

    ownerFilterMineButton.addEventListener('click', () => {
        setOwnershipFilter('mine')
        renderTicketList()
    })

    ownerFilterUnclaimedButton.addEventListener('click', () => {
        setOwnershipFilter('unclaimed')
        renderTicketList()
    })

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stopPolling()
            return
        }

        if (!supportDesk.hidden) {
            startPolling()
            loadTickets(true).catch((error) => {
                console.error('Employee ticket refresh error:', error)
            })
        }
    })

    window.addEventListener('beforeunload', stopPolling)

    if (clearFormButton) {
        clearFormButton.addEventListener('click', () => {
            resetForm()
            setMessage('', 'info')
        })
    }

    await init()
})
