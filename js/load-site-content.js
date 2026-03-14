import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js';
import {
    addDoc,
    arrayRemove,
    arrayUnion,
    collection,
    deleteDoc,
    doc,
    getDoc,
    increment,
    limit,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    updateDoc,
    where
} from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js';
import { auth, db } from './firebase-config.js';
import { getOrCreateUserProfile } from './user-session.js';

function escapeSiteText(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function setTextById(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = value;
    }
}

let allUniversities = [];
const universitiesPreviewCount = 4;
let visibleUniversityCount = universitiesPreviewCount;
let filteredUniversities = [];
let selectedUniversityName = '';
let universityNotes = [];
let filteredUniversityNotes = [];
const universityNotesPerPage = 8;
let universityNotesLoaded = false;
let currentUniversityUser = null;
let currentUniversityUserProfile = null;
let activeReportNoteId = '';
let unsubscribeUniversityNotes = null;
let teamPosts = [];
let unsubscribeTeamPosts = null;
let activeReportTeamPostId = '';
let activeRemoveContentTarget = null;
let notificationJobs = [];
let notificationHackathons = [];
let notificationSummary = {};
let notificationLastViewedByType = {};
let notificationDismissedByType = {};
let lastNotificationClearSnapshot = null;
let communityNotifications = [];
let unsubscribeUserNotifications = null;
let activeCommentsNoteId = '';
let activeCommentsNoteTitle = '';
let unsubscribeNoteComments = null;
let activeCommentsTeamPostId = '';
let activeCommentsTeamPostTitle = '';
let unsubscribeTeamPostComments = null;

let allGrantItems = [];
let filteredGrantItems = [];
let visibleGrantCount = 8;
const grantsPerPage = 8;
let currentGrantFilter = 'all';
let selectedGrantUniversity = '';
let grantsUniversityOptions = [];
let grantsSourceName = '';
let grantsSourceUrl = '';
let grantsResultCount = '';
let currentGrantTypeFilter = '';
const teamPostsPreviewCount = 3;

function bindExpandableText(root) {
    if (!root) return;

    const blocks = root.querySelectorAll('.expandable-block');
    blocks.forEach((block) => {
        const textNode = block.querySelector('.expandable-text');
        const toggleButton = block.querySelector('.expand-toggle-btn');
        if (!textNode || !toggleButton) return;

        const contentLength = (textNode.textContent || '').trim().length;
        if (contentLength < 180) {
            toggleButton.classList.add('hidden');
            textNode.classList.remove('is-clamped');
            return;
        }

        textNode.classList.add('is-clamped');
        toggleButton.classList.remove('hidden');
        toggleButton.textContent = 'Show more';

        toggleButton.onclick = () => {
            const isClamped = textNode.classList.contains('is-clamped');
            textNode.classList.toggle('is-clamped', !isClamped);
            toggleButton.textContent = isClamped ? 'Show less' : 'Show more';
        };
    });
}

function openExpandedContent(title, content) {
    const modal = document.getElementById('expand-content-modal');
    const titleNode = document.getElementById('expand-content-title');
    const bodyNode = document.getElementById('expand-content-body');
    if (!modal || !titleNode || !bodyNode) return;

    titleNode.textContent = title || 'Expanded content';
    bodyNode.textContent = content || '';
    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
}

function closeExpandedContent() {
    const modal = document.getElementById('expand-content-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
}

async function updateSingleReaction(collectionName, documentId, reactionType) {
    if (!currentUniversityUser) {
        document.getElementById('auth-modal')?.classList.remove('hidden');
        return;
    }

    const targetRef = doc(db, collectionName, documentId);
    try {
        const snapshot = await getDoc(targetRef);
        if (!snapshot.exists()) {
            return;
        }

        const payload = snapshot.data() || {};
        const userId = currentUniversityUser.uid;
        const upvotedBy = Array.isArray(payload.upvotedBy) ? payload.upvotedBy : [];
        const downvotedBy = Array.isArray(payload.downvotedBy) ? payload.downvotedBy : [];

        const hasUpvoted = upvotedBy.includes(userId);
        const hasDownvoted = downvotedBy.includes(userId);

        if (reactionType === 'up') {
            if (hasUpvoted) return;

            const updates = {
                upvotes: increment(1),
                upvotedBy: arrayUnion(userId)
            };

            if (hasDownvoted) {
                updates.downvotes = increment(-1);
                updates.downvotedBy = arrayRemove(userId);
            }

            await updateDoc(targetRef, updates);
            return;
        }

        if (hasDownvoted) return;

        const updates = {
            downvotes: increment(1),
            downvotedBy: arrayUnion(userId)
        };

        if (hasUpvoted) {
            updates.upvotes = increment(-1);
            updates.upvotedBy = arrayRemove(userId);
        }

        await updateDoc(targetRef, updates);
    } catch {
    }
}

function parseGrantDeadline(deadlineText) {
    if (!deadlineText) return null;
    const normalized = String(deadlineText).trim();
    if (!normalized || normalized.toLowerCase() === 'none') {
        return null;
    }

    const match = normalized.match(/^(\d{1,2})\s([A-Za-z]{3})\s(\d{4})$/);
    if (!match) return null;

    const monthMap = {
        jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
        jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
    };

    const day = Number(match[1]);
    const month = monthMap[match[2].toLowerCase()];
    const year = Number(match[3]);
    if (Number.isNaN(day) || Number.isNaN(year) || typeof month === 'undefined') {
        return null;
    }

    return new Date(year, month, day);
}

function isGrantActive(item) {
    const deadline = parseGrantDeadline(item.deadline);
    if (!deadline) return true;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return deadline >= today;
}

function getGrantDeadlineBadge(deadlineText) {
    const deadline = parseGrantDeadline(deadlineText);
    if (!deadline) {
        return '<span class="ml-2 px-2 py-0.5 text-[10px] font-bold rounded-full bg-slate-100 text-slate-600">No deadline</span>';
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysLeft = Math.round((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (daysLeft <= 7) {
        return `<span class="ml-2 px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 text-amber-700">Due in ${daysLeft}d</span>`;
    }

    if (daysLeft <= 30) {
        return `<span class="ml-2 px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-100 text-blue-700">Due in ${daysLeft}d</span>`;
    }

    return '<span class="ml-2 px-2 py-0.5 text-[10px] font-bold rounded-full bg-green-100 text-green-700">Open</span>';
}

function sortGrantItemsByClosestDeadline(items) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return [...items].sort((a, b) => {
        const aDeadline = parseGrantDeadline(a.deadline);
        const bDeadline = parseGrantDeadline(b.deadline);

        if (aDeadline && bDeadline) {
            const aDiff = aDeadline.getTime() - today.getTime();
            const bDiff = bDeadline.getTime() - today.getTime();
            if (aDiff !== bDiff) {
                return aDiff - bDiff;
            }
        } else if (aDeadline && !bDeadline) {
            return -1;
        } else if (!aDeadline && bDeadline) {
            return 1;
        }

        const aScraped = a.scraped_date ? new Date(a.scraped_date).getTime() : 0;
        const bScraped = b.scraped_date ? new Date(b.scraped_date).getTime() : 0;
        return bScraped - aScraped;
    });
}

function isOpenToAllGrant(item) {
    const value = String(item.eligibility ?? '').trim().toLowerCase();
    return !value || ['unknown', 'none', 'n/a', 'open to all', 'all universities'].includes(value);
}

function classifyGrantType(item) {
    const title = String(item?.name ?? '').toLowerCase();

    if (/\bscholarship\b|\bscholarships\b/.test(title)) {
        return 'scholarships';
    }

    if (/\bbursary\b|\bbursaries\b/.test(title)) {
        return 'bursaries';
    }

    if (/\bgrant\b|\bgrants\b/.test(title)) {
        return 'grants';
    }

    return 'grants';
}

function buildGrantsFilterControls() {
    const filtersContainer = document.getElementById('grants-filters');
    if (!filtersContainer) return;

    const allClass = currentGrantFilter === 'all'
        ? 'bg-primary text-white'
        : 'bg-white text-slate-600 border border-slate-200 hover:border-primary';
    const openClass = currentGrantFilter === 'open-to-all'
        ? 'bg-primary text-white'
        : 'bg-white text-slate-600 border border-slate-200 hover:border-primary';
    const uniClass = currentGrantFilter === 'university'
        ? 'bg-primary text-white'
        : 'bg-white text-slate-600 border border-slate-200 hover:border-primary';

    const grantsTypeClass = currentGrantTypeFilter === 'grants'
        ? 'bg-primary text-white'
        : 'bg-white text-slate-600 border border-slate-200 hover:border-primary';
    const bursariesTypeClass = currentGrantTypeFilter === 'bursaries'
        ? 'bg-primary text-white'
        : 'bg-white text-slate-600 border border-slate-200 hover:border-primary';
    const scholarshipsTypeClass = currentGrantTypeFilter === 'scholarships'
        ? 'bg-primary text-white'
        : 'bg-white text-slate-600 border border-slate-200 hover:border-primary';
    const allTypesClass = !currentGrantTypeFilter
        ? 'bg-primary text-white'
        : 'bg-white text-slate-600 border border-slate-200 hover:border-primary';

    const selectVisibleClass = currentGrantFilter === 'university' ? '' : 'hidden';
    const sourceHtml = grantsSourceName && grantsSourceUrl
        ? `<a href="${escapeSiteText(grantsSourceUrl)}" target="_blank" rel="noopener" class="text-primary font-semibold hover:underline">${escapeSiteText(grantsSourceName)}</a>`
        : '';
    const sourceMeta = grantsResultCount ? `${escapeSiteText(grantsResultCount)} results` : '';

    filtersContainer.innerHTML = `
        <div class="w-full flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div class="text-sm text-slate-600">${sourceHtml}${sourceHtml && sourceMeta ? ' • ' : ''}${sourceMeta}</div>
            <div class="flex flex-wrap gap-3">
                <button class="px-5 py-2 ${allClass} rounded-full text-sm font-semibold transition-colors" data-grant-filter="all">All Universities</button>
                <button class="px-5 py-2 ${openClass} rounded-full text-sm font-semibold transition-colors" data-grant-filter="open-to-all">Open to All</button>
                <button class="px-5 py-2 ${uniClass} rounded-full text-sm font-semibold transition-colors" data-grant-filter="university">Select University</button>
                <select id="grants-university-select" class="px-4 py-2 rounded-full text-sm border border-slate-200 bg-white text-slate-700 ${selectVisibleClass}">
                    <option value="">Choose university</option>
                    ${grantsUniversityOptions.map((uni) => `<option value="${escapeSiteText(uni)}" ${selectedGrantUniversity === uni ? 'selected' : ''}>${escapeSiteText(uni)}</option>`).join('')}
                </select>
            </div>
        </div>
        <div class="w-full flex flex-wrap gap-3 mt-3">
            <button class="px-5 py-2 ${allTypesClass} rounded-full text-sm font-semibold transition-colors" data-grant-type-all="true">All Types</button>
            <button class="px-5 py-2 ${grantsTypeClass} rounded-full text-sm font-semibold transition-colors" data-grant-type="grants">Grants</button>
            <button class="px-5 py-2 ${bursariesTypeClass} rounded-full text-sm font-semibold transition-colors" data-grant-type="bursaries">Bursaries</button>
            <button class="px-5 py-2 ${scholarshipsTypeClass} rounded-full text-sm font-semibold transition-colors" data-grant-type="scholarships">Scholarships</button>
        </div>
    `;

    filtersContainer.querySelectorAll('[data-grant-filter]').forEach((button) => {
        button.addEventListener('click', () => {
            currentGrantFilter = button.getAttribute('data-grant-filter');
            if (currentGrantFilter !== 'university') {
                selectedGrantUniversity = '';
            }
            applyGrantFilter();
        });
    });

    filtersContainer.querySelectorAll('[data-grant-type]').forEach((button) => {
        button.addEventListener('click', () => {
            currentGrantTypeFilter = button.getAttribute('data-grant-type') || '';
            applyGrantFilter();
        });
    });

    filtersContainer.querySelectorAll('[data-grant-type-all]').forEach((button) => {
        button.addEventListener('click', () => {
            currentGrantTypeFilter = '';
            applyGrantFilter();
        });
    });

    const select = document.getElementById('grants-university-select');
    if (select) {
        select.addEventListener('change', () => {
            selectedGrantUniversity = select.value;
            applyGrantFilter();
        });
    }
}

function applyGrantFilter() {
    let baseFilteredItems = [];

    if (currentGrantFilter === 'open-to-all') {
        baseFilteredItems = allGrantItems.filter(isOpenToAllGrant);
    } else if (currentGrantFilter === 'university') {
        if (!selectedGrantUniversity) {
            baseFilteredItems = [];
        } else {
            baseFilteredItems = allGrantItems.filter((item) => item.eligibility === selectedGrantUniversity);
        }
    } else {
        baseFilteredItems = [...allGrantItems];
    }

    if (currentGrantTypeFilter) {
        filteredGrantItems = baseFilteredItems.filter((item) => classifyGrantType(item) === currentGrantTypeFilter);
    } else {
        filteredGrantItems = baseFilteredItems;
    }

    visibleGrantCount = grantsPerPage;
    buildGrantsFilterControls();
    renderVisibleGrantRows();
    updateGrantsLoadMoreButton();
}

function renderVisibleGrantRows() {
    const tableBody = document.getElementById('grants-table-body');
    if (!tableBody) return;

    if (!filteredGrantItems.length) {
        tableBody.innerHTML = `
            <tr>
                <td class="px-6 py-8 text-slate-400 text-center" colspan="5">No opportunities match this filter.</td>
            </tr>
        `;
        return;
    }

    const visibleItems = filteredGrantItems.slice(0, visibleGrantCount);
    tableBody.innerHTML = visibleItems.map((item) => `
        <tr class="hover:bg-slate-50 transition-colors">
            <td class="px-6 py-5 font-bold text-slate-900">${escapeSiteText(item.name)}</td>
            <td class="px-6 py-5 text-secondary font-semibold">${escapeSiteText(item.amount)}</td>
            <td class="px-6 py-5 text-slate-600">${escapeSiteText(item.eligibility)}</td>
                <td class="px-6 py-5 text-slate-600">${escapeSiteText(item.deadline)}${getGrantDeadlineBadge(item.deadline)}</td>
            <td class="px-6 py-5">
                <a href="${escapeSiteText(item.url || '#')}" target="_blank" rel="noopener" class="text-primary font-bold hover:underline ${item.url ? '' : 'pointer-events-none opacity-60'}">
                    ${escapeSiteText(item.action || 'View Details')}
                </a>
            </td>
        </tr>
    `).join('');
}

function updateGrantsLoadMoreButton() {
    const container = document.getElementById('grants-load-more-container');
    const button = document.getElementById('grants-load-more-btn');
    if (!container || !button) return;

    if (filteredGrantItems.length <= grantsPerPage) {
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');

    if (visibleGrantCount >= filteredGrantItems.length) {
        button.textContent = 'All opportunities loaded';
        button.disabled = true;
        button.classList.add('opacity-50', 'cursor-not-allowed');
        return;
    }

    const nextCount = Math.min(visibleGrantCount + grantsPerPage, filteredGrantItems.length);
    button.textContent = `Load More Opportunities (${nextCount} of ${filteredGrantItems.length})`;
    button.disabled = false;
    button.classList.remove('opacity-50', 'cursor-not-allowed');
}

function loadMoreGrants() {
    visibleGrantCount = Math.min(visibleGrantCount + grantsPerPage, filteredGrantItems.length);
    renderVisibleGrantRows();
    updateGrantsLoadMoreButton();
}

function createUniversityCard(universityName) {
    return `
        <div class="border border-slate-200 rounded-xl p-5 hover:border-primary transition-all bg-slate-50">
            <span class="text-xs font-bold text-primary bg-blue-50 px-2 py-1 rounded mb-3 inline-block">University</span>
            <h3 class="font-bold text-lg mb-1 leading-snug">${escapeSiteText(universityName)}</h3>
            <p class="text-sm text-slate-500 mb-4">No notes uploaded yet for this university.</p>
            <div class="flex justify-between items-center text-xs text-slate-600">
                <span>📄 0 notes</span>
                <span class="text-secondary font-semibold">Awaiting uploads</span>
            </div>
        </div>
    `;
}

function formatNoteDate(timestamp) {
    if (!timestamp) return 'Just now';
    if (typeof timestamp.toDate === 'function') {
        return timestamp.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    const parsed = new Date(timestamp);
    if (Number.isNaN(parsed.getTime())) return 'Just now';
    return parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function isModeratorOrAdmin(profile) {
    const role = String(profile?.role || '').toLowerCase();
    return role === 'mod' || role === 'admin';
}

function createUniversityNoteCard(note) {
    const verifiedBadge = note.verified
        ? '<span class="text-xs font-bold text-green-700 bg-green-100 px-2 py-1 rounded">✓ Verified</span>'
        : '<span class="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-1 rounded">Unverified</span>';

    const reportCountLabel = Number(note.reportCount || 0) > 0 ? `• ${note.reportCount} reports` : '';
    const showRemove = isModeratorOrAdmin(currentUniversityUserProfile);
    const removeButton = showRemove
        ? `<button class="text-red-600 hover:text-red-700 font-bold text-sm remove-note-mod-btn" data-note-id="${escapeSiteText(note.id)}" data-note-title="${escapeSiteText(note.title || 'Untitled note')}" type="button">✕</button>`
        : '';

    return `
        <div class="border border-slate-200 rounded-xl p-5 hover:border-primary transition-all bg-white">
            <div class="flex items-start justify-between gap-2 mb-3">
                <span class="text-xs font-bold text-primary bg-blue-50 px-2 py-1 rounded">${escapeSiteText(note.moduleCode || 'MODULE')}</span>
                <div class="flex items-center gap-2">
                    ${verifiedBadge}
                    ${removeButton}
                </div>
            </div>
            <h3 class="font-bold text-lg mb-1 leading-snug">${escapeSiteText(note.title || 'Untitled Note')}</h3>
            <p class="text-sm text-slate-500 mb-2">${escapeSiteText(note.university || 'Unknown University')}</p>
            <p class="text-sm text-slate-600 mb-3">${escapeSiteText(note.moduleName || '')} • ${escapeSiteText(note.year || 'Year not set')}</p>
            <div class="expandable-block mb-4">
                <p class="text-sm text-slate-700 expandable-text">${escapeSiteText(note.content || '')}</p>
                <button class="hidden mt-2 text-xs text-primary font-semibold hover:underline expand-toggle-btn" type="button">Show more</button>
            </div>
            <div class="flex items-center justify-between text-xs text-slate-500 mb-3">
                <span>${escapeSiteText(formatNoteDate(note.createdAt))}</span>
                <span>${reportCountLabel}</span>
            </div>
            <div class="flex flex-wrap items-center justify-between gap-2">
                <span class="text-slate-500 text-sm">Text note</span>
                <div class="flex flex-wrap items-center gap-3 justify-end ml-auto">
                    <button class="text-slate-600 hover:text-primary text-sm font-semibold note-react-btn" data-note-id="${escapeSiteText(note.id)}" data-reaction="up" type="button">👍 <span>${Number(note.upvotes || 0)}</span></button>
                    <button class="text-slate-600 hover:text-primary text-sm font-semibold note-react-btn" data-note-id="${escapeSiteText(note.id)}" data-reaction="down" type="button">👎 <span>${Number(note.downvotes || 0)}</span></button>
                    <button class="text-slate-600 hover:underline text-sm font-semibold view-note-comments-btn" data-note-id="${escapeSiteText(note.id)}" data-note-title="${escapeSiteText(note.title || 'Untitled Note')}" type="button">View comments</button>
                    <button class="text-slate-600 hover:underline text-sm font-semibold expand-card-btn" data-expand-title="${escapeSiteText(note.title || 'Untitled Note')}" data-expand-content="${escapeSiteText(note.content || '')}" type="button">Expand</button>
                    <button class="text-red-600 hover:underline text-sm font-semibold report-note-btn" data-note-id="${escapeSiteText(note.id)}" type="button">Report</button>
                </div>
            </div>
        </div>
    `;
}

async function reactToUniversityNote(noteId, reactionType) {
    if (!noteId || !reactionType) return;
    await updateSingleReaction('universityNotes', noteId, reactionType);
}

function openNoteCommentsModal(noteId, noteTitle) {
    if (!noteId) return;

    activeCommentsNoteId = noteId;
    activeCommentsNoteTitle = noteTitle || 'Comments';

    const titleNode = document.getElementById('comments-note-title');
    if (titleNode) {
        titleNode.textContent = activeCommentsNoteTitle;
    }

    document.getElementById('note-comments-form')?.reset();
    const modal = document.getElementById('note-comments-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');

    const commentsList = document.getElementById('note-comments-list');
    if (commentsList) {
        commentsList.innerHTML = '<div class="text-slate-400">Loading comments...</div>';
    }

    if (unsubscribeNoteComments) {
        unsubscribeNoteComments();
        unsubscribeNoteComments = null;
    }

    const commentsQuery = query(collection(db, 'universityNotes', noteId, 'comments'), orderBy('createdAt', 'desc'), limit(100));
    unsubscribeNoteComments = onSnapshot(commentsQuery, (snapshot) => {
        if (!commentsList) return;
        const comments = snapshot.docs.map((docSnap) => docSnap.data());

        if (!comments.length) {
            commentsList.innerHTML = '<div class="text-slate-400">No comments yet. Start the discussion.</div>';
            return;
        }

        commentsList.innerHTML = comments.map((comment) => `
            <div class="border border-slate-200 rounded-lg p-3 bg-slate-50">
                <div class="flex items-center justify-between gap-3 mb-1">
                    <p class="text-sm font-semibold text-slate-800">${escapeSiteText(comment.authorName || 'Student')}</p>
                    <p class="text-xs text-slate-500">${escapeSiteText(formatNoteDate(comment.createdAt))}</p>
                </div>
                <p class="text-sm text-slate-700 whitespace-pre-wrap">${escapeSiteText(comment.content || '')}</p>
            </div>
        `).join('');
    }, () => {
        if (commentsList) {
            commentsList.innerHTML = '<div class="text-slate-400">Unable to load comments right now.</div>';
        }
    });
}

function closeNoteCommentsModal() {
    activeCommentsNoteId = '';
    activeCommentsNoteTitle = '';

    if (unsubscribeNoteComments) {
        unsubscribeNoteComments();
        unsubscribeNoteComments = null;
    }

    const modal = document.getElementById('note-comments-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
}

function openTeamPostCommentsModal(postId, postTitle) {
    if (!postId) return;

    activeCommentsTeamPostId = postId;
    activeCommentsTeamPostTitle = postTitle || 'Comments';

    const titleNode = document.getElementById('team-comments-post-title');
    if (titleNode) {
        titleNode.textContent = activeCommentsTeamPostTitle;
    }

    document.getElementById('team-comments-form')?.reset();
    const modal = document.getElementById('team-comments-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');

    const commentsList = document.getElementById('team-comments-list');
    if (commentsList) {
        commentsList.innerHTML = '<div class="text-slate-400">Loading comments...</div>';
    }

    if (unsubscribeTeamPostComments) {
        unsubscribeTeamPostComments();
        unsubscribeTeamPostComments = null;
    }

    const commentsQuery = query(collection(db, 'teamPosts', postId, 'comments'), orderBy('createdAt', 'desc'), limit(100));
    unsubscribeTeamPostComments = onSnapshot(commentsQuery, (snapshot) => {
        if (!commentsList) return;
        const comments = snapshot.docs.map((docSnap) => docSnap.data());

        if (!comments.length) {
            commentsList.innerHTML = '<div class="text-slate-400">No comments yet. Start the discussion.</div>';
            return;
        }

        commentsList.innerHTML = comments.map((comment) => `
            <div class="border border-slate-200 rounded-lg p-3 bg-slate-50">
                <div class="flex items-center justify-between gap-3 mb-1">
                    <p class="text-sm font-semibold text-slate-800">${escapeSiteText(comment.authorName || 'Student')}</p>
                    <p class="text-xs text-slate-500">${escapeSiteText(formatNoteDate(comment.createdAt))}</p>
                </div>
                <p class="text-sm text-slate-700 whitespace-pre-wrap">${escapeSiteText(comment.content || '')}</p>
            </div>
        `).join('');
    }, () => {
        if (commentsList) {
            commentsList.innerHTML = '<div class="text-slate-400">Unable to load comments right now.</div>';
        }
    });
}

function closeTeamPostCommentsModal() {
    activeCommentsTeamPostId = '';
    activeCommentsTeamPostTitle = '';

    if (unsubscribeTeamPostComments) {
        unsubscribeTeamPostComments();
        unsubscribeTeamPostComments = null;
    }

    const modal = document.getElementById('team-comments-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
}

async function submitTeamPostComment(event) {
    event.preventDefault();

    if (!currentUniversityUser || !activeCommentsTeamPostId) {
        document.getElementById('auth-modal')?.classList.remove('hidden');
        return;
    }

    const input = document.getElementById('team-comment-input');
    const content = input?.value?.trim() || '';
    if (!content) return;

    try {
        if (!currentUniversityUserProfile) {
            currentUniversityUserProfile = await getOrCreateUserProfile(currentUniversityUser);
        }

        await addDoc(collection(db, 'teamPosts', activeCommentsTeamPostId, 'comments'), {
            userId: currentUniversityUser.uid,
            authorName: currentUniversityUserProfile?.displayName || currentUniversityUser.email || 'Student',
            authorEmoji: currentUniversityUserProfile?.avatarEmoji || '🙂',
            content,
            createdAt: serverTimestamp()
        });

        const postSnapshot = await getDoc(doc(db, 'teamPosts', activeCommentsTeamPostId));
        const postData = postSnapshot.exists() ? postSnapshot.data() : null;
        const ownerUserId = postData?.userId || '';
        const postTitle = postData?.title || activeCommentsTeamPostTitle || 'your post';

        if (ownerUserId && ownerUserId !== currentUniversityUser.uid) {
            await addDoc(collection(db, 'userNotifications'), {
                userId: ownerUserId,
                type: 'community',
                title: `New comment on ${postTitle}`,
                message: `${currentUniversityUserProfile?.displayName || 'Someone'} commented on your teammate post.`,
                url: 'index.html#community',
                createdAt: serverTimestamp()
            });
        }

        if (input) {
            input.value = '';
        }
    } catch {
    }
}

async function submitNoteComment(event) {
    event.preventDefault();

    if (!currentUniversityUser || !activeCommentsNoteId) {
        document.getElementById('auth-modal')?.classList.remove('hidden');
        return;
    }

    const input = document.getElementById('note-comment-input');
    const content = input?.value?.trim() || '';
    if (!content) return;

    try {
        if (!currentUniversityUserProfile) {
            currentUniversityUserProfile = await getOrCreateUserProfile(currentUniversityUser);
        }

        await addDoc(collection(db, 'universityNotes', activeCommentsNoteId, 'comments'), {
            userId: currentUniversityUser.uid,
            authorName: currentUniversityUserProfile?.displayName || currentUniversityUser.email || 'Student',
            authorEmoji: currentUniversityUserProfile?.avatarEmoji || '🙂',
            content,
            createdAt: serverTimestamp()
        });

        const noteSnapshot = await getDoc(doc(db, 'universityNotes', activeCommentsNoteId));
        const noteData = noteSnapshot.exists() ? noteSnapshot.data() : null;
        const ownerUserId = noteData?.userId || '';
        const noteTitle = noteData?.title || activeCommentsNoteTitle || 'your upload';

        if (ownerUserId && ownerUserId !== currentUniversityUser.uid) {
            await addDoc(collection(db, 'userNotifications'), {
                userId: ownerUserId,
                type: 'community',
                title: `New comment on ${noteTitle}`,
                message: `${currentUniversityUserProfile?.displayName || 'Someone'} commented on your upload.`,
                url: 'index.html#universities',
                createdAt: serverTimestamp()
            });
        }

        if (input) {
            input.value = '';
        }
    } catch {
    }
}

function updateUniversitiesToggleButton() {
    const toggleButton = document.getElementById('toggle-universities-btn');
    if (!toggleButton) return;

    const usingNotes = universityNotesLoaded;
    const totalItems = usingNotes ? filteredUniversityNotes.length : filteredUniversities.length;
    const pageSize = usingNotes ? universityNotesPerPage : universitiesPreviewCount;

    if (totalItems <= pageSize) {
        toggleButton.classList.add('hidden');
        return;
    }

    toggleButton.classList.remove('hidden');

    if (visibleUniversityCount >= totalItems) {
        toggleButton.innerHTML = `
            View Less
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M15 19l-7-7 7-7" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path>
            </svg>
        `;
        return;
    }

    const nextCount = Math.min(visibleUniversityCount + pageSize, totalItems);
    const label = usingNotes ? 'Load More Notes' : 'Load More Universities';
    toggleButton.innerHTML = `
        ${label} (${nextCount} of ${totalItems})
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M9 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path>
        </svg>
    `;
}

function renderUniversitiesListPreview() {
    const modulesContainer = document.getElementById('universities-modules-container');
    if (!modulesContainer) return;

    if (universityNotesLoaded) {
        if (!filteredUniversityNotes.length) {
            const targetLabel = selectedUniversityName ? ` for ${escapeSiteText(selectedUniversityName)}` : '';
            modulesContainer.innerHTML = `<div class="col-span-4 text-center py-8 text-slate-500">No notes found${targetLabel}. Be the first to upload one.</div>`;
            return;
        }

        const visibleNotes = filteredUniversityNotes.slice(0, visibleUniversityCount);
        modulesContainer.innerHTML = visibleNotes.map(createUniversityNoteCard).join('');
        bindExpandableText(modulesContainer);
        return;
    }

    const visibleUniversities = filteredUniversities.slice(0, visibleUniversityCount);
    modulesContainer.innerHTML = visibleUniversities.map(createUniversityCard).join('');
}

function buildUniversityControls() {
    const tabsContainer = document.getElementById('universities-tabs');
    if (!tabsContainer) return;

    const allClass = selectedUniversityName
        ? 'bg-white text-slate-600 border border-slate-200 hover:border-primary'
        : 'bg-primary text-white';
    const notesMeta = universityNotesLoaded
        ? `${filteredUniversityNotes.length} notes shown`
        : 'Module uploads opening soon';

    tabsContainer.innerHTML = `
        <div class="w-full flex flex-col md:flex-row md:items-center md:justify-between gap-3 py-3">
            <div class="text-sm text-slate-600 font-medium">${escapeSiteText(allUniversities.length)} UK universities indexed • ${escapeSiteText(notesMeta)}</div>
            <div class="flex flex-wrap gap-3 items-center justify-center md:justify-end">
                <button class="px-5 py-2 ${allClass} rounded-full text-sm font-semibold transition-colors" id="universities-show-all-btn">All Universities</button>
                <select id="universities-select" class="px-4 py-2 rounded-full text-sm border border-slate-200 bg-white text-slate-700 min-w-[260px]">
                    <option value="">Select University</option>
                    ${allUniversities.map((university) => `<option value="${escapeSiteText(university)}" ${selectedUniversityName === university ? 'selected' : ''}>${escapeSiteText(university)}</option>`).join('')}
                </select>
            </div>
        </div>
    `;

    const showAllButton = document.getElementById('universities-show-all-btn');
    if (showAllButton) {
        showAllButton.addEventListener('click', () => {
            selectedUniversityName = '';
            applyUniversityFilter();
        });
    }

    const select = document.getElementById('universities-select');
    if (select) {
        select.addEventListener('change', () => {
            selectedUniversityName = select.value;
            applyUniversityFilter();
        });
    }
}

function applyUniversityFilter() {
    if (selectedUniversityName) {
        filteredUniversities = allUniversities.filter((university) => university === selectedUniversityName);
        filteredUniversityNotes = universityNotes.filter((note) => note.university === selectedUniversityName);
    } else {
        filteredUniversities = [...allUniversities];
        filteredUniversityNotes = [...universityNotes];
    }

    visibleUniversityCount = universityNotesLoaded ? universityNotesPerPage : universitiesPreviewCount;
    buildUniversityControls();
    renderUniversitiesListPreview();
    updateUniversitiesToggleButton();

    const ctaButton = document.getElementById('universities-cta-button');
    if (ctaButton) {
        ctaButton.textContent = selectedUniversityName || 'Select University';
    }
}

function toggleUniversitiesView(event) {
    if (event) {
        event.preventDefault();
    }

    const usingNotes = universityNotesLoaded;
    const totalItems = usingNotes ? filteredUniversityNotes.length : filteredUniversities.length;
    const pageSize = usingNotes ? universityNotesPerPage : universitiesPreviewCount;

    if (totalItems <= pageSize) {
        return;
    }

    if (visibleUniversityCount >= totalItems) {
        visibleUniversityCount = pageSize;
    } else {
        visibleUniversityCount = Math.min(visibleUniversityCount + pageSize, totalItems);
    }

    renderUniversitiesListPreview();
    updateUniversitiesToggleButton();
}

function setUploadNoteStatus(message, isError = false) {
    const node = document.getElementById('upload-note-status');
    if (!node) return;

    if (!message) {
        node.classList.add('hidden');
        node.textContent = '';
        return;
    }

    node.textContent = message;
    node.classList.remove('hidden');
    node.classList.remove('text-red-700', 'bg-red-50', 'border-red-100', 'text-green-700', 'bg-green-50', 'border-green-100');
    node.classList.add('border', isError ? 'text-red-700' : 'text-green-700', isError ? 'bg-red-50' : 'bg-green-50', isError ? 'border-red-100' : 'border-green-100');
}

function openUploadNoteModal() {
    if (!currentUniversityUser) {
        setUploadNoteStatus('Please log in first to upload notes.', true);
        document.getElementById('auth-modal')?.classList.remove('hidden');
        return;
    }

    const modal = document.getElementById('upload-note-modal');
    if (!modal) return;

    const select = document.getElementById('upload-note-university');
    if (select) {
        select.innerHTML = `
            <option value="">Select University</option>
            ${allUniversities.map((university) => `<option value="${escapeSiteText(university)}">${escapeSiteText(university)}</option>`).join('')}
        `;
    }

    if (selectedUniversityName && select) {
        select.value = selectedUniversityName;
    }

    setUploadNoteStatus('');
    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
}

function closeUploadNoteModal() {
    const modal = document.getElementById('upload-note-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
    setUploadNoteStatus('');
    document.getElementById('upload-note-form')?.reset();
}

async function submitUploadNote(event) {
    event.preventDefault();

    if (!currentUniversityUser) {
        setUploadNoteStatus('Please log in to upload notes.', true);
        return;
    }

    const profile = currentUniversityUserProfile || await getOrCreateUserProfile(currentUniversityUser);
    currentUniversityUserProfile = profile;

    const submitButton = document.getElementById('upload-note-submit-btn');
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.classList.add('opacity-60', 'cursor-not-allowed');
    }

    try {
        const university = document.getElementById('upload-note-university')?.value?.trim() || '';
        const year = document.getElementById('upload-note-year')?.value?.trim() || '';
        const moduleCode = document.getElementById('upload-note-module-code')?.value?.trim() || '';
        const moduleName = document.getElementById('upload-note-module-name')?.value?.trim() || '';
        const title = document.getElementById('upload-note-title')?.value?.trim() || '';
        const content = document.getElementById('upload-note-content')?.value?.trim() || '';
        if (!university || !year || !moduleCode || !moduleName || !title || !content) {
            setUploadNoteStatus('Please complete all required fields.', true);
            return;
        }

        const autoVerified = isModeratorOrAdmin(profile);
        await addDoc(collection(db, 'universityNotes'), {
            userId: currentUniversityUser.uid,
            university,
            moduleCode,
            moduleName,
            year,
            title,
            content,
            fileUrl: '',
            verified: autoVerified,
            verifiedBy: autoVerified ? currentUniversityUser.uid : null,
            reports: [],
            reportCount: 0,
            upvotes: 0,
            downvotes: 0,
            upvotedBy: [],
            downvotedBy: [],
            createdAt: serverTimestamp()
        });

        setUploadNoteStatus('Note uploaded successfully.', false);
        closeUploadNoteModal();
    } catch {
        setUploadNoteStatus('Unable to upload note right now. Please try again.', true);
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.classList.remove('opacity-60', 'cursor-not-allowed');
        }
    }
}

function openReportModal(noteId) {
    if (!currentUniversityUser) {
        document.getElementById('auth-modal')?.classList.remove('hidden');
        return;
    }

    activeReportNoteId = noteId;
    document.getElementById('report-note-form')?.reset();
    const modal = document.getElementById('report-note-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
}

function closeReportModal() {
    activeReportNoteId = '';
    const modal = document.getElementById('report-note-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
}

function openRemoveContentModal(kind, id, title) {
    activeRemoveContentTarget = { kind, id, title };
    document.getElementById('remove-content-form')?.reset();
    const modal = document.getElementById('remove-content-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
}

function closeRemoveContentModal() {
    activeRemoveContentTarget = null;
    const modal = document.getElementById('remove-content-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
}

async function submitRemoveContent(event) {
    event.preventDefault();

    if (!currentUniversityUser || !isModeratorOrAdmin(currentUniversityUserProfile) || !activeRemoveContentTarget) {
        closeRemoveContentModal();
        return;
    }

    const reason = document.getElementById('remove-content-reason')?.value || '';
    const details = document.getElementById('remove-content-details')?.value?.trim() || '';
    if (!reason) {
        return;
    }

    try {
        if (activeRemoveContentTarget.kind === 'note') {
            await deleteDoc(doc(db, 'universityNotes', activeRemoveContentTarget.id));
        } else {
            await deleteDoc(doc(db, 'teamPosts', activeRemoveContentTarget.id));
        }

        await addDoc(collection(db, 'moderationLogs'), {
            moderatorId: currentUniversityUser.uid,
            moderatorEmail: currentUniversityUser.email || '',
            action: 'delete',
            contentType: activeRemoveContentTarget.kind,
            contentId: activeRemoveContentTarget.id,
            title: activeRemoveContentTarget.title || '',
            reason,
            details,
            createdAt: serverTimestamp()
        });
    } catch {
    }

    closeRemoveContentModal();
}

async function submitNoteReport(event) {
    event.preventDefault();
    if (!currentUniversityUser || !activeReportNoteId) return;

    const reason = document.getElementById('report-note-reason')?.value || '';
    const details = document.getElementById('report-note-details')?.value?.trim() || '';
    if (!reason) return;

    const noteRef = doc(db, 'universityNotes', activeReportNoteId);

    try {
        const snapshot = await getDoc(noteRef);
        if (!snapshot.exists()) {
            closeReportModal();
            return;
        }

        await updateDoc(noteRef, {
            reports: arrayUnion({
                userId: currentUniversityUser.uid,
                reason,
                details,
                createdAt: new Date().toISOString()
            }),
            reportCount: increment(1)
        });
    } catch {
    }

    closeReportModal();
}

function updateUploadNoteButtonState() {
    const uploadButton = document.getElementById('open-upload-note-btn');
    if (!uploadButton) return;

    if (!currentUniversityUser) {
        uploadButton.textContent = 'Log in to Upload Note';
        return;
    }

    uploadButton.textContent = 'Upload Note';
}

function bindUniversityPhase3Events() {
    document.getElementById('open-upload-note-btn')?.addEventListener('click', openUploadNoteModal);
    document.getElementById('upload-note-close-btn')?.addEventListener('click', closeUploadNoteModal);
    document.getElementById('upload-note-backdrop')?.addEventListener('click', closeUploadNoteModal);
    document.getElementById('upload-note-form')?.addEventListener('submit', submitUploadNote);

    document.getElementById('universities-modules-container')?.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;

        const reactButton = target.closest('.note-react-btn');
        if (reactButton) {
            const noteId = reactButton.getAttribute('data-note-id');
            const reaction = reactButton.getAttribute('data-reaction');
            if (noteId && reaction) {
                reactToUniversityNote(noteId, reaction);
            }
            return;
        }

        const commentsButton = target.closest('.view-note-comments-btn');
        if (commentsButton) {
            const noteId = commentsButton.getAttribute('data-note-id');
            const noteTitle = commentsButton.getAttribute('data-note-title') || 'Comments';
            if (noteId) {
                openNoteCommentsModal(noteId, noteTitle);
            }
            return;
        }

        const expandButton = target.closest('.expand-card-btn');
        if (expandButton) {
            const title = expandButton.getAttribute('data-expand-title') || 'Expanded content';
            const content = expandButton.getAttribute('data-expand-content') || '';
            openExpandedContent(title, content);
            return;
        }

        const removeButton = target.closest('.remove-note-mod-btn');
        if (removeButton) {
            const noteId = removeButton.getAttribute('data-note-id');
            const noteTitle = removeButton.getAttribute('data-note-title') || 'Untitled note';
            if (noteId && isModeratorOrAdmin(currentUniversityUserProfile)) {
                openRemoveContentModal('note', noteId, noteTitle);
            }
            return;
        }

        const reportButton = target.closest('.report-note-btn');
        if (!reportButton) return;
        const noteId = reportButton.getAttribute('data-note-id');
        if (!noteId) return;
        openReportModal(noteId);
    });

    document.getElementById('report-note-close-btn')?.addEventListener('click', closeReportModal);
    document.getElementById('report-note-cancel-btn')?.addEventListener('click', closeReportModal);
    document.getElementById('report-note-backdrop')?.addEventListener('click', closeReportModal);
    document.getElementById('report-note-form')?.addEventListener('submit', submitNoteReport);

    document.getElementById('note-comments-close-btn')?.addEventListener('click', closeNoteCommentsModal);
    document.getElementById('note-comments-backdrop')?.addEventListener('click', closeNoteCommentsModal);
    document.getElementById('note-comments-form')?.addEventListener('submit', submitNoteComment);

    document.getElementById('expand-content-close-btn')?.addEventListener('click', closeExpandedContent);
    document.getElementById('expand-content-backdrop')?.addEventListener('click', closeExpandedContent);
    document.getElementById('expand-content-close-secondary')?.addEventListener('click', closeExpandedContent);
}

function initUniversityAuthState() {
    onAuthStateChanged(auth, async (user) => {
        currentUniversityUser = user || null;
        currentUniversityUserProfile = null;

        if (user) {
            try {
                currentUniversityUserProfile = await getOrCreateUserProfile(user);
                notificationLastViewedByType = normalizeNotificationTimestampMap(currentUniversityUserProfile?.notificationMeta?.lastViewedByType);
                notificationDismissedByType = normalizeNotificationDismissedMap(currentUniversityUserProfile?.notificationMeta?.dismissedByType);
                lastNotificationClearSnapshot = null;
                startUserNotificationsListener(user.uid);
            } catch {
                currentUniversityUserProfile = null;
                notificationLastViewedByType = normalizeNotificationTimestampMap({});
                notificationDismissedByType = normalizeNotificationDismissedMap({});
                lastNotificationClearSnapshot = null;
                startUserNotificationsListener('');
            }
        } else {
            notificationLastViewedByType = normalizeNotificationTimestampMap({});
            notificationDismissedByType = normalizeNotificationDismissedMap({});
            lastNotificationClearSnapshot = null;
            startUserNotificationsListener('');
        }

        updateUploadNoteButtonState();
        renderUniversitiesListPreview();
        renderTeamPostsList();
        refreshNotificationsUi();
    });
}

function startUniversityNotesListener() {
    if (unsubscribeUniversityNotes) {
        unsubscribeUniversityNotes();
    }

    const notesQuery = query(collection(db, 'universityNotes'), orderBy('createdAt', 'desc'));
    unsubscribeUniversityNotes = onSnapshot(notesQuery, (snapshot) => {
        universityNotes = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
        universityNotesLoaded = true;
        applyUniversityFilter();
    }, () => {
        universityNotesLoaded = false;
        applyUniversityFilter();
    });
}

function renderUniversities(universities) {
    const tabsContainer = document.getElementById('universities-tabs');
    const modulesContainer = document.getElementById('universities-modules-container');
    const toggleButton = document.getElementById('toggle-universities-btn');

    if (Array.isArray(universities.list) && universities.list.length > 0) {
        allUniversities = [...universities.list].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
        filteredUniversities = [...allUniversities];
        filteredUniversityNotes = [...universityNotes];
        selectedUniversityName = '';
        visibleUniversityCount = universitiesPreviewCount;

        buildUniversityControls();
        renderUniversitiesListPreview();
        updateUniversitiesToggleButton();
        startUniversityNotesListener();

        if (toggleButton) {
            toggleButton.onclick = toggleUniversitiesView;
        }

        setTextById('top-universities-count', allUniversities.length);

        if (universities.cta) {
            setTextById('universities-cta-text', universities.cta.text || '');
            setTextById('universities-cta-button', universities.cta.button || '');
        }

        const ctaButton = document.getElementById('universities-cta-button');
        if (ctaButton) {
            ctaButton.onclick = () => {
                const select = document.getElementById('universities-select');
                if (select) {
                    select.focus();
                }
            };
        }

        return;
    }

    allUniversities = [];
    filteredUniversities = [];
    filteredUniversityNotes = [];
    selectedUniversityName = '';
    visibleUniversityCount = universitiesPreviewCount;
    if (toggleButton) {
        toggleButton.classList.add('hidden');
        toggleButton.onclick = null;
    }

    if (tabsContainer) {
        tabsContainer.innerHTML = '<div class="w-full text-center py-4 text-slate-400">No universities available.</div>';
    }

    if (modulesContainer) {
        modulesContainer.innerHTML = '<div class="col-span-4 text-center py-8 text-slate-400">No university notes to show.</div>';
    }

    if (universities.cta) {
        setTextById('universities-cta-text', universities.cta.text || '');
        setTextById('universities-cta-button', universities.cta.button || '');
    }
}

function renderGrants(grants, universities = []) {
    setTextById('grants-title', grants.title || 'Grants, Bursaries & Scholarships');
    setTextById('grants-subtitle', grants.subtitle || 'Explore live funding opportunities and trusted support resources.');

    setTextById('grants-live-title', grants.live_title || 'Live Opportunities');
    setTextById('grants-resources-title', grants.resources_title || 'More Funding Resources');

    const resourcesContainer = document.getElementById('grants-resources-container');
    const loadMoreButton = document.getElementById('grants-load-more-btn');

    const live = grants.live_opportunities || {};
    setTextById('grants-last-updated', live.last_updated ? `Last updated: ${live.last_updated}` : 'Last updated: —');

    grantsSourceName = live.source_name || '';
    grantsSourceUrl = live.source_url || '';
    grantsResultCount = live.result_count || '';
    setTextById('grants-last-updated', live.last_updated ? `Last updated: ${live.last_updated}${grantsResultCount ? ` • ${grantsResultCount} results` : ''}` : 'Last updated: —');

    grantsUniversityOptions = Array.isArray(universities)
        ? [...universities].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))
        : [];

    if (Array.isArray(live.items)) {
        allGrantItems = sortGrantItemsByClosestDeadline(live.items.filter(isGrantActive));
        filteredGrantItems = [...allGrantItems];
        currentGrantFilter = 'all';
        currentGrantTypeFilter = '';
        selectedGrantUniversity = '';

        buildGrantsFilterControls();
        renderVisibleGrantRows();
        updateGrantsLoadMoreButton();

        if (loadMoreButton) {
            loadMoreButton.onclick = loadMoreGrants;
        }

        refreshNotificationsUi();
    }

    if (resourcesContainer && Array.isArray(grants.resources)) {
        resourcesContainer.innerHTML = grants.resources.map((category) => `
            <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
                <h4 class="font-bold text-slate-900 mb-3">${escapeSiteText(category.category)}</h4>
                <ul class="space-y-3">
                    ${(Array.isArray(category.links) ? category.links : []).map((link) => `
                        <li>
                            <a href="${escapeSiteText(link.url)}" target="_blank" rel="noopener" class="text-primary font-semibold hover:underline">${escapeSiteText(link.name)}</a>
                            <p class="text-sm text-slate-500 mt-1">${escapeSiteText(link.description || '')}</p>
                        </li>
                    `).join('')}
                </ul>
            </div>
        `).join('');
    }
}

function formatTeamPostType(type) {
    const labels = {
        hackathon: 'Hackathon',
        project: 'Project',
        study: 'Study'
    };
    return labels[type] || 'Team';
}

function createTeamPostCard(post) {
    const reportCount = Number(post.reportCount || 0);
    const lookingFor = Array.isArray(post.lookingFor) ? post.lookingFor : [];
    const created = formatNoteDate(post.createdAt);
    const typeLabel = formatTeamPostType(post.type);

    const showRemove = isModeratorOrAdmin(currentUniversityUserProfile);
    const removeButton = showRemove
        ? `<button class="text-red-600 hover:text-red-700 font-bold text-sm remove-team-post-mod-btn" data-post-id="${escapeSiteText(post.id)}" data-post-title="${escapeSiteText(post.title || 'Untitled post')}" type="button">✕</button>`
        : '';

    return `
        <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <div class="flex items-center gap-3 mb-3">
                <div class="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-sm">${escapeSiteText(post.authorEmoji || '🙂')}</div>
                <span class="font-bold text-sm text-slate-700">${escapeSiteText(post.authorName || 'Student')}</span>
                <span class="text-xs text-slate-400 ml-auto">${escapeSiteText(created)}</span>
                ${removeButton}
            </div>
            <div class="flex items-center justify-between mb-2">
                <h4 class="font-bold text-slate-900">${escapeSiteText(post.title || 'Untitled post')}</h4>
                <span class="text-xs font-semibold px-2 py-1 rounded bg-blue-50 text-primary">${escapeSiteText(typeLabel)}</span>
            </div>
            <div class="expandable-block mb-3">
                <p class="text-sm text-slate-600 expandable-text">${escapeSiteText(post.description || '')}</p>
                <button class="hidden mt-2 text-xs text-primary font-semibold hover:underline expand-toggle-btn" type="button">Show more</button>
            </div>
            <p class="text-xs text-slate-500 mb-3">Contact: ${escapeSiteText(post.contactInfo || 'Not provided')}</p>
            <div class="flex flex-wrap gap-2 mb-3">
                ${lookingFor.map((tag) => `<span class="text-xs bg-slate-100 px-2 py-1 rounded text-slate-600">${escapeSiteText(tag)}</span>`).join('')}
            </div>
            <div class="flex flex-wrap items-center justify-between gap-3">
                <span class="text-xs text-slate-400">${reportCount > 0 ? `${reportCount} reports` : 'No reports'}</span>
                <div class="flex flex-wrap items-center gap-3 justify-end ml-auto">
                    <button class="text-slate-600 hover:text-primary text-sm font-semibold team-react-btn" data-post-id="${escapeSiteText(post.id)}" data-reaction="up" type="button">👍 <span>${Number(post.upvotes || 0)}</span></button>
                    <button class="text-slate-600 hover:text-primary text-sm font-semibold team-react-btn" data-post-id="${escapeSiteText(post.id)}" data-reaction="down" type="button">👎 <span>${Number(post.downvotes || 0)}</span></button>
                    <button class="text-slate-600 hover:underline text-sm font-semibold view-team-comments-btn" data-post-id="${escapeSiteText(post.id)}" data-post-title="${escapeSiteText(post.title || 'Untitled post')}" type="button">View comments</button>
                    <button class="text-slate-600 hover:underline text-sm font-semibold expand-card-btn" data-expand-title="${escapeSiteText(post.title || 'Untitled post')}" data-expand-content="${escapeSiteText(post.description || '')}" type="button">Expand</button>
                    <button class="text-red-600 hover:underline text-sm font-semibold report-team-post-btn" data-post-id="${escapeSiteText(post.id)}" type="button">Report</button>
                </div>
            </div>
        </div>
    `;
}

function renderTeamPostsList() {
    const postsContainer = document.getElementById('team-posts-container');
    if (!postsContainer) return;

    if (!teamPosts.length) {
        postsContainer.innerHTML = '<div class="text-slate-400">No team posts yet. Create the first one.</div>';
        return;
    }

    postsContainer.innerHTML = teamPosts.slice(0, teamPostsPreviewCount).map(createTeamPostCard).join('');
    bindExpandableText(postsContainer);
}

async function reactToTeamPost(postId, reactionType) {
    if (!postId || !reactionType) return;
    await updateSingleReaction('teamPosts', postId, reactionType);
}

function setTeamPostStatus(message, isError = false) {
    const statusNode = document.getElementById('team-post-status');
    if (!statusNode) return;

    if (!message) {
        statusNode.classList.add('hidden');
        statusNode.textContent = '';
        return;
    }

    statusNode.textContent = message;
    statusNode.classList.remove('hidden');
    statusNode.classList.remove('text-red-700', 'bg-red-50', 'border-red-100', 'text-green-700', 'bg-green-50', 'border-green-100');
    statusNode.classList.add('border', isError ? 'text-red-700' : 'text-green-700', isError ? 'bg-red-50' : 'bg-green-50', isError ? 'border-red-100' : 'border-green-100');
}

function openTeamPostModal() {
    if (!currentUniversityUser) {
        document.getElementById('auth-modal')?.classList.remove('hidden');
        return;
    }

    const modal = document.getElementById('team-post-modal');
    if (!modal) return;
    setTeamPostStatus('');
    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
}

function closeTeamPostModal() {
    const modal = document.getElementById('team-post-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
    document.getElementById('team-post-form')?.reset();
    setTeamPostStatus('');
}

async function submitTeamPost(event) {
    event.preventDefault();
    if (!currentUniversityUser) return;

    const submitButton = document.getElementById('team-post-submit-btn');
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.classList.add('opacity-60', 'cursor-not-allowed');
    }

    try {
        const type = document.getElementById('team-post-type')?.value || '';
        const title = document.getElementById('team-post-title')?.value?.trim() || '';
        const description = document.getElementById('team-post-description')?.value?.trim() || '';
        const lookingForRaw = document.getElementById('team-post-looking-for')?.value || '';
        const contactInfo = document.getElementById('team-post-contact')?.value?.trim() || '';

        if (!type || !title || !description || !contactInfo) {
            setTeamPostStatus('Please complete all required fields.', true);
            return;
        }

        if (!currentUniversityUserProfile) {
            currentUniversityUserProfile = await getOrCreateUserProfile(currentUniversityUser);
        }

        const lookingFor = lookingForRaw
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean);

        await addDoc(collection(db, 'teamPosts'), {
            userId: currentUniversityUser.uid,
            authorName: currentUniversityUserProfile?.displayName || currentUniversityUser.email || 'Student',
            authorEmoji: currentUniversityUserProfile?.avatarEmoji || '🙂',
            type,
            title,
            description,
            lookingFor,
            contactInfo,
            upvotes: 0,
            downvotes: 0,
            upvotedBy: [],
            downvotedBy: [],
            reports: [],
            reportCount: 0,
            createdAt: serverTimestamp()
        });

        closeTeamPostModal();
    } catch {
        setTeamPostStatus('Unable to post right now. Please try again.', true);
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.classList.remove('opacity-60', 'cursor-not-allowed');
        }
    }
}

function openReportTeamPostModal(postId) {
    if (!currentUniversityUser) {
        document.getElementById('auth-modal')?.classList.remove('hidden');
        return;
    }

    activeReportTeamPostId = postId;
    const modal = document.getElementById('report-team-post-modal');
    if (!modal) return;
    document.getElementById('report-team-post-form')?.reset();
    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
}

function closeReportTeamPostModal() {
    activeReportTeamPostId = '';
    const modal = document.getElementById('report-team-post-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
}

async function submitTeamPostReport(event) {
    event.preventDefault();
    if (!currentUniversityUser || !activeReportTeamPostId) return;

    const reason = document.getElementById('report-team-post-reason')?.value || '';
    const details = document.getElementById('report-team-post-details')?.value?.trim() || '';
    if (!reason) return;

    try {
        await updateDoc(doc(db, 'teamPosts', activeReportTeamPostId), {
            reports: arrayUnion({
                userId: currentUniversityUser.uid,
                reason,
                details,
                createdAt: new Date().toISOString()
            }),
            reportCount: increment(1)
        });
    } catch {
    }

    closeReportTeamPostModal();
}

function startTeamPostsListener() {
    if (unsubscribeTeamPosts) {
        unsubscribeTeamPosts();
    }

    const postsQuery = query(collection(db, 'teamPosts'), orderBy('createdAt', 'desc'));
    unsubscribeTeamPosts = onSnapshot(postsQuery, (snapshot) => {
        teamPosts = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
        renderTeamPostsList();
        refreshNotificationsUi();
    }, () => {
        teamPosts = [];
        renderTeamPostsList();
        refreshNotificationsUi();
    });
}

function bindCommunityPhase4Events() {
    document.getElementById('open-team-post-btn')?.addEventListener('click', openTeamPostModal);
    document.getElementById('team-post-close-btn')?.addEventListener('click', closeTeamPostModal);
    document.getElementById('team-post-backdrop')?.addEventListener('click', closeTeamPostModal);
    document.getElementById('team-post-form')?.addEventListener('submit', submitTeamPost);

    document.getElementById('team-posts-container')?.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;

        const reactButton = target.closest('.team-react-btn');
        if (reactButton) {
            const postId = reactButton.getAttribute('data-post-id');
            const reaction = reactButton.getAttribute('data-reaction');
            if (postId && reaction) {
                reactToTeamPost(postId, reaction);
            }
            return;
        }

        const commentsButton = target.closest('.view-team-comments-btn');
        if (commentsButton) {
            const postId = commentsButton.getAttribute('data-post-id');
            const postTitle = commentsButton.getAttribute('data-post-title') || 'Comments';
            if (postId) {
                openTeamPostCommentsModal(postId, postTitle);
            }
            return;
        }

        const expandButton = target.closest('.expand-card-btn');
        if (expandButton) {
            const title = expandButton.getAttribute('data-expand-title') || 'Expanded content';
            const content = expandButton.getAttribute('data-expand-content') || '';
            openExpandedContent(title, content);
            return;
        }

        const removeButton = target.closest('.remove-team-post-mod-btn');
        if (removeButton) {
            const postId = removeButton.getAttribute('data-post-id');
            const postTitle = removeButton.getAttribute('data-post-title') || 'Untitled post';
            if (postId && isModeratorOrAdmin(currentUniversityUserProfile)) {
                openRemoveContentModal('post', postId, postTitle);
            }
            return;
        }

        const reportButton = target.closest('.report-team-post-btn');
        if (!reportButton) return;
        const postId = reportButton.getAttribute('data-post-id');
        if (!postId) return;
        openReportTeamPostModal(postId);
    });

    document.getElementById('report-team-post-close-btn')?.addEventListener('click', closeReportTeamPostModal);
    document.getElementById('report-team-post-cancel-btn')?.addEventListener('click', closeReportTeamPostModal);
    document.getElementById('report-team-post-backdrop')?.addEventListener('click', closeReportTeamPostModal);
    document.getElementById('report-team-post-form')?.addEventListener('submit', submitTeamPostReport);

    document.getElementById('remove-content-close-btn')?.addEventListener('click', closeRemoveContentModal);
    document.getElementById('remove-content-cancel-btn')?.addEventListener('click', closeRemoveContentModal);
    document.getElementById('remove-content-backdrop')?.addEventListener('click', closeRemoveContentModal);
    document.getElementById('remove-content-form')?.addEventListener('submit', submitRemoveContent);

    document.getElementById('team-comments-close-btn')?.addEventListener('click', closeTeamPostCommentsModal);
    document.getElementById('team-comments-backdrop')?.addEventListener('click', closeTeamPostCommentsModal);
    document.getElementById('team-comments-form')?.addEventListener('submit', submitTeamPostComment);
}

function renderCommunity(community) {
    const groupsContainer = document.getElementById('community-groups-container');

    if (groupsContainer) {
        groupsContainer.innerHTML = `
            <div class="bg-slate-50 border border-slate-200 rounded-xl p-5">
                <h4 class="font-bold text-slate-900 mb-3">Hackathon Communities</h4>
                <div class="space-y-2 text-sm text-slate-700">
                    <p>🎮 Discord (Hackathons): <a class="text-primary font-semibold hover:underline" href="https://discord.gg/gyjYue25" target="_blank" rel="noopener">Join Discord</a></p>
                    <p>📱 WhatsApp (Hackathons): <a class="text-primary font-semibold hover:underline" href="https://chat.whatsapp.com/EWCPnquUzXD9uppsSuQFVk" target="_blank" rel="noopener">Join WhatsApp</a></p>
                </div>
                <p class="text-xs text-slate-500 mt-3">Know of other hackathon groups? Contact: <a class="text-primary font-semibold hover:underline" href="mailto:mmiahhilal1@gmail.com">mmiahhilal1@gmail.com</a></p>
            </div>

            <div class="bg-slate-50 border border-slate-200 rounded-xl p-5">
                <h4 class="font-bold text-slate-900 mb-3">CV Resources</h4>
                <p class="text-sm text-slate-700">📄 Discord (CV Review): <a class="text-primary font-semibold hover:underline" href="https://discord.gg/XhZzbQRV" target="_blank" rel="noopener">Get CV Help</a></p>
            </div>

            <div class="bg-slate-50 border border-slate-200 rounded-xl p-5">
                <h4 class="font-bold text-slate-900 mb-2">University Societies</h4>
                <p class="text-sm text-slate-700">Join or create your own tech society at your university.</p>
                <p class="text-xs text-slate-500 mt-2">To add a society, contact: <a class="text-primary font-semibold hover:underline" href="mailto:mmiahhilal1@gmail.com">mmiahhilal1@gmail.com</a></p>
            </div>
        `;
    }

    setTextById('cv-title', 'CV Resources');
    setTextById('cv-description', 'Get feedback and improve your CV with the StudentStack Discord CV review group.');
    setTextById('cv-button', 'Get your CV reviewed');
    const cvButton = document.getElementById('cv-button');
    if (cvButton) {
        cvButton.onclick = () => {
            window.open('https://discord.gg/XhZzbQRV', '_blank', 'noopener');
        };
    }

    startTeamPostsListener();
}

function getItemTimestamp(value) {
    if (!value) return 0;
    if (typeof value?.toDate === 'function') {
        return value.toDate().getTime();
    }

    const parsed = new Date(value).getTime();
    if (!Number.isNaN(parsed)) {
        return parsed;
    }

    return 0;
}

function normalizeNotificationTimestampMap(raw) {
    const map = raw && typeof raw === 'object' ? raw : {};
    const legacyJobs = getItemTimestamp(map.jobs);

    const internships = getItemTimestamp(map.internships) || legacyJobs;
    const placements = getItemTimestamp(map.placements) || legacyJobs;
    const graduate = getItemTimestamp(map.graduate) || legacyJobs;
    const springWeeks = getItemTimestamp(map.springWeeks) || legacyJobs;

    return {
        internships,
        placements,
        graduate,
        springWeeks,
        hackathons: getItemTimestamp(map.hackathons),
        events: getItemTimestamp(map.events),
        grants: getItemTimestamp(map.grants),
        bursaries: getItemTimestamp(map.bursaries),
        scholarships: getItemTimestamp(map.scholarships),
        community: getItemTimestamp(map.community)
    };
}

function normalizeNotificationDismissedMap(raw) {
    const map = raw && typeof raw === 'object' ? raw : {};

    const normalizeType = (type) => Array.isArray(map[type])
        ? map[type].map((item) => String(item))
        : [];

    return {
        internships: normalizeType('internships'),
        placements: normalizeType('placements'),
        graduate: normalizeType('graduate'),
        springWeeks: normalizeType('springWeeks'),
        hackathons: normalizeType('hackathons'),
        events: normalizeType('events'),
        grants: normalizeType('grants'),
        bursaries: normalizeType('bursaries'),
        scholarships: normalizeType('scholarships'),
        community: normalizeType('community')
    };
}

function cloneDismissedByTypeMap(map) {
    return {
        internships: [...(map.internships || [])],
        placements: [...(map.placements || [])],
        graduate: [...(map.graduate || [])],
        springWeeks: [...(map.springWeeks || [])],
        hackathons: [...(map.hackathons || [])],
        events: [...(map.events || [])],
        grants: [...(map.grants || [])],
        bursaries: [...(map.bursaries || [])],
        scholarships: [...(map.scholarships || [])],
        community: [...(map.community || [])]
    };
}

function storeNotificationUndoSnapshot() {
    lastNotificationClearSnapshot = cloneDismissedByTypeMap(notificationDismissedByType);
    document.getElementById('notifications-undo-btn')?.classList.remove('hidden');
}

function updateNotificationUndoButtonVisibility() {
    const button = document.getElementById('notifications-undo-btn');
    if (!button) return;
    button.classList.toggle('hidden', !lastNotificationClearSnapshot);
}

function createNotificationItemId(item) {
    return `${item.type}|${item.url || ''}|${item.title || ''}|${item.timestamp || 0}`;
}

function getUnreadItemsForType(type) {
    const items = notificationSummary[type] || [];
    const lastViewed = notificationLastViewedByType[type] || 0;
    const dismissedSet = new Set(notificationDismissedByType[type] || []);

    return items.filter((item) => item.timestamp > lastViewed && !dismissedSet.has(item.id));
}

function getUserNotificationPrefs() {
    const prefs = currentUniversityUserProfile?.notificationPreferences || {};
    return {
        internships: prefs.internships !== false,
        placements: prefs.placements !== false,
        graduate: prefs.graduate !== false,
        springWeeks: prefs.springWeeks !== false,
        hackathons: prefs.hackathons !== false,
        events: prefs.events !== false,
        grants: prefs.grants !== false,
        bursaries: prefs.bursaries !== false,
        scholarships: prefs.scholarships !== false,
        community: true
    };
}

function startUserNotificationsListener(userId) {
    if (unsubscribeUserNotifications) {
        unsubscribeUserNotifications();
        unsubscribeUserNotifications = null;
    }

    if (!userId) {
        communityNotifications = [];
        refreshNotificationsUi();
        return;
    }

    const notificationsQuery = query(
        collection(db, 'userNotifications'),
        where('userId', '==', userId),
        limit(100)
    );

    unsubscribeUserNotifications = onSnapshot(notificationsQuery, (snapshot) => {
        communityNotifications = snapshot.docs
            .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
            .sort((a, b) => getItemTimestamp(b.createdAt) - getItemTimestamp(a.createdAt));
        refreshNotificationsUi();
    }, () => {
        communityNotifications = [];
        refreshNotificationsUi();
    });
}

async function loadNotificationDatasets() {
    if (!notificationJobs.length) {
        try {
            const jobsResponse = await fetch('data/jobs_latest.json');
            if (jobsResponse.ok) {
                const jobs = await jobsResponse.json();
                if (Array.isArray(jobs)) {
                    notificationJobs = jobs;
                }
            }
        } catch {
            notificationJobs = [];
        }
    }

    if (!notificationHackathons.length) {
        try {
            const hackathonsResponse = await fetch('data/hackathons_latest.json');
            if (hackathonsResponse.ok) {
                const hackathons = await hackathonsResponse.json();
                if (Array.isArray(hackathons)) {
                    notificationHackathons = hackathons;
                    return;
                }
            }
        } catch {
        }

        try {
            const fallbackResponse = await fetch('data/recent_hackathons.json');
            if (fallbackResponse.ok) {
                const fallbackHackathons = await fallbackResponse.json();
                if (Array.isArray(fallbackHackathons)) {
                    notificationHackathons = fallbackHackathons;
                }
            }
        } catch {
            notificationHackathons = [];
        }
    }
}

function buildNotificationSummaryByType() {
    const internshipsItems = notificationJobs
        .filter((job) => job.category === 'summer-internships')
        .map((job) => ({
        type: 'internships',
        title: job.programme || job.title || 'Job opportunity',
        url: job.url || '#',
        timestamp: getItemTimestamp(job.opening_date || job.scraped_date || job.createdAt || job.created_at)
    }));

    const placementsItems = notificationJobs
        .filter((job) => job.category === 'industrial-placements')
        .map((job) => ({
        type: 'placements',
        title: job.programme || job.title || 'Placement opportunity',
        url: job.url || '#',
        timestamp: getItemTimestamp(job.opening_date || job.scraped_date || job.createdAt || job.created_at)
    }));

    const graduateItems = notificationJobs
        .filter((job) => job.category === 'graduate-programmes')
        .map((job) => ({
        type: 'graduate',
        title: job.programme || job.title || 'Graduate opportunity',
        url: job.url || '#',
        timestamp: getItemTimestamp(job.opening_date || job.scraped_date || job.createdAt || job.created_at)
    }));

    const springWeeksItems = notificationJobs
        .filter((job) => job.category === 'spring-weeks')
        .map((job) => ({
        type: 'springWeeks',
        title: job.programme || job.title || 'Spring week opportunity',
        url: job.url || '#',
        timestamp: getItemTimestamp(job.opening_date || job.scraped_date || job.createdAt || job.created_at)
    }));

    const hackathonItems = notificationHackathons.map((eventItem) => ({
        type: 'hackathons',
        title: eventItem.name || eventItem.title || 'Hackathon',
        url: eventItem.url || '#',
        timestamp: getItemTimestamp(eventItem.date || eventItem.start_date || eventItem.scraped_date || eventItem.createdAt)
    }));

    const eventItems = notificationHackathons.map((eventItem) => ({
        type: 'events',
        title: eventItem.name || eventItem.title || 'Event',
        url: eventItem.url || '#',
        timestamp: getItemTimestamp(eventItem.date || eventItem.start_date || eventItem.scraped_date || eventItem.createdAt)
    }));

    const grantItems = allGrantItems
        .filter((item) => classifyGrantType(item) === 'grants')
        .map((item) => ({
            type: 'grants',
            title: item.name || 'Grant opportunity',
            url: item.url || '#',
            timestamp: getItemTimestamp(item.scraped_date || item.createdAt)
        }));

    const bursaryItems = allGrantItems
        .filter((item) => classifyGrantType(item) === 'bursaries')
        .map((item) => ({
            type: 'bursaries',
            title: item.name || 'Bursary opportunity',
            url: item.url || '#',
            timestamp: getItemTimestamp(item.scraped_date || item.createdAt)
        }));

    const scholarshipItems = allGrantItems
        .filter((item) => classifyGrantType(item) === 'scholarships')
        .map((item) => ({
            type: 'scholarships',
            title: item.name || 'Scholarship opportunity',
            url: item.url || '#',
            timestamp: getItemTimestamp(item.scraped_date || item.createdAt)
        }));

    const communityItems = communityNotifications.map((item) => ({
        type: 'community',
        title: item.title || item.message || 'New comment on your upload',
        url: item.url || 'index.html#community',
        timestamp: getItemTimestamp(item.createdAt)
    }));

    notificationSummary = {
        internships: internshipsItems,
        placements: placementsItems,
        graduate: graduateItems,
        springWeeks: springWeeksItems,
        hackathons: hackathonItems,
        events: eventItems,
        grants: grantItems,
        bursaries: bursaryItems,
        scholarships: scholarshipItems,
        community: communityItems
    };

    Object.keys(notificationSummary).forEach((type) => {
        notificationSummary[type] = notificationSummary[type].map((item) => ({
            ...item,
            id: createNotificationItemId(item)
        }));
    });
}

function getUnreadCountForType(type) {
    return getUnreadItemsForType(type).length;
}

function renderNotificationsSummaryModal(prefs) {
    const summaryList = document.getElementById('notifications-summary-list');
    if (!summaryList) return;

    const labels = {
        internships: 'Internships',
        placements: 'Placements',
        graduate: 'Graduate',
        springWeeks: 'Spring Weeks',
        hackathons: 'Hackathons',
        events: 'Events',
        grants: 'Grants',
        bursaries: 'Bursaries',
        scholarships: 'Scholarships',
        community: 'Comments'
    };

    const activeTypes = Object.keys(labels).filter((type) => prefs[type]);
    const rows = activeTypes.map((type) => {
        const count = getUnreadCountForType(type);
        const markReadButton = count > 0
            ? `<button class="text-xs text-primary font-semibold hover:underline mark-read-btn" data-notification-type="${type}" type="button">✓ Mark read</button>`
            : '<span class="text-xs text-slate-400">Up to date</span>';

        return `
            <div class="flex items-center justify-between border border-slate-200 rounded-lg px-3 py-2">
                <span class="text-sm text-slate-700">${labels[type]}</span>
                <div class="flex items-center gap-3">
                    <span class="text-xs font-bold px-2 py-1 rounded ${count > 0 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'}">${count} new</span>
                    ${markReadButton}
                </div>
            </div>
        `;
    });

    summaryList.innerHTML = rows.length ? rows.join('') : '<div class="text-slate-400">No active notification preferences.</div>';
}

async function persistLastViewedTimestamps() {
    if (!currentUniversityUser) return;

    const nowIso = new Date().toISOString();
    const prefs = getUserNotificationPrefs();
    const nextMap = { ...notificationLastViewedByType };

    Object.keys(nextMap).forEach((type) => {
        if (prefs[type]) {
            nextMap[type] = getItemTimestamp(nowIso);
        }
    });

    notificationLastViewedByType = nextMap;

    try {
        await updateDoc(doc(db, 'users', currentUniversityUser.uid), {
            notificationMeta: {
                lastViewedByType: {
                    internships: nowIso,
                    placements: nowIso,
                    graduate: nowIso,
                    springWeeks: nowIso,
                    hackathons: nowIso,
                    events: nowIso,
                    grants: nowIso,
                    bursaries: nowIso,
                    scholarships: nowIso,
                    community: nowIso
                },
                lastCheckedAt: nowIso
            }
        });
    } catch {
    }
}

async function persistDismissedNotifications() {
    if (!currentUniversityUser) return;

    try {
        await updateDoc(doc(db, 'users', currentUniversityUser.uid), {
            'notificationMeta.dismissedByType': notificationDismissedByType,
            'notificationMeta.lastCheckedAt': new Date().toISOString()
        });
    } catch {
    }
}

async function refreshNotificationsUi() {
    const bellButton = document.getElementById('nav-notifications-btn');
    const badge = document.getElementById('notification-badge');

    if (!bellButton || !badge) return;

    if (!currentUniversityUser || !currentUniversityUserProfile) {
        bellButton.classList.add('hidden');
        bellButton.classList.remove('flex');
        badge.classList.add('hidden');
        return;
    }

    await loadNotificationDatasets();
    buildNotificationSummaryByType();

    const prefs = getUserNotificationPrefs();
    const totalUnread = ['internships', 'placements', 'graduate', 'springWeeks', 'hackathons', 'events', 'grants', 'bursaries', 'scholarships', 'community']
        .filter((type) => prefs[type])
        .reduce((sum, type) => sum + getUnreadCountForType(type), 0);

    bellButton.classList.remove('hidden');
    bellButton.classList.add('flex');
    badge.textContent = String(totalUnread);
    badge.classList.toggle('hidden', totalUnread <= 0);
    badge.classList.toggle('inline-flex', totalUnread > 0);

    renderNotificationsSummaryModal(prefs);
    updateNotificationUndoButtonVisibility();
}

function openNotificationsModal() {
    document.getElementById('notifications-modal')?.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
}

function closeNotificationsModal() {
    document.getElementById('notifications-modal')?.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
}

function renderNotificationResults() {
    const list = document.getElementById('notifications-summary-list');
    if (!list) return;

    const prefs = getUserNotificationPrefs();
    const labels = {
        internships: 'Internships',
        placements: 'Placements',
        graduate: 'Graduate',
        springWeeks: 'Spring Weeks',
        hackathons: 'Hackathons',
        events: 'Events',
        grants: 'Grants',
        bursaries: 'Bursaries',
        scholarships: 'Scholarships',
        community: 'Comments'
    };

    const rows = Object.keys(labels)
        .filter((type) => prefs[type])
        .map((type) => {
            const topItems = getUnreadItemsForType(type)
                .sort((a, b) => b.timestamp - a.timestamp)
                .slice(0, 8);

            if (!topItems.length) {
                return `<div class="border border-slate-200 rounded-lg p-3"><p class="text-sm font-semibold text-slate-700 mb-1">${labels[type]}</p><p class="text-sm text-slate-500">No new opportunities.</p></div>`;
            }

            return `
                <div class="border border-slate-200 rounded-lg p-3">
                    <p class="text-sm font-semibold text-slate-700 mb-2">${labels[type]}</p>
                    <ul class="space-y-1">
                        ${topItems.map((item) => `
                            <li class="flex items-start justify-between gap-2">
                                <a class="text-sm text-primary hover:underline" href="${escapeSiteText(item.url || '#')}" target="_blank" rel="noopener">${escapeSiteText(item.title)}</a>
                                <button class="text-xs text-slate-400 hover:text-red-600 mark-item-read-btn" data-notification-type="${type}" data-notification-id="${escapeSiteText(item.id)}" type="button">✕</button>
                            </li>
                        `).join('')}
                    </ul>
                </div>
            `;
        });

    list.innerHTML = rows.join('');
}

async function markNotificationTypeAsRead(type) {
    if (!currentUniversityUser || !type) return;

    storeNotificationUndoSnapshot();

    const unreadItems = getUnreadItemsForType(type);
    const current = new Set(notificationDismissedByType[type] || []);
    unreadItems.forEach((item) => current.add(item.id));
    notificationDismissedByType[type] = Array.from(current);

    await persistDismissedNotifications();

    await refreshNotificationsUi();
    renderNotificationResults();
}

async function markNotificationItemAsRead(type, itemId) {
    if (!currentUniversityUser || !type || !itemId) return;

    storeNotificationUndoSnapshot();

    const current = new Set(notificationDismissedByType[type] || []);
    current.add(String(itemId));
    notificationDismissedByType[type] = Array.from(current);

    await persistDismissedNotifications();

    await refreshNotificationsUi();
    renderNotificationResults();
}

async function markAllNotificationsAsRead() {
    if (!currentUniversityUser) return;

    storeNotificationUndoSnapshot();

    Object.keys(notificationSummary).forEach((type) => {
        const unreadItems = getUnreadItemsForType(type);
        const current = new Set(notificationDismissedByType[type] || []);
        unreadItems.forEach((item) => current.add(item.id));
        notificationDismissedByType[type] = Array.from(current);
    });

    await persistDismissedNotifications();
    await refreshNotificationsUi();
    renderNotificationResults();
}

async function undoLastNotificationClear() {
    if (!currentUniversityUser || !lastNotificationClearSnapshot) return;

    notificationDismissedByType = cloneDismissedByTypeMap(lastNotificationClearSnapshot);
    lastNotificationClearSnapshot = null;

    await persistDismissedNotifications();
    await refreshNotificationsUi();
    renderNotificationResults();
}

function bindNotificationPhase6Events() {
    document.getElementById('nav-notifications-btn')?.addEventListener('click', async () => {
        if (!currentUniversityUser) {
            alert('Sign in/Log in for notifications');
            document.getElementById('auth-modal')?.classList.remove('hidden');
            return;
        }

        await refreshNotificationsUi();
        renderNotificationResults();
        openNotificationsModal();
    });

    document.getElementById('notifications-close-btn')?.addEventListener('click', closeNotificationsModal);
    document.getElementById('notifications-backdrop')?.addEventListener('click', closeNotificationsModal);
    document.getElementById('notifications-mark-all-btn')?.addEventListener('click', markAllNotificationsAsRead);
    document.getElementById('notifications-undo-btn')?.addEventListener('click', undoLastNotificationClear);

    document.getElementById('notifications-summary-list')?.addEventListener('click', async (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;

        const itemButton = target.closest('.mark-item-read-btn');
        if (itemButton) {
            const type = itemButton.getAttribute('data-notification-type');
            const itemId = itemButton.getAttribute('data-notification-id');
            if (!type || !itemId) return;
            await markNotificationItemAsRead(type, itemId);
            return;
        }

        const button = target.closest('.mark-read-btn');
        if (!button) return;
        const type = button.getAttribute('data-notification-type');
        if (!type) return;
        await markNotificationTypeAsRead(type);
    });
}

function renderSiteContentError() {
    const ids = [
        'universities-tabs',
        'universities-modules-container',
        'grants-filters',
        'grants-table-body',
        'grants-load-more-container',
        'grants-resources-container',
        'community-groups-container',
        'team-posts-container'
    ];

    ids.forEach((id) => {
        const node = document.getElementById(id);
        if (node) {
            node.innerHTML = '<div class="text-slate-400 py-2">Unable to load content.</div>';
        }
    });
}

async function loadSiteContent() {
    setTextById('copyright-year', new Date().getFullYear());

    try {
        const response = await fetch('data/site_content.json');
        if (!response.ok) {
            throw new Error('Failed to load site content');
        }

        const content = await response.json();

        if (content.stats) {
            if (typeof content.stats.top_universities !== 'undefined') {
                setTextById('top-universities-count', content.stats.top_universities);
            }
            if (typeof content.stats.active_students !== 'undefined') {
                setTextById('active-students-count', content.stats.active_students);
            }
        }

        if (content.universities) {
            renderUniversities(content.universities);
        }

        if (content.grants) {
            renderGrants(content.grants, content.universities?.list || []);
        }

        if (content.community) {
            renderCommunity(content.community);
        }

        bindExpandableText(document.getElementById('universities-modules-container'));
        bindExpandableText(document.getElementById('team-posts-container'));
    } catch (error) {
        console.error('Error loading site content:', error);
        renderSiteContentError();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    bindUniversityPhase3Events();
    bindCommunityPhase4Events();
    bindNotificationPhase6Events();
    initUniversityAuthState();
    loadSiteContent();
});
