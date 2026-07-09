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

    function normalizeRecommendationCategory(item) {
        const text = [
            item?.product_name,
            item?.name,
            item?.description,
            item?.brand,
            item?.category,
            item?.product_type,
            item?.type
        ].filter(Boolean).join(' ').toLowerCase();

        if (/\b(iphone|galaxy|pixel|smartphone|cellphone|mobile phone|phone)\b/.test(text)) return 'phone';
        if (/(phone case|screen protector|phone cover)/.test(text)) return 'phone_accessory';
        if (/(duo|mfa|multi.?factor|2fa|authentication|security license)/.test(text)) return 'duo_license';
        if (/(microsoft|office|365|windows|teams|sharepoint|outlook|license|licence|software)/.test(text)) return 'microsoft_license';
        if (/(laptop bag|notebook bag|backpack|sleeve|carry case|bag)/.test(text)) return 'laptop_bag';
        if (/(keyboard|keys|keychron|wireless keyboard)/.test(text)) return 'keyboard';
        if (/(mouse|mice|mx master|wireless mouse|mouse set|combo)/.test(text)) return 'mouse';
        if (/(laptop|notebook|macbook|thinkpad|ideapad|latitude|xps|elitebook|probook|surface|swift|aspire|legion|vivobook)/.test(text)) return 'laptop';
        if (/(monitor|display|screen|lcd|led|uhd|fhd|qhd)/.test(text)) return 'monitor';
        if (/(charger|adapter|power supply|usb.?c|type.?c|dock|hub|charging)/.test(text)) return 'charger';
        if (/(warranty|support|care pack|onsite|service plan)/.test(text)) return 'support';
        if (/(stand|riser|wrist rest|accessor|cable|headset|speaker|webcam)/.test(text)) return 'accessory';
        return 'hardware';
    }

    const relatedCategoryWeights = {
        phone: { phone_accessory: 100, charger: 92, support: 72, duo_license: 58, microsoft_license: 48, accessory: 42 },
        phone_accessory: { phone: 90, charger: 76, support: 42 },
        laptop: { microsoft_license: 96, duo_license: 94, laptop_bag: 88, monitor: 82, charger: 76, support: 72, keyboard: 58, mouse: 52, accessory: 46 },
        monitor: { laptop: 76, keyboard: 70, mouse: 64, charger: 34, support: 30 },
        microsoft_license: { duo_license: 98, support: 80, laptop: 62, phone: 28 },
        duo_license: { microsoft_license: 92, support: 82, laptop: 54, phone: 44 },
        laptop_bag: { laptop: 88, charger: 58, support: 34 },
        keyboard: { mouse: 82, monitor: 64, laptop: 42, accessory: 36 },
        mouse: { keyboard: 78, laptop: 34, monitor: 28 },
        charger: { laptop: 70, phone: 86, phone_accessory: 72, laptop_bag: 42 },
        support: { laptop: 62, phone: 60, microsoft_license: 40, duo_license: 42 },
        accessory: { laptop: 48, phone: 38, keyboard: 34, mouse: 34 },
        hardware: { laptop: 34, support: 28, accessory: 24 }
    };

    function getRecommendationReasonForMatch(sourceCategories, targetCategory, context) {
        const sourceSet = new Set(sourceCategories);
        if (sourceSet.has('phone') && targetCategory === 'charger') return 'Power and charging match for the phone in your cart.';
        if (sourceSet.has('phone') && targetCategory === 'phone_accessory') return 'Protection or accessory pick for the phone you selected.';
        if (sourceSet.has('phone') && targetCategory === 'support') return 'Useful protection for a mobile device purchase.';
        if (sourceSet.has('laptop') && targetCategory === 'microsoft_license') return 'Productivity software match for your laptop setup.';
        if (sourceSet.has('laptop') && targetCategory === 'duo_license') return 'Security add-on for the device and user sign-ins.';
        if (sourceSet.has('laptop') && targetCategory === 'monitor') return 'Desk setup match for your laptop purchase.';
        if (sourceSet.has('laptop') && targetCategory === 'laptop_bag') return 'Protection and carry option for your laptop.';
        if (sourceSet.has('monitor') && ['keyboard', 'mouse'].includes(targetCategory)) return 'Workspace add-on that fits a monitor setup.';
        if (sourceSet.has('microsoft_license') && targetCategory === 'duo_license') return 'Security pairing for your productivity license.';
        if (context === 'checkout') return 'Last-minute pick based on what you selected.';
        if (context === 'cart') return 'Smart cart match selected from related items.';
        return 'Smart match based on your selected product.';
    }

    function scoreRecommendation(item, sourceItems, options) {
        const targetCategory = normalizeRecommendationCategory(item);
        const sourceCategories = sourceItems.map(normalizeRecommendationCategory).filter(Boolean);
        const sourceSet = new Set(sourceCategories);
        let score = 0;

        sourceCategories.forEach(sourceCategory => {
            score += relatedCategoryWeights[sourceCategory]?.[targetCategory] || 0;
        });

        if (sourceSet.has(targetCategory)) score -= 34;
        if (sourceSet.has('phone') && ['mouse', 'keyboard', 'monitor', 'laptop_bag'].includes(targetCategory)) score -= 120;
        if (sourceSet.has('laptop') && targetCategory === 'phone_accessory') score -= 90;
        if (sourceSet.has('microsoft_license') && ['mouse', 'keyboard'].includes(targetCategory) && !sourceSet.has('laptop')) score -= 55;

        const sourceMaxPrice = Math.max(...sourceItems.map(item => Number(item.price) || 0), Number(options.price) || 0, 0);
        const candidatePrice = Number(item.price) || 0;
        if (sourceMaxPrice && candidatePrice) {
            const ratio = candidatePrice / sourceMaxPrice;
            if (ratio >= 0.02 && ratio <= 0.42) score += 18;
            else if (ratio > 0.42 && ratio <= 0.85) score += 8;
            else if (ratio > 1.05) score -= 16;
        }

        const apiScore = Number(item.recommendation_score) || 0;
        if (apiScore) score += Math.min(apiScore, 35);
        score += Math.min(Number(item.quantity) || 0, 25) * 0.2;

        return { score, targetCategory, sourceCategories };
    }

    function weightedRandomize(recommendations, options, cartItems) {
        const sourceItems = [options.product, ...(cartItems || []), ...getRecentlyViewed().slice(-4)].filter(Boolean);
        if (!sourceItems.length || !recommendations.length) return recommendations.sort(() => Math.random() - 0.5);

        const cartIds = new Set((cartItems || []).map(item => Number(item.id)).filter(Boolean));
        const scored = recommendations
            .filter(item => item && !cartIds.has(Number(item.id)))
            .map(item => {
                const scoredItem = scoreRecommendation(item, sourceItems, options);
                return {
                    ...item,
                    category: item.category || scoredItem.targetCategory,
                    reason: getRecommendationReasonForMatch(scoredItem.sourceCategories, scoredItem.targetCategory, options.context || options.placement),
                    _smartScore: scoredItem.score
                };
            })
            .filter(item => item._smartScore > 0)
            .sort((a, b) => b._smartScore - a._smartScore);

        const pool = scored.slice(0, Math.max(Number(options.limit || 3) * 4, 10));
        const picked = [];
        while (pool.length && picked.length < (Number(options.fetchLimit) || pool.length)) {
            const total = pool.reduce((sum, item) => sum + Math.max(item._smartScore, 1), 0);
            let cursor = Math.random() * total;
            const index = pool.findIndex(item => {
                cursor -= Math.max(item._smartScore, 1);
                return cursor <= 0;
            });
            picked.push(...pool.splice(index >= 0 ? index : 0, 1));
        }

        return picked.map(({ _smartScore, ...item }) => item);
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
        const recommendations = weightedRandomize((result?.data?.recommendations || []).filter((item) => hasUsableImage(item.image_url)), options, cartItems);
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
