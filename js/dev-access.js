(function () {
    // Server access checks and the shared session replace the old browser-only gate.
    window.ProQSession?.ready.then(user => {
        const page = location.pathname.split('/').pop();
        if (!user && !['welcome.html', 'signin.html', 'contact.html', 'microsoft-auth-complete.html'].includes(page)) {
            location.replace('/signin.html?redirect=' + encodeURIComponent(location.pathname + location.search));
        }
    });
})();
