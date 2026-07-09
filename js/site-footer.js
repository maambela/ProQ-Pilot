(function renderSiteFooter() {
    const footer = document.querySelector('.site-footer');
    if (!footer) return;

    footer.innerHTML = `
        <div class="footer-shell">
            <div class="footer-brand">
                <a href="index.html" class="footer-logo" aria-label="ProQ Pilot home">
                    <img src="Images/Logos/Proq2.png" alt="ProQ Pilot logo">
                </a>
                <p>Employee onboarding procurement with business devices, Microsoft licensing, Duo MFA, and role-ready team kits.</p>
                <small>&copy; 2026 ProQ Pilot. All rights reserved.</small>
            </div>

            <nav class="footer-links" aria-label="Onboarding Procurement">
                <h4>Onboarding Procurement</h4>
                <a href="store.html?category=laptops">Business Laptops</a>
                <a href="kit.html?type=new-starter">New Employee Kit</a>
                <a href="kit.html?type=hybrid">Remote Team Kit</a>
                <a href="kit.html?type=secure">Secure Business Kit</a>
            </nav>

            <nav class="footer-links" aria-label="Services">
                <h4>Services</h4>
                <a href="store.html?category=licenses&brand=Microsoft">Microsoft Licensing</a>
                <a href="store.html?category=licenses&brand=Duo">Cisco Duo MFA</a>
                <a href="wishlist.html">Wishlist</a>
                <a href="user-orders.html">Orders</a>
            </nav>

            <div class="footer-contact">
                <h4>Contact</h4>
                <a href="mailto:sales@stackopsit.co.za">sales@stackopsit.co.za</a>
                <a href="mailto:support@stackopsit.co.za">support@stackopsit.co.za</a>
                <a href="tel:0115689337">011 568 9337</a>
                <p>Mia Drive, Waterfall City, Johannesburg, 1685</p>
                <div class="footer-socials" aria-label="ProQ Pilot contact links">
                    <a href="mailto:sales@stackopsit.co.za" aria-label="Email ProQ Pilot sales"><i class='bx bx-envelope'></i></a>
                    <a href="tel:0115689337" aria-label="Call ProQ Pilot"><i class='bx bx-phone'></i></a>
                    <a href="contact.html" aria-label="Contact ProQ Pilot"><i class='bx bx-message-square-dots'></i></a>
                </div>
            </div>
        </div>
    `;
})();