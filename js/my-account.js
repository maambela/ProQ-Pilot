// My Account Logic
let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Check if user is logged in
    const user = await window.ProQSession.ready;
    if (!user) {
        window.location.href = 'signin.html';
        return;
    }

    currentUser = user;
    await loadUserData();
    updateWishlistAndCartBadges();
    openSectionFromHash();
});

window.addEventListener('hashchange', openSectionFromHash);

// Load user data and populate the page
async function loadUserData() {
    try {
        const response = await fetch(`/api/v1/users/${currentUser.userID}`);
        if (response.ok) {
            const data = await response.json();
            const userData = data.data;
            
            // Update header
            const firstName = userData.firstName || 'User';
            const lastName = userData.lastName || '';
            document.getElementById('userName').textContent = `${firstName} ${lastName}`;
            document.getElementById('userEmail').textContent = userData.email || '';
            
            // Update profile section
            document.getElementById('profileFirstName').textContent = firstName;
            document.getElementById('profileLastName').textContent = lastName;
            document.getElementById('profileEmail').textContent = userData.email || '';
            document.getElementById('profileContact').textContent = userData.contact || 'Not provided';
            
            // Update edit form
            document.getElementById('editFirstName').value = firstName;
            document.getElementById('editLastName').value = lastName;
            document.getElementById('editEmail').value = userData.email || '';
            document.getElementById('editContact').value = userData.contact || '';
        }
    } catch (error) {
        console.error('Error loading user data:', error);
    }

    // Load orders
    await loadUserOrders();
    
    // Load addresses
    await loadUserAddresses();
}

// Switch between sections
function switchSection(section) {
    // Hide all sections
    document.querySelectorAll('.account-section').forEach(s => s.classList.remove('active'));
    
    // Show selected section
    const sectionId = section === 'dashboard' ? 'dashboard-section' : `${section}-section`;
    const element = document.getElementById(sectionId);
    if (element) {
        element.classList.add('active');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

// Deep links from the header menu: #profile, #orders, #addresses, #returns, #support,
// plus #help-message and #faq, which open Help & Support and scroll to that block.
function openSectionFromHash() {
    const hash = window.location.hash.replace('#', '').toLowerCase();
    const sections = { profile: 'profile', orders: 'orders', addresses: 'addresses', returns: 'returns', support: 'help', help: 'help' };
    const supportBlocks = { 'help-message': 'help-message', faq: 'faq' };

    if (sections[hash]) {
        switchSection(sections[hash]);
    } else if (supportBlocks[hash]) {
        switchSection('help');
        setTimeout(() => {
            document.getElementById(supportBlocks[hash])?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            if (hash === 'help-message') document.getElementById('helpSubject')?.focus({ preventScroll: true });
        }, 350);
    }
}

// Profile Management
function enableEditProfile() {
    document.getElementById('profileView').style.display = 'none';
    document.getElementById('profileEdit').style.display = 'block';
}

function cancelEditProfile() {
    document.getElementById('profileView').style.display = 'block';
    document.getElementById('profileEdit').style.display = 'none';
}

document.getElementById('profileForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const firstName = document.getElementById('editFirstName').value;
    const lastName = document.getElementById('editLastName').value;
    const email = document.getElementById('editEmail').value;
    const contact = document.getElementById('editContact').value;
    
    try {
        const response = await fetch(`/api/v1/users/${currentUser.userID}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                firstName,
                lastName,
                email,
                contact
            })
        });
        
        if (response.ok) {
            // Update localStorage
            currentUser.firstName = firstName;
            currentUser.lastName = lastName;
            localStorage.setItem('user', JSON.stringify(currentUser));
            
            // Update display
            document.getElementById('userName').textContent = `${firstName} ${lastName}`;
            document.getElementById('userEmail').textContent = email;
            document.getElementById('profileFirstName').textContent = firstName;
            document.getElementById('profileLastName').textContent = lastName;
            document.getElementById('profileEmail').textContent = email;
            document.getElementById('profileContact').textContent = contact || 'Not provided';
            
            showNotification('Profile updated successfully!', 'success');
            cancelEditProfile();
        } else {
            showNotification('Error updating profile', 'error');
        }
    } catch (error) {
        console.error('Error updating profile:', error);
        showNotification('Error updating profile', 'error');
    }
});

// Load user orders
async function loadUserOrders() {
    try {
        const response = await fetch(`/api/v1/orders/user/${currentUser.userID}`);
        if (response.ok) {
            const data = await response.json();
            const orders = data.data || [];
            
            let html = '';
            if (orders.length === 0) {
                html = `
                    <div class="empty-state" style="background: transparent; box-shadow: none;">
                        <i class='bx bx-package'></i>
                        <h3>No Orders Yet</h3>
                        <p>You haven't placed any orders yet.</p>
                        <a href="store.html" class="btn btn-primary">Start Shopping</a>
                    </div>
                `;
            } else {
                html = `
                    <div class="account-mini-order-list">
                        ${orders.map(order => `
                            <div class="account-mini-order-card">
                                <div>
                                    <h4>Order #${order.id}</h4>
                                    <div class="account-mini-order-meta">${new Date(order.created_at).toLocaleDateString()} · ${order.items?.length || 0} item${(order.items?.length || 0) === 1 ? '' : 's'}</div>
                                </div>
                                <div class="account-mini-order-side">
                                    <span class="account-status-pill">${order.status || 'Pending'}</span>
                                    <span class="account-mini-order-total">${formatAccountCurrency(order.total_amount || 0)}</span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `;
            }
            document.getElementById('ordersContainer').innerHTML = html;
        }
    } catch (error) {
        console.error('Error loading orders:', error);
        document.getElementById('ordersContainer').innerHTML = `
            <div class="empty-state" style="background: transparent; box-shadow: none;">
                <p style="color: #ff4757;">Error loading orders</p>
            </div>
        `;
    }
}

function formatAccountCurrency(value) {
    const amount = Number(value) || 0;
    return `R${amount.toLocaleString('en-ZA', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;
}

// Delivery address management
const SA_PROVINCES = [
    'Eastern Cape',
    'Free State',
    'Gauteng',
    'KwaZulu-Natal',
    'Limpopo',
    'Mpumalanga',
    'Northern Cape',
    'North West',
    'Western Cape'
];

let savedAddresses = [];
let selectedAddressId = null;
let addressEditor = null;
let addressFeedback = '';
let addressFeedbackError = false;

function escapeAddressHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getStoredSelectedAddress() {
    try {
        return JSON.parse(sessionStorage.getItem('selectedAddress') || 'null');
    } catch (error) {
        return null;
    }
}

function setStoredSelectedAddress(address) {
    if (!address) {
        sessionStorage.removeItem('selectedAddress');
        return;
    }
    sessionStorage.setItem('selectedAddress', JSON.stringify(address));
}

function provinceOptions(selectedProvince) {
    const preservedOption = selectedProvince && !SA_PROVINCES.includes(selectedProvince)
        ? `<option value="${escapeAddressHtml(selectedProvince)}" selected>${escapeAddressHtml(selectedProvince)}</option>`
        : '';
    return preservedOption + SA_PROVINCES.map(province => `
        <option value="${escapeAddressHtml(province)}"${province === (selectedProvince || '') ? ' selected' : ''}>
            ${escapeAddressHtml(province)}
        </option>
    `).join('');
}

function addressEditorMarkup(address = null) {
    const isEdit = Boolean(address);
    const id = isEdit ? address.id : 'new';
    const title = isEdit ? 'Edit address' : 'Add another address';

    return `
        <div class="address-editor open" data-editor="${escapeAddressHtml(id)}">
            <div class="address-editor-inner">
                <form class="address-editor-grid" data-address-form="${escapeAddressHtml(id)}">
                    <h3 style="grid-column:1/-1;margin:0 0 2px;font-size:0.9rem;font-weight:100;">${title}</h3>
                    <div class="form-group full">
                        <label for="address-line1-${escapeAddressHtml(id)}">Street Address</label>
                        <input id="address-line1-${escapeAddressHtml(id)}" name="line1" value="${escapeAddressHtml(address?.line1 || '')}" required autocomplete="street-address">
                    </div>
                    <div class="form-group">
                        <label for="address-city-${escapeAddressHtml(id)}">City / Town</label>
                        <input id="address-city-${escapeAddressHtml(id)}" name="city" value="${escapeAddressHtml(address?.city || '')}" required autocomplete="address-level2">
                    </div>
                    <div class="form-group">
                        <label for="address-province-${escapeAddressHtml(id)}">Province</label>
                        <select id="address-province-${escapeAddressHtml(id)}" name="province" required>
                            <option value="">Select province</option>
                            ${provinceOptions(address?.province)}
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="address-postal-${escapeAddressHtml(id)}">Postal Code</label>
                        <input id="address-postal-${escapeAddressHtml(id)}" name="postal_code" value="${escapeAddressHtml(address?.postal_code || '')}" required autocomplete="postal-code">
                    </div>
                    <div class="form-group">
                        <label>Country</label>
                        <div class="address-country">South Africa</div>
                        <input type="hidden" name="country" value="South Africa">
                    </div>
                    <div class="form-group full">
                        <label for="address-phone-${escapeAddressHtml(id)}">Contact Number</label>
                        <input id="address-phone-${escapeAddressHtml(id)}" name="phone" value="${escapeAddressHtml(address?.phone || '')}" required autocomplete="tel" placeholder="+27 76 260 9804">
                    </div>
                    <div class="form-group full">
                        <label for="address-instructions-${escapeAddressHtml(id)}">Delivery Instructions <span style="text-transform:none;color:rgba(255,255,255,.5);">(optional)</span></label>
                        <textarea id="address-instructions-${escapeAddressHtml(id)}" name="delivery_instructions">${escapeAddressHtml(address?.delivery_instructions || '')}</textarea>
                    </div>
                    <div class="form-actions full">
                        <button type="submit" class="btn btn-primary address-save">${isEdit ? 'Save Changes' : 'Save Address'}</button>
                        <button type="button" class="btn address-cancel">Cancel</button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

function addressCardMarkup(address) {
    const selected = Number(address.id) === Number(selectedAddressId);
    const line1 = address.line1 || '';
    const line2 = address.line2 ? address.line2 : '';
    const location = [address.city, address.province, address.postal_code].filter(Boolean).join(', ');

    return `
        <div class="address-card-wrap" data-address-wrap="${escapeAddressHtml(address.id)}">
            <div class="address-card${selected ? ' selected' : ''}" role="button" tabindex="0" data-address-id="${escapeAddressHtml(address.id)}" aria-pressed="${selected ? 'true' : 'false'}">
                <div class="address-card-main">
                    <h3 class="address-card-city">${escapeAddressHtml(address.city || 'Saved address')}</h3>
                    <p class="address-card-line">${escapeAddressHtml([line1, line2].filter(Boolean).join(', ') || 'Address details unavailable')}</p>
                    <p class="address-card-location">${escapeAddressHtml(location)} · ${escapeAddressHtml(address.country || 'South Africa')}</p>
                    ${address.phone ? `<p class="address-card-phone">${escapeAddressHtml(address.phone)}</p>` : ''}
                    ${selected ? `<span class="address-selected"><i class='bx bx-check-circle'></i> Selected</span>` : ''}
                </div>
                <div class="address-card-actions">
                    <button type="button" class="address-card-action edit" data-address-action="edit" data-address-id="${escapeAddressHtml(address.id)}">Edit</button>
                    <button type="button" class="address-card-action delete" data-address-action="delete" data-address-id="${escapeAddressHtml(address.id)}">Delete</button>
                </div>
            </div>
            ${addressEditor?.id === address.id ? addressEditorMarkup(address) : ''}
        </div>
    `;
}

function renderAddressManager() {
    const container = document.getElementById('addressesContainer');
    if (!container) return;

    if (!savedAddresses.length) {
        container.innerHTML = `
            <p class="address-feedback${addressFeedbackError ? ' error' : ''}" role="status" aria-live="polite">${escapeAddressHtml(addressFeedback)}</p>
            <div class="empty-state" style="background: transparent; box-shadow: none;">
                <i class='bx bx-map'></i>
                <h3>No Addresses</h3>
                <p>You haven't added any addresses yet.</p>
            </div>
            ${addressEditor?.mode === 'add' ? addressEditorMarkup() : ''}
            ${addressEditor?.mode === 'add' ? '' : '<button type="button" class="address-add-button" data-address-action="add">+ Add another address</button>'}
        `;
        bindAddressManagerEvents(container);
        return;
    }

    container.innerHTML = `
        <p class="address-feedback${addressFeedbackError ? ' error' : ''}" role="status" aria-live="polite">${escapeAddressHtml(addressFeedback)}</p>
        <div class="address-list">
            ${savedAddresses.map(addressCardMarkup).join('')}
        </div>
        ${addressEditor?.mode === 'add' ? addressEditorMarkup() : ''}
        ${addressEditor?.mode === 'add' ? '' : '<button type="button" class="address-add-button" data-address-action="add">+ Add another address</button>'}
    `;
    bindAddressManagerEvents(container);
}

function bindAddressManagerEvents(container) {
    container.querySelectorAll('.address-card').forEach(card => {
        const selectCard = () => selectSavedAddress(Number(card.dataset.addressId));
        card.addEventListener('click', event => {
            if (event.target.closest('[data-address-action]')) return;
            selectCard();
        });
        card.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                selectCard();
            }
        });
    });

    container.querySelectorAll('[data-address-action]').forEach(button => {
        button.addEventListener('click', event => {
            event.stopPropagation();
            const action = button.dataset.addressAction;
            const id = button.dataset.addressId ? Number(button.dataset.addressId) : null;
            if (action === 'edit') openAddressEditor(id);
            if (action === 'delete') deleteSavedAddress(id);
            if (action === 'add') openAddressEditor(null);
        });
    });

    container.querySelectorAll('[data-address-form]').forEach(form => {
        form.addEventListener('submit', saveAddressFromForm);
        form.querySelector('.address-cancel')?.addEventListener('click', cancelAddressEditor);
    });
}

function selectSavedAddress(id) {
    const address = savedAddresses.find(item => Number(item.id) === Number(id));
    if (!address) return;
    selectedAddressId = Number(address.id);
    setStoredSelectedAddress(address);
    addressFeedback = '';
    addressFeedbackError = false;
    renderAddressManager();
}

function openAddressEditor(id) {
    if (id) {
        const address = savedAddresses.find(item => Number(item.id) === Number(id));
        if (!address) return;
        addressEditor = { mode: 'edit', id: Number(address.id), address };
    } else {
        addressEditor = { mode: 'add', id: null };
    }
    addressFeedback = '';
    addressFeedbackError = false;
    renderAddressManager();
    const form = document.querySelector('[data-address-form]');
    form?.querySelector('input, select, textarea')?.focus({ preventScroll: true });
}

function cancelAddressEditor() {
    addressEditor = null;
    addressFeedback = '';
    addressFeedbackError = false;
    renderAddressManager();
}

async function saveAddressFromForm(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;

    const saveButton = form.querySelector('.address-save');
    if (saveButton?.disabled) return;

    const editingId = addressEditor?.mode === 'edit' ? addressEditor.id : null;
    const editingAddress = addressEditor?.mode === 'edit' ? addressEditor.address : null;
    const payload = {
        userID: currentUser.userID,
        line1: form.elements.line1.value.trim(),
        line2: editingAddress?.line2 || '',
        city: form.elements.city.value.trim(),
        province: form.elements.province.value,
        postal_code: form.elements.postal_code.value.trim(),
        country: 'South Africa',
        phone: form.elements.phone.value.trim(),
        delivery_instructions: form.elements.delivery_instructions.value.trim(),
        is_default: editingId ? (editingAddress?.is_default || 0) : (savedAddresses.length === 0 ? 1 : 0)
    };

    saveButton.disabled = true;
    saveButton.textContent = editingId ? 'Saving...' : 'Saving...';

    try {
        let savedAddressId = editingId;
        if (editingId) {
            await accountAddressRequest(`/api/v1/addresses/${editingId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } else {
            const result = await accountAddressRequest('/api/v1/addresses', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            savedAddressId = result.data?.id;
        }

        addressEditor = null;
        addressFeedback = editingId ? 'Address updated.' : 'Address added.';
        addressFeedbackError = false;
        await loadUserAddresses(savedAddressId);
    } catch (error) {
        addressFeedback = error.message || 'Could not save the address.';
        addressFeedbackError = true;
        renderAddressManager();
    }
}

async function deleteSavedAddress(id) {
    const address = savedAddresses.find(item => Number(item.id) === Number(id));
    if (!address) return;
    if (!confirm('Delete this saved address?')) return;

    try {
        await accountAddressRequest(`/api/v1/addresses/${id}`, { method: 'DELETE' });
        addressFeedback = 'Address deleted.';
        addressFeedbackError = false;
        addressEditor = null;
        await loadUserAddresses();
    } catch (error) {
        addressFeedback = error.message || 'Could not delete the address.';
        addressFeedbackError = true;
        renderAddressManager();
    }
}

async function accountAddressRequest(url, options = {}) {
    const response = await fetch(url, options);
    const payload = response.status === 204
        ? {}
        : await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload.message || payload.error || 'Address request failed.');
    }
    return payload;
}

async function loadUserAddresses(preferredAddressId = null) {
    const container = document.getElementById('addressesContainer');
    if (container) {
        container.innerHTML = '<p class="address-feedback" role="status">Loading addresses...</p>';
    }

    try {
        const response = await fetch(`/api/v1/addresses/${currentUser.userID}`);
        if (!response.ok) throw new Error('Could not load saved addresses.');
        const data = await response.json();
        savedAddresses = data.data || [];

        if (!savedAddresses.length) {
            selectedAddressId = null;
            setStoredSelectedAddress(null);
            renderAddressManager();
            return;
        }

        const stored = getStoredSelectedAddress();
        const preferred = savedAddresses.find(address =>
            Number(address.id) === Number(preferredAddressId)
        );
        const storedMatch = savedAddresses.find(address =>
            Number(address.id) === Number(stored?.id)
        );
        const defaultAddress = savedAddresses.find(address => Number(address.is_default) === 1);
        const selected = preferred || storedMatch || defaultAddress || savedAddresses[0];
        selectedAddressId = Number(selected.id);
        setStoredSelectedAddress(selected);
        renderAddressManager();
    } catch (error) {
        console.error('Error loading addresses:', error);
        savedAddresses = [];
        if (container) {
            container.innerHTML = `
                <p class="address-feedback error" role="alert">Could not load saved addresses.</p>
                <button type="button" class="address-add-button" onclick="loadUserAddresses()">Try again</button>
            `;
        }
    }
}

function addNewAddress() {
    openAddressEditor(null);
}

// Help form submission
document.getElementById('helpForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const subject = document.getElementById('helpSubject').value;
    const message = document.getElementById('helpMessage').value;
    
    // In a real application, this would send to your backend
    console.log('Help message:', { subject, message, userEmail: currentUser.email });
    
    showNotification('Thank you! We\'ll get back to you soon.', 'success');
    document.getElementById('helpForm').reset();
});

// Logout function
async function logout() {
    if (confirm('Are you sure you want to logout?')) {
        try { await window.ProQSession.logout(); } catch (error) { showNotification(error.message, 'error'); }
    }
}

// Show notifications
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 25px;
        background: ${type === 'success' ? '#31ffba' : type === 'error' ? '#ff4757' : '#64748b'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 5px 15px rgba(0,0,0,0.2);
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Update cart and wishlist badges
function updateWishlistAndCartBadges() {
    const userID = currentUser?.userID;
    
    // Update cart badge
    const cartBadge = document.getElementById('cart-count');
    if (userID) {
        fetch(`/api/v1/cart/${userID}`)
            .then(response => response.ok ? response.json() : { data: [] })
            .then(data => {
                const count = data.data?.reduce((acc, item) => acc + item.quantity, 0) || 0;
                if (cartBadge) cartBadge.textContent = count;
            })
            .catch(() => {
                const cart = JSON.parse(localStorage.getItem('cart') || '[]');
                const count = cart.reduce((acc, item) => acc + item.quantity, 0);
                if (cartBadge) cartBadge.textContent = count;
            });
    } else {
        const cart = JSON.parse(localStorage.getItem('cart') || '[]');
        const count = cart.reduce((acc, item) => acc + item.quantity, 0);
        if (cartBadge) cartBadge.textContent = count;
    }
    
    // Update wishlist badge
    const wishlistBadges = document.querySelectorAll('.wishlist-badge');
    if (userID) {
        fetch(`/api/v1/wishlist/count/${userID}`)
            .then(response => response.ok ? response.json() : { data: 0 })
            .then(data => {
                const count = data.data || 0;
                wishlistBadges.forEach(badge => badge.textContent = count);
            })
            .catch(() => {
                const wishlist = JSON.parse(localStorage.getItem('wishlist') || '[]');
                const count = wishlist.length;
                wishlistBadges.forEach(badge => badge.textContent = count);
            });
    } else {
        const wishlist = JSON.parse(localStorage.getItem('wishlist') || '[]');
        const count = wishlist.length;
        wishlistBadges.forEach(badge => badge.textContent = count);
    }
}
