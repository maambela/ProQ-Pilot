function hasDeveloperAccess() {
    try {
        if (isLocalhostDevelopment()) return true;

        const token = localStorage.getItem('token');
        const user = JSON.parse(localStorage.getItem('user') || 'null');
        return Boolean(token && user && user.userID);
    } catch (err) {
        return false;
    }
}

function isLocalhostDevelopment() {
    return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
}
function enforceDevelopmentGate() {
    const currentPage = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
    const publicPages = new Set([
        'development.html',
        'signin.html',
        'signup.html',
        'resetpassword.html'
    ]);

    if (!publicPages.has(currentPage) && !hasDeveloperAccess()) {
        window.location.replace('development.html');
    }
}

enforceDevelopmentGate();

// Helper function to extract clean laptop name (limit to 4 words max)
function cleanProductName(fullName) {
    if (!fullName) return "Laptop";
    // Take only first 4 words
    return fullName.split(/\s+/).slice(0, 4).join(' ').trim();
}

// Helper function to get brand display (image or name)
function getBrandDisplay(brand) {
    if (!brand) return '<span class="brand-tag" style="background: #00d2be; color: white; padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: 200;">ELECTRONICS</span>';
    
    const brandLower = brand.toLowerCase();
    const logos = {
        'hp': ['Images/HP.png'],
        'dell': ['Images/DellLaptops.PNG', 'Images/DellLaptops.png', 'Images/delllaptops.PNG', 'Images/delllaptops.png'],
        'apple': ['Images/Apple.png'],
        'macbook': ['Images/Apple.png'],
        'microsoft': ['Images/Microsoft.png'],
        'acer': ['Images/AcerStick.png', 'Images/AcerStick.PNG', 'Images/acerstick.png', 'Images/acerstick.PNG'],
        'lenovo': ['Images/lenovo.PNG', 'Images/lenovo.png', 'Images/Lenovo.PNG', 'Images/Lenovo.png'],
    };

    if (logos[brandLower]) {
        const logoOptions = logos[brandLower];
        return `<img src="${logoOptions[0]}" data-logo-options="${logoOptions.join('|')}" data-logo-index="0" alt="${brand}" class="brand-logo-tag" style="height: 40px; width: auto; display: block; object-fit: contain;" onerror="tryNextBrandLogo(this)">`;
    }

    return `<span class="brand-tag" style="background: rgba(255,255,255,0.14); color: white; padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: 200;">${brand.toUpperCase()}</span>`;
}

function tryNextBrandLogo(img) {
    const options = String(img.dataset.logoOptions || '').split('|').filter(Boolean);
    const nextIndex = Number(img.dataset.logoIndex || 0) + 1;

    if (nextIndex < options.length) {
        img.dataset.logoIndex = String(nextIndex);
        img.src = options[nextIndex];
        return;
    }

    const fallback = document.createElement('span');
    fallback.className = 'brand-tag';
    fallback.textContent = String(img.alt || 'Brand').toUpperCase();
    img.replaceWith(fallback);
}

function handleProductImageError(img) {
    const fallback = img.dataset.fallbackImage;
    if (fallback && img.src.indexOf(fallback) === -1) {
        img.src = fallback;
        return;
    }

    const card = img.closest('.product-card');
    if (card) card.remove();
}

// Custom dropdown functionality
function initCustomDropdown() {
    const dropdownBtn = document.getElementById('sortDropdown');
    const dropdownMenu = document.getElementById('dropdownMenu');
    const selectedOption = document.getElementById('selectedOption');
    const dropdownOptions = document.querySelectorAll('.dropdown-option');

    if (!dropdownBtn || !dropdownMenu) return;

    // Toggle dropdown on button click
    dropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdownMenu.classList.toggle('active');
        dropdownBtn.classList.toggle('active');
    });

    // Handle option selection
    dropdownOptions.forEach(option => {
        option.addEventListener('click', () => {
            const value = option.getAttribute('data-value');
            const text = option.textContent;
            
            // Update selected option display
            selectedOption.textContent = text;
            
            // Update active state
            dropdownOptions.forEach(opt => opt.classList.remove('active'));
            option.classList.add('active');
            
            // Close dropdown
            dropdownMenu.classList.remove('active');
            dropdownBtn.classList.remove('active');
            
            // Trigger sort event
            const event = new CustomEvent('sortChange', { detail: { value } });
            document.dispatchEvent(event);
        });
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.custom-dropdown')) {
            dropdownMenu.classList.remove('active');
            dropdownBtn.classList.remove('active');
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    // --- HERO SLIDESHOW ---
    let slideIndex = 0;
    let slideTimeout;
    const slides = document.querySelectorAll('.slide');
    const dots = document.querySelectorAll('.dot');

    function showSlides(n) {
        if (slides.length === 0) return;
        
        if (n !== undefined) {
            slideIndex = n;
        } else {
            slideIndex++;
        }

        if (slideIndex > slides.length) { slideIndex = 1 }
        if (slideIndex < 1) { slideIndex = slides.length }
        
        slides.forEach(slide => slide.classList.remove('show'));
        dots.forEach(dot => dot.classList.remove('active'));
        
        slides[slideIndex - 1].classList.add('show');
        dots[slideIndex - 1].classList.add('active');
        
        clearTimeout(slideTimeout);
        slideTimeout = setTimeout(() => showSlides(), 10000); // Change image every 10 seconds
    }

    if (slides.length > 0) {
        showSlides();
        
        dots.forEach((dot, index) => {
            dot.addEventListener('click', () => {
                showSlides(index + 1);
            });
        });
    }

    initCustomDropdown();
    // --- UI ELEMENTS ---
    const productGrid = document.querySelector('.product-grid');
    const resultsCount = document.querySelector('.results-count');
    const cartBadge = document.querySelector('.cart-badge') || document.getElementById('cart-count');
    const hamburger = document.getElementById('hamburger');
    const navLinks = document.getElementById('nav-links');
    const syncBtn = document.getElementById('sync-btn');
    const user = JSON.parse(localStorage.getItem('user'));
    const clearFiltersBtn = document.getElementById('clearFilters');
    
    // Helper to check if a product is likely a laptop
    const isLaptop = (product) => {
        const name = (product.product_name || "").toLowerCase();
        const desc = (product.description || "").toLowerCase();
        const brandField = (product.brand || "").toLowerCase().trim();
        const combined = `${name} ${desc} ${brandField}`.toLowerCase();
        
        // --- 1. ACCESSORY INDICATORS (to exclude from laptops) ---
        const accessoryKeywords = [
            "powerbank", "power bank", "backpack", "bag", "case", "sleeve", 
            "headset", "webcam", "hub", "screw", "rolling", "notepac", 
            "clamshell", "stand", "dock", "lock", "mah"
        ];
        
        // If it's explicitly an accessory keyword in the name, it's NOT a laptop
        if (accessoryKeywords.some(k => name.includes(k))) return false;

        // --- 2. BRAND DETECTION (CRITICAL) ---
        const laptopBrands = ['dell', 'hp', 'lenovo', 'acer', 'microsoft', 'apple', 'macbook', 'mac'];
        const isBigLaptopBrand = laptopBrands.some(b => brandField.includes(b) || name.includes(b));

        // --- 3. LAPTOP INDICATORS ---
        const hasProcessor = /\b(i[3579]|core|intel|ryzen|amd|celeron|pentium|snapdragon|ultra\s?[3579]|u[3579][-\s]?\d*|m[1-5]|m[1-5]\s?(pro|max|ultra)|n100|n200)\b/i.test(combined) || /\b(mba|mbp|macbook)\b/i.test(name);
        const hasRam = /\b(4|8|12|16|18|24|32|36|48|64|96|128)\s?gb\b.*\b(ram|memory|ddr|lpddr|unified)\b|\b(ram|memory|ddr|lpddr|unified)\b.*\b(4|8|12|16|18|24|32|36|48|64|96|128)\s?gb\b|\b(4|8|12|16|18|24|32|36|48|64|96|128)\s?gb\b/i.test(combined);

        const isExplicitLaptop = 
            name.includes("laptop") || name.includes("notebook") || 
            name.includes("macbook") || name.includes("mac book") || name.includes("mba") || name.includes("mbp") || 
            name.includes("2in1") || name.includes("chromebook") || name.includes("v15") ||
            name.includes("v14") || name.includes("latitude") || name.includes("precision") ||
            name.includes("xps") || name.includes("inspiron") || name.includes("thinkpad") ||
            name.includes("probook") || name.includes("elitebook") || name.includes("expertbook") ||
            name.includes("x360") ||
            name.includes("zenbook") || name.includes("vivobook") || name.includes("alienware") ||
            name.includes("swift") ||
            name.includes("aspire") || name.includes("thinkbook") || /\bexo\d*/i.test(name) ||
            /\btmp\d*/i.test(name) || /\btmx\d*/i.test(name) || name.includes("travelmate") ||
            name.includes("dell pro 13") || name.includes("dell pro 14") ||
            name.includes("dell pro 15") || name.includes("dell pro 16") ||
            name.includes("dell 14") || name.includes("dell 15") ||
            name.includes("dell 16") || name.includes("surface pro") ||
            name.includes("e14") || name.includes("e16") || name.includes("t14") ||
            name.includes("t14s") || name.includes("x13") || name.includes("v15") ||
            /\btb\s?(14|16)\b/i.test(name);

        const hasStorage =
            /\b(128|256|512|1024|2048)\s?gb\b.*\b(ssd|nvme|storage|solid|drive)\b|\b(1|2|4|8)\s?t(b)?\b|\b(ssd|nvme|storage|solid|drive)\b.*\b(128|256|512|1024|2048)\s?gb\b/i.test(combined) ||
            (isExplicitLaptop && /\b(128|256|512|1024|2048)\s?gb\b/i.test(combined));
        const hasLaptopSpecs = hasProcessor && hasRam && hasStorage;

        const hasPortableSignals =
            /\b(13|14|15|16|17)(\.\d)?\s?(in|inch|")\b/i.test(combined) ||
            /\b(wqxga|wuxga|fhd|oled|ips|touchscreen|comfortview)\b/i.test(combined);
        const hasMobileBuild = /\b(battery|whr|wi\s?fi|wifi|camera|backlit|fingerprint|facial recognition|control vault|lte|esim)\b/i.test(combined);

        if (/\balienware\s?16\b/i.test(name) && hasProcessor && hasRam && hasPortableSignals) {
            return true;
        }

        if (/\bdell intel core ultra\b/i.test(name) && hasProcessor && hasRam && hasStorage && /\b(lpddr|fingerprint|facial recognition|control vault)\b/i.test(combined)) {
            return true;
        }

        return isBigLaptopBrand && hasLaptopSpecs && (isExplicitLaptop || (hasPortableSignals && hasMobileBuild));
    };

    // Helper to check if a product is an accessory
    const isAccessory = (product) => {
        return ['accessories', 'mice', 'keyboards', 'laptop-bags'].includes(getProductStoreCategory(product));
    };

    const shouldHideStoreProduct = (product) => {
        const text = [
            product.product_name,
            product.description,
            product.brand,
            product.product_number
        ].filter(Boolean).join(' ').toLowerCase();

        const category = getProductStoreCategory(product);

        return (Number(product.quantity) || 0) <= 0 ||
            /\bscrews?\b/i.test(text) ||
            text.includes('legion branded combination notebook') ||
            text.includes('legion notebook combination nano') ||
            category.startsWith('hidden-');
    };

    const getProductStoreCategory = (product) => {
        const text = [
            product.product_name,
            product.description,
            product.brand,
            product.product_number
        ].filter(Boolean).join(' ').toLowerCase();

        const hasComputerProcessor = /\b(i[3579]|core|intel|ryzen|amd|celeron|pentium|snapdragon|ultra\s?[3579]|u[3579][-\s]?\d*|n100|n200)\b/.test(text);
        const hasComputerRam = /\b(4|8|12|16|18|24|32|36|48|64|96|128)\s?gb\b.*\b(ram|memory|ddr|lpddr|unified)\b|\b(ram|memory|ddr|lpddr|unified)\b.*\b(4|8|12|16|18|24|32|36|48|64|96|128)\s?gb\b|\b(4|8|12|16|18|24|32|36|48|64|96|128)\s?gb\b/.test(text);
        const hasComputerStorage = /\b(128|256|512|1024|2048)\s?gb\b.*\b(ssd|nvme|storage|solid|drive|pcie)\b|\b(1|2|4|8)\s?t(b)?\b|\b(ssd|nvme|storage|solid|drive|pcie)\b.*\b(128|256|512|1024|2048)\s?gb\b/.test(text);
        const hasComputerSystemSignal = /\b(windows\s?11|windows\s?10|integrated graphics|graphics|display|fhd|wuxga|wqxga|battery|whr)\b/.test(text);
        const looksLikeFullComputer = hasComputerProcessor && hasComputerRam && hasComputerStorage && hasComputerSystemSignal;

        if (/\b(racing|trueforce|driving force|racing wheel|wheel for xbox|wheel for ps|shifter|sim racing)\b/.test(text)) return 'hidden-unwanted';
        if (/\b(speaker|speakers|stereo|bluetooth speaker|soundbar|subwoofer)\b/.test(text)) return 'hidden-unwanted';
        if (/\b(usb receiver|wireless receiver|mini receiver|presentation remote|presenter|laser pointer|red laser|r400)\b/.test(text)) return 'hidden-unwanted';
        if (/\b(windows server|server cal|device cal|client access license|sever standard|server standard)\b/.test(text)) return 'hidden-unwanted';
        if (/\b(lock|defcon|kensington|nano combination|combination lock|notebook lock|wedge lock|key lock|cable lock|keyed lock|hypershield|3 in 1 combination|3-in-1 combination|legion nano)\b/.test(text)) return 'hidden-unwanted';
        if (/\b(ac adapter|adapter slim tip|usb c to ethernet|usb c-to ethernet|ethernet adapter|thinkpad usb|hdmi to vga|hdhmi to vga|video adapter|displayport socket|monitor cable)\b/.test(text) && !isLaptop(product)) return 'hidden-unwanted';
        if (/\b(eaton hotswap|hotswap mbp|mbp iec|hot swap mbp)\b/.test(text)) return 'hidden-unwanted';
        if (/\b(thinkpad\s+\d+\s*gb\s+ddr|sodimm|memory module|ram module)\b/.test(text) && !isLaptop(product)) return 'hidden-unwanted';
        if (/\b(backpack|back pack|laptop bag|notebook bag|topload|sleeve|carry case|messenger|briefcase|tote|avila|heritageluxe|corporate trav|drifter|campus|prelude pro recycle|multifit|ecosmart)\b/.test(text)) return 'laptop-bags';
        if (/\btargus\b/.test(text) && !/\b(mouse|keyboard)\b/.test(text)) return 'hidden-unwanted';
        if (/\b(portable stand|laptop stand|ergonomic laptop stand|ergostand|hyperspace ergonomic|steel laptop stand|multiangle|integrated dock|docking station|dock|hub|4 port|7 port|multifunction hub|chill mat|privacy screen|smart case|protect case|slim smart case|\bcase\b|stylus|active stylus|embedded clip|3 leaf clover|leaf clover|clover)\b/.test(text) && !isLaptop(product)) return 'hidden-unwanted';
        if (/\bstand(s)?\b/.test(text) && !/\bmonitor\b/.test(text) && !isLaptop(product)) return 'hidden-unwanted';
        if (/\b(ugreen|snug|gan|home charger|pd charger|powerbank|power bank|battery pack|portable charger|wireless mouse pad charger|mouse pad charger|wireless charging pad)\b/.test(text)) return 'hidden-unwanted';
        if (/\b(samsung|galaxy)\b/.test(text) && /\b(5g|a36|a37|a56|s25|ultra|phone|android|amoled|rear cam|front cam)\b/.test(text)) return 'hidden-unwanted';
        if (/\b(teams open office|uc platform|audio receiver|bluetooth audio receiver|hp series 3 pro|series 3 pro)\b/.test(text)) return 'hidden-unwanted';
        if (/\b(ups|smart ups|back ups|pdu|power distribution|surge|apc)\b/.test(text)) return 'hidden-power-ups';
        if (/\b(printer|printhead|laserjet|toner|ink|cartridge|fuser|imaging drum|maintenance kit|oki|lexmark|\bblk\b|col bundle|305xl|652)\b/.test(text)) return 'hidden-printers-toner';
        if (isLaptop(product)) return 'laptops';
        if (/\b(workstation|z workstation|desktop workstation|tower workstation|thinkstation|precision tower)\b/.test(text)) return 'workstations';
        if (/\b(all in one|all-in-one|\baio\b|tower plus|pro tower|pro tower essential|desktop tower|tower desktop|mini tower|small form factor|\bsff\b|qct1250|qvt1260)\b/.test(text)) return 'desktops';
        if (/\b(dell pro micro|dell pro slim|pro micro|pro slim|micro qcm|slim qcs|qcs1250|micro desktop|micro form factor|optiplex|thinkcentre|prodesk|elitedesk|pro slim essential|mini pc)\b/.test(text)) return 'desktops';
        if (looksLikeFullComputer) return 'hidden-unwanted';
        if (/\b(keyboard and mouse|keyboard mouse|desktop combo|wired desktop combo|wireless combo|combo keyboard|keyboard)\b/.test(text)) return 'keyboards';
        if (/\b(mouse|mice)\b/.test(text)) return 'mice';
        if (/\b(keyboard|combo keyboard|wireless combo)\b/.test(text)) return 'keyboards';
        if (/\b(monitor|display|fhd|qhd|uhd|4k)\b/.test(text) && !/\b(laptop|notebook|macbook)\b/.test(text) && !isLaptop(product)) return 'monitors';
        return 'hidden-unwanted';
    };

    const productHasImage = (product) => Boolean(product.image_url && String(product.image_url).trim() !== '');

    function getProductImageSrc(imageUrl) {
        const url = String(imageUrl || '').trim();
        if (!url) {
            return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iI2Y5ZjlmOSI+PC9yZWN0Pjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTgiIGZpbGw9IiM5OTk5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5ObyBJbWFnZTwvdGV4dD48L3N2Zz4=';
        }
        if (/^https?:\/\//i.test(url)) return `/image-proxy?url=${encodeURIComponent(url)}`;
        return `/product_images/${url}`;
    }

    function isAppleLaptopProduct(product) {
        const text = [
            product.product_name,
            product.description,
            product.brand,
            product.product_number
        ].filter(Boolean).join(' ').toLowerCase();

        return /\b(apple|macbook|mac book|mba|mbp|mac)\b/i.test(text) && isLaptop(product);
    }

    function getStoreProductImageSrc(product) {
        if (product?.image_url && String(product.image_url).trim() !== '') {
            return getProductImageSrc(product.image_url);
        }

        if (isAppleLaptopProduct(product)) {
            return 'Images/Macbook.webp';
        }

        return getProductImageSrc(product?.image_url);
    }

    const canShowWithoutImage = () => false;

    // Store all products for sorting and filtering
    let allProducts = [];
    let currentSort = 'featured';
    let selectedBrand = null;
    let selectedCategory = null;
    let searchQuery = '';

    async function fetchProducts() {
        if (!productGrid) return;

        try {
            productGrid.innerHTML = '<p class="loading-text">Initializing store modules...</p>';

            // Add cache busting parameter to always get latest products
            const timestamp = Date.now();
            console.log('[Store] Fetching products from API...');
            const response = await fetch(`/api/v1/products?t=${timestamp}`);
            console.log('[Store] API Response Status:', response.status);
            const data = await response.json();
            console.log('[Store] API Response Data:', data);

            if (data.status === 'success') {
                // Show synced store products even while supplier images are still being imported.
                allProducts = (data.data.products || []).filter(p =>
                    (Number(p.quantity) || 0) > 0 &&
                    !shouldHideStoreProduct(p)
                );
                console.log('[Store] Loaded', allProducts.length, 'store products');
                updateStoreCategoryAvailability();
                applyFiltersAndSort();
                
                if (resultsCount) {
                    resultsCount.innerText = `Showing ${allProducts.length} products`;
                }
            } else {
                console.error('[Store] API returned non-success status:', data.status);
                productGrid.innerHTML = '<p>Error: ' + (data.message || 'Unable to load products') + '</p>';
            }
        } catch (err) {
            console.error('[Store] Error fetching products:', err);
            productGrid.innerHTML = '<p>Error loading inventory: ' + err.message + '</p>';
        }
    }

    function updateStoreCategoryAvailability() {
        if (!productGrid) return;

        ['desktops', 'workstations'].forEach(category => {
            const button = document.querySelector(`.optional-category[data-category="${category}"]`);
            if (!button) return;

            const hasProducts = allProducts.some(product => getProductStoreCategory(product) === category);
            button.style.display = hasProducts ? '' : 'none';

            if (!hasProducts && selectedCategory === category) {
                selectedCategory = null;
                selectedBrand = null;
                window.history.replaceState({}, '', 'store.html');
            }
        });
    }
    
    // Expose refresh function for store updates from admin panel
    window.refreshStore = function() {
        console.log('Store refresh triggered from admin panel');
        fetchProducts();
    }
    
    // Function to apply filters and sorting
    function applyFiltersAndSort() {
        let filteredProducts = [...allProducts];

        if (searchQuery) {
            const queryTerms = searchQuery
                .split(/\s+/)
                .map(term => term.trim().toLowerCase())
                .filter(Boolean);

            filteredProducts = filteredProducts.filter(product => {
                const effectiveCategory = isAccessory(product) ? 'accessories' : 'laptops';
                const cleanName = cleanProductName(product.product_name || '', effectiveCategory);
                const smartSummary = generateSmartSummary(product, cleanName, effectiveCategory);
                const searchableText = [
                    ...Object.values(product).filter(value => ['string', 'number'].includes(typeof value)),
                    cleanName,
                    smartSummary,
                    product.product_name,
                    product.description,
                    product.brand,
                    product.category,
                    product.product_type,
                    product.product_number
                ].filter(Boolean).join(' ').toLowerCase();

                return queryTerms.every(term => searchableText.includes(term));
            });
        }
        
        if (selectedCategory) {
            if (selectedCategory === 'licenses') {
                filteredProducts = filteredProducts.filter(product => {
                    const name = (product.product_name || "").toLowerCase();
                    const desc = (product.description || "").toLowerCase();
                    const category = (product.category || "").toLowerCase();
                    return name.includes('license') || desc.includes('license') || category.includes('license');
                });
            } else if (selectedCategory === 'accessories') {
                filteredProducts = filteredProducts.filter(product =>
                    ['mice', 'keyboards', 'laptop-bags'].includes(getProductStoreCategory(product))
                );
            } else {
                filteredProducts = filteredProducts.filter(product => getProductStoreCategory(product) === selectedCategory);
            }
        }
        
        // Apply brand filter with case-insensitive matching
        if (selectedBrand) {
            const brandLower = selectedBrand.toLowerCase().trim();
            
            if (brandLower === 'macbook' || brandLower === 'apple') {
                // Show all Apple-related products (checking both brand and name)
                const appleVariants = ['apple', 'macbook', 'mba', 'mbp', 'imac', 'mac'];
                filteredProducts = filteredProducts.filter(product => {
                    const b = (product.brand || "").toLowerCase().trim();
                    const n = (product.product_name || "").toLowerCase();
                    return appleVariants.some(v => b.includes(v) || n.includes(v));
                });
            } else {
                // For other brands (DELL, HP, Lenovo, Acer, Microsoft), filter by case-insensitive contains
                filteredProducts = filteredProducts.filter(product => {
                    const b = (product.brand || "").toLowerCase().trim();
                    const n = (product.product_name || "").toLowerCase();
                    return b.includes(brandLower) || n.includes(brandLower);
                });
            }
        }
        
        const categoryRank = { laptops: 0, monitors: 1, desktops: 2, workstations: 3, mice: 4, keyboards: 5, 'laptop-bags': 6 };
        const sortByStorePriority = (a, b) => {
            const rankA = categoryRank[getProductStoreCategory(a)] ?? 99;
            const rankB = categoryRank[getProductStoreCategory(b)] ?? 99;
            if (rankA !== rankB) return rankA - rankB;
            return (Number(b.quantity) || 0) - (Number(a.quantity) || 0);
        };

        // Apply sorting
        if (currentSort === 'low') {
            filteredProducts.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
        } else if (currentSort === 'high') {
            filteredProducts.sort((a, b) => parseFloat(b.price) - parseFloat(a.price));
        } else {
            filteredProducts.sort(sortByStorePriority);
        }
        
        // Keep unwanted products out while supplier images are still syncing.
        filteredProducts = filteredProducts.filter(product =>
            (Number(product.quantity) || 0) > 0 &&
            !shouldHideStoreProduct(product)
        );
        
        // Show digital license builders based on current selection.
        const duoSection = document.getElementById('duoLicenseSection');
        const microsoftSection = document.getElementById('microsoftLicenseSection');
        const isLicenseView = selectedCategory === 'licenses';
        const isMicrosoftLicenses = isLicenseView && selectedBrand === 'Microsoft';
        const isDuoOnly = isLicenseView && selectedBrand === 'Duo';
        const isAllLicenses = isLicenseView && !selectedBrand;
        const shouldShowMicrosoft = isMicrosoftLicenses || isAllLicenses;
        const shouldShowDuo = isDuoOnly || isAllLicenses;

        if (microsoftSection) {
            microsoftSection.style.display = shouldShowMicrosoft ? 'block' : 'none';
        }

        if (duoSection) {
            duoSection.style.display = shouldShowDuo ? 'block' : 'none';
            
            // Apply compact spacing only when viewing Duo licenses
            if (isDuoOnly) {
                duoSection.classList.add('compact-spacing');
            } else {
                duoSection.classList.remove('compact-spacing');
            }
        }
        
        renderProductsWithUnavailable(filteredProducts, selectedBrand || selectedCategory);
    }
    
    // Handle sort changes
    document.addEventListener('sortChange', (e) => {
        currentSort = e.detail.value;
        applyFiltersAndSort();
    });

    const productSearchInput = document.getElementById('productSearch');
    if (productSearchInput) {
        productSearchInput.addEventListener('input', () => {
            searchQuery = productSearchInput.value.trim().toLowerCase();
            applyFiltersAndSort();
        });
    }

    // Helper function to generate smart property-based summary
    function generateSmartSummary(product, cleanName, category) {
        if (category === 'accessories') {
            const desc = product.description || '';
            // Remove first 2 words from the description
            const words = desc.split(/\s+/).filter(w => w.length > 0);
            let summary = desc;
            if (words.length > 2) {
                summary = words.slice(2).join(' ').trim();
                // Capitalize first letter
                summary = summary.charAt(0).toUpperCase() + summary.slice(1);
            }
            
            // Limit length
            if (summary.length > 150) {
                return summary.substring(0, 150) + '...';
            }
            return summary || `The ${cleanName} is a premium accessory.`;
        }
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
                specs.storage = `${size}${unit} ${type} storage`;
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
                specs.processor = `${proc} processor`;
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
                specs.display = `crystal-clear ${size}"${resText} display`;
                break;
            }
        }

        // Extract Graphics - NVIDIA/AMD/Intel
        const graphicsPatterns = [
            /(rtx\s*\d+(?:\s*super)?)/i,
            /(gtx\s*\d+)/i,
            /(nvidia\s*geforce\s*rtx?\s*\d+)/i,
            /(amd\s*radeon\s*rx?\s*\d+)/i,
            /(intel\s*iris\s*xe?)/i,
            /(intel\s*uhd\s*graphics)/i,
            /(integrated\s*graphics)/i,
            /(nvidia\s*quadro)/i
        ];
        for (const pattern of graphicsPatterns) {
            const match = fullText.match(pattern);
            if (match) {
                specs.graphics = `${match[1] || match[2] || match[3] || match[4] || match[5] || match[6] || match[7] || match[8]} graphics`;
                break;
            }
        }

        // Build comprehensive summary with all available specs
        const availableSpecs = [];
        if (specs.ram) availableSpecs.push(specs.ram);
        if (specs.storage) availableSpecs.push(specs.storage);
        if (specs.processor) availableSpecs.push(specs.processor);
        if (specs.display) availableSpecs.push(specs.display);
        if (specs.graphics) availableSpecs.push(specs.graphics);

        if (availableSpecs.length > 0) {
            return `The ${cleanName} has ${availableSpecs.join(', ')}.`;
        }

        // Ultimate fallback - use truncated description
        const desc = product.description || '';
        if (desc.length > 150) {
            return desc.substring(0, 150) + '...';
        }
        return desc || `The ${cleanName} is a premium computing solution.`;
    }

    function renderProducts(products) {
        if (!productGrid) return;
        productGrid.innerHTML = ''; 

        products.forEach((product, index) => {
            const card = document.createElement('div');
            card.className = 'product-card';
            
            // Determine effective category for cleaning (treat as accessory if in accessories tab OR if it's an accessory)
            const isAcc = selectedCategory === 'accessories' || isAccessory(product);
            const effectiveCat = isAcc ? 'accessories' : 'laptops';

            // Clean the product name - pass category for accessory-specific rules
            const cleanName = cleanProductName(product.product_name, effectiveCat);
            
            // Generate smart summary based on properties - pass category for accessory-specific rules
            const smartSummary = generateSmartSummary(product, cleanName, effectiveCat);
            
            // Get product type and brand for display
            const productType = product.product_type || 'Electronics';
            const brand = product.brand || 'APPLE';
            const imageLoading = index < 4 ? 'eager' : 'lazy';
            const imagePriority = index < 4 ? 'high' : 'low';
            const fallbackImage = isAppleLaptopProduct(product) ? 'Images/Macbook.webp' : '';

            card.innerHTML = `
                <div class="card-head">
                    <div class="floating-actions">
                        <button class="action-btn wishlist-btn" style="background: black; color: white;"><i class='bx bx-heart'></i></button>
                        <button class="action-btn add-to-cart-btn" style="background: black; color: white;"><i class='bx bx-cart'></i></button>
                    </div>
                    <img src="${getStoreProductImageSrc(product)}" data-fallback-image="${fallbackImage}" alt="${cleanName}" width="320" height="240" sizes="(max-width: 640px) 46vw, (max-width: 1100px) 30vw, 260px" loading="${imageLoading}" decoding="async" fetchpriority="${imagePriority}" onerror="handleProductImageError(this)">
                </div>
                <div class="card-body">
                    <div class="product-meta" style="display: flex; gap: 8px; margin-bottom: 8px;">
                        ${getBrandDisplay(brand)}
                    </div>
                    <h3 class="product-title">${cleanName}</h3>
                    <p class="product-summary">${smartSummary}</p>
                    
                    <div class="price-box">
                        <span class="current-price">R${parseFloat(product.price).toLocaleString()}</span>
                    </div>
                    <button class="btn-view-details">View Product</button>
                </div>
            `;

            // Click to view details
            card.addEventListener('click', (e) => {
                if (e.target.closest('.action-btn')) return;
                window.location.href = `product.html?id=${product.id}`;
            });

            // Wishlist Toggle
            const wishBtn = card.querySelector('.wishlist-btn');
            wishBtn.onclick = (e) => {
                e.stopPropagation();
                addToWishlistFromStore(product, wishBtn);
            };

            // Cart Action
            const cartBtn = card.querySelector('.add-to-cart-btn');
            cartBtn.onclick = (e) => {
                e.stopPropagation();
                addToCart(product); // Your existing addToCart function
                cartBtn.style.background = "#00d2be";
                setTimeout(() => cartBtn.style.background = "black", 500);
            };

            productGrid.appendChild(card);
        });
    }
    
    // Function to render products or show unavailable message
    function renderProductsWithUnavailable(products, filterValue) {
        if (!productGrid) return;

        if (products.length === 0 && searchQuery) {
            const safeQuery = searchQuery.replace(/[&<>"']/g, char => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            }[char]));

            productGrid.innerHTML = `
                <div class="unavailable-container">
                    <div class="unavailable-content">
                        <h2>No products found</h2>
                        <p>No results matched "${safeQuery}". Try another brand, model, spec, or category.</p>
                        <button class="btn btn-primary" id="clearSearchBtn">Clear Search</button>
                    </div>
                </div>
            `;

            const clearSearchBtn = document.getElementById('clearSearchBtn');
            if (clearSearchBtn) {
                clearSearchBtn.addEventListener('click', () => {
                    searchQuery = '';
                    if (productSearchInput) productSearchInput.value = '';
                    applyFiltersAndSort();
                });
            }

            if (resultsCount) {
                resultsCount.innerText = `No products found for "${searchQuery}"`;
            }
            return;
        }
        
        if (products.length === 0 && selectedCategory === 'licenses') {
            productGrid.innerHTML = '';
            if (resultsCount) {
                if (selectedBrand === 'Microsoft') {
                    resultsCount.innerText = 'Showing Microsoft licenses';
                } else if (selectedBrand === 'Duo') {
                    resultsCount.innerText = 'Showing Cisco Duo licenses';
                } else {
                    resultsCount.innerText = 'Showing all digital licenses';
                }
            }
            return;
        }

        if (products.length === 0 && filterValue) {
            let displayBrand = filterValue;
            let productType = "laptops";
            
            if (selectedCategory === 'licenses') {
                productType = "licenses";
                if (displayBrand === 'licenses') displayBrand = "All";
            } else if (selectedCategory === 'accessories') {
                productType = "accessories";
                if (displayBrand === 'accessories') displayBrand = "All";
            }
            
            // Show unavailable message
            productGrid.innerHTML = `
                <div class="unavailable-container">
                    <div class="unavailable-content">
                        <h2>Currently Unavailable</h2>
                        <p>${displayBrand} ${productType} are not currently available in our store.</p>
                        <p>Please select another brand or category or check back later.</p>
                        <button class="btn btn-primary" id="backToAllBtn">View All Products</button>
                    </div>
                </div>
            `;
            
            // Add click handler to go back to all products
            document.getElementById('backToAllBtn').addEventListener('click', () => {
                selectedBrand = null;
                selectedCategory = null;
                searchQuery = '';
                if (productSearchInput) productSearchInput.value = '';
                const allProductsPill = document.getElementById('allProductsPill');
                if (allProductsPill) {
                    allProductsPill.click();
                } else {
                    applyFiltersAndSort();
                }
            });
            
            if (resultsCount) {
                resultsCount.innerText = `No ${displayBrand} ${productType} available`;
            }
        } else {
            // Render products normally
            renderProducts(products);
            if (resultsCount) {
                // Don't show count for Cisco Duo (licenses tab)
                if (!(filterValue === 'Duo' && selectedCategory === 'licenses')) {
                    resultsCount.innerText = `Showing ${products.length} products`;
                } else {
                    resultsCount.innerText = '';
                }
            }
        }
    }

    // --- 3. CART SYSTEM ---
    async function addToCart(product) {
        if (user) {
            // Sync to DB
            try {
                await fetch('/api/v1/cart/sync', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        userID: user.userID, 
                        items: [{ id: product.id, quantity: 1 }] 
                    })
                });
            } catch (err) {
                console.error('Error syncing cart to DB:', err);
            }
        } else {
            // Sync to Local
            let cart = JSON.parse(localStorage.getItem('cart')) || [];
            const idx = cart.findIndex(i => i.id == product.id);
            if (idx > -1) {
                cart[idx].quantity += 1;
            } else {
                cart.push({
                    id: product.id,
                    product_name: product.product_name,
                    price: product.price,
                    image_url: product.image_url,
                    description: product.description,
                    quantity: 1
                });
            }
            localStorage.setItem('cart', JSON.stringify(cart));
        }
        updateCartBadge();
    }

    function updateCartBadge() {
        if (user) {
            // For logged in users, we might want to fetch the actual count from DB
            // But for now, let's just increment or use a local estimation if we don't want extra API calls
            // Actually, the cart count should ideally be synced.
            fetchCartCount();
        } else {
            const cart = JSON.parse(localStorage.getItem('cart')) || [];
            const count = cart.reduce((acc, item) => acc + item.quantity, 0);
            localStorage.setItem('cartCount', count);
            if (cartBadge) cartBadge.innerText = count;
        }
    }

    async function fetchCartCount() {
        if (!user) return;
        try {
            const response = await fetch(`/api/v1/cart/${user.userID}`);
            const data = await response.json();
            if (data.status === 'success') {
                const count = data.data.reduce((acc, item) => acc + item.quantity, 0);
                localStorage.setItem('cartCount', count);
                if (cartBadge) cartBadge.innerText = count;
            }
        } catch (err) {
            console.error('Error fetching cart count:', err);
        }
    }

    async function initCart() {
        if (user) {
            const localCart = JSON.parse(localStorage.getItem('cart'));
            if (localCart && localCart.length > 0) {
                // Sync local cart to DB
                try {
                    await fetch('/api/v1/cart/sync', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            userID: user.userID, 
                            items: localCart.map(item => item.type ? item : ({ id: item.id, quantity: item.quantity }))
                        })
                    });
                    localStorage.removeItem('cart'); // Clear local cart after sync
                } catch (err) {
                    console.error('Error syncing local cart to DB on init:', err);
                }
            }
        }
        updateCartBadge();
    }

    // --- 4. SCROLL REVEAL ANIMATIONS ---
    const revealOnScroll = () => {
        const sections = document.querySelectorAll('section');
        sections.forEach(section => {
            const sectionTop = section.getBoundingClientRect().top;
            if (sectionTop < window.innerHeight - 100) {
                section.style.opacity = '1';
                section.style.transform = 'translateY(0)';
            }
        });
    };

    function initAnimations() {
        const sections = document.querySelectorAll('section');
        sections.forEach(section => {
            section.style.opacity = '0';
            section.style.transform = 'translateY(30px)';
            section.style.transition = 'all 0.8s ease-out';
        });
        window.addEventListener('scroll', revealOnScroll);
        revealOnScroll(); // Trigger once on load
    }

    // --- 5. NAVIGATION (HAMBURGER) ---
    if (hamburger && navLinks) {
        hamburger.dataset.menuBound = 'true';
        hamburger.addEventListener('click', () => {
            navLinks.classList.toggle('active');
            const spans = hamburger.querySelectorAll('span');
            if (navLinks.classList.contains('active')) {
                spans[0].style.transform = 'rotate(-45deg) translate(-5px, 6px)';
                spans[1].style.opacity = '0';
                spans[2].style.transform = 'rotate(45deg) translate(-5px, -6px)';
            } else {
                spans[0].style.transform = 'none';
                spans[1].style.opacity = '1';
                spans[2].style.transform = 'none';
            }
        });
    }

    if (syncBtn) {
        syncBtn.addEventListener('click', syncWithAxiz);
    }

    // --- WISHLIST SYSTEM ---
    async function addToWishlistFromStore(product, btn) {
        const userID = user?.userID || localStorage.getItem('userID');
        
        if (userID) {
            // Add to server
            try {
                const response = await fetch('/api/v1/wishlist/add', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userID: userID,
                        productID: product.id
                    })
                });
                
                if (response.ok) {
                    btn.innerHTML = "<i class='bx bxs-heart' style='color: #ff4d4d;'></i>";
                    btn.classList.add('in-wishlist');
                    updateWishlistBadge();
                    showWishlistNotification('Added to wishlist!', 'success');
                } else {
                    const data = await response.json();
                    if (data.message && data.message.includes('already')) {
                        removeFromWishlistFromStore(product, btn);
                    } else {
                        showWishlistNotification(data.message || 'Error adding to wishlist', 'error');
                    }
                }
            } catch (err) {
                console.error('Error adding to wishlist:', err);
                showWishlistNotification('Error adding to wishlist', 'error');
            }
        } else {
            // Add to localStorage
            let wishlist = JSON.parse(localStorage.getItem('wishlist') || '[]');
            
            const idx = wishlist.findIndex(item => item.id === product.id);
            if (idx > -1) {
                wishlist.splice(idx, 1);
                btn.innerHTML = "<i class='bx bx-heart' style='color: white;'></i>";
                btn.classList.remove('in-wishlist');
                showWishlistNotification('Removed from wishlist', 'info');
            } else {
                wishlist.push({
                    id: product.id,
                    product_name: product.product_name,
                    price: product.price,
                    image_url: product.image_url,
                    description: product.description
                });
                btn.innerHTML = "<i class='bx bxs-heart' style='color: #ff4d4d;'></i>";
                btn.classList.add('in-wishlist');
                showWishlistNotification('Added to wishlist!', 'success');
            }
            localStorage.setItem('wishlist', JSON.stringify(wishlist));
            updateWishlistBadge();
        }
    }

    async function removeFromWishlistFromStore(product, btn) {
        const userID = user?.userID || localStorage.getItem('userID');
        
        if (userID) {
            try {
                const response = await fetch(`/api/v1/wishlist/${product.id}`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userID: userID })
                });
                
                if (response.ok) {
                    btn.innerHTML = "<i class='bx bx-heart' style='color: white;'></i>";
                    btn.classList.remove('in-wishlist');
                    updateWishlistBadge();
                    showWishlistNotification('Removed from wishlist', 'info');
                }
            } catch (err) {
                console.error('Error removing from wishlist:', err);
            }
        }
    }

    function updateWishlistBadge() {
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

    function showWishlistNotification(message, type = 'info') {
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

    // --- 6. SIDEBAR FILTER (STORE PAGE) ---
    function initSidebarFilters() {
        const allProductsPill = document.getElementById('allProductsPill');
        const accessoriesBtn = document.getElementById('accessoriesBtn');
        const categoryButtons = document.querySelectorAll('.category-main-btn[data-category]');
        const subcategoryItems = document.querySelectorAll('.subcategory-item');
        const clearFiltersBtn = document.getElementById('clearFilters');

        function updateSidebarUI() {
            // Remove active class from all
            categoryButtons.forEach(button => button.classList.remove('active'));
            subcategoryItems.forEach(item => item.classList.remove('active'));

            // Set active based on current filters
            if (!selectedBrand && !selectedCategory) {
                if (allProductsPill) allProductsPill.classList.add('active');
                if (clearFiltersBtn) clearFiltersBtn.style.display = 'none';
            } else {
                if (clearFiltersBtn) clearFiltersBtn.style.display = 'block';
                
                const matchingCategoryButton = Array.from(categoryButtons).find(button =>
                    button.getAttribute('data-category') === selectedCategory && !button.hasAttribute('data-toggle')
                );

                if (matchingCategoryButton) {
                    matchingCategoryButton.classList.add('active');
                }

                if (selectedCategory === 'laptops') {
                    // Expand laptops submenu
                    window.expandCategory('laptops');
                    
                    subcategoryItems.forEach(item => {
                        const itemCategory = item.getAttribute('data-category');
                        const itemBrand = item.getAttribute('data-brand');
                        const isAllLaptops = itemCategory === 'laptops';
                        const isBrandItem = !itemCategory && itemBrand === selectedBrand;
                        const isMatch = selectedBrand ? isBrandItem : isAllLaptops;
                        if (isMatch) item.classList.add('active');
                    });
                } else if (selectedCategory === 'licenses') {
                    // Expand licenses submenu
                    window.expandCategory('licenses');
                    
                    subcategoryItems.forEach(item => {
                        const itemCategory = item.getAttribute('data-category');
                        const itemBrand = item.getAttribute('data-brand');
                        const isAllLicenses = itemCategory === 'licenses' && !itemBrand;
                        const isBrandItem = itemCategory === 'licenses' && itemBrand === selectedBrand;
                        const isMatch = selectedBrand ? isBrandItem : isAllLicenses;
                        if (isMatch) item.classList.add('active');
                    });
                } else if (['accessories', 'mice', 'keyboards', 'laptop-bags'].includes(selectedCategory)) {
                    window.expandCategory('accessories');

                    subcategoryItems.forEach(item => {
                        const itemCategory = item.getAttribute('data-category');
                        if (itemCategory === selectedCategory) item.classList.add('active');
                    });
                }
            }
        }

        if (allProductsPill) {
            allProductsPill.addEventListener('click', () => {
                selectedBrand = null;
                selectedCategory = null;
                updateSidebarUI();
                window.history.replaceState({}, '', 'store.html');
                applyFiltersAndSort();
            });
        }

        if (accessoriesBtn) {
            accessoriesBtn.addEventListener('click', () => {
                selectedBrand = null;
                selectedCategory = 'accessories';
                updateSidebarUI();
                window.history.replaceState({}, '', 'store.html?category=accessories');
                applyFiltersAndSort();
            });
        }

        categoryButtons.forEach(button => {
            const category = button.getAttribute('data-category');
            if (!category || category === 'all' || button.hasAttribute('data-toggle')) return;

            button.addEventListener('click', () => {
                selectedBrand = null;
                selectedCategory = category;
                updateSidebarUI();
                window.history.replaceState({}, '', `store.html?category=${category}`);
                applyFiltersAndSort();
            });
        });

        subcategoryItems.forEach(item => {
            item.addEventListener('click', () => {
                const brand = item.getAttribute('data-brand');
                const category = item.getAttribute('data-category');

                if (category === 'licenses') {
                    selectedCategory = 'licenses';
                    selectedBrand = brand || null;
                    let url = 'store.html?category=licenses';
                    if (brand) url += `&brand=${brand}`;
                    window.history.replaceState({}, '', url);
                } else if (category) {
                    selectedCategory = category;
                    selectedBrand = null;
                    window.history.replaceState({}, '', `store.html?category=${category}`);
                } else if (brand) {
                    selectedCategory = 'laptops';
                    selectedBrand = brand;
                    window.history.replaceState({}, '', `store.html?category=laptops&brand=${brand}`);
                }

                updateSidebarUI();
                applyFiltersAndSort();
            });
        });

        if (clearFiltersBtn) {
            clearFiltersBtn.addEventListener('click', () => {
                selectedBrand = null;
                selectedCategory = null;
                searchQuery = '';
                if (productSearchInput) productSearchInput.value = '';
                updateSidebarUI();
                window.history.replaceState({}, '', 'store.html');
                applyFiltersAndSort();
            });
        }

        // Initialize UI state
        updateSidebarUI();
    }

    function initMobileStoreFilters() {
        const sidebar = document.querySelector('.sidebar');
        const toggle = document.getElementById('mobileFilterToggle');
        const filterGroups = document.getElementById('storeFilterGroups');
        if (!sidebar || !toggle || !filterGroups) return;

        const isMobile = () => window.matchMedia('(max-width: 760px)').matches;

        const setOpen = (open) => {
            sidebar.classList.toggle('mobile-filters-open', open);
            toggle.setAttribute('aria-expanded', String(open));
        };

        toggle.addEventListener('click', () => {
            if (!isMobile()) return;
            sidebar.classList.remove('mobile-filters-hidden');
            setOpen(!sidebar.classList.contains('mobile-filters-open'));
        });

        sidebar.addEventListener('click', (event) => {
            if (!isMobile()) return;
            const selectedFilter = event.target.closest('.subcategory-item, .category-main-btn[data-category]');
            if (selectedFilter) {
                window.setTimeout(() => setOpen(false), 120);
            }
        });

        let lastScrollY = window.scrollY;
        window.addEventListener('scroll', () => {
            if (!isMobile()) {
                sidebar.classList.remove('mobile-filters-hidden', 'mobile-filters-open');
                toggle.setAttribute('aria-expanded', 'false');
                lastScrollY = window.scrollY;
                return;
            }

            const currentY = window.scrollY;
            const movingDown = currentY > lastScrollY + 10;
            const movingUp = currentY < lastScrollY - 10;

            if (movingDown && currentY > 190) {
                setOpen(false);
                sidebar.classList.add('mobile-filters-hidden');
            } else if (movingUp || currentY < 130) {
                sidebar.classList.remove('mobile-filters-hidden');
            }

            lastScrollY = currentY;
        }, { passive: true });

        window.addEventListener('resize', () => {
            if (!isMobile()) {
                sidebar.classList.remove('mobile-filters-hidden', 'mobile-filters-open');
                toggle.setAttribute('aria-expanded', 'false');
            }
        });
    }

    // --- INITIALIZE EVERYTHING ---
    // Check for URL parameters to set initial filter
    const urlParams = new URLSearchParams(window.location.search);
    const brandParam = urlParams.get('brand');
    const categoryParam = urlParams.get('category');
    
    if (brandParam) {
        selectedBrand = brandParam;
        if (!categoryParam) {
            selectedCategory = 'laptops';
        }
    }
    if (categoryParam) {
        selectedCategory = categoryParam;
    }
    
    initCart();
    updateWishlistBadge();
    initAnimations();
    initSidebarFilters();
    initMobileStoreFilters();
    
    if (productGrid) {
        fetchProducts().then(() => {
            // Apply filters after products are loaded if a filter was set via URL
            if (selectedBrand || selectedCategory) {
                applyFiltersAndSort();
            }
        });
    }

    // Load featured products if on index page
    if (window.location.pathname === '/' || window.location.pathname.endsWith('index.html')) {
        loadFeaturedProducts();
    }
});

let featuredProcurementItems = [];
let featuredProcurementStart = 0;
let featuredProcurementTimer = null;
let featuredProcurementResizeBound = false;

// Load featured products for index.html
async function loadFeaturedProducts() {
    const grid = document.getElementById('featured-products-grid');
    if (!grid) return;

    try {
        const response = await fetch('/api/v1/products');
        const data = await response.json();

        if (data.status === 'success') {
            // Select one best/latest-looking laptop per recognized brand.
            const blockedFeaturedTerms = /bag|backpack|case|sleeve|charger|adapter|mouse|keyboard|cable|dock|hub|monitor|license|microsoft 365|duo|screw|lock|stand|privacy|protector|warranty|care pack|service plan/i;
            const laptopTerms = /laptop|notebook|probook|elitebook|thinkpad|latitude|precision|surface laptop|xps|aspire|swift|macbook|mbp|mba|legion|core ultra|ryzen\s?[57]|i[579]|16gb|32gb|rtx/i;

            const candidates = (data.data.products || [])
                .filter(p => (p.quantity || 0) > 0 && p.image_url && String(p.image_url).trim() !== '')
                .filter(product => {
                    const text = `${product.product_name || ''} ${product.description || ''} ${product.category || ''}`;
                    return laptopTerms.test(text) && !blockedFeaturedTerms.test(text);
                })
                .sort((a, b) => {
                    const aText = `${a.product_name || ''} ${a.description || ''} ${a.brand || ''}`.toLowerCase();
                    const bText = `${b.product_name || ''} ${b.description || ''} ${b.brand || ''}`.toLowerCase();
                    const score = (text) => {
                        let value = 0;
                        if (/core ultra|ai boost|npu|copilot|vpro|14th|13th|ryzen\s?[79]|rtx|m[1234]/.test(text)) value += 8;
                        if (/probook|elitebook|thinkpad|latitude|precision|surface laptop|xps|swift|macbook|legion/.test(text)) value += 5;
                        if (/i7|i9|ultra 7|ultra 9|16gb|32gb|1tb|2tb|ssd/.test(text)) value += 3;
                        if (/i3|celeron|pentium|4gb|128gb/.test(text)) value -= 4;
                        if (blockedFeaturedTerms.test(text)) value -= 8;
                        return value;
                    };
                    return score(bText) - score(aText);
                });

            const normalizeBrand = (product) => {
                const text = `${product.brand || ''} ${product.product_name || ''}`.toLowerCase();
                if (/hp|hewlett/.test(text)) return 'HP';
                if (/dell|latitude|xps|precision|inspiron/.test(text)) return 'Dell';
                if (/lenovo|thinkpad|ideapad|yoga/.test(text)) return 'Lenovo';
                if (/acer|aspire|swift/.test(text)) return 'Acer';
                if (/microsoft|surface/.test(text)) return 'Microsoft';
                if (/apple|macbook|mac|mbp|mba/.test(text)) return 'Apple';
                return 'Other';
            };

            const seenBrands = new Set();
            const products = [];

            candidates.forEach(product => {
                const brandKey = normalizeBrand(product);
                if (brandKey !== 'Other' && !seenBrands.has(brandKey)) {
                    seenBrands.add(brandKey);
                    products.push(product);
                }
            });

            if (products.length < 3) {
                candidates.forEach(product => {
                    if (!products.some(selected => selected.id === product.id)) {
                        products.push(product);
                    }
                });
            }

            featuredProcurementItems = products.slice(0, 9);
            featuredProcurementStart = 0;

            if (featuredProcurementItems.length === 0) {
                grid.innerHTML = `
                    <div class="license-empty-state" style="grid-column: 1 / -1;">
                        <i class='bx bx-package'></i>
                        <h3>No featured picks yet</h3>
                        <p>Add product images in the admin area to feature procurement-ready items here.</p>
                    </div>
                `;
                return;
            }

            renderFeaturedProcurementWindow();

            if (featuredProcurementTimer) clearInterval(featuredProcurementTimer);
            if (featuredProcurementItems.length > 3) {
                featuredProcurementTimer = setInterval(advanceFeaturedProcurementCarousel, 7000);
            }

            if (!featuredProcurementResizeBound) {
                window.addEventListener('resize', updateFeaturedProcurementCarousel);
                featuredProcurementResizeBound = true;
            }
        }
    } catch (err) {
        console.error('Error loading featured products:', err);
        grid.innerHTML = '<p>Unable to load featured products.</p>';
    }
}

function getFeaturedProcurementWindow() {
    if (featuredProcurementItems.length <= 3) return featuredProcurementItems;
    return featuredProcurementItems.slice(featuredProcurementStart, featuredProcurementStart + 3);
}

function renderFeaturedProcurementWindow() {
    const carousel = document.getElementById('featured-products-grid');
    if (!carousel) return;

    carousel.classList.toggle('is-static', featuredProcurementItems.length <= 3);
    carousel.innerHTML = `
        <div class="featured-carousel-track">
            ${featuredProcurementItems.map(product => renderFeaturedProcurementCard(product)).join('')}
        </div>
    `;

    updateFeaturedProcurementCarousel();
    attachFeaturedProcurementEvents(carousel);
}

function renderFeaturedProcurementCard(product) {
        const effectiveCat = 'laptops';
        const cleanName = cleanProductName(product.product_name, effectiveCat);
        const summary = generateFeaturedProcurementSummary(product);
        const brand = normalizeFeaturedBrand(product);

        return `
            <div class="product-card featured-carousel-card">
                <div class="card-head">
                    <div class="floating-actions">
                        <button class="action-btn wishlist-btn" data-id="${product.id}" style="background: black; color: white;"><i class='bx bx-heart'></i></button>
                        <button class="action-btn add-to-cart-btn" data-id="${product.id}" style="background: black; color: white;"><i class='bx bx-cart'></i></button>
                    </div>
                    <img src="${getFeaturedImageSrc(product.image_url)}" alt="${cleanName}" width="320" height="240" loading="lazy" decoding="async" onerror="this.closest('.card-head').classList.add('image-missing'); this.remove();">
                </div>
                <div class="card-body">
                    <div class="product-meta" style="display: flex; gap: 8px; margin-bottom: 8px;">
                        ${getBrandDisplay(brand)}
                    </div>
                    <h3 class="product-title">${cleanName}</h3>
                    <p class="product-summary">${summary}</p>
                    <div class="price-box">
                        <span class="current-price">R${parseFloat(product.price).toLocaleString()}</span>
                    </div>
                    <button class="btn-view-details" onclick="window.location.href='product.html?id=${product.id}'">View Product</button>
                </div>
            </div>
        `;
}

function attachFeaturedProcurementEvents(carousel) {
    featuredProcurementItems.forEach(product => {
        const card = Array.from(carousel.querySelectorAll('.product-card')).find(c => c.querySelector(`.btn-view-details`).getAttribute('onclick').includes(`id=${product.id}`));
        if (!card) return;

        card.addEventListener('click', (e) => {
            if (e.target.closest('.action-btn') || e.target.closest('.btn-view-details')) return;
            window.location.href = `product.html?id=${product.id}`;
        });

        const wishBtn = card.querySelector('.wishlist-btn');
        wishBtn.onclick = (e) => {
            e.stopPropagation();
            if (typeof addToWishlistFromStore === 'function') {
                addToWishlistFromStore(product, wishBtn);
            } else {
                window.location.href = `product.html?id=${product.id}`;
            }
        };

        const cartBtn = card.querySelector('.add-to-cart-btn');
        cartBtn.onclick = (e) => {
            e.stopPropagation();
            if (typeof addToCart === 'function') {
                addToCart(product);
                cartBtn.style.background = "#00d2be";
                setTimeout(() => cartBtn.style.background = "black", 500);
            } else {
                window.location.href = `product.html?id=${product.id}`;
            }
        };
    });
}

function advanceFeaturedProcurementCarousel() {
    const maxStart = Math.max(0, featuredProcurementItems.length - 3);
    if (maxStart <= 0) return;

    featuredProcurementStart = featuredProcurementStart >= maxStart ? 0 : featuredProcurementStart + 1;
    updateFeaturedProcurementCarousel();
}

function updateFeaturedProcurementCarousel() {
    const carousel = document.getElementById('featured-products-grid');
    const track = carousel ? carousel.querySelector('.featured-carousel-track') : null;
    if (!carousel || !track) return;

    const firstCard = track.querySelector('.featured-carousel-card');
    if (!firstCard) return;

    const styles = window.getComputedStyle(track);
    const gap = parseFloat(styles.columnGap || styles.gap || 0) || 0;
    const step = firstCard.getBoundingClientRect().width + gap;
    track.style.transform = `translateX(${-featuredProcurementStart * step}px)`;
}

function getFeaturedImageSrc(imageUrl) {
    if (!imageUrl) return '';
    const url = String(imageUrl).trim();
    if (/^https?:\/\//i.test(url)) return `/image-proxy?url=${encodeURIComponent(url)}`;
    return `/product_images/${url}`;
}

function generateFeaturedProcurementSummary(product) {
    const text = `${product.description || ''} ${product.product_name || ''}`.replace(/\s+/g, ' ').trim();
    const specs = [];
    const processor = text.match(/(Core Ultra\s?\d|Intel Core\s?i[579]|i[579]|Ryzen\s?[579]|M[1234])/i);
    const memory = text.match(/(\d{2,3}\s?GB)\s?(?:RAM|LPDDR|DDR)?/i);
    const storage = text.match(/(\d+\s?TB|\d{3,4}\s?GB)\s?(?:PCIe|NVMe|SSD|storage)?/i);
    const display = text.match(/(\d{2}(?:\.\d)?(?:\s?inch|in)|WUXGA|FHD|OLED|QHD|UHD)/i);

    if (processor) specs.push(processor[1].replace(/\s+/g, ' '));
    if (memory) specs.push(memory[1].replace(/\s+/g, ' '));
    if (storage && !specs.includes(storage[1])) specs.push(storage[1].replace(/\s+/g, ' '));
    if (display) specs.push(display[1].replace(/\s+/g, ' '));

    if (specs.length) return specs.slice(0, 4).join(' / ');
    return text ? text.split(/\s+/).slice(0, 14).join(' ') : 'Latest procurement-ready laptop.';
}

function normalizeFeaturedBrand(product) {
    const text = `${product.brand || ''} ${product.product_name || ''}`.toLowerCase();
    if (/hp|hewlett/.test(text)) return 'HP';
    if (/dell|latitude|xps|precision|inspiron/.test(text)) return 'Dell';
    if (/lenovo|thinkpad|ideapad|yoga/.test(text)) return 'Lenovo';
    if (/acer|aspire|swift/.test(text)) return 'Acer';
    if (/microsoft|surface/.test(text)) return 'Microsoft';
    if (/apple|macbook|mac|mbp|mba/.test(text)) return 'Apple';
    return product.brand || 'Laptop';
}

//=============================================================================
//                           SCROLL ANIMATIONS
//=============================================================================

// Scroll-triggered animations
function initScrollAnimations() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate');
            }
        });
    }, observerOptions);

    // Add animation classes to elements
    const animateElements = document.querySelectorAll('.animate-on-scroll');
    animateElements.forEach(el => observer.observe(el));
}

// Hero section auto-animations
function initHeroAnimations() {
    const heroContent = document.querySelector('.hero-content');
    if (!heroContent) return;

    heroContent.querySelectorAll('.badge-pill, h1, p, .hero-btns, .hero-stats').forEach(el => {
        el.style.removeProperty('opacity');
    });
}

// Initialize Brands Grid
function initBrandGrid() {
    const brandsGrid = document.querySelector('.brands-grid');
    if (!brandsGrid) return;

    const brands = [
        { name: 'HP' , logos: ['Images/HP.png'] },
        { name: 'Dell', logos: ['Images/DellLaptops.PNG', 'Images/DellLaptops.png', 'Images/delllaptops.PNG', 'Images/delllaptops.png'] },
        { name: 'Apple', logos: ['Images/Apple.png'] },
        { name: 'Microsoft', logos: ['Images/Microsoft.png'] },
        { name: 'Acer', logos: ['Images/AcerStick.png', 'Images/AcerStick.PNG', 'Images/acerstick.png', 'Images/acerstick.PNG'] },
        { name: 'Lenovo', logos: ['Images/lenovo.PNG', 'Images/lenovo.png', 'Images/Lenovo.PNG', 'Images/Lenovo.png'] },
        
    ];

    brandsGrid.innerHTML = brands.map(brand => `
        <div class="brand-card animate-on-scroll fade-in-scale ${brand.logos ? '' : 'brand-card-text'}">
            ${brand.logos ? `<img src="${brand.logos[0]}" data-logo-options="${brand.logos.join('|')}" data-logo-index="0" alt="${brand.name}" class="brand-image" onerror="tryNextBrandLogo(this)">` : brand.name}
        </div>
    `).join('');

    // Re-observe new elements if IntersectionObserver exists
    if (typeof initScrollAnimations === 'function') {
        initScrollAnimations();
    }
}

// Initialize animations when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Only run on index.html
    if (window.location.pathname === '/' || window.location.pathname.endsWith('index.html')) {
        initBrandGrid();
        initScrollAnimations();
        initHeroAnimations();
    }
});

function initMobileAutoScrollRails() {
    const mobileQuery = window.matchMedia('(max-width: 768px)');
    const rails = Array.from(document.querySelectorAll('.preferred-category-panel .category-grid'));
    let timers = [];

    const stop = () => {
        timers.forEach(timer => clearInterval(timer));
        timers = [];
    };

    const start = () => {
        stop();
        if (!mobileQuery.matches) return;

        rails.forEach(rail => {
            if (!rail || rail.scrollWidth <= rail.clientWidth + 4) return;

            const timer = setInterval(() => {
                if (!mobileQuery.matches) return;

                const firstCard = rail.querySelector('.category-card');
                const styles = window.getComputedStyle(rail);
                const gap = parseFloat(styles.columnGap || styles.gap || 0) || 0;
                const step = firstCard ? firstCard.getBoundingClientRect().width + gap : rail.clientWidth * 0.78;
                const maxScroll = rail.scrollWidth - rail.clientWidth - 4;
                const nextLeft = rail.scrollLeft >= maxScroll ? 0 : Math.min(rail.scrollLeft + step, maxScroll);

                rail.scrollTo({ left: nextLeft, behavior: 'smooth' });
            }, 7000);

            timers.push(timer);
        });
    };

    mobileQuery.addEventListener?.('change', start);
    window.addEventListener('resize', start);
    start();
}

document.addEventListener('DOMContentLoaded', initMobileAutoScrollRails);