const KIT_BRANDS = [
    { name: 'HP', logo: 'Images/HP.png' },
    { name: 'Dell', logo: 'Images/DellLaptops.PNG' },
    { name: 'Apple', logo: 'Images/Apple.png' },
    { name: 'Microsoft', logo: 'Images/Microsoft.png' },
    { name: 'Acer', logo: 'Images/AcerStick.png' },
    { name: 'Lenovo', logo: 'Images/lenovo.PNG' }
];

const KIT_TYPES = {
    'new-starter': {
        eyebrow: 'New Starter',
        title: 'New Employee Kit',
        intro: 'A day-one setup with one business laptop, Microsoft 365, Duo MFA, and the essentials a new employee needs.',
        packLabel: 'Starter',
        packRole: 'New employee',
        workStyle: 'Office-ready',
        securityLevel: 'Standard security',
        icon: 'bx-user-plus',
        defaultBrand: 'HP',
        seats: 1,
        microsoftTerms: ['business premium', 'business standard', 'microsoft 365'],
        duoTerms: ['essentials', 'advantage'],
        accessories: [
            { key: 'bag', label: 'Laptop bag', terms: ['bag', 'topload', 'case', 'sleeve'] },
            { key: 'mouse', label: 'Wireless mouse', terms: ['mouse', 'bluetooth silent mouse', 'wireless mouse'] }
        ]
    },
    hybrid: {
        eyebrow: 'Hybrid Work',
        title: 'Remote Team Kit',
        intro: 'A portable team setup with a business laptop, collaboration licensing, MFA, and desk-ready accessories.',
        packLabel: 'Remote',
        packRole: 'Hybrid employee',
        workStyle: 'Anywhere work',
        securityLevel: 'MFA protected',
        icon: 'bx-wifi',
        defaultBrand: 'Lenovo',
        seats: 5,
        microsoftTerms: ['teams', 'business standard', 'business premium', 'microsoft 365'],
        duoTerms: ['advantage', 'essentials'],
        accessories: [
            { key: 'dock', label: 'Docking station', terms: ['dock', 'docking', 'thunderbolt'] },
            { key: 'webcam', label: 'Webcam', terms: ['webcam', 'camera', 'c270'] },
            { key: 'monitor', label: 'Monitor', terms: ['monitor', 'display'] }
        ]
    },
    secure: {
        eyebrow: 'Secure Growth',
        title: 'Secure Business Kit',
        intro: 'A security-first procurement setup with a stronger endpoint, cloud productivity, and Duo protection.',
        packLabel: 'Secure',
        packRole: 'Security-led rollout',
        workStyle: 'Managed endpoint',
        securityLevel: 'High security',
        icon: 'bx-shield-quarter',
        defaultBrand: 'Dell',
        seats: 10,
        microsoftTerms: ['business premium', 'enterprise', 'microsoft 365'],
        duoTerms: ['premier', 'advantage', 'essentials'],
        accessories: [
            { key: 'dock', label: 'Secure desk dock', terms: ['dock', 'docking', 'thunderbolt'] },
            { key: 'monitor', label: 'Office monitor', terms: ['monitor', 'display'] }
        ]
    },
    'power-user': {
        eyebrow: 'Power User',
        title: 'Power User Pack',
        intro: 'A performance-focused setup with a stronger laptop, desk hardware, Microsoft 365, and Duo sign-in protection.',
        packLabel: 'Power User',
        packRole: 'Analyst or creator',
        workStyle: 'Desk plus mobile',
        securityLevel: 'MFA protected',
        icon: 'bx-chip',
        defaultBrand: 'HP',
        seats: 3,
        microsoftTerms: ['business premium', 'enterprise', 'teams', 'microsoft 365'],
        duoTerms: ['advantage', 'premier', 'essentials'],
        accessories: [
            { key: 'dock', label: 'Docking station', terms: ['dock', 'docking', 'thunderbolt'] },
            { key: 'monitor', label: 'Monitor', terms: ['monitor', 'display'] },
            { key: 'mouse', label: 'Wireless mouse', terms: ['mouse', 'bluetooth silent mouse', 'wireless mouse'] }
        ]
    },
    executive: {
        eyebrow: 'Executive',
        title: 'Executive Pack',
        intro: 'A premium employee setup with portable hardware, productivity licensing, Duo MFA, and polished carry gear.',
        packLabel: 'Executive',
        packRole: 'Leadership user',
        workStyle: 'Premium portable',
        securityLevel: 'High security',
        icon: 'bx-briefcase-alt-2',
        defaultBrand: 'Microsoft',
        seats: 1,
        microsoftTerms: ['business premium', 'enterprise', 'microsoft 365'],
        duoTerms: ['premier', 'advantage', 'essentials'],
        accessories: [
            { key: 'bag', label: 'Premium carry gear', terms: ['sleeve', 'bag', 'topload', 'case'] },
            { key: 'mouse', label: 'Wireless mouse', terms: ['mouse', 'bluetooth silent mouse', 'wireless mouse'] },
            { key: 'dock', label: 'Desk dock', terms: ['dock', 'docking', 'thunderbolt'] }
        ]
    }
};

const kitState = {
    type: 'new-starter',
    config: KIT_TYPES['new-starter'],
    products: [],
    licenses: [],
    laptopsByBrand: new Map(),
    selectedBrand: 'HP',
    selectedLaptopId: null,
    selectedAccessories: [],
    selectedDuo: null,
    selectedMicrosoft: null,
    seats: 1,
    enabled: {
        laptop: true,
        duo: true,
        microsoft: true,
        accessories: {}
    }
};

document.addEventListener('DOMContentLoaded', () => {
    initKitBuilder();
});

async function initKitBuilder() {
    const params = new URLSearchParams(window.location.search);
    const requestedType = params.get('type');
    kitState.type = KIT_TYPES[requestedType] ? requestedType : 'new-starter';
    kitState.config = KIT_TYPES[kitState.type];
    kitState.selectedBrand = kitState.config.defaultBrand;
    kitState.seats = kitState.config.seats;

    renderKitHeader();
    renderPackOptions();
    renderBrandButtons();
    bindKitEvents();
    updateCartBadge();

    try {
        const [products, licenses] = await Promise.all([
            fetchStoreProducts(),
            fetchMicrosoftLicenses()
        ]);

        kitState.products = products;
        kitState.licenses = licenses;
        hydrateKitSelections();
        renderKit();
    } catch (error) {
        console.error('[Kit Builder] Unable to load kit data:', error);
        renderKitError('Unable to load the kit builder. Please refresh and try again.');
    }
}

function renderKitHeader() {
    setText('kitEyebrow', kitState.config.eyebrow);
    setText('kitTitle', kitState.config.title);
    setText('kitIntro', kitState.config.intro);
    setText('kitPackCount', `${kitState.seats} employee${kitState.seats === 1 ? '' : 's'}`);

    const seatInput = document.getElementById('kitSeatInput');
    if (seatInput) seatInput.value = String(kitState.seats);
}

function renderPackOptions() {
    const grid = document.getElementById('kitPackGrid');
    if (!grid) return;

    grid.innerHTML = Object.entries(KIT_TYPES).map(([key, pack]) => `
        <button class="kit-pack-card ${key === kitState.type ? 'active' : ''}" type="button" data-kit-type="${escapeHtml(key)}" aria-pressed="${key === kitState.type ? 'true' : 'false'}">
            <span class="kit-pack-icon"><i class='bx ${escapeHtml(pack.icon)}'></i></span>
            <span class="kit-pack-copy">
                <strong>${escapeHtml(pack.packLabel)}</strong>
                <small>${escapeHtml(pack.packRole)}</small>
            </span>
            <span class="kit-pack-meta">${escapeHtml(pack.securityLevel)}</span>
        </button>
    `).join('');

    grid.querySelectorAll('[data-kit-type]').forEach(button => {
        button.addEventListener('click', () => applyKitType(button.dataset.kitType));
    });
}

function bindKitEvents() {
    const seatInput = document.getElementById('kitSeatInput');
    const modelSelect = document.getElementById('kitModelSelect');
    const addButton = document.getElementById('kitAddToCart');

    if (seatInput) {
        seatInput.addEventListener('input', () => {
            kitState.seats = clampNumber(seatInput.value, 1, 500);
            renderKitHeader();
            renderIncludedItems();
            renderReadiness();
            renderSummary();
        });
    }

    if (modelSelect) {
        modelSelect.addEventListener('change', () => {
            kitState.selectedLaptopId = modelSelect.value;
            renderLaptopPreview();
            renderReadiness();
            renderSummary();
        });
    }

    if (addButton) {
        addButton.addEventListener('click', addKitToCart);
    }
}

function applyKitType(type) {
    if (!KIT_TYPES[type] || type === kitState.type) return;

    kitState.type = type;
    kitState.config = KIT_TYPES[type];
    kitState.selectedBrand = kitState.config.defaultBrand;
    kitState.seats = kitState.config.seats;

    if (kitState.products.length || kitState.licenses.length) {
        hydrateKitSelections();
    }

    renderKitHeader();
    renderPackOptions();
    renderKit();

    const url = new URL(window.location.href);
    url.searchParams.set('type', type);
    window.history.replaceState({}, '', url);
}

async function fetchStoreProducts() {
    const cacheKey = 'proqPilotStoreProductsCache:v3';
    const cached = (() => {
        try {
            const value = JSON.parse(localStorage.getItem(cacheKey) || 'null');
            return Array.isArray(value?.products) ? value.products : null;
        } catch (error) {
            return null;
        }
    })();

    const refreshCatalog = async () => {
        const response = await fetch('/api/v1/products', { cache: 'no-cache' });
        const payload = await response.json();

        if (!response.ok || payload.status !== 'success') {
            throw new Error(payload.message || 'Product catalog unavailable');
        }

        const products = Array.isArray(payload.data?.products) ? payload.data.products : [];
        localStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), products }));
        return products;
    };

    if (cached) {
        refreshCatalog().catch(error => console.warn('[Kit Builder] Background catalog refresh failed:', error));
        return cached;
    }

    return refreshCatalog();
}
async function fetchMicrosoftLicenses() {
    try {
        const response = await fetch('/api/v1/microsoft/licenses?offset=0&max=100');
        const payload = await response.json();

        if (!response.ok || payload.status !== 'success') return [];
        return Array.isArray(payload.data?.licenses) ? payload.data.licenses : [];
    } catch (error) {
        console.warn('[Kit Builder] Microsoft licenses unavailable:', error);
        return [];
    }
}

function hydrateKitSelections() {
    kitState.laptopsByBrand = groupLaptopsByBrand(kitState.products);

    if (!kitState.laptopsByBrand.has(kitState.selectedBrand)) {
        const firstAvailableBrand = KIT_BRANDS.find(brand => kitState.laptopsByBrand.has(brand.name));
        kitState.selectedBrand = firstAvailableBrand?.name || kitState.selectedBrand;
    }

    const defaultLaptop = getBestLaptopForBrand(kitState.selectedBrand);
    kitState.selectedLaptopId = getProductId(defaultLaptop);
    kitState.selectedAccessories = selectAccessories();
    kitState.selectedDuo = selectDuoLicense();
    kitState.selectedMicrosoft = selectMicrosoftLicense();
    kitState.enabled = {
        laptop: true,
        duo: Boolean(kitState.selectedDuo),
        microsoft: Boolean(kitState.selectedMicrosoft),
        accessories: Object.fromEntries(kitState.selectedAccessories.map(item => [item.key, true]))
    };
}

function groupLaptopsByBrand(products) {
    const groups = new Map();

    products
        .filter(isLaptop)
        .filter(hasUsableImage)
        .forEach(product => {
            const brand = normalizeBrand(product);
            if (!brand) return;
            if (!groups.has(brand)) groups.set(brand, []);
            groups.get(brand).push(product);
        });

    groups.forEach((items, brand) => {
        const sorted = items.sort((a, b) => scoreLaptop(b) - scoreLaptop(a));
        groups.set(brand, dedupeLaptopModels(sorted));
    });

    return groups;
}

function renderKit() {
    renderPackOptions();
    renderBrandButtons();
    renderModelOptions();
    renderLaptopPreview();
    renderIncludedItems();
    renderReadiness();
    renderSummary();
}

function renderBrandButtons() {
    const brandGrid = document.getElementById('kitBrandGrid');
    if (!brandGrid) return;

    brandGrid.innerHTML = KIT_BRANDS.map(brand => {
        const hasProducts = !kitState.products.length || kitState.laptopsByBrand.has(brand.name);
        const activeClass = brand.name === kitState.selectedBrand ? 'active' : '';

        return `
            <button class="kit-brand-btn ${activeClass}" data-brand="${escapeHtml(brand.name)}" ${hasProducts ? '' : 'disabled'}>
                <img src="${escapeHtml(brand.logo)}" alt="${escapeHtml(brand.name)}">
                <span>${escapeHtml(brand.name)}</span>
            </button>
        `;
    }).join('');

    brandGrid.querySelectorAll('.kit-brand-btn:not([disabled])').forEach(button => {
        button.addEventListener('click', () => {
            kitState.selectedBrand = button.dataset.brand;
            const laptop = getBestLaptopForBrand(kitState.selectedBrand);
            kitState.selectedLaptopId = getProductId(laptop);
            renderKit();
        });
    });
}

function renderModelOptions() {
    const modelSelect = document.getElementById('kitModelSelect');
    if (!modelSelect) return;

    const laptops = kitState.laptopsByBrand.get(kitState.selectedBrand) || [];

    if (!laptops.length) {
        modelSelect.innerHTML = '<option>No laptop available for this brand</option>';
        modelSelect.disabled = true;
        return;
    }

    modelSelect.disabled = false;
    modelSelect.innerHTML = laptops.slice(0, 12).map(product => {
        const productId = getProductId(product);
        return `<option value="${escapeHtml(productId)}" ${productId === kitState.selectedLaptopId ? 'selected' : ''}>${escapeHtml(getProductDisplayName(product))}</option>`;
    }).join('');
}

function renderLaptopPreview() {
    const preview = document.getElementById('kitLaptopPreview');
    const laptop = getSelectedLaptop();
    if (!preview) return;

    if (!laptop) {
        preview.innerHTML = '<div class="kit-loading-state">Choose a brand to see matching laptops.</div>';
        return;
    }

    const specs = extractProductSpecs(laptop);
    const imageMarkup = renderProductImage(laptop);
    const included = kitState.enabled.laptop;

    preview.innerHTML = `
        <div class="kit-device-image ${imageMarkup.includes('kit-image-placeholder') ? 'is-empty' : ''}">
            ${imageMarkup}
        </div>
        <div class="kit-device-copy">
            <div class="kit-device-brand">
                <img src="${escapeHtml(getBrandLogo(normalizeBrand(laptop)))}" alt="${escapeHtml(normalizeBrand(laptop) || 'Brand')}">
                <span>${escapeHtml(normalizeBrand(laptop) || 'Recommended')}</span>
            </div>
            <h3>${escapeHtml(getProductDisplayName(laptop))}</h3>
            <div class="kit-spec-list">
                ${renderSpec('Processor', specs.processor)}
                ${renderSpec('RAM', specs.ram)}
                ${renderSpec('Storage', specs.storage)}
                ${renderSpec('Display', specs.display)}
                ${renderSpec('OS', specs.os)}
            </div>
            <div class="kit-device-footer">
                <strong>${formatMoney(getProductPrice(laptop))}</strong>
                <button class="kit-inline-toggle ${included ? '' : 'is-off'}" data-toggle-item="laptop">${included ? 'Remove laptop' : 'Include laptop'}</button>
            </div>
        </div>
    `;

    preview.querySelector('[data-toggle-item="laptop"]')?.addEventListener('click', () => {
        kitState.enabled.laptop = !kitState.enabled.laptop;
        renderLaptopPreview();
        renderReadiness();
        renderSummary();
    });
}

function renderIncludedItems() {
    const grid = document.getElementById('kitIncludedGrid');
    if (!grid) return;

    const items = [
        ...kitState.selectedAccessories.map(item => ({
            key: item.key,
            type: 'accessory',
            label: item.label,
            image: renderProductImage(item.product),
            name: getAccessoryDisplayName(item.product, item.label),
            detail: getAccessoryDetail(item.product, item.label),
            price: getProductPrice(item.product) * kitState.seats,
            active: kitState.enabled.accessories[item.key] !== false
        }))
    ];

    if (kitState.selectedDuo) {
        items.push({
            key: 'duo',
            type: 'duo',
            label: 'MFA security',
            image: '<img src="Images/cisco-duo.png" alt="Cisco Duo">',
            name: kitState.selectedDuo?.product_name || 'Cisco Duo recommendation',
            detail: 'Multi-factor authentication for user sign-ins.',
            price: getProductPrice(kitState.selectedDuo) * kitState.seats,
            active: kitState.enabled.duo && Boolean(kitState.selectedDuo)
        });
    }

    if (kitState.selectedMicrosoft) {
        items.push({
            key: 'microsoft',
            type: 'microsoft',
            label: 'Cloud productivity',
            image: '<img src="Images/Microsoft.png" alt="Microsoft">',
            name: kitState.selectedMicrosoft?.name || 'Microsoft 365 recommendation',
            detail: 'Email, Office apps, Teams, and cloud storage.',
            price: getMicrosoftTotal(),
            active: kitState.enabled.microsoft && Boolean(kitState.selectedMicrosoft)
        });
    }

    grid.innerHTML = items.map(item => `
        <article class="kit-mini-item ${item.type === 'microsoft' ? 'is-microsoft' : ''} ${item.active ? '' : 'is-removed'}">
            <div class="kit-mini-image">
                ${item.image}
            </div>
            <div>
                <span>${escapeHtml(item.label)}</span>
                <h3>${escapeHtml(item.name)}</h3>
                <p class="kit-mini-detail">${escapeHtml(item.detail)}</p>
                <p>${item.active ? (item.price > 0 ? escapeHtml(formatMoney(item.price)) : 'Live quote') : 'Removed from kit'}</p>
            </div>
            <button class="kit-remove-btn ${item.active ? '' : 'is-add'}" data-type="${escapeHtml(item.type)}" data-key="${escapeHtml(item.key)}" aria-label="${item.active ? 'Remove item' : 'Add item'}">
                <i class='bx ${item.active ? 'bx-trash' : 'bx-plus'}'></i>
            </button>
        </article>
    `).join('');

    grid.querySelectorAll('.kit-remove-btn').forEach(button => {
        button.addEventListener('click', () => {
            toggleKitItem(button.dataset.type, button.dataset.key);
        });
    });
}

function renderSummary() {
    const list = document.getElementById('kitSummaryList');
    const total = document.getElementById('kitTotal');
    const breakdown = document.getElementById('kitTotalBreakdown');
    const note = document.getElementById('kitNote');
    if (!list || !total) return;

    const lines = getKitSummaryLines();
    const totals = getKitTotals(lines);

    list.innerHTML = lines.map(line => `
        <div class="kit-summary-line">
            <div>
                <span>${escapeHtml(line.label)}</span>
                <p>${escapeHtml(line.name)}</p>
            </div>
            <strong>${line.price > 0 ? escapeHtml(formatMoney(line.price)) : 'Live quote'}</strong>
        </div>
    `).join('');

    if (breakdown) {
        breakdown.innerHTML = `
            <div>
                <span>Hardware</span>
                <strong>${escapeHtml(formatMoney(totals.hardware))}</strong>
            </div>
            <div>
                <span>Digital seats</span>
                <strong>${escapeHtml(formatMoney(totals.digital))}</strong>
            </div>
        `;
    }

    total.textContent = formatMoney(totals.total);

    if (note) {
        const hasQuoteItem = lines.some(line => line.price <= 0);
        note.textContent = hasQuoteItem
            ? 'Microsoft pricing will be added when the live license feed returns a priced item.'
            : `${kitState.config.packLabel} pack combines one-time hardware with per-seat digital services.`;
    }
}

function renderReadiness() {
    const grid = document.getElementById('kitReadinessGrid');
    if (!grid) return;

    const items = getReadinessItems();
    grid.innerHTML = items.map(item => `
        <article class="kit-readiness-card ${item.ready ? 'is-ready' : 'is-missing'}">
            <span><i class='bx ${escapeHtml(item.icon)}'></i></span>
            <div>
                <strong>${escapeHtml(item.label)}</strong>
                <small>${escapeHtml(item.detail)}</small>
            </div>
        </article>
    `).join('');
}

function getReadinessItems() {
    const enabledAccessories = kitState.selectedAccessories.filter(item => kitState.enabled.accessories[item.key] !== false);
    const laptop = getSelectedLaptop();

    return [
        {
            label: 'Device',
            detail: laptop && kitState.enabled.laptop ? getProductDisplayName(laptop) : 'No laptop included',
            icon: 'bx-laptop',
            ready: Boolean(laptop && kitState.enabled.laptop)
        },
        {
            label: 'Accessories',
            detail: enabledAccessories.length ? `${enabledAccessories.length} item${enabledAccessories.length === 1 ? '' : 's'} per employee` : 'No accessory items',
            icon: 'bx-package',
            ready: enabledAccessories.length > 0
        },
        {
            label: 'Productivity',
            detail: kitState.selectedMicrosoft && kitState.enabled.microsoft ? `${kitState.seats} Microsoft seat${kitState.seats === 1 ? '' : 's'}` : 'Microsoft not included',
            icon: 'bxl-microsoft',
            ready: Boolean(kitState.selectedMicrosoft && kitState.enabled.microsoft)
        },
        {
            label: 'Security',
            detail: kitState.selectedDuo && kitState.enabled.duo ? `${kitState.seats} Duo MFA seat${kitState.seats === 1 ? '' : 's'}` : 'MFA not included',
            icon: 'bx-shield-quarter',
            ready: Boolean(kitState.selectedDuo && kitState.enabled.duo)
        }
    ];
}

function getKitSummaryLines() {
    const laptop = getSelectedLaptop();
    const lines = [];

    if (laptop && kitState.enabled.laptop) {
        lines.push({
            label: `${kitState.seats} laptop${kitState.seats === 1 ? '' : 's'}`,
            name: getProductDisplayName(laptop),
            price: getProductPrice(laptop) * kitState.seats,
            category: 'hardware'
        });
    }

    kitState.selectedAccessories
        .filter(item => kitState.enabled.accessories[item.key] !== false)
        .forEach(item => {
        lines.push({
            label: `${kitState.seats} ${item.label.toLowerCase()}`,
            name: getAccessoryDisplayName(item.product, item.label),
            price: getProductPrice(item.product) * kitState.seats,
            category: 'hardware'
        });
    });

    if (kitState.selectedDuo && kitState.enabled.duo) {
        lines.push({
            label: `${kitState.seats} Duo user license${kitState.seats === 1 ? '' : 's'}`,
            name: kitState.selectedDuo.product_name || 'Cisco Duo',
            price: getProductPrice(kitState.selectedDuo) * kitState.seats,
            category: 'digital'
        });
    }

    if (kitState.selectedMicrosoft && kitState.enabled.microsoft) {
        lines.push({
            label: `${kitState.seats} Microsoft user license${kitState.seats === 1 ? '' : 's'}`,
            name: kitState.selectedMicrosoft.name || 'Microsoft 365',
            price: getMicrosoftTotal(),
            category: 'digital'
        });
    }

    return lines;
}

function getKitTotals(lines = getKitSummaryLines()) {
    return lines.reduce((totals, line) => {
        const price = Number(line.price) || 0;
        if (line.category === 'digital') totals.digital += price;
        else totals.hardware += price;
        totals.total += price;
        return totals;
    }, { hardware: 0, digital: 0, total: 0 });
}

async function addKitToCart() {
    const addButton = document.getElementById('kitAddToCart');
    const user = safeJsonParse(localStorage.getItem('user'));
    const cart = safeJsonParse(localStorage.getItem('cart')) || [];
    const cartItems = buildCartItems();

    if (!cartItems.length) {
        alert('Please choose a laptop before adding the kit.');
        return;
    }

    if (addButton) {
        addButton.disabled = true;
        addButton.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Adding Kit";
    }

    cartItems.forEach(item => upsertCartItem(cart, item));
    localStorage.setItem('cart', JSON.stringify(cart));

    if (user?.userID) {
        const syncItems = cartItems.map(createServerCartSyncItem).filter(Boolean);
        const skippedCount = cartItems.length - syncItems.length;

        if (syncItems.length) {
            const syncResult = await syncKitCartItems(user.userID, syncItems);
            if (syncResult.failed.length || skippedCount > 0) {
                console.warn('[Kit Builder] Some kit items are local-only for this cart session.', {
                    skippedCount,
                    failed: syncResult.failed
                });
                localStorage.setItem('preferLocalCartOnce', '1');
            }
        } else {
            localStorage.setItem('preferLocalCartOnce', '1');
        }
    }

    updateCartBadge();

    if (addButton) {
        addButton.innerHTML = "<i class='bx bx-check'></i> Kit Added";
    }

    window.setTimeout(() => {
        window.location.href = 'cart.html';
    }, 500);
}

function buildCartItems() {
    const laptop = getSelectedLaptop();
    const regularProducts = [
        kitState.enabled.laptop ? laptop : null,
        ...kitState.selectedAccessories
            .filter(item => kitState.enabled.accessories[item.key] !== false)
            .map(item => item.product)
    ].filter(Boolean);

    const items = regularProducts.map(product => {
        const productId = getProductId(product);
        return {
            id: productId,
            product_id: productId,
            productID: productId,
            product_name: product.product_name || product.name || 'Kit item',
            price: getProductPrice(product),
            image_url: product.image_url || product.image || product.main_image || '',
            description: product.description || product.product_description || '',
            quantity: kitState.seats
        };
    });

    const microsoftItem = buildMicrosoftCartItem();
    if (kitState.enabled.microsoft && microsoftItem) items.push(microsoftItem);
    const duoItem = buildDuoCartItem();
    if (kitState.enabled.duo && duoItem) items.push(duoItem);

    return items;
}

function createServerCartSyncItem(item) {
    const itemType = item.type || item.cart_type;
    if (itemType === 'duo-security' || itemType === 'duo-security-upgrade' || itemType === 'microsoft-license') {
        const config = item.duo_config || item.duo_config_json || item.microsoft_config || item.microsoft_config_json;
        if (!item.id || !config || !Object.keys(config).length) return null;
        return item;
    }

    const productId = Number.parseInt(item.product_id || item.productID || item.id, 10);
    if (!Number.isFinite(productId)) return null;

    return {
        ...item,
        id: productId,
        product_id: productId,
        productID: productId,
        quantity: Math.max(1, Number.parseInt(item.quantity, 10) || 1)
    };
}

async function syncKitCartItems(userID, items) {
    const result = { synced: 0, failed: [] };

    for (const item of items) {
        try {
            const response = await fetch('/api/v1/cart/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userID, items: [item] })
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || Number(payload.synced) < 1) {
                throw new Error(payload.message || 'Item sync failed');
            }
            result.synced += 1;
        } catch (error) {
            result.failed.push({
                id: item.id,
                name: item.product_name,
                message: error.message
            });
        }
    }

    return result;
}

function buildDuoCartItem() {
    const product = kitState.selectedDuo;
    const user = safeJsonParse(localStorage.getItem('user'));
    const unitPrice = getProductPrice(product);
    if (!product || unitPrice <= 0 || !user?.email) return null;

    const productText = normalizeProductText(product);
    const edition = productText.includes('premier') || productText.includes('beyond')
        ? 'BEYOND'
        : productText.includes('advantage') || productText.includes('platform')
            ? 'PLATFORM'
            : 'ENTERPRISE';
    const personName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    const emailName = String(user.email).split('@')[0].replace(/[._-]+/g, ' ').trim();
    const organizationName = user.company_name || user.companyName || personName || `${emailName} Team`;
    const totalPrice = unitPrice * kitState.seats;
    const duoConfig = {
        organization_name: organizationName,
        user_limit: kitState.seats,
        admin_emails: [user.email],
        edition,
        customer_email: user.email,
        userId: user.userID || null,
        product_name: product.product_name || 'Cisco Duo Security',
        product_description: `${organizationName} | ${kitState.seats} User License(s)`,
        unit_price: unitPrice,
        product_price: totalPrice,
        kit_type: kitState.type
    };

    const organizationKey = normalizeText(organizationName).trim().replace(/\s+/g, '-').slice(0, 70);

    return {
        id: `duo-kit-${kitState.type}-${organizationKey}`,
        type: 'duo-security',
        product_name: duoConfig.product_name,
        description: duoConfig.product_description,
        quantity: 1,
        price: totalPrice,
        image_url: 'Images/cisco-duo.png',
        duo_config: duoConfig
    };
}

function buildMicrosoftCartItem() {
    const license = kitState.selectedMicrosoft;
    const unitPrice = Number(license?.price || license?.unitPrice || 0);
    if (!license || unitPrice <= 0) return null;

    const sku = license.sku || license.id || license.name;
    const totalPrice = unitPrice * kitState.seats;
    const user = safeJsonParse(localStorage.getItem('user'));
    const microsoftConfig = {
        provider: 'Microsoft',
        sku,
        product_name: license.name || 'Microsoft License',
        product_description: `${license.name || 'Microsoft License'} | ${kitState.seats} User License(s)`,
        category: license.category || 'license',
        billing_term: license.billingTerm || 'Live report',
        customer_name: license.customerName || null,
        customer_id: license.customerId || null,
        seats: kitState.seats,
        unit_price: unitPrice,
        product_price: totalPrice,
        customer_email: user?.email || null,
        userId: user?.userID || null
    };

    return {
        id: `ms-${sku}`,
        type: 'microsoft-license',
        cart_type: 'microsoft-license',
        product_name: microsoftConfig.product_name,
        description: microsoftConfig.product_description,
        quantity: 1,
        price: totalPrice,
        image_url: 'Images/Microsoft.png',
        microsoft_config: microsoftConfig
    };
}

function upsertCartItem(cart, item) {
    const index = cart.findIndex(existing => {
        if (item.type === 'microsoft-license') {
            return existing.type === 'microsoft-license' && existing.microsoft_config?.sku === item.microsoft_config?.sku;
        }
        if (item.type === 'duo-security' || item.type === 'duo-security-upgrade') {
            return existing.type === item.type &&
                existing.duo_config?.organization_name === item.duo_config?.organization_name;
        }
        return String(existing.id) === String(item.id) && !existing.type;
    });

    if (index >= 0) {
        if (item.type) {
            cart[index] = item;
        } else {
            cart[index].quantity = (Number(cart[index].quantity) || 0) + (Number(item.quantity) || 1);
            cart[index].price = item.price;
        }
    } else {
        cart.push(item);
    }
}

function selectAccessories() {
    const selected = [];

    kitState.config.accessories.forEach(accessory => {
        const product = findBestProductByTerms(accessory.terms, selected);
        if (product) selected.push({ ...accessory, product });
    });

    return selected;
}

function selectDuoLicense() {
    const duoProducts = kitState.products
        .filter(product => normalizeText(`${product.product_name || ''} ${product.brand || ''}`).includes('duo'))
        .sort((a, b) => scoreByTerms(b, kitState.config.duoTerms) - scoreByTerms(a, kitState.config.duoTerms));

    return duoProducts[0] || null;
}

function selectMicrosoftLicense() {
    const priced = kitState.licenses
        .filter(license => Number(license.price || license.unitPrice || 0) > 0)
        .sort((a, b) => scoreMicrosoftLicense(b) - scoreMicrosoftLicense(a));

    return priced[0] || null;
}

function findBestProductByTerms(terms, alreadySelected) {
    const selectedIds = new Set(alreadySelected.map(item => getProductId(item.product)));
    const matches = kitState.products
        .filter(product => !selectedIds.has(getProductId(product)))
        .filter(product => {
            const text = normalizeProductText(product);
            return terms.some(term => text.includes(term));
        })
        .filter(hasUsableImage)
        .filter(product => isAccessoryCandidate(product, terms))
        .sort((a, b) => scoreAccessory(b, terms) - scoreAccessory(a, terms));

    return matches[0] || null;
}

function getBestLaptopForBrand(brand) {
    return (kitState.laptopsByBrand.get(brand) || [])[0] || null;
}

function getSelectedLaptop() {
    const laptops = kitState.laptopsByBrand.get(kitState.selectedBrand) || [];
    return laptops.find(product => getProductId(product) === kitState.selectedLaptopId) || laptops[0] || null;
}

function dedupeLaptopModels(items) {
    const byName = new Map();

    items.forEach(product => {
        const key = getProductDisplayName(product);
        const current = byName.get(key);
        if (!current || scoreLaptop(product) > scoreLaptop(current)) {
            byName.set(key, product);
        }
    });

    return Array.from(byName.values());
}

function isLaptop(product) {
    const text = normalizeProductText(product);
    if (!text) return false;

    const hasLaptopSignal = ['laptop', 'notebook', 'probook', 'elitebook', 'thinkpad', 'thinkbook', 'latitude', 'xps', 'macbook', 'surface', 'aspire', 'swift', 'spin', 'extensa', 'nitro', 'exo14', 'exo15'].some(term => text.includes(term));
    const accessorySignal = ['bag', 'mouse', 'mouse pad', 'dock', 'adapter', 'charger', 'monitor', 'headset', 'license', 'duo', 'lock', 'cable', 'case', 'sleeve', 'stand', 'privacy', 'filter', 'targus', 'body glove'].some(term => text.includes(term));

    return hasLaptopSignal && !accessorySignal;
}

function normalizeBrand(product) {
    const text = normalizeProductText(product);

    if (text.includes('probook') || text.includes('elitebook') || text.includes(' hp ')) return 'HP';
    if (text.includes('latitude') || text.includes('xps') || text.includes('inspiron') || text.includes('dell')) return 'Dell';
    if (text.includes('macbook') || text.includes('apple')) return 'Apple';
    if (text.includes('surface') || text.includes('microsoft')) return 'Microsoft';
    if (text.includes('acer') || text.includes('swift') || text.includes('travelmate') || text.includes('aspire') || text.includes('spin') || text.includes('extensa') || text.includes('nitro') || text.includes('exo14') || text.includes('exo15')) return 'Acer';
    if (text.includes('thinkpad') || text.includes('thinkbook') || text.includes('lenovo')) return 'Lenovo';

    return null;
}

function scoreLaptop(product) {
    const text = normalizeProductText(product);
    let score = getProductPrice(product) / 1000;

    [
        ['ultra 9', 80],
        ['ultra 7', 70],
        ['core i9', 65],
        ['core i7', 55],
        ['ryzen 7', 50],
        ['core i5', 35],
        ['ryzen 5', 35],
        ['32gb', 45],
        ['16gb', 30],
        ['1tb', 28],
        ['512gb', 18],
        ['vpro', 20],
        ['pro', 12],
        ['business', 10],
        ['windows 11 pro', 10]
    ].forEach(([term, points]) => {
        if (text.includes(term)) score += points;
    });

    return score;
}

function scoreAccessory(product, terms) {
    const text = normalizeProductText(product);
    const exactScore = terms.reduce((score, term) => score + (text.includes(term) ? 30 : 0), 0);
    const imageScore = hasUsableImage(product) ? 6 : 0;
    const penalty = ['pad', 'replacement', 'spare', 'privacy', 'filter', 'lock'].some(term => text.includes(term)) ? 35 : 0;
    return exactScore + imageScore - penalty - getProductPrice(product) / 900;
}

function getAccessoryDisplayName(product, fallback) {
    const raw = String(product?.product_name || product?.description || fallback || 'Setup item')
        .replace(/\s+/g, ' ')
        .replace(/\bFeatures?:.*$/i, '')
        .replace(/\bWarranty:.*$/i, '')
        .trim();

    const text = normalizeProductText(product);
    const brand = raw.match(/\b(Targus|Lenovo|HP|Dell|Logitech|Body Glove|Microsoft)\b/i)?.[1] || '';

    if (text.includes('mouse') && !text.includes('keyboard') && !text.includes('pad')) {
        return limitWords(`${brand} Mouse`.trim(), 4);
    }

    if (text.includes('topload')) return limitWords(`${brand} Topload Bag`.trim(), 4);
    if (text.includes('sleeve')) return limitWords(`${brand} Laptop Sleeve`.trim(), 4);
    if (text.includes('backpack')) return limitWords(`${brand} Backpack`.trim(), 4);
    if (text.includes('dock')) return limitWords(`${brand} Dock`.trim(), 4);
    if (text.includes('webcam') || text.includes('camera')) return limitWords(`${brand} Webcam`.trim(), 4);
    if (text.includes('monitor') || text.includes('display')) return limitWords(`${brand} Monitor`.trim(), 4);

    return limitWords(raw, 5);
}

function getAccessoryDetail(product, fallback) {
    const raw = `${product?.product_name || ''} ${product?.description || ''}`.replace(/\s+/g, ' ');
    const text = normalizeText(raw);
    const details = [];

    const fit = firstMatch(raw, [
        /fit up to\s+\d+(?:\.\d+)?\s*(?:"|inch|in)/i,
        /\d+(?:\.\d+)?\s*(?:"|inch|in)\s+laptop/i,
        /\d+(?:\.\d+)?-\d+(?:\.\d+)?\s*(?:"|inch|in)/i
    ]);
    if (fit !== 'Not listed') details.push(`Fit: ${fit.replace(/^fit up to/i, 'up to')}`);

    if (text.includes('bluetooth')) details.push('Connection: Bluetooth');
    else if (text.includes('wireless')) details.push('Connection: Wireless');
    else if (text.includes('usb')) details.push('Connection: USB');

    if (text.includes('c270') || text.includes('webcam') || text.includes('web cam') || text.includes('camera') || text.includes('hd 720p video')) details.push('Type: Webcam');
    else if (text.includes('topload')) details.push('Type: Topload case');
    else if (text.includes('sleeve')) details.push('Type: Sleeve');
    else if (text.includes('backpack')) details.push('Type: Backpack');
    else if (text.includes('dock')) details.push('Type: Docking station');
    else if (text.includes('monitor') || text.includes('display')) details.push('Type: Display');

    if (text.includes('padded')) details.push('Feature: Padded');
    if (text.includes('thunderbolt')) details.push('Port: Thunderbolt');
    if (text.includes('fhd')) details.push('Display: FHD');
    if (text.includes('720p')) details.push('Resolution: 720p HD');
    if (text.includes('mic')) details.push('Feature: Microphone');

    if (details.length) return details.slice(0, 2).join(' | ');

    const cleaned = raw
        .replace(/\bFeatures?:.*$/i, '')
        .replace(/\bWarranty:.*$/i, '')
        .replace(product?.product_name || '', '')
        .trim();

    return limitWords(cleaned || fallback || 'Recommended setup item', 10);
}

function scoreByTerms(product, terms) {
    const text = normalizeProductText(product);
    return terms.reduce((score, term, index) => score + (text.includes(term) ? 100 - index * 10 : 0), 0);
}

function scoreMicrosoftLicense(license) {
    const text = normalizeText(`${license.name || ''} ${license.description || ''} ${license.sku || ''}`);
    const termScore = kitState.config.microsoftTerms.reduce((score, term, index) => score + (text.includes(term) ? 100 - index * 12 : 0), 0);
    const businessScore = text.includes('business') ? 25 : 0;
    return termScore + businessScore;
}

function toggleKitItem(type, key) {
    if (type === 'accessory') {
        kitState.enabled.accessories[key] = kitState.enabled.accessories[key] === false;
    }

    if (type === 'duo') kitState.enabled.duo = !kitState.enabled.duo;
    if (type === 'microsoft') kitState.enabled.microsoft = !kitState.enabled.microsoft;

    renderIncludedItems();
    renderReadiness();
    renderSummary();
}

function getAccessoryLabel(product) {
    const text = normalizeProductText(product);
    if (text.includes('dock')) return 'Dock';
    if (text.includes('monitor') || text.includes('display')) return 'Monitor';
    if (text.includes('webcam') || text.includes('camera')) return 'Webcam';
    if (text.includes('mouse')) return 'Mouse';
    if (text.includes('bag') || text.includes('case') || text.includes('sleeve')) return 'Carry gear';
    return 'Accessory';
}

function getMicrosoftTotal() {
    const unitPrice = Number(kitState.selectedMicrosoft?.price || kitState.selectedMicrosoft?.unitPrice || 0);
    return unitPrice * kitState.seats;
}

function getProductDisplayName(product) {
    const raw = String(product?.product_name || product?.name || 'Recommended laptop').replace(/\s+/g, ' ').trim();
    const candidates = [
        /\b(HP\s+(?:EliteBook|ProBook|ZBook|OmniBook)\s+[A-Z0-9]+(?:\s+\w+)?)/i,
        /\b(Dell\s+(?:Latitude|XPS|Inspiron|Precision)\s+[A-Z0-9-]+)/i,
        /\b(Lenovo\s+(?:ThinkPad|ThinkBook|Yoga|Legion)\s+[A-Z0-9-]+)/i,
        /\b(Microsoft\s+Surface\s+(?:Laptop|Pro|Book)\s*\d*)/i,
        /\b(Acer\s+(?:Aspire|Swift|Spin|Extensa|Nitro|TravelMate|EXO14|EXO15)(?:\s+[A-Z0-9-]+)?)/i,
        /\b(Apple\s+MacBook\s+(?:Air|Pro)?)/i,
        /\b(MacBook\s+(?:Air|Pro)?)/i
    ];

    for (const pattern of candidates) {
        const match = raw.match(pattern);
        if (match?.[1]) return limitWords(cleanProductName(match[1]), 4);
    }

    return limitWords(cleanProductName(raw), 4);
}

function cleanProductName(value) {
    return String(value || '')
        .replace(/\b(?:Intel|AMD|Core|Ryzen|Processor|RAM|Memory|SSD|Windows|Touchscreen)\b.*$/i, '')
        .replace(/[|,].*$/g, '')
        .replace(/\s+/g, ' ')
        .trim() || 'Recommended laptop';
}

function limitWords(value, maxWords) {
    return String(value || '').split(/\s+/).filter(Boolean).slice(0, maxWords).join(' ');
}

function extractProductSpecs(product) {
    const raw = `${product?.product_name || ''} ${product?.description || ''} ${product?.product_description || ''}`.replace(/\s+/g, ' ');

    return {
        processor: firstMatch(raw, [
            /Intel\s+Core\s+Ultra\s+\d\s*\w*/i,
            /Intel\s+Ultra\s+\d\s*\w*/i,
            /\bUltra\s+\d\s*\w*/i,
            /Intel\s+Core\s+i[3579][-\s]?\w*/i,
            /\bCore\s+i[3579][-\s]?\w*/i,
            /AMD\s+Ryzen\s+[3579]\s*\w*/i,
            /\bRyzen\s+[3579]\s*\w*/i,
            /Apple\s+M\d\s*\w*/i
        ]),
        ram: firstMatch(raw, [
            /\b\d+\s*GB\s+(?:LPDDR\d+x?|DDR\d)\b/i,
            /\bRAM:\s*\d+\s*GB\s+(?:LPDDR\d+x?|DDR\d)\b/i,
            /\b\d+\s*GB\s+RAM\b/i,
            /\b\d+\s*GB\b(?=.*(?:RAM|Memory|LPDDR|DDR|Windows|SSD))/i
        ]),
        storage: firstMatch(raw, [
            /\b\d+\s*TB\s+(?:SSD|PCIe|NVMe|solid-state drive)/i,
            /\b\d+\s*GB\s+(?:SSD|PCIe|NVMe|solid-state drive)/i,
            /\bStorage:\s*\d+\s*(?:GB|TB)[^,-]*/i,
            /\b\d+\s*TB\b(?=.*(?:SSD|Storage|Windows|NVMe))/i,
            /\b(?:256|512)\s*GB\b(?=.*(?:SSD|Storage|NVMe))/i
        ]),
        display: firstMatch(raw, [
            /\b\d{2}(?:\.\d)?\s*(?:inch|in|")\s+(?:FHD|WUXGA|OLED|IPS|PixelSense)?/i,
            /\b\d{2}(?:\.\d)?-inch\s+(?:FHD|WUXGA|OLED|IPS|PixelSense)?/i
        ]),
        os: firstMatch(raw, [
            /Windows\s+11\s+Pro/i,
            /Windows\s+11\s+Home/i,
            /macOS/i
        ])
    };
}

function firstMatch(value, patterns) {
    for (const pattern of patterns) {
        const match = String(value || '').match(pattern);
        if (match?.[0]) return normalizeSpec(match[0]);
    }
    return 'Not listed';
}

function normalizeSpec(value) {
    return String(value || '')
        .replace(/^RAM:\s*/i, '')
        .replace(/^Storage:\s*/i, '')
        .replace(/\s+/g, ' ')
        .replace(/\s*\|\s*/g, ' ')
        .trim();
}

function renderSpec(label, value) {
    return `
        <div class="kit-spec">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value)}</strong>
        </div>
    `;
}

function getProductId(product) {
    if (!product) return '';
    return String(product.productID || product.id || product.product_id || product.sku || product.product_name || '');
}

function getProductPrice(product) {
    if (!product) return 0;
    return Number(product.price || product.product_price || product.unitPrice || 0);
}

function getProductImageSrc(imageUrl) {
    if (!imageUrl || /Proq2|ProQ|logo/i.test(imageUrl)) return '';
    if (/^https?:\/\//i.test(imageUrl)) {
        return `/image-proxy?url=${encodeURIComponent(imageUrl)}`;
    }
    return imageUrl;
}

function hasUsableImage(product) {
    return Boolean(getProductImageSrc(product?.image_url || product?.image || product?.main_image));
}

function renderProductImage(product) {
    const src = getProductImageSrc(product?.image_url || product?.image || product?.main_image);
    if (!src) {
        return `
            <div class="kit-image-placeholder">
                <i class='bx bx-image'></i>
                <span>Image not supplied</span>
            </div>
        `;
    }

    return `<img src="${escapeHtml(src)}" alt="${escapeHtml(getProductDisplayName(product))}" width="320" height="240" loading="lazy" decoding="async">`;
}

function getBrandLogo(brandName) {
    return KIT_BRANDS.find(brand => brand.name === brandName)?.logo || 'Images/Microsoft.png';
}

function isBadAccessoryMatch(product, terms) {
    const text = normalizeProductText(product);

    if (terms.includes('mouse') && ['mouse pad', 'keyboard', 'charger', 'bundle', 'backpack'].some(term => text.includes(term))) return true;
    if (terms.includes('bag') && ['lock', 'privacy', 'filter', 'cable', 'adapter'].some(term => text.includes(term))) return true;
    if (terms.includes('webcam') && ['privacy', 'filter'].some(term => text.includes(term))) return true;
    if (terms.includes('monitor') && ['cable', 'adapter', 'mount', 'stand'].some(term => text.includes(term))) return true;

    return false;
}

function isAccessoryCandidate(product, terms) {
    if (!hasUsableImage(product) || isLaptop(product)) return false;

    const name = normalizeText(`${product?.product_name || ''} ${product?.name || ''}`);
    const text = normalizeProductText(product);
    const price = getProductPrice(product);

    if (isBadAccessoryMatch(product, terms)) return false;

    if (terms.includes('mouse')) {
        return name.includes(' mouse ') &&
            ![' keyboard ', ' mouse pad ', ' charger ', ' bundle ', ' backpack '].some(term => name.includes(term) || text.includes(term));
    }

    if (terms.includes('bag') || terms.includes('topload') || terms.includes('sleeve')) {
        return [' bag ', ' topload ', ' sleeve ', ' backpack ', ' laptop case '].some(term => name.includes(term));
    }

    if (terms.includes('dock') || terms.includes('docking') || terms.includes('thunderbolt')) {
        return [' dock ', ' docking ', ' hyperdrive '].some(term => name.includes(term));
    }

    if (terms.includes('webcam') || terms.includes('camera') || terms.includes('c270')) {
        const looksLikeWebcam = [' webcam ', ' web cam ', ' camera ', ' c270 ', ' hd 720p video '].some(term => name.includes(term) || text.includes(term));
        const looksLikeLaptopCamera = [' notebook ', ' laptop ', ' thinkpad ', ' probook ', ' elitebook ', ' surface ', ' acer ', ' latitude '].some(term => name.includes(term));
        return looksLikeWebcam && !looksLikeLaptopCamera && price > 0 && price < 5000;
    }

    if (terms.includes('monitor') || terms.includes('display')) {
        return name.includes(' monitor ') && price > 0 && price < 25000;
    }

    return false;
}

function createShortDescription(product) {
    const raw = product.description || product.product_description || product.product_name || '';
    return String(raw).replace(/\s+/g, ' ').slice(0, 160);
}

function normalizeProductText(product) {
    return normalizeText(`${product.product_name || ''} ${product.name || ''} ${product.brand || ''} ${product.category || ''} ${product.description || ''} ${product.product_description || ''}`);
}

function normalizeText(value) {
    return ` ${String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
}

function formatMoney(value) {
    return `R${Number(value || 0).toLocaleString('en-ZA', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    })}`;
}

function updateCartBadge() {
    const cart = safeJsonParse(localStorage.getItem('cart')) || [];
    const count = cart.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
    const cartBadge = document.getElementById('cart-count') || document.querySelector('.cart-badge');
    if (cartBadge) cartBadge.textContent = String(count);
}

function renderKitError(message) {
    const preview = document.getElementById('kitLaptopPreview');
    if (preview) preview.innerHTML = `<div class="kit-loading-state">${escapeHtml(message)}</div>`;
}

function setText(id, value) {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
}

function clampNumber(value, min, max) {
    const parsed = parseInt(value, 10);
    if (Number.isNaN(parsed)) return min;
    return Math.min(max, Math.max(min, parsed));
}

function safeJsonParse(value) {
    try {
        return value ? JSON.parse(value) : null;
    } catch (error) {
        return null;
    }
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
