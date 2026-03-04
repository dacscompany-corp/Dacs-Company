// Global variables
let currentUser = null;
let currentView = 'dashboard';
let appointments = [];
let currentAppointment = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    checkAuthState();
    setupEventListeners();
});

// Check authentication state
function checkAuthState() {
    auth.onAuthStateChanged(user => {
        if (user) {
            currentUser = user;
            showDashboard();
            loadData();
        } else {
            showLogin();
        }
    });
}

// Show login screen
function showLogin() {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('dashboardScreen').style.display = 'none';
}

// Show dashboard
function showDashboard() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('dashboardScreen').style.display = 'grid';
    document.getElementById('userEmail').textContent = currentUser.email;
    if (typeof initExpensesModule === 'function') initExpensesModule();
    if (typeof loadProjects === 'function') loadProjects();
}

// Setup event listeners
function setupEventListeners() {
    // Login form
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    
    // Logout button
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    
    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const view = e.currentTarget.dataset.view;
            switchView(view);
        });
    });
    
    // Filters
    document.getElementById('statusFilter')?.addEventListener('change', filterAppointments);
    document.getElementById('searchInput')?.addEventListener('input', filterAppointments);
}

// Handle login
async function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const errorDiv = document.getElementById('loginError');
    
    try {
        await auth.signInWithEmailAndPassword(email, password);
        errorDiv.classList.remove('show');
    } catch (error) {
        console.error('Login error:', error);
        errorDiv.textContent = 'Invalid email or password. Please try again.';
        errorDiv.classList.add('show');
    }
}

// Handle logout
async function handleLogout() {
    try {
        await auth.signOut();
    } catch (error) {
        console.error('Logout error:', error);
    }
}

// Switch views
function switchView(view) {
    currentView = view;
    
    // Update navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.view === view) {
            item.classList.add('active');
        }
    });
    
    // Update page title
    const titles = {
        dashboard: 'Dashboard', appointments: 'Appointments', analytics: 'Analytics',
        expOverview: 'Budget Overview', expExpenses: 'Expenses',
        expPayroll: 'Payroll', expReports: 'Reports'
    };
    document.getElementById('pageTitle').textContent = titles[view] || view;
    
    // Hide all views
    document.querySelectorAll('.content-view').forEach(v => {
        v.style.display = 'none';
    });
    
    // Show selected view
    const vEl = document.getElementById(`${view}View`);
    if (vEl) vEl.style.display = 'block';
    
    // Load view-specific data
    if (view === 'appointments') {
        displayAllAppointments();
    } else if (view === 'analytics') {
        displayAnalytics();
    }
}

// Load all data
async function loadData() {
    try {
        const snapshot = await db.collection('appointments')
            .orderBy('createdAt', 'desc')
            .get();
        
        appointments = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        updateDashboardStats();
        displayRecentAppointments();
        displayServicesChart();
        displayDashboardServiceChart();
        displayDashboardStatusChart();
    } catch (error) {
        console.error('Error loading data:', error);
    }
}

// Update dashboard stats
function updateDashboardStats() {
    const total = appointments.length;
    const pending = appointments.filter(a => a.status === 'pending').length;
    const completed = appointments.filter(a => a.status === 'completed').length;
    
    // This week
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const thisWeek = appointments.filter(a => {
        const createdAt = a.createdAt?.toDate();
        return createdAt && createdAt >= weekAgo;
    }).length;
    
    document.getElementById('totalAppointments').textContent = total;
    document.getElementById('pendingAppointments').textContent = pending;
    document.getElementById('completedAppointments').textContent = completed;
    document.getElementById('thisWeek').textContent = thisWeek;
}

// Display recent appointments
function displayRecentAppointments() {
    const container = document.getElementById('recentAppointments');
    const recent = appointments.slice(0, 5);
    
    if (recent.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); padding: 20px;">No appointments yet.</p>';
        return;
    }
    
    container.innerHTML = recent.map(appointment => {
        const date = appointment.createdAt?.toDate();
        const dateStr = date ? date.toLocaleDateString() : 'N/A';
        
        return `
            <div class="appointment-item" onclick="showAppointmentDetails('${appointment.id}')">
                <div class="appointment-date">${dateStr}</div>
                <div class="appointment-name">${appointment.fullname}</div>
                <div class="appointment-service">${formatService(appointment.service)}</div>
                <span class="status-badge status-${appointment.status}">${appointment.status}</span>
                <button class="btn-secondary" onclick="event.stopPropagation(); showAppointmentDetails('${appointment.id}')">View</button>
            </div>
        `;
    }).join('');
}

// Display all appointments
function displayAllAppointments() {
    const tbody = document.getElementById('appointmentsTableBody');
    
    if (appointments.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px; color: var(--text-secondary);">No appointments found.</td></tr>';
        return;
    }
    
    tbody.innerHTML = appointments.map(appointment => {
        const date = appointment.createdAt?.toDate();
        const dateStr = date ? date.toLocaleDateString() : 'N/A';
        
        return `
            <tr onclick="showAppointmentDetails('${appointment.id}')">
                <td>${dateStr}</td>
                <td>${appointment.fullname}</td>
                <td>${appointment.email}</td>
                <td>${appointment.contact}</td>
                <td>${formatService(appointment.service)}</td>
                <td><span class="status-badge status-${appointment.status}">${appointment.status}</span></td>
                <td>
                    <select onchange="updateStatus('${appointment.id}', this.value)" onclick="event.stopPropagation()">
                        <option value="">Update Status</option>
                        <option value="pending" ${appointment.status === 'pending' ? 'selected' : ''}>Pending</option>
                        <option value="confirmed" ${appointment.status === 'confirmed' ? 'selected' : ''}>Confirmed</option>
                        <option value="completed" ${appointment.status === 'completed' ? 'selected' : ''}>Completed</option>
                        <option value="cancelled" ${appointment.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                    </select>
                </td>
            </tr>
        `;
    }).join('');
}

// Filter appointments
function filterAppointments() {
    const statusFilter = document.getElementById('statusFilter').value;
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    
    const filtered = appointments.filter(appointment => {
        const matchesStatus = statusFilter === 'all' || appointment.status === statusFilter;
        const matchesSearch = 
            appointment.fullname.toLowerCase().includes(searchTerm) ||
            appointment.email.toLowerCase().includes(searchTerm);
        
        return matchesStatus && matchesSearch;
    });
    
    const tbody = document.getElementById('appointmentsTableBody');
    
    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px; color: var(--text-secondary);">No matching appointments found.</td></tr>';
        return;
    }
    
    tbody.innerHTML = filtered.map(appointment => {
        const date = appointment.createdAt?.toDate();
        const dateStr = date ? date.toLocaleDateString() : 'N/A';
        
        return `
            <tr onclick="showAppointmentDetails('${appointment.id}')">
                <td>${dateStr}</td>
                <td>${appointment.fullname}</td>
                <td>${appointment.email}</td>
                <td>${appointment.contact}</td>
                <td>${formatService(appointment.service)}</td>
                <td><span class="status-badge status-${appointment.status}">${appointment.status}</span></td>
                <td>
                    <select onchange="updateStatus('${appointment.id}', this.value)" onclick="event.stopPropagation()">
                        <option value="">Update Status</option>
                        <option value="pending" ${appointment.status === 'pending' ? 'selected' : ''}>Pending</option>
                        <option value="confirmed" ${appointment.status === 'confirmed' ? 'selected' : ''}>Confirmed</option>
                        <option value="completed" ${appointment.status === 'completed' ? 'selected' : ''}>Completed</option>
                        <option value="cancelled" ${appointment.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                    </select>
                </td>
            </tr>
        `;
    }).join('');
}

// Update appointment status
async function updateStatus(appointmentId, newStatus) {
    if (!newStatus) return;
    
    try {
        await db.collection('appointments').doc(appointmentId).update({
            status: newStatus,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Update local array
        const appointment = appointments.find(a => a.id === appointmentId);
        if (appointment) {
            appointment.status = newStatus;
        }
        
        // Refresh displays
        updateDashboardStats();
        displayRecentAppointments();
        displayAllAppointments();
        
        alert('Status updated successfully!');
    } catch (error) {
        console.error('Error updating status:', error);
        alert('Error updating status. Please try again.');
    }
}

// Show appointment details
function showAppointmentDetails(appointmentId) {
    currentAppointment = appointments.find(a => a.id === appointmentId);
    if (!currentAppointment) return;
    
    const date = currentAppointment.createdAt?.toDate();
    const dateStr = date ? date.toLocaleDateString() + ' ' + date.toLocaleTimeString() : 'N/A';
    
    const detailsHTML = `
        <div class="detail-row">
            <div class="detail-label">Date Submitted</div>
            <div class="detail-value">${dateStr}</div>
        </div>
        <div class="detail-row">
            <div class="detail-label">Full Name</div>
            <div class="detail-value">${currentAppointment.fullname}</div>
        </div>
        <div class="detail-row">
            <div class="detail-label">Email</div>
            <div class="detail-value">${currentAppointment.email}</div>
        </div>
        <div class="detail-row">
            <div class="detail-label">Contact Number</div>
            <div class="detail-value">${currentAppointment.contact}</div>
        </div>
        <div class="detail-row">
            <div class="detail-label">Service Required</div>
            <div class="detail-value">${formatService(currentAppointment.service)}</div>
        </div>
        <div class="detail-row">
            <div class="detail-label">Status</div>
            <div class="detail-value">
                <span class="status-badge status-${currentAppointment.status}">${currentAppointment.status}</span>
            </div>
        </div>
        ${currentAppointment.message ? `
            <div class="detail-row">
                <div class="detail-label">Project Details</div>
                <div class="detail-value">${currentAppointment.message}</div>
            </div>
        ` : ''}
    `;
    
    document.getElementById('appointmentDetails').innerHTML = detailsHTML;
    document.getElementById('appointmentModal').classList.add('show');
}

// Close modal
function closeModal() {
    document.getElementById('appointmentModal').classList.remove('show');
    currentAppointment = null;
}

// Delete appointment
async function deleteAppointment() {
    if (!currentAppointment) return;
    
    if (!confirm('Are you sure you want to delete this appointment?')) return;
    
    try {
        await db.collection('appointments').doc(currentAppointment.id).delete();
        
        // Remove from local array
        appointments = appointments.filter(a => a.id !== currentAppointment.id);
        
        // Refresh displays
        updateDashboardStats();
        displayRecentAppointments();
        displayServicesChart();
        displayAllAppointments();
        
        closeModal();
        alert('Appointment deleted successfully!');
    } catch (error) {
        console.error('Error deleting appointment:', error);
        alert('Error deleting appointment. Please try again.');
    }
}

// Display services chart (for Dashboard) - Now with line chart!
function displayServicesChart() {
    const canvas = document.getElementById('servicesChart');
    
    if (!canvas) return;
    
    // Destroy existing chart if any
    if (canvas.chartInstance) {
        canvas.chartInstance.destroy();
    }
    
    if (appointments.length === 0) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#7A7A7A';
        ctx.font = '14px Barlow, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('No data available', canvas.width / 2, canvas.height / 2);
        return;
    }
    
    // Get month data for the line chart
    const monthCounts = {};
    appointments.forEach(a => {
        const date = a.createdAt?.toDate();
        if (date) {
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            monthCounts[monthKey] = (monthCounts[monthKey] || 0) + 1;
        }
    });
    
    // Get last 12 months
    const months = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const monthName = d.toLocaleDateString('en-US', { month: 'short' });
        months.push({
            key,
            label: monthName,
            count: monthCounts[key] || 0
        });
    }
    
    const ctx = canvas.getContext('2d');
    const labels = months.map(m => m.label);
    const data = months.map(m => m.count);
    
    canvas.chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Appointments',
                data: data,
                borderColor: '#00D084',
                backgroundColor: 'rgba(0, 208, 132, 0.1)',
                borderWidth: 2,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#00D084',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 3,
                pointHoverRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleFont: { size: 12, weight: '600' },
                    bodyFont: { size: 11 },
                    padding: 8,
                    cornerRadius: 6,
                    displayColors: false,
                    callbacks: {
                        label: function(context) {
                            return `${context.parsed.y} appointment${context.parsed.y !== 1 ? 's' : ''}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        precision: 0,
                        font: { size: 10 },
                        color: '#7A7A7A'
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)',
                        drawBorder: false
                    }
                },
                x: {
                    ticks: {
                        font: { size: 10 },
                        color: '#7A7A7A'
                    },
                    grid: {
                        display: false,
                        drawBorder: false
                    }
                }
            },
            interaction: {
                intersect: false,
                mode: 'index'
            }
        }
    });
}

// Display service distribution chart on dashboard
function displayDashboardServiceChart() {
    const canvas = document.getElementById('dashboardServiceChart');
    if (!canvas) return;
    
    if (canvas.chart) {
        canvas.chart.destroy();
    }
    
    if (appointments.length === 0) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#7A7A7A';
        ctx.font = '14px Barlow, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('No data available', canvas.width / 2, canvas.height / 2);
        return;
    }
    
    const serviceCounts = {};
    appointments.forEach(a => {
        const service = formatService(a.service);
        serviceCounts[service] = (serviceCounts[service] || 0) + 1;
    });
    
    const sortedServices = Object.entries(serviceCounts).sort((a, b) => b[1] - a[1]);
    const labels = sortedServices.map(s => s[0]);
    const data = sortedServices.map(s => s[1]);
    
    const colors = [
        '#00D084',
        '#00A86B',
        '#4DFFB8',
        '#17a2b8',
        '#ffc107',
        '#28a745',
        '#6c757d'
    ];
    
    const ctx = canvas.getContext('2d');
    canvas.chart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderWidth: 3,
                borderColor: '#fff',
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        padding: 16,
                        font: { size: 12 },
                        color: '#4A4A4A',
                        usePointStyle: true,
                        pointStyle: 'circle',
                        generateLabels: function(chart) {
                            const data = chart.data;
                            const total = data.datasets[0].data.reduce((a, b) => a + b, 0);
                            return data.labels.map((label, i) => {
                                const value = data.datasets[0].data[i];
                                const percentage = ((value / total) * 100).toFixed(1);
                                return {
                                    text: `${label}: ${value} (${percentage}%)`,
                                    fillStyle: data.datasets[0].backgroundColor[i],
                                    hidden: false,
                                    index: i
                                };
                            });
                        }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleFont: { size: 13, weight: '600' },
                    bodyFont: { size: 12 },
                    padding: 10,
                    cornerRadius: 6,
                    callbacks: {
                        label: function(context) {
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((context.parsed / total) * 100).toFixed(1);
                            return `${context.label}: ${context.parsed} (${percentage}%)`;
                        }
                    }
                }
            },
            cutout: '65%'
        }
    });
}

// Display status chart on dashboard
function displayDashboardStatusChart() {
    const canvas = document.getElementById('dashboardStatusChart');
    if (!canvas) return;
    
    if (canvas.chart) {
        canvas.chart.destroy();
    }
    
    if (appointments.length === 0) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#7A7A7A';
        ctx.font = '14px Barlow, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('No data available', canvas.width / 2, canvas.height / 2);
        return;
    }
    
    const statusCounts = {
        pending: 0,
        confirmed: 0,
        completed: 0,
        cancelled: 0
    };
    
    appointments.forEach(a => {
        if (statusCounts.hasOwnProperty(a.status)) {
            statusCounts[a.status]++;
        }
    });
    
    const labels = ['Pending', 'Confirmed', 'Completed', 'Cancelled'];
    const data = [statusCounts.pending, statusCounts.confirmed, statusCounts.completed, statusCounts.cancelled];
    const colors = ['#ffc107', '#17a2b8', '#28a745', '#dc3545'];
    
    const ctx = canvas.getContext('2d');
    canvas.chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Count',
                data: data,
                backgroundColor: colors,
                borderRadius: 8,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleFont: { size: 13, weight: '600' },
                    bodyFont: { size: 12 },
                    padding: 10,
                    cornerRadius: 6,
                    callbacks: {
                        label: function(context) {
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((context.parsed.y / total) * 100).toFixed(1);
                            return `${context.parsed.y} appointments (${percentage}%)`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        precision: 0,
                        font: { size: 11 },
                        color: '#7A7A7A'
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)',
                        drawBorder: false
                    }
                },
                x: {
                    ticks: {
                        font: { size: 11 },
                        color: '#7A7A7A'
                    },
                    grid: {
                        display: false,
                        drawBorder: false
                    }
                }
            }
        }
    });
}

// ============================================
// ADVANCED ANALYTICS CHARTS
// ============================================

// Display analytics with Chart.js
function displayAnalytics() {
    updateAnalyticsMetrics();
    displayMonthlyTrendChartJS();
    displayServiceBreakdownChartJS();
    displayStatusBreakdownChartJS();
    displayWeeklyActivityChart();
    displayTimeDistributionChart();
}

// Update analytics metrics
function updateAnalyticsMetrics() {
    if (appointments.length === 0) return;
    
    // Conversion rate (completed / total)
    const completed = appointments.filter(a => a.status === 'completed').length;
    const conversionRate = ((completed / appointments.length) * 100).toFixed(1);
    document.getElementById('conversionRate').textContent = conversionRate + '%';
    
    // Popular service
    const serviceCounts = {};
    appointments.forEach(a => {
        const service = formatService(a.service);
        serviceCounts[service] = (serviceCounts[service] || 0) + 1;
    });
    const popularService = Object.entries(serviceCounts).sort((a, b) => b[1] - a[1])[0];
    if (popularService) {
        const shortName = popularService[0].split(' ')[0];
        document.getElementById('popularService').textContent = shortName;
    }
    
    // Growth rate calculation
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const lastMonthCount = appointments.filter(a => {
        const date = a.createdAt?.toDate();
        return date && date >= lastMonth && date < thisMonth;
    }).length;
    
    const thisMonthCount = appointments.filter(a => {
        const date = a.createdAt?.toDate();
        return date && date >= thisMonth;
    }).length;
    
    const growthRate = lastMonthCount > 0 
        ? (((thisMonthCount - lastMonthCount) / lastMonthCount) * 100).toFixed(0)
        : 0;
    document.getElementById('growthRate').textContent = (growthRate > 0 ? '+' : '') + growthRate + '%';
}

// Monthly trend chart with Chart.js
function displayMonthlyTrendChartJS() {
    const canvas = document.getElementById('monthlyTrendChart');
    if (!canvas) return;
    
    // Destroy existing chart
    if (canvas.chart) {
        canvas.chart.destroy();
    }
    
    // Prepare data - last 12 months
    const monthlyData = {};
    const now = new Date();
    
    for (let i = 11; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        monthlyData[key] = 0;
    }
    
    appointments.forEach(a => {
        const date = a.createdAt?.toDate();
        if (date) {
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            if (monthlyData.hasOwnProperty(key)) {
                monthlyData[key]++;
            }
        }
    });
    
    const labels = Object.keys(monthlyData).map(key => {
        const [year, month] = key.split('-');
        return new Date(year, month - 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    });
    
    const data = Object.values(monthlyData);
    
    const ctx = canvas.getContext('2d');
    canvas.chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Appointments',
                data: data,
                borderColor: '#00D084',
                backgroundColor: 'rgba(0, 208, 132, 0.1)',
                borderWidth: 3,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#00D084',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 5,
                pointHoverRadius: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleFont: { size: 14, weight: '600' },
                    bodyFont: { size: 13 },
                    padding: 12,
                    cornerRadius: 8,
                    displayColors: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        precision: 0,
                        font: { size: 12 },
                        color: '#7A7A7A'
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)',
                        drawBorder: false
                    }
                },
                x: {
                    ticks: {
                        font: { size: 12 },
                        color: '#7A7A7A'
                    },
                    grid: {
                        display: false,
                        drawBorder: false
                    }
                }
            },
            interaction: {
                intersect: false,
                mode: 'index'
            }
        }
    });
}

// Service breakdown doughnut chart
function displayServiceBreakdownChartJS() {
    const canvas = document.getElementById('serviceBreakdownChart');
    if (!canvas) return;
    
    if (canvas.chart) {
        canvas.chart.destroy();
    }
    
    const serviceCounts = {};
    appointments.forEach(a => {
        const service = formatService(a.service);
        serviceCounts[service] = (serviceCounts[service] || 0) + 1;
    });
    
    const sortedServices = Object.entries(serviceCounts).sort((a, b) => b[1] - a[1]);
    const labels = sortedServices.map(s => s[0]);
    const data = sortedServices.map(s => s[1]);
    
    const colors = [
        '#00D084',
        '#00A86B',
        '#4DFFB8',
        '#17a2b8',
        '#ffc107',
        '#28a745',
        '#6c757d'
    ];
    
    const ctx = canvas.getContext('2d');
    canvas.chart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderWidth: 3,
                borderColor: '#fff',
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        padding: 16,
                        font: { size: 13 },
                        color: '#4A4A4A',
                        usePointStyle: true,
                        pointStyle: 'circle',
                        generateLabels: function(chart) {
                            const data = chart.data;
                            const total = data.datasets[0].data.reduce((a, b) => a + b, 0);
                            return data.labels.map((label, i) => {
                                const value = data.datasets[0].data[i];
                                const percentage = ((value / total) * 100).toFixed(1);
                                return {
                                    text: `${label}: ${value} (${percentage}%)`,
                                    fillStyle: data.datasets[0].backgroundColor[i],
                                    hidden: false,
                                    index: i
                                };
                            });
                        }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleFont: { size: 14, weight: '600' },
                    bodyFont: { size: 13 },
                    padding: 12,
                    cornerRadius: 8,
                    callbacks: {
                        label: function(context) {
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((context.parsed / total) * 100).toFixed(1);
                            return `${context.label}: ${context.parsed} (${percentage}%)`;
                        }
                    }
                }
            },
            cutout: '70%'
        }
    });
}

// Status breakdown bar chart
function displayStatusBreakdownChartJS() {
    const canvas = document.getElementById('statusBreakdownChart');
    if (!canvas) return;
    
    if (canvas.chart) {
        canvas.chart.destroy();
    }
    
    const statusCounts = {
        pending: 0,
        confirmed: 0,
        completed: 0,
        cancelled: 0
    };
    
    appointments.forEach(a => {
        if (statusCounts.hasOwnProperty(a.status)) {
            statusCounts[a.status]++;
        }
    });
    
    const labels = ['Pending', 'Confirmed', 'Completed', 'Cancelled'];
    const data = [statusCounts.pending, statusCounts.confirmed, statusCounts.completed, statusCounts.cancelled];
    const colors = ['#ffc107', '#17a2b8', '#28a745', '#dc3545'];
    
    const ctx = canvas.getContext('2d');
    canvas.chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Count',
                data: data,
                backgroundColor: colors,
                borderRadius: 8,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleFont: { size: 14, weight: '600' },
                    bodyFont: { size: 13 },
                    padding: 12,
                    cornerRadius: 8,
                    callbacks: {
                        label: function(context) {
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((context.parsed.y / total) * 100).toFixed(1);
                            return `${context.parsed.y} appointments (${percentage}%)`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        precision: 0,
                        font: { size: 12 },
                        color: '#7A7A7A'
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)',
                        drawBorder: false
                    }
                },
                x: {
                    ticks: {
                        font: { size: 12 },
                        color: '#7A7A7A'
                    },
                    grid: {
                        display: false,
                        drawBorder: false
                    }
                }
            }
        }
    });
}

// Weekly activity chart
function displayWeeklyActivityChart() {
    const canvas = document.getElementById('weeklyActivityChart');
    if (!canvas) return;
    
    if (canvas.chart) {
        canvas.chart.destroy();
    }
    
    const dayCount = {
        0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0
    };
    
    appointments.forEach(a => {
        const date = a.createdAt?.toDate();
        if (date) {
            dayCount[date.getDay()]++;
        }
    });
    
    const labels = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const data = [dayCount[0], dayCount[1], dayCount[2], dayCount[3], dayCount[4], dayCount[5], dayCount[6]];
    
    const ctx = canvas.getContext('2d');
    canvas.chart = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Appointments',
                data: data,
                borderColor: '#00D084',
                backgroundColor: 'rgba(0, 208, 132, 0.2)',
                borderWidth: 2,
                pointBackgroundColor: '#00D084',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 5,
                pointHoverRadius: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleFont: { size: 14, weight: '600' },
                    bodyFont: { size: 13 },
                    padding: 12,
                    cornerRadius: 8
                }
            },
            scales: {
                r: {
                    beginAtZero: true,
                    ticks: {
                        precision: 0,
                        font: { size: 11 },
                        color: '#7A7A7A'
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    },
                    pointLabels: {
                        font: { size: 12 },
                        color: '#4A4A4A'
                    }
                }
            }
        }
    });
}

// Time distribution chart
function displayTimeDistributionChart() {
    const canvas = document.getElementById('timeDistributionChart');
    if (!canvas) return;
    
    if (canvas.chart) {
        canvas.chart.destroy();
    }
    
    const hourCount = Array(24).fill(0);
    
    appointments.forEach(a => {
        const date = a.createdAt?.toDate();
        if (date) {
            hourCount[date.getHours()]++;
        }
    });
    
    const labels = [];
    for (let i = 0; i < 24; i++) {
        const hour = i === 0 ? '12 AM' : i < 12 ? `${i} AM` : i === 12 ? '12 PM' : `${i - 12} PM`;
        labels.push(hour);
    }
    
    const ctx = canvas.getContext('2d');
    canvas.chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Appointments',
                data: hourCount,
                backgroundColor: function(context) {
                    const value = context.parsed.y;
                    const max = Math.max(...hourCount);
                    const opacity = value === 0 ? 0.1 : 0.3 + (value / max) * 0.7;
                    return `rgba(0, 208, 132, ${opacity})`;
                },
                borderColor: '#00D084',
                borderWidth: 1,
                borderRadius: 6,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleFont: { size: 14, weight: '600' },
                    bodyFont: { size: 13 },
                    padding: 12,
                    cornerRadius: 8,
                    callbacks: {
                        label: function(context) {
                            return `${context.parsed.y} appointment${context.parsed.y !== 1 ? 's' : ''}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        precision: 0,
                        font: { size: 11 },
                        color: '#7A7A7A'
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)',
                        drawBorder: false
                    }
                },
                x: {
                    ticks: {
                        font: { size: 10 },
                        color: '#7A7A7A',
                        maxRotation: 45,
                        minRotation: 45
                    },
                    grid: {
                        display: false,
                        drawBorder: false
                    }
                }
            }
        }
    });
}


// Format service name
function formatService(service) {
    const services = {
        'architectural-design': 'Architectural Design',
        'building-interiors': 'Building Architectural Interiors',
        'interior-construction': 'Architectural Interior Construction',
        'structural-inspection': 'Structural Inspection',
        'electrical-engineering': 'Electrical Engineering Services',
        'cad-operations': 'CAD & Operations',
        'consultation': 'General Consultation'
    };
    return services[service] || service;
}

// Real-time updates
db.collection('appointments').onSnapshot(() => {
    loadData();
    
    // Refresh analytics if on analytics view
    if (currentView === 'analytics') {
        displayAnalytics();
    }
});

console.log('✅ Admin Dashboard Loaded Successfully');
console.log('📊 Advanced Analytics Charts Enabled');
// ── Mobile Sidebar ────────────────────────────────────────
function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const isOpen  = sidebar.classList.contains('mobile-open');
    if (isOpen) {
        sidebar.classList.remove('mobile-open');
        overlay.classList.remove('active');
        document.body.style.overflow = '';
    } else {
        sidebar.classList.add('mobile-open');
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeSidebar() {
    document.querySelector('.sidebar')?.classList.remove('mobile-open');
    document.getElementById('sidebarOverlay')?.classList.remove('active');
    document.body.style.overflow = '';
}

// Close sidebar when a nav item is clicked on mobile
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
        if (window.innerWidth <= 768) closeSidebar();
    });
});