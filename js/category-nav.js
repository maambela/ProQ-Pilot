// ===== MODERN CATEGORY NAVIGATION SYSTEM =====
// Handles expand/collapse behavior with hover and click, smooth animations, and accordion pattern

document.addEventListener('DOMContentLoaded', function() {
    console.log('[Category Nav] Initializing category navigation...');
    initCategoryTreeToggles();
    initCategoryHoverExpand();
    console.log('[Category Nav] Category navigation initialized');
});

/**
 * Initialize click-to-toggle functionality for collapsible categories
 * Implements accordion pattern: only ONE category open at a time
 */
function initCategoryTreeToggles() {
    const toggleButtons = document.querySelectorAll('[data-toggle]');
    console.log('[Category Nav] Found', toggleButtons.length, 'toggle buttons');
    
    toggleButtons.forEach((button, index) => {
        console.log('[Category Nav] Attaching click listener to button', index, button.getAttribute('data-toggle'));
        
        button.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            const toggleId = this.getAttribute('data-toggle');
            const submenu = document.getElementById(toggleId);
            
            console.log('[Category Nav] Button clicked, looking for submenu:', toggleId, 'Found:', !!submenu);
            
            if (!submenu) {
                console.error('[Category Nav] Submenu not found for ID:', toggleId);
                return;
            }
            
            // Check if this submenu is currently open
            const isOpen = submenu.getAttribute('aria-hidden') === 'false';
            console.log('[Category Nav] Current state - is open:', isOpen);
            
            // Close all other submenus (accordion behavior)
            document.querySelectorAll('.category-submenu').forEach(menu => {
                menu.setAttribute('aria-hidden', 'true');
            });
            
            // Close all buttons' expanded state
            document.querySelectorAll('[data-toggle]').forEach(btn => {
                btn.classList.remove('expanded');
            });
            
            // Toggle current submenu
            if (!isOpen) {
                submenu.setAttribute('aria-hidden', 'false');
                this.classList.add('expanded');
                console.log('[Category Nav] Opened submenu:', toggleId);
            } else {
                submenu.setAttribute('aria-hidden', 'true');
                this.classList.remove('expanded');
                console.log('[Category Nav] Closed submenu:', toggleId);
            }
        });
    });
}

/**
 * Initialize hover-to-expand functionality
 * On desktop: hovering over a main category expands it
 * On mobile: click-based (handled by toggles above)
 */
function initCategoryHoverExpand() {
    const categoryTrees = document.querySelectorAll('.category-tree');
    console.log('[Category Nav] Found', categoryTrees.length, 'category trees for hover');
    
    categoryTrees.forEach((tree, index) => {
        const button = tree.querySelector('[data-toggle]');
        const submenu = tree.querySelector('.category-submenu');
        
        if (!button || !submenu) {
            console.warn('[Category Nav] Tree', index, 'missing button or submenu');
            return;
        }
        
        console.log('[Category Nav] Setting up hover for tree', index);
        
        // Hover to expand (Desktop)
        tree.addEventListener('mouseenter', function() {
            // Only auto-expand on hover if viewport is wide enough
            if (window.innerWidth > 768) {
                const isOpen = submenu.getAttribute('aria-hidden') === 'false';
                // Only show on hover if not already toggled by click
                if (!isOpen && !button.classList.contains('expanded')) {
                    submenu.setAttribute('aria-hidden', 'false');
                    console.log('[Category Nav] Hover expand triggered');
                }
            }
        });
        
        // Hover to collapse (Desktop)
        tree.addEventListener('mouseleave', function() {
            // Only auto-collapse on hover out if it wasn't clicked open
            if (window.innerWidth > 768) {
                if (!button.classList.contains('expanded')) {
                    submenu.setAttribute('aria-hidden', 'true');
                    console.log('[Category Nav] Hover collapse triggered');
                }
            }
        });
    });
    
    // Handle window resize to ensure proper behavior on mobile
    window.addEventListener('resize', () => {
        if (window.innerWidth <= 768) {
            // On mobile, close all hover-expanded menus
            document.querySelectorAll('.category-submenu').forEach(menu => {
                const button = menu.previousElementSibling;
                if (!button || !button.classList.contains('expanded')) {
                    menu.setAttribute('aria-hidden', 'true');
                }
            });
        }
    });
}

/**
 * Helper function to expand a specific category programmatically
 * Useful when filtering by URL parameters
 * @param {string} categoryName - The category to expand (e.g., 'laptops', 'licenses')
 */
window.expandCategory = function(categoryName) {
    console.log('[Category Nav] programmatically expanding:', categoryName);
    const submenuId = categoryName + '-submenu';
    const submenu = document.getElementById(submenuId);
    const button = submenu?.previousElementSibling;
    
    if (submenu && button) {
        // Close all other submenus
        document.querySelectorAll('.category-submenu').forEach(menu => {
            menu.setAttribute('aria-hidden', 'true');
        });
        
        document.querySelectorAll('[data-toggle]').forEach(btn => {
            btn.classList.remove('expanded');
        });
        
        // Open this submenu
        submenu.setAttribute('aria-hidden', 'false');
        button.classList.add('expanded');
        console.log('[Category Nav] Expanded:', categoryName);
    }
};
