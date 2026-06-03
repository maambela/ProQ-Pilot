// Wishlist Logic
const wishlistItemsList = document.getElementById('wishlistItemsList');
const wishlistSummary = document.getElementById('wishlistSummary');

function safeText(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function parseNumber(value) {
    const parsed = Number(String(value ?? '').replace(/[^\d.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
}

function getUserID() {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    return localStorage.getItem('userID') || localStorage.getItem('userId') || user?.userID || user?.id || '';
}

function normalizeImagePath(path) {
    const image = String(path || '').trim();
    if (!image) return '/Images/placeholder.png';
    if (/^https?:\/\//i.test(image) || image.startsWith('/') || image.startsWith('data:')) return image;
    if (/^Images\//i.test(image)) return `/${image}`;
    return `/product_images/${image}`;
}

function compactText(value, maxLength = 120) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength).replace(/\s+\S*$/, '')}...`;
}

function cleanProductTitle(value) {
    const raw = String(value || 'Saved product').replace(/\s+/g, ' ').trim();
    const stopPattern = /\s+(?:Intel Core|Core Ultra|Intel Ultra|AMD Ryzen|Ryzen|Snapdragon|Apple M\d|M\d\s|[0-9]{1,2}GB\b|[0-9]{3,4}GB\b|[0-9]TB\b|DDR\d|LPDDR|SSD\b|NVMe\b|Windows\b|WUXGA|FHD|QHD|OLED|IPS\b|Touchscreen|Processor\b)/i;
    const match = raw.match(stopPattern);
    const shortTitle = match ? raw.slice(0, match.index).trim() : raw;
    return compactText(shortTitle || raw, 64);
}

function extractSpecs(item) {
    const source = `${item.name || ''} ${item.description || ''}`;
    const specs = [];
    const add = (label, regex, format = (value) => value) => {
        const match = source.match(regex);
        if (!match) return;
        const value = format(match[1] || match[0]).replace(/\s+/g, ' ').trim();
        if (value && !specs.some((spec) => spec.label === label)) specs.push({ label, value });
    };

    add('Processor', /\b((?:Intel\s+)?Core\s+Ultra\s+[3579][\w-]*|Intel\s+Core\s+i[3579][\w-]*|Core\s+i[3579][\w-]*|Ultra\s+[3579][\w-]*|AMD\s+Ryzen\s+[3579][\w-]*|Ryzen\s+[3579][\w-]*|Apple\s+M\d(?:\s+\w+)?|Snapdragon\s+\w+)/i);
    add('RAM', /\b(\d{1,3}\s?GB\s+(?:DDR\d|LPDDR\dX?|LPDDR\d|RAM|Memory)?)/i);
    add('Storage', /\b((?:\d{3,4}\s?GB|\d\s?TB)\s+(?:PCIe\s+)?(?:NVMe\s+)?SSD)/i);
    add('Display', /\b(\d{2}(?:\.\d)?(?:-inch|in|")?\s+(?:FHD|WUXGA|QHD|UHD|OLED|IPS|Touchscreen|Display)[^,.;]*)/i, (value) => compactText(value, 34));
    add('OS', /\b(Windows\s+11\s+(?:Pro|Professional|Home)?)/i);

    return specs.slice(0, 4);
}

function normalizeWishlistItem(item) {
    const id = item.id || item.productId || item.productID || item.product_id;
    const rawName = item.product_name || item.name || item.title || 'Saved product';
    const price = parseNumber(item.price);
    const rawDescription = item.description || item.short_description || '';
    const image = normalizeImagePath(item.image_url || item.image || item.product_image);
    const name = cleanProductTitle(rawName);
    const specs = extractSpecs({ name: rawName, description: rawDescription });
    const fallbackDescription = compactText(rawDescription.replace(rawName, '').trim(), 110);

    return {
        ...item,
        id,
        productId: id,
        name,
        rawName,
        description: fallbackDescription,
        specs,
        price,
        image,
        quantity: 1
    };
}

function getLocalWishlist() {
    try {
        return JSON.parse(localStorage.getItem('wishlist') || '[]').map(normalizeWishlistItem).filter((item) => item.id);
    } catch (error) {
        console.warn('[Wishlist] Could not parse local wishlist:', error);
        return [];
    }
}

function setBadgeCount(count) {
    document.querySelectorAll('.wishlist-badge').forEach((badge) => {
        badge.textContent = String(count);
    });
    localStorage.setItem('wishlistCount', String(count));
}

function getCurrentCartCount() {
    const badgeValue = Number(document.querySelector('.cart-badge')?.textContent || 0);
    const storedValue = Number(localStorage.getItem('cartCount') || 0);
    return Number.isFinite(badgeValue) && badgeValue > 0 ? badgeValue : (Number.isFinite(storedValue) ? storedValue : 0);
}

function setCartBadgeCount(count) {
    const nextCount = Math.max(0, Number(count) || 0);
    document.querySelectorAll('.cart-badge').forEach((badge) => {
        badge.textContent = String(nextCount);
    });
    localStorage.setItem('cartCount', String(nextCount));
}

function renderEmptyWishlist() {
    document.body.classList.add('wishlist-is-empty');
    wishlistItemsList.innerHTML = `
        <div class="empty-wishlist-msg">
            <i class='bx bx-heart'></i>
            <h3>Your wishlist is empty</h3>
            <p>Save procurement picks to compare them later.</p>
            <a href="store.html" class="btn btn-primary">Continue Shopping</a>
        </div>
    `;
    if (wishlistSummary) wishlistSummary.style.display = 'none';
}

function renderSpecList(item) {
    if (item.specs?.length) {
        return `
            <div class="wishlist-specs">
                ${item.specs.map((spec) => `
                    <span>
                        <small>${safeText(spec.label)}</small>
                        ${safeText(spec.value)}
                    </span>
                `).join('')}
            </div>
        `;
    }

    if (!item.description || item.description.toLowerCase() === item.name.toLowerCase()) return '';
    return `<p class="wishlist-short-description">${safeText(item.description)}</p>`;
}

function renderWishlistItems(rawItems) {
    const items = (rawItems || []).map(normalizeWishlistItem).filter((item) => item.id);

    if (!items.length) {
        renderEmptyWishlist();
        return;
    }

    document.body.classList.remove('wishlist-is-empty');
    let totalValue = 0;

    wishlistItemsList.innerHTML = items.map((item) => {
        totalValue += item.price;
        return `
            <article class="wishlist-item-card" data-product-id="${safeText(item.id)}">
                <a class="wishlist-image-box" href="product.html?id=${encodeURIComponent(item.id)}" aria-label="View ${safeText(item.name)}">
                    <img src="${safeText(item.image)}" alt="${safeText(item.name)}" loading="lazy" decoding="async" onerror="this.src='/Images/placeholder.png'">
                </a>
                <div class="wishlist-copy">
                    <span class="wishlist-kicker">Saved pick</span>
                    <a class="wishlist-title" href="product.html?id=${encodeURIComponent(item.id)}">${safeText(item.name)}</a>
                    ${renderSpecList(item)}
                    <strong>R${item.price.toLocaleString()}</strong>
                </div>
                <div class="wishlist-actions">
                    <button type="button" class="btn btn-primary btn-add-to-cart" data-product-id="${safeText(item.id)}">
                        <i class='bx bx-cart-add'></i>
                        <span>Add to cart</span>
                    </button>
                    <button type="button" class="wishlist-delete-btn btn-remove-wishlist" data-product-id="${safeText(item.id)}" aria-label="Remove ${safeText(item.name)} from wishlist">
                        <i class='bx bx-trash'></i>
                    </button>
                </div>
            </article>
        `;
    }).join('');

    if (wishlistSummary) wishlistSummary.style.display = 'block';
    const countEl = document.getElementById('wishlist-item-count');
    const totalEl = document.getElementById('wishlist-total-price');
    if (countEl) countEl.textContent = String(items.length);
    if (totalEl) totalEl.textContent = `R${totalValue.toLocaleString()}`;
    setBadgeCount(items.length);

    document.querySelectorAll('.btn-add-to-cart').forEach((btn) => {
        btn.addEventListener('click', handleAddToCart);
    });

    document.querySelectorAll('.btn-remove-wishlist').forEach((btn) => {
        btn.addEventListener('click', handleRemoveFromWishlist);
    });
}

async function loadWishlistItems() {
    const userID = getUserID();
    const localItems = getLocalWishlist();

    if (!userID) {
        renderWishlistItems(localItems);
        return;
    }

    try {
        const response = await fetch(`/api/v1/wishlist/${userID}`);
        if (!response.ok) throw new Error(`Wishlist request failed: ${response.status}`);

        const data = await response.json();
        const serverItems = (data.data || []).map(normalizeWishlistItem).filter((item) => item.id);
        renderWishlistItems(serverItems.length ? serverItems : localItems);
    } catch (error) {
        console.error('[Wishlist] Error fetching wishlist:', error);
        renderWishlistItems(localItems);
    }
}

async function handleAddToCart(event) {
    const productID = event.currentTarget.getAttribute('data-product-id');
    const userID = getUserID();
    const product = getLocalWishlist().find((item) => String(item.id) === String(productID));
    const button = event.currentTarget;
    const previousCartCount = getCurrentCartCount();

    button.disabled = true;
    button.classList.add('is-loading');
    setCartBadgeCount(previousCartCount + 1);

    try {
        if (userID) {
            const cartResponse = await fetch('/api/v1/cart/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userID,
                    items: [{ id: productID, quantity: 1 }]
                })
            });
            if (!cartResponse.ok) throw new Error(`Cart sync failed: ${cartResponse.status}`);
        } else if (product) {
            const cart = JSON.parse(localStorage.getItem('cart') || '[]');
            const existing = cart.find((item) => String(item.id) === String(productID));
            if (existing) {
                existing.quantity = Number(existing.quantity || 1) + 1;
            } else {
                cart.push({
                    id: product.id,
                    product_name: product.name,
                    price: product.price,
                    image_url: product.image,
                    description: product.description,
                    quantity: 1
                });
            }
            localStorage.setItem('cart', JSON.stringify(cart));
        }

        await removeFromWishlist(productID, { silent: true });
        await loadWishlistItems();
        window.dispatchEvent(new CustomEvent('stack:cart-updated'));
        showNotification('Item added to cart', 'success');
    } catch (error) {
        console.error('[Wishlist] Error adding to cart:', error);
        setCartBadgeCount(previousCartCount);
        showNotification('Could not add item to cart', 'error');
    } finally {
        button.disabled = false;
        button.classList.remove('is-loading');
    }
}

async function handleRemoveFromWishlist(event) {
    const productID = event.currentTarget.getAttribute('data-product-id');
    await removeFromWishlist(productID);
    await loadWishlistItems();
}

async function removeFromWishlist(productID, options = {}) {
    const userID = getUserID();

    try {
        if (userID) {
            const response = await fetch(`/api/v1/wishlist/${productID}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userID })
            });
            if (!response.ok) throw new Error(`Wishlist delete failed: ${response.status}`);
        }

        const nextWishlist = getLocalWishlist().filter((item) => String(item.id) !== String(productID));
        localStorage.setItem('wishlist', JSON.stringify(nextWishlist));
        setBadgeCount(nextWishlist.length);

        if (!options.silent) showNotification('Removed from wishlist', 'info');
    } catch (error) {
        console.error('[Wishlist] Error removing item:', error);
        showNotification('Could not remove item', 'error');
    }
}

async function updateWishlistBadge() {
    const userID = getUserID();
    const localItems = getLocalWishlist();

    if (!userID) {
        setBadgeCount(localItems.length);
        return;
    }

    try {
        const response = await fetch(`/api/v1/wishlist/count/${userID}`);
        if (!response.ok) throw new Error(`Count failed: ${response.status}`);
        const data = await response.json();
        setBadgeCount(Number(data.data || 0));
    } catch (error) {
        console.warn('[Wishlist] Falling back to local wishlist count:', error);
        setBadgeCount(localItems.length);
    }
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `site-toast site-toast--${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('site-toast--leaving');
        setTimeout(() => notification.remove(), 260);
    }, 2600);
}

async function initializeWishlist() {
    await loadWishlistItems();
    await updateWishlistBadge();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeWishlist);
} else {
    initializeWishlist();
}
