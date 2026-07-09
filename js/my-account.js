// My Account Logic
let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Check if user is logged in
    const user = JSON.parse(localStorage.getItem('user'));
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

function openSectionFromHash() {
    const hash = window.location.hash.replace('#', '').toLowerCase();
    if (hash === 'support' || hash === 'help') {
        switchSection('help');
    } else if (hash === 'profile') {
        switchSection('profile');
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

// Load user addresses
async function loadUserAddresses() {
    try {
        const response = await fetch(`/api/v1/addresses/${currentUser.userID}`);
        if (response.ok) {
            const data = await response.json();
            const addresses = data.data || [];
            
            let html = '';
            if (addresses.length === 0) {
                html = `
                    <div class="empty-state" style="background: transparent; box-shadow: none;">
                        <i class='bx bx-map'></i>
                        <h3>No Addresses</h3>
                        <p>You haven't added any addresses yet.</p>
                        <button onclick="addNewAddress()" class="btn btn-primary">
                            Add New Address
                        </button>
                    </div>
                `;
            } else {
                html = `
                    <div style="display: grid; gap: 15px; margin-bottom: 20px;">
                        ${addresses.map(addr => `
                            <div style="padding: 20px; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 10px; background: rgba(255, 255, 255, 0.02);">
                                <h4 style="margin: 0 0 10px 0; color: var(--white); font-family: 'Inter', sans-serif;">${addr.type || 'Address'}</h4>
                                <p style="margin: 5px 0; color: rgba(255, 255, 255, 0.7);">${addr.line1}</p>
                                ${addr.line2 ? `<p style="margin: 5px 0; color: rgba(255, 255, 255, 0.7);">${addr.line2}</p>` : ''}
                                <p style="margin: 5px 0; color: rgba(255, 255, 255, 0.7);">${addr.city}, ${addr.province} ${addr.postal_code}</p>
                                <p style="margin: 10px 0 0 0; color: rgba(255, 255, 255, 0.5); font-size: 0.9rem;">${addr.country}</p>
                            </div>
                        `).join('')}
                    </div>
                    <button onclick="addNewAddress()" class="btn btn-primary">
                        Add New Address
                    </button>
                `;
            }
            document.getElementById('addressesContainer').innerHTML = html;
        }
    } catch (error) {
        console.error('Error loading addresses:', error);
        document.getElementById('addressesContainer').innerHTML = `
            <div class="empty-state" style="background: transparent; box-shadow: none;">
                <p style="color: #ff4757;">Error loading addresses</p>
            </div>
        `;
    }
}

function addNewAddress() {
    alert('Address management coming soon!');
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
function logout() {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.removeItem('user');
        localStorage.removeItem('userID');
        localStorage.removeItem('token');
        localStorage.removeItem('cart');
        localStorage.removeItem('wishlist');
        window.location.href = 'index.html';
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
