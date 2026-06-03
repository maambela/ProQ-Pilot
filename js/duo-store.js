
/* ===== DUO STORE JAVASCRIPT ===== */
/* Interactive builder, cart integration, and configuration */

// Pricing tiers for different Duo editions
const TIER_PRICING = {
    ENTERPRISE: 3,  // Essentials (300 ÷ 100)
    PLATFORM: 5,    // Advantage (500 ÷ 100)
    BEYOND: 7       // Premier (700 ÷ 100)
};

const TIER_NAMES = {
    ENTERPRISE: 'Essentials',
    PLATFORM: 'Advantage',
    BEYOND: 'Premier'
};

document.addEventListener('DOMContentLoaded', function() {
    console.log('[Duo Store] Initializing...');
    
    // Load user and organizations
    const user = JSON.parse(localStorage.getItem('user'));
    if (user && user.userID) {
        loadUserOrganizations(user.userID);
    }
    
    initLicenseBuilder();
    initFAQAccordion();
    initDemoModal();
    initCartButton();
    updateCartBadge();
    
    console.log('[Duo Store] Initialization complete');
});

// ===== LOAD EXISTING ORGANIZATIONS =====
async function loadUserOrganizations(userId) {
    try {
        console.log('[Duo Store] Loading organizations for user:', userId);
        
        const response = await fetch(`/api/v1/duo/organizations/${userId}`);
        const data = await response.json();
        
        if (data.success && data.organizations && data.organizations.length > 0) {
            console.log('[Duo Store] Found organizations:', data.organizations);
            displayOrganizations(data.organizations, userId);
        } else {
            console.log('[Duo Store] No organizations found');
        }
    } catch (error) {
        console.error('[Duo Store] Error loading organizations:', error);
    }
}

/**
 * Display purchased Duo organizations
 */
function displayOrganizations(organizations, userId) {
    const container = document.getElementById('existing-organizations');
    
    if (!container) {
        console.log('[Duo Store] No organizations container found');
        return;
    }

    if (!organizations || organizations.length === 0) {
        container.innerHTML = '';
        return;
    }

    let organizationsHTML = '<h2 style="margin-bottom: 20px; color: white;">Your Duo Organizations</h2>';
    organizationsHTML += '<div style="display: grid; gap: 20px;">';

    organizations.forEach(org => {
        const adminText = org.admin_emails.join(', ');
        const upgradeCost = (org.user_limit * (TIER_PRICING[org.edition] || 5)).toLocaleString();
        
        organizationsHTML += `
        <div style="
            padding: 25px;
            border-radius: 16px;
            background: linear-gradient(135deg, rgba(0, 188, 212, 0.15), rgba(105, 215, 255, 0.1));
            border: 1px solid rgba(0, 188, 212, 0.4);
            display: grid;
            grid-template-columns: 1fr auto;
            gap: 30px;
        ">
            <div>
                <h3 style="color: white; margin: 0 0 15px 0; font-size: 1.3rem;">${org.organization_name}</h3>
                <div style="color: rgba(255,255,255,0.8); font-size: 0.95rem; line-height: 1.8;">
                    <div><strong>Licensed Users:</strong> ${org.user_limit}</div>
                    <div><strong>Administrators:</strong> ${adminText}</div>
                    <div><strong>Status:</strong> <span style="color: #00bcd4;">${org.status.toUpperCase()}</span></div>
                    <div><strong>Created:</strong> ${new Date(org.created_at).toLocaleDateString()}</div>
                </div>
            </div>
            <div style="display: flex; flex-direction: column; gap: 12px; justify-content: center;">
                <a href="https://admin-${org.duo_account_id}.duosecurity.com" target="_blank" style="
                    padding: 12px 20px;
                    border-radius: 8px;
                    background: linear-gradient(135deg, #00bcd4, #69d7ff);
                    color: white;
                    text-decoration: none;
                    text-align: center;
                    font-weight: 200;
                    transition: all 0.3s ease;
                " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 12px 30px rgba(0, 188, 212, 0.4)'" onmouseout="this.style.transform='none'; this.style.boxShadow='none'">
                    Go to Dashboard
                </a>
                <button onclick="openUpgradeFlow(${org.id}, ${org.user_limit}, '${org.organization_name}', ${userId})" style="
                    padding: 12px 20px;
                    border-radius: 8px;
                    background: rgba(255,255,255,0.1);
                    color: #69d7ff;
                    border: 1px solid #00bcd4;
                    cursor: pointer;
                    font-weight: 200;
                    transition: all 0.3s ease;
                " onmouseover="this.style.background='rgba(0, 188, 212, 0.15)'" onmouseout="this.style.background='rgba(255,255,255,0.1)'">
                    Upgrade
                </button>
            </div>
        </div>
        `;
    });

    organizationsHTML += '</div>';
    container.innerHTML = organizationsHTML;
}

/**
 * Open upgrade flow for existing organization
 */
function openUpgradeFlow(orgId, currentLimit, orgName, userId) {
    console.log(`[Duo Store] Opening upgrade for org ${orgId}`);
    
    // Scroll to builder
    const builder = document.querySelector('.duo-license-builder');
    if (builder) {
        builder.scrollIntoView({ behavior: 'smooth' });
        
        // Set the org ID in the builder for reference
        window.upgradeOrgId = orgId;
        window.currentUserCount = currentLimit;
        window.upgradeMode = true;
        
        // Update UI to reflect upgrade mode
        const orgNameInput = document.getElementById('orgName');
        if (orgNameInput) {
            orgNameInput.value = orgName;
            orgNameInput.disabled = true;
        }
        
        // Show upgrade notice
        const builderSection = builder.querySelector('.builder-form-panel');
        if (builderSection && !document.getElementById('upgrade-notice')) {
            const notice = document.createElement('div');
            notice.id = 'upgrade-notice';
            notice.style.cssText = `
                padding: 15px;
                margin-bottom: 20px;
                border-radius: 10px;
                background: rgba(0, 188, 212, 0.15);
                border-left: 4px solid #00bcd4;
                color: #69d7ff;
                font-weight: 200;
            `;
            notice.innerHTML = `<i class='bx bx-info-circle'></i> Upgrade Mode: Increase users from ${currentLimit}`;
            builderSection.insertBefore(notice, builderSection.firstChild);
        }
        
        // Change button text
        const addButton = document.getElementById('btnAddToCart');
        if (addButton) {
            addButton.innerHTML = '<i class="bx bx-cart-add"></i> Upgrade License';
        }
    }
}

/**
 * Validate configuration and prepare for checkout (no account creation yet)
 * Account will be created after payment is verified on order-success.html
 */
function submitDuoConfig() {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user || !user.userID) {
        alert('Please log in to purchase Duo licenses');
        window.location.href = 'signin.html';
        return;
    }

    if (!validateBuilder()) {
        return;
    }

    console.log('[Duo Store] Configuration validated. Adding to cart...');

    if (window.upgradeMode) {
        // Upgrade mode: prepare upgrade and add to cart
        handleUpgradeFlow();
    } else {
        // New purchase: add to cart
        addDuoToCart();
    }
}

/**
 * Handle upgrade flow - validate and add upgrade to cart
 * Account upgrade will happen after payment verification
 */
function handleUpgradeFlow() {
    const orgName = document.getElementById('orgName').value.trim();
    const userCount = parseInt(document.getElementById('userCount').value);
    const selectedEdition = document.querySelector('input[name="duoEdition"]:checked').value;
    const user = JSON.parse(localStorage.getItem('user'));

    // Validate new limit is higher
    if (userCount <= window.currentUserCount) {
        alert(`Please increase the user count. Current: ${window.currentUserCount}, New: ${userCount}`);
        return;
    }

    // Store upgrade info in sessionStorage for post-payment processing
    const upgradeConfig = {
        duo_org_id: window.upgradeOrgId,
        organization_name: orgName,
        old_user_limit: window.currentUserCount,
        new_user_limit: userCount,
        edition: selectedEdition,
        userId: user.userID
    };

    sessionStorage.setItem('duoUpgradeConfig', JSON.stringify(upgradeConfig));
    console.log('[Duo Store] Upgrade config stored in session:', upgradeConfig);

    // Add upgrade product to cart
    addUpgradeToCart(upgradeConfig);
}

/**
 * Add upgrade product to cart
 */
function addUpgradeToCart(upgradeConfig) {
    const pricePerLicense = TIER_PRICING[upgradeConfig.edition] || 500;
    const additionalUsers = upgradeConfig.new_user_limit - upgradeConfig.old_user_limit;
    const totalPrice = additionalUsers * pricePerLicense;

    // Add product details to config for database persistence
    upgradeConfig.product_name = 'Cisco Duo Security - Upgrade';
    upgradeConfig.product_description = `Upgrade: ${upgradeConfig.organization_name} | +${additionalUsers} User(s) (${upgradeConfig.old_user_limit}→${upgradeConfig.new_user_limit})`;
    upgradeConfig.product_price = totalPrice;

    const upgradeProduct = {
        id: 0, // Cisco Duo Virtual ID
        type: 'duo-security-upgrade',
        product_name: 'Cisco Duo Security - Upgrade',
        description: `Upgrade: ${upgradeConfig.organization_name} | +${additionalUsers} User(s) (${upgradeConfig.old_user_limit}→${upgradeConfig.new_user_limit})`,
        quantity: 1,
        price: totalPrice,
        image_url: 'https://www.cisco.com/c/dam/en_us/about/ac49/ac0/logo.svg',
        duo_config: upgradeConfig
    };

    let cart = JSON.parse(localStorage.getItem('cart')) || [];
    
    // Check if this SAME organization upgrade already in cart (by duo_org_id)
    const existingUpgradeIndex = cart.findIndex(item => 
        item.type === 'duo-security-upgrade' && 
        item.duo_config?.duo_org_id === upgradeConfig.duo_org_id
    );
    
    if (existingUpgradeIndex >= 0) {
        console.log(`[Duo Store] Upgrade for org ID ${upgradeConfig.duo_org_id} already in cart - replacing`);
        cart[existingUpgradeIndex] = upgradeProduct;
        console.log('[Duo Store] Upgrade cart item updated');
    } else {
        console.log(`[Duo Store] Adding new upgrade for org ID ${upgradeConfig.duo_org_id}`);
        cart.push(upgradeProduct);
        console.log('[Duo Store] Upgrade added to cart');
    }

    localStorage.setItem('cart', JSON.stringify(cart));
    
    // Sync to server if logged in
    if (user && user.userID) {
        console.log('[Duo Store] Syncing upgrade to server...');
        console.log('[Duo Store] User ID:', user.userID);
        console.log('[Duo Store] Upgrade product to sync:', upgradeProduct);
        syncCartToServer(user.userID, upgradeProduct);
    } else {
        console.log('[Duo Store] Not logged in, skipping server sync');
    }

    updateCartBadge();

    window.scrollTo({ top: 0, behavior: 'smooth' });
    alert('✅ Upgrade added to cart! Proceed to checkout to complete.');

    setTimeout(() => {
        window.location.href = 'cart.html';
    }, 2000);
}


// ===== LICENSE BUILDER =====
function initLicenseBuilder() {
    const orgNameInput = document.getElementById('orgName');
    const userCountSlider = document.getElementById('userCount');
    const editionRadios = document.querySelectorAll('input[name="duoEdition"]');
    const adminsList = document.getElementById('adminsList');
    const btnAddAdmin = document.getElementById('btnAddAdmin');
    const btnAddToCart = document.getElementById('btnAddToCart');

    // Set default organization name from user if logged in
    const user = JSON.parse(localStorage.getItem('user'));
    if (user && user.company_name) {
        orgNameInput.value = user.company_name;
    } else if (user && user.name) {
        orgNameInput.value = user.name + "'s Organization";
    }

    // Update preview when organization name changes
    orgNameInput.addEventListener('input', function() {
        updatePreview();
    });

    // Update preview when user count changes
    userCountSlider.addEventListener('input', function() {
        document.getElementById('userCountDisplay').textContent = this.value;
        updatePreview();
    });

    // Update preview when edition changes
    editionRadios.forEach(radio => {
        radio.addEventListener('change', function() {
            console.log('[Duo Store] Edition changed to:', this.value);
            updatePreview();
        });
    });

    // Add admin button
    btnAddAdmin.addEventListener('click', function() {
        addAdminField();
    });

    // Remove admin on blur if empty (except first one)
    adminsList.addEventListener('change', function(e) {
        if (e.target.classList.contains('admin-email-input')) {
            updatePreview();
            
            // Auto-remove empty fields that aren't the first one
            const inputGroups = adminsList.querySelectorAll('.admin-input-group');
            inputGroups.forEach((group, index) => {
                const input = group.querySelector('.admin-email-input');
                const removeBtn = group.querySelector('.btn-remove-admin');
                
                if (input.value === '' && index > 0) {
                    removeBtn.click();
                } else if (input.value !== '') {
                    removeBtn.style.display = 'block';
                }
            });
        }
    });

    // Handle remove button clicks
    adminsList.addEventListener('click', function(e) {
        if (e.target.classList.contains('btn-remove-admin')) {
            e.target.parentElement.remove();
            updatePreview();
        }
    });

    // Add to cart button - now calls submitDuoConfig
    btnAddToCart.addEventListener('click', function() {
        submitDuoConfig();
    });

    // Initial preview update
    updatePreview();
}

/**
 * Add a new admin email input field
 */
function addAdminField() {
    const adminsList = document.getElementById('adminsList');
    const count = adminsList.querySelectorAll('.admin-input-group').length;
    
    if (count >= 5) {
        alert('Maximum 5 admins allowed');
        return;
    }

    const newGroup = document.createElement('div');
    newGroup.className = 'admin-input-group';
    newGroup.innerHTML = `
        <input 
            type="email" 
            class="admin-email-input" 
            placeholder="admin@example.com"
        >
        <button class="btn-remove-admin">
            <i class='bx bx-x'></i>
        </button>
    `;

    adminsList.appendChild(newGroup);
    
    // Focus on new input
    const newInput = newGroup.querySelector('.admin-email-input');
    newInput.focus();
    
    // Add event listeners to new input
    newInput.addEventListener('change', updatePreview);
    
    updatePreview();
}

/**
 * Update the live preview panel
 */
function updatePreview() {
    const orgName = document.getElementById('orgName').value || 'Organisation Name';
    const userCount = document.getElementById('userCount').value;
    const selectedEdition = document.querySelector('input[name="duoEdition"]:checked').value;
    const adminInputs = document.querySelectorAll('.admin-email-input');
    
    // Filter out empty admin emails
    const admins = Array.from(adminInputs)
        .map(input => input.value)
        .filter(email => email !== '');

    // Update organization name
    document.getElementById('previewOrg').textContent = orgName;

    // Update user count
    document.getElementById('previewUsers').textContent = userCount;
    document.getElementById('pricingUsers').textContent = userCount;

    // Update admin list
    const previewAdminsList = document.getElementById('previewAdmins');
    previewAdminsList.innerHTML = '';
    
    admins.forEach(admin => {
        const badge = document.createElement('span');
        badge.className = 'admin-badge';
        badge.textContent = admin;
        previewAdminsList.appendChild(badge);
    });

    if (admins.length === 0) {
        previewAdminsList.innerHTML = '<span class="admin-badge" style="opacity: 0.5;">No admins added yet</span>';
    }

    // Update pricing based on selected edition
    const pricePerLicense = TIER_PRICING[selectedEdition] || 500;
    const total = userCount * pricePerLicense;
    
    // Update pricing display
    document.getElementById('pricePerLicense').textContent = 'R ' + pricePerLicense.toLocaleString();
    document.getElementById('totalPrice').textContent = 'R ' + total.toLocaleString();
    
    // Update tier name if displaying it
    const tierName = TIER_NAMES[selectedEdition] || 'Advantage';
    console.log('[Duo Store] Preview updated - Edition:', tierName, 'Price per user: R', pricePerLicense);
}

/**
 * Validate builder before adding to cart
 */
function validateBuilder() {
    const orgName = document.getElementById('orgName').value.trim();
    const adminInputs = document.querySelectorAll('.admin-email-input');
    const admins = Array.from(adminInputs)
        .map(input => input.value.trim())
        .filter(email => email !== '');

    // Validate organization name
    if (!orgName) {
        alert('Please enter an organization name');
        document.getElementById('orgName').focus();
        return false;
    }

    // Validate at least one admin
    if (admins.length === 0) {
        alert('Please add at least one administrator email');
        return false;
    }

    // Validate email format for all admins
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (const admin of admins) {
        if (!emailRegex.test(admin)) {
            alert(`Invalid email format: ${admin}`);
            return false;
        }
    }

    return true;
}

/**
 * Add Duo configuration to cart (new purchase only)
 * Configuration is stored for post-payment account creation
 */
function addDuoToCart() {
    const user = JSON.parse(localStorage.getItem('user'));
    const orgName = document.getElementById('orgName').value.trim();
    const userCount = parseInt(document.getElementById('userCount').value);
    const selectedEdition = document.querySelector('input[name="duoEdition"]:checked').value;
    const adminInputs = document.querySelectorAll('.admin-email-input');
    const admins = Array.from(adminInputs)
        .map(input => input.value.trim())
        .filter(email => email !== '');

    const pricePerLicense = TIER_PRICING[selectedEdition] || 500;
    const totalPrice = userCount * pricePerLicense;

    // Store configuration in sessionStorage for post-payment account creation
    const purchaseConfig = {
        organization_name: orgName,
        user_limit: userCount,
        admin_emails: admins,
        edition: selectedEdition,
        customer_email: user.email,
        userId: user.userID,
        // Include product details for persistence to database
        product_name: 'Cisco Duo Security',
        product_description: `Organization: ${orgName} | ${userCount} User License(s)`,
        product_price: totalPrice
    };

    sessionStorage.setItem('duoPurchaseConfig', JSON.stringify(purchaseConfig));
    console.log('[Duo Store] Purchase config stored in session:', purchaseConfig);

    // Create Duo product object for cart
    const duoProduct = {
        id: 0, // Cisco Duo Virtual ID
        type: 'duo-security',
        product_name: 'Cisco Duo Security',
        description: `Organization: ${orgName} | ${userCount} User License(s)`,
        quantity: 1,
        price: totalPrice,
        image_url: 'https://www.cisco.com/c/dam/en_us/about/ac49/ac0/logo.svg',
        duo_config: purchaseConfig
    };

    // Get existing cart
    let cart = JSON.parse(localStorage.getItem('cart')) || [];

    // Check if this SAME organization already in cart (by org name, not just type)
    const existingDuoIndex = cart.findIndex(item => 
        item.type === 'duo-security' && 
        item.duo_config?.organization_name === purchaseConfig.organization_name
    );
    
    if (existingDuoIndex >= 0) {
        console.log(`[Duo Store] Organization "${purchaseConfig.organization_name}" already in cart - replacing`);
        cart[existingDuoIndex] = duoProduct;
        console.log('[Duo Store] Duo cart item updated');
    } else {
        console.log(`[Duo Store] Adding new organization "${purchaseConfig.organization_name}" to cart`);
        cart.push(duoProduct);
        console.log('[Duo Store] New Duo organization added to cart');
    }

    localStorage.setItem('cart', JSON.stringify(cart));

    // Sync to server if logged in
    if (user && user.userID) {
        console.log('[Duo Store] Syncing new purchase to server...');
        console.log('[Duo Store] User ID:', user.userID);
        console.log('[Duo Store] Product to sync:', duoProduct);
        syncCartToServer(user.userID, duoProduct);
    } else {
        console.log('[Duo Store] Not logged in, skipping server sync');
    }

    updateCartBadge();

    window.scrollTo({ top: 0, behavior: 'smooth' });
    alert('✅ Added to cart! Proceed to checkout to complete setup.');

    // Navigate to cart after sync has time to complete, or after 2 seconds
    setTimeout(() => {
        window.location.href = 'cart.html';
    }, 2500);
}

/**
 * Update shopping cart badge
 */
function updateCartBadge() {
    const cart = JSON.parse(localStorage.getItem('cart')) || [];
    const cartBadge = document.getElementById('cart-count');
    
    if (cartBadge) {
        cartBadge.textContent = cart.length;
    }
}

// ===== FAQ ACCORDION =====
function initFAQAccordion() {
    const faqItems = document.querySelectorAll('.faq-item');

    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');

        question.addEventListener('click', function() {
            // Close other items
            faqItems.forEach(otherItem => {
                if (otherItem !== item) {
                    otherItem.classList.remove('active');
                }
            });

            // Toggle current item
            item.classList.toggle('active');
        });
    });
}

// ===== DEMO MODAL =====
function initDemoModal() {
    const demoModal = document.getElementById('demoModal');
    const demoCloseBtn = document.getElementById('demoClose');
    const viewDemoBtn = document.getElementById('btnViewDemo');

    if (viewDemoBtn) {
        viewDemoBtn.addEventListener('click', function() {
            demoModal.setAttribute('aria-hidden', 'false');
        });
    }

    if (demoCloseBtn) {
        demoCloseBtn.addEventListener('click', function() {
            demoModal.setAttribute('aria-hidden', 'true');
        });
    }

    // Close modal when clicking outside
    demoModal.addEventListener('click', function(e) {
        if (e.target === demoModal) {
            demoModal.setAttribute('aria-hidden', 'true');
        }
    });
}

// ===== CART INTEGRATION =====
function initCartButton() {
    // Cart button in header already works from auth-ui.js
    // This function is for any additional Duo-specific cart behavior
}

// Helper to get Duo purchase config from sessionStorage
window.getDuoPurchaseConfig = function() {
    return JSON.parse(sessionStorage.getItem('duoPurchaseConfig'));
};

// Helper to get Duo upgrade config from sessionStorage
window.getDuoUpgradeConfig = function() {
    return JSON.parse(sessionStorage.getItem('duoUpgradeConfig'));
};

// Sync cart with server
async function syncCartToServer(userID, item) {
    try {
        console.log('[Duo Store] Starting cart sync...');
        console.log('[Duo Store] Sending to /api/v1/cart/sync:', { userID, item });
        
        const response = await fetch('/api/v1/cart/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userID: userID,
                items: [item]
            })
        });
        
        console.log('[Duo Store] Sync response status:', response.status);
        const data = await response.json();
        console.log('[Duo Store] Sync response data:', data);
        
        if (!response.ok) {
            console.error('[Duo Store] Cart sync failed with status', response.status);
        } else {
            console.log('[Duo Store] Cart sync successful');
        }
    } catch (error) {
        console.error('[Duo Store] Error syncing cart:', error);
    }
}

// Log that script loaded
console.log('[Duo Store JS] Script loaded successfully');
