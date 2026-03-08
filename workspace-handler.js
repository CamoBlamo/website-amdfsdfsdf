// needs to handle workspace switching, and workspace creation
// also needs to handle workspace deletion, and workspace renaming

// this file will be used to handle all workspace related actions, such as switching, creating, deleting, and renaming workspaces

let currentWorkspaceName = '';
let currentWorkspaceRole = '';
let currentGlobalRole = '';
let workspaceMembers = [];
let workspaceTasks = [];
let taskAssignments = [];
let autoRefreshTimer = null;

function normalizeGlobalUserRole(role) {
    if (window.normalizeGlobalRole) {
        return window.normalizeGlobalRole(role);
    }
    return String(role || 'user').toLowerCase();
}

function normalizeWorkspaceMemberRole(role) {
    if (window.normalizeWorkspaceRole) {
        return window.normalizeWorkspaceRole(role);
    }

    const normalized = String(role || '').toLowerCase();
    if (normalized === 'admin') return 'workspace-admin';
    if (['workspace-admin', 'head-developer', 'developer', 'viewer'].includes(normalized)) {
        return normalized;
    }
    return 'developer';
}

function isWorkspaceAdminAccess(workspaceRole, globalRole) {
    const normalizedGlobalRole = normalizeGlobalUserRole(globalRole);
    if ((window.isOwnerRole && window.isOwnerRole(normalizedGlobalRole)) || normalizedGlobalRole === 'owner') {
        return true;
    }

    if (window.isWorkspaceAdminRole) {
        return window.isWorkspaceAdminRole(workspaceRole);
    }

    const normalizedWorkspaceRole = normalizeWorkspaceMemberRole(workspaceRole);
    return ['workspace-admin', 'head-developer'].includes(normalizedWorkspaceRole);
}

function syncOwnerOnlyVisibility(globalRole) {
    const normalized = normalizeGlobalUserRole(globalRole);
    const show = (window.isOwnerRole && window.isOwnerRole(normalized)) || normalized === 'owner';
    document.querySelectorAll('[data-owner-only]').forEach((el) => {
        el.style.display = show ? '' : 'none';
    });

    const adminShow = (window.isAdminRole && window.isAdminRole(normalized))
        || ['owner', 'co-owner', 'administrator', 'moderator'].includes(normalized);
    document.querySelectorAll('[data-admin-only]').forEach((el) => {
        el.style.display = adminShow ? '' : 'none';
    });

    const employeeShow = (window.isEmployeeRole && window.isEmployeeRole(normalized))
        || ['staff', 'moderator', 'administrator', 'co-owner', 'owner'].includes(normalized);
    document.querySelectorAll('[data-employee-only]').forEach((el) => {
        el.style.display = employeeShow ? '' : 'none';
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const isWorkspacePage = !!document.body.dataset.workspaceName || !!document.querySelector('.workspace-heading');
    if (!isWorkspacePage) {
        return;
    }

    // get the workspace select element
    const workspaceSelect = document.getElementById('workspace-select');
    // get the create workspace button
    const createWorkspaceButton = document.getElementById('create-workspace-button');
    // get the delete workspace button
    const deleteWorkspaceButton = document.getElementById('delete-workspace-button');
    // get the rename workspace button
    const renameWorkspaceButton = document.getElementById('rename-workspace-button');
    
    // add event listener for workspace switching
    if (workspaceSelect) {
        workspaceSelect.addEventListener('change', (event) => {
            const selectedWorkspace = event.target.value;
            // switch to the selected workspace
            switchWorkspace(selectedWorkspace);
        });
    }

    // add event listener for workspace creation
    if (createWorkspaceButton) {
        createWorkspaceButton.addEventListener('click', () => {
            window.location.href = 'workspacecreate.html';
        });
    }

    // add event listener for workspace deletion
    if (deleteWorkspaceButton && workspaceSelect) {
        deleteWorkspaceButton.addEventListener('click', () => {
            const selectedWorkspace = workspaceSelect.value;
            if (selectedWorkspace) {
                const confirmDeletion = confirm(`Are you sure you want to delete the workspace "${selectedWorkspace}"?`);
                if (confirmDeletion) {
                    deleteWorkspace(selectedWorkspace);
                }
            } else {
                alert('Please select a workspace to delete.');
            }
        });
    }
    
    // add event listener for workspace renaming
    if (renameWorkspaceButton && workspaceSelect) {
        renameWorkspaceButton.addEventListener('click', () => {
            const selectedWorkspace = workspaceSelect.value;
            if (selectedWorkspace) {
                const newWorkspaceName = prompt('Enter the new name for the workspace:', selectedWorkspace);
                if (newWorkspaceName) {
                    renameWorkspace(selectedWorkspace, newWorkspaceName);
                }
            } else {
                alert('Please select a workspace to rename.');
            }
        });
    }

    loadWorkspaceInfo().then(() => {
        setupWorkspaceAdminControls();
        loadWorkspaceMembers();
        loadWorkspaceTasks();
        loadWorkspaceSettings();
    });
});

function switchWorkspace(workspaceName) {
    // Navigate back to developer spaces to select a different workspace
    window.location.href = '/developerspaces.html';
}

function createWorkspace(workspaceName) {
    // User should use the create workspace button instead
    window.location.href = '/workspacecreate.html';
}

function deleteWorkspace(workspaceName) {
    // Use the delete button in the workspace admin controls instead
    console.log(`To delete workspace: ${workspaceName}, use the admin panel`);
}

function renameWorkspace(oldName, newName) {
    // Use the customize workspace modal in the admin controls instead
    console.log(`To rename workspace from "${oldName}" to "${newName}", use the admin panel`);
}

function setupWorkspaceAdminControls() {
    ensureWorkspaceModals();

    const manageUsersButton = document.getElementById('manageUsersButton');
    const deleteWorkspaceButton = document.getElementById('deleteWorkspaceButton');
    const assignTaskButton = document.getElementById('assignTaskButton') || document.querySelector('button[id="Assign Task"]');
    const customizeWorkspaceButton = document.getElementById('customizeWorkspaceButton');
    const notificationsButton = document.getElementById('notificationsButton');
    const workspaceSettingsButton = document.getElementById('workspaceSettingsButton');
    const adminSections = document.querySelectorAll('.workspace-admin-section');
    const announcementsButton = document.getElementById('announcementsButton');

    const viewReportsButton = document.getElementById('viewReportsButton');
    if (viewReportsButton) viewReportsButton.style.display = 'none';

    const integrationsButton = document.getElementById('integrationsButton');
    if (integrationsButton) integrationsButton.style.display = 'none';

    if (!manageUsersButton && !deleteWorkspaceButton) {
        return;
    }

    let adminVisible = true;

    if (adminSections.length > 0) {
        adminSections.forEach(section => {
            section.style.display = 'none';
        });
        adminVisible = false;
    }

    // Helper function to check admin status dynamically
    const checkIsWorkspaceAdmin = () => {
        return isWorkspaceAdminAccess(currentWorkspaceRole, currentGlobalRole);
    };

    // Update button disabled state based on current role
    const updateBtnDisabledStates = () => {
        const isAdmin = checkIsWorkspaceAdmin();
        if (manageUsersButton) manageUsersButton.disabled = !isAdmin;
        if (deleteWorkspaceButton) deleteWorkspaceButton.disabled = !isAdmin;
        if (assignTaskButton) assignTaskButton.disabled = !isAdmin;
        if (customizeWorkspaceButton) customizeWorkspaceButton.disabled = !isAdmin;
        if (announcementsButton) announcementsButton.disabled = !(currentGlobalRole === 'owner' || isAdmin);
    };

    updateBtnDisabledStates();

    if (manageUsersButton) {
        manageUsersButton.addEventListener('click', () => {
            if (!checkIsWorkspaceAdmin()) {
                showWorkspaceMessage('Only workspace admins or the owner can manage users.', true);
                return;
            }
            if (adminSections.length === 0) {
                showWorkspaceMessage('No user management sections found.', true);
                return;
            }
            adminVisible = !adminVisible;
            adminSections.forEach(section => {
                section.style.display = adminVisible ? 'block' : 'none';
            });
            showWorkspaceMessage(adminVisible ? 'User management opened.' : 'User management hidden.', false);
        });
    }

    if (deleteWorkspaceButton) {
        deleteWorkspaceButton.addEventListener('click', async () => {
            if (!checkIsWorkspaceAdmin()) {
                showWorkspaceMessage('Only workspace admins or the owner can delete this workspace.', true);
                return;
            }
            const workspaceName = getWorkspaceName();
            if (!workspaceName) {
                showWorkspaceMessage('Workspace name not found.', true);
                return;
            }

            const confirmed = confirm(`Are you sure you want to delete "${workspaceName}"? This cannot be undone.`);
            if (!confirmed) return;

            try {
                const response = await fetch('/workspaces/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ workspace_name: workspaceName })
                });

                const data = await response.json();
                if (!data.success) {
                    const msg = Array.isArray(data.errors) ? data.errors.join(' ') : 'Failed to delete workspace.';
                    showWorkspaceMessage(msg, true);
                    return;
                }

                showWorkspaceMessage('Workspace deleted. Redirecting...', false);
                setTimeout(() => {
                    window.location.href = '/developerspaces.html';
                }, 1200);
            } catch (error) {
                console.error('Delete workspace error:', error);
                showWorkspaceMessage('Failed to delete workspace.', true);
            }
        });
    }

    if (assignTaskButton) {
        assignTaskButton.addEventListener('click', () => {
            window.location.href = '/coming-soon.html';
        });
    }

    if (customizeWorkspaceButton) {
        customizeWorkspaceButton.addEventListener('click', () => {
            window.location.href = '/coming-soon.html';
        });
    }

    if (notificationsButton) {
        notificationsButton.addEventListener('click', () => {
            openModal('workspaceSettingsModal');
        });
    }

    if (workspaceSettingsButton) {
        workspaceSettingsButton.addEventListener('click', () => {
            openModal('workspaceSettingsModal');
        });
    }

    if (announcementsButton) {
        announcementsButton.addEventListener('click', () => {
            openModal('announcementsModal');
        });
    }

    const createTaskButton = document.getElementById('createTaskButton');
    if (createTaskButton) {
        createTaskButton.addEventListener('click', handleCreateTask);
    }

    const assignTaskConfirmButton = document.getElementById('assignTaskConfirmButton');
    if (assignTaskConfirmButton) {
        assignTaskConfirmButton.addEventListener('click', handleAssignTask);
    }

    const saveWorkspaceDetailsButton = document.getElementById('saveWorkspaceDetailsButton');
    if (saveWorkspaceDetailsButton) {
        saveWorkspaceDetailsButton.addEventListener('click', handleWorkspaceCustomize);
    }

    const saveWorkspaceSettingsButton = document.getElementById('saveWorkspaceSettingsButton');
    if (saveWorkspaceSettingsButton) {
        saveWorkspaceSettingsButton.addEventListener('click', handleSaveWorkspaceSettings);
    }


    document.querySelectorAll('[data-close]').forEach(button => {
        button.addEventListener('click', () => {
            const target = button.getAttribute('data-close');
            closeModal(target);
        });
    });
}

function getWorkspaceName() {
    return currentWorkspaceName || (document.body && document.body.dataset ? document.body.dataset.workspaceName : '');
}

function ensureWorkspaceMessage() {
    let messageEl = document.getElementById('workspaceActionMessage');
    if (!messageEl) {
        const adminContainer = document.querySelector('.admin-container');
        if (!adminContainer) return null;

        messageEl = document.createElement('div');
        messageEl.id = 'workspaceActionMessage';
        messageEl.className = 'workspace-message';
        adminContainer.prepend(messageEl);
    }
    return messageEl;
}

function showWorkspaceMessage(message, isError) {
    const messageEl = ensureWorkspaceMessage();
    if (!messageEl) return;

    messageEl.textContent = message;
    messageEl.style.color = isError ? '#ff4d4d' : '#4dff4d';
}

async function loadWorkspaceInfo() {
    const path = window.location.pathname.replace(/^\//, '');
    if (!path) return;

    try {
        const response = await fetch(`/workspaces/info-by-file?path=${encodeURIComponent(path)}`, { credentials: 'include' });
        const data = await response.json();
        if (!data.success) return;

        currentWorkspaceName = data.workspace.name;
        currentWorkspaceRole = normalizeWorkspaceMemberRole(data.requesterRole || '');
        currentGlobalRole = normalizeGlobalUserRole(data.requesterGlobalRole || '');
        syncOwnerOnlyVisibility(currentGlobalRole);
        document.body.dataset.workspaceName = currentWorkspaceName;

        const titleEl = document.getElementById('workspaceTitle') || document.querySelector('.workspace-heading h1');
        const descriptionEl = document.getElementById('workspaceDescription') || document.querySelector('.workspace-heading p');
        if (titleEl) titleEl.textContent = `Welcome to ${currentWorkspaceName}`;
        if (descriptionEl) descriptionEl.textContent = data.workspace.description || 'This is your workspace. Here you can manage your projects, collaborate with your team, and track your progress.';

        const customNameInput = document.getElementById('customWorkspaceName');
        const customDescInput = document.getElementById('customWorkspaceDescription');
        if (customNameInput) customNameInput.value = currentWorkspaceName;
        if (customDescInput) customDescInput.value = data.workspace.description || '';
    } catch (error) {
        console.error('Failed to load workspace info', error);
    }
}

function ensureWorkspaceModals() {
    if (!document.getElementById('assignTaskModal')) {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'assignTaskModal';
        modal.setAttribute('aria-hidden', 'true');
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Assign Task</h3>
                    <button class="modal-close" data-close="assignTaskModal">Close</button>
                </div>
                <div class="modal-body">
                    <div class="modal-section">
                        <h4>Create Task</h4>
                        <input type="text" id="taskTitle" placeholder="Task title">
                        <input type="text" id="taskDescription" placeholder="Task description">
                        <input type="date" id="taskDueDate">
                        <select id="taskPriority">
                            <option value="low">Low</option>
                            <option value="medium" selected>Medium</option>
                            <option value="high">High</option>
                        </select>
                        <button id="createTaskButton">Create Task</button>
                    </div>
                    <div class="modal-section">
                        <h4>Assign Existing Task</h4>
                        <select id="taskSelect"></select>
                        <select id="developerSelect"></select>
                        <button id="assignTaskConfirmButton">Assign Task</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    if (!document.getElementById('customizeWorkspaceModal')) {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'customizeWorkspaceModal';
        modal.setAttribute('aria-hidden', 'true');
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Customize Workspace</h3>
                    <button class="modal-close" data-close="customizeWorkspaceModal">Close</button>
                </div>
                <div class="modal-body">
                    <input type="text" id="customWorkspaceName" placeholder="Workspace name">
                    <input type="text" id="customWorkspaceDescription" placeholder="Workspace description">
                    <button id="saveWorkspaceDetailsButton">Save Changes</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    if (!document.getElementById('workspaceSettingsModal')) {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'workspaceSettingsModal';
        modal.setAttribute('aria-hidden', 'true');
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Workspace Settings</h3>
                    <button class="modal-close" data-close="workspaceSettingsModal">Close</button>
                </div>
                <div class="modal-body">
                    <label class="checkbox-row">
                        <input type="checkbox" id="settingNotifications">
                        Enable notifications
                    </label>
                    <label class="checkbox-row">
                        <input type="checkbox" id="settingCompactView">
                        Compact view
                    </label>
                    <label class="checkbox-row">
                        <input type="checkbox" id="settingAutoRefresh">
                        Auto refresh tasks
                    </label>
                    <button id="saveWorkspaceSettingsButton">Save Settings</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
}

async function loadWorkspaceMembers() {
    if (!getWorkspaceName()) return;
    try {
        const response = await fetch(`/workspaces/users?name=${encodeURIComponent(getWorkspaceName())}`, { credentials: 'include' });
        const data = await response.json();
        if (!data.success) return;

        workspaceMembers = data.users || [];
        currentWorkspaceRole = normalizeWorkspaceMemberRole(data.requesterRole || currentWorkspaceRole);
        currentGlobalRole = normalizeGlobalUserRole(data.requesterGlobalRole || currentGlobalRole);
        syncOwnerOnlyVisibility(currentGlobalRole);
        updateDeveloperSelect();
    } catch (error) {
        console.error('Failed to load workspace members', error);
    }
}

async function loadWorkspaceTasks() {
    if (!getWorkspaceName()) return;
    try {
        const response = await fetch(`/workspaces/tasks?name=${encodeURIComponent(getWorkspaceName())}`, { credentials: 'include' });
        const data = await response.json();
        if (!data.success) return;

        workspaceTasks = data.tasks || [];
        taskAssignments = data.assignments || [];
        renderTaskList();
        updateTaskSelect();
    } catch (error) {
        console.error('Failed to load tasks', error);
    }
}

function updateTaskSelect() {
    const select = document.getElementById('taskSelect');
    if (!select) return;

    select.innerHTML = '';
    if (workspaceTasks.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'No tasks available';
        select.appendChild(option);
        return;
    }

    workspaceTasks.forEach(task => {
        const option = document.createElement('option');
        option.value = String(task.id);
        option.textContent = `${task.title} (${task.priority})`;
        select.appendChild(option);
    });
}

function updateDeveloperSelect() {
    const select = document.getElementById('developerSelect');
    if (!select) return;

    select.innerHTML = '';
    if (workspaceMembers.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'No developers available';
        select.appendChild(option);
        return;
    }

    workspaceMembers.forEach(member => {
        const option = document.createElement('option');
        option.value = String(member.id);
        option.textContent = `${member.username || member.email} (${member.role})`;
        select.appendChild(option);
    });
}

function renderTaskList() {
    const list = document.getElementById('taskList');
    if (!list) return;

    list.innerHTML = '';
    if (workspaceTasks.length === 0) {
        const item = document.createElement('li');
        item.textContent = 'No tasks yet.';
        list.appendChild(item);
        return;
    }

    const assignmentMap = new Map();
    taskAssignments.forEach(assign => {
        if (!assignmentMap.has(assign.task_id)) {
            assignmentMap.set(assign.task_id, []);
        }
        assignmentMap.get(assign.task_id).push(assign.username || assign.email);
    });

    workspaceTasks.forEach(task => {
        const item = document.createElement('li');
        const assignees = assignmentMap.get(task.id) || [];
        const dueText = task.due_date ? ` | Due: ${task.due_date}` : '';
        const assignedText = assignees.length ? ` | Assigned: ${assignees.join(', ')}` : '';
        item.textContent = `${task.title} (${task.priority})${dueText}${assignedText}`;
        list.appendChild(item);
    });
}

async function handleCreateTask() {
    const titleInput = document.getElementById('taskTitle');
    const descriptionInput = document.getElementById('taskDescription');
    const dueInput = document.getElementById('taskDueDate');
    const prioritySelect = document.getElementById('taskPriority');

    const title = titleInput ? titleInput.value.trim() : '';
    const description = descriptionInput ? descriptionInput.value.trim() : '';
    const dueDate = dueInput ? dueInput.value : '';
    const priority = prioritySelect ? prioritySelect.value : 'medium';

    if (!title) {
        showWorkspaceMessage('Task title is required.', true);
        return;
    }

    try {
        const response = await fetch('/workspaces/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                workspace_name: getWorkspaceName(),
                title,
                description,
                due_date: dueDate || null,
                priority
            })
        });

        const data = await response.json();
        if (!data.success) {
            const msg = Array.isArray(data.errors) ? data.errors.join(' ') : 'Failed to create task.';
            showWorkspaceMessage(msg, true);
            return;
        }

        if (titleInput) titleInput.value = '';
        if (descriptionInput) descriptionInput.value = '';
        if (dueInput) dueInput.value = '';

        showWorkspaceMessage('Task created successfully.', false);
        await loadWorkspaceTasks();
    } catch (error) {
        console.error('Create task error', error);
        showWorkspaceMessage('Failed to create task.', true);
    }
}

async function handleAssignTask() {
    const taskSelect = document.getElementById('taskSelect');
    const developerSelect = document.getElementById('developerSelect');

    const taskId = taskSelect ? parseInt(taskSelect.value) : NaN;
    const userId = developerSelect ? parseInt(developerSelect.value) : NaN;

    if (isNaN(taskId)) {
        showWorkspaceMessage('Select a task to assign.', true);
        return;
    }

    if (isNaN(userId)) {
        showWorkspaceMessage('Select a developer to assign.', true);
        return;
    }

    try {
        const response = await fetch('/workspaces/tasks/assign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                workspace_name: getWorkspaceName(),
                task_id: taskId,
                user_id: userId
            })
        });

        const data = await response.json();
        if (!data.success) {
            const msg = Array.isArray(data.errors) ? data.errors.join(' ') : 'Failed to assign task.';
            showWorkspaceMessage(msg, true);
            return;
        }

        showWorkspaceMessage('Task assigned successfully.', false);
        await loadWorkspaceTasks();
    } catch (error) {
        console.error('Assign task error', error);
        showWorkspaceMessage('Failed to assign task.', true);
    }
}

async function handleWorkspaceCustomize() {
    const nameInput = document.getElementById('customWorkspaceName');
    const descInput = document.getElementById('customWorkspaceDescription');
    const newName = nameInput ? nameInput.value.trim() : '';
    const description = descInput ? descInput.value.trim() : '';

    if (!newName) {
        showWorkspaceMessage('Workspace name is required.', true);
        return;
    }

    try {
        const response = await fetch('/workspaces/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                workspace_name: getWorkspaceName(),
                new_name: newName,
                description
            })
        });

        const data = await response.json();
        if (!data.success) {
            const msg = Array.isArray(data.errors) ? data.errors.join(' ') : 'Failed to update workspace.';
            showWorkspaceMessage(msg, true);
            return;
        }

        currentWorkspaceName = data.workspace.name;
        document.body.dataset.workspaceName = currentWorkspaceName;
        const titleEl = document.getElementById('workspaceTitle');
        const descEl = document.getElementById('workspaceDescription');
        if (titleEl) titleEl.textContent = `Welcome to ${currentWorkspaceName}`;
        if (descEl) descEl.textContent = data.workspace.description || '';

        showWorkspaceMessage('Workspace updated successfully.', false);
        closeModal('customizeWorkspaceModal');
    } catch (error) {
        console.error('Customize workspace error', error);
        showWorkspaceMessage('Failed to update workspace.', true);
    }
}

function loadWorkspaceSettings() {
    const settingsKey = getSettingsKey();
    const saved = localStorage.getItem(settingsKey);
    if (!saved) return;

    try {
        const data = JSON.parse(saved);
        const notifications = document.getElementById('settingNotifications');
        const compact = document.getElementById('settingCompactView');
        const refresh = document.getElementById('settingAutoRefresh');
        if (notifications) notifications.checked = !!data.notifications;
        if (compact) compact.checked = !!data.compactView;
        if (refresh) refresh.checked = !!data.autoRefresh;

        updateAutoRefresh(!!data.autoRefresh);
    } catch (error) {
        console.error('Failed to load workspace settings', error);
    }
}

function handleSaveWorkspaceSettings() {
    const notifications = document.getElementById('settingNotifications');
    const compact = document.getElementById('settingCompactView');
    const refresh = document.getElementById('settingAutoRefresh');

    const settings = {
        notifications: notifications ? notifications.checked : false,
        compactView: compact ? compact.checked : false,
        autoRefresh: refresh ? refresh.checked : false
    };

    localStorage.setItem(getSettingsKey(), JSON.stringify(settings));
    updateAutoRefresh(settings.autoRefresh);
    showWorkspaceMessage('Workspace settings saved.', false);
    closeModal('workspaceSettingsModal');
}

function updateAutoRefresh(enabled) {
    if (autoRefreshTimer) {
        clearInterval(autoRefreshTimer);
        autoRefreshTimer = null;
    }

    if (enabled) {
        autoRefreshTimer = setInterval(() => {
            loadWorkspaceTasks();
        }, 30000);
    }
}

function getSettingsKey() {
    return `workspace-settings:${getWorkspaceName()}`;
}

function openModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
}

