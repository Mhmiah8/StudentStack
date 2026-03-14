import { signOut } from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js';
import {
    collection,
    doc,
    onSnapshot,
    query,
    updateDoc
} from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js';
import { auth, db } from './firebase-config.js';
import { getOrCreateUserProfile, waitForAuthenticatedUser } from './user-session.js';

let currentUser = null;
let usersData = [];
let notesData = [];
let postsData = [];
let unsubscribeUsers = null;
let unsubscribeNotes = null;
let unsubscribePosts = null;

function $(id) {
    return document.getElementById(id);
}

function setStatus(message, kind = 'info') {
    const node = $('admin-status');
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
    $('admin-shell')?.classList.add('hidden');
    $('admin-access-denied')?.classList.add('hidden');
    $('admin-auth-required')?.classList.remove('hidden');
}

function showAccessDenied() {
    $('admin-shell')?.classList.add('hidden');
    $('admin-auth-required')?.classList.add('hidden');
    $('admin-access-denied')?.classList.remove('hidden');
}

function showDashboard() {
    $('admin-auth-required')?.classList.add('hidden');
    $('admin-access-denied')?.classList.add('hidden');
    $('admin-shell')?.classList.remove('hidden');
}

function isAdminRole(profile) {
    return String(profile?.role || '').toLowerCase() === 'admin';
}

function normalizeText(value) {
    return String(value || '').toLowerCase();
}

function getRoleBadge(role) {
    const normalized = String(role || 'user').toLowerCase();
    if (normalized === 'admin') {
        return '<span class="px-2 py-1 rounded text-xs font-bold bg-red-100 text-red-700">ADMIN</span>';
    }
    if (normalized === 'mod') {
        return '<span class="px-2 py-1 rounded text-xs font-bold bg-amber-100 text-amber-700">MOD</span>';
    }
    return '<span class="px-2 py-1 rounded text-xs font-bold bg-blue-100 text-blue-700">USER</span>';
}

function renderUsersTable() {
    const tableBody = $('admin-users-table-body');
    if (!tableBody) return;

    const search = normalizeText($('admin-user-search')?.value);
    const roleFilter = normalizeText($('admin-role-filter')?.value || 'all');

    const filtered = usersData
        .filter((item) => {
            if (roleFilter !== 'all' && normalizeText(item.role) !== roleFilter) {
                return false;
            }

            if (!search) {
                return true;
            }

            return [item.email, item.displayName, item.university]
                .map(normalizeText)
                .some((value) => value.includes(search));
        })
        .sort((a, b) => normalizeText(a.email).localeCompare(normalizeText(b.email)));

    if (!filtered.length) {
        tableBody.innerHTML = '<tr><td class="px-4 py-6 text-slate-400" colspan="6">No users found.</td></tr>';
        return;
    }

    tableBody.innerHTML = filtered.map((user) => {
        const role = String(user.role || 'user').toLowerCase();
        const isCurrentUser = user.id === currentUser?.uid;
        const canDemoteMod = role === 'mod' && !isCurrentUser;
        const canPromoteMod = role === 'user' && !isCurrentUser;
        const canBanToggle = !isCurrentUser;

        return `
            <tr class="hover:bg-slate-50">
                <td class="px-4 py-4 text-sm text-slate-700">${user.email || ''}</td>
                <td class="px-4 py-4 text-sm text-slate-700">${user.displayName || ''}</td>
                <td class="px-4 py-4">${getRoleBadge(role)}</td>
                <td class="px-4 py-4 text-sm text-slate-700">${user.university || '—'}</td>
                <td class="px-4 py-4 text-sm ${user.isBanned ? 'text-red-600 font-semibold' : 'text-slate-600'}">${user.isBanned ? 'Yes' : 'No'}</td>
                <td class="px-4 py-4">
                    <div class="flex flex-wrap gap-2">
                        ${canPromoteMod ? `<button class="px-2.5 py-1.5 text-xs rounded-lg bg-amber-100 text-amber-700 font-semibold hover:bg-amber-200 admin-user-action" data-action="grant-mod" data-user-id="${user.id}" type="button">Grant Mod</button>` : ''}
                        ${canDemoteMod ? `<button class="px-2.5 py-1.5 text-xs rounded-lg bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200 admin-user-action" data-action="remove-mod" data-user-id="${user.id}" type="button">Remove Mod</button>` : ''}
                        ${canBanToggle ? `<button class="px-2.5 py-1.5 text-xs rounded-lg ${user.isBanned ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-700 hover:bg-red-200'} font-semibold admin-user-action" data-action="${user.isBanned ? 'unban' : 'ban'}" data-user-id="${user.id}" type="button">${user.isBanned ? 'Unban' : 'Ban'}</button>` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function flattenReports() {
    const reports = [];

    notesData.forEach((note) => {
        const noteReports = Array.isArray(note.reports) ? note.reports : [];
        noteReports.forEach((report) => {
            reports.push({
                contentType: 'University Note',
                title: note.title || 'Untitled note',
                reason: report.reason || 'unspecified',
                details: report.details || '',
                userId: report.userId || '',
                createdAt: report.createdAt || ''
            });
        });
    });

    postsData.forEach((post) => {
        const postReports = Array.isArray(post.reports) ? post.reports : [];
        postReports.forEach((report) => {
            reports.push({
                contentType: 'Team Post',
                title: post.title || 'Untitled team post',
                reason: report.reason || 'unspecified',
                details: report.details || '',
                userId: report.userId || '',
                createdAt: report.createdAt || ''
            });
        });
    });

    return reports.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function renderReportsList() {
    const list = $('admin-reports-list');
    const count = $('admin-reports-count');
    if (!list || !count) return;

    const reports = flattenReports();
    count.textContent = `${reports.length} reports`;

    if (!reports.length) {
        list.innerHTML = '<div class="text-slate-400">No reports submitted yet.</div>';
        return;
    }

    list.innerHTML = reports.map((item) => `
        <div class="border border-slate-200 rounded-xl p-4">
            <div class="flex items-center justify-between gap-3 mb-2">
                <h3 class="font-semibold text-slate-900">${item.title}</h3>
                <span class="text-xs px-2 py-1 rounded bg-slate-100 text-slate-600">${item.contentType}</span>
            </div>
            <p class="text-sm text-slate-700 mb-1"><span class="font-semibold">Reason:</span> ${item.reason}</p>
            <p class="text-sm text-slate-600 mb-1">${item.details || 'No additional details'}</p>
            <p class="text-xs text-slate-400">Reporter: ${item.userId || 'unknown'} • ${item.createdAt ? new Date(item.createdAt).toLocaleString('en-GB') : 'Unknown time'}</p>
        </div>
    `).join('');
}

async function applyUserAction(action, userId) {
    if (!userId || !action) return;

    if (userId === currentUser?.uid) {
        setStatus('You cannot change your own admin account role or ban status from this panel.', 'error');
        return;
    }

    const userRef = doc(db, 'users', userId);

    try {
        if (action === 'grant-mod') {
            await updateDoc(userRef, { role: 'mod' });
            setStatus('User promoted to mod.', 'success');
            return;
        }

        if (action === 'remove-mod') {
            await updateDoc(userRef, { role: 'user' });
            setStatus('Mod role removed.', 'success');
            return;
        }

        if (action === 'ban') {
            await updateDoc(userRef, { isBanned: true });
            setStatus('User banned.', 'success');
            return;
        }

        if (action === 'unban') {
            await updateDoc(userRef, { isBanned: false });
            setStatus('User unbanned.', 'success');
        }
    } catch {
        setStatus('Unable to apply action right now. Please try again.', 'error');
    }
}

function bindEvents() {
    $('admin-go-home-btn')?.addEventListener('click', () => {
        window.location.href = 'index.html';
    });

    $('admin-signout-btn')?.addEventListener('click', async () => {
        await signOut(auth);
        window.location.href = 'index.html';
    });

    $('admin-user-search')?.addEventListener('input', renderUsersTable);
    $('admin-role-filter')?.addEventListener('change', renderUsersTable);

    $('admin-users-table-body')?.addEventListener('click', async (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;

        const actionButton = target.closest('.admin-user-action');
        if (!actionButton) return;

        const action = actionButton.getAttribute('data-action') || '';
        const userId = actionButton.getAttribute('data-user-id') || '';
        await applyUserAction(action, userId);
    });
}

function startDataListeners() {
    if (unsubscribeUsers) unsubscribeUsers();
    if (unsubscribeNotes) unsubscribeNotes();
    if (unsubscribePosts) unsubscribePosts();

    unsubscribeUsers = onSnapshot(query(collection(db, 'users')), (snapshot) => {
        usersData = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
        renderUsersTable();
    });

    unsubscribeNotes = onSnapshot(query(collection(db, 'universityNotes')), (snapshot) => {
        notesData = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
        renderReportsList();
    });

    unsubscribePosts = onSnapshot(query(collection(db, 'teamPosts')), (snapshot) => {
        postsData = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
        renderReportsList();
    });
}

document.addEventListener('DOMContentLoaded', () => {
    bindEvents();

    waitForAuthenticatedUser(
        async (user) => {
            currentUser = user;
            const profile = await getOrCreateUserProfile(user);

            if (!isAdminRole(profile)) {
                showAccessDenied();
                return;
            }

            showDashboard();
            startDataListeners();
        },
        () => {
            showAuthRequired();
        }
    );
});
