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
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    updateDoc
} from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js';
import { auth, db } from './firebase-config.js';
import { getOrCreateUserProfile } from './user-session.js';

const postsPerPage = 12;
let allPosts = [];
let currentPage = 1;
let currentFilter = 'all';
let currentUser = null;
let currentUserProfile = null;
let activeReportPostId = '';
let activeRemovePostId = '';
let activeRemovePostTitle = '';
let activeCommentsPostId = '';
let activeCommentsPostTitle = '';
let unsubscribeComments = null;

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
    document.getElementById('expand-content-modal')?.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
}

function openCommentsModal(postId, postTitle) {
    if (!postId) return;

    activeCommentsPostId = postId;
    activeCommentsPostTitle = postTitle || 'Comments';

    const titleNode = document.getElementById('team-comments-post-title');
    if (titleNode) {
        titleNode.textContent = activeCommentsPostTitle;
    }

    document.getElementById('team-comments-form')?.reset();
    document.getElementById('team-comments-modal')?.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');

    const commentsList = document.getElementById('team-comments-list');
    if (commentsList) {
        commentsList.innerHTML = '<div class="text-slate-400">Loading comments...</div>';
    }

    if (unsubscribeComments) {
        unsubscribeComments();
        unsubscribeComments = null;
    }

    const commentsQuery = query(collection(db, 'teamPosts', postId, 'comments'), orderBy('createdAt', 'desc'));
    unsubscribeComments = onSnapshot(commentsQuery, (snapshot) => {
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
                    <p class="text-xs text-slate-500">${escapeSiteText(formatDate(comment.createdAt))}</p>
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

function closeCommentsModal() {
    activeCommentsPostId = '';
    activeCommentsPostTitle = '';

    if (unsubscribeComments) {
        unsubscribeComments();
        unsubscribeComments = null;
    }

    document.getElementById('team-comments-modal')?.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
}

async function submitComment(event) {
    event.preventDefault();

    if (!currentUser || !activeCommentsPostId) {
        alert('Please log in first to comment.');
        return;
    }

    const input = document.getElementById('team-comment-input');
    const content = input?.value?.trim() || '';
    if (!content) return;

    try {
        if (!currentUserProfile) {
            currentUserProfile = await getOrCreateUserProfile(currentUser);
        }

        await addDoc(collection(db, 'teamPosts', activeCommentsPostId, 'comments'), {
            userId: currentUser.uid,
            authorName: currentUserProfile?.displayName || currentUser.email || 'Student',
            authorEmoji: currentUserProfile?.avatarEmoji || '🙂',
            content,
            createdAt: serverTimestamp()
        });

        const postSnapshot = await getDoc(doc(db, 'teamPosts', activeCommentsPostId));
        const postData = postSnapshot.exists() ? postSnapshot.data() : null;
        const ownerUserId = postData?.userId || '';
        const postTitle = postData?.title || activeCommentsPostTitle || 'your post';

        if (ownerUserId && ownerUserId !== currentUser.uid) {
            await addDoc(collection(db, 'userNotifications'), {
                userId: ownerUserId,
                type: 'community',
                title: `New comment on ${postTitle}`,
                message: `${currentUserProfile?.displayName || 'Someone'} commented on your teammate post.`,
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

async function updateSingleReaction(documentId, reactionType) {
    if (!currentUser || !documentId || !reactionType) {
        alert('Please log in first to react.');
        return;
    }

    const ref = doc(db, 'teamPosts', documentId);
    try {
        const snapshot = await getDoc(ref);
        if (!snapshot.exists()) {
            return;
        }

        const payload = snapshot.data() || {};
        const userId = currentUser.uid;
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

            await updateDoc(ref, updates);
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

        await updateDoc(ref, updates);
    } catch {
    }
}

function escapeSiteText(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatDate(timestamp) {
    if (!timestamp) return 'Just now';
    if (typeof timestamp?.toDate === 'function') {
        return timestamp.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    const parsed = new Date(timestamp);
    if (Number.isNaN(parsed.getTime())) return 'Just now';
    return parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatType(type) {
    const labels = {
        hackathon: 'Hackathon',
        job: 'Job',
        project: 'Project',
        study: 'Study'
    };
    return labels[type] || 'Team';
}

function normalizeExternalUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';

    const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
        const url = new URL(candidate);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
        return url.toString();
    } catch {
        return '';
    }
}

function getTeamPostCta(post) {
    const type = String(post?.type || '').toLowerCase();
    const url = normalizeExternalUrl(post?.postUrl || post?.url || '');
    if (!url) return '';

    if (type === 'job') {
        return `<a href="${escapeSiteText(url)}" target="_blank" rel="noopener noreferrer" class="text-blue-700 hover:underline text-sm font-semibold">Quick Apply</a>`;
    }

    if (type === 'hackathon') {
        return `<a href="${escapeSiteText(url)}" target="_blank" rel="noopener noreferrer" class="text-blue-700 hover:underline text-sm font-semibold">Quick Register</a>`;
    }

    return `<a href="${escapeSiteText(url)}" target="_blank" rel="noopener noreferrer" class="text-blue-700 hover:underline text-sm font-semibold">Open Link</a>`;
}

function isModeratorOrAdmin(profile) {
    const role = String(profile?.role || '').toLowerCase();
    return role === 'mod' || role === 'admin';
}

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

function createTeamPostCard(post) {
    const lookingFor = Array.isArray(post.lookingFor) ? post.lookingFor : [];
    const reportCount = Number(post.reportCount || 0);
    const showRemove = isModeratorOrAdmin(currentUserProfile);
    const quickAction = getTeamPostCta(post);

    return `
        <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <div class="flex items-center gap-3 mb-3">
                <div class="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-sm">${escapeSiteText(post.authorEmoji || '🙂')}</div>
                <span class="font-bold text-sm text-slate-700">${escapeSiteText(post.authorName || 'Student')}</span>
                <span class="text-xs text-slate-400 ml-auto">${escapeSiteText(formatDate(post.createdAt))}</span>
                ${showRemove ? `<button class="text-red-600 hover:text-red-700 font-bold text-sm remove-team-post-mod-btn" data-post-id="${escapeSiteText(post.id)}" data-post-title="${escapeSiteText(post.title || 'Untitled post')}" type="button">✕</button>` : ''}
            </div>
            <div class="flex items-center justify-between mb-2 gap-3">
                <h4 class="font-bold text-slate-900">${escapeSiteText(post.title || 'Untitled post')}</h4>
                <span class="text-xs font-semibold px-2 py-1 rounded bg-blue-50 text-blue-800">${escapeSiteText(formatType(post.type))}</span>
            </div>
            <div class="expandable-block mb-3">
                <p class="text-sm text-slate-600 expandable-text">${escapeSiteText(post.description || '')}</p>
                <button class="hidden mt-2 text-xs text-blue-700 font-semibold hover:underline expand-toggle-btn" type="button">Show more</button>
            </div>
            <p class="text-xs text-slate-500 mb-3">Contact: ${escapeSiteText(post.contactInfo || 'Not provided')}</p>
            <div class="flex flex-wrap gap-2 mb-4">
                ${lookingFor.map((tag) => `<span class="text-xs bg-slate-100 px-2 py-1 rounded text-slate-600">${escapeSiteText(tag)}</span>`).join('')}
            </div>
            <div class="flex flex-wrap items-center justify-between gap-3">
                <span class="text-xs text-slate-400">${reportCount > 0 ? `${reportCount} reports` : 'No reports'}</span>
                <div class="flex flex-wrap items-center gap-3 justify-end ml-auto">
                    ${quickAction}
                    <button class="text-slate-600 hover:text-blue-700 text-sm font-semibold team-react-btn" data-post-id="${escapeSiteText(post.id)}" data-reaction="up" type="button">👍 <span>${Number(post.upvotes || 0)}</span></button>
                    <button class="text-slate-600 hover:text-blue-700 text-sm font-semibold team-react-btn" data-post-id="${escapeSiteText(post.id)}" data-reaction="down" type="button">👎 <span>${Number(post.downvotes || 0)}</span></button>
                    <button class="text-slate-600 hover:underline text-sm font-semibold view-team-comments-btn" data-post-id="${escapeSiteText(post.id)}" data-post-title="${escapeSiteText(post.title || 'Untitled post')}" type="button">View comments</button>
                    <button class="text-slate-600 hover:underline text-sm font-semibold expand-card-btn" data-expand-title="${escapeSiteText(post.title || 'Untitled post')}" data-expand-content="${escapeSiteText(post.description || '')}" type="button">Expand</button>
                    <button class="text-red-600 hover:underline text-sm font-semibold report-team-post-btn" data-post-id="${escapeSiteText(post.id)}" type="button">Report</button>
                </div>
            </div>
        </div>
    `;
}

function getFilteredPosts() {
    if (currentFilter === 'all') {
        return allPosts;
    }
    return allPosts.filter((post) => post.type === currentFilter);
}

function updatePagination(filteredPosts) {
    const totalPages = Math.max(1, Math.ceil(filteredPosts.length / postsPerPage));
    if (currentPage > totalPages) {
        currentPage = totalPages;
    }

    const prevButton = document.getElementById('team-posts-prev');
    const nextButton = document.getElementById('team-posts-next');
    const pageLabel = document.getElementById('team-posts-page-indicator');

    if (pageLabel) {
        pageLabel.textContent = `Page ${currentPage} of ${totalPages}`;
    }

    if (prevButton) {
        prevButton.disabled = currentPage <= 1;
        prevButton.classList.toggle('opacity-50', prevButton.disabled);
        prevButton.classList.toggle('cursor-not-allowed', prevButton.disabled);
    }

    if (nextButton) {
        nextButton.disabled = currentPage >= totalPages;
        nextButton.classList.toggle('opacity-50', nextButton.disabled);
        nextButton.classList.toggle('cursor-not-allowed', nextButton.disabled);
    }
}

function renderPosts() {
    const container = document.getElementById('team-posts-full-container');
    if (!container) return;

    const filteredPosts = getFilteredPosts();

    if (!filteredPosts.length) {
        container.innerHTML = '<div class="md:col-span-2 lg:col-span-3 text-slate-400">No posts found for this filter.</div>';
        updatePagination(filteredPosts);
        return;
    }

    const start = (currentPage - 1) * postsPerPage;
    const visible = filteredPosts.slice(start, start + postsPerPage);

    container.innerHTML = visible.map(createTeamPostCard).join('');
    bindExpandableText(container);
    updatePagination(filteredPosts);
}

function applyFilterUi() {
    document.querySelectorAll('[data-filter]').forEach((button) => {
        const selected = button.getAttribute('data-filter') === currentFilter;
        button.className = selected
            ? 'px-4 py-2 rounded-full text-sm font-semibold bg-blue-700 text-white'
            : 'px-4 py-2 rounded-full text-sm font-semibold bg-white border border-slate-200 text-slate-700';
    });
}

function openReportModal(postId) {
    if (!currentUser) {
        alert('Please log in on the homepage first to report posts.');
        return;
    }

    activeReportPostId = postId;
    document.getElementById('report-team-post-form')?.reset();
    document.getElementById('report-team-post-modal')?.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
}

function closeReportModal() {
    activeReportPostId = '';
    document.getElementById('report-team-post-modal')?.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
}

function openRemoveModal(postId, title) {
    if (!currentUser || !isModeratorOrAdmin(currentUserProfile)) {
        return;
    }

    activeRemovePostId = postId;
    activeRemovePostTitle = title || 'Untitled post';
    document.getElementById('remove-content-form')?.reset();
    document.getElementById('remove-content-modal')?.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
}

function closeRemoveModal() {
    activeRemovePostId = '';
    activeRemovePostTitle = '';
    document.getElementById('remove-content-modal')?.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
}

async function submitReport(event) {
    event.preventDefault();
    if (!currentUser || !activeReportPostId) return;

    const reason = document.getElementById('report-team-post-reason')?.value || '';
    const details = document.getElementById('report-team-post-details')?.value?.trim() || '';
    if (!reason) return;

    try {
        await updateDoc(doc(db, 'teamPosts', activeReportPostId), {
            reports: arrayUnion({
                userId: currentUser.uid,
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

async function submitRemove(event) {
    event.preventDefault();
    if (!currentUser || !activeRemovePostId || !isModeratorOrAdmin(currentUserProfile)) {
        closeRemoveModal();
        return;
    }

    const reason = document.getElementById('remove-content-reason')?.value || '';
    const details = document.getElementById('remove-content-details')?.value?.trim() || '';
    if (!reason) return;

    try {
        await deleteDoc(doc(db, 'teamPosts', activeRemovePostId));
        await addDoc(collection(db, 'moderationLogs'), {
            moderatorId: currentUser.uid,
            moderatorEmail: currentUser.email || '',
            action: 'delete',
            contentType: 'post',
            contentId: activeRemovePostId,
            title: activeRemovePostTitle,
            reason,
            details,
            createdAt: serverTimestamp()
        });
    } catch {
    }

    closeRemoveModal();
}

async function reactToPost(postId, reactionType) {
    if (!postId || !reactionType) return;
    await updateSingleReaction(postId, reactionType);
}

function bindEvents() {
    document.getElementById('team-post-filters')?.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;

        const button = target.closest('[data-filter]');
        if (!button) return;

        currentFilter = button.getAttribute('data-filter') || 'all';
        currentPage = 1;
        applyFilterUi();
        renderPosts();
    });

    document.getElementById('team-posts-prev')?.addEventListener('click', () => {
        if (currentPage <= 1) return;
        currentPage -= 1;
        renderPosts();
    });

    document.getElementById('team-posts-next')?.addEventListener('click', () => {
        const filtered = getFilteredPosts();
        const totalPages = Math.max(1, Math.ceil(filtered.length / postsPerPage));
        if (currentPage >= totalPages) return;
        currentPage += 1;
        renderPosts();
    });

    document.getElementById('team-posts-full-container')?.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;

        const reactButton = target.closest('.team-react-btn');
        if (reactButton) {
            const postId = reactButton.getAttribute('data-post-id');
            const reaction = reactButton.getAttribute('data-reaction');
            if (postId && reaction) {
                reactToPost(postId, reaction);
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

        const commentsButton = target.closest('.view-team-comments-btn');
        if (commentsButton) {
            const postId = commentsButton.getAttribute('data-post-id');
            const postTitle = commentsButton.getAttribute('data-post-title') || 'Comments';
            if (postId) {
                openCommentsModal(postId, postTitle);
            }
            return;
        }

        const reportButton = target.closest('.report-team-post-btn');
        if (reportButton) {
            const postId = reportButton.getAttribute('data-post-id');
            if (postId) {
                openReportModal(postId);
            }
            return;
        }

        const removeButton = target.closest('.remove-team-post-mod-btn');
        if (removeButton) {
            const postId = removeButton.getAttribute('data-post-id');
            const title = removeButton.getAttribute('data-post-title') || 'Untitled post';
            if (postId) {
                openRemoveModal(postId, title);
            }
        }
    });

    document.getElementById('report-team-post-close-btn')?.addEventListener('click', closeReportModal);
    document.getElementById('report-team-post-cancel-btn')?.addEventListener('click', closeReportModal);
    document.getElementById('report-team-post-backdrop')?.addEventListener('click', closeReportModal);
    document.getElementById('report-team-post-form')?.addEventListener('submit', submitReport);

    document.getElementById('remove-content-close-btn')?.addEventListener('click', closeRemoveModal);
    document.getElementById('remove-content-cancel-btn')?.addEventListener('click', closeRemoveModal);
    document.getElementById('remove-content-backdrop')?.addEventListener('click', closeRemoveModal);
    document.getElementById('remove-content-form')?.addEventListener('submit', submitRemove);

    document.getElementById('expand-content-close-btn')?.addEventListener('click', closeExpandedContent);
    document.getElementById('expand-content-close-secondary')?.addEventListener('click', closeExpandedContent);
    document.getElementById('expand-content-backdrop')?.addEventListener('click', closeExpandedContent);

    document.getElementById('team-comments-close-btn')?.addEventListener('click', closeCommentsModal);
    document.getElementById('team-comments-backdrop')?.addEventListener('click', closeCommentsModal);
    document.getElementById('team-comments-form')?.addEventListener('submit', submitComment);
}

function startPostsListener() {
    const postsQuery = query(collection(db, 'teamPosts'), orderBy('createdAt', 'desc'));
    onSnapshot(postsQuery, (snapshot) => {
        allPosts = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
        renderPosts();
    }, () => {
        allPosts = [];
        renderPosts();
    });
}

function initAuthState() {
    onAuthStateChanged(auth, async (user) => {
        currentUser = user || null;
        currentUserProfile = null;

        if (user) {
            try {
                currentUserProfile = await getOrCreateUserProfile(user);
            } catch {
                currentUserProfile = null;
            }
        }

        renderPosts();
    });
}

document.addEventListener('DOMContentLoaded', () => {
    bindEvents();
    applyFilterUi();
    initAuthState();
    startPostsListener();
});
