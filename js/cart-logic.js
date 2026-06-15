document.addEventListener('DOMContentLoaded', async () => {
    const cartItemsList = document.getElementById('cartItemsList');
    const subtotalEl = document.getElementById('subtotal-price');
    const totalEl = document.getElementById('total-price');
    const deliveryEl = document.getElementById('delivery-cost');
    const user = JSON.parse(localStorage.getItem('user'));

    const DELIVERY_FEE = 75; // 📦 Fixed Delivery Cost
    const isDigitalLicenseType = (type) => (
        type === 'duo-security' ||
        type === 'duo-security-upgrade' ||
        type === 'microsoft-license'
    );

    // Helper function to extract clean laptop name (limit to 4 words max)
    function cleanProductName(fullName) {
        if (!fullName) return "Laptop";
        // Take only first 4 words
        return fullName.split(/\s+/).slice(0, 4).join(' ').trim();
    }

    // Helper function to generate smart property-based summary
    function generateSmartSummary(product, cleanName) {
        const specs = {
            ram: null,
            storage: null,
            processor: null,
            display: null,
            graphics: null
        };

        // Extract from the full description from database
        const fullText = (product.description || '').toLowerCase();

        // Extract RAM - look for patterns like "16GB RAM", "RAM 16GB", "16 GB RAM", "DDR4", etc.
        const ramPatterns = [
            /(\d+)\s*gb\s*ram/i,
            /ram\s*(\d+)\s*gb/i,
            /(\d+)\s*gb\s*dram/i,
            /dram\s*(\d+)\s*gb/i,
            /(\d+)\s*gb.*ddr\d+/i,
            /ddr\d+.*(\d+)\s*gb/i,
            /(\d+)\s*gb\s*\([^)]*\)\s*ddr\d+/i,
            /(\d+)\s*gb/i
        ];
        for (const pattern of ramPatterns) {
            const match = fullText.match(pattern);
            if (match) {
                const size = match[1] || match[2] || match[3] || match[4] || match[5] || match[6] || match[7];
                specs.ram = `${size}GB RAM`;
                break;
            }
        }

        // Extract Storage - SSD/HDD patterns (prioritize TB over GB, with digit constraints and PCIe NVMe support)
        const storagePatterns = [
            { pattern: /(\d{1,2})\s*tb.*ssd/i, sizeIndex: 1, unit: 'TB', type: 'SSD' },
            { pattern: /(\d{3})\s*gb.*ssd/i, sizeIndex: 1, unit: 'GB', type: 'SSD' },
            { pattern: /ssd.*(\d{1,2})\s*tb/i, sizeIndex: 1, unit: 'TB', type: 'SSD' },
            { pattern: /ssd.*(\d{3})\s*gb/i, sizeIndex: 1, unit: 'GB', type: 'SSD' },
            { pattern: /(\d{1,2})\s*tb.*hdd/i, sizeIndex: 1, unit: 'TB', type: 'HDD' },
            { pattern: /(\d{3})\s*gb.*hdd/i, sizeIndex: 1, unit: 'GB', type: 'HDD' },
            { pattern: /hdd.*(\d{1,2})\s*tb/i, sizeIndex: 1, unit: 'TB', type: 'HDD' },
            { pattern: /hdd.*(\d{3})\s*gb/i, sizeIndex: 1, unit: 'GB', type: 'HDD' },
            { pattern: /(\d{1,2})\s*tb\s*pcie.*nvme/i, sizeIndex: 1, unit: 'TB', type: 'SSD' },
            { pattern: /(\d{3})\s*gb\s*pcie.*nvme/i, sizeIndex: 1, unit: 'GB', type: 'SSD' },
            { pattern: /pcie.*nvme.*(\d{1,2})\s*tb/i, sizeIndex: 1, unit: 'TB', type: 'SSD' },
            { pattern: /pcie.*nvme.*(\d{3})\s*gb/i, sizeIndex: 1, unit: 'GB', type: 'SSD' },
            { pattern: /(\d{1,2})\s*(tb)\s*storage/i, sizeIndex: 1, unitIndex: 2, type: 'SSD' },
            { pattern: /(\d{3})\s*(gb)\s*storage/i, sizeIndex: 1, unitIndex: 2, type: 'SSD' }
        ];
        for (const item of storagePatterns) {
            const match = fullText.match(item.pattern);
            if (match) {
                const size = match[item.sizeIndex];
                const unit = item.unit || match[item.unitIndex || 2].toUpperCase();
                const type = item.type;
                specs.storage = `${size}${unit} ${type}`;
                break;
            }
        }

        // Extract Processor - Intel/AMD patterns
        const processorPatterns = [
            /(intel\s*core\s*i\d+)/i,
            /(core\s*i\d+)/i,
            /(i\d+)\s*processor/i,
            /(amd\s*ryzen\s*\d+)/i,
            /(ryzen\s*\d+)/i,
            /(ryze[n]?\s*\d+)/i,
            /(ultra\s*\d+)/i,
            /(u\d+)/i,
            /(i\d+)/i,
            /(ryze[n]?\s*\d+\s*\w*)/i,
            /(ultra\s*\d+\s*\w*)/i,
            /(u\d+\s*\w*)/i
        ];
        for (const pattern of processorPatterns) {
            const match = fullText.match(pattern);
            if (match) {
                let proc = match[1] || match[2] || match[3] || match[4] || match[5] || match[6] || match[7] || match[8] || match[9] || match[10] || match[11] || match[12];
                proc = proc.replace(/\s+/g, ' ').trim();
                // Fix common typos
                proc = proc.replace(/ryze/i, 'Ryzen');
                proc = proc.replace(/ultra/i, 'Ultra');
                proc = proc.replace(/u(\d)/i, 'Ultra $1');
                specs.processor = `${proc}`;
                break;
            }
        }

        // Extract Display - screen size and resolution
        const displayPatterns = [
            /(fhd|full\s*hd|4k|uhd|qhd|hd|wqxga|wqhd|wuxga|oled|ips)\s*(\d+(?:\.\d+)?)\s*(?:inch|")/i,
            /(\d+(?:\.\d+)?)\s*(?:inch|")\s*(fhd|full\s*hd|4k|uhd|qhd|hd|wqxga|wqhd|wuxga|oled|ips)?/i,
            /(\d+(?:\.\d+)?)\s*(?:inch|")\s*display/i,
            /(\d+(?:\.\d+)?)\s*(fhd|full\s*hd|4k|uhd|qhd|hd|wqxga|wqhd|wuxga|oled|ips)/i
        ];
        for (const pattern of displayPatterns) {
            const match = fullText.match(pattern);
            if (match) {
                const size = match[1] || match[2] || match[3];
                const res = match[4] || match[5] || '';
                const resText = res ? ` ${res.toUpperCase()}` : '';
                specs.display = `${size}"${resText}`;
                break;
            }
        }

        // Build compact summary with key specs: RAM, Storage, Display, Processor
        const keySpecs = [];
        if (specs.ram) keySpecs.push(specs.ram);
        if (specs.storage) keySpecs.push(specs.storage);
        if (specs.display) keySpecs.push(specs.display);
        if (specs.processor) keySpecs.push(specs.processor);

        if (keySpecs.length > 0) {
            return keySpecs.join(' • ');
        }

        // Fallback to short description
        const desc = product.description || '';
        return desc.length > 80 ? desc.substring(0, 80) + '...' : desc || 'Premium computing solution';
    }

    // --- 2. CORE DATA FETCHING ---
    async function getActiveCart() {
        console.log('[Cart Logic] Getting active cart for user:', user?.userID);
        
        if (user) {
            try {
                console.log('[Cart Logic] Fetching cart from server...');
                const response = await fetch(`/api/v1/cart/${user.userID}`);
                console.log('[Cart Logic] Server response status:', response.status);
                
                const result = await response.json();
                console.log('[Cart Logic] Server response data:', result);
                
                let items = Array.isArray(result?.data) ? result.data : [];
                console.log('[Cart Logic] Parsed items from server:', items.length, 'items');
                
                // Fallback to localStorage if server cart is empty but localStorage has items
                // (useful for freshly added Duo items that haven't synced yet)
                if (items.length === 0) {
                    const localCart = JSON.parse(localStorage.getItem('cart')) || [];
                    if (localCart.length > 0) {
                        console.log('[Cart] ⚠️ Server cart empty, using localStorage fallback with', localCart.length, 'items');
                        console.log('[Cart] Fallback items:', localCart);
                        items = localCart;
                    }
                }
                
                console.log('[Cart Logic] Processing', items.length, 'items...');
                
                return items.map((item, index) => {
                    console.log(`[Cart Logic] Processing item ${index}:`, {
                        id: item.id,
                        product_name: item.product_name,
                        cart_type: item.cart_type,
                        has_duo_config: !!item.duo_config_json
                    });
                    
                    // Handle digital license items with NULL product fields but valid config
                    const isDuoItem = isDigitalLicenseType(item.cart_type);
                    
                    if (isDuoItem && !item.product_name && item.duo_config_json) {
                        console.log(`[Cart Logic] Item ${index} is digital license item - reconstructing from config...`);
                        
                        // Reconstruct digital license product from config
                        const config = typeof item.duo_config_json === 'string' 
                            ? JSON.parse(item.duo_config_json) 
                            : item.duo_config_json;
                        
                        console.log(`[Cart Logic] Reconstructed Duo config:`, {
                            organization_name: config.organization_name,
                            sku: config.sku,
                            user_limit: config.user_limit,
                            seats: config.seats,
                            edition: config.edition,
                            product_price: config.product_price
                        });

                        const isMicrosoft = item.cart_type === 'microsoft-license';
                        
                        return {
                            id: item.id || 0,
                            name: config.product_name || (isMicrosoft ? 'Microsoft License' : (item.cart_type === 'duo-security-upgrade' ? 'Cisco Duo Security - Upgrade' : 'Cisco Duo Security')),
                            price: config.product_price || 0,
                            quantity: item.quantity || 1,
                            description: config.product_description || '',
                            image: isMicrosoft ? '/Images/Logos/Proq2.png' : '/Images/DUO.png',
                            type: item.cart_type,
                            duo_config: config,
                            microsoft_config: isMicrosoft ? config : null
                        };
                    }
                    
                    // Regular product or Duo with product fields available
                    let imagePath = item.image_url || item.image || null;
                    if (imagePath) {
                        if (!/^https?:\/\//i.test(imagePath) && !imagePath.startsWith('/')) {
                            imagePath = `/product_images/${imagePath}`;
                        }
                    }
                    
                    console.log(`[Cart Logic] Item ${index} regular product: ${item.product_name}`);
                    
                    return {
                        id: item.id,
                        name: item.product_name,
                        price: parseFloat(item.price),
                        quantity: item.quantity,
                        description: item.description,
                        image: imagePath,
                        type: item.cart_type,
                        duo_config: item.duo_config_json,
                        microsoft_config: item.cart_type === 'microsoft-license' ? item.duo_config_json : null
                    };
                });
            } catch (error) {
                console.error('[Cart Logic] Error fetching from server, falling back to localStorage:', error);
                const localCart = JSON.parse(localStorage.getItem('cart')) || [];
                console.log('[Cart Logic] Fallback - using localStorage with', localCart.length, 'items');
                console.log('[Cart Logic] Fallback items:', localCart);
                
                return localCart.map(item => {
                    let imagePath = item.image_url || item.image || null;
                    if (imagePath) {
                        if (!/^https?:\/\//i.test(imagePath) && !imagePath.startsWith('/')) {
                            imagePath = `/product_images/${imagePath}`;
                        }
                    }
                    return {
                        id: item.id,
                        name: item.product_name,
                        price: parseFloat(item.price),
                        quantity: item.quantity,
                        description: item.description,
                        image: imagePath,
                        type: item.cart_type || item.type,
                        duo_config: item.duo_config_json || item.duo_config,
                        microsoft_config: item.microsoft_config || item.microsoft_config_json
                    };
                });
            }
        } else {
            // Local storage fallback for guests
            console.log('[Cart Logic] Not logged in - using localStorage only');
            const localCart = JSON.parse(localStorage.getItem('cart')) || [];
            return localCart.map(item => {
                let imagePath = item.image_url || item.image || null;
                if (imagePath) {
                    if (!/^https?:\/\//i.test(imagePath) && !imagePath.startsWith('/')) {
                        imagePath = `/product_images/${imagePath}`;
                    }
                }
                return {
                    id: item.id,
                    name: item.product_name,
                    price: parseFloat(item.price),
                    quantity: item.quantity,
                    description: item.description,
                    image: imagePath,
                    type: item.cart_type || item.type,
                    duo_config: item.duo_config_json || item.duo_config,
                    microsoft_config: item.microsoft_config || item.microsoft_config_json
                };
            });
        }
    }

    // --- 3. RENDER UI ---
    async function renderCart() {
        console.log('[Cart Logic] Starting cart render...');
        const cart = await getActiveCart();
        
        console.log('[Cart Logic] Cart data retrieved:', {
            total_items: cart.length,
            items: cart.map(i => ({ name: i.name, type: i.type, price: i.price }))
        });
        
        // Show/hide digital license info banner
        const duoBanner = document.getElementById('duoInfoBanner');
        if (duoBanner) {
            const hasDuoItems = cart.some(item => isDigitalLicenseType(item.type));
            console.log('[Cart Logic] Has digital license items:', hasDuoItems);
            duoBanner.style.display = hasDuoItems ? 'block' : 'none';
        }
        
        if (!cart || cart.length === 0) {
            console.log('[Cart Logic] Cart is empty - showing empty message');
            document.body.classList.add('cart-is-empty');
            cartItemsList.innerHTML = `
                <div class="empty-cart-msg">
                    <i class='bx bx-cart'></i>
                    <h3>Your cart is empty</h3>
                    <p>Add procurement-ready products to begin checkout.</p>
                    <a href="store.html" class="btn btn-primary">Return to Shopping</a>
                </div>`;
            const recSlot = document.getElementById('cartRecommendations');
            if (recSlot) {
                recSlot.hidden = true;
                recSlot.innerHTML = '';
            }
            updateTotals(0);
            return;
        }

        document.body.classList.remove('cart-is-empty');
        console.log('[Cart Logic] Rendering', cart.length, 'items...');
        cartItemsList.innerHTML = cart.map((item, idx) => {
            console.log(`[Cart Logic] Rendering item ${idx}: ${item.name}`);
            // Use clean product name (4 words max) like in store
            const cleanName = cleanProductName(item.name);
            
            // Generate smart summary with RAM, Storage, Display, Processor
            const smartSummary = generateSmartSummary(item, cleanName);
            
            // Use normalized image path provided by the data mapping above
            let imgSrc = item.image ? item.image : 'https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?q=80&w=800';
            
            // Duo Security special rendering
            let duoDetails = '';
            if (item.type === 'duo-security' || item.type === 'duo-security-upgrade') {
                console.log(`[Cart Logic] Item ${idx} is Duo - rendering special details`);
                imgSrc = '/Images/DUO.png';
                const config = item.duo_config || {};
                const orgName = config.organization_name || config.tenant_name || 'Organization';
                const userCount = config.user_limit || config.new_user_limit || config.user_count || 0;
                const edition = config.edition || '';
                const isUpgrade = item.type === 'duo-security-upgrade';

                duoDetails = `
                    <div class="duo-config-summary" style="margin-top: 5px; font-size: 0.8rem; color: rgba(255,255,255,0.7); background: rgba(0,188,212,0.1); padding: 6px 10px; border-radius: 8px; border-left: 3px solid var(--accent-blue);">
                        <div style="color: var(--accent-blue); font-weight: bold; margin-bottom: 2px;">${isUpgrade ? 'License Upgrade' : 'New License'}</div>
                        <div><strong>Org:</strong> ${orgName}</div>
                        <div><strong>Users:</strong> ${userCount} ${isUpgrade ? `(from ${config.old_user_limit || '?'})` : ''}</div>
                        ${edition ? `<div><strong>Edition:</strong> ${edition}</div>` : ''}
                        ${config.admin_emails ? `<div style="font-size: 0.75rem; margin-top: 2px; opacity: 0.8;"><strong>Admins:</strong> ${config.admin_emails.join(', ')}</div>` : ''}
                    </div>
                `;
            } else if (item.type === 'microsoft-license') {
                console.log(`[Cart Logic] Item ${idx} is Microsoft license - rendering special details`);
                imgSrc = '/Images/Logos/Proq2.png';
                const config = item.microsoft_config || item.duo_config || {};
                const seats = config.seats || 1;
                const sku = config.sku || '';
                const billingTerm = config.billing_term || config.billingTerm || 'Monthly';

                duoDetails = `
                    <div class="duo-config-summary" style="margin-top: 5px; font-size: 0.8rem; color: rgba(255,255,255,0.7); background: rgba(0,120,212,0.12); padding: 6px 10px; border-radius: 8px; border-left: 3px solid #0078d4;">
                        <div style="color: #69d7ff; font-weight: bold; margin-bottom: 2px;">Microsoft License</div>
                        ${sku ? `<div><strong>SKU:</strong> ${sku}</div>` : ''}
                        <div><strong>Seats:</strong> ${seats}</div>
                        <div><strong>Billing:</strong> ${billingTerm}</div>
                    </div>
                `;
            }

            return `
                <div class="cart-item-card">
                    <div class="item-img-container">
                        <img src="${imgSrc}" alt="${cleanName}" style="width: 60px; height: 60px; object-fit: contain;" onerror="this.src='/Images/DUO.png'">
                    </div>
                    
                    <div class="cart-item-details">
                        <div class="item-info" style="flex-grow: 1; min-width: 0;">
                            <h4>${cleanName}</h4>
                            <p>${smartSummary}</p>
                            ${duoDetails}
                            <p class="item-price">R${item.price.toLocaleString()}</p>
                        </div>

                        ${isDigitalLicenseType(item.type) ? `
                        <div class="qty-controls" style="display: flex; align-items: center; gap: 8px; background: rgba(255, 255, 255, 0.15); padding: 6px 10px; border-radius: 20px; flex-shrink: 0; backdrop-filter: blur(10px); color: rgba(255,255,255,0.85); font-size: 0.8rem;">
                            Digital
                        </div>` : `
                        <div class="qty-controls" style="display: flex; align-items: center; gap: 8px; background: rgba(255, 255, 255, 0.15); padding: 4px 8px; border-radius: 20px; flex-shrink: 0; backdrop-filter: blur(10px);">
                            <button onclick="updateQty('${String(item.id).replace(/'/g, "\\'")}', -1)" style="border:none; background:none; cursor:pointer; font-size: 1.1rem; color: var(--accent-blue); padding: 2px 6px; border-radius: 50%;">−</button>
                            <span style="min-width: 18px; text-align: center; font-weight: 200; font-size: 0.9rem; color: rgba(255, 255, 255, 0.9);">${item.quantity}</span>
                            <button onclick="updateQty('${String(item.id).replace(/'/g, "\\'")}', 1)" style="border:none; background:none; cursor:pointer; font-size: 1.1rem; color: var(--accent-blue); padding: 2px 6px; border-radius: 50%;">+</button>
                        </div>`}

                        <button class="remove-btn" onclick="handleRemove('${String(item.id).replace(/'/g, "\\'")}'${item.type === 'duo-security' || item.type === 'duo-security-upgrade' ? `, '${(item.duo_config?.organization_name || '').replace(/'/g, "\\'")}'` : ''})" style="background: none; border: none; color: #ff4757; cursor: pointer; font-size: 1.2rem; padding: 8px; border-radius: 6px; transition: all 0.2s ease; flex-shrink: 0;" onmouseover="this.style.background='rgba(255,71,87,0.2)'" onmouseout="this.style.background='none'">
                            <i class='bx bx-trash'></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        const subtotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
        console.log('[Cart Logic] Subtotal calculated:', subtotal);
        updateTotals(subtotal);
        updateGlobalBadge(cart);
        if (window.StackRecommendations) {
            window.StackRecommendations.init({
                container: '#cartRecommendations',
                title: 'Recommended for your cart',
                context: 'cart',
                cartItems: cart,
                limit: 4,
                fetchLimit: 5,
                bundleReady: true
            });
        }
        console.log('[Cart Logic] Cart render complete ✅');
    }

    // --- 4. ACTIONS ---
    window.updateQty = async (productId, delta) => {
        try {
            if (user) {
                const numProductId = parseInt(productId);
                const action = delta > 0 ? 'increment' : 'decrement';
                
                console.log(`[Cart] ${action === 'increment' ? 'Incrementing' : 'Decrementing'} product ${numProductId}`);
                
                // Use PATCH endpoint which increments/decrements
                const resp = await fetch(`/api/v1/cart/${user.userID}/${numProductId}`, {
                    method: 'PATCH',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ action })
                });
                
                if (!resp.ok) {
                    const errText = await resp.text().catch(() => '');
                    console.error('[Cart] PATCH failed:', resp.status, errText);
                    throw new Error(`Failed to update quantity: ${resp.status}`);
                }
                
                console.log(`[Cart] ✅ ${action} successful`);
            } else {
                let cart = JSON.parse(localStorage.getItem('cart')) || [];
                const idx = cart.findIndex(i => i.id == productId);
                if(idx > -1) {
                    cart[idx].quantity = Math.max(1, cart[idx].quantity + delta);
                    localStorage.setItem('cart', JSON.stringify(cart));
                    console.log('[Cart] Local storage quantity updated');
                }
            }
            await new Promise(r => setTimeout(r, 300)); // Brief delay for DB update
            renderCart();
        } catch (err) {
            console.error('[Cart] Error updating quantity:', err);
            alert('Error: ' + err.message);
        }
    };

    window.handleRemove = async (productId, duoOrgName = null) => {
        try {
            if (user) {
                // For Duo items, delete by organization name
                if (duoOrgName) {
                    console.log(`[Cart Logic] Deleting Duo item: ${duoOrgName}`);
                    const encodedOrgName = encodeURIComponent(duoOrgName);
                    const resp = await fetch(`/api/v1/cart/${user.userID}/duo/${encodedOrgName}`, { method: 'DELETE' });
                    if (!resp.ok) {
                        const errText = await resp.text().catch(() => '');
                        console.error('[Cart Logic] Duo delete failed:', resp.status, errText);
                        throw new Error(`Failed to delete Duo item: ${resp.status}`);
                    }
                    console.log('[Cart Logic] ✅ Duo item deleted');
                } else {
                    // Regular product - ensure productId is a number
                    const numProductId = parseInt(productId);
                    console.log(`[Cart Logic] Deleting product ${numProductId}`);
                    const resp = await fetch(`/api/v1/cart/${user.userID}/${numProductId}`, { method: 'DELETE' });
                    if (!resp.ok) {
                        const errText = await resp.text().catch(() => '');
                        console.error('[Cart Logic] Product delete failed:', resp.status, errText);
                        throw new Error(`Failed to delete product: ${resp.status}`);
                    }
                    console.log('[Cart Logic] ✅ Product deleted');
                }
            } else {
                let cart = JSON.parse(localStorage.getItem('cart')) || [];
                cart = cart.filter(i => i.id != productId);
                localStorage.setItem('cart', JSON.stringify(cart));
                console.log('[Cart Logic] Product removed from localStorage');
            }
            await new Promise(r => setTimeout(r, 300)); // Brief delay for DB update
            renderCart();
        } catch (err) {
            console.error('[Cart Logic] Error removing item:', err);
            alert('Error: ' + err.message);
        }
    };

    async function updateTotals(subtotal) {
        const cart = await getActiveCart();
        const hasPhysicalProducts = cart.some(item => !isDigitalLicenseType(item.type));
        const hasDuoItems = cart.some(item => isDigitalLicenseType(item.type));
        const deliveryFee = hasPhysicalProducts ? DELIVERY_FEE : 0;
        const finalTotal = subtotal > 0 ? subtotal + deliveryFee : 0;
        
        if(subtotalEl) subtotalEl.innerText = `R${subtotal.toLocaleString()}`;
        
        // Smart delivery fee label
        if(deliveryEl) {
            if (hasPhysicalProducts && hasDuoItems) {
                deliveryEl.innerText = `R${deliveryFee} (physical items only)`;
            } else if (hasDuoItems && !hasPhysicalProducts) {
                deliveryEl.innerHTML = `<span style="color: var(--accent-blue);">R0 (digital)</span>`;
            } else {
                deliveryEl.innerText = `R${deliveryFee.toLocaleString()}`;
            }
        }
        
        if(totalEl) totalEl.innerText = `R${finalTotal.toLocaleString()}`;
    }

    function updateGlobalBadge(cart) {
        const count = cart.reduce((acc, item) => acc + item.quantity, 0);
        const badge = document.getElementById('cart-count');
        if (badge) badge.innerText = count;
    }

    window.addEventListener('stack:cart-updated', renderCart);
    renderCart();

    // Proceed to checkout - require login
    const checkoutBtn = document.getElementById('checkoutBtn');
    if (checkoutBtn) {
        checkoutBtn.addEventListener('click', () => {
            const userLocal = JSON.parse(localStorage.getItem('user'));
            if (!userLocal) {
                localStorage.setItem('redirectAfterLogin', '/checkout.html');
                return window.location.href = '/signin.html';
            }
            window.location.href = '/checkout.html';
        });
    }

    // Update wishlist badge on cart page
    function updateWishlistBadgeCart() {
        const userID = user?.userID || localStorage.getItem('userID');
        const wishlistBadges = document.querySelectorAll('.wishlist-badge');
        
        if (userID) {
            fetch(`/api/v1/wishlist/count/${userID}`)
                .then(response => response.ok ? response.json() : { data: 0 })
                .then(data => {
                    const count = data.data || 0;
                    wishlistBadges.forEach(badge => badge.textContent = count);
                    localStorage.setItem('wishlistCount', count);
                })
                .catch(err => {
                    const wishlist = JSON.parse(localStorage.getItem('wishlist') || '[]');
                    const count = wishlist.length;
                    wishlistBadges.forEach(badge => badge.textContent = count);
                    localStorage.setItem('wishlistCount', count);
                });
        } else {
            const wishlist = JSON.parse(localStorage.getItem('wishlist') || '[]');
            const count = wishlist.length;
            wishlistBadges.forEach(badge => badge.textContent = count);
            localStorage.setItem('wishlistCount', count);
        }
    }
    
    updateWishlistBadgeCart();
});
