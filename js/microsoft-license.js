/* ===== MICROSOFT LICENSE SHOPPING ===== */
/* Live Westcon Microsoft Licenses Report integration only. */

let microsoftLicenseCatalog = [];
let microsoftLicenseFilter = 'all';
let microsoftLicenseSearch = '';

document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('microsoftLicenseSection')) return;

    initMicrosoftLicenseControls();
    loadMicrosoftLicenses();
});

function initMicrosoftLicenseControls() {
    const searchInput = document.getElementById('microsoftLicenseSearch');
    const filterButton = document.getElementById('microsoftLicenseFilter');
    const filterMenu = document.getElementById('microsoftLicenseFilterMenu');
    const filterLabel = document.getElementById('microsoftLicenseFilterLabel');

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            microsoftLicenseSearch = searchInput.value.trim().toLowerCase();
            renderMicrosoftLicenses();
        });
    }

    if (filterButton && filterMenu) {
        filterButton.addEventListener('click', (event) => {
            event.stopPropagation();
            filterMenu.classList.toggle('show');
        });

        filterMenu.querySelectorAll('.dropdown-option').forEach(option => {
            option.addEventListener('click', () => {
                microsoftLicenseFilter = option.dataset.value || 'all';
                if (filterLabel) filterLabel.textContent = option.textContent;
                filterMenu.classList.remove('show');
                renderMicrosoftLicenses();
            });
        });

        document.addEventListener('click', () => filterMenu.classList.remove('show'));
    }
}

async function loadMicrosoftLicenses() {
    const grid = document.getElementById('microsoftLicenseGrid');
    const sourcePill = document.getElementById('microsoftLicenseSource');

    if (grid) {
        grid.innerHTML = `
            <div class="loading-state">
                <p>Loading live Microsoft licenses...</p>
            </div>
        `;
    }

    try {
        const response = await fetch('/api/v1/microsoft/licenses?offset=0&max=100');
        const payload = await response.json();

        if (!response.ok || payload.status !== 'success') {
            throw new Error(payload.message || 'Microsoft license API unavailable');
        }

        microsoftLicenseCatalog = Array.isArray(payload.data?.licenses) ? payload.data.licenses : [];

        if (sourcePill) {
            sourcePill.textContent = `Live Westcon report${payload.data?.totalCount ? ` (${payload.data.totalCount})` : ''}`;
        }
    } catch (error) {
        console.error('[Microsoft Licenses] Live catalog failed:', error);
        microsoftLicenseCatalog = [];
        if (sourcePill) sourcePill.textContent = 'Live connection failed';
        renderMicrosoftLicenseError(error.message);
        return;
    }

    renderMicrosoftLicenses();
}

function renderMicrosoftLicenseError(message) {
    const grid = document.getElementById('microsoftLicenseGrid');
    if (!grid) return;

    grid.innerHTML = `
        <div class="license-empty-state">
            <i class='bx bx-error-circle'></i>
            <h3>Live Microsoft licenses unavailable</h3>
            <p>${escapeHtml(message || 'Westcon did not return live Microsoft license data.')}</p>
        </div>
    `;
}

function renderMicrosoftLicenses() {
    const grid = document.getElementById('microsoftLicenseGrid');
    if (!grid) return;

    const filtered = microsoftLicenseCatalog.filter(license => {
        const categoryMatch = microsoftLicenseFilter === 'all' || license.category === microsoftLicenseFilter;
        const text = `${license.name || ''} ${license.description || ''} ${license.sku || ''} ${license.customerName || ''} ${(license.tags || []).join(' ')}`.toLowerCase();
        const searchMatch = !microsoftLicenseSearch || text.includes(microsoftLicenseSearch);
        return categoryMatch && searchMatch;
    });

    if (filtered.length === 0) {
        grid.innerHTML = `
            <div class="license-empty-state">
                <i class='bx bx-search'></i>
                <h3>No live Microsoft licenses found</h3>
                <p>The live Westcon report returned no records for this filter.</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = filtered.map(license => {
        const safeSku = escapeHtml(license.sku || license.id || license.name);
        const price = Number(license.price || license.unitPrice || 0);
        const tags = Array.isArray(license.tags) ? license.tags.slice(0, 3) : [];
        const canAddToCart = price > 0;

        return `
            <article class="microsoft-license-card" data-sku="${safeSku}">
                <div class="license-card-topline">
                    <div class="microsoft-mark"><i class='bx bxl-microsoft'></i></div>
                    <span>${escapeHtml(license.status || license.category || 'live')}</span>
                </div>
                <h3>${escapeHtml(license.name || 'Microsoft License')}</h3>
                <p>${escapeHtml(license.description || 'Live Microsoft license record from Westcon.')}</p>
                <div class="license-tags">
                    ${tags.map(tag => `<span>${escapeHtml(tag)}</span>`).join('')}
                </div>
                <div class="license-purchase-row">
                    <div>
                        ${price > 0 ? `<div class="license-price">R${price.toLocaleString()}</div>` : `<div class="license-price">Live report</div>`}
                        <small>${escapeHtml(license.billingTerm || 'Westcon Microsoft Licenses Report')}</small>
                    </div>
                    <label>
                        Seats
                        <input type="number" min="1" max="500" value="${Number(license.assigned || 1) || 1}" class="microsoft-seat-input" data-sku="${safeSku}" ${canAddToCart ? '' : 'disabled'}>
                    </label>
                </div>
                <button class="btn primary-btn microsoft-add-btn" data-sku="${safeSku}" ${canAddToCart ? '' : 'disabled'}>
                    <i class='bx ${canAddToCart ? 'bx-cart-add' : 'bx-lock-alt'}'></i> ${canAddToCart ? 'Add License' : 'Report Item'}
                </button>
            </article>
        `;
    }).join('');

    grid.querySelectorAll('.microsoft-add-btn:not([disabled])').forEach(button => {
        button.addEventListener('click', () => addMicrosoftLicenseToCart(button.dataset.sku));
    });
}

async function addMicrosoftLicenseToCart(sku) {
    const license = microsoftLicenseCatalog.find(item => String(item.sku || item.id || item.name) === String(sku));
    if (!license) return;

    const user = JSON.parse(localStorage.getItem('user'));
    const seatInput = document.querySelector(`.microsoft-seat-input[data-sku="${CSS.escape(String(sku))}"]`);
    const seats = Math.max(1, parseInt(seatInput?.value || '1', 10));
    const unitPrice = Number(license.price || license.unitPrice || 0);

    if (unitPrice <= 0) {
        alert('This live Microsoft report item does not include pricing, so it cannot be added to cart yet.');
        return;
    }

    const totalPrice = unitPrice * seats;

    const microsoftConfig = {
        provider: 'Microsoft',
        sku: license.sku || license.id || license.name,
        product_name: license.name || 'Microsoft License',
        product_description: `${license.name || 'Microsoft License'} | ${seats} Seat(s)`,
        category: license.category || 'license',
        billing_term: license.billingTerm || 'Live report',
        customer_name: license.customerName || null,
        customer_id: license.customerId || null,
        seats,
        unit_price: unitPrice,
        product_price: totalPrice,
        customer_email: user?.email || null,
        userId: user?.userID || null
    };

    const cartItem = {
        id: `ms-${microsoftConfig.sku}`,
        type: 'microsoft-license',
        cart_type: 'microsoft-license',
        product_name: microsoftConfig.product_name,
        description: microsoftConfig.product_description,
        quantity: 1,
        price: totalPrice,
        image_url: '/Images/Logos/Proq2.png',
        microsoft_config: microsoftConfig
    };

    const cart = JSON.parse(localStorage.getItem('cart')) || [];
    const existingIndex = cart.findIndex(item => item.type === 'microsoft-license' && item.microsoft_config?.sku === microsoftConfig.sku);

    if (existingIndex >= 0) {
        cart[existingIndex] = cartItem;
    } else {
        cart.push(cartItem);
    }

    localStorage.setItem('cart', JSON.stringify(cart));
    sessionStorage.setItem('microsoftLicenseConfig', JSON.stringify(microsoftConfig));

    if (user?.userID) {
        await syncMicrosoftLicenseCartItem(user.userID, cartItem);
    }

    updateMicrosoftLicenseCartBadge();
    alert('Microsoft license added to cart. Proceed to checkout to complete the purchase.');
    window.location.href = 'cart.html';
}

async function syncMicrosoftLicenseCartItem(userID, item) {
    try {
        await fetch('/api/v1/cart/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userID, items: [item] })
        });
    } catch (error) {
        console.error('[Microsoft Licenses] Cart sync failed:', error);
    }
}

function updateMicrosoftLicenseCartBadge() {
    const cart = JSON.parse(localStorage.getItem('cart')) || [];
    const cartBadge = document.getElementById('cart-count') || document.querySelector('.cart-badge');
    if (cartBadge) cartBadge.textContent = cart.length;
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
