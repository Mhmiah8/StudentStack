import { signOut } from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js';
import { doc, getDoc, updateDoc } from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js';
import { auth, db } from './firebase-config.js';
import { getOrCreateUserProfile, waitForAuthenticatedUser } from './user-session.js';

function $(id) {
    return document.getElementById(id);
}

function setStatus(message, kind = 'info') {
    const node = $('profile-status');
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
    $('profile-shell')?.classList.add('hidden');
    $('auth-required')?.classList.remove('hidden');
}

function showProfileShell() {
    $('auth-required')?.classList.add('hidden');
    $('profile-shell')?.classList.remove('hidden');
}

function formatTimestamp(value) {
    if (!value) return '—';

    if (typeof value.toDate === 'function') {
        return value.toDate().toLocaleString('en-GB');
    }

    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
        return parsed.toLocaleString('en-GB');
    }

    return '—';
}

async function loadProfile(user) {
    const profile = await getOrCreateUserProfile(user);

    $('profile-email').value = profile.email || user.email || '';
    $('profile-avatar').value = profile.avatarEmoji || '🙂';
    $('profile-display-name').value = profile.displayName || '';
    $('profile-university').value = profile.university || '';
    $('profile-year').value = profile.yearOfStudy || '';
    $('profile-role').textContent = (profile.role || 'user').toUpperCase();
    $('profile-created').textContent = 'Loading...';
    $('profile-last-login').textContent = 'Loading...';

    const userDoc = await getDoc(doc(db, 'users', user.uid));
    const data = userDoc.data() || {};

    $('profile-created').textContent = formatTimestamp(data.createdAt);
    $('profile-last-login').textContent = formatTimestamp(data.lastLogin);

    if (profile.isBanned) {
        setStatus('Your account is currently banned. Contact support for access.', 'error');
        await signOut(auth);
        showAuthRequired();
        return;
    }

    showProfileShell();
}

async function saveProfile(event) {
    event.preventDefault();
    const user = auth.currentUser;
    if (!user) {
        showAuthRequired();
        return;
    }

    const displayName = $('profile-display-name')?.value?.trim() || 'Student';
    const avatarEmoji = $('profile-avatar')?.value?.trim() || '🙂';
    const university = $('profile-university')?.value?.trim() || '';
    const yearOfStudy = $('profile-year')?.value?.trim() || '';
    const saveBtn = $('profile-save-btn');

    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.classList.add('opacity-60', 'cursor-not-allowed');
    }

    try {
        await updateDoc(doc(db, 'users', user.uid), {
            displayName,
            avatarEmoji,
            university,
            yearOfStudy,
            email: user.email || ''
        });

        setStatus('Profile updated successfully.', 'success');
    } catch {
        setStatus('Unable to save your profile right now. Please try again.', 'error');
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.classList.remove('opacity-60', 'cursor-not-allowed');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    $('profile-form')?.addEventListener('submit', saveProfile);
    $('auth-required-login-btn')?.addEventListener('click', () => {
        window.location.href = 'code.html';
    });
    $('profile-signout-btn')?.addEventListener('click', async () => {
        await signOut(auth);
        window.location.href = 'code.html';
    });

    document.getElementById('profile-avatar-presets')?.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const button = target.closest('[data-emoji]');
        if (!button) return;
        const emoji = button.getAttribute('data-emoji') || '🙂';
        const input = $('profile-avatar');
        if (input) {
            input.value = emoji;
        }
    });

    waitForAuthenticatedUser(
        async (user) => {
            await loadProfile(user);
        },
        () => {
            showAuthRequired();
        }
    );
});
