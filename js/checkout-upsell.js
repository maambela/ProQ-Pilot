/* ===== SMART CHECKOUT UPSELL POPUP ===== */
/* Shown right before "Proceed to Checkout" when the recommendation engine finds a genuinely
   strong, cart-aware add-on (server-side quality bar — see context:'checkout' in server.js).
   If nothing clears that bar, maybeShow() resolves immediately with no popup at all. */
(function () {
    'use strict';

    function normalizeUpsellImage(url) {
        const value = String(url || '').trim();
        if (!value) return '/Images/product-placeholder.svg';
        if (/^https?:\/\//i.test(value)) return `/image-proxy?url=${encodeURIComponent(value)}`;
        if (value.startsWith('/')) return value;
        if (/^Images\//i.test(value)) return `/${value}`;
        return `/product_images/${value}`;
    }

    function trackUpsellEvent(event, detail) {
        console.log(`[Checkout Upsell] ${event}`, detail || '');
        try {
            const payload = new Blob([JSON.stringify({ event, ...detail })], { type: 'application/json' });
            navigator.sendBeacon('/api/v1/analytics/checkout-upsell', payload);
        } catch (error) {
            // Analytics is best-effort only and must never block checkout.
        }
    }

    async function addRecommendationToCart(item) {
        const user = JSON.parse(localStorage.getItem('user') || 'null');
        if (user && user.userID) {
            const response = await fetch('/api/v1/cart/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userID: user.userID, items: [{ id: item.id, quantity: 1 }] })
            });
            if (!response.ok) throw new Error(`Add to cart failed: ${response.status}`);
        } else {
            const cart = JSON.parse(localStorage.getItem('cart') || '[]');
            const existing = cart.find((entry) => String(entry.id) === String(item.id));
            if (existing) {
                existing.quantity = (Number(existing.quantity) || 1) + 1;
            } else {
                cart.push({
                    id: item.id,
                    product_name: item.product_name,
                    price: item.price,
                    image_url: item.image_url,
                    description: item.description,
                    quantity: 1
                });
            }
            localStorage.setItem('cart', JSON.stringify(cart));
        }
        window.dispatchEvent(new CustomEvent('stack:cart-updated'));
    }

    function buildItemRow(item, cartSize) {
        const row = document.createElement('div');
        row.className = 'checkout-upsell-item';

        const imageWrap = document.createElement('div');
        imageWrap.className = 'checkout-upsell-item-image';
        const img = document.createElement('img');
        img.src = normalizeUpsellImage(item.image_url);
        img.alt = '';
        img.loading = 'lazy';
        img.onerror = function handleError() { this.onerror = null; this.src = '/Images/product-placeholder.svg'; };
        imageWrap.appendChild(img);

        const body = document.createElement('div');
        body.className = 'checkout-upsell-item-body';

        const name = document.createElement('div');
        name.className = 'checkout-upsell-item-name';
        name.textContent = String(item.product_name || 'Recommended add-on').split(/\s+/).slice(0, 6).join(' ');

        const reason = document.createElement('p');
        reason.className = 'checkout-upsell-item-reason';
        reason.textContent = item.reason || '';

        const footer = document.createElement('div');
        footer.className = 'checkout-upsell-item-footer';

        const price = document.createElement('span');
        price.className = 'checkout-upsell-item-price';
        const numericPrice = Number(item.price) || 0;
        price.textContent = `R${numericPrice.toLocaleString()}`;

        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'checkout-upsell-add';
        addBtn.textContent = '+ Add to cart';
        addBtn.addEventListener('click', async () => {
            addBtn.disabled = true;
            addBtn.textContent = 'Adding…';
            try {
                await addRecommendationToCart(item);
                addBtn.textContent = '✓ Added';
                trackUpsellEvent('accepted', { productId: item.id, category: item.category, cartSize });
            } catch (error) {
                console.error('[Checkout Upsell] Failed to add recommended item:', error);
                addBtn.disabled = false;
                addBtn.textContent = '+ Add to cart';
            }
        });

        footer.appendChild(price);
        footer.appendChild(addBtn);
        body.appendChild(name);
        if (item.reason) body.appendChild(reason);
        body.appendChild(footer);

        row.appendChild(imageWrap);
        row.appendChild(body);
        return row;
    }

    function showModal(recommendations, cartSize) {
        return new Promise((resolve) => {
            const overlay = document.getElementById('checkoutUpsellOverlay');
            const headlineEl = document.getElementById('checkoutUpsellHeadline');
            const subtextEl = document.getElementById('checkoutUpsellSubtext');
            const itemsEl = document.getElementById('checkoutUpsellItems');
            const closeBtn = document.getElementById('checkoutUpsellClose');
            const continueBtn = document.getElementById('checkoutUpsellContinue');

            if (!overlay || !headlineEl || !itemsEl || !closeBtn || !continueBtn) {
                resolve();
                return;
            }

            headlineEl.textContent = recommendations[0].headline || 'Would you like to add something useful?';
            if (subtextEl) {
                subtextEl.textContent = recommendations.length === 1 ? (recommendations[0].reason || '') : '';
                subtextEl.hidden = !subtextEl.textContent;
            }

            itemsEl.innerHTML = '';
            recommendations.forEach((item) => itemsEl.appendChild(buildItemRow(item, cartSize)));

            let settled = false;
            const finish = () => {
                if (settled) return;
                settled = true;
                overlay.hidden = true;
                closeBtn.removeEventListener('click', onDecline);
                continueBtn.removeEventListener('click', onDecline);
                overlay.removeEventListener('click', onOverlayClick);
                document.removeEventListener('keydown', onKeydown);
                resolve();
            };
            const onDecline = () => {
                trackUpsellEvent('rejected', { cartSize, count: recommendations.length });
                finish();
            };
            const onOverlayClick = (event) => { if (event.target === overlay) onDecline(); };
            const onKeydown = (event) => { if (event.key === 'Escape') onDecline(); };

            closeBtn.addEventListener('click', onDecline);
            continueBtn.addEventListener('click', onDecline);
            overlay.addEventListener('click', onOverlayClick);
            document.addEventListener('keydown', onKeydown);

            overlay.hidden = false;
            trackUpsellEvent('shown', { cartSize, count: recommendations.length, categories: recommendations.map((r) => r.category) });
        });
    }

    window.ProQCheckoutUpsell = {
        // cartItems: the cart array as rendered on cart.html. proceed: called exactly once,
        // whether or not a popup was shown, to continue on to checkout.
        async maybeShow(cartItems, proceed) {
            const items = Array.isArray(cartItems) ? cartItems : [];
            try {
                const response = await fetch('/api/v1/recommendations', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        cartItems: items.map((item) => ({
                            id: item.id || item.product_id,
                            product_name: item.name || item.product_name,
                            description: item.description,
                            price: item.price
                        })),
                        context: 'checkout',
                        limit: 4,
                        noCache: true
                    })
                });
                const result = await response.json();
                const recommendations = (result?.data?.recommendations || []).slice(0, 3);
                if (!recommendations.length) {
                    proceed();
                    return;
                }
                await showModal(recommendations, items.length);
                proceed();
            } catch (error) {
                // A bad recommendation is worse than none, but a broken checkout is worse than
                // both — any failure here just skips straight to checkout.
                console.warn('[Checkout Upsell] Skipping popup, recommendation check failed:', error);
                proceed();
            }
        }
    };
})();
