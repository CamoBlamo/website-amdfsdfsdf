document.addEventListener('DOMContentLoaded', () => {
    const roots = Array.from(document.querySelectorAll('[data-workspace-inspector-root]'))
    if (!roots.length) return

    roots.forEach((root) => {
        initializeWorkspaceInspector(root)
    })
})

function initializeWorkspaceInspector(root) {
    const form = root.querySelector('[data-workspace-inspector-form]')
    const input = root.querySelector('[data-inspector-input]')
    const message = root.querySelector('[data-inspector-message]')
    const results = root.querySelector('[data-inspector-results]')
    const openLink = root.querySelector('[data-inspector-open]')
    const copyButton = root.querySelector('[data-inspector-copy]')
    const saveButton = root.querySelector('[data-inspector-save]')
    const visibilitySelect = root.querySelector('[data-inspector-visibility]')
    const defaultStatusInput = root.querySelector('[data-inspector-default-status]')
    const allowTaskCreateInput = root.querySelector('[data-inspector-allow-member-task-create]')

    if (!form || !input || !message || !results || !openLink || !copyButton || !saveButton || !visibilitySelect || !defaultStatusInput || !allowTaskCreateInput) {
        return
    }

    let currentWorkspaceId = ''
    let currentCopyId = ''

    function setMessage(text, tone = 'info') {
        message.textContent = text
        message.dataset.tone = tone
    }

    function escapeHtml(value) {
        const div = document.createElement('div')
        div.textContent = value == null ? '' : String(value)
        return div.innerHTML
    }

    function formatDate(value) {
        if (!value) return '-'
        const date = new Date(value)
        if (Number.isNaN(date.getTime())) return '-'
        return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    }

    function renderTrack(container, items) {
        if (!container) return
        const safeItems = Array.isArray(items) ? items : []
        container.innerHTML = safeItems.map((item) => {
            const tone = item && item.tone === 'ready' ? 'ready' : 'attention'
            const label = item && item.label ? item.label : 'No detail available.'
            return `
                <div class="workspace-track-item workspace-track-item--${tone}">
                    <span class="workspace-track-dot" aria-hidden="true"></span>
                    <span>${escapeHtml(label)}</span>
                </div>
            `
        }).join('')
    }

    function fillText(selector, value) {
        const target = root.querySelector(selector)
        if (target) {
            target.textContent = value
        }
    }

    function renderPayload(payload) {
        const workspace = payload && payload.workspace ? payload.workspace : {}
        const metrics = payload && payload.metrics ? payload.metrics : {}
        const tracks = payload && payload.tracks ? payload.tracks : {}

        currentWorkspaceId = workspace.id || ''
        currentCopyId = workspace.shortId || workspace.id || ''

        fillText('[data-inspector-name]', workspace.name || 'Unknown workspace')
        fillText('[data-inspector-id]', workspace.id || '-')
        fillText('[data-inspector-short-id]', workspace.shortId || '-')
        fillText('[data-inspector-owner]', workspace.ownerName && workspace.ownerEmail ? `${workspace.ownerName} (${workspace.ownerEmail})` : (workspace.ownerName || workspace.ownerEmail || '-'))
        fillText('[data-inspector-updated]', formatDate(workspace.updatedAt || workspace.createdAt))
        fillText('[data-inspector-description]', workspace.description || 'No workspace description has been added yet.')
        fillText('[data-inspector-members]', String(metrics.members || 0))
        fillText('[data-inspector-tasks]', String(metrics.tasks || 0))
        fillText('[data-inspector-announcements]', String(metrics.announcements || 0))
        fillText('[data-inspector-visibility-pill]', String(metrics.visibility || 'private').replace(/^[a-z]/, (char) => char.toUpperCase()))

        visibilitySelect.value = metrics.visibility || 'private'
        defaultStatusInput.value = metrics.defaultTaskStatus || 'todo'
        allowTaskCreateInput.checked = !!metrics.allowMemberTaskCreate

        openLink.href = workspace.lookupHref || `/workspace.html?id=${encodeURIComponent(workspace.id || '')}`
        openLink.setAttribute('aria-disabled', currentWorkspaceId ? 'false' : 'true')
        copyButton.disabled = !currentCopyId
        saveButton.disabled = !currentWorkspaceId
        results.hidden = false

        renderTrack(root.querySelector('[data-inspector-track-support]'), tracks.support)
        renderTrack(root.querySelector('[data-inspector-track-beta]'), tracks.beta)
        renderTrack(root.querySelector('[data-inspector-track-pr]'), tracks.pr)
    }

    async function inspectWorkspace(identifier) {
        setMessage('Inspecting workspace...', 'info')
        try {
            const response = await fetchWithAuth(`/api/admin?section=workspace-inspector&id=${encodeURIComponent(identifier)}`)
            if (!response) {
                setMessage('Session expired. Please sign in again.', 'error')
                return
            }

            const data = await response.json()
            if (!data.success) {
                const errorText = Array.isArray(data.errors) && data.errors.length ? data.errors.join(', ') : (data.error || 'Unable to inspect workspace.')
                setMessage(errorText, 'error')
                return
            }

            renderPayload(data)
            setMessage('Workspace loaded. Review the support, beta, and PR checkpoints below.', 'success')
        } catch (error) {
            console.error('Workspace inspection error:', error)
            setMessage('Unable to inspect workspace right now.', 'error')
        }
    }

    async function saveConfiguration() {
        if (!currentWorkspaceId) return

        setMessage('Saving workspace configuration...', 'info')
        try {
            const response = await fetchWithAuth('/api/admin?section=workspace-inspector', {
                method: 'PATCH',
                body: JSON.stringify({
                    workspaceId: currentWorkspaceId,
                    settings: {
                        visibility: visibilitySelect.value,
                        defaultTaskStatus: defaultStatusInput.value,
                        allowMemberTaskCreate: !!allowTaskCreateInput.checked,
                    },
                }),
            })

            if (!response) {
                setMessage('Session expired. Please sign in again.', 'error')
                return
            }

            const data = await response.json()
            if (!data.success) {
                const errorText = Array.isArray(data.errors) && data.errors.length ? data.errors.join(', ') : (data.error || 'Unable to save workspace settings.')
                setMessage(errorText, 'error')
                return
            }

            renderPayload(data)
            setMessage(data.message || 'Workspace configuration updated.', 'success')
        } catch (error) {
            console.error('Workspace inspector save error:', error)
            setMessage('Unable to save workspace configuration.', 'error')
        }
    }

    form.addEventListener('submit', (event) => {
        event.preventDefault()
        const identifier = String(input.value || '').trim()
        if (!identifier) {
            setMessage('Enter a workspace ID or short ID first.', 'warning')
            input.focus()
            return
        }
        inspectWorkspace(identifier)
    })

    copyButton.addEventListener('click', async () => {
        if (!currentCopyId) return

        try {
            await navigator.clipboard.writeText(currentCopyId)
            setMessage('Workspace ID copied.', 'success')
        } catch (error) {
            console.error('Copy workspace id error:', error)
            setMessage('Copy failed. You can still select the ID manually.', 'warning')
        }
    })

    saveButton.addEventListener('click', saveConfiguration)
}