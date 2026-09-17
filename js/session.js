(function () {
    'use strict';
    if (window.ProQSession) return;
    const nativeFetch = window.fetch.bind(window);
    const page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    const publicPages = new Set(['welcome.html', 'signin.html', 'microsoft-auth-complete.html', 'contact.html', 'signup.html', 'resetpassword.html', 'verify-email.html']);
    const tabId = Array.from(crypto.getRandomValues(new Uint8Array(24)), byte => byte.toString(16).padStart(2, '0')).join('');
    let user = null;
    let heartbeatTimer;
    let refreshing;
    let leaving = false;

    function cachedUser() {
        try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch (_) { return null; }
    }
    function save(nextUser) {
        const previous = cachedUser();
        if (previous && Number(previous.userID) !== Number(nextUser.userID)) {
            localStorage.removeItem('cart'); localStorage.removeItem('wishlist');
        }
        user = nextUser;
        localStorage.setItem('user', JSON.stringify(user));
        localStorage.setItem('userID', String(user.userID));
        // Compatibility flag for existing display code. This is never an authentication credential.
        localStorage.setItem('token', 'cookie-session');
        window.dispatchEvent(new CustomEvent('proq:session', { detail: user }));
    }
    function clear() {
        user = null;
        clearInterval(heartbeatTimer);
        ['token', 'authToken', 'user', 'userID', 'cart', 'wishlist'].forEach(key => localStorage.removeItem(key));
        sessionStorage.removeItem('isLoggedIn');
        window.dispatchEvent(new CustomEvent('proq:session', { detail: null }));
    }
    function expire(reason = 'session_expired') {
        clear();
        if (!publicPages.has(page) && !leaving) {
            leaving = true;
            location.replace(`/signin.html?error=${reason}&redirect=${encodeURIComponent(location.pathname + location.search)}`);
        }
    }
    async function responseUser(response) {
        if (response.status === 401 || response.status === 403) {
            expire(response.status === 403 ? 'access_disabled' : 'session_expired');
            return null;
        }
        if (!response.ok) throw new Error('Unable to verify your session. Please try again.');
        const body = await response.json();
        if (!body.data?.user?.userID) throw new Error('Invalid session response.');
        return body.data.user;
    }
    async function heartbeat() {
        const response = await nativeFetch('/api/auth/session/heartbeat', {
            method: 'POST', credentials: 'same-origin', cache: 'no-store',
            headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tabId })
        });
        const current = await responseUser(response);
        if (current) save(current);
        return current;
    }
    async function refresh() {
        if (refreshing) return refreshing;
        refreshing = (async () => {
            const response = await nativeFetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' });
            const current = await responseUser(response);
            if (!current) return null;
            const live = await heartbeat();
            if (live && !heartbeatTimer) heartbeatTimer = setInterval(() => {
                if (!leaving) heartbeat().catch(() => {});
            }, 30000);
            return live;
        })();
        try { return await refreshing; } finally { refreshing = null; }
    }
    async function logout() {
        const response = await nativeFetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        if (!response.ok) throw new Error('Sign out failed. Please try again.');
        clear();
        leaving = true;
        location.replace('/signin.html');
    }

    window.ProQSession = { refresh, logout, get user() { return user; } };
    window.ProQSession.ready = refresh().catch(() => {
        // No browser snapshot can grant access when the server cannot validate a session.
        clear();
        if (!publicPages.has(page)) {
            leaving = true;
            location.replace('/signin.html?error=failed');
        }
        return null;
    });

    window.fetch = async function (input, options) {
        let url;
        try { url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.href); }
        catch (_) { return nativeFetch(input, options); }
        const protectedAPI = url.origin === location.origin && url.pathname.startsWith('/api/v1/');
        if (protectedAPI) await window.ProQSession.ready;
        const response = await nativeFetch(input, options);
        if (protectedAPI && response.status === 401) expire();
        if (protectedAPI && response.status === 403) {
            const body = await response.clone().json().catch(() => ({}));
            if (body.code === 'access_disabled') expire('access_disabled');
        }
        return response;
    };
    window.addEventListener('pagehide', () => {
        leaving = true;
        if (user) navigator.sendBeacon('/api/auth/session/close', new URLSearchParams({ tabId }));
    });
    window.addEventListener('pageshow', event => {
        leaving = false;
        if (event.persisted) refresh().catch(() => {});
    });
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && user) refresh().catch(() => {});
    });
    window.addEventListener('storage', event => {
        if (event.key === 'user' && !event.newValue) expire();
        else if (event.key === 'user' && event.newValue && user) {
            const changed = cachedUser();
            if (changed && Number(changed.userID) !== Number(user.userID)) location.reload();
        }
    });
})();
