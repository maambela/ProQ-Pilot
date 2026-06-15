document.addEventListener('DOMContentLoaded', () => {
    const user = JSON.parse(localStorage.getItem('user'));
    const headerActions = document.querySelector('.header-actions');
    const logoArea = document.querySelector('.logo-area');
    const isAdminPage = window.location.pathname.includes('admin_');

    initHeaderPreview();

    if (logoArea) {
        logoArea.setAttribute('role', 'link');
        logoArea.setAttribute('tabindex', '0');
        logoArea.setAttribute('aria-label', 'Go to ProQ Pilot home');
        logoArea.addEventListener('click', () => {
            window.location.href = 'index.html';
        });
        logoArea.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                window.location.href = 'index.html';
            }
        });
    }

    const hamburger = document.getElementById('hamburger');
    const navLinks = document.getElementById('nav-links');
    if (hamburger && navLinks && hamburger.dataset.menuBound !== 'true') {
        hamburger.dataset.menuBound = 'true';
        hamburger.setAttribute('aria-expanded', 'false');

        hamburger.addEventListener('click', () => {
            navLinks.classList.toggle('active');
            const isOpen = navLinks.classList.contains('active');
            hamburger.setAttribute('aria-expanded', String(isOpen));

            const spans = hamburger.querySelectorAll('span');
            if (spans.length >= 3) {
                spans[0].style.transform = isOpen ? 'rotate(-45deg) translate(-5px, 6px)' : 'none';
                spans[1].style.opacity = isOpen ? '0' : '1';
                spans[2].style.transform = isOpen ? 'rotate(45deg) translate(-5px, -6px)' : 'none';
            }
        });

        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                navLinks.classList.remove('active');
                hamburger.setAttribute('aria-expanded', 'false');
                const spans = hamburger.querySelectorAll('span');
                if (spans.length >= 3) {
                    spans[0].style.transform = 'none';
                    spans[1].style.opacity = '1';
                    spans[2].style.transform = 'none';
                }
            });
        });
    }

    if (user) {

        triggerCartSync(user.userID);

        if (headerActions) {
            const authWrapper = headerActions.querySelector('.auth-wrapper');
            headerActions.querySelectorAll('#logoutBtn, .user-name').forEach(el => el.remove());

            if (isAdminPage) {
                if (authWrapper) authWrapper.remove();

                const cart = headerActions.querySelector('.cart-wrapper');
                const logoutBtn = document.createElement('a');
                logoutBtn.id = 'logoutBtn';
                logoutBtn.href = '#';
                logoutBtn.className = 'admin-header-icon admin-logout';
                logoutBtn.setAttribute('aria-label', 'Sign out');
                logoutBtn.innerHTML = `<i class='bx bx-log-out'></i>`;

                const userName = document.createElement('span');
                userName.className = 'user-name admin-user-name';
                userName.textContent = `${user.firstName} ${user.lastName}`;

                if (cart) {
                    cart.parentNode.insertBefore(logoutBtn, cart.nextSibling);
                    logoutBtn.parentNode.insertBefore(userName, logoutBtn.nextSibling);
                } else {
                    headerActions.appendChild(logoutBtn);
                    headerActions.appendChild(userName);
                }
            } else {
                const userName = document.createElement('span');
                userName.className = 'user-name';
                userName.style.fontWeight = '100';
                userName.style.fontSize = '0.65rem';
                userName.style.marginLeft = '10px';
                userName.style.marginRight = '10px';
                userName.textContent = `${user.firstName} ${user.lastName}`;

                const logoutBtn = document.createElement('a');
                logoutBtn.id = 'logoutBtn';
                logoutBtn.href = '#';
                logoutBtn.className = 'auth-wrapper';
                logoutBtn.innerHTML = `<i class='bx bx-log-out'></i>`;

                const cart = headerActions.querySelector('.cart-wrapper');

                if (cart) {
                    cart.parentNode.insertBefore(logoutBtn, cart.nextSibling);
                    logoutBtn.parentNode.insertBefore(userName, logoutBtn.nextSibling);
                } else {
                    headerActions.appendChild(logoutBtn);
                    headerActions.appendChild(userName);
                }

                if (authWrapper) {
                    authWrapper.remove();
                }
            }
        }

        if (!isAdminPage && navLinks && !navLinks.querySelector('.mobile-nav-user')) {
            const mobileUserName = document.createElement('span');
            mobileUserName.className = 'mobile-nav-user';
            mobileUserName.textContent = `${user.firstName} ${user.lastName}`;
            navLinks.appendChild(mobileUserName);
        }

        if (!isAdminPage && navLinks && !navLinks.querySelector('.mobile-nav-signout')) {
            const mobileSignOut = document.createElement('a');
            mobileSignOut.href = '#';
            mobileSignOut.className = 'mobile-nav-signout';
            mobileSignOut.innerHTML = `<i class='bx bx-log-out'></i><span>Sign out</span>`;
            navLinks.appendChild(mobileSignOut);
        }

        const isAdmin = String(user.role || '').trim().toLowerCase() === 'admin';
        if (isAdminPage && !isAdmin) {
            window.location.href = 'index.html';
            return;
        }

        const logoutUser = (event) => {
            event?.preventDefault();
            if (confirm('Are you sure you want to logout?')) {
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                localStorage.removeItem('userID');
                localStorage.removeItem('cart');
                localStorage.removeItem('wishlist');
                window.location.href = 'index.html';
            }
        };

        // Logout functionality
        document.getElementById('logoutBtn')?.addEventListener('click', logoutUser);
        document.querySelector('.mobile-nav-signout')?.addEventListener('click', logoutUser);
    } else {
        // If no user but on admin page, redirect
        if (isAdminPage) {
            window.location.href = 'signin.html';
        }
    }
});

function initHeaderPreview() {
    const header = document.querySelector('.main-header');
    const headerContainer = document.querySelector('.header-container');
    const navLinks = document.getElementById('nav-links');
    if (!header || !headerContainer || !navLinks || header.dataset.previewBound === 'true') return;

    header.dataset.previewBound = 'true';

    const previewContent = {
        home: {
            kicker: 'Overview',
            title: 'Start procurement cleanly.',
            body: 'See featured devices, brand paths, and guided kits for new starters, hybrid teams, and secure business growth.',
            chips: ['Procurement kits', 'Featured laptops', 'Brands'],
            action: 'Open home',
            href: 'index.html',
            icon: 'bx bx-home'
        },
        store: {
            kicker: 'Live catalog',
            title: 'Shop the approved procurement list.',
            body: 'Browse filtered laptops, monitors, mice, keyboards, laptop bags, Microsoft licensing, and Cisco Duo security without the clutter.',
            chips: ['Laptops first', 'Licenses', 'Accessories'],
            action: 'Explore store',
            href: 'store.html',
            icon: 'bx bx-store'
        },
        orders: {
            kicker: 'Tracking',
            title: 'Follow every purchase from cart to delivery.',
            body: 'Check order history, payment status, procurement records, and delivery progress for each business purchase.',
            chips: ['Order status', 'Invoices', 'Delivery'],
            action: 'View orders',
            href: 'user-orders.html',
            icon: 'bx bx-receipt'
        },
        account: {
            kicker: 'Workspace',
            title: 'Manage buyer and company details.',
            body: 'Keep profile details, delivery information, saved activity, and account settings ready for faster procurement.',
            chips: ['Profile', 'Addresses', 'Saved details'],
            action: 'Open account',
            href: 'my-account.html',
            icon: 'bx bx-user-circle'
        },
        wishlist: {
            kicker: 'Shortlist',
            title: 'Keep products ready for review.',
            body: 'Save laptops and procurement add-ons before building the final cart or quote request.',
            chips: ['Saved picks', 'Review later', 'Compare'],
            action: 'Open wishlist',
            href: 'wishlist.html',
            icon: 'bx bx-heart'
        },
        adminDashboard: {
            kicker: 'Admin overview',
            title: 'Monitor store performance cleanly.',
            body: 'Review orders, revenue, customers, low-stock alerts, and admin activity from one control view.',
            chips: ['Sales', 'Orders', 'Low stock'],
            action: 'Open dashboard',
            href: 'admin_dashboard.html',
            icon: 'bx bx-bar-chart-alt-2'
        },
        adminManual: {
            kicker: 'Manual products',
            title: 'Create and maintain custom catalog items.',
            body: 'Add products, pricing, images, and procurement details for items managed outside the live supplier feeds.',
            chips: ['Manual stock', 'Images', 'Pricing'],
            action: 'Manage products',
            href: 'admin_products.html',
            icon: 'bx bx-edit-alt'
        },
        adminCore: {
            kicker: 'Supplier feed',
            title: 'Approve live API products before publishing.',
            body: 'Review Core API products, approve clean catalog items, and keep unwanted categories out of the storefront.',
            chips: ['API review', 'Approval', 'Catalog control'],
            action: 'Open Core products',
            href: 'admin_core_products.html',
            icon: 'bx bx-data'
        },
        default: {
            kicker: 'ProQ Pilot',
            title: 'Move through procurement with context.',
            body: 'Use this area to jump between catalog, orders, account tools, and buying support.',
            chips: ['Clean buying', 'Business-ready', 'Guided'],
            action: 'Open',
            href: 'index.html',
            icon: 'bx bx-grid-alt'
        }
    };

    const megaColumns = [
        {
            title: 'Procurement',
            links: [
                { label: 'Business laptops', hint: 'Approved HP, Dell, Lenovo, Acer, Microsoft, and Apple devices.', href: 'store.html?category=laptops', icon: 'bx bx-laptop' },
                { label: 'Monitors', hint: 'Work displays filtered away from laptop listings.', href: 'store.html?category=monitors', icon: 'bx bx-desktop' },
                { label: 'Accessories', hint: 'Mice, keyboards, and laptop bags only.', href: 'store.html?category=accessories', icon: 'bx bx-package' }
            ]
        },
        {
            title: 'Software & Security',
            links: [
                { label: 'Microsoft licensing', hint: 'Cloud productivity for users and teams.', href: 'store.html?category=licenses&brand=Microsoft', icon: 'bx bxl-microsoft' },
                { label: 'Cisco Duo MFA', hint: 'Protect user sign-ins and endpoint access.', href: 'store.html?category=licenses&brand=Duo', icon: 'bx bx-shield-quarter' },
                { label: 'Secure Business Kit', hint: 'Devices, identity, MFA, and licensing in one flow.', href: 'kit.html?type=secure', icon: 'bx bx-lock-alt' }
            ]
        },
        {
            title: 'Buying Flows',
            links: [
                { label: 'New Employee Kit', hint: 'A day-one setup for a new staff member.', href: 'kit.html?type=new-starter', icon: 'bx bx-user-plus' },
                { label: 'Remote Team Kit', hint: 'Hybrid-work hardware and licensing bundle.', href: 'kit.html?type=hybrid', icon: 'bx bx-wifi' },
                { label: 'Saved shortlist', hint: 'Review products before adding them to cart.', href: 'wishlist.html', icon: 'bx bx-heart' }
            ]
        }
    ];

    const panel = document.createElement('div');
    panel.className = 'nav-preview-panel';
    panel.setAttribute('aria-hidden', 'true');
    panel.innerHTML = `
        <div class="nav-preview-feature">
            <div class="nav-preview-icon"><i class='bx bx-grid-alt'></i></div>
            <div class="nav-preview-copy">
                <span class="nav-preview-kicker"></span>
                <strong></strong>
                <p></p>
                <div class="nav-preview-chips"></div>
                <a class="nav-preview-action" href="index.html">Open</a>
            </div>
        </div>
        <div class="nav-preview-mega">
            ${megaColumns.map(column => `
                <div class="nav-preview-column">
                    <h4>${column.title}</h4>
                    ${column.links.map(link => `
                        <a href="${link.href}">
                            <i class='${link.icon}'></i>
                            <span>
                                <strong>${link.label}</strong>
                                <small>${link.hint}</small>
                            </span>
                        </a>
                    `).join('')}
                </div>
            `).join('')}
        </div>
    `;
    headerContainer.appendChild(panel);

    const getPreviewKey = (link) => {
        const href = (link.getAttribute('href') || '').toLowerCase();
        const text = (link.textContent || '').toLowerCase();
        if (href.includes('store') || text.includes('store')) return 'store';
        if (href.includes('admin_dashboard') || text.includes('dashboard')) return 'adminDashboard';
        if (href.includes('admin_products') || text.includes('manual')) return 'adminManual';
        if (href.includes('admin_core') || text.includes('core')) return 'adminCore';
        if (href.includes('order') || text.includes('order')) return 'orders';
        if (href.includes('account') || text.includes('account')) return 'account';
        if (href.includes('wishlist') || text.includes('wishlist')) return 'wishlist';
        if (href.includes('index') || text.includes('home')) return 'home';
        return 'default';
    };

    const isDesktop = () => window.matchMedia('(min-width: 969px)').matches;
    let hideTimer = null;

    const renderPreview = (link) => {
        if (!isDesktop()) return;

        const content = previewContent[getPreviewKey(link)] || previewContent.default;
        const rect = link.getBoundingClientRect();
        const headerRect = header.getBoundingClientRect();
        const center = rect.left + (rect.width / 2) - headerRect.left;

        panel.style.setProperty('--preview-left', `${center}px`);
        panel.querySelector('.nav-preview-icon i').className = content.icon;
        panel.querySelector('.nav-preview-kicker').textContent = content.kicker;
        panel.querySelector('strong').textContent = content.title;
        panel.querySelector('p').textContent = content.body;
        panel.querySelector('.nav-preview-chips').innerHTML = content.chips.map((chip) => `<span>${chip}</span>`).join('');
        const action = panel.querySelector('.nav-preview-action');
        action.textContent = content.action;
        action.href = content.href || link.href;

        clearTimeout(hideTimer);
        navLinks.querySelectorAll('a').forEach(item => item.classList.remove('nav-preview-active'));
        link.classList.add('nav-preview-active');
        headerContainer.classList.add('nav-preview-open');
        panel.classList.add('visible');
        panel.setAttribute('aria-hidden', 'false');
    };

    const hidePreview = () => {
        hideTimer = window.setTimeout(() => {
            panel.classList.remove('visible');
            headerContainer.classList.remove('nav-preview-open');
            panel.setAttribute('aria-hidden', 'true');
            navLinks.querySelectorAll('a').forEach(item => item.classList.remove('nav-preview-active'));
        }, 120);
    };

    navLinks.querySelectorAll('a').forEach((link) => {
        if (link.classList.contains('mobile-nav-signout')) return;
        link.addEventListener('mouseenter', () => renderPreview(link));
        link.addEventListener('focus', () => renderPreview(link));
        link.addEventListener('mouseleave', hidePreview);
        link.addEventListener('blur', hidePreview);
    });

    panel.addEventListener('mouseenter', () => clearTimeout(hideTimer));
    panel.addEventListener('mouseleave', hidePreview);

    window.addEventListener('resize', () => {
        if (!isDesktop()) {
            panel.classList.remove('visible');
            headerContainer.classList.remove('nav-preview-open');
            panel.setAttribute('aria-hidden', 'true');
        }
    });
}

// Auth Overlay Helpers
function initAuthOverlay() {
    if (document.getElementById('authOverlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'authOverlay';
    overlay.className = 'loading-overlay';
    overlay.innerHTML = `
        <div class="loading-content" id="loadingContent">
            <div class="cube-wrapper">
                <div class="cube">
                    <div class="cube-face front"></div>
                    <div class="cube-face back"></div>
                    <div class="cube-face right"></div>
                    <div class="cube-face left"></div>
                    <div class="cube-face top"></div>
                    <div class="cube-face bottom"></div>
                </div>
            </div>
            <div class="loading-message" id="loadingMessage">Initializing...</div>
        </div>
        <div class="status-content" id="statusContent">
            <div class="status-icon-glow" id="statusIcon">✓</div>
            <div class="status-title" id="statusTitle">Success</div>
            <div class="status-text" id="statusText">Operation completed.</div>
        </div>
    `;
    document.body.appendChild(overlay);
}

// Call this after a successful login
async function triggerCartSync(userID) {
    const localCart = JSON.parse(localStorage.getItem('cart')) || [];
    if (localCart.length > 0) {
        await fetch('/api/v1/cart/sync', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ userID: userID, items: localCart })
        });
        localStorage.removeItem('cart'); // Clear guest data
    }
}

window.showLoading = (message) => {
    initAuthOverlay();
    const overlay = document.getElementById('authOverlay');
    const loadingContent = document.getElementById('loadingContent');
    const statusContent = document.getElementById('statusContent');
    const loadingMessage = document.getElementById('loadingMessage');

    loadingMessage.textContent = message;
    statusContent.classList.remove('active');
    loadingContent.style.display = 'flex';
    overlay.classList.add('active');
};

window.showStatus = (title, text, isSuccess = true) => {
    initAuthOverlay();
    const loadingContent = document.getElementById('loadingContent');
    const statusContent = document.getElementById('statusContent');
    const statusIcon = document.getElementById('statusIcon');
    const statusTitle = document.getElementById('statusTitle');
    const statusText = document.getElementById('statusText');

    statusTitle.textContent = title;
    statusText.textContent = text;
    statusIcon.textContent = isSuccess ? '✓' : '✕';
    statusIcon.style.background = isSuccess ? 'var(--accent-teal)' : '#ef4444';
    statusIcon.style.boxShadow = isSuccess ? '0 0 30px rgba(0, 210, 190, 0.4)' : '0 0 30px rgba(239, 68, 68, 0.4)';

    loadingContent.style.display = 'none';
    statusContent.classList.add('active');
};

window.hideOverlay = () => {
    const overlay = document.getElementById('authOverlay');
    if (overlay) overlay.classList.remove('active');
};
