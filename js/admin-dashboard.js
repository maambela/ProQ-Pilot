document.addEventListener('DOMContentLoaded', () => {
    fetchDashboardStats();
});

async function fetchDashboardStats() {
    try {
        const response = await fetch('/api/v1/admin/dashboard-stats');
        const data = await response.json();

        if (data.status === 'success') {
            updateDashboard(data.data);
        } else {
            console.error('Failed to fetch dashboard stats:', data.message);
        }
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
    }
}

function updateDashboard(data) {
    // 1. Sales
    document.getElementById('sales-today').textContent = formatCurrency(data.sales.today);
    document.getElementById('sales-week').textContent = `This Week: ${formatCurrency(data.sales.week)}`;
    
    // 2. Orders
    const totalOrders = data.orders.reduce((acc, curr) => acc + curr.count, 0);
    const pendingOrders = data.orders.find(o => o.status === 'pending')?.count || 0;
    document.getElementById('order-count').textContent = totalOrders;
    document.getElementById('order-status-summary').textContent = `Pending: ${pendingOrders} | Paid: ${data.orders.find(o => o.status === 'paid')?.count || 0}`;

    // 3. Metrics
    document.getElementById('aov').textContent = formatCurrency(data.metrics.averageOrderValue);
    document.getElementById('total-revenue').textContent = `Revenue: ${formatCurrency(data.metrics.totalRevenue)}`;

    // 4. Customers
    document.getElementById('customer-count').textContent = data.customers.total;
    document.getElementById('returning-customers').textContent = `Returning: ${data.customers.returning}`;
    updateAdminInsights(data, { totalOrders, pendingOrders });

    // 5. Render Charts
    renderSalesCharts(data.sales.weeklyTrend, data.sales.monthlyTrend);

    // 6. Recent Activity
    const activityTable = document.getElementById('recent-activity-table');
    activityTable.innerHTML = '';
    
    data.recentActivity.forEach(order => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>#${order.id}</td>
            <td>${order.email}</td>
            <td>${formatCurrency(order.total_amount)}</td>
            <td><span class="status-badge status-${order.status.toLowerCase()}">${order.status}</span></td>
            <td>${new Date(order.created_at).toLocaleDateString()}</td>
        `;
        activityTable.appendChild(row);
    });

    // 6. Low Stock
    const lowStockList = document.getElementById('low-stock-list');
    lowStockList.innerHTML = '';
    
    if (data.lowStock.length === 0) {
        lowStockList.innerHTML = '<p style="font-size: 0.9rem; color: #718096; text-align: center; padding: 1rem;">No low stock alerts</p>';
    } else {
        data.lowStock.forEach(product => {
            const item = document.createElement('div');
            item.className = 'low-stock-item';
            item.innerHTML = `
                <div class="low-stock-info">
                    <h4>${product.product_name}</h4>
                </div>
                <span class="low-stock-count">${product.quantity} left</span>
            `;
            lowStockList.appendChild(item);
        });
    }
}

function updateAdminInsights(data, computed) {
    const lowStockCount = data.lowStock?.length || 0;
    const returningCustomers = data.customers?.returning || 0;
    const totalCustomers = data.customers?.total || 0;
    const revenue = Number(data.metrics?.totalRevenue || 0);
    const pendingOrders = computed.pendingOrders || 0;
    const healthScore = Math.max(42, Math.min(98,
        74
        + (revenue > 0 ? 8 : 0)
        + (returningCustomers > 0 ? 6 : 0)
        - (lowStockCount * 4)
        - (pendingOrders * 2)
    ));

    setText('catalog-low-stock', lowStockCount);
    setText('catalog-pending-orders', pendingOrders);
    setText('catalog-returning-customers', returningCustomers);
    setText('procurement-health-score', `${healthScore}% ready`);

    const healthCopy = lowStockCount > 0
        ? `${lowStockCount} product${lowStockCount === 1 ? '' : 's'} need stock attention before pushing the category harder.`
        : totalCustomers > 0
            ? 'Catalogue basics look steady. Keep core approvals and product images moving so buyers see complete listings.'
            : 'Start with catalogue approvals, product imagery, and a clean laptop/monitor split before scaling traffic.';
    setText('procurement-health-copy', healthCopy);

    const actions = [
        pendingOrders > 0 ? { href: 'admin_dashboard.html', text: `Clear ${pendingOrders} pending order${pendingOrders === 1 ? '' : 's'}` } : null,
        lowStockCount > 0 ? { href: 'admin_products.html', text: `Restock ${lowStockCount} low-stock product${lowStockCount === 1 ? '' : 's'}` } : null,
        { href: 'admin_core_products.html', text: 'Approve core API products with images' },
        { href: 'store.html', text: 'Open the live storefront' }
    ].filter(Boolean);

    const actionList = document.getElementById('admin-action-list');
    if (actionList) {
        actionList.innerHTML = actions.map(action => `<a href="${action.href}">${action.text}</a>`).join('');
    }
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-ZA', {
        style: 'currency',
        currency: 'ZAR',
    }).format(amount);
}

function renderSalesCharts(weeklyData, monthlyData) {
    // --- Weekly Sales Chart ---
    const weeklyCtx = document.getElementById('weeklySalesChart').getContext('2d');
    
    // Process last 7 days to ensure all days are present
    const weeklyLabels = [];
    const weeklyValues = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const label = d.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric' });
        
        const dayData = weeklyData.find(item => {
            const itemDate = new Date(item.date).toISOString().split('T')[0];
            return itemDate === dateStr;
        });
        
        weeklyLabels.push(label);
        weeklyValues.push(dayData ? parseFloat(dayData.total) : 0);
    }

    new Chart(weeklyCtx, {
        type: 'line',
        data: {
            labels: weeklyLabels,
            datasets: [{
                label: 'Daily Sales (R)',
                data: weeklyValues,
                borderColor: '#44ffe0',
                backgroundColor: 'rgba(68, 255, 224, 0.14)',
                borderWidth: 2,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.08)' }, ticks: { color: 'rgba(255,255,255,0.68)' } },
                x: { grid: { display: false }, ticks: { color: 'rgba(255,255,255,0.68)' } }
            }
        }
    });

    // --- Monthly Sales Chart ---
    const monthlyCtx = document.getElementById('monthlySalesChart').getContext('2d');
    
    const monthlyLabels = monthlyData.map(item => {
        const [year, month] = item.month.split('-');
        return new Date(year, month - 1).toLocaleDateString('en-ZA', { month: 'short', year: '2-digit' });
    });
    const monthlyValues = monthlyData.map(item => parseFloat(item.total));

    new Chart(monthlyCtx, {
        type: 'bar',
        data: {
            labels: monthlyLabels,
            datasets: [{
                label: 'Monthly Sales (R)',
                data: monthlyValues,
                backgroundColor: 'rgba(255, 168, 54, 0.78)',
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.08)' }, ticks: { color: 'rgba(255,255,255,0.68)' } },
                x: { grid: { display: false }, ticks: { color: 'rgba(255,255,255,0.68)' } }
            }
        }
    });
}
