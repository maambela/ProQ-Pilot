(function () {
    const CACHE_TTL = 5 * 60 * 1000;
    const CART_CACHE_TTL = 45 * 1000;
    const DEFAULT_IMAGE = '/Images/DUO.png';
    let cartCache = null;

    function safeText(value) {
        return String(value || '').replace(/[<>&"']/g, (char) => ({
            '<': '&lt;',
            '>': '&gt;',
            '&': '&amp;',
            '"': '&quot;',
            "'": '&#039;'
        }[char]));
    }

    function getUser() {
        try {
            return JSON.parse(localStorage.getItem('user'));
        } catch (error) {
            return null;
        }
    }

    function getSessionId() {
        let sessionId = localStorage.getItem('stackRecommendationSession');
        if (!sessionId) {
            sessionId = `guest-${Date.now()}-${Math.random().toString(16).slice(2)}`;
            localStorage.setItem('stackRecommendationSession', sessionId);
        }
        return sessionId;
    }

    function normalizeImage(url) {
        if (!url) return DEFAULT_IMAGE;
        if (/^https?:\/\//i.test(url) || url.startsWith('/')) return url;
        return `/product_images/${url}`;
    }

    function hasUsableImage(url) {
        return Boolean(url && String(url).trim() && !/DUO\.png$/i.test(String(url)));
    }

    function normalizeCartItem(item) {
        return {
            id: Number(item.id || item.productID || item.product_id) || 0,
            product_name: item.product_name || item.name || '',
            description: item.description || '',
            price: Number(item.price) || 0,
            quantity: Number(item.quantity) || 1,
            image_url: item.image_url || item.image || '',
            category: item.category || item.product_type || item.type || '',
            type: item.cart_type || item.type || ''
        };
    }

    async function getCartItems(providedItems) {
        if (Array.isArray(providedItems)) {
            return providedItems.map(normalizeCartItem);
        }

        const user = getUser();
        if (user?.userID) {
            if (cartCache && Date.now() - cartCache.createdAt < CART_CACHE_TTL) {
                return cartCache.items;
            }

            try {
                const response = await fetch(`/api/v1/cart/${user.userID}`);
                const result = await response.json();
                const items = Array.isArray(result?.data) ? result.data.map(normalizeCartItem) : [];
                cartCache = { createdAt: Date.now(), items };
                return items;
            } catch (error) {
                console.warn('[Recommendations] Could not load server cart:', error);
            }
        }

        try {
            return (JSON.parse(localStorage.getItem('cart')) || []).map(normalizeCartItem);
        } catch (error) {
            return [];
        }
    }

    function getRecentlyViewed() {
        try {
            return JSON.parse(localStorage.getItem('recentlyViewedProducts')) || [];
        } catch (error) {
            return [];
        }
    }

    function rememberProduct(product) {
        if (!product?.id) return;

        const recent = getRecentlyViewed().filter((item) => Number(item.id) !== Number(product.id));
        recent.push({
            id: product.id,
            product_name: product.product_name,
            category: product.category || product.product_type || '',
            price: Number(product.price) || 0,
            viewedAt: Date.now()
        });

        localStorage.setItem('recentlyViewedProducts', JSON.stringify(recent.slice(-10)));
    }

    function readCache(key) {
        try {
            const cached = JSON.parse(sessionStorage.getItem(key));
            if (cached && Date.now() - cached.createdAt < CACHE_TTL) return cached.data;
        } catch (error) {
            return null;
        }
        return null;
    }

    function writeCache(key, data) {
        try {
            sessionStorage.setItem(key, JSON.stringify({ createdAt: Date.now(), data }));
        } catch (error) {
            // Ignore quota errors; recommendations should never block checkout.
        }
    }

    function showSkeleton(container, options) {
        const count = Math.max(2, Math.min(options.limit || 3, 5));
        container.classList.add('recommendation-section', options.compact ? 'recommendation-section--compact' : 'recommendation-section--standard');
        container.innerHTML = `
            <div class="recommendation-heading">
                <div>
                    <span class="recommendation-kicker">AI picks</span>
                    <h3>${safeText(options.title || 'Recommended add-ons')}</h3>
                </div>
            </div>
            <div class="recommendation-grid" aria-busy="true">
                ${Array.from({ length: count }).map(() => `
                    <div class="recommendation-card recommendation-card--skeleton">
                        <div class="recommendation-image"></div>
                        <div class="recommendation-copy">
                            <span></span>
                            <strong></strong>
                            <p></p>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    function cardTemplate(item, compact) {
        const price = Number(item.price || 0).toLocaleString();
        return `
            <article class="recommendation-card${compact ? ' recommendation-card--compact' : ''}" data-product-id="${item.id}">
                <a class="recommendation-image" href="/product.html?id=${item.id}" aria-label="View ${safeText(item.product_name)}">
                    <img src="${normalizeImage(item.image_url)}" alt="${safeText(item.product_name)}" width="220" height="160" loading="lazy" decoding="async" onerror="this.src='${DEFAULT_IMAGE}'">
                </a>
                <div class="recommendation-copy">
                    <span>${safeText(item.brand || item.category || 'Add-on')}</span>
                    <a href="/product.html?id=${item.id}">${safeText(item.product_name)}</a>
                    <p>${safeText(item.reason)}</p>
                    <div class="recommendation-bottom">
                        <strong>R${price}</strong>
                        <button type="button" class="recommendation-add" data-add-recommendation="${item.id}">Add to cart</button>
                    </div>
                </div>
            </article>
        `;
    }

    function render(container, recommendations, options) {
        const offset = Number(options.offset) || 0;
        const visible = recommendations.slice(offset, offset + (Number(options.limit) || 3));

        if (!visible.length) {
            container.hidden = true;
            return;
        }

        container.hidden = false;
        container.classList.add('recommendation-section', options.compact ? 'recommendation-section--compact' : 'recommendation-section--standard');
        container.innerHTML = `
            <div class="recommendation-heading">
                <div>
                    <span class="recommendation-kicker">AI picks</span>
                    <h3>${safeText(options.title || 'Recommended add-ons')}</h3>
                </div>
                ${options.bundleReady ? '<small>Bundle-ready</small>' : ''}
            </div>
            <div class="recommendation-grid">
                ${visible.map((item) => cardTemplate(item, options.compact)).join('')}
            </div>
        `;

        container.querySelectorAll('[data-add-recommendation]').forEach((button) => {
            button.addEventListener('click', async () => {
                const id = Number(button.dataset.addRecommendation);
                const product = recommendations.find((item) => Number(item.id) === id);
                if (!product) return;
                await addToCart(product, button);
            });
        });
    }

    async function requestRecommendations(options) {
        const cartItems = await getCartItems(options.cartItems);
        const cartIds = cartItems.map((item) => item.id).filter(Boolean).sort((a, b) => a - b).join(',');
        const productId = options.product?.id || options.productId || null;
        const fetchLimit = Math.max(3, Math.min(Number(options.fetchLimit) || 5, 8));
        const randomize = Boolean(options.randomize || options.context === 'product');
        const randomSeed = randomize ? `${Date.now()}-${Math.random().toString(16).slice(2)}` : '';
        const cacheKey = `stack-recommendations:${options.context || options.placement || 'product'}:${productId || 'none'}:${cartIds}:${fetchLimit}:${randomSeed}`;
        const cached = options.noCache || randomize ? null : readCache(cacheKey);
        if (cached) return cached;

        const user = getUser();
        const response = await fetch('/api/v1/recommendations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                productId,
                cartItems,
                category: options.category || options.product?.category || options.product?.product_type || options.product?.product_name,
                price: options.price || options.product?.price,
                userId: user?.userID,
                sessionId: getSessionId(),
                recentlyViewed: getRecentlyViewed(),
                context: options.context || options.placement || 'product',
                limit: fetchLimit,
                randomSeed,
                noCache: Boolean(options.noCache || randomize)
            })
        });

        if (!response.ok) throw new Error('Recommendation request failed');
        const result = await response.json();
        const recommendations = (result?.data?.recommendations || []).filter((item) => hasUsableImage(item.image_url));
        if (!options.noCache && !randomize) writeCache(cacheKey, recommendations);
        return recommendations;
    }

    async function addToCart(product, button) {
        const originalText = button.textContent;
        button.disabled = true;
        button.textContent = 'Adding...';

        try {
            const user = getUser();
            if (user?.userID) {
                await fetch('/api/v1/cart/sync', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userID: user.userID,
                        items: [{ id: product.id, quantity: 1 }]
                    })
                });
                cartCache = null;
            } else {
                const cart = JSON.parse(localStorage.getItem('cart')) || [];
                const index = cart.findIndex((item) => Number(item.id) === Number(product.id));
                if (index >= 0) {
                    cart[index].quantity = Number(cart[index].quantity || 1) + 1;
                } else {
                    cart.push({
                        id: product.id,
                        product_name: product.product_name,
                        price: product.price,
                        image_url: product.image_url,
                        description: product.description,
                        quantity: 1
                    });
                }
                localStorage.setItem('cart', JSON.stringify(cart));
            }

            const currentCount = Number(localStorage.getItem('cartCount')) || 0;
            localStorage.setItem('cartCount', currentCount + 1);
            document.querySelectorAll('#cart-count, .cart-badge').forEach((badge) => {
                badge.textContent = Number(badge.textContent || currentCount) + 1;
            });

            button.textContent = 'Added';
            button.closest('.recommendation-card')?.classList.add('recommendation-card--added');
            window.dispatchEvent(new CustomEvent('stack:cart-updated', { detail: { product } }));
        } catch (error) {
            console.error('[Recommendations] Add to cart failed:', error);
            button.disabled = false;
            button.textContent = originalText;
        }
    }

    function init(options) {
        const container = typeof options.container === 'string'
            ? document.querySelector(options.container)
            : options.container;

        if (!container) return;
        rememberProduct(options.product);
        showSkeleton(container, options);

        const load = () => {
            requestRecommendations(options)
                .then((recommendations) => render(container, recommendations, options))
                .catch((error) => {
                    console.warn('[Recommendations] Hidden after load error:', error);
                    container.hidden = true;
                });
        };

        if ('requestIdleCallback' in window) {
            requestIdleCallback(load, { timeout: 1200 });
        } else {
            setTimeout(load, 80);
        }
    }

    window.StackRecommendations = {
        init,
        rememberProduct,
        addToCart
    };
})();
