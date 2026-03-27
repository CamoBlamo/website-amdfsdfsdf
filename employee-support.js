document.addEventListener('DOMContentLoaded', async () => {
    const supportDesk = document.getElementById('employeeSupportDesk')
    if (!supportDesk) return

    const ticketList = document.getElementById('employeeTicketList')
    const ticketEmpty = document.getElementById('employeeTicketEmpty')
    const ticketDetail = document.getElementById('employeeTicketDetail')
    const ticketForm = document.getElementById('employeeTicketForm')
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
    const departmentFilter = document.getElementById('employeeDepartmentFilter')
    const ticketSearchInput = document.getElementById('employeeTicketSearch')
    const clearTicketSearchButton = document.getElementById('clearEmployeeTicketSearch')
    const queueResults = document.getElementById('employeeQueueResults')

    if (!ticketList || !ticketDetail || !ticketForm || !ticketCategory || !ticketSubject || !ticketDescription || !ticketMessage || !queueTabButton || !closedTabButton || !createTabButton || !queuePane || !createPane || !queueTitle || !queueSubtitle || !ownershipFilters || !ownerFilterAllButton || !ownerFilterMineButton || !ownerFilterUnclaimedButton) {
        return
    }

    let tickets = []
    let selectedTicketId = null
    let pollTimer = null
    let activeView = 'queue'
    let activeOwnershipFilter = 'all'
    let activeSearchQuery = ''
    let activeDepartmentFilter = 'all'
    let currentUserId = ''
    const replyDraftByTicketId = new Map()

    function normalizeRole(role) {
        return window.normalizeGlobalRole
            ? window.normalizeGlobalRole(role)
            : String(role || 'user').toLowerCase().trim()
    }

    function normalizeDepartments(value) {
        if (!Array.isArray(value)) return []
        return value.map((item) => String(item || '').toLowerCase().trim()).filter(Boolean)
    }

    function canAccessEmployeeSupport(role, departments) {
        const normalizedRole = normalizeRole(role)
        const isElevated = ['moderator', 'administrator', 'co-owner', 'owner'].includes(normalizedRole)
        if (isElevated) {
            return true
        }

        const hasSupportDepartment = normalizeDepartments(departments).includes('customer-support')
        return hasSupportDepartment
    }

    function formatDate(value) {
        const date = new Date(value)
        if (Number.isNaN(date.getTime())) return '-'
        return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    }

    function formatRelativeTime(value) {
        const date = new Date(value)
        if (Number.isNaN(date.getTime())) return 'just now'

        const diffMs = Date.now() - date.getTime()
        const diffMinutes = Math.max(0, Math.round(diffMs / 60000))
        if (diffMinutes < 1) return 'just now'
        if (diffMinutes < 60) return `${diffMinutes}m ago`

        const diffHours = Math.round(diffMinutes / 60)
        if (diffHours < 24) return `${diffHours}h ago`

        const diffDays = Math.round(diffHours / 24)
        return `${diffDays}d ago`
    }

    function escapeHtml(value) {
        const div = document.createElement('div')
        div.textContent = value == null ? '' : String(value)
        return div.innerHTML
    }

    function formatFileSize(bytes) {
        const value = Number(bytes || 0)
        if (value < 1024) return `${value} B`
        if (value < 1024 * 1024) return `${Math.round(value / 102.4) / 10} KB`
        return `${Math.round(value / 10485.76) / 100} MB`
    }

    function renderAttachment(attachment) {
        if (!attachment || !attachment.dataUrl || !attachment.name) return ''

        const safeName = escapeHtml(attachment.name)
        const safeType = escapeHtml(attachment.type || 'file')
        const safeSize = escapeHtml(formatFileSize(attachment.size || 0))
        const safeDataUrl = escapeHtml(attachment.dataUrl)
        const isImage = String(attachment.type || '').toLowerCase().startsWith('image/')
        const imagePreview = isImage
            ? `<img class="ticket-msg-attachment-preview" src="${safeDataUrl}" alt="${safeName}" loading="lazy" />`
            : ''

        return `
            <div class="ticket-msg-attachment">
                ${imagePreview}
                <a class="ticket-msg-attachment-link" href="${safeDataUrl}" download="${safeName}" target="_blank" rel="noopener">
                    <span>${safeName}</span>
                    <small>${safeType} • ${safeSize}</small>
                </a>
            </div>
        `
    }

    function toStatusClass(status) {
        const normalized = String(status || '').toLowerCase()
        if (normalized === 'in-progress') return 'status-reviewed'
        if (normalized === 'resolved') return 'status-resolved'
        if (normalized === 'dismissed') return 'status-dismissed'
        return 'status-pending'
    }

    function normalizeDepartment(department) {
        const value = String(department || '').trim().toLowerCase()
        if (value === 'billing') return 'Billing'
        if (value === 'engineering') return 'Engineering'
        if (value === 'product') return 'Product'
        if (value === 'sales') return 'Sales'
        return 'Support'
    }

    function toStatusLabel(status) {
        const normalized = String(status || 'pending').toLowerCase()
        if (normalized === 'pending') return 'Open'
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

    function getReplyDraft(ticketId) {
        const id = String(ticketId || '').trim()
        if (!id) return ''
        return String(replyDraftByTicketId.get(id) || '')
    }

    function setReplyDraft(ticketId, text) {
        const id = String(ticketId || '').trim()
        if (!id) return
        const value = String(text || '')
        if (!value.trim()) {
            replyDraftByTicketId.delete(id)
            return
        }
        replyDraftByTicketId.set(id, value)
    }

    function clearReplyDraft(ticketId) {
        const id = String(ticketId || '').trim()
        if (!id) return
        replyDraftByTicketId.delete(id)
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

        if (activeDepartmentFilter !== 'all') {
            return `Queue routed to ${activeDepartmentFilter} department.`
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
        if (activeSearchQuery) {
            return 'No tickets match your search.'
        }

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

    function normalizeSearchQuery(value) {
        return String(value || '').toLowerCase().trim().replace(/\s+/g, ' ')
    }

    function getQueueScopeTickets() {
        if (activeView === 'closed') {
            return getClosedTickets()
        }

        return getOpenTickets()
            .filter(matchesOwnershipFilter)
    }

    function matchesSearchFilter(ticket) {
        if (!activeSearchQuery) return true

        const lastMessage = getLastMessage(ticket)
        const searchBase = [
            ticket.reason,
            ticket.reporterName,
            ticket.reporterEmail,
            ticket.description,
            ticket.claimedByName,
            lastMessage && lastMessage.text,
        ]
            .map((value) => String(value || '').toLowerCase())
            .join(' ')

        return searchBase.includes(activeSearchQuery)
    }

    function getVisibleTickets() {
        return getQueueScopeTickets().filter(matchesSearchFilter)
    }

    function syncQueueResults(visibleCount, scopeCount) {
        if (!queueResults) return

        if (activeSearchQuery) {
            queueResults.textContent = `Showing ${visibleCount} of ${scopeCount} tickets for “${activeSearchQuery}”.`
            return
        }

        queueResults.textContent = `Showing ${visibleCount} ticket${visibleCount === 1 ? '' : 's'}.`
    }

    function setSearchQuery(value) {
        activeSearchQuery = normalizeSearchQuery(value)
        if (clearTicketSearchButton) {
            clearTicketSearchButton.disabled = !activeSearchQuery
        }
        syncQueueCopy()
        renderTicketList()
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
          const department = normalizeDepartment(ticket.department)
        const claimLabel = claimedByName
            ? `Claimed by ${claimedByName}${claimedAt && claimedAt !== '-' ? ` • ${claimedAt}` : ''}`
            : 'Unclaimed'
          const actionButtons = closedTicket
            ? `
                  <button class="btn btn-secondary" type="button" data-ticket-action="mark-unresolved" data-ticket-id="${escapeHtml(ticket.id)}">Mark Unresolved</button>
                  <button class="btn btn-danger" type="button" data-ticket-action="delete-ticket" data-ticket-id="${escapeHtml(ticket.id)}">Delete Ticket</button>
              `
            : `
                  <button class="btn btn-secondary" type="button" data-ticket-action="mark-unresolved" data-ticket-id="${escapeHtml(ticket.id)}">Mark Unresolved</button>
                  <button class="btn btn-primary" type="button" data-ticket-action="mark-resolved" data-ticket-id="${escapeHtml(ticket.id)}">Mark Resolved</button>
                  <button class="btn btn-danger" type="button" data-ticket-action="delete-ticket" data-ticket-id="${escapeHtml(ticket.id)}">Delete Ticket</button>
              `

        const messages = getTicketMessages(ticket)
                const customerMessage = messages.find((message) => String(message.authorType || '').toLowerCase() === 'customer')
                const currentDraft = getReplyDraft(ticket.id)
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
                        ${renderAttachment(message.attachment)}
                        <div class="ticket-msg-time">${escapeHtml(formatDate(message.createdAt))} • ${escapeHtml(formatRelativeTime(message.createdAt))}</div>
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
                        <span class="status-badge">${escapeHtml(department)}</span>
                        <span>${escapeHtml(claimLabel)}</span>
                    </div>
                </div>

                <div class="employee-ticket-control-row">
                    <div class="employee-ticket-control-group">
                        <label for="employeeTicketId_${escapeHtml(ticket.id)}">Ticket ID</label>
                        <input id="employeeTicketId_${escapeHtml(ticket.id)}" type="text" value="${escapeHtml(ticket.id)}" readonly />
                    </div>

                    <div class="employee-ticket-control-group">
                        <label for="employeeTicketDepartment_${escapeHtml(ticket.id)}">Department</label>
                        <select id="employeeTicketDepartment_${escapeHtml(ticket.id)}" data-ticket-department-select>
                            <option value="Support"${department === 'Support' ? ' selected' : ''}>Support</option>
                            <option value="Billing"${department === 'Billing' ? ' selected' : ''}>Billing</option>
                            <option value="Engineering"${department === 'Engineering' ? ' selected' : ''}>Engineering</option>
                            <option value="Product"${department === 'Product' ? ' selected' : ''}>Product</option>
                            <option value="Sales"${department === 'Sales' ? ' selected' : ''}>Sales</option>
                        </select>
                    </div>

                    <div class="employee-ticket-control-group">
                        <label for="employeeTicketStatus_${escapeHtml(ticket.id)}">Set status</label>
                        <select id="employeeTicketStatus_${escapeHtml(ticket.id)}" data-ticket-status-select>
                            <option value="pending"${String(ticket.status || '').toLowerCase() === 'pending' ? ' selected' : ''}>Open</option>
                            <option value="in-progress"${String(ticket.status || '').toLowerCase() === 'in-progress' ? ' selected' : ''}>In Progress</option>
                            <option value="resolved"${String(ticket.status || '').toLowerCase() === 'resolved' ? ' selected' : ''}>Resolved</option>
                            <option value="dismissed"${String(ticket.status || '').toLowerCase() === 'dismissed' ? ' selected' : ''}>Dismissed</option>
                        </select>
                    </div>

                    <div class="employee-ticket-actions">
                        <button class="btn btn-secondary" type="button" data-ticket-action="apply-status" data-ticket-id="${escapeHtml(ticket.id)}">Apply status</button>
                        <button class="btn btn-secondary" type="button" data-ticket-action="transfer-ticket" data-ticket-id="${escapeHtml(ticket.id)}">Transfer Dept</button>
                        ${actionButtons}
                    </div>
                </div>
            </div>

            <div class="employee-ticket-summary">
                <strong>Customer:</strong> ${escapeHtml(ticket.reporterName || ticket.reporterEmail || 'Unknown')}
                <br />
                <strong>Dept:</strong> ${escapeHtml(department)}
                <br />
                <strong>Issue:</strong> ${escapeHtml((customerMessage && customerMessage.text) || ticket.description || 'No issue details provided yet.')}
            </div>

            <div class="ticket-thread">${messageHtml}</div>

            <form class="ticket-reply-form" data-ticket-reply-form>
                <label for="employeeReply_${escapeHtml(ticket.id)}">Reply as DevDock Team</label>
                <textarea id="employeeReply_${escapeHtml(ticket.id)}" data-ticket-reply-input data-ticket-id="${escapeHtml(ticket.id)}" rows="2" maxlength="2000" placeholder="Type your response..." required>${escapeHtml(currentDraft)}</textarea>
                <div class="button-row">
                    <button class="btn btn-primary" type="submit" data-ticket-reply-send data-ticket-id="${escapeHtml(ticket.id)}">Send Reply</button>
                </div>
            </form>

            <div class="employee-ticket-detail-metadata">
                <span><strong>Ticket ID:</strong> ${escapeHtml(ticket.id)}</span>
                <span><strong>Created:</strong> ${escapeHtml(formatDate(ticket.createdAt))} (${escapeHtml(formatRelativeTime(ticket.createdAt))})</span>
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
        const queueScopeTickets = getQueueScopeTickets()
        const visibleTickets = getVisibleTickets()
        syncQueueResults(visibleTickets.length, queueScopeTickets.length)

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
            const reporterLabel = String(ticket.reporterName || ticket.reporterEmail || 'Unknown reporter').trim()
            const priorityLabel = String(ticket.priorityLabel || '').trim()
            const queueLine = ticket.queueState === 'waiting'
                ? `Queue #${ticket.queuePosition || 1} • ~${ticket.estimatedWaitMinutes || 1}m`
                : (ticket.queueState === 'active' ? 'Agent active' : '')

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
                    <span>${escapeHtml(formatRelativeTime(stamp))}</span>
                    <span>${escapeHtml(reporterLabel)}</span>
                    <span>${escapeHtml(claimLine)}</span>
                    ${priorityLabel ? `<span>${escapeHtml(priorityLabel)} priority</span>` : ''}
                    ${queueLine ? `<span>${escapeHtml(queueLine)}</span>` : ''}
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

    async function loadTickets(silent = false) {
        const params = new URLSearchParams({ mode: 'employee' })
        if (activeDepartmentFilter !== 'all') {
            params.set('department', activeDepartmentFilter)
        }

        const response = await fetchWithAuth(`/api/tickets?${params.toString()}`)
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

    async function transferTicket(ticketId, department) {
        const response = await fetchWithAuth('/api/tickets?mode=employee', {
            method: 'PATCH',
            body: JSON.stringify({
                ticketId,
                action: 'transfer',
                department,
            })
        })

        if (!response) {
            setMessage('Session expired. Please sign in again.', 'error')
            return
        }

        const payload = await response.json()
        if (!payload.success || !payload.ticket) {
            setMessage(payload.error || 'Failed to transfer ticket.', 'error')
            return
        }

        upsertLocalTicket(payload.ticket)
        setMessage(`Ticket transferred to ${normalizeDepartment(payload.ticket.department)}.`, 'success')
    }

    async function deleteTicket(ticketId) {
        const response = await fetchWithAuth('/api/tickets?mode=employee', {
            method: 'DELETE',
            body: JSON.stringify({ ticketId })
        })
        if (!response) {
            setMessage('Session expired. Please sign in again.', 'error')
            return
        }

        const payload = await response.json()
        if (!payload.success) {
            setMessage(payload.error || 'Failed to delete ticket.', 'error')
            return
        }

        tickets = tickets.filter((item) => item.id !== ticketId)
        if (selectedTicketId === ticketId) {
            selectedTicketId = null
        }
        renderTicketList()
        setMessage('Ticket deleted.', 'success')
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
            if (!canAccessEmployeeSupport(role, mePayload.user.departments)) {
                supportDesk.hidden = true
                setMessage('Customer Support department access is required for this desk.', 'error')
                return
            }

            currentUserId = String(mePayload.user.id || '').trim()

            supportDesk.hidden = false
            setOwnershipFilter('all')
            setActiveView('queue')

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

        if (action === 'apply-status') {
            const statusSelect = ticketDetail.querySelector('[data-ticket-status-select]')
            const nextStatus = statusSelect ? String(statusSelect.value || '').trim() : ''
            if (!nextStatus) {
                setMessage('Select a valid status first.', 'error')
                return
            }

            await updateTicketStatus(ticketId, nextStatus)
            return
        }

        if (action === 'transfer-ticket') {
            const departmentSelect = ticketDetail.querySelector('[data-ticket-department-select]')
            const department = departmentSelect ? String(departmentSelect.value || '').trim() : ''
            if (!department) {
                setMessage('Select a department first.', 'error')
                return
            }

            await transferTicket(ticketId, department)
            return
        }

        if (action === 'mark-resolved') {
            await updateTicketStatus(ticketId, 'resolved')
            return
        }

        if (action === 'mark-unresolved') {
            await updateTicketStatus(ticketId, 'pending')
            return
        }

        if (action === 'delete-ticket') {
            const ticket = tickets.find((item) => item.id === ticketId)
            const ticketLabel = ticket && ticket.reason ? ticket.reason : 'this ticket'
            const confirmed = window.confirm(`Delete "${ticketLabel}"? This cannot be undone.`)
            if (!confirmed) return
            await deleteTicket(ticketId)
        }
    })

    ticketDetail.addEventListener('submit', async (event) => {
        const form = event.target.closest('[data-ticket-reply-form]')
        if (!form) return
        event.preventDefault()

        const selectedTicket = getSelectedTicket()
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
            if (selectedTicket) {
                const updated = await sendTicketReply(selectedTicket.id, message)
                if (updated && input) {
                    clearReplyDraft(selectedTicket.id)
                    input.value = ''
                }
            } else {
                const subject = message.split('\n')[0].trim().replace(/\s+/g, ' ').slice(0, 120) || 'Support request'
                const response = await fetchWithAuth('/api/tickets?mode=employee', {
                    method: 'POST',
                    body: JSON.stringify({ category: 'support', subject, message })
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
                selectedTicketId = payload.ticket.id
                clearReplyDraft(payload.ticket.id)
                if (input) {
                    input.value = ''
                }
                setMessage('Ticket created successfully.', 'success')
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

    ticketDetail.addEventListener('input', (event) => {
        const input = event.target.closest('[data-ticket-reply-input]')
        if (!input) return

        const ticketId = input.dataset.ticketId || selectedTicketId
        setReplyDraft(ticketId, input.value)
    })

    ticketDetail.addEventListener('keydown', (event) => {
        const input = event.target.closest('[data-ticket-reply-input]')
        if (!input) return

        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            const form = input.closest('[data-ticket-reply-form]')
            if (form) {
                form.requestSubmit()
            }
        }
    })

    ticketForm.addEventListener('submit', async (event) => {
        event.preventDefault()

        const category = ticketCategory.value
        const subject = ticketSubject.value.trim()
        const message = ticketDescription.value.trim()

        if (!subject || !message) {
            setMessage('Subject and message are required.', 'error')
            return
        }

        setSubmitBusy(true)
        setMessage('Creating ticket...', 'info')

        try {
            const response = await fetchWithAuth('/api/tickets?mode=employee', {
                method: 'POST',
                body: JSON.stringify({ category, subject, message })
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

    if (ticketSearchInput) {
        ticketSearchInput.addEventListener('input', () => {
            setSearchQuery(ticketSearchInput.value)
        })
    }

    if (departmentFilter) {
        departmentFilter.addEventListener('change', async () => {
            activeDepartmentFilter = String(departmentFilter.value || 'all')
            syncQueueCopy()
            setMessage('Applying department routing filter...', 'info')
            await loadTickets(false)
        })
    }

    if (clearTicketSearchButton) {
        clearTicketSearchButton.addEventListener('click', () => {
            if (ticketSearchInput) {
                ticketSearchInput.value = ''
                ticketSearchInput.focus()
            }
            setSearchQuery('')
        })
    }

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
