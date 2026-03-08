import { signOut } from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js';
import {
    addDoc,
    arrayUnion,
    collection,
    deleteDoc,
    doc,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    updateDoc
} from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js';
import { auth, db } from './firebase-config.js';
import { getOrCreateUserProfile, waitForAuthenticatedUser } from './user-session.js';

let currentUser = null;
let currentProfile = null;
let notes = [];
let posts = [];
let unsubscribeNotes = null;
let unsubscribePosts = null;
let removeTarget = null;

function $(id) {
    return document.getElementById(id);
}

function setStatus(message, kind = 'info') {
    const node = $('mod-status');
    if (!node) return;

    node.textContent = message;
    node.classList.remove('hidden', 'bg-blue-50', 'text-blue-700', 'border-blue-100', 'bg-green-50', 'text-green-700', 'border-green-100', 'bg-red-50', 'text-red-700', 'border-red-100');

    if (kind === 'success') {
        node.classList.add('bg-green-50', 'text-green-700', 'border', 'border-green-100');
        return;
    }

    if (kind === 'error') {
        node.classList.add('bg-red-50', 'text-red-700', 'border', 'border-red-100');
        return;
    }

    node.classList.add('bg-blue-50', 'text-blue-700', 'border', 'border-blue-100');
}

function showAuthRequired() {
    $('mod-shell')?.classList.add('hidden');
    $('mod-access-denied')?.classList.add('hidden');
    $('mod-auth-required')?.classList.remove('hidden');
}

function showAccessDenied() {
    $('mod-shell')?.classList.add('hidden');
    $('mod-auth-required')?.classList.add('hidden');
    $('mod-access-denied')?.classList.remove('hidden');
}

function showDashboard() {
    $('mod-auth-required')?.classList.add('hidden');
    $('mod-access-denied')?.classList.add('hidden');
    $('mod-shell')?.classList.remove('hidden');
}

function isModOrAdmin(profile) {
    const role = String(profile?.role || '').toLowerCase();
    return role === 'mod' || role === 'admin';
}

function formatDate(ts) {
    if (!ts) return '—';
    if (typeof ts.toDate === 'function') {
        return ts.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    }
    const parsed = new Date(ts);
    if (Number.isNaN(parsed.getTime())) return '—';
    return parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function openRemoveModal(target) {
    removeTarget = target;
    $('mod-remove-target-text').textContent = `You are removing: ${target.title}`;
    $('mod-remove-form')?.reset();
    $('mod-remove-modal')?.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
}

function closeRemoveModal() {
    removeTarget = null;
    $('mod-remove-modal')?.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
}

async function verifyNote(noteId) {
    if (!currentUser) return;
    try {
        await updateDoc(doc(db, 'universityNotes', noteId), {
            verified: true,
            verifiedBy: currentUser.uid
        });
        setStatus('Note verified successfully.', 'success');
    } catch {
        setStatus('Unable to verify note right now.', 'error');
    }
}

async function removeTargetContent(event) {
    event.preventDefault();
    if (!currentUser || !removeTarget) return;

    const reason = $('mod-remove-reason')?.value || '';
    const details = $('mod-remove-details')?.value?.trim() || '';
    if (!reason) return;

    try {
        if (removeTarget.kind === 'note') {
            await deleteDoc(doc(db, 'universityNotes', removeTarget.id));
        } else {
            await deleteDoc(doc(db, 'teamPosts', removeTarget.id));
        }

        await addDoc(collection(db, 'moderationLogs'), {
            moderatorId: currentUser.uid,
            moderatorEmail: currentUser.email || '',
            action: 'delete',
            contentType: removeTarget.kind,
            contentId: removeTarget.id,
            title: removeTarget.title,
            reason,
            details,
            createdAt: serverTimestamp()
        });

        setStatus('Content removed and logged.', 'success');
    } catch {
        setStatus('Could not remove content. Please try again.', 'error');
    }

    closeRemoveModal();
}

function renderUnverifiedNotes() {
    const container = $('unverified-notes-list');
    if (!container) return;

    const unverified = notes.filter((note) => !note.verified);
    $('unverified-count').textContent = String(unverified.length);

    if (!unverified.length) {
        container.innerHTML = '<div class="text-slate-400">No unverified notes.</div>';
        return;
    }

    container.innerHTML = unverified.map((note) => `
        <div class="border border-slate-200 rounded-xl p-4">
            <div class="flex items-start justify-between gap-3 mb-2">
                <h3 class="font-semibold text-slate-900">${note.title || 'Untitled'}</h3>
                <span class="text-xs px-2 py-1 rounded bg-amber-100 text-amber-700 font-semibold">Unverified</span>
            </div>
            <p class="text-sm text-slate-600 mb-2">${note.university || 'Unknown'} • ${note.moduleCode || ''} • ${note.year || ''}</p>
            <p class="text-xs text-slate-400 mb-3">${formatDate(note.createdAt)}</p>
            <div class="flex gap-2">
                <button class="px-3 py-1.5 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 verify-note-btn" data-note-id="${note.id}" type="button">Verify</button>
                <button class="px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 remove-note-btn" data-note-id="${note.id}" data-note-title="${(note.title || 'Untitled').replace(/"/g, '&quot;')}" type="button">Delete</button>
            </div>
        </div>
    `).join('');
}

function renderReportedContent() {
    const container = $('reported-content-list');
    if (!container) return;

    const reportedNotes = notes
        .filter((note) => Number(note.reportCount || 0) > 0)
        .map((note) => ({
            kind: 'note',
            id: note.id,
            title: note.title || 'Untitled note',
            reportCount: Number(note.reportCount || 0),
            reports: Array.isArray(note.reports) ? note.reports : [],
            verified: !!note.verified
        }));

    const reportedPosts = posts
        .filter((post) => Number(post.reportCount || 0) > 0)
        .map((post) => ({
            kind: 'post',
            id: post.id,
            title: post.title || 'Untitled team post',
            reportCount: Number(post.reportCount || 0),
            reports: Array.isArray(post.reports) ? post.reports : [],
            verified: true
        }));

    const reported = [...reportedNotes, ...reportedPosts].sort((a, b) => b.reportCount - a.reportCount);
    $('reported-count').textContent = String(reported.length);

    if (!reported.length) {
        container.innerHTML = '<div class="text-slate-400">No reported content right now.</div>';
        return;
    }

    container.innerHTML = reported.map((item) => {
        const sourceLabel = item.kind === 'note' ? 'University Note' : 'Team Post';
        const reasons = item.reports.slice(0, 3).map((report) => report.reason || 'unspecified').join(', ');

        return `
            <div class="border border-slate-200 rounded-xl p-4">
                <div class="flex items-start justify-between gap-3 mb-2">
                    <h3 class="font-semibold text-slate-900">${item.title}</h3>
                    <span class="text-xs px-2 py-1 rounded bg-red-100 text-red-700 font-semibold">${item.reportCount} reports</span>
                </div>
                <p class="text-sm text-slate-600 mb-2">${sourceLabel}</p>
                <p class="text-xs text-slate-500 mb-3">Reasons: ${reasons || 'No reason provided'}</p>
                <div class="flex gap-2">
                    ${item.kind === 'note' && !item.verified
                        ? `<button class="px-3 py-1.5 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 verify-note-btn" data-note-id="${item.id}" type="button">Verify</button>`
                        : ''}
                    <button class="px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 remove-generic-btn" data-kind="${item.kind}" data-id="${item.id}" data-title="${item.title.replace(/"/g, '&quot;')}" type="button">Delete</button>
                    <a class="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50" href="code.html#${item.kind === 'note' ? 'universities' : 'community'}">Open</a>
                </div>
            </div>
        `;
    }).join('');
}

function bindListActions() {
    $('unverified-notes-list')?.addEventListener('click', async (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;

        const verifyBtn = target.closest('.verify-note-btn');
        if (verifyBtn) {
            const noteId = verifyBtn.getAttribute('data-note-id');
            if (noteId) {
                await verifyNote(noteId);
            }
            return;
        }

        const removeBtn = target.closest('.remove-note-btn');
        if (removeBtn) {
            const noteId = removeBtn.getAttribute('data-note-id');
            const title = removeBtn.getAttribute('data-note-title') || 'Untitled note';
            if (noteId) {
                openRemoveModal({ kind: 'note', id: noteId, title });
            }
        }
    });

    $('reported-content-list')?.addEventListener('click', async (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;

        const verifyBtn = target.closest('.verify-note-btn');
        if (verifyBtn) {
            const noteId = verifyBtn.getAttribute('data-note-id');
            if (noteId) {
                await verifyNote(noteId);
            }
            return;
        }

        const removeBtn = target.closest('.remove-generic-btn');
        if (removeBtn) {
            const kind = removeBtn.getAttribute('data-kind') === 'post' ? 'post' : 'note';
            const id = removeBtn.getAttribute('data-id');
            const title = removeBtn.getAttribute('data-title') || 'Content';
            if (id) {
                openRemoveModal({ kind, id, title });
            }
        }
    });
}

function startListeners() {
    if (unsubscribeNotes) unsubscribeNotes();
    if (unsubscribePosts) unsubscribePosts();

    unsubscribeNotes = onSnapshot(query(collection(db, 'universityNotes'), orderBy('createdAt', 'desc')), (snapshot) => {
        notes = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
        renderUnverifiedNotes();
        renderReportedContent();
    });

    unsubscribePosts = onSnapshot(query(collection(db, 'teamPosts'), orderBy('createdAt', 'desc')), (snapshot) => {
        posts = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
        renderReportedContent();
    });
}

document.addEventListener('DOMContentLoaded', () => {
    $('mod-go-home-btn')?.addEventListener('click', () => {
        window.location.href = 'code.html';
    });

    $('mod-signout-btn')?.addEventListener('click', async () => {
        await signOut(auth);
        window.location.href = 'code.html';
    });

    $('mod-remove-close-btn')?.addEventListener('click', closeRemoveModal);
    $('mod-remove-cancel-btn')?.addEventListener('click', closeRemoveModal);
    $('mod-remove-backdrop')?.addEventListener('click', closeRemoveModal);
    $('mod-remove-form')?.addEventListener('submit', removeTargetContent);

    bindListActions();

    waitForAuthenticatedUser(
        async (user) => {
            currentUser = user;
            currentProfile = await getOrCreateUserProfile(user);

            if (!isModOrAdmin(currentProfile)) {
                showAccessDenied();
                return;
            }

            $('mod-role-badge').textContent = String(currentProfile.role || 'mod').toUpperCase();
            showDashboard();
            startListeners();
        },
        () => {
            showAuthRequired();
        }
    );
});
