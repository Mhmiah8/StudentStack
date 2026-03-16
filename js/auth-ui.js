import {
    createUserWithEmailAndPassword,
    GoogleAuthProvider,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signInWithPopup,
    signOut,
    updateProfile
} from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js';
import {
    doc,
    updateDoc
} from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js';
import { auth, db } from './firebase-config.js';
import { getOrCreateUserProfile } from './user-session.js';

function $(id) {
    return document.getElementById(id);
}

function setAuthError(message) {
    const node = $('auth-error');
    if (!node) return;
    if (!message) {
        node.classList.add('hidden');
        node.textContent = '';
        return;
    }
    node.textContent = message;
    node.classList.remove('hidden');
}

function mapAuthError(errorCode) {
    const messages = {
        'auth/invalid-email': 'Please enter a valid email address.',
        'auth/user-disabled': 'This account has been disabled. Contact support.',
        'auth/user-not-found': 'No account found with this email.',
        'auth/wrong-password': 'Incorrect password. Please try again.',
        'auth/invalid-credential': 'Invalid email or password.',
        'auth/email-already-in-use': 'An account with this email already exists.',
        'auth/weak-password': 'Password should be at least 6 characters long.',
        'auth/popup-closed-by-user': 'Google sign-in was closed before finishing.',
        'auth/cancelled-popup-request': 'Google sign-in was cancelled. Please try again.',
        'auth/network-request-failed': 'Network error. Check your connection and try again.'
    };
    return messages[errorCode] || 'Something went wrong. Please try again.';
}

function openAuthModal(mode = 'login') {
    const modal = $('auth-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    switchAuthTab(mode);
    setAuthError('');
}

function closeAuthModal() {
    const modal = $('auth-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
    setAuthError('');
}

function switchAuthTab(mode) {
    const isLogin = mode === 'login';
    const loginTab = $('auth-tab-login');
    const signupTab = $('auth-tab-signup');
    const loginFields = $('login-fields');
    const signupFields = $('signup-fields');
    const submit = $('auth-submit-btn');
    const title = $('auth-modal-title');

    if (!loginTab || !signupTab || !loginFields || !signupFields || !submit || !title) return;

    loginTab.className = isLogin
        ? 'px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold'
        : 'px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-semibold';
    signupTab.className = !isLogin
        ? 'px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold'
        : 'px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-semibold';

    loginFields.classList.toggle('hidden', !isLogin);
    signupFields.classList.toggle('hidden', isLogin);
    submit.textContent = isLogin ? 'Log in' : 'Create account';
    submit.dataset.mode = isLogin ? 'login' : 'signup';
    title.textContent = isLogin ? 'Log in to StudentStack' : 'Create your StudentStack account';
}

async function handleAuthSubmit(event) {
    event.preventDefault();
    setAuthError('');

    const submit = $('auth-submit-btn');
    if (!submit) return;

    const mode = submit.dataset.mode || 'login';
    const email = $('auth-email')?.value?.trim() || '';
    const password = $('auth-password')?.value || '';

    if (!email || !password) {
        setAuthError('Please fill in email and password.');
        return;
    }

    submit.disabled = true;
    submit.classList.add('opacity-60', 'cursor-not-allowed');

    try {
        if (mode === 'signup') {
            const displayName = $('auth-display-name')?.value?.trim() || 'Student';
            const university = $('auth-university')?.value?.trim() || '';
            const yearOfStudy = $('auth-year')?.value?.trim() || '';

            const result = await createUserWithEmailAndPassword(auth, email, password);
            await updateProfile(result.user, { displayName });
            await getOrCreateUserProfile(result.user);

            const userRef = doc(db, 'users', result.user.uid);
            await updateDoc(userRef, {
                displayName,
                university,
                yearOfStudy,
                email: result.user.email || email
            });
        } else {
            const result = await signInWithEmailAndPassword(auth, email, password);
            await getOrCreateUserProfile(result.user);
        }

        closeAuthModal();
    } catch (error) {
        setAuthError(mapAuthError(error.code));
    } finally {
        submit.disabled = false;
        submit.classList.remove('opacity-60', 'cursor-not-allowed');
    }
}

async function handleGoogleSignIn() {
    setAuthError('');
    const googleBtn = $('auth-google-btn');
    if (!googleBtn) return;

    googleBtn.disabled = true;
    googleBtn.classList.add('opacity-60', 'cursor-not-allowed');

    try {
        const provider = new GoogleAuthProvider();
        const result = await signInWithPopup(auth, provider);
        await getOrCreateUserProfile(result.user);
        closeAuthModal();
    } catch (error) {
        setAuthError(mapAuthError(error.code));
    } finally {
        googleBtn.disabled = false;
        googleBtn.classList.remove('opacity-60', 'cursor-not-allowed');
    }
}

function applyRoleUi(role) {
    document.body.dataset.userRole = role || 'guest';
}

function updateNavbarLoggedOut() {
    const guestNav = $('guest-nav');
    const userNav = $('user-nav');
    if (guestNav) guestNav.classList.remove('hidden');
    if (userNav) userNav.classList.add('hidden');
    $('mod-dashboard-link')?.classList.add('hidden');
    $('admin-dashboard-link')?.classList.add('hidden');
    applyRoleUi('guest');
}

function updateNavbarLoggedIn(profile) {
    const guestNav = $('guest-nav');
    const userNav = $('user-nav');
    const userDisplay = $('user-display');
    const userEmail = $('user-email');
    const userRole = $('user-role-badge');
    const userAvatar = $('user-avatar');
    const modDashboardLink = $('mod-dashboard-link');
    const adminDashboardLink = $('admin-dashboard-link');

    if (guestNav) guestNav.classList.add('hidden');
    if (userNav) userNav.classList.remove('hidden');

    if (userDisplay) {
        userDisplay.textContent = profile.displayName || profile.email || 'Student';
    }
    if (userEmail) {
        userEmail.textContent = profile.email || '';
    }
    if (userAvatar) {
        userAvatar.textContent = profile.avatarEmoji || '🙂';
    }
    if (userRole) {
        const role = profile.role || 'user';
        userRole.textContent = role.toUpperCase();
        userRole.className = role === 'admin'
            ? 'px-2 py-1 rounded text-xs font-bold bg-red-100 text-red-700'
            : role === 'mod'
                ? 'px-2 py-1 rounded text-xs font-bold bg-amber-100 text-amber-700'
                : 'px-2 py-1 rounded text-xs font-bold bg-blue-100 text-blue-700';
    }

    if (modDashboardLink) {
        const role = String(profile.role || '').toLowerCase();
        const isModOrAdmin = role === 'mod' || role === 'admin';
        modDashboardLink.classList.toggle('hidden', !isModOrAdmin);
    }

    if (adminDashboardLink) {
        const role = String(profile.role || '').toLowerCase();
        adminDashboardLink.classList.toggle('hidden', role !== 'admin');
    }

    applyRoleUi(profile.role || 'user');
}

function toggleUserDropdown() {
    const dropdown = $('user-dropdown');
    if (!dropdown) return;
    dropdown.classList.toggle('hidden');
}

function setMobileMenuState(isOpen) {
    const mobileMenu = $('mobile-nav-menu');
    const menuButton = $('mobile-menu-btn');
    if (!mobileMenu || !menuButton) return;

    mobileMenu.classList.toggle('hidden', !isOpen);
    menuButton.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
}

function toggleMobileMenu() {
    const mobileMenu = $('mobile-nav-menu');
    if (!mobileMenu) return;
    const isOpen = mobileMenu.classList.contains('hidden');
    setMobileMenuState(isOpen);
}

function closeMobileMenuIfOutside(event) {
    const mobileMenu = $('mobile-nav-menu');
    const menuButton = $('mobile-menu-btn');
    if (!mobileMenu || !menuButton || mobileMenu.classList.contains('hidden')) return;

    if (!mobileMenu.contains(event.target) && !menuButton.contains(event.target)) {
        setMobileMenuState(false);
    }
}

function closeDropdownIfOutside(event) {
    closeMobileMenuIfOutside(event);

    const dropdown = $('user-dropdown');
    const menuBtn = $('user-menu-btn');
    if (!dropdown || !menuBtn) return;
    if (dropdown.classList.contains('hidden')) return;

    if (!dropdown.contains(event.target) && !menuBtn.contains(event.target)) {
        dropdown.classList.add('hidden');
    }
}

function bindAuthUiEvents() {
    $('open-login-btn')?.addEventListener('click', () => openAuthModal('login'));
    $('open-signup-btn')?.addEventListener('click', () => openAuthModal('signup'));
    $('auth-close-btn')?.addEventListener('click', closeAuthModal);
    $('auth-backdrop')?.addEventListener('click', closeAuthModal);

    $('auth-tab-login')?.addEventListener('click', () => switchAuthTab('login'));
    $('auth-tab-signup')?.addEventListener('click', () => switchAuthTab('signup'));

    $('auth-form')?.addEventListener('submit', handleAuthSubmit);
    $('auth-google-btn')?.addEventListener('click', handleGoogleSignIn);

    $('user-menu-btn')?.addEventListener('click', toggleUserDropdown);
    $('mobile-menu-btn')?.addEventListener('click', toggleMobileMenu);

    document.querySelectorAll('#mobile-nav-menu a').forEach(link => {
        link.addEventListener('click', () => setMobileMenuState(false));
    });

    $('signout-btn')?.addEventListener('click', async () => {
        await signOut(auth);
    });

    document.addEventListener('click', closeDropdownIfOutside);
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closeAuthModal();
            $('user-dropdown')?.classList.add('hidden');
            setMobileMenuState(false);
        }
    });
}

async function initializeAuthStateListener() {
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            updateNavbarLoggedOut();
            return;
        }

        try {
            const profile = await getOrCreateUserProfile(user);

            if (profile.isBanned) {
                await signOut(auth);
                setAuthError('Your account has been restricted. Contact support for help.');
                openAuthModal('login');
                return;
            }

            updateNavbarLoggedIn(profile);
            $('user-dropdown')?.classList.add('hidden');
        } catch {
            updateNavbarLoggedOut();
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    bindAuthUiEvents();
    initializeAuthStateListener();
});