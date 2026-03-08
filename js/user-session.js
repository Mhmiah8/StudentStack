import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js';
import {
    doc,
    getDoc,
    serverTimestamp,
    setDoc,
    updateDoc
} from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js';
import { auth, db } from './firebase-config.js';

export const DEFAULT_NOTIFICATION_PREFS = {
    internships: true,
    placements: true,
    graduate: true,
    springWeeks: true,
    hackathons: true,
    grants: true,
    events: true,
    bursaries: true,
    scholarships: true
};

const OWNER_ADMIN_EMAILS = new Set(['mmiahhilal1@gmail.com']);

function sanitizeString(value, fallback = '') {
    return typeof value === 'string' ? value : fallback;
}

function normalizePreferences(prefs) {
    const incoming = prefs && typeof prefs === 'object' ? prefs : {};
    return {
        internships: typeof incoming.internships === 'boolean' ? incoming.internships : (typeof incoming.jobs === 'boolean' ? incoming.jobs : DEFAULT_NOTIFICATION_PREFS.internships),
        placements: typeof incoming.placements === 'boolean' ? incoming.placements : (typeof incoming.jobs === 'boolean' ? incoming.jobs : DEFAULT_NOTIFICATION_PREFS.placements),
        graduate: typeof incoming.graduate === 'boolean' ? incoming.graduate : (typeof incoming.jobs === 'boolean' ? incoming.jobs : DEFAULT_NOTIFICATION_PREFS.graduate),
        springWeeks: typeof incoming.springWeeks === 'boolean' ? incoming.springWeeks : (typeof incoming.jobs === 'boolean' ? incoming.jobs : DEFAULT_NOTIFICATION_PREFS.springWeeks),
        hackathons: typeof incoming.hackathons === 'boolean' ? incoming.hackathons : DEFAULT_NOTIFICATION_PREFS.hackathons,
        grants: typeof incoming.grants === 'boolean' ? incoming.grants : DEFAULT_NOTIFICATION_PREFS.grants,
        events: typeof incoming.events === 'boolean' ? incoming.events : DEFAULT_NOTIFICATION_PREFS.events,
        bursaries: typeof incoming.bursaries === 'boolean' ? incoming.bursaries : DEFAULT_NOTIFICATION_PREFS.bursaries,
        scholarships: typeof incoming.scholarships === 'boolean' ? incoming.scholarships : DEFAULT_NOTIFICATION_PREFS.scholarships
    };
}

export async function getOrCreateUserProfile(user) {
    const userRef = doc(db, 'users', user.uid);
    const snapshot = await getDoc(userRef);

    if (!snapshot.exists()) {
        const createdProfile = {
            email: user.email || '',
            displayName: user.displayName || 'Student',
            avatarEmoji: '🙂',
            university: '',
            yearOfStudy: '',
            role: 'user',
            createdAt: serverTimestamp(),
            lastLogin: serverTimestamp(),
            isBanned: false,
            notificationPreferences: DEFAULT_NOTIFICATION_PREFS,
            notificationMeta: {
                lastViewedByType: {
                    internships: null,
                    placements: null,
                    graduate: null,
                    springWeeks: null,
                    hackathons: null,
                    grants: null,
                    events: null,
                    bursaries: null,
                    scholarships: null
                },
                dismissedByType: {
                    internships: [],
                    placements: [],
                    graduate: [],
                    springWeeks: [],
                    hackathons: [],
                    grants: [],
                    events: [],
                    bursaries: [],
                    scholarships: []
                },
                lastCheckedAt: null
            }
        };

        await setDoc(userRef, createdProfile);

        return {
            email: user.email || '',
            displayName: user.displayName || 'Student',
            avatarEmoji: '🙂',
            university: '',
            yearOfStudy: '',
            role: 'user',
            isBanned: false,
            notificationPreferences: { ...DEFAULT_NOTIFICATION_PREFS },
            notificationMeta: {
                lastViewedByType: {
                    internships: null,
                    placements: null,
                    graduate: null,
                    springWeeks: null,
                    hackathons: null,
                    grants: null,
                    events: null,
                    bursaries: null,
                    scholarships: null
                },
                dismissedByType: {
                    internships: [],
                    placements: [],
                    graduate: [],
                    springWeeks: [],
                    hackathons: [],
                    grants: [],
                    events: [],
                    bursaries: [],
                    scholarships: []
                },
                lastCheckedAt: null
            }
        };
    }

    const data = snapshot.data();
    const normalized = {
        email: sanitizeString(data.email, user.email || ''),
        displayName: sanitizeString(data.displayName, user.displayName || 'Student'),
        avatarEmoji: sanitizeString(data.avatarEmoji, '🙂'),
        university: sanitizeString(data.university, ''),
        yearOfStudy: sanitizeString(data.yearOfStudy, ''),
        role: sanitizeString(data.role, 'user'),
        isBanned: !!data.isBanned,
        notificationPreferences: normalizePreferences(data.notificationPreferences),
        notificationMeta: data.notificationMeta && typeof data.notificationMeta === 'object'
            ? data.notificationMeta
            : {
                lastViewedByType: {
                    internships: null,
                    placements: null,
                    graduate: null,
                    springWeeks: null,
                    hackathons: null,
                    grants: null,
                    events: null,
                    bursaries: null,
                    scholarships: null
                },
                dismissedByType: {
                    internships: [],
                    placements: [],
                    graduate: [],
                    springWeeks: [],
                    hackathons: [],
                    grants: [],
                    events: [],
                    bursaries: [],
                    scholarships: []
                },
                lastCheckedAt: null
            }
    };

    if (OWNER_ADMIN_EMAILS.has(String(user.email || '').toLowerCase())) {
        normalized.role = 'admin';
    }

    await updateDoc(userRef, {
        email: user.email || normalized.email,
        displayName: normalized.displayName,
        avatarEmoji: normalized.avatarEmoji,
        university: normalized.university,
        yearOfStudy: normalized.yearOfStudy,
        role: normalized.role,
        isBanned: normalized.isBanned,
        notificationPreferences: normalized.notificationPreferences,
        notificationMeta: normalized.notificationMeta,
        lastLogin: serverTimestamp()
    });

    return normalized;
}

export function waitForAuthenticatedUser(onReady, onLoggedOut) {
    return onAuthStateChanged(auth, (user) => {
        if (user) {
            onReady(user);
            return;
        }

        if (typeof onLoggedOut === 'function') {
            onLoggedOut();
        }
    });
}
