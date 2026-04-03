// ═══════════════════════════════════════════════════════════════════════════
// 🏗️ CONSTRUCTION MANAGEMENT MODULE - MULTI-ITEM VERSION
// ═══════════════════════════════════════════════════════════════════════════
// Updated to handle requests with multiple items (Flutter app structure)
// ═══════════════════════════════════════════════════════════════════════════

let currentBatchData = null;
let urgentRequestsData = [];
let inventoryData = [];
let notificationsData = [];
let currentEditingRequest = null;

<<<<<<< HEAD
function _consEsc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

=======
>>>>>>> f75981c5053db8cd901b052df2a28c208b2225af
// ═══════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

function initConstructionModule(view) {
    console.log('🏗️ Initializing Construction Module:', view);
    
    if (view === 'consBatch') {
        loadCurrentBatch();
    } else if (view === 'consUrgent') {
        loadUrgentRequests();
    } else if (view === 'consBatchHistory') {
        loadBatchHistory();
    } else if (view === 'consInventory') {
        loadInventory();
    }
    
    // Load notifications for bell icon
    loadNotifications();
}

// ═══════════════════════════════════════════════════════════════════════════
// CURRENT BATCH VIEW
// ═══════════════════════════════════════════════════════════════════════════

function loadCurrentBatch() {
    const container = document.getElementById('currentBatchContainer');
    if (!container) return;
    
    container.innerHTML = '<div class="cons-loading">Loading current batch...</div>';
    
    // Get the next open batch
    db.collection('batches')
        .where('status', '==', 'open')
        .orderBy('deliveryDate', 'asc')
        .limit(1)
        .get()
        .then(snapshot => {
            if (snapshot.empty) {
                container.innerHTML = `
                    <div class="cons-empty-state">
                        <div class="cons-empty-icon">📦</div>
                        <h3>No Active Batch</h3>
                        <p>Create a new batch to start accepting requests</p>
                        <button class="cons-btn cons-btn-primary" onclick="showCreateBatchModal()">
                            <i data-lucide="plus"></i> Create Batch
                        </button>
                    </div>`;
                refreshIcons();
                return;
            }
            
            const batchDoc = snapshot.docs[0];
            currentBatchData = { id: batchDoc.id, ...batchDoc.data() };
            
            // Load requests for this batch
            db.collection('requests')
                .where('batchId', '==', currentBatchData.id)
                .orderBy('createdAt', 'desc')
                .onSnapshot(requestsSnapshot => {
                    renderCurrentBatch(requestsSnapshot.docs);
                });
        })
        .catch(error => {
            console.error('Error loading batch:', error);
            container.innerHTML = '<div class="cons-error">Error loading batch</div>';
        });
}

function renderCurrentBatch(requestDocs) {
    const container = document.getElementById('currentBatchContainer');
    if (!container) return;
    
    const requests = requestDocs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // Batch header
    const deliveryDate = currentBatchData.deliveryDate?.toDate();
    const cutoffDate = currentBatchData.cutoffDate?.toDate();
    const daysUntilDelivery = deliveryDate ? Math.ceil((deliveryDate - new Date()) / (1000 * 60 * 60 * 24)) : 0;
    
    // Calculate totals (count individual items, not requests)
    let totalItems = 0;
    let pendingItems = 0;
    let purchasedItems = 0;
    let deliveredItems = 0;
    
    requests.forEach(request => {
        const items = request.items || [];
        totalItems += items.length;
        items.forEach(item => {
            if (item.status === 'pending') pendingItems++;
            else if (item.status === 'purchased') purchasedItems++;
            else if (item.status === 'delivered') deliveredItems++;
        });
    });
    
    let html = `
        <div class="cons-batch-header">
            <div class="cons-batch-info">
                <h2>Current Batch</h2>
                <div class="cons-batch-meta">
                    <span class="cons-batch-date">
                        <i data-lucide="calendar"></i>
                        Delivery: ${deliveryDate ? deliveryDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 'TBD'}
                    </span>
                    <span class="cons-batch-countdown ${daysUntilDelivery <= 1 ? 'urgent' : ''}">
                        <i data-lucide="clock"></i>
                        ${daysUntilDelivery} days until delivery
                    </span>
                    <span class="cons-batch-cutoff">
                        Cutoff: ${cutoffDate ? cutoffDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'TBD'}
                    </span>
                </div>
            </div>
            <div class="cons-batch-actions">
                <button class="cons-btn cons-btn-secondary" onclick="showCloseBatchModal()">
                    <i data-lucide="lock"></i> Close Batch
                </button>
            </div>
        </div>
        
        <div class="cons-stats-grid">
            <div class="cons-stat-card">
                <div class="cons-stat-icon" style="background: #FEF3C7;"><i data-lucide="inbox" style="color: #D97706;"></i></div>
                <div class="cons-stat-info">
                    <h3>${pendingItems}</h3>
                    <p>Pending Items</p>
                </div>
            </div>
            <div class="cons-stat-card">
                <div class="cons-stat-icon" style="background: #DBEAFE;"><i data-lucide="shopping-cart" style="color: #2563EB;"></i></div>
                <div class="cons-stat-info">
                    <h3>${purchasedItems}</h3>
                    <p>Purchased Items</p>
                </div>
            </div>
            <div class="cons-stat-card">
                <div class="cons-stat-icon" style="background: #D1FAE5;"><i data-lucide="check-circle" style="color: #059669;"></i></div>
                <div class="cons-stat-info">
                    <h3>${deliveredItems}</h3>
                    <p>Delivered Items</p>
                </div>
            </div>
            <div class="cons-stat-card">
                <div class="cons-stat-icon" style="background: #F3F4F6;"><i data-lucide="package" style="color: #6B7280;"></i></div>
                <div class="cons-stat-info">
                    <h3>${totalItems}</h3>
                    <p>Total Items</p>
                </div>
            </div>
        </div>
    `;
    
    // Requests table
    if (requests.length === 0) {
        html += `
            <div class="section-card">
                <div class="cons-empty-state">
                    <div class="cons-empty-icon">📋</div>
                    <h3>No Requests Yet</h3>
                    <p>Workers haven't submitted any requests for this batch</p>
                </div>
            </div>`;
    } else {
        html += `
            <div class="section-card">
                <div class="cons-table-controls">
                    <input type="text" id="consSearchInput" class="cons-search-input" placeholder="Search by item, worker, or status..." onkeyup="filterBatchRequests()">
                    <select id="consStatusFilter" class="cons-filter-select" onchange="filterBatchRequests()">
                        <option value="all">All Status</option>
                        <option value="pending">Pending</option>
                        <option value="partial">Partial</option>
                        <option value="purchased">Purchased</option>
                        <option value="delivered">Delivered</option>
                    </select>
                </div>
                <div class="cons-requests-container">`;
        
        requests.forEach(request => {
            html += renderRequestCard(request);
        });
        
        html += `
                </div>
            </div>`;
    }
    
    container.innerHTML = html;
    refreshIcons();
}

function renderRequestCard(request) {
    const items = request.items || [];
    const urgentBadge = request.isUrgent ? '<span class="cons-urgent-badge">🔥 Urgent</span>' : '';
    const statusClass = `cons-status-${request.status}`;
    
    let html = `
        <div class="cons-request-card" data-request-id="${request.id}" data-status="${request.status}">
            <div class="cons-request-header">
                <div class="cons-request-info">
                    <div class="cons-request-worker">
                        <i data-lucide="user"></i>
                        <strong>${request.workerName}</strong>
                    </div>
                    <div class="cons-request-date">
                        <i data-lucide="calendar"></i>
                        ${request.createdAt?.toDate().toLocaleDateString() || 'N/A'}
                    </div>
                </div>
                <div class="cons-request-badges">
                    ${urgentBadge}
                    <span class="cons-status-badge ${statusClass}">${request.status.toUpperCase()}</span>
                </div>
            </div>
            
            <div class="cons-request-items">
                <div class="cons-items-header">
                    <strong>${items.length} item${items.length !== 1 ? 's' : ''} in this request</strong>
                </div>`;
    
    items.forEach((item) => {
        const itemStatusClass = `cons-status-${item.status}`;
        const imageThumb = item.imageUrl 
            ? `<img src="${item.imageUrl}" alt="${item.name}" class="cons-item-image" onclick="openImageModal('${item.imageUrl}', '${item.name}')">` 
            : '<div class="cons-item-image-placeholder"><i data-lucide="image-off"></i></div>';
        
        html += `
            <div class="cons-item-row">
                ${imageThumb}
                <div class="cons-item-details">
                    <div class="cons-item-name">${item.name}</div>
                    <div class="cons-item-qty">${item.quantity} ${item.unit}</div>
                    ${item.notes ? `<div class="cons-item-notes">${item.notes}</div>` : ''}
                </div>
                <div class="cons-item-actions">
                    <span class="cons-status-badge ${itemStatusClass}">${item.status}</span>
                    ${item.status === 'pending' ? `
                        <button class="cons-btn-icon" onclick="updateItemStatus('${request.id}', '${item.id}', 'purchased')" title="Mark as Purchased">
                            <i data-lucide="shopping-cart"></i>
                        </button>` : ''}
                    ${item.status === 'purchased' ? `
                        <button class="cons-btn-icon" onclick="updateItemStatus('${request.id}', '${item.id}', 'delivered')" title="Mark as Delivered">
                            <i data-lucide="check-circle"></i>
                        </button>` : ''}
                    ${item.status === 'delivered' ? `
                        <div class="cons-delivered-icon"><i data-lucide="check-circle-2"></i></div>` : ''}
                </div>
            </div>`;
    });
    
    html += `
            </div>
            <div class="cons-request-footer">
                <button class="cons-btn cons-btn-sm cons-btn-secondary" onclick="viewRequestDetails('${request.id}')">
                    <i data-lucide="eye"></i> View Full Details
                </button>
            </div>
        </div>`;
    
    return html;
}

function filterBatchRequests() {
    const searchTerm = document.getElementById('consSearchInput')?.value.toLowerCase() || '';
    const statusFilter = document.getElementById('consStatusFilter')?.value || 'all';
    const cards = document.querySelectorAll('.cons-request-card');
    
    cards.forEach(card => {
        const text = card.textContent.toLowerCase();
        const status = card.dataset.status;
        
        const matchesSearch = text.includes(searchTerm);
        const matchesStatus = statusFilter === 'all' || status === statusFilter;
        
        card.style.display = (matchesSearch && matchesStatus) ? '' : 'none';
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// ITEM STATUS UPDATES
// ═══════════════════════════════════════════════════════════════════════════

function updateItemStatus(requestId, itemId, newStatus) {
    if (!confirm(`Mark this item as ${newStatus}?`)) return;
    
    db.collection('requests').doc(requestId).get()
        .then(doc => {
            if (!doc.exists) {
                showConsNotification('Request not found', 'error');
                return;
            }
            
            const request = doc.data();
            const items = request.items || [];
            
            // Update the specific item
            const updatedItems = items.map(item => {
                if (item.id === itemId) {
                    const updatedItem = { ...item, status: newStatus };
                    
                    if (newStatus === 'purchased' && item.status === 'pending') {
                        updatedItem.purchasedDate = firebase.firestore.Timestamp.now();
                    } else if (newStatus === 'delivered') {
                        if (!item.purchasedDate) {
                            updatedItem.purchasedDate = firebase.firestore.Timestamp.now();
                        }
                        updatedItem.deliveredDate = firebase.firestore.Timestamp.now();
                    } else if (newStatus === 'pending') {
                        delete updatedItem.purchasedDate;
                        delete updatedItem.deliveredDate;
                    }
                    
                    return updatedItem;
                }
                return item;
            });
            
            // Calculate overall status
            const allDelivered = updatedItems.every(item => item.status === 'delivered');
            const allPurchased = updatedItems.every(item => item.status === 'purchased' || item.status === 'delivered');
            const somePurchased = updatedItems.some(item => item.status === 'purchased' || item.status === 'delivered');
            
            let overallStatus = 'pending';
            if (allDelivered) {
                overallStatus = 'delivered';
            } else if (allPurchased) {
                overallStatus = 'purchased';
            } else if (somePurchased) {
                overallStatus = 'partial';
            }
            
            const isEditable = updatedItems.every(item => item.status === 'pending');
            
            // Update in Firestore
            return db.collection('requests').doc(requestId).update({
                items: updatedItems,
                status: overallStatus,
                isEditable: isEditable,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        })
        .then(() => {
            showConsNotification(`Item marked as ${newStatus}!`, 'success');
            
            // If delivered, update inventory
            if (newStatus === 'delivered') {
                db.collection('requests').doc(requestId).get().then(doc => {
                    const request = doc.data();
                    const item = request.items.find(i => i.id === itemId);
                    if (item) {
                        updateInventoryAfterDelivery(item);
                    }
                });
            }
        })
        .catch(error => {
            console.error('Error updating item status:', error);
            showConsNotification('Failed to update status', 'error');
        });
}

function updateInventoryAfterDelivery(item) {
    // Check if item exists in inventory
    db.collection('inventory')
        .where('itemName', '==', item.name)
        .limit(1)
        .get()
        .then(snapshot => {
            if (snapshot.empty) {
                // Create new inventory item
                db.collection('inventory').add({
                    itemName: item.name,
                    unit: item.unit,
                    currentStock: item.quantity,
                    lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
                    lastAdjustedBy: auth.currentUser.uid,
                    notes: 'Auto-added from delivered item'
                });
            } else {
                // Update existing item
                const itemDoc = snapshot.docs[0];
                const currentStock = itemDoc.data().currentStock || 0;
                
                db.collection('inventory').doc(itemDoc.id).update({
                    currentStock: currentStock + item.quantity,
                    lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
                    lastAdjustedBy: auth.currentUser.uid
                });
            }
        });
}

// ═══════════════════════════════════════════════════════════════════════════
// URGENT REQUESTS VIEW
// ═══════════════════════════════════════════════════════════════════════════

function loadUrgentRequests() {
    const container = document.getElementById('urgentRequestsContainer');
    if (!container) return;
    
    container.innerHTML = '<div class="cons-loading">Loading urgent requests...</div>';
    
    db.collection('requests')
        .where('isUrgent', '==', true)
        .orderBy('createdAt', 'desc')
        .onSnapshot(snapshot => {
            urgentRequestsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderUrgentRequests();
        });
}

function renderUrgentRequests() {
    const container = document.getElementById('urgentRequestsContainer');
    if (!container) return;
    
    const activeUrgent = urgentRequestsData.filter(r => r.status !== 'delivered');
    const resolvedUrgent = urgentRequestsData.filter(r => r.status === 'delivered');
    
    let html = `
        <div class="cons-urgent-header">
            <h2>🔥 Urgent Requests</h2>
            <div class="cons-urgent-stats">
                <span class="cons-urgent-count">${activeUrgent.length} Active</span>
                <span class="cons-urgent-resolved">${resolvedUrgent.length} Resolved</span>
            </div>
        </div>`;
    
    if (activeUrgent.length === 0 && resolvedUrgent.length === 0) {
        html += `
            <div class="section-card">
                <div class="cons-empty-state">
                    <div class="cons-empty-icon">✅</div>
                    <h3>No Urgent Requests</h3>
                    <p>All caught up! No urgent items at the moment.</p>
                </div>
            </div>`;
    } else {
        // Active urgent requests
        if (activeUrgent.length > 0) {
            html += `<div class="section-card"><h3 class="cons-section-title">Active Urgent Requests</h3>`;
            activeUrgent.forEach(request => {
                html += renderRequestCard(request);
            });
            html += `</div>`;
        }
        
        // Resolved urgent requests
        if (resolvedUrgent.length > 0) {
            html += `<div class="section-card" style="margin-top: 1.5rem;"><h3 class="cons-section-title">Resolved Urgent Requests</h3>`;
            resolvedUrgent.forEach(request => {
                html += renderRequestCard(request);
            });
            html += `</div>`;
        }
    }
    
    container.innerHTML = html;
    refreshIcons();
}

// ═══════════════════════════════════════════════════════════════════════════
// INVENTORY, NOTIFICATIONS, MODALS (Keep existing code)
// ═══════════════════════════════════════════════════════════════════════════

function loadInventory() {
    const container = document.getElementById('inventoryContainer');
    if (!container) return;
    
    container.innerHTML = '<div class="cons-loading">Loading inventory...</div>';
    
    db.collection('inventory')
        .orderBy('itemName', 'asc')
        .onSnapshot(snapshot => {
            inventoryData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderInventory();
        });
}

function renderInventory() {
    const container = document.getElementById('inventoryContainer');
    if (!container) return;
    
    let html = `
        <div class="cons-inventory-header">
            <h2>📦 Inventory Management</h2>
            <button class="cons-btn cons-btn-primary" onclick="showAddInventoryModal()">
                <i data-lucide="plus"></i> Add Item
            </button>
        </div>`;
    
    if (inventoryData.length === 0) {
        html += `
            <div class="section-card">
                <div class="cons-empty-state">
                    <div class="cons-empty-icon">📦</div>
                    <h3>Inventory Empty</h3>
                    <p>Start tracking your construction materials</p>
                </div>
            </div>`;
    } else {
        html += `
            <div class="section-card">
                <div class="cons-table-container">
                    <table class="cons-table">
                        <thead>
                            <tr>
                                <th>Item Name</th>
                                <th>Current Stock</th>
                                <th>Unit</th>
                                <th>Last Updated</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>`;
        
        inventoryData.forEach(item => {
            const lastUpdated = item.lastUpdated?.toDate();
            const stock = item.currentStock || 0;
            const minStock = item.minStock || 0;
            let stockClass = '';
            let stockLabel = '';
            if (stock <= 0) {
                stockClass = 'cons-stock-low';
                stockLabel = ' <span style="font-size:0.75rem;color:#DC2626;">OUT</span>';
            } else if (minStock > 0 && stock <= minStock) {
                stockClass = 'cons-stock-warning';
                stockLabel = ' <span style="font-size:0.75rem;color:#D97706;">LOW</span>';
            }

            html += `
                <tr>
                    <td>
                        <strong>${item.itemName}</strong>
                        ${item.notes ? `<div style="font-size:0.8rem;color:#9CA3AF;margin-top:2px;">${item.notes}</div>` : ''}
                    </td>
                    <td><span class="cons-stock-value ${stockClass}">${stock}${stockLabel}</span></td>
                    <td>${item.unit}</td>
                    <td>${lastUpdated ? lastUpdated.toLocaleDateString() : 'N/A'}</td>
                    <td>
                        <div class="cons-action-buttons">
                            <button class="cons-btn-icon" onclick="showAdjustStockModal('${item.id}')" title="Adjust Stock">
                                <i data-lucide="edit-3"></i>
                            </button>
                            <button class="cons-btn-icon cons-btn-icon-danger" onclick="deleteInventoryItem('${item.id}')" title="Delete">
                                <i data-lucide="trash-2"></i>
                            </button>
                        </div>
                    </td>
                </tr>`;
        });
        
        html += `
                        </tbody>
                    </table>
                </div>
            </div>`;
    }
    
    container.innerHTML = html;
    refreshIcons();
}

function loadBatchHistory() {
    const container = document.getElementById('batchHistoryContainer');
    if (!container) return;
    
    container.innerHTML = '<div class="cons-loading">Loading batch history...</div>';
    
    db.collection('batches')
        .where('status', 'in', ['closed', 'delivered'])
        .orderBy('deliveryDate', 'desc')
        .limit(20)
        .get()
        .then(snapshot => {
            const batches = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderBatchHistory(batches);
        });
}

function renderBatchHistory(batches) {
    const container = document.getElementById('batchHistoryContainer');
    if (!container) return;
    
    let html = '<h2>📅 Batch History</h2>';
    
    if (batches.length === 0) {
        html += `
            <div class="section-card">
                <div class="cons-empty-state">
                    <div class="cons-empty-icon">📅</div>
                    <h3>No Completed Batches</h3>
                    <p>Past batches will appear here</p>
                </div>
            </div>`;
    } else {
        batches.forEach(batch => {
            const deliveryDate = batch.deliveryDate?.toDate();
            
            html += `
                <div class="cons-batch-history-card section-card">
                    <div class="cons-batch-history-header">
                        <div>
                            <h3>Batch: ${deliveryDate ? deliveryDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown'}</h3>
                            <span class="cons-status-badge cons-status-${batch.status}">${batch.status.toUpperCase()}</span>
                        </div>
                        <button class="cons-btn cons-btn-secondary cons-btn-sm" onclick="viewBatchDetails('${batch.id}')">
                            <i data-lucide="eye"></i> View Details
                        </button>
                    </div>
                    <p class="cons-batch-history-info">
                        <i data-lucide="package"></i> ${batch.totalItems || 0} items
                    </p>
                </div>`;
        });
    }
    
    container.innerHTML = html;
    refreshIcons();
}

function loadNotifications() {
    if (!auth.currentUser) return;
<<<<<<< HEAD

=======
    
>>>>>>> f75981c5053db8cd901b052df2a28c208b2225af
    db.collection('notifications')
        .doc(auth.currentUser.uid)
        .collection('items')
        .orderBy('createdAt', 'desc')
<<<<<<< HEAD
        .limit(30)
=======
        .limit(10)
>>>>>>> f75981c5053db8cd901b052df2a28c208b2225af
        .onSnapshot(snapshot => {
            notificationsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            updateNotificationBell();
        });
}

function updateNotificationBell() {
    const bell = document.getElementById('consNotificationBell');
    const badge = document.getElementById('consNotificationBadge');
    
    if (!bell || !badge) return;
    
    const unreadCount = notificationsData.filter(n => !n.isRead).length;
    
    if (unreadCount > 0) {
        badge.textContent = unreadCount;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}

<<<<<<< HEAD
function toggleNotificationDropdown(e) {
    if (e) e.stopPropagation();
    const dropdown = document.getElementById('consNotificationDropdown');
    if (!dropdown) return;

    if (dropdown.classList.contains('show')) {
        dropdown.classList.remove('show');
    } else {
        renderNotificationDropdown();
        dropdown.classList.add('show');
    }
}

const _NOTIF_META = {
    'payment_submitted': { icon: 'credit-card',   label: 'Payment Submitted',         color: 'blue',  dest: 'payment' },
    'partial_request':   { icon: 'git-branch',    label: 'Partial Payment Request',   color: 'amber', dest: 'payment' },
    'payment_request':   { icon: 'file-text',     label: 'New Payment Request',       color: 'blue',  dest: 'payment' },
    'payment_verified':  { icon: 'check-circle',  label: 'Payment Verified',          color: 'green', dest: 'payment' },
    'payment_rejected':  { icon: 'x-circle',      label: 'Payment Rejected',          color: 'red',   dest: 'payment' },
    'partial_approved':  { icon: 'check-circle',  label: 'Partial Payment Approved',  color: 'green', dest: 'payment' },
    'partial_declined':  { icon: 'x-circle',      label: 'Partial Payment Declined',  color: 'red',   dest: 'payment' },
    'report_approved':   { icon: 'check-circle',  label: 'Report Approved',           color: 'green', dest: 'boq'     },
    'report_submitted':  { icon: 'file',          label: 'Report Submitted',          color: 'blue',  dest: 'boq'     },
    'report_updated':    { icon: 'edit',          label: 'Report Updated',            color: 'blue',  dest: 'boq'     },
    'new_request':       { icon: 'inbox',         label: 'New Request',               color: 'blue',  dest: 'request' },
    'urgent_request':    { icon: 'alert-circle',  label: 'Urgent Request',            color: 'red',   dest: 'request' },
};

function renderNotificationDropdown() {
    const dropdown = document.getElementById('consNotificationDropdown');
    if (!dropdown) return;

    const hasUnread = notificationsData.some(n => !n.isRead);
    let html = `
        <div class="cons-notif-header">
            <span>Notifications</span>
            ${hasUnread ? `<button class="cons-notif-mark-all" onclick="consMarkAllNotificationsRead(event)">Mark all read</button>` : ''}
        </div>`;

    if (notificationsData.length === 0) {
        html += `
            <div class="cons-notif-empty">
                <i data-lucide="bell-off" style="width:32px;height:32px;margin-bottom:8px;opacity:0.35;"></i>
                <div>No notifications yet</div>
            </div>`;
    } else {
        notificationsData.forEach(notif => {
            const meta      = _NOTIF_META[notif.type] || { icon: 'bell', label: 'Notification', color: 'blue', dest: '' };
            const createdAt = notif.createdAt?.toDate();
            const timeAgo   = createdAt ? getTimeAgo(createdAt) : 'Just now';
            const safeId    = (notif.id      || '').replace(/'/g, '');
            const safeRel   = (notif.relatedId || '').replace(/'/g, '');
            const safeType  = (notif.type    || '').replace(/'/g, '');

            html += `
                <div class="cons-notif-item cons-notif-color-${meta.color} ${notif.isRead ? '' : 'unread'}"
                     onclick="handleNotificationClick(event,'${safeId}','${safeRel}','${safeType}')">
                    <div class="cons-notif-icon-wrap cons-notif-icon-${meta.color}">
                        <i data-lucide="${meta.icon}"></i>
                    </div>
                    <div class="cons-notif-content">
                        <div class="cons-notif-label">${meta.label}</div>
                        <div class="cons-notif-msg">${_consEsc(notif.message)}</div>
                        <div class="cons-notif-time">${timeAgo}</div>
                    </div>
                    <div class="cons-notif-arrow">
                        ${notif.isRead ? '' : '<span class="cons-notif-dot"></span>'}
                        <i data-lucide="chevron-right" class="cons-notif-chevron"></i>
=======
function toggleNotificationDropdown() {
    const dropdown = document.getElementById('consNotificationDropdown');
    if (!dropdown) return;
    
    dropdown.classList.toggle('show');
    
    if (dropdown.classList.contains('show')) {
        renderNotificationDropdown();
    }
}

function renderNotificationDropdown() {
    const dropdown = document.getElementById('consNotificationDropdown');
    if (!dropdown) return;
    
    let html = '<div class="cons-notif-header">Notifications</div>';
    
    if (notificationsData.length === 0) {
        html += '<div class="cons-notif-empty">No notifications</div>';
    } else {
        notificationsData.forEach(notif => {
            const createdAt = notif.createdAt?.toDate();
            const timeAgo = createdAt ? getTimeAgo(createdAt) : 'Just now';
            const iconMap = {
                'new_request':       'inbox',
                'urgent_request':    'alert-circle',
                'payment_submitted': 'credit-card',
                'partial_request':   'git-branch',
            };
            
            html += `
                <div class="cons-notif-item ${notif.isRead ? 'read' : 'unread'}" onclick="handleNotificationClick('${notif.id}', '${notif.requestId}')">
                    <div class="cons-notif-icon"><i data-lucide="${iconMap[notif.type] || 'bell'}"></i></div>
                    <div class="cons-notif-content">
                        <p>${notif.message}</p>
                        <span class="cons-notif-time">${timeAgo}</span>
>>>>>>> f75981c5053db8cd901b052df2a28c208b2225af
                    </div>
                </div>`;
        });
    }
<<<<<<< HEAD

=======
    
>>>>>>> f75981c5053db8cd901b052df2a28c208b2225af
    dropdown.innerHTML = html;
    refreshIcons();
}

<<<<<<< HEAD
function handleNotificationClick(event, notifId, relatedId, type) {
    if (event) event.stopPropagation();

    // Mark as read in Firestore
    if (notifId && auth.currentUser) {
        db.collection('notifications')
            .doc(auth.currentUser.uid)
            .collection('items')
            .doc(notifId)
            .update({ isRead: true })
            .catch(e => console.warn('handleNotificationClick mark-read error:', e));
    }

    // Optimistic local update
    const notif = notificationsData.find(n => n.id === notifId);
    if (notif) notif.isRead = true;
    updateNotificationBell();

    // Close dropdown
    document.getElementById('consNotificationDropdown')?.classList.remove('show');

    // Navigate to the specific item
    const meta = _NOTIF_META[type] || {};
    if (typeof switchView !== 'function') return;

    if (meta.dest === 'payment') {
        switchView('paymentRequests');
        if (relatedId) {
            // Wait for the payment requests view to initialize, then open the specific request
            setTimeout(() => {
                if (typeof prViewRequest === 'function') prViewRequest(relatedId);
            }, 450);
        }
    } else if (meta.dest === 'boq') {
        switchView('boqBuilder');
        if (relatedId) {
            // Fetch the BOQ doc to get its folderId, then open that folder
            setTimeout(async () => {
                try {
                    const snap = await db.collection('boqDocuments').doc(relatedId).get();
                    if (snap.exists && typeof boqSelectFolder === 'function') {
                        boqSelectFolder(snap.data().folderId);
                    }
                } catch (e) { console.warn('BOQ notif nav error:', e); }
            }, 450);
        }
    } else if (meta.dest === 'request' && relatedId) {
        viewRequestDetails(relatedId);
    }
}

function consMarkAllNotificationsRead(event) {
    if (event) event.stopPropagation();
    if (!auth.currentUser) return;

    const unread = notificationsData.filter(n => !n.isRead);
    if (!unread.length) return;

    // Optimistic local update
    notificationsData.forEach(n => { n.isRead = true; });
    updateNotificationBell();
    renderNotificationDropdown();

    // Batch persist to Firestore
    const batch = db.batch();
    unread.forEach(n => {
        batch.update(
            db.collection('notifications').doc(auth.currentUser.uid).collection('items').doc(n.id),
            { isRead: true }
        );
    });
    batch.commit().catch(e => console.warn('consMarkAllNotificationsRead batch error:', e));
=======
function handleNotificationClick(notifId, requestId) {
    // Mark as read
    db.collection('notifications')
        .doc(auth.currentUser.uid)
        .collection('items')
        .doc(notifId)
        .update({ isRead: true });
    
    // View request details
    viewRequestDetails(requestId);
    
    // Close dropdown
    document.getElementById('consNotificationDropdown').classList.remove('show');
>>>>>>> f75981c5053db8cd901b052df2a28c208b2225af
}

function getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
    return Math.floor(seconds / 86400) + 'd ago';
}

function viewRequestDetails(requestId) {
    db.collection('requests').doc(requestId).get()
        .then(doc => {
            if (!doc.exists) return;
            const request = { id: doc.id, ...doc.data() };
            showRequestDetailModal(request);
        });
}

function showRequestDetailModal(request) {
    const modal = document.getElementById('consRequestDetailModal');
    if (!modal) {
        console.error('Request detail modal not found');
        return;
    }
    
    const items = request.items || [];
    const statusClass = `cons-status-${request.status}`;
    
    let itemsHtml = '';
    items.forEach(item => {
        const itemStatusClass = `cons-status-${item.status}`;
        const imageDisplay = item.imageUrl 
            ? `<img src="${item.imageUrl}" alt="${item.name}" class="cons-detail-item-image" onclick="openImageModal('${item.imageUrl}', '${item.name}')">` 
            : '<div class="cons-detail-item-image-placeholder"><i data-lucide="image-off"></i></div>';
        
        itemsHtml += `
            <div class="cons-detail-item">
                ${imageDisplay}
                <div class="cons-detail-item-info">
                    <h4>${item.name}</h4>
                    <p class="cons-detail-item-qty">${item.quantity} ${item.unit}</p>
                    ${item.notes ? `<p class="cons-detail-item-notes">${item.notes}</p>` : ''}
                    <span class="cons-status-badge ${itemStatusClass}">${item.status.toUpperCase()}</span>
                </div>
            </div>`;
    });
    
    document.getElementById('consRequestDetailContent').innerHTML = `
        <div class="cons-detail-header">
            <div>
                <h3>Request from ${request.workerName}</h3>
                ${request.isUrgent ? '<span class="cons-urgent-badge">🔥 URGENT</span>' : ''}
            </div>
            <span class="cons-status-badge ${statusClass}">${request.status.toUpperCase()}</span>
        </div>
        <div class="cons-detail-row">
            <span class="cons-detail-label">Created:</span>
            <span class="cons-detail-value">${request.createdAt?.toDate().toLocaleString() || 'N/A'}</span>
        </div>
        <div class="cons-detail-row">
            <span class="cons-detail-label">Total Items:</span>
            <span class="cons-detail-value">${items.length}</span>
        </div>
        <div class="cons-detail-items-section">
            <h4>Items in this request:</h4>
            ${itemsHtml}
        </div>`;
    
    modal.style.display = 'flex';
    refreshIcons();
}

function closeConsModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.style.display = 'none';
}

function openImageModal(imageUrl, title) {
    const modal = document.getElementById('consImageModal');
    if (!modal) return;
    
    document.getElementById('consModalImage').src = imageUrl;
    document.getElementById('consImageModalTitle').textContent = title;
    modal.style.display = 'flex';
}

function showConsNotification(message, type = 'info') {
    const notification = document.getElementById('consNotification');
    if (!notification) return;
    
    notification.textContent = message;
    notification.className = 'cons-notification show ' + type;
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

// Close dropdowns when clicking outside
document.addEventListener('click', function(event) {
    if (!event.target.closest('.cons-notification-bell')) {
        const dropdown = document.getElementById('consNotificationDropdown');
        if (dropdown) dropdown.classList.remove('show');
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// CREATE / CLOSE BATCH
// ═══════════════════════════════════════════════════════════════════════════

function showCreateBatchModal() {
    // Default delivery date to 7 days from now
    const defaultDelivery = new Date();
    defaultDelivery.setDate(defaultDelivery.getDate() + 7);
    const deliveryInput = document.getElementById('batchDeliveryDate');
    if (deliveryInput) deliveryInput.value = defaultDelivery.toISOString().split('T')[0];

    const cutoffInput = document.getElementById('batchCutoffDate');
    if (cutoffInput) cutoffInput.value = '';

    const modal = document.getElementById('consCreateBatchModal');
    if (modal) {
        modal.style.display = 'flex';
        refreshIcons();
    }
}

function createBatch() {
    const deliveryInput = document.getElementById('batchDeliveryDate');
    const cutoffInput = document.getElementById('batchCutoffDate');

    if (!deliveryInput || !deliveryInput.value) {
        showConsNotification('Please select a delivery date', 'error');
        return;
    }

    const deliveryDate = new Date(deliveryInput.value + 'T00:00:00');
    const cutoffDate = cutoffInput && cutoffInput.value ? new Date(cutoffInput.value + 'T00:00:00') : null;

    const batchData = {
        status: 'open',
        deliveryDate: firebase.firestore.Timestamp.fromDate(deliveryDate),
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdBy: auth.currentUser ? auth.currentUser.uid : null,
        totalItems: 0
    };

    if (cutoffDate) {
        batchData.cutoffDate = firebase.firestore.Timestamp.fromDate(cutoffDate);
    }

    db.collection('batches').add(batchData)
        .then(() => {
            showConsNotification('Batch created successfully!', 'success');
            closeConsModal('consCreateBatchModal');
            loadCurrentBatch();
        })
        .catch(error => {
            console.error('Error creating batch:', error);
            showConsNotification('Failed to create batch', 'error');
        });
}

function showCloseBatchModal() {
    const modal = document.getElementById('consCloseBatchModal');
    if (modal) {
        modal.style.display = 'flex';
        refreshIcons();
    }
}

function closeBatch() {
    if (!currentBatchData) {
        showConsNotification('No active batch found', 'error');
        return;
    }

    db.collection('batches').doc(currentBatchData.id).update({
        status: 'closed',
        closedAt: firebase.firestore.FieldValue.serverTimestamp(),
        closedBy: auth.currentUser ? auth.currentUser.uid : null
    })
        .then(() => {
            showConsNotification('Batch closed successfully!', 'success');
            closeConsModal('consCloseBatchModal');
            currentBatchData = null;
            loadCurrentBatch();
        })
        .catch(error => {
            console.error('Error closing batch:', error);
            showConsNotification('Failed to close batch', 'error');
        });
}

// ═══════════════════════════════════════════════════════════════════════════
// INVENTORY MODALS - FULL IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════

function showAddInventoryModal() {
    document.getElementById('invItemName').value = '';
    document.getElementById('invInitialStock').value = '';
    document.getElementById('invUnit').value = '';
    document.getElementById('invMinStock').value = '';
    document.getElementById('invNotes').value = '';

    const modal = document.getElementById('consAddInventoryModal');
    if (modal) { modal.style.display = 'flex'; refreshIcons(); }
}

function saveInventoryItem() {
    const itemName = document.getElementById('invItemName').value.trim();
    const initialStock = parseFloat(document.getElementById('invInitialStock').value) || 0;
    const unit = document.getElementById('invUnit').value;
    const minStock = parseFloat(document.getElementById('invMinStock').value) || 0;
    const notes = document.getElementById('invNotes').value.trim();

    if (!itemName) { showConsNotification('Item name is required', 'error'); return; }
    if (!unit) { showConsNotification('Please select a unit', 'error'); return; }
    if (initialStock < 0) { showConsNotification('Stock cannot be negative', 'error'); return; }

    db.collection('inventory').add({
        itemName,
        unit,
        currentStock: initialStock,
        minStock,
        notes: notes || null,
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
        lastAdjustedBy: auth.currentUser ? auth.currentUser.uid : null,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    })
    .then(() => {
        showConsNotification('Item added to inventory!', 'success');
        closeConsModal('consAddInventoryModal');
    })
    .catch(error => {
        console.error('Error adding inventory item:', error);
        showConsNotification('Failed to add item', 'error');
    });
}

// Track current adjust state
let currentAdjustItemId = null;
let currentAdjType = 'add';

function showAdjustStockModal(itemId) {
    const item = inventoryData.find(i => i.id === itemId);
    if (!item) { showConsNotification('Item not found', 'error'); return; }

    currentAdjustItemId = itemId;
    currentAdjType = 'add';

    document.getElementById('adjItemInfo').innerHTML = `
        <div class="cons-adj-item-name">${item.itemName}</div>
        <div class="cons-adj-current-stock">Current Stock: <strong>${item.currentStock || 0} ${item.unit}</strong></div>`;

    document.getElementById('adjAmount').value = '';
    document.getElementById('adjReason').value = '';
    setAdjType('add');

    const modal = document.getElementById('consAdjustStockModal');
    if (modal) { modal.style.display = 'flex'; refreshIcons(); }
}

function setAdjType(type) {
    currentAdjType = type;
    const addBtn = document.getElementById('adjTypeAdd');
    const deductBtn = document.getElementById('adjTypeDeduct');

    if (type === 'add') {
        addBtn.classList.add('active');
        deductBtn.classList.remove('active');
    } else {
        addBtn.classList.remove('active');
        deductBtn.classList.add('active');
    }
}

function adjustStock() {
    const amount = parseFloat(document.getElementById('adjAmount').value);
    const reason = document.getElementById('adjReason').value.trim();

    if (!amount || amount <= 0) { showConsNotification('Enter a valid amount', 'error'); return; }
    if (!currentAdjustItemId) return;

    const item = inventoryData.find(i => i.id === currentAdjustItemId);
    if (!item) return;

    const currentStock = item.currentStock || 0;
    const newStock = currentAdjType === 'add' ? currentStock + amount : currentStock - amount;

    if (newStock < 0) {
        showConsNotification(`Cannot deduct ${amount} — only ${currentStock} in stock`, 'error');
        return;
    }

    db.collection('inventory').doc(currentAdjustItemId).update({
        currentStock: newStock,
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
        lastAdjustedBy: auth.currentUser ? auth.currentUser.uid : null,
        lastAdjustmentType: currentAdjType,
        lastAdjustmentAmount: amount,
        lastAdjustmentReason: reason || null
    })
    .then(() => {
        showConsNotification(
            `Stock ${currentAdjType === 'add' ? 'increased' : 'reduced'} by ${amount}. New stock: ${newStock}`,
            'success'
        );
        closeConsModal('consAdjustStockModal');
    })
    .catch(error => {
        console.error('Error adjusting stock:', error);
        showConsNotification('Failed to adjust stock', 'error');
    });
}

<<<<<<< HEAD
function deleteInventoryItem(itemId) {
    const item = inventoryData.find(i => i.id === itemId);
    const name = item ? item.itemName : 'this item';
    if (!confirm(`Delete "${name}" from inventory? This cannot be undone.`)) return;
=======
async function deleteInventoryItem(itemId) {
    const item = inventoryData.find(i => i.id === itemId);
    const name = item ? item.itemName : 'this item';
    if (!await showDeleteConfirm(`Delete "${name}" from inventory? This cannot be undone.`)) return;
>>>>>>> f75981c5053db8cd901b052df2a28c208b2225af

    db.collection('inventory').doc(itemId).delete()
        .then(() => showConsNotification('Item deleted from inventory', 'success'))
        .catch(() => showConsNotification('Failed to delete item', 'error'));
}

// ═══════════════════════════════════════════════════════════════════════════
// BATCH DETAILS MODAL
// ═══════════════════════════════════════════════════════════════════════════

function viewBatchDetails(batchId) {
    const content = document.getElementById('batchDetailsContent');
    if (!content) return;

    content.innerHTML = '<div class="cons-loading">Loading batch details...</div>';

    const modal = document.getElementById('consBatchDetailsModal');
    if (modal) modal.style.display = 'flex';

    Promise.all([
        db.collection('batches').doc(batchId).get(),
        db.collection('requests').where('batchId', '==', batchId).orderBy('createdAt', 'desc').get()
    ])
    .then(([batchDoc, requestsSnap]) => {
        if (!batchDoc.exists) {
            content.innerHTML = '<p style="color:#6B7280;">Batch not found.</p>';
            return;
        }

        const batch = { id: batchDoc.id, ...batchDoc.data() };
        const requests = requestsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        const deliveryDate = batch.deliveryDate?.toDate();
        const closedAt = batch.closedAt?.toDate();

        let totalItems = 0;
        let deliveredItems = 0;
        requests.forEach(r => {
            const items = r.items || [];
            totalItems += items.length;
            deliveredItems += items.filter(i => i.status === 'delivered').length;
        });

        let html = `
            <div class="cons-batch-detail-info">
                <div class="cons-detail-row">
                    <span class="cons-detail-label">Delivery Date</span>
                    <span class="cons-detail-value">${deliveryDate ? deliveryDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A'}</span>
                </div>
                <div class="cons-detail-row">
                    <span class="cons-detail-label">Status</span>
                    <span class="cons-status-badge cons-status-${batch.status}">${batch.status.toUpperCase()}</span>
                </div>
                <div class="cons-detail-row">
                    <span class="cons-detail-label">Closed At</span>
                    <span class="cons-detail-value">${closedAt ? closedAt.toLocaleString() : '—'}</span>
                </div>
                <div class="cons-detail-row">
                    <span class="cons-detail-label">Total Requests</span>
                    <span class="cons-detail-value">${requests.length}</span>
                </div>
                <div class="cons-detail-row">
                    <span class="cons-detail-label">Items Delivered</span>
                    <span class="cons-detail-value">${deliveredItems} / ${totalItems}</span>
                </div>
            </div>`;

        if (requests.length > 0) {
            html += `<div class="cons-detail-items-section"><h4>Requests in this batch</h4>`;
            requests.forEach(r => {
                const items = r.items || [];
                const delivCount = items.filter(i => i.status === 'delivered').length;
                html += `
                    <div class="cons-detail-item" style="flex-direction:column;gap:0.5rem;">
                        <div style="display:flex;justify-content:space-between;align-items:center;">
                            <strong>${r.workerName || 'Unknown Worker'}</strong>
                            <span class="cons-status-badge cons-status-${r.status}">${r.status.toUpperCase()}</span>
                        </div>
                        <div style="font-size:0.875rem;color:#6B7280;">
                            ${items.length} item${items.length !== 1 ? 's' : ''} &nbsp;•&nbsp;
                            ${delivCount} delivered &nbsp;•&nbsp;
                            ${r.createdAt?.toDate().toLocaleDateString() || 'N/A'}
                            ${r.isUrgent ? '&nbsp;🔥' : ''}
                        </div>
                    </div>`;
            });
            html += '</div>';
        } else {
            html += `<p style="color:#6B7280;margin-top:1rem;">No requests were submitted for this batch.</p>`;
        }

        content.innerHTML = html;
        refreshIcons();
    })
    .catch(error => {
        console.error('Error loading batch details:', error);
        content.innerHTML = '<p style="color:#DC2626;">Failed to load batch details. Please try again.</p>';
    });
}

console.log('🏗️ Construction Module Loaded (Multi-Item Version)');
