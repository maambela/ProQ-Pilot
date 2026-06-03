// Duo License Builder JavaScript
// Minimal, clean implementation

class DuoLicenseBuilder {
    constructor() {
        this.organizationName = '';
        this.userLimit = 50;
        this.admins = [];
        this.selectedEdition = 'PLATFORM';
        this.init();
    }

    init() {
        this.setupElements();
        this.attachListeners();
        this.updatePreview();
    }

    setupElements() {
        // Form inputs
        this.orgNameInput = document.getElementById('organizationName');
        this.userSlider = document.getElementById('userCountSlider');
        this.userDisplay = document.getElementById('userCountDisplay');
        this.adminEmailInput = document.getElementById('adminEmail');
        this.adminsList = document.getElementById('adminsList');
        this.editionOptions = document.getElementById('editionOptions');
        
        // Preview elements
        this.previewOrgName = document.getElementById('previewOrgName');
        this.previewUserCount = document.getElementById('previewUserCount');
        this.previewEdition = document.getElementById('previewEdition');
        this.previewAdminsList = document.getElementById('previewAdminsList');
        this.previewPrice = document.getElementById('previewPrice');
        this.previewTotal = document.getElementById('previewTotal');
        
        // Action buttons
        this.addAdminBtn = document.getElementById('addAdminBtn');
        this.submitBtn = document.getElementById('submitBuilderBtn');
        this.resetBtn = document.getElementById('resetBuilderBtn');
    }

    attachListeners() {
        if (this.orgNameInput) this.orgNameInput.addEventListener('input', (e) => this.setOrgName(e.target.value));
        if (this.userSlider) this.userSlider.addEventListener('input', (e) => this.setUserLimit(parseInt(e.target.value)));
        if (this.adminEmailInput) this.adminEmailInput.addEventListener('keyPress', (e) => this.handleEmailKeyPress(e));
        if (this.addAdminBtn) this.addAdminBtn.addEventListener('click', () => this.addAdmin());
        if (this.submitBtn) this.submitBtn.addEventListener('click', () => this.submitForm());
        if (this.resetBtn) this.resetBtn.addEventListener('click', () => this.resetForm());
        
        if (this.editionOptions) {
            this.editionOptions.addEventListener('change', (e) => this.setEdition(e.target.value));
        }
    }

    setOrgName(name) {
        this.organizationName = name;
        this.updatePreview();
    }

    setUserLimit(limit) {
        this.userLimit = limit;
        if (this.userDisplay) this.userDisplay.textContent = limit.toLocaleString();
        this.updatePreview();
    }

    setEdition(edition) {
        this.selectedEdition = edition;
        this.updatePreview();
    }

    handleEmailKeyPress(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            this.addAdmin();
        }
    }

    addAdmin() {
        const email = this.adminEmailInput?.value.trim();
        if (!email) return;
        
        if (!this.isValidEmail(email)) {
            alert('Please enter a valid email address');
            return;
        }

        if (this.admins.includes(email)) {
            alert('This admin already exists');
            return;
        }

        this.admins.push(email);
        if (this.adminEmailInput) this.adminEmailInput.value = '';
        this.renderAdminsList();
        this.updatePreview();
    }

    removeAdmin(email) {
        this.admins = this.admins.filter(a => a !== email);
        this.renderAdminsList();
        this.updatePreview();
    }

    renderAdminsList() {
        if (!this.adminsList) return;
        
        this.adminsList.innerHTML = this.admins.map(email => `
            <div class="admin-input-group">
                <input type="text" class="admin-email-input" value="${email}" disabled>
                <button type="button" class="btn-remove-admin" onclick="builder.removeAdmin('${email}')">
                    <i class='bx bx-x'></i>
                </button>
            </div>
        `).join('');
    }

    isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    getEditionDetails() {
        const editions = {
            'ENTERPRISE': { name: 'Essentials', price: 3, currency: 'R' },
            'PLATFORM': { name: 'Advantage', price: 5, currency: 'R' },
            'BEYOND': { name: 'Premier', price: 7, currency: 'R' }
        };
        return editions[this.selectedEdition] || editions['PLATFORM'];
    }

    calculatePrice() {
        const edition = this.getEditionDetails();
        return edition.price * this.userLimit;
    }

    updatePreview() {
        if (!this.previewOrgName) return;

        const edition = this.getEditionDetails();
        const totalPrice = this.calculatePrice();

        // Update preview values
        this.previewOrgName.textContent = this.organizationName || 'Organization Name';
        this.previewUserCount.textContent = this.userLimit.toLocaleString();
        this.previewEdition.textContent = edition.name;
        this.previewPrice.textContent = `${edition.currency} ${edition.price.toLocaleString()} per user/month`;
        this.previewTotal.textContent = `${edition.currency} ${totalPrice.toLocaleString()}/month`;

        // Update admins list
        if (this.previewAdminsList) {
            this.previewAdminsList.innerHTML = this.admins.length > 0
                ? this.admins.map(email => `<span class="admin-badge">${email}</span>`).join('')
                : '<span style="color: rgba(255,255,255,0.5); font-size: 0.85rem;">No admins added yet</span>';
        }

        // Highlight edition
        document.querySelectorAll('.edition-card').forEach(card => {
            card.style.opacity = '0.6';
        });
        const activeCard = document.querySelector(`input[value="${this.selectedEdition}"]:checked + .edition-card`);
        if (activeCard) activeCard.style.opacity = '1';
    }

    async submitForm() {
        // Validation
        if (!this.organizationName.trim()) {
            alert('Please enter an organization name');
            return;
        }

        if (this.admins.length === 0) {
            alert('Please add at least one administrator');
            return;
        }

        if (this.userLimit < 1) {
            alert('User limit must be at least 1');
            return;
        }

        try {
            this.submitBtn.disabled = true;
            this.submitBtn.textContent = 'Creating Account...';

            const response = await fetch('/api/duo/create-account', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    organization_name: this.organizationName,
                    user_limit: this.userLimit,
                    admin_emails: this.admins,
                    edition: this.selectedEdition,
                    userId: getCurrentUserId() // Implement this based on your auth
                })
            });

            const data = await response.json();

            if (response.ok) {
                alert('Duo account created successfully!');
                this.resetForm();
                // Redirect or update UI
                window.location.href = '/my-duo-accounts';
            } else {
                alert(`Error: ${data.error || 'Failed to create account'}`);
            }
        } catch (error) {
            console.error('Submit error:', error);
            alert('An error occurred. Please try again.');
        } finally {
            this.submitBtn.disabled = false;
            this.submitBtn.textContent = 'Create Account';
        }
    }

    resetForm() {
        this.organizationName = '';
        this.userLimit = 50;
        this.admins = [];
        this.selectedEdition = 'PLATFORM';
        
        if (this.orgNameInput) this.orgNameInput.value = '';
        if (this.userSlider) this.userSlider.value = 50;
        if (this.userDisplay) this.userDisplay.textContent = '50';
        if (this.adminEmailInput) this.adminEmailInput.value = '';
        
        this.renderAdminsList();
        this.updatePreview();
    }
}

// Initialize on DOM ready
let builder;
document.addEventListener('DOMContentLoaded', () => {
    builder = new DuoLicenseBuilder();
});

// FAQ Toggle
function initFAQ() {
    const faqItems = document.querySelectorAll('.faq-item');
    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');
        if (question) {
            question.addEventListener('click', () => {
                faqItems.forEach(i => i.classList.remove('active'));
                item.classList.add('active');
            });
        }
    });
}

document.addEventListener('DOMContentLoaded', initFAQ);

// Utility: Get current user ID (implement per your auth system)
function getCurrentUserId() {
    // This should retrieve the logged-in user's ID
    // Placeholder implementation
    return localStorage.getItem('userId') || '';
}

// Smooth scroll on anchor links
function setupSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });
}

document.addEventListener('DOMContentLoaded', setupSmoothScroll);
