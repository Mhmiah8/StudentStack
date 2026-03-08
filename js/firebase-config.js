import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js';
import { getAnalytics, isSupported } from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-analytics.js';

const firebaseConfig = {
    apiKey: 'AIzaSyCXmLZw8BBOm2qb1wi0XiN1V-Tmi3pbqE4',
    authDomain: 'studentstack-6742a.firebaseapp.com',
    projectId: 'studentstack-6742a',
    storageBucket: 'studentstack-6742a.firebasestorage.app',
    messagingSenderId: '1053877108342',
    appId: '1:1053877108342:web:c4ff091d9f0a1bba3fa957',
    measurementId: 'G-8NVXS43JEZ'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let analytics = null;

isSupported()
    .then((supported) => {
        if (supported) {
            analytics = getAnalytics(app);
        }
    })
    .catch(() => {
        analytics = null;
    });

export { app, auth, db, analytics, firebaseConfig };