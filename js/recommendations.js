(function () {
    const CACHE_TTL = 5 * 60 * 1000;
    const CART_CACHE_TTL = 45 * 1000;
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

    // Supplier images (S3/Tarsus/Core) must go through /image-proxy like everywhere else in the
    // app — fetching them directly from the browser fails, which is what left recommendation
    // cards showing a broken-image icon while the same product rendered fine in the store grid.
    function normalizeImage(url, item) {
        const value = String(url || '').trim();
        // hasUsableImage also rejects the Cisco Duo logo, which is used as a generic
        // fallback elsewhere and must never stand in for an unrelated product.
        if (!hasUsableImage(value)) return getRecommendationFallbackImage(item);
        if (/^(data:|blob:)/i.test(value)) return value;
        if (/^https?:\/\//i.test(value)) return `/image-proxy?url=${encodeURIComponent(value)}`;
        if (value.startsWith('/')) return value;
        if (/^Images\//i.test(value)) return `/${value}`;
        if (/^product_images\//i.test(value)) return `/${value}`;
        return `/product_images/${value}`;
    }

    // A product with no usable image still deserves a picture that looks like what it is, rather
    // than an empty card. Falls back to the neutral placeholder only when nothing matches.
    function getRecommendationFallbackImage(item) {
        if (!item) return '/Images/product-placeholder.svg';
        const text = [item.product_name, item.name, item.description, item.brand]
            .filter(Boolean).join(' ').toLowerCase();
        if (!text) return '/Images/product-placeholder.svg';

        const looksLikeComputerSpec =
            /\b(i[3579]|core|intel|ryzen|amd|celeron|pentium|snapdragon|ultra\s?[3579]|apple m[1-4]|\bm[1-4]\b|n100|n200)\b/.test(text) &&
            /\b(4|8|12|16|18|24|32|36|48|64)\s?gb\b/.test(text);
        const explicitLaptop = /\b(laptop|notebook|macbook|\bmba\b|\bmbp\b|thinkpad|ideapad|latitude|xps|elitebook|probook|swift|aspire|legion|vivobook|nitro|predator|alienware)\b/.test(text);
        const isTower = /\b(tower|desktop pc|optiplex|thinkcentre|prodesk|elitedesk|mini pc|workstation|precision|zbook)\b/.test(text);
        const isLaptop = (explicitLaptop || looksLikeComputerSpec) && !isTower;

        if (/\b(duo|mfa|multi.?factor|authentication)\b/.test(text)) return '/Images/DUO.png';
        if (/\b(microsoft 365|office 365|\bm365\b|\boffice\b)\b/.test(text)) return '/Images/Microsoft.png';
        if (isTower) return '/Images/workstation0.png';
        if (/\b(apple|macbook|\bmba\b|\bmbp\b)\b/.test(text) && isLaptop) return '/Images/Macbook.webp';
        if (/\b(gaming|gamer|alienware|nitro|predator|\brog\b|rtx|geforce)\b/.test(text) && isLaptop) return '/Images/gaming.avif';
        if (isLaptop) return '/Images/Laptopsforbusiness.avif';
        if (/\b(monitor|display|\bfhd\b|\bqhd\b|\buhd\b|\b4k\b)\b/.test(text)) return '/Images/monitors.jpg';
        if (/\b(watch|smartwatch|wearable)\b/.test(text)) return '/Images/watch.webp';
        return '/Images/product-placeholder.svg';
    }

    function hasUsableImage(url) {
        return Boolean(url && String(url).trim() && !/DUO\.png$/i.test(String(url)));
    }

    function normalizeCartItem(item) {
        return {
            id: item.id || item.productID || item.product_id || 0,
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

        const recent = getRecentlyViewed().filter((item) => String(item.id) !== String(product.id));
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

        // Must stay in step with normalizeRecommendationCategory() in server.js. Display keywords
        // only win after a product has been ruled out as a computer, otherwise laptops (whose specs
        // always mention FHD/display) register as monitors and pull other laptops back as "add-ons".
        const looksLikeComputer =
            /\b(i[3579]|core|intel|ryzen|amd|celeron|pentium|snapdragon|ultra\s?[3579]|apple m[1-4]|\bm[1-4]\b|n100|n200)\b/.test(text) &&
            /\b(4|8|12|16|18|24|32|36|48|64)\s?gb\b/.test(text) &&
            /\b((128|256|512|1024|2048)\s?gb|[1248]\s?tb)\b/.test(text);
        const explicitLaptop = /(laptop|notebook|macbook|thinkpad|ideapad|latitude|xps|elitebook|probook|surface|swift|aspire|legion|vivobook|mba\b|mbp\b)/.test(text);

        // A real laptop/desktop spec dump routinely bundles a warranty clause, an AC adapter, an
        // integrated webcam and a backlit keyboard into its OWN description (e.g. "...65 Watt AC
        // adapter, Windows 11 Pro, 3 Year ProSupport and Next Business Day Onsite Warranty..."),
        // so these accessory checks must also confirm the text isn't already a full machine —
        // otherwise the device gets classified as 'support'/'charger'/etc. and the same-category
        // exclusion below never fires, letting another laptop back in as an "add-on".
        // Deliberately not also checking !explicitLaptop here: an accessory's own description often
        // says "for laptops" (a charger, stand or bag naming its target device), and explicitLaptop
        // matches that bare word. looksLikeComputer's three-part processor+RAM+storage signature is
        // the reliable signal that the text is actually describing a machine, not an accessory for one.
        const isStandaloneAccessory = !looksLikeComputer;
        if (/(warranty|care pack|carepack|onsite|service plan|support plan|extended service)/.test(text) && isStandaloneAccessory) return 'support';
        if (/(charger|power adapter|power supply|ac adapter|charging cable|power brick)/.test(text) && isStandaloneAccessory) return 'charger';
        if (/(phone case|screen protector|phone cover)/.test(text)) return 'phone_accessory';
        if (/\b(iphone|galaxy|pixel|smartphone|cellphone|mobile phone|phone)\b/.test(text) && !looksLikeComputer && !explicitLaptop) return 'phone';
        if (/(duo|mfa|multi.?factor|2fa|authentication|security license)/.test(text) && isStandaloneAccessory) return 'duo_license';
        if (/(microsoft 365|office 365|\bm365\b|\boffice\b|teams|sharepoint|outlook|licen[cs]e|subscription|software)/.test(text) && !looksLikeComputer && !explicitLaptop) return 'microsoft_license';
        if (/(laptop bag|notebook bag|backpack|sleeve|carry case|\bbag\b|messenger|topload|briefcase)/.test(text)) return 'laptop_bag';
        if (/(webcam|web cam|conference camera|video bar)/.test(text) && isStandaloneAccessory) return 'webcam';
        if (/(keyboard (and|&|\+) mouse|mouse (and|&|\+) keyboard|desktop combo|wireless combo|combo set|keyboard mouse set)/.test(text) && isStandaloneAccessory) return 'combo';
        if (/(keyboard|keychron|wireless keyboard)/.test(text) && isStandaloneAccessory) return 'keyboard';
        if (/(mouse|mice|mx master|wireless mouse|mouse set)/.test(text) && isStandaloneAccessory) return 'mouse';
        if (/(tower|desktop pc|\bsff\b|small form factor|optiplex|thinkcentre|prodesk|elitedesk|mini pc|micro form factor|\baio\b|all.in.one)/.test(text)) return 'desktop';
        if (explicitLaptop || looksLikeComputer) return 'laptop';
        if (/(monitor|display|screen|lcd|led|uhd|fhd|qhd)/.test(text)) return 'monitor';
        if (/(charger|adapter|power supply|usb.?c|type.?c|dock|hub|charging)/.test(text)) return 'charger';
        if (/(stand|riser|wrist rest|accessor|cable|headset|speaker)/.test(text)) return 'accessory';
        return 'hardware';
    }

    function isGamingProduct(item) {
        const text = [item?.product_name, item?.name, item?.description, item?.brand]
            .filter(Boolean).join(' ').toLowerCase();
        return /\b(gaming|gamer|alienware|nitro|predator|rog|republic of gamers|tuf|omen|victus|legion|raider|katana|rtx|geforce|radeon rx|rgb|165hz|144hz|240hz|mechanical)\b/.test(text);
    }

    // Mirrors relatedCategoryWeights in server.js.
    const relatedCategoryWeights = {
        phone: { phone_accessory: 100, charger: 92, support: 72, duo_license: 58, microsoft_license: 48, accessory: 42 },
        phone_accessory: { phone: 90, charger: 76, support: 42 },
        laptop: { laptop_bag: 100, combo: 96, microsoft_license: 94, duo_license: 92, mouse: 90, keyboard: 88, monitor: 80, support: 78, charger: 74, webcam: 66, accessory: 58 },
        desktop: { monitor: 100, combo: 96, keyboard: 90, mouse: 90, webcam: 86, duo_license: 84, microsoft_license: 82, support: 72, accessory: 56, charger: 30 },
        monitor: { combo: 84, keyboard: 76, mouse: 74, webcam: 70, accessory: 56, support: 36 },
        microsoft_license: { duo_license: 98, support: 80, laptop: 62, phone: 28 },
        duo_license: { microsoft_license: 92, support: 82, laptop: 54, phone: 44 },
        laptop_bag: { laptop: 88, charger: 58, support: 34 },
        keyboard: { mouse: 92, monitor: 75, accessory: 72, laptop: 58, desktop: 52, support: 30 },
        mouse: { keyboard: 88, laptop_bag: 68, monitor: 64, accessory: 60, laptop: 45, desktop: 45 },
        combo: { monitor: 88, webcam: 70, desktop: 64, laptop: 58, accessory: 56, support: 34 },
        webcam: { combo: 72, monitor: 68, keyboard: 60, mouse: 60, desktop: 58, laptop: 52, accessory: 50 },
        charger: { laptop: 70, phone: 86, phone_accessory: 72, laptop_bag: 42 },
        support: { laptop: 62, phone: 60, microsoft_license: 40, duo_license: 42 },
        accessory: { laptop: 48, phone: 38, keyboard: 34, mouse: 34 },
        hardware: { laptop: 34, support: 28, accessory: 24 }
    };

    const COMPLETION_CATEGORIES = ['laptop_bag', 'mouse', 'keyboard', 'combo', 'duo_license', 'microsoft_license', 'monitor', 'webcam', 'charger', 'support'];

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

        // Never answer "I'm looking at a laptop" with another laptop.
        if (sourceSet.has(targetCategory)) score -= 130;
        if ((sourceSet.has('laptop') || sourceSet.has('desktop')) && ['laptop', 'desktop'].includes(targetCategory)) score -= 130;
        if (sourceSet.has('phone') && ['mouse', 'keyboard', 'monitor', 'laptop_bag'].includes(targetCategory)) score -= 120;
        if (sourceSet.has('laptop') && targetCategory === 'phone_accessory') score -= 90;
        if (sourceSet.has('microsoft_license') && ['mouse', 'keyboard'].includes(targetCategory) && !sourceSet.has('laptop')) score -= 55;

        // The add-ons that complete a machine come first; a bag always applies to a laptop.
        if ((sourceSet.has('laptop') || sourceSet.has('desktop')) && COMPLETION_CATEGORIES.includes(targetCategory)) score += 45;
        if (sourceSet.has('laptop') && targetCategory === 'laptop_bag') score += 30;
        if (sourceSet.has('desktop') && ['monitor', 'combo', 'webcam'].includes(targetCategory)) score += 30;

        // Gaming machines pair with gaming peripherals.
        if (sourceItems.some(isGamingProduct)) {
            if (isGamingProduct(item) && !['laptop', 'desktop'].includes(targetCategory)) score += 55;
            else if (['keyboard', 'mouse', 'combo', 'accessory', 'webcam'].includes(targetCategory)) score -= 12;
        }

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

        const cartIds = new Set((cartItems || []).map(item => String(item.id)).filter(Boolean));
        const scored = recommendations
            .filter(item => item && !cartIds.has(String(item.id)))
            .map(item => {
                const scoredItem = scoreRecommendation(item, sourceItems, options);
                const category = item.category || scoredItem.targetCategory;
                const packageBoost = ['microsoft_license', 'duo_license', 'support', 'charger', 'laptop_bag', 'monitor', 'phone_accessory'].includes(category) ? 16 : 0;
                return {
                    ...item,
                    category,
                    reason: getRecommendationReasonForMatch(scoredItem.sourceCategories, scoredItem.targetCategory, options.context || options.placement),
                    _smartScore: scoredItem.score + packageBoost
                };
            })
            .filter(item => item._smartScore > -45)
            .sort((a, b) => b._smartScore - a._smartScore);

        const minimumPool = Math.max(Number(options.limit || 3) * 6, 14);
        const preferred = scored.filter(item => item._smartScore > 0);
        const pool = (preferred.length >= Number(options.limit || 3) ? preferred : scored).slice(0, minimumPool);
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
                    <span class="recommendation-kicker">Recommendations</span>
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
                <a class="recommendation-image" href="/product.html?id=${item.id}" data-product-link="${item.id}" aria-label="View ${safeText(item.product_name)}">
                    <img src="${normalizeImage(item.image_url, item)}" alt="" width="220" height="160" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${getRecommendationFallbackImage(item)}';">
                </a>
                <div class="recommendation-copy">
                    <span>${safeText(item.brand || item.category || 'Add-on')}</span>
                    <a href="/product.html?id=${item.id}" data-product-link="${item.id}">${safeText(item.product_name)}</a>
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
        const step = Number(options.limit) || 3;
        const shownCount = Math.min(Number(container._recShownCount) || step, recommendations.length) || step;
        const visible = recommendations.slice(0, shownCount);

        if (!visible.length) {
            container.hidden = true;
            return;
        }

        container._recShownCount = visible.length;
        const hasMore = visible.length < recommendations.length;

        container.hidden = false;
        container.classList.add('recommendation-section', options.compact ? 'recommendation-section--compact' : 'recommendation-section--standard');
        container.innerHTML = `
            <div class="recommendation-heading">
                <div>
                    <span class="recommendation-kicker">Recommendations</span>
                    <h3>${safeText(options.title || 'Recommended add-ons')}</h3>
                </div>
                ${options.bundleReady ? '<small>Bundle-ready</small>' : ''}
            </div>
            <div class="recommendation-grid">
                ${visible.map((item) => cardTemplate(item, options.compact)).join('')}
            </div>
            ${hasMore ? '<button type="button" class="recommendation-see-more">See more picks</button>' : ''}
        `;

        // Ids are matched as strings: live supplier products use virtual ids such as
        // "tarsus:AB12", which Number() turns into NaN and would never match.
        container.querySelectorAll('[data-product-link]').forEach((link) => {
            link.addEventListener('click', () => {
                const id = String(link.dataset.productLink);
                const product = recommendations.find((item) => String(item.id) === id);
                if (!product) return;
                try {
                    localStorage.setItem('proqPilotSelectedProduct:v1', JSON.stringify({
                        savedAt: Date.now(),
                        product,
                        images: [product.image_url, product.image, product.main_image].filter(Boolean)
                    }));
                } catch (error) {}
            });
        });
        container.querySelectorAll('[data-add-recommendation]').forEach((button) => {
            button.addEventListener('click', async () => {
                const id = String(button.dataset.addRecommendation);
                const product = recommendations.find((item) => String(item.id) === id);
                if (!product) return;
                await addToCart(product, button);
            });
        });
        const seeMoreButton = container.querySelector('.recommendation-see-more');
        if (seeMoreButton) {
            seeMoreButton.addEventListener('click', () => {
                container._recShownCount = shownCount + step;
                render(container, recommendations, options);
            });
        }
    }

    async function requestRecommendations(options) {
        const cartItems = await getCartItems(options.cartItems);
        const cartIds = cartItems.map((item) => item.id).filter(Boolean).sort((a, b) => a - b).join(',');
        const productId = options.product?.id || options.productId || null;
        const fetchLimit = Math.max(6, Math.min(Number(options.fetchLimit) || 12, 16));
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
        const serverRecommendations = result?.data?.recommendations || [];
        // Upgrade picks are intentionally the *same* category as the source product, which the
        // client re-ranker penalises heavily — so its ordering is used as-is.
        const recommendations = options.skipClientRerank
            ? serverRecommendations
            : weightedRandomize(serverRecommendations, options, cartItems);
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
                const index = cart.findIndex((item) => String(item.id) === String(product.id));
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
