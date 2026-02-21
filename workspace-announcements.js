// Workspace announcements

async function loadAnnouncements() {
    const workspace = document.body.dataset.workspaceName || '';
    if (!workspace) return;

    try {
        const res = await fetch(`/workspaces/announcements?name=${encodeURIComponent(workspace)}`, { credentials: 'include' });
        const data = await res.json();
        if (!data.success) return;

        const list = document.getElementById('announcementsList');
        if (!list) return;
        list.innerHTML = '';

        data.announcements.forEach(a => {
            const li = document.createElement('li');
            li.className = 'announcement-item';
            li.innerHTML = `<div class="msg">${escapeHtml(a.message)}</div><div class="meta">by ${a.author} • ${new Date(a.created_at).toLocaleString()}</div>`;
            list.appendChild(li);
        });

        // show latest announcement as popup if exists
        if (data.announcements && data.announcements.length > 0) {
            const latest = data.announcements[0];
            showAnnouncementPopup(latest.message, latest.author, latest.created_at);
        }
    } catch (err) {
        console.error('Failed to load announcements', err);
    }
}

async function postAnnouncement(message) {
    const workspace = document.body.dataset.workspaceName || '';
    if (!workspace) return { success: false, errors: ['Workspace not found'] };

    try {
        const res = await fetch('/workspaces/announcements', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ workspace_name: workspace, message })
        });
        return await res.json();
    } catch (err) {
        console.error('Failed to post announcement', err);
        return { success: false, errors: [err.message] };
    }
}

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[s]);
}

function showAnnouncementPopup(message, author, created_at) {
    // create transient popup
    const existing = document.getElementById('announcementPopup');
    if (existing) existing.remove();

    const popup = document.createElement('div');
    popup.id = 'announcementPopup';
    popup.className = 'announcement-popup';
    popup.innerHTML = `
        <div class="popup-inner">
            <div class="popup-header">Announcement</div>
            <div class="popup-body">${escapeHtml(message)}</div>
            <div class="popup-meta">by ${escapeHtml(author)} • ${new Date(created_at).toLocaleString()}</div>
            <button class="popup-close">Close</button>
        </div>`;
    document.body.appendChild(popup);
    popup.querySelector('.popup-close').addEventListener('click', () => popup.remove());

    setTimeout(() => { if (popup.parentNode) popup.remove(); }, 12000);
}

// Wire up modal and form
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('announcementsButton');
    const modal = document.getElementById('announcementsModal');
    const closeBtn = modal ? modal.querySelector('.modal-close') : null;
    const form = document.getElementById('announcementForm');

    if (btn && modal) {
        btn.addEventListener('click', async () => {
            // load announcements then open modal
            await loadAnnouncements();
            openModal('announcementsModal');
        });
    }

    if (closeBtn) closeBtn.addEventListener('click', () => closeModal('announcementsModal'));

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const textarea = document.getElementById('announcementText');
            if (!textarea) return;
            const msg = textarea.value.trim();
            if (!msg) return;
            const res = await postAnnouncement(msg);
            if (!res.success) {
                alert(Array.isArray(res.errors) ? res.errors.join(' ') : 'Failed to post announcement');
                return;
            }
            textarea.value = '';
            await loadAnnouncements();
            alert('Announcement posted');
            closeModal('announcementsModal');
        });
    }
});
