(function renderSiteFooter() {
    const footer = document.querySelector('.site-footer');
    if (!footer) return;

    footer.innerHTML = `
        <div class="footer-container">
            <div class="footer-brand">
                <a href="index.html" class="footer-logo">
                    <img src="Images/Logos/Proq2.png" alt="ProQ Pilot logo">
                </a>
                <p>Employee onboarding procurement with business devices, Microsoft licensing, Duo MFA, and role-ready team kits.</p>
                <div class="footer-socials" aria-label="ProQ Pilot contact links">
                    <a href="mailto:sales@stackopsit.co.za" aria-label="Email ProQ Pilot sales"><i class='bx bx-envelope'></i></a>
                    <a href="tel:0115689337" aria-label="Call ProQ Pilot"><i class='bx bx-phone'></i></a>
                    <a href="contact.html" aria-label="Contact ProQ Pilot"><i class='bx bx-message-square-dots'></i></a>
                </div>
            </div>

            <div class="footer-links">
                <h4>Onboarding Procurement</h4>
                <a href="store.html?category=laptops">Business Laptops</a>
                <a href="kit.html?type=new-starter">New Employee Kit</a>
                <a href="kit.html?type=hybrid">Remote Team Kit</a>
                <a href="kit.html?type=secure">Secure Business Kit</a>
            </div>

            <div class="footer-links">
                <h4>Services</h4>
                <a href="store.html?category=licenses&brand=Microsoft">Microsoft Licensing</a>
                <a href="store.html?category=licenses&brand=Duo">Cisco Duo MFA</a>
                <a href="wishlist.html">Wishlist</a>
                <a href="user-orders.html">Orders</a>
            </div>

            <div class="footer-contact">
                <h4>Contact</h4>
                <a href="mailto:sales@stackopsit.co.za"><i class='bx bx-envelope'></i><span>sales@stackopsit.co.za</span></a>
                <a href="mailto:support@stackopsit.co.za"><i class='bx bx-support'></i><span>support@stackopsit.co.za</span></a>
                <a href="tel:0115689337"><i class='bx bx-phone'></i><span>011 568 9337</span></a>
                <p><i class='bx bx-map'></i><span>Mia Drive, Waterfall City, Johannesburg, 1685</span></p>
            </div>
        </div>

        <div class="footer-bottom">
            <p>&copy; 2026 ProQ Pilot. All rights reserved.</p>
            <div>
                <a href="about.html">Warranty</a>
                <a href="my-account.html#support">Support</a>
                <a href="cart.html">Cart</a>
            </div>
        </div>
    `;
})();
