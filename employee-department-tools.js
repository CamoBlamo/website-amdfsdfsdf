document.addEventListener('DOMContentLoaded', async () => {
    const prSection = document.querySelector('[data-department-section="public-relations"]')
    const betaSection = document.querySelector('[data-department-section="beta-tester"]')
    const supportLinks = Array.from(document.querySelectorAll('a[href="/employee-tickets.html"]'))

    const prForm = document.querySelector('[data-pr-form]')
    const prTitle = document.querySelector('[data-pr-title]')
    const prText = document.querySelector('[data-pr-message]')
    const prLevel = document.querySelector('[data-pr-level]')
    const prMessage = document.querySelector('[data-pr-message-box]')

    const betaForm = document.querySelector('[data-beta-form]')
    const betaCategory = document.querySelector('[data-beta-category]')
    const betaSubject = document.querySelector('[data-beta-subject]')
    const betaMessageText = document.querySelector('[data-beta-message]')
    const betaMessage = document.querySelector('[data-beta-message-box]')
    const betaList = document.querySelector('[data-beta-list]')

    if (!prSection && !betaSection) return

    function setBoxMessage(target, text, tone = 'info') {
        if (!target) return
        target.textContent = text
        target.dataset.tone = tone
    }

    function normalizeDepartments(value) {
        if (!Array.isArray(value)) return []
        return value.map((item) => String(item || '').toLowerCase().trim()).filter(Boolean)
    }

    function hasDepartment(departments, department) {
        return normalizeDepartments(departments).includes(String(department || '').toLowerCase().trim())
    }

    function isElevatedRole(role) {
        const normalized = String(role || '').toLowerCase().trim()
        return ['moderator', 'administrator', 'co-owner', 'owner'].includes(normalized)
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

    function renderBetaItems(items) {
        if (!betaList) return
        const list = Array.isArray(items) ? items : []
        if (!list.length) {
            betaList.innerHTML = '<tr><td colspan="4" style="text-align:center;">No beta items yet.</td></tr>'
            return
        }

        betaList.innerHTML = list.map((item) => {
            const title = String(item.title || 'Untitled')
            const status = String(item.status || 'pending')
            const workspace = String(item.workspaceName || 'Unknown')
            const createdAt = formatDate(item.createdAt)
            return `
                <tr>
                    <td>${escapeHtml(title)}</td>
                    <td><span class="status-badge">${escapeHtml(status)}</span></td>
                    <td>${escapeHtml(workspace)}</td>
                    <td>${escapeHtml(createdAt)}</td>
                </tr>
            `
        }).join('')
    }

    async function loadBetaItems() {
        if (!betaSection || betaSection.hidden) return
        try {
            const response = await fetchWithAuth('/api/admin?section=beta-board')
            if (!response) return
            const data = await response.json()
            if (!data.success) {
                setBoxMessage(betaMessage, data.error || 'Unable to load beta items.', 'error')
                renderBetaItems([])
                return
            }

            renderBetaItems(data.items)
            setBoxMessage(betaMessage, `Loaded ${Array.isArray(data.items) ? data.items.length : 0} beta items.`, 'info')
        } catch (error) {
            console.error('Load beta items error:', error)
            setBoxMessage(betaMessage, 'Unable to load beta items.', 'error')
            renderBetaItems([])
        }
    }

    async function init() {
        try {
            const meRes = await fetchWithAuth('/api/me')
            if (!meRes) return
            const me = await meRes.json()
            if (!me.success || !me.user) return

            const role = window.normalizeGlobalRole
                ? window.normalizeGlobalRole(me.user.role)
                : String(me.user.role || 'user').toLowerCase().trim()
            const departments = normalizeDepartments(me.user.departments)

            const canSupport = hasDepartment(departments, 'customer-support') || isElevatedRole(role)
            const canPR = hasDepartment(departments, 'public-relations') || isElevatedRole(role)
            const canBeta = hasDepartment(departments, 'beta-tester') || isElevatedRole(role)

            supportLinks.forEach((link) => {
                if (link) {
                    link.style.display = canSupport ? '' : 'none'
                }
            })

            if (prSection) {
                prSection.hidden = !canPR
            }
            if (betaSection) {
                betaSection.hidden = !canBeta
            }

            if (canBeta) {
                await loadBetaItems()
            }
        } catch (error) {
            console.error('Department tools init error:', error)
        }
    }

    if (prForm) {
        prForm.addEventListener('submit', async (event) => {
            event.preventDefault()
            const title = String(prTitle && prTitle.value || '').trim()
            const message = String(prText && prText.value || '').trim()
            const level = String(prLevel && prLevel.value || 'info').trim().toLowerCase()

            if (!message) {
                setBoxMessage(prMessage, 'Message is required.', 'error')
                return
            }

            setBoxMessage(prMessage, 'Posting announcement...', 'info')
            try {
                const response = await fetchWithAuth('/api/admin?section=announcements', {
                    method: 'POST',
                    body: JSON.stringify({ title, message, level }),
                })
                if (!response) return

                const data = await response.json()
                if (!data.success) {
                    setBoxMessage(prMessage, data.error || (Array.isArray(data.errors) ? data.errors.join(', ') : 'Unable to post announcement.'), 'error')
                    return
                }

                if (prTitle) prTitle.value = ''
                if (prText) prText.value = ''
                if (prLevel) prLevel.value = 'info'
                setBoxMessage(prMessage, 'Announcement posted successfully.', 'success')
            } catch (error) {
                console.error('PR post announcement error:', error)
                setBoxMessage(prMessage, 'Unable to post announcement.', 'error')
            }
        })
    }

    if (betaForm) {
        betaForm.addEventListener('submit', async (event) => {
            event.preventDefault()
            const category = String(betaCategory && betaCategory.value || 'bug').trim().toLowerCase()
            const subject = String(betaSubject && betaSubject.value || '').trim()
            const message = String(betaMessageText && betaMessageText.value || '').trim()

            if (!subject || !message) {
                setBoxMessage(betaMessage, 'Subject and details are required.', 'error')
                return
            }

            setBoxMessage(betaMessage, 'Creating beta item...', 'info')
            try {
                const response = await fetchWithAuth('/api/admin?section=beta-board', {
                    method: 'POST',
                    body: JSON.stringify({ category, subject, message }),
                })
                if (!response) return

                const data = await response.json()
                if (!data.success) {
                    setBoxMessage(betaMessage, data.error || (Array.isArray(data.errors) ? data.errors.join(', ') : 'Unable to create beta item.'), 'error')
                    return
                }

                if (betaCategory) betaCategory.value = 'bug'
                if (betaSubject) betaSubject.value = ''
                if (betaMessageText) betaMessageText.value = ''
                setBoxMessage(betaMessage, 'Beta item created.', 'success')
                await loadBetaItems()
            } catch (error) {
                console.error('Create beta item error:', error)
                setBoxMessage(betaMessage, 'Unable to create beta item.', 'error')
            }
        })
    }

    init()
})
