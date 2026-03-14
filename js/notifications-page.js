import { signOut } from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js';
import { doc, updateDoc } from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js';
import { auth, db } from './firebase-config.js';
import { DEFAULT_NOTIFICATION_PREFS, getOrCreateUserProfile, waitForAuthenticatedUser } from './user-session.js';

function $(id) {
    return document.getElementById(id);
}

function setStatus(message, kind = 'info') {
    const node = $('notifications-status');
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
    $('notifications-shell')?.classList.add('hidden');
    $('auth-required')?.classList.remove('hidden');
}

function showNotificationsShell() {
    $('auth-required')?.classList.add('hidden');
    $('notifications-shell')?.classList.remove('hidden');
}

function setToggleValues(prefs) {
    const values = { ...DEFAULT_NOTIFICATION_PREFS, ...(prefs || {}) };
    $('pref-internships').checked = !!values.internships;
    $('pref-placements').checked = !!values.placements;
    $('pref-graduate').checked = !!values.graduate;
    $('pref-spring-weeks').checked = !!values.springWeeks;
    $('pref-hackathons').checked = !!values.hackathons;
    $('pref-grants').checked = !!values.grants;
    $('pref-events').checked = !!values.events;
    $('pref-bursaries').checked = !!values.bursaries;
    $('pref-scholarships').checked = !!values.scholarships;
}

function readToggleValues() {
    return {
        internships: !!$('pref-internships')?.checked,
        placements: !!$('pref-placements')?.checked,
        graduate: !!$('pref-graduate')?.checked,
        springWeeks: !!$('pref-spring-weeks')?.checked,
        hackathons: !!$('pref-hackathons')?.checked,
        grants: !!$('pref-grants')?.checked,
        events: !!$('pref-events')?.checked,
        bursaries: !!$('pref-bursaries')?.checked,
        scholarships: !!$('pref-scholarships')?.checked
    };
}

async function loadPreferences(user) {
    const profile = await getOrCreateUserProfile(user);

    if (profile.isBanned) {
        setStatus('Your account is currently banned. Contact support for access.', 'error');
        await signOut(auth);
        showAuthRequired();
        return;
    }

    $('notifications-email').textContent = profile.email || user.email || '';
    $('notifications-role').textContent = (profile.role || 'user').toUpperCase();
    setToggleValues(profile.notificationPreferences || DEFAULT_NOTIFICATION_PREFS);
    showNotificationsShell();
}

async function savePreferences(event) {
    event.preventDefault();
    const user = auth.currentUser;
    if (!user) {
        showAuthRequired();
        return;
    }

    const saveBtn = $('notifications-save-btn');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.classList.add('opacity-60', 'cursor-not-allowed');
    }

    try {
        await updateDoc(doc(db, 'users', user.uid), {
            notificationPreferences: readToggleValues()
        });
        setStatus('Notification preferences saved.', 'success');
    } catch {
        setStatus('Could not save your preferences. Please try again.', 'error');
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.classList.remove('opacity-60', 'cursor-not-allowed');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    $('notifications-form')?.addEventListener('submit', savePreferences);
    $('auth-required-login-btn')?.addEventListener('click', () => {
        window.location.href = 'index.html';
    });
    $('notifications-signout-btn')?.addEventListener('click', async () => {
        await signOut(auth);
        window.location.href = 'index.html';
    });

    waitForAuthenticatedUser(
        async (user) => {
            await loadPreferences(user);
        },
        () => {
            showAuthRequired();
        }
    );
});
