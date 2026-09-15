(function () {
    const currentPage = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
    const publicPages = new Set([
        'welcome.html',
        'signin.html',
        'signup.html',
        'resetpassword.html'
    ]);

    if (publicPages.has(currentPage)) return;

    try {
        const token = localStorage.getItem('token');
        const user = JSON.parse(localStorage.getItem('user') || 'null');
        if (!(token && user && user.userID)) {
            window.location.replace('welcome.html');
        }
    } catch (err) {
        window.location.replace('welcome.html');
    }
})();
