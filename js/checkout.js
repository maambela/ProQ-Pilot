document.addEventListener('DOMContentLoaded', async () => {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user) {
        // redirect to signin and come back
        localStorage.setItem('redirectAfterLogin', '/checkout.html');
        return window.location.href = '/signin.html';
    }

    const addressList = document.getElementById('addressList');
    const miniSummary = document.getElementById('miniSummary');
    const continueBtn = document.getElementById('continueToReview');

    async function loadAddresses() {
        const res = await fetch(`/api/v1/addresses/${user.userID}`);
        const data = await res.json();
        const addresses = data.data || [];
        if (!addresses.length) {
            addressList.innerHTML = '<p>No saved addresses. Add one below.</p>';
            return;
        }
        addressList.innerHTML = '';
        const previouslySelected = (() => {
            try { return JSON.parse(sessionStorage.getItem('selectedAddress')); } catch(e){ return null; }
        })();

        addresses.forEach(a => {
            const div = document.createElement('div');
            div.className = 'address-card';
            div.innerHTML = `
                <div class="deliver-pin"><button class="deliver-radio" data-action="deliver" data-id="${a.id}" title="Deliver"><span class="dot"></span></button></div>
                <div style="min-width:0">
                    <div class="meta"><strong>${a.line1}</strong></div>
                    <div class="meta small">${a.line2 || ''}</div>
                    <div class="meta small">${a.city}, ${a.province || ''} ${a.postal_code}</div>
                    <div class="meta small">${a.country}</div>
                    <div class="meta small" style="margin-top:6px; display:none;" data-full>
                        <div>Phone: ${a.phone || '—'}</div>
                        <div>Instructions: ${a.delivery_instructions || '—'}</div>
                    </div>
                </div>
                <div class="actions-right">
                    <button class="btn-icon btn-edit" data-action="edit" data-id="${a.id}" title="Edit"><i class="bx bx-pencil"></i></button>
                    <button class="btn-icon btn-delete" data-action="delete" data-id="${a.id}" title="Delete"><i class="bx bx-trash"></i></button>
                </div>
                <div class="view-more" data-action="view" title="View details"><i class="bx bx-chevron-down"></i></div>`;
            addressList.appendChild(div);
            // view toggle (view-more rectangle)
            const viewBtn = div.querySelector('.view-more');
            viewBtn.addEventListener('click', ()=>{
                const block = div.querySelector('[data-full]');
                const icon = viewBtn.querySelector('i');
                if (!block) return;
                const showing = block.style.display !== 'none' && block.style.display !== '';
                block.style.display = showing ? 'none' : 'block';
                if (icon) icon.classList.toggle('bx-rotate-180', !showing);
            });

            // deliver pin (left side)
            const deliverBtn = div.querySelector('.deliver-radio');
            deliverBtn.addEventListener('click', ()=>{
                // clear previous selection
                document.querySelectorAll('.deliver-radio').forEach(r=> r.classList.remove('selected'));
                deliverBtn.classList.add('selected');
                sessionStorage.setItem('selectedAddress', JSON.stringify(a));
                // show full details when selected and rotate chevron
                const block = div.querySelector('[data-full]');
                const icon = div.querySelector('.view-more i');
                if (block) block.style.display = 'block';
                if (icon) icon.classList.add('bx-rotate-180');
            });

            // edit
            div.querySelector('[data-action="edit"]').addEventListener('click', ()=> startEditAddress(a));

            // delete
            div.querySelector('[data-action="delete"]').addEventListener('click', async ()=>{
                if (!confirm('Delete this address?')) return;
                await fetch(`/api/v1/addresses/${a.id}`, { method: 'DELETE' });
                loadAddresses();
            });
        });

        // if user had previously selected an address, mark it open
        if (previouslySelected && previouslySelected.id) {
            const el = addressList.querySelector(`[data-id="${previouslySelected.id}"]`);
            if (el) {
                // el may be the deliver button or other; find deliver-radio in its parent card
                const card = el.closest('.address-card');
                if (card) {
                    const r = card.querySelector('.deliver-radio');
                    if (r) r.classList.add('selected');
                    const block = card.querySelector('[data-full]');
                    const icon = card.querySelector('.view-more i');
                    if (block) block.style.display = 'block';
                    if (icon) icon.classList.add('bx-rotate-180');
                }
            }
        }
    }

    // show a mini summary
    async function loadSummary(){
        const res = await fetch(`/api/v1/cart/${user.userID}`);
        const data = await res.json();
        const items = data.data || [];
        
        // Ensure prices are numeric for calculation
        const itemsWithPrices = items.map(i => ({
            ...i,
            price: parseFloat(i.price) || 0
        }));
        
        const subtotal = itemsWithPrices.reduce((s,i)=> s + (i.price * i.quantity), 0);

        const isDigitalLicense = (item) => ['duo-security', 'duo-security-upgrade', 'microsoft-license'].includes(item.cart_type);
        const isDuoLicense = (item) => ['duo-security', 'duo-security-upgrade'].includes(item.cart_type);
        const isMicrosoftLicense = (item) => item.cart_type === 'microsoft-license';

        // Check if cart only contains digital licenses
        const isDuoOnly = items.length > 0 && items.every(isDigitalLicense);
        const hasDuoItems = items.some(isDigitalLicense);
        const hasPhysicalItems = items.some(item => !isDigitalLicense(item));
        
        if (isDuoOnly) {
            console.log('[Checkout] Duo-only cart detected. Activating digital delivery flow...');
            handleDigitalOnlyCheckout();
            // Continue rendering the summary instead of returning early
        }

        // If mixed cart, show helpful message
        if (hasDuoItems && hasPhysicalItems) {
            const mixedMessage = document.createElement('div');
            mixedMessage.style.cssText = `
                background: rgba(0, 188, 212, 0.15);
                border: 1px solid var(--accent-blue);
                color: #69d7ff;
                padding: 15px;
                border-radius: 12px;
                margin-bottom: 20px;
                font-size: 0.9rem;
                line-height: 1.6;
            `;
            mixedMessage.innerHTML = `
                <i class='bx bx-info-circle' style="margin-right: 8px;"></i>
                <strong>Mixed Order:</strong> Your cart contains both physical products and digital licenses. 
                Physical items will be shipped to your delivery address below. 
                Digital licenses will be activated or delivered immediately after payment.
            `;
            
            const section = document.querySelector('section');
            if (section && section.firstChild) {
                section.insertBefore(mixedMessage, section.firstChild);
            }
        }

        // helper: short product name (first 4 words)
        const shortName = (name) => {
            if (!name) return '';
            const parts = name.split(/\s+/).filter(Boolean);
            return parts.slice(0,4).join(' ');
        };

        // helper: parse specs from name/description
        const parseSpecs = (item) => {
            const text = (item.product_name || '') + ' ' + (item.description || '');
            const specs = {};
            const ramMatch = text.match(/(\d+\s?GB)/i);
            const storageMatch = text.match(/(\d+\s?(GB|TB))/i);
            const cpuMatch = text.match(/(i[3579]\b|i\d\b|Ryzen\s?\d+|Ryzen\s?\d+)/i);
            const dispMatch = text.match(/(\d{2}\.\d|\d{2})\s?(in|\"|inch|inch\b)/i) || text.match(/(HD|FHD|IPS|OLED|Retina)/i);
            if (ramMatch) specs.RAM = ramMatch[1];
            if (storageMatch) specs.Storage = storageMatch[1];
            if (cpuMatch) specs.Processor = cpuMatch[1];
            if (dispMatch) specs.Display = dispMatch[0];
            return specs;
        };

        if (!items.length) {
            miniSummary.innerHTML = `<p style="margin:8px 0;">Items: 0</p><p style="margin:8px 0;">Subtotal: R0.00</p>`;
            const recSlot = document.getElementById('checkoutRecommendations');
            if (recSlot) {
                recSlot.hidden = true;
                recSlot.innerHTML = '';
            }
            return;
        }

        let html = '<div class="summary-items">';
        for (const it of itemsWithPrices) {
            const specs = parseSpecs(it);
            let imgUrl = it.image_url ? (it.image_url.startsWith('http') ? it.image_url : `/product_images/${it.image_url}`) : '/Images/placeholder.png';
            
            // Digital license special rendering in summary
            let displayName = it.product_name;
            if (isDuoLicense(it)) {
                imgUrl = '/Images/DUO.png';
                // Extract org name from duo_config_json for display
                if (it.duo_config_json) {
                    try {
                        const config = typeof it.duo_config_json === 'string' ? JSON.parse(it.duo_config_json) : it.duo_config_json;
                        displayName = config.organization_name || 'Cisco Duo Security';
                    } catch (e) {
                        displayName = 'Cisco Duo Security';
                    }
                }
            } else if (isMicrosoftLicense(it)) {
                imgUrl = '/Images/Logos/Proq2.png';
                if (it.duo_config_json) {
                    const config = typeof it.duo_config_json === 'string' ? JSON.parse(it.duo_config_json) : it.duo_config_json;
                    displayName = config.product_name || 'Microsoft License';
                }
            }

            html += `
                <div class="summary-item">
                    <img src="${imgUrl}" alt="${displayName}" class="summary-thumb" onerror="this.src='/Images/DUO.png'"/>
                    <div class="summary-meta">
                        <div class="summary-name">${shortName(displayName)}</div>
                        <div class="summary-specs">
                            ${specs.RAM ? `<span class="spec">${specs.RAM}</span>` : ''}
                            ${specs.Processor ? `<span class="spec">${specs.Processor}</span>` : ''}
                            ${specs.Storage ? `<span class="spec">${specs.Storage}</span>` : ''}
                            ${specs.Display ? `<span class="spec">${specs.Display}</span>` : ''}
                            ${isDuoLicense(it) ? `<span class="spec" style="background: var(--accent-blue);">Duo License</span>` : ''}
                            ${isMicrosoftLicense(it) ? `<span class="spec" style="background: #0078d4;">Microsoft License</span>` : ''}
                        </div>
                    </div>
                    <div class="summary-qty">x${it.quantity}</div>
                </div>`;
        }
        html += `</div><div style="margin-top:8px;"><strong>Subtotal:</strong> R${subtotal.toLocaleString()}</div>`;
        miniSummary.innerHTML = html;

        if (window.StackRecommendations) {
            window.StackRecommendations.init({
                container: '#checkoutRecommendations',
                title: 'Last-minute useful add-ons',
                context: 'checkout',
                cartItems: itemsWithPrices,
                limit: 3,
                fetchLimit: 5,
                compact: true,
                bundleReady: true
            });
        }
    }

    // Handle digital-only checkout flow
    function handleDigitalOnlyCheckout() {
        const addressSection = document.querySelector('section');
        const heading = document.querySelector('h2');
        const subheading = document.querySelector('p');
        
        if (heading) heading.textContent = 'Digital Delivery';
        if (subheading) subheading.textContent = 'Your digital licenses will be delivered electronically after payment.';
        
        if (addressSection) {
            addressSection.innerHTML = `
                <div style="background: rgba(0, 188, 212, 0.15); border: 1px solid var(--accent-blue); padding: 30px; border-radius: 20px; text-align: center; margin-bottom: 30px;">
                    <i class='bx bx-cloud-download' style="font-size: 4rem; color: var(--accent-blue); margin-bottom: 20px; display: block;"></i>
                    <h3 style="color: #ffffff; margin-bottom: 10px;">No Delivery Address Required</h3>
                    <p style="color: rgba(255, 255, 255, 0.8); line-height: 1.6;">
                        Because your order contains only digital licenses, we don't need a physical shipping address. 
                        Setup instructions and credentials will be sent to the administrator emails you specified.
                    </p>
                </div>
            `;
        }
        
        // Set a virtual "digital" address
        const digitalAddress = {
            id: 0,
            line1: 'Digital Delivery',
            city: 'Online',
            province: 'Cloud',
            postal_code: '0000',
            country: 'South Africa',
            isDigital: true
        };
        sessionStorage.setItem('selectedAddress', JSON.stringify(digitalAddress));
    }

    const countrySelect = document.getElementById('countrySelect');
    const provinceContainer = document.getElementById('provinceContainer');

    // Countries list (trimmed set + common). You can expand this list as needed.
    const countries = [
        "Afghanistan","Albania","Algeria","Andorra","Angola","Antigua and Barbuda","Argentina","Armenia","Australia","Austria","Azerbaijan",
        "Bahamas","Bahrain","Bangladesh","Barbados","Belarus","Belgium","Belize","Benin","Bhutan","Bolivia","Bosnia and Herzegovina","Botswana","Brazil","Brunei","Bulgaria","Burkina Faso","Burundi",
        "Cabo Verde","Cambodia","Cameroon","Canada","Central African Republic","Chad","Chile","China","Colombia","Comoros","Congo","Costa Rica","Cote d'Ivoire","Croatia","Cuba","Cyprus","Czech Republic",
        "Denmark","Djibouti","Dominica","Dominican Republic",
        "Ecuador","Egypt","El Salvador","Equatorial Guinea","Eritrea","Estonia","Eswatini","Ethiopia",
        "Fiji","Finland","France",
        "Gabon","Gambia","Georgia","Germany","Ghana","Greece","Grenada","Guatemala","Guinea","Guinea-Bissau","Guyana",
        "Haiti","Honduras","Hungary",
        "Iceland","India","Indonesia","Iran","Iraq","Ireland","Israel","Italy",
        "Jamaica","Japan","Jordan",
        "Kazakhstan","Kenya","Kiribati","Kosovo","Kuwait","Kyrgyzstan",
        "Laos","Latvia","Lebanon","Lesotho","Liberia","Libya","Liechtenstein","Lithuania","Luxembourg",
        "Madagascar","Malawi","Malaysia","Maldives","Mali","Malta","Marshall Islands","Mauritania","Mauritius","Mexico","Micronesia","Moldova","Monaco","Mongolia","Montenegro","Morocco","Mozambique","Myanmar",
        "Namibia","Nauru","Nepal","Netherlands","New Zealand","Nicaragua","Niger","Nigeria","North Korea","North Macedonia","Norway",
        "Oman",
        "Pakistan","Palau","Panama","Papua New Guinea","Paraguay","Peru","Philippines","Poland","Portugal",
        "Qatar",
        "Romania","Russia","Rwanda",
        "Saint Kitts and Nevis","Saint Lucia","Saint Vincent and the Grenadines","Samoa","San Marino","Sao Tome and Principe","Saudi Arabia","Senegal","Serbia","Seychelles","Sierra Leone","Singapore","Slovakia","Slovenia","Solomon Islands","Somalia","South Africa","South Korea","South Sudan","Spain","Sri Lanka","Sudan","Suriname","Sweden","Switzerland","Syria",
        "Taiwan","Tajikistan","Tanzania","Thailand","Timor-Leste","Togo","Tonga","Trinidad and Tobago","Tunisia","Turkey","Turkmenistan","Tuvalu",
        "Uganda","Ukraine","United Arab Emirates","United Kingdom","United States","Uruguay","Uzbekistan",
        "Vanuatu","Vatican City","Venezuela","Vietnam",
        "Yemen","Zambia","Zimbabwe"
    ];

    // Provinces / states for a selection of countries (expand as needed)
    const provincesMap = {
        'South Africa': ['Eastern Cape','Free State','Gauteng','KwaZulu-Natal','Limpopo','Mpumalanga','Northern Cape','North West','Western Cape'],
        'United States': ['Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan','Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire','New Jersey','New Mexico','New York','North Carolina','North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont','Virginia','Washington','West Virginia','Wisconsin','Wyoming'],
        'Canada': ['Alberta','British Columbia','Manitoba','New Brunswick','Newfoundland and Labrador','Nova Scotia','Ontario','Prince Edward Island','Quebec','Saskatchewan','Northwest Territories','Nunavut','Yukon'],
        'Australia': ['New South Wales','Queensland','South Australia','Tasmania','Victoria','Western Australia','Australian Capital Territory','Northern Territory'],
        'United Kingdom': ['England','Scotland','Wales','Northern Ireland'],
        'India': ['Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal','Delhi'],
        'Germany': ['Baden-Wurttemberg','Bavaria','Berlin','Brandenburg','Bremen','Hamburg','Hesse','Lower Saxony','Mecklenburg-Vorpommern','North Rhine-Westphalia','Rhineland-Palatinate','Saarland','Saxony','Saxony-Anhalt','Schleswig-Holstein','Thuringia'],
        'Brazil': ['Acre','Alagoas','Amapa','Amazonas','Bahia','Ceara','Distrito Federal','Espirito Santo','Goias','Maranhao','Mato Grosso','Mato Grosso do Sul','Minas Gerais','Para','Paraiba','Parana','Pernambuco','Piaui','Rio de Janeiro','Rio Grande do Norte','Rio Grande do Sul','Rondonia','Roraima','Santa Catarina','Sao Paulo','Sergipe','Tocantins'],
        'Mexico': ['Aguascalientes','Baja California','Baja California Sur','Campeche','Chiapas','Chihuahua','Coahuila','Colima','Durango','Guanajuato','Guerrero','Hidalgo','Jalisco','Mexico City','Michoacan','Morelos','Nayarit','Nuevo Leon','Oaxaca','Puebla','Queretaro','Quintana Roo','San Luis Potosi','Sinaloa','Sonora','Tabasco','Tamaulipas','Tlaxcala','Veracruz','Yucatan','Zacatecas'],
        'France': ['Auvergne-Rhone-Alpes','Bourgogne-Franche-Comte','Brittany','Centre-Val de Loire','Corsica','Grand Est','Hauts-de-France','Ile-de-France','Normandy','Nouvelle-Aquitaine','Occitanie','Pays de la Loire','Provence-Alpes-Cote d\'Azur']
    };

    // populate country select
    countries.forEach(c => {
        const opt = document.createElement('option'); opt.value = c; opt.textContent = c; countrySelect.appendChild(opt);
    });

    function setProvinceFieldForCountry(country) {
        const provinces = provincesMap[country];
        provinceContainer.innerHTML = '';
        if (provinces && provinces.length) {
            const sel = document.createElement('select'); sel.name = 'province'; sel.style.width = '100%'; sel.style.padding = '10px'; sel.style.marginBottom='8px';
            const empty = document.createElement('option'); empty.value=''; empty.textContent='Select province / state'; sel.appendChild(empty);
            provinces.forEach(p => { const o = document.createElement('option'); o.value = p; o.textContent = p; sel.appendChild(o); });
            provinceContainer.appendChild(sel);
        } else {
            const inp = document.createElement('input'); inp.name = 'province'; inp.placeholder = 'Province/State'; inp.style.width='100%'; inp.style.padding='10px'; inp.style.marginBottom='8px';
            provinceContainer.appendChild(inp);
        }
    }

    countrySelect.addEventListener('change', (e)=> setProvinceFieldForCountry(e.target.value));

    document.getElementById('addressForm').addEventListener('submit', async (e)=>{
        e.preventDefault();
        const form = e.target;
        // read province from dynamic field
        const provinceField = form.querySelector('[name="province"]');
        const payload = {
            userID: user.userID,
            line1: form.line1.value,
            line2: form.line2.value,
            city: form.city.value,
            province: provinceField ? provinceField.value : '',
            postal_code: form.postal_code.value,
            country: form.country ? form.country.value : countrySelect.value,
            phone: form.phone.value,
            delivery_instructions: form.delivery_instructions.value,
            is_default: 0
        };
        const editingId = form.getAttribute('data-editing-id');
        if (editingId) {
            await fetch(`/api/v1/addresses/${editingId}`, { method: 'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)});
            form.removeAttribute('data-editing-id');
            document.getElementById('addressSubmit').textContent = 'Add Address';
            document.getElementById('cancelEdit').style.display = 'none';
        } else {
            await fetch('/api/v1/addresses', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)});
        }
        form.reset();
        loadAddresses();
    });

    document.getElementById('cancelAdd').addEventListener('click', ()=>{ document.getElementById('addressForm').reset(); });

    continueBtn.addEventListener('click', ()=>{
        // ensure selectedAddress exists
        const sel = sessionStorage.getItem('selectedAddress');
        if (!sel) return alert('Please choose an address first');
        window.location.href = '/review.html';
    });

    document.getElementById('cancelEdit').addEventListener('click', ()=>{
        const form = document.getElementById('addressForm');
        form.removeAttribute('data-editing-id');
        form.reset();
        document.getElementById('addressSubmit').textContent = 'Add Address';
        document.getElementById('cancelEdit').style.display = 'none';
    });

    function startEditAddress(a) {
        const form = document.getElementById('addressForm');
        form.setAttribute('data-editing-id', a.id);
        form.line1.value = a.line1 || '';
        form.line2.value = a.line2 || '';
        form.city.value = a.city || '';
        form.postal_code.value = a.postal_code || '';
        if (a.country) { countrySelect.value = a.country; setProvinceFieldForCountry(a.country); }
        setTimeout(()=>{
            const provinceField = form.querySelector('[name="province"]');
            if (provinceField) provinceField.value = a.province || '';
        }, 50);
        form.phone.value = a.phone || '';
        form.delivery_instructions.value = a.delivery_instructions || '';
        document.getElementById('addressSubmit').textContent = 'Save Changes';
        document.getElementById('cancelEdit').style.display = 'inline-block';
        window.scrollTo({ top: form.offsetTop - 80, behavior: 'smooth' });
    }

    window.addEventListener('stack:cart-updated', loadSummary);
    await loadAddresses();
    await loadSummary();
});
