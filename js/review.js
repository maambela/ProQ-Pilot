document.addEventListener('DOMContentLoaded', async ()=>{
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user) { localStorage.setItem('redirectAfterLogin','/review.html'); return window.location.href = '/signin.html'; }

    const sel = sessionStorage.getItem('selectedAddress');
    if (!sel) return window.location.href = '/checkout.html';
    const address = JSON.parse(sel);

    const selectedAddressCard = document.getElementById('selectedAddressCard');
    if (address.isDigital) {
        selectedAddressCard.innerHTML = `
            <div class="summary-card" style="background: rgba(0, 188, 212, 0.15); border: 1px solid var(--accent-blue); padding: 30px; border-radius: 25px;">
                <strong style="color:#ffffff;"><i class='bx bx-cloud-download'></i> Digital Delivery</strong>
                <div style="margin-top:8px; color: rgba(255, 255, 255, 0.9);">
                    Cisco Duo License credentials will be sent to the administrator emails specified in your configuration.
                </div>
            </div>`;
    } else {
        selectedAddressCard.innerHTML = `<div class="summary-card" style="background: rgba(255, 255, 255, 0.08); backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px); border: 1px solid rgba(255, 255, 255, 0.25); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2), inset 0 1px 2px rgba(255, 255, 255, 0.4); padding: 30px; border-radius: 25px; position: static; top: auto;"><strong style="color:#ffffff;">Deliver to:</strong><div style="margin-top:8px; color: rgba(255, 255, 255, 0.9);">${address.line1}<div>${address.line2||''}</div><div>${address.city}, ${address.province||''} ${address.postal_code}</div><div>${address.country}</div></div></div>`;
    }

    const orderItemsEl = document.getElementById('orderItems');
    const summaryDetails = document.getElementById('summaryDetails');

    const res = await fetch(`/api/v1/cart/${user.userID}`);
    const data = await res.json();
    const items = data.data || [];
    
    // Ensure prices are numeric for calculations
    const itemsWithPrices = items.map(i => ({
        ...i,
        price: parseFloat(i.price) || 0
    }));
    
    if (!items.length) { orderItemsEl.innerHTML = '<p>Your cart is empty.</p>'; }
    else {
        // Add delivery type header
        const isDigitalLicense = (item) => ['duo-security', 'duo-security-upgrade', 'microsoft-license'].includes(item.cart_type);
        const isDuoLicense = (item) => ['duo-security', 'duo-security-upgrade'].includes(item.cart_type);
        const isMicrosoftLicense = (item) => item.cart_type === 'microsoft-license';
        const hasDuoItems = itemsWithPrices.some(isDigitalLicense);
        const hasPhysicalItems = itemsWithPrices.some(i => !isDigitalLicense(i));
        
        if (hasDuoItems && hasPhysicalItems) {
            const deliveryHeader = document.createElement('div');
            deliveryHeader.style.cssText = `
                background: rgba(0, 188, 212, 0.1);
                border: 1px solid rgba(0, 188, 212, 0.3);
                padding: 12px 16px;
                border-radius: 8px;
                margin-bottom: 16px;
                font-size: 0.9rem;
                color: rgba(255, 255, 255, 0.8);
            `;
            deliveryHeader.innerHTML = `
                <strong style="color: var(--accent-blue);">📦 Mixed Order - Multiple Delivery Methods</strong><br/>
                Physical items will ship to your address. Digital licenses activate immediately.
            `;
            orderItemsEl.appendChild(deliveryHeader);
        }

        orderItemsEl.innerHTML = '';
        const shortName = (name)=>{
            if(!name) return '';
            const parts = name.split(/\s+/).filter(Boolean);
            return parts.slice(0,4).join(' ');
        };

        for (const it of itemsWithPrices) {
            const row = document.createElement('div'); row.className = 'order-item';
            
            // Digital license special logic
            let imgSrc = it.image_url ? (it.image_url.startsWith('http') ? it.image_url : `/product_images/${it.image_url}`) : '/Images/placeholder.png';
            let displayName = it.product_name;
            let duoDetails = '';
            
            if (isDuoLicense(it)) {
                imgSrc = '/Images/DUO.png';
                const config = it.duo_config_json || {};
                displayName = config.organization_name || 'Cisco Duo Security';
                const userCount = config.user_limit || config.new_user_limit || config.user_count || 0;
                const edition = config.edition || '';
                const isUpgrade = it.cart_type === 'duo-security-upgrade';
                
                duoDetails = `
                    <div class="duo-config-review" style="margin-top: 8px; font-size: 0.85rem; color: rgba(255,255,255,0.8); background: rgba(0,188,212,0.1); padding: 10px 12px; border-radius: 8px; border-left: 3px solid var(--accent-blue);">
                        <div style="color: var(--accent-blue); font-weight: bold; margin-bottom: 6px;">${isUpgrade ? '📤 License Upgrade' : '✨ New License'}</div>
                        <div><strong>Organization:</strong> ${config.organization_name || 'Organization'}</div>
                        <div><strong>Users:</strong> ${userCount} ${isUpgrade ? `<span style="opacity: 0.7;">(${config.old_user_limit || '?'} → ${userCount})</span>` : ''}</div>
                        ${edition ? `<div><strong>Edition:</strong> ${edition}</div>` : ''}
                        ${config.admin_emails && Array.isArray(config.admin_emails) && config.admin_emails.length > 0 ? `
                            <div style="margin-top: 6px; opacity: 0.9;">
                                <strong>Admin Email${config.admin_emails.length > 1 ? 's' : ''}:</strong>
                                <div style="font-size: 0.8rem; margin-top: 3px; word-break: break-all;">
                                    ${config.admin_emails.join('<br/>')}
                                </div>
                            </div>
                        ` : ''}
                    </div>
                `;
            } else if (isMicrosoftLicense(it)) {
                imgSrc = '/Images/Logos/Proq2.png';
                const config = it.duo_config_json || {};
                displayName = config.product_name || 'Microsoft License';
                duoDetails = `
                    <div class="duo-config-review" style="margin-top: 8px; font-size: 0.85rem; color: rgba(255,255,255,0.8); background: rgba(0,120,212,0.12); padding: 10px 12px; border-radius: 8px; border-left: 3px solid #0078d4;">
                        <div style="color: #69d7ff; font-weight: bold; margin-bottom: 6px;">Microsoft License</div>
                        <div><strong>Product:</strong> ${config.product_name || 'Microsoft License'}</div>
                        ${config.sku ? `<div><strong>SKU:</strong> ${config.sku}</div>` : ''}
                        <div><strong>Seats:</strong> ${config.seats || 1}</div>
                        <div><strong>Billing:</strong> ${config.billing_term || 'Monthly'}</div>
                    </div>
                `;
            }

            // Image container (white background)
            const imgContainer = document.createElement('div'); imgContainer.className = 'item-thumb-container';
            const img = document.createElement('img'); img.className = 'item-thumb';
            img.src = imgSrc;
            img.onerror = () => { img.src = '/Images/DUO.png'; };
            imgContainer.appendChild(img);

            // Details container (liquid glass)
            const detailsContainer = document.createElement('div'); detailsContainer.className = 'order-item-details';
            const meta = document.createElement('div'); meta.className = 'item-meta';
            const title = document.createElement('div'); title.className = 'item-name'; title.textContent = shortName(displayName);
            const sub = document.createElement('div'); sub.className = 'item-sub'; sub.textContent = `Qty: ${it.quantity} • R${it.price.toLocaleString()}`;

            const toggle = document.createElement('div'); toggle.className = 'view-toggle'; toggle.innerHTML = '<i class="bx bx-chevron-down"></i><span>Details</span>';

            meta.appendChild(title); 
            meta.appendChild(sub); 
            if (duoDetails) {
                const duoDiv = document.createElement('div');
                duoDiv.innerHTML = duoDetails;
                meta.appendChild(duoDiv);
            }
            meta.appendChild(toggle);

                const details = document.createElement('div'); details.className = 'details-panel';
                meta.appendChild(details);
            
            detailsContainer.appendChild(meta);

            row.appendChild(imgContainer); row.appendChild(detailsContainer);

            // When toggled, open modal with product details (skip for Duo items)
            toggle.addEventListener('click', async ()=>{
                const icon = toggle.querySelector('i');
                
                // Skip modal for digital license items - just expand inline details
                if (isDigitalLicense(it)) {
                    icon.classList.toggle('bx-rotate-180');
                    return;
                }
                
                try {
                    const pRes = await fetch(`/api/v1/products/${it.id}`);
                    const pData = await pRes.json();
                    const product = pData.data?.product || pData.data || {};
                    const images = pData.data?.images || pData.images || [];

                    // scroll row into view then open modal
                    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    setTimeout(()=> openProductModal(product, images, row), 220);
                } catch (err) {
                    console.error('Error loading product details:', err);
                }
                icon.classList.toggle('bx-rotate-180');
            });

            orderItemsEl.appendChild(row);
        }
    }

    const subtotal = itemsWithPrices.reduce((s,i)=> s + (i.price * i.quantity), 0);
    const hasPhysicalProducts = itemsWithPrices.some(i => !['duo-security', 'duo-security-upgrade', 'microsoft-license'].includes(i.cart_type));
    const hasDuoItems = itemsWithPrices.some(i => i.cart_type === 'duo-security' || i.cart_type === 'duo-security-upgrade');
    const delivery = hasPhysicalProducts ? 75 : 0;
    const total = subtotal + delivery;
    summaryDetails.innerHTML = `<p style="color: rgba(255, 255, 255, 0.9);">Subtotal: R${subtotal.toLocaleString()}</p><p style="color: rgba(255, 255, 255, 0.9);">Delivery: R${delivery}</p><hr style="border-color: rgba(255, 255, 255, 0.2); margin: 15px 0;"><p style="color: rgba(255, 255, 255, 0.9);"><strong>Total: R${total.toLocaleString()}</strong></p>`;

    document.getElementById('editAddress').addEventListener('click', ()=>{ window.location.href='/checkout.html'; });

    // Show Test DUO button if there are Duo items
    const testDuoBtn = document.getElementById('testDuoBtn');
    if (hasDuoItems) {
        testDuoBtn.style.display = 'inline-flex';
    }

    const payBtn = document.getElementById('payBtn');
    payBtn.innerText = `Pay R${total.toLocaleString()}`;
    payBtn.addEventListener('click', async ()=>{
        const selectedMethod = document.querySelector('input[name="paymentMethod"]:checked')?.value || 'stitch';
        
        payBtn.disabled = true;
        payBtn.innerText = 'Connecting to payment...';
        
        try {
            const payload = { userID: user.userID, addressID: address.id, items: itemsWithPrices };
            let endpoint = '/api/v1/stitch-checkout'; // Default Stitch
            
            if (selectedMethod === 'payfast') {
                endpoint = '/api/v1/payfast-checkout';
            } else if (selectedMethod === 'stitch') {
                endpoint = '/api/v1/stitch-checkout';
            }

            const resp = await fetch(endpoint, { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify(payload) 
            });
            const result = await resp.json();
            
            if (resp.ok && result.data.paymentUrl) {
                // Store order ID in sessionStorage
                sessionStorage.setItem('currentOrderId', result.data.orderId);
                window.location.href = result.data.paymentUrl;
            } else {
                alert(result.message || 'Could not create payment. Please try again.');
                payBtn.disabled = false;
                payBtn.innerText = `Pay R${total.toLocaleString()}`;
            }
        } catch (err) {
            console.error('Payment error:', err);
            alert('Payment connection failed. Please try again.');
            payBtn.disabled = false;
            payBtn.innerText = `Pay R${total.toLocaleString()}`;
        }
    });

    // Test DUO API Button Functionality
    testDuoBtn.addEventListener('click', async () => {
        const testResultContainer = document.getElementById('testResultContainer');
        
        // Collect Duo items from cart
        const duoItems = itemsWithPrices.filter(i => i.cart_type === 'duo-security' || i.cart_type === 'duo-security-upgrade')
            .map(i => {
                const config = i.duo_config_json || {};
                return {
                    organization_name: config.organization_name,
                    user_limit: config.user_limit || config.new_user_limit,
                    admin_emails: config.admin_emails || [],
                    edition: config.edition || 'PLATFORM'
                };
            });
        
        // Show loading state
        testDuoBtn.classList.add('loading');
        testDuoBtn.disabled = true;
        testResultContainer.innerHTML = `<div class="test-result-status"><i class="bx bx-loader-alt" style="animation: spin 0.8s linear infinite;"></i> ${duoItems.length > 0 ? 'Creating accounts & retrieving from Duo' : 'Connecting to DUO API'}...</div>`;
        testResultContainer.classList.add('show');
        
        try {
            const payload = duoItems.length > 0 ? { items: duoItems } : {};
            
            const response = await fetch('/api/v1/duo/test-api', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            const data = await response.json();
            
            testDuoBtn.classList.remove('loading');
            testDuoBtn.disabled = false;
            
            if (!response.ok || !data.success) {
                testResultContainer.innerHTML = `
                    <div class="test-result-status error"><i class="bx bx-x-circle"></i> API Test Failed</div>
                    <div class="test-result-error">
                        <strong>Error:</strong> ${data.error || 'Unknown error occurred'}<br/>
                        <small>Timestamp: ${data.timestamp || new Date().toISOString()}</small>
                    </div>
                `;
                return;
            }
            
            // Success - Display created and all accounts
            let resultHtml = '';
            
            // Show created accounts section
            if (data.created_accounts && data.created_accounts.length > 0) {
                resultHtml += `
                    <div style="margin-bottom: 16px; padding: 12px; background: rgba(74, 222, 128, 0.1); border: 1px solid rgba(74, 222, 128, 0.3); border-radius: 8px;">
                        <div style="color: #4ade80; font-weight: 200; margin-bottom: 8px;"><i class="bx bx-check-circle"></i> ✅ ${data.created_count} New Account(s) Created</div>
                        <div class="test-result-accounts">
                `;
                
                data.created_accounts.forEach((account, index) => {
                    resultHtml += `
                        <div class="account-item" style="border-left-color: #4ade80;">
                            <div style="font-weight: 200; margin-bottom: 8px; color: #4ade80;">Created Account #${index + 1}</div>
                            <div class="account-item-field">
                                <span class="account-item-label">Name:</span>
                                <span class="account-item-value">${account.organization_name || 'N/A'}</span>
                            </div>
                            <div class="account-item-field">
                                <span class="account-item-label">Account ID:</span>
                                <span class="account-item-value" style="font-family: monospace; font-size: 0.85rem;">${account.account_id || 'N/A'}</span>
                            </div>
                            <div class="account-item-field">
                                <span class="account-item-label">Users:</span>
                                <span class="account-item-value">${account.user_limit || 'N/A'}</span>
                            </div>
                            <div class="account-item-field">
                                <span class="account-item-label">Edition:</span>
                                <span class="account-item-value">${account.edition || 'N/A'}</span>
                            </div>
                            <div class="account-item-field">
                                <span class="account-item-label">API Host:</span>
                                <span class="account-item-value" style="font-family: monospace; font-size: 0.85rem;">${account.api_hostname || 'N/A'}</span>
                            </div>
                        </div>
                    `;
                });
                
                resultHtml += `
                        </div>
                    </div>
                `;
            }
            
            // Show all accounts section
            resultHtml += `<div class="test-result-status success"><i class="bx bx-database"></i> All Duo Accounts (${data.total_accounts})</div>`;
            
            if (data.all_accounts && data.all_accounts.length > 0) {
                resultHtml += '<div class="test-result-accounts">';
                data.all_accounts.forEach((account, index) => {
                    resultHtml += `
                        <div class="account-item">
                            <div style="font-weight: 200; margin-bottom: 8px; color: var(--accent-blue);">Account #${index + 1}</div>
                            <div class="account-item-field">
                                <span class="account-item-label">Name:</span>
                                <span class="account-item-value">${account.name || 'N/A'}</span>
                            </div>
                            <div class="account-item-field">
                                <span class="account-item-label">Account ID:</span>
                                <span class="account-item-value" style="font-family: monospace; font-size: 0.85rem;">${account.account_id || 'N/A'}</span>
                            </div>
                            <div class="account-item-field">
                                <span class="account-item-label">API Host:</span>
                                <span class="account-item-value" style="font-family: monospace; font-size: 0.85rem;">${account.api_hostname || 'N/A'}</span>
                            </div>
                        </div>
                    `;
                });
                resultHtml += '</div>';
            } else {
                resultHtml += '<div style="color: rgba(255, 255, 255, 0.7); padding: 12px; background: rgba(0, 188, 212, 0.08); border-radius: 8px; margin-top: 8px;">No Duo accounts found.</div>';
            }
            
            resultHtml += `<div style="font-size: 0.85rem; color: rgba(255, 255, 255, 0.5); margin-top: 12px;">Timestamp: ${data.timestamp}</div>`;
            
            testResultContainer.innerHTML = resultHtml;
            
        } catch (err) {
            testDuoBtn.classList.remove('loading');
            testDuoBtn.disabled = false;
            
            testResultContainer.innerHTML = `
                <div class="test-result-status error"><i class="bx bx-x-circle"></i> Connection Error</div>
                <div class="test-result-error">
                    <strong>Error:</strong> ${err.message || 'Failed to connect to API'}<br/>
                    <small>Please ensure the server is running and try again.</small>
                </div>
            `;
            console.error('Test DUO API Error:', err);
        }
    });

    // --- Modal helpers ---
    const modal = document.getElementById('productModal');
    const modalClose = document.getElementById('modalClose');
    const modalTitle = document.getElementById('modalTitle');
    const modalGallery = document.getElementById('modalGallery');
    const modalSpecs = document.getElementById('modalSpecs');
    const modalDescription = document.getElementById('modalDescription');
    let _lastFocused = null;

    // Full specs extractor copied from product.html
    function extractSpecs(description) {
        const specs = {};

        const fullText = (description || '').toLowerCase();

        // Extract RAM
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

        // Extract Storage
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
                specs.storage = `${size}${unit} ${type} storage`;
                break;
            }
        }

        // Extract Processor
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
                proc = proc.replace(/ryzenn/i, 'Ryzen');
                proc = proc.replace(/ultra/i, 'Ultra');
                proc = proc.replace(/u(\d)/i, 'Ultra $1');
                specs.processor = `${proc} processor`;
                break;
            }
        }

        // Extract Display
        const displayPatterns = [
            /(fhd\+?|full\s*hd|4k|uhd|qhd|hd|wqxga|wqhd|wuxga|oled|ips|wideview)\s*(\d+(?:\.\d+)?)\s*(?:inch|")/i,
            /(\d+(?:\.\d+)?)\s*(?:inch|")\s*(fhd\+?|full\s*hd|4k|uhd|qhd|hd|wqxga|wqhd|wuxga|oled|ips|wideview)?/i,
            /(\d+(?:\.\d+)?)\s*(?:inch|")\s*display/i,
            /(\d+(?:\.\d+)?)\s*(fhd\+?|full\s*hd|4k|uhd|qhd|hd|wqxga|wqhd|wuxga|oled|ips|wideview)/i
        ];
        for (const pattern of displayPatterns) {
            const match = fullText.match(pattern);
            if (match) {
                const size = match[1] || match[2] || match[3];
                const res = match[4] || match[5] || '';
                const resText = res ? ` ${res.toUpperCase()}` : '';
                specs.display = `${size}"${resText} display`;
                break;
            }
        }

        // Extract Graphics
        const graphicsPatterns = [
            /(rtx\s*\d+(?:\s*super)?)/i,
            /(gtx\s*\d+)/i,
            /(nvidia\s*geforce\s*rtx?\s*\d+)/i,
            /(amd\s*radeon\s*rx?\s*\d+)/i,
            /(intel\s*iris\s*xe?)/i,
            /(intel\s*uhd\s*graphics)/i,
            /(integrated\s*graphics)/i,
            /(nvidia\s*quadro)/i,
            /(intel\s*integrated)/i,
            /(amd\s*integrated)/i
        ];
        for (const pattern of graphicsPatterns) {
            const match = fullText.match(pattern);
            if (match) {
                specs.graphics = `${match[1] || match[2] || match[3] || match[4] || match[5] || match[6] || match[7] || match[8] || match[9] || match[10]} graphics`;
                break;
            }
        }

        // Fallback for integrated graphics if not specified
        if (!specs.graphics) {
            if (fullText.includes('intel')) {
                specs.graphics = 'Intel integrated graphics';
            } else if (fullText.includes('amd')) {
                specs.graphics = 'AMD integrated graphics';
            }
        }

        // Extract Operating System
        const osPatterns = [
            /(windows\s*\d+(?:\s+(?:pro|home|enterprise|education))?(?:\s+\d+)?)/i,
            /(win(?:dows)?\s*\d+(?:\s+(?:pro|home|enterprise|education))?(?:\s+\d+)?)/i,
            /(linux(?:\s+\w+)*)/i,
            /(macos(?:\s+\w+)*)/i,
            /(chrome\s*os(?:\s+\w+)*)/i
        ];
        for (const pattern of osPatterns) {
            const match = fullText.match(pattern);
            if (match) {
                let os = match[1] || match[2] || match[3] || match[4] || match[5];
                os = os.replace(/\s+/g, ' ').trim();
                os = os.replace(/windows?/i, 'Windows');
                os = os.replace(/linux/i, 'Linux');
                os = os.replace(/macos/i, 'macOS');
                os = os.replace(/chrome/i, 'Chrome');
                // Capitalize first letter of each word
                os = os.replace(/\b\w/g, l => l.toUpperCase());
                specs.os = os;
                break;
            }
        }

        // Extract Security Features
        const securityFeatures = [];
        if (fullText.includes('fingerprint')) securityFeatures.push('Fingerprint');
        if (fullText.includes('face recognition') || fullText.includes('facial recognition')) securityFeatures.push('Face Recognition');
        if (fullText.includes('biometric')) securityFeatures.push('Biometric');
        if (securityFeatures.length > 0) {
            specs.security = securityFeatures.join(', ');
        }

        // Extract Touchscreen
        if (fullText.includes('touch') || fullText.includes('touchscreen')) {
            specs.touchscreen = 'Touchscreen';
        }

        // Extract Camera
        if (fullText.includes('camera') || fullText.includes('nfovcamera')) {
            specs.camera = 'NFOV Camera';
        }

        // Extract Microphone
        if (fullText.includes('mic') || fullText.includes('microphone') || fullText.includes('arymic')) {
            specs.microphone = 'Dual Array Microphone';
        }

        // Extract Connectivity
        const connectivity = [];
        if (fullText.includes('wi fi') || fullText.includes('wifi')) connectivity.push('Wi-Fi 7');
        if (fullText.includes('bt') || fullText.includes('bluetooth')) connectivity.push('Bluetooth 5.4');
        if (connectivity.length > 0) {
            specs.connectivity = connectivity.join(', ');
        }

        // Extract Warranty
        const warrantyPatterns = [
            /(\d+)\s*year.*warranty/i,
            /warranty.*(\d+)\s*year/i,
            /(\d+)\s*year.*onsite/i,
            /onsite.*(\d+)\s*year/i,
            /(\d+)y.*onsite/i,
            /onsite.*(\d+)y/i
        ];
        for (const pattern of warrantyPatterns) {
            const match = fullText.match(pattern);
            if (match) {
                const years = match[1] || match[2] || match[3] || match[4] || match[5] || match[6];
                specs.warranty = `${years} Year Warranty`;
                break;
            }
        }
        // Fallback if not matched but mentioned
        if (!specs.warranty && fullText.includes('warranty')) {
            specs.warranty = 'Warranty Included';
        }

        // Extract Charger
        const chargerPatterns = [
            /(\d+)w.*type.?c/i,
            /type.?c.*(\d+)w/i,
            /(\d+)w.*usb.?c/i,
            /usb.?c.*(\d+)w/i
        ];
        for (const pattern of chargerPatterns) {
            const match = fullText.match(pattern);
            if (match) {
                const wattage = match[1] || match[2] || match[3] || match[4];
                specs.charger = `${wattage}W Type-C Charger`;
                break;
            }
        }

        return specs;
    }

    function closeModal() {
        if (!modal) return;
        // restore focus before hiding to avoid aria-hidden on focused element
        try { if (_lastFocused && typeof _lastFocused.focus === 'function') _lastFocused.focus(); } catch(e){}
        modal.classList.remove('open');
        modalGallery.innerHTML = '';
        modalSpecs.innerHTML = '';
        modalDescription.innerHTML = '';
        modal.setAttribute('aria-hidden','true');
    }

    modalClose?.addEventListener('click', closeModal);
    modal?.addEventListener('click', (e)=>{ if (e.target === modal) closeModal(); });

    function openProductModal(product, images){
        if (!modal) return;
        modalTitle.innerText = product.product_name || product.name || 'Product Details';

        // Gallery
        const imgList = (images && images.length) ? images.map(i=> i.image_url || i) : [];
        const first = imgList.length ? (imgList[0].startsWith('http') ? imgList[0] : `/product_images/${imgList[0]}`) : '';
        modalGallery.innerHTML = `
            <img class="main" src="${first || '/Images/placeholder.png'}" id="modalMainImg">
            <div class="thumbs" id="modalThumbs"></div>
        `;
        const thumbsEl = document.getElementById('modalThumbs');
        imgList.forEach(url=>{
            const u = url.startsWith('http') ? url : `/product_images/${url}`;
            const t = document.createElement('img'); t.src = u;
            t.addEventListener('click', ()=> document.getElementById('modalMainImg').src = u);
            thumbsEl.appendChild(t);
        });

        // Specs: use extractor (do NOT show raw description)
        const extracted = extractSpecs(product.description || product.short_description || '');
        const specs = {
            Processor: product.processor || extracted.processor || '—',
            RAM: product.ram || extracted.ram || '—',
            Storage: product.storage || extracted.storage || '—',
            Display: product.display || extracted.display || '—',
            Graphics: product.graphics || extracted.graphics || '—'
        };

        modalSpecs.innerHTML = Object.entries(specs).map(([k,v])=> `<div class="spec"><strong>${k}</strong><div>${v}</div></div>`).join('');

        modalDescription.innerText = product.short_description || '';

        // manage focus
        _lastFocused = document.activeElement;
        modal.classList.add('open');
        modal.setAttribute('aria-hidden','false');
        setTimeout(()=> modalClose?.focus(), 50);
    }

});
