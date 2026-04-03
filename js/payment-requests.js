// ════════════════════════════════════════════════════════════
// PAYMENT REQUESTS MODULE (Admin)
// Manages payment requests for clients.
// ════════════════════════════════════════════════════════════

(function () {
    'use strict';

    let _allRequests = [];
    let _loading     = false;
    let _currentId   = null;   // id in detail modal
    let _qrSettings  = null;   // cached global QR from settings/paymentQR

    // ══════════════════════════════════════════════════════
    // PUBLIC ENTRY POINT
    // ══════════════════════════════════════════════════════

    window.initPaymentRequests = function () {
        if (_loading) return;
        _loadQRSettings();
        _loadRequests();
    };

    // ══════════════════════════════════════════════════════
    // GLOBAL QR SETTINGS
    // ══════════════════════════════════════════════════════

    async function _loadQRSettings() {
        try {
            const snap = await db.collection('settings').doc('paymentQR').get();
            _qrSettings = snap.exists ? snap.data() : {};
            _renderQRSettingsPreview();
        } catch (e) {
            console.warn('PaymentRequests: could not load QR settings', e);
            _qrSettings = {};
        }
    }

    function _renderQRSettingsPreview() {
        const gcashImg  = document.getElementById('prQSGcashCurrent');
        const gcashNone = document.getElementById('prQSGcashNone');
        const bankImg   = document.getElementById('prQSBankCurrent');
        const bankNone  = document.getElementById('prQSBankNone');
        const hasGcash  = !!_qrSettings?.gcashQrBase64;
        const hasBank   = !!_qrSettings?.bankQrBase64;
        if (gcashImg)  { gcashImg.src = _qrSettings?.gcashQrBase64 || ''; gcashImg.style.display = hasGcash ? 'block' : 'none'; }
        if (gcashNone) { gcashNone.style.display = hasGcash ? 'none' : 'block'; }
        if (bankImg)   { bankImg.src  = _qrSettings?.bankQrBase64  || ''; bankImg.style.display  = hasBank  ? 'block' : 'none'; }
        if (bankNone)  { bankNone.style.display  = hasBank  ? 'none' : 'block'; }
    }

    window.prOpenQRSettings = function () {
        const modal = document.getElementById('prQRSettingsModal');
        if (!modal) return;
        // Reset file inputs and new previews
        const gcashFile = document.getElementById('prQSGcashFile');
        const bankFile  = document.getElementById('prQSBankFile');
        if (gcashFile) gcashFile.value = '';
        if (bankFile)  bankFile.value  = '';
        const gcashNew = document.getElementById('prQSGcashNewPreview');
        const bankNew  = document.getElementById('prQSBankNewPreview');
        if (gcashNew) { gcashNew.src = ''; gcashNew.style.display = 'none'; }
        if (bankNew)  { bankNew.src  = ''; bankNew.style.display  = 'none'; }
        const errDiv = document.getElementById('prQSError');
        if (errDiv) { errDiv.style.display = 'none'; errDiv.textContent = ''; }
        _renderQRSettingsPreview();
        modal.style.display = 'flex';
        if (typeof lucide !== 'undefined') lucide.createIcons();
    };

    window.prCloseQRSettings = function () {
        const modal = document.getElementById('prQRSettingsModal');
        if (modal) modal.style.display = 'none';
    };

    window.prPreviewQRNew = function (input, imgId) {
        const file = input.files && input.files[0];
        const img  = document.getElementById(imgId);
        if (!img) return;
        if (file) {
            const reader = new FileReader();
            reader.onload = e => { img.src = e.target.result; img.style.display = 'block'; };
            reader.readAsDataURL(file);
        } else {
            img.src = ''; img.style.display = 'none';
        }
    };

    window.prSaveQRSettings = async function () {
        const btn    = document.getElementById('prQSSaveBtn');
        const errDiv = document.getElementById('prQSError');
        function showErr(msg) { if (errDiv) { errDiv.textContent = msg; errDiv.style.display = 'block'; } }
        function clearErr()   { if (errDiv) { errDiv.style.display = 'none'; errDiv.textContent = ''; } }
        clearErr();

        const gcashFile = document.getElementById('prQSGcashFile')?.files?.[0];
        const bankFile  = document.getElementById('prQSBankFile')?.files?.[0];

        if (!gcashFile && !bankFile) {
            return showErr('Select at least one QR image to update.');
        }

        if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

        try {
            const updates = { updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                              updatedBy: auth.currentUser?.email || '' };
            if (gcashFile) updates.gcashQrBase64 = await _compressToBase64(gcashFile, 500, 0.82);
            if (bankFile)  updates.bankQrBase64  = await _compressToBase64(bankFile,  500, 0.82);

            await db.collection('settings').doc('paymentQR').set(updates, { merge: true });

            // Update cache
            _qrSettings = { ..._qrSettings, ...updates };
            _renderQRSettingsPreview();

            // Reset file inputs
            const gf = document.getElementById('prQSGcashFile');
            const bf = document.getElementById('prQSBankFile');
            if (gf) gf.value = '';
            if (bf) bf.value = '';
            const gn = document.getElementById('prQSGcashNewPreview');
            const bn = document.getElementById('prQSBankNewPreview');
            if (gn) { gn.src = ''; gn.style.display = 'none'; }
            if (bn) { bn.src = ''; bn.style.display = 'none'; }

            prCloseQRSettings();
        } catch (e) {
            console.error('PaymentRequests: save QR error', e);
            showErr('Error saving QR: ' + e.message);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Save QR Codes'; }
        }
    };

    // ══════════════════════════════════════════════════════
    // LOAD FROM FIRESTORE
    // ══════════════════════════════════════════════════════

    async function _loadRequests() {
        _loading = true;
        _showLoading(true);

        try {
            // No composite index needed — use client-side sort
            const snap = await db.collection('paymentRequests').get();
            _allRequests = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
                .sort((a, b) => _tsToMs(b.createdAt) - _tsToMs(a.createdAt));

            _loading = false;
            _showLoading(false);
            _renderStats(_allRequests);
            _renderTable(_allRequests);
        } catch (e) {
            _loading = false;
            _showLoading(false);
            console.error('PaymentRequests: load error', e);
            _showError(e.message);
        }
    }

    // ══════════════════════════════════════════════════════
    // STATS
    // ══════════════════════════════════════════════════════

    function _renderStats(requests) {
        const pending  = requests.filter(r => r.status === 'pending').length;
        const partial  = requests.filter(r => r.status === 'partial_pending').length;
        const submitted = requests.filter(r => r.status === 'submitted').length;
        const verified  = requests.filter(r => r.status === 'verified').length;
        _setText('prPendingCount',   pending);
        _setText('prPartialCount',   partial);
        _setText('prSubmittedCount', submitted);
        _setText('prVerifiedCount',  verified);
        _updateAdminBadge(submitted + partial);
    }

    function _updateAdminBadge(urgentCount) {
        const badge = document.getElementById('pr-admin-badge');
        if (!badge) return;
        if (urgentCount > 0) {
            badge.textContent = urgentCount;
            badge.style.display = 'inline-flex';
        } else {
            badge.style.display = 'none';
        }
    }

    // ══════════════════════════════════════════════════════
    // TABLE
    // ══════════════════════════════════════════════════════

    function _renderTable(requests) {
        const tbody = document.getElementById('prTableBody');
        const wrap  = document.getElementById('prTableWrap');
        const empty = document.getElementById('prEmptyState');
        const load  = document.getElementById('prLoadingState');
        if (!tbody) return;

        if (load) load.style.display = 'none';

        if (!requests.length) {
            if (wrap)  wrap.style.display  = 'none';
            if (empty) empty.style.display = 'flex';
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        if (wrap)  wrap.style.display  = 'block';
        if (empty) empty.style.display = 'none';

        tbody.innerHTML = requests.map(_buildRow).join('');
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    function _buildRow(r) {
        const name     = _esc(r.clientName || _nameFromEmail(r.clientEmail));
        const email    = _esc(r.clientEmail || '');
        const period   = _esc(r.billingPeriod || '—');
        const project  = _esc(r.projectName  || '—');
        const isPartial = r.paidAmount && r.paidAmount < r.amount;
        const amount   = isPartial
            ? `${_formatAmount(r.paidAmount)} <span style="font-size:11px;font-weight:600;color:#d97706;background:#fffbeb;border:1px solid #fde68a;border-radius:99px;padding:1px 7px;">Partial</span><br><span style="font-size:11px;color:#9ca3af;font-weight:400;">of ${_formatAmount(r.amount)}</span>`
            : _formatAmount(r.amount);
        const due      = _formatDate(r.dueDate);
        const statusBadge = _statusBadge(r.status);

        return `
        <tr data-id="${r.id}">
            <td>
                <div class="un-user-cell">
                    <div class="un-avatar un-avatar-client">${(name[0] || 'C').toUpperCase()}</div>
                    <div>
                        <div class="un-user-name">${name}</div>
                        <div class="un-user-email-sub">${email}</div>
                    </div>
                </div>
            </td>
            <td style="font-size:13px;">${period}</td>
            <td style="font-size:13px;">${project}</td>
            <td style="font-weight:600;color:#00a85e;">${amount}</td>
            <td style="font-size:13px;color:#6b7280;">${due}</td>
            <td>${statusBadge}</td>
            <td>
                <div class="un-actions">
                    <button class="un-btn-view" onclick="prViewRequest('${r.id}')">
                        <i data-lucide="eye" style="width:13px;height:13px;"></i> View
                    </button>
                    <button class="un-btn-toggle un-btn-deactivate" onclick="prDeleteRequest('${r.id}')">
                        <i data-lucide="trash-2" style="width:13px;height:13px;"></i> Delete
                    </button>
                </div>
            </td>
        </tr>`;
    }

    // ══════════════════════════════════════════════════════
    // FILTER
    // ══════════════════════════════════════════════════════

    window.prFilterRequests = function () {
        const q      = (document.getElementById('prSearchInput')?.value  || '').toLowerCase().trim();
        const status = (document.getElementById('prStatusFilter')?.value || '');

        const filtered = _allRequests.filter(r => {
            const name    = (r.clientName || _nameFromEmail(r.clientEmail)).toLowerCase();
            const email   = (r.clientEmail  || '').toLowerCase();
            const period  = (r.billingPeriod || '').toLowerCase();
            const project = (r.projectName   || '').toLowerCase();
            const matchQ  = !q || name.includes(q) || email.includes(q) || period.includes(q) || project.includes(q);
            const matchS  = !status || r.status === status;
            return matchQ && matchS;
        });

        _renderTable(filtered);
    };

    // ══════════════════════════════════════════════════════
    // CREATE MODAL
    // ══════════════════════════════════════════════════════

    window.prOpenCreateModal = async function () {
        const modal = document.getElementById('prCreateModal');
        if (!modal) return;

        // Reset form
        const form = document.getElementById('prCreateForm');
        if (form) form.reset();
        const errDiv = document.getElementById('prCreateError');
        if (errDiv) { errDiv.style.display = 'none'; errDiv.textContent = ''; }

        // Load client dropdown
        const select = document.getElementById('prClientSelect');
        if (select) {
            select.innerHTML = '<option value="">Loading clients…</option>';
            try {
                const snap = await db.collection('clientUsers').get();
                const clients = snap.docs.map(doc => {
                    const d = doc.data();
                    const name = ((d.firstName || '') + ' ' + (d.lastName || '')).trim();
                    return { uid: doc.id, name, email: d.email || '' };
                }).sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));

                select.innerHTML = '<option value="">— Select Client —</option>' +
                    clients.map(c => {
                        const label = c.name ? `${_esc(c.name)} — ${_esc(c.email)}` : _esc(c.email || c.uid);
                        return `<option value="${_esc(c.uid)}" data-email="${_esc(c.email)}" data-name="${_esc(c.name)}">${label}</option>`;
                    }).join('');
            } catch (e) {
                select.innerHTML = '<option value="">Error loading clients</option>';
            }
        }

        modal.style.display = 'flex';
        if (typeof lucide !== 'undefined') lucide.createIcons();
    };

    window.prCloseCreateModal = function () {
        const modal = document.getElementById('prCreateModal');
        if (modal) modal.style.display = 'none';
    };

    // ── Submit Create ──
    window.prSubmitCreate = async function () {
        const errDiv = document.getElementById('prCreateError');
        const btn    = document.getElementById('prCreateSubmitBtn');

        function showErr(msg) {
            if (errDiv) { errDiv.textContent = msg; errDiv.style.display = 'block'; }
        }
        function clearErr() {
            if (errDiv) { errDiv.style.display = 'none'; errDiv.textContent = ''; }
        }
        clearErr();

        // Gather values
        const clientSelect = document.getElementById('prClientSelect');
        const selectedOpt  = clientSelect?.options[clientSelect.selectedIndex];
        const clientUid    = clientSelect?.value || '';
        const clientEmail  = selectedOpt?.dataset.email || '';
        const clientName   = selectedOpt?.dataset.name  || '';

        const billingPeriod = (document.getElementById('prBillingPeriod')?.value || '').trim();
        const projectName   = (document.getElementById('prProjectName')?.value   || '').trim();
        const amountRaw     = (document.getElementById('prAmount')?.value         || '').trim();
        const dueDateStr    = (document.getElementById('prDueDate')?.value         || '').trim();
        const notes         = (document.getElementById('prNotes')?.value           || '').trim();

        // Validate
        if (!clientUid)     return showErr('Please select a client.');
        if (!billingPeriod) return showErr('Billing period is required.');
        if (!projectName)   return showErr('Project name is required.');
        if (!amountRaw)     return showErr('Amount is required.');
        const amount = parseFloat(amountRaw.replace(/,/g, ''));
        if (isNaN(amount) || amount <= 0) return showErr('Enter a valid amount.');
        if (!dueDateStr)    return showErr('Due date is required.');

        // Disable button
        if (btn) { btn.disabled = true; btn.textContent = 'Creating…'; }

        try {
            // Create Firestore document (QR codes are global — stored in settings/paymentQR)
            const dueDate   = firebase.firestore.Timestamp.fromDate(new Date(dueDateStr));
            const createdBy = auth.currentUser ? auth.currentUser.email : '';

            const newReqRef = await db.collection('paymentRequests').add({
                clientUid,
                clientEmail,
                clientName,
                billingPeriod,
                projectName,
                amount,
                dueDate,
                notes,
                status:    'pending',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                createdBy,
                ownerUid:  auth.currentUser?.uid || '',
                proofBase64:     null,
                referenceNumber: null,
                submittedAt:     null,
                verifiedAt:      null,
                verifiedBy:      null,
                rejectedReason:  null,
                rejectedAt:      null
            });

            // Notify the client about the new payment request
            if (clientUid) {
                const dueDateLabel = dueDateStr
                    ? new Date(dueDateStr).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
                    : '';
                db.collection('notifications').doc(clientUid).collection('items').add({
                    type:      'payment_request',
                    message:   `New payment request: ${billingPeriod} — ₱${amount.toLocaleString('en-PH')}${dueDateLabel ? ' due ' + dueDateLabel : ''}`,
                    isRead:    false,
                    relatedId: newReqRef.id,
                    createdAt: firebase.firestore.Timestamp.fromDate(new Date())
                }).catch(e => console.warn('Notification error:', e));
            }

            prCloseCreateModal();
            _loadRequests();
            _showToast('Payment request created successfully.');

        } catch (e) {
            console.error('PaymentRequests: create error', e);
            showErr('Error creating request: ' + e.message);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Create Request'; }
        }
    };

    // ══════════════════════════════════════════════════════
    // DELETE REQUEST
    // ══════════════════════════════════════════════════════

    window.prDeleteRequest = async function (id) {
        if (!confirm('Are you sure you want to delete this payment request? This cannot be undone.')) return;
        try {
            await db.collection('paymentRequests').doc(id).delete();
            _allRequests = _allRequests.filter(r => r.id !== id);
            _renderStats(_allRequests);
            prFilterRequests();
        } catch (e) {
            console.error('prDeleteRequest error', e);
            alert('Could not delete payment request. Please try again.');
        }
    };

    // ══════════════════════════════════════════════════════
    // DETAIL MODAL
    // ══════════════════════════════════════════════════════

    window.prViewRequest = function (id) {
        const r = _allRequests.find(x => x.id === id);
        if (!r) return;

        _currentId = id;

        const modal = document.getElementById('prDetailModal');
        const body  = document.getElementById('prDetailBody');
        if (!modal || !body) return;

        const statusBadge    = _statusBadge(r.status);
        const formattedAmt   = _formatAmount(r.amount);
        const createdDate    = _formatDate(r.createdAt);
        const dueDate        = _formatDate(r.dueDate);
        const submittedDate  = r.submittedAt ? _formatDate(r.submittedAt) : '—';
        const verifiedDate   = r.verifiedAt  ? _formatDate(r.verifiedAt)  : '—';

        const hasGcash = !!_qrSettings?.gcashQrBase64;
        const hasBank  = !!_qrSettings?.bankQrBase64;
        const qrSection = (hasGcash || hasBank) ? `
            <div style="display:flex;gap:16px;flex-wrap:wrap;">
                ${hasGcash ? `<div style="text-align:center;">
                    <div style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">GCash</div>
                    <img src="${_esc(_qrSettings.gcashQrBase64)}" alt="GCash QR" style="width:140px;height:140px;object-fit:contain;border-radius:8px;border:1px solid #e5e7eb;">
                </div>` : ''}
                ${hasBank ? `<div style="text-align:center;">
                    <div style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Bank Transfer</div>
                    <img src="${_esc(_qrSettings.bankQrBase64)}" alt="Bank QR" style="width:140px;height:140px;object-fit:contain;border-radius:8px;border:1px solid #e5e7eb;">
                </div>` : ''}
            </div>` : '<p style="color:#9ca3af;font-size:13px;">No global QR codes set. <a href="#" onclick="prCloseDetailModal();prOpenQRSettings();return false;" style="color:#3b82f6;">Set up QR codes →</a></p>';

        const rejectedHtml = (r.status === 'rejected' && r.rejectedReason) ? `
            <div class="pr-rejected-note">
                <strong>Rejection Reason</strong>
                ${_esc(r.rejectedReason)}
            </div>` : '';

        // Proof section — only if submitted or verified
        let proofSection = '';
        if (r.proofBase64) {
            const hasPaidAmount  = r.paidAmount != null && !isNaN(r.paidAmount);
            const isPartial      = hasPaidAmount && Math.abs(r.paidAmount - r.amount) > 0.01;
            const paidAmountHtml = hasPaidAmount ? `
                <div class="pr-detail-row">
                    <span class="pr-detail-label">Amount Paid</span>
                    <span class="pr-detail-value" style="font-weight:700;font-size:15px;color:${isPartial ? '#d97706' : '#00a85e'};">
                        ${_formatAmount(r.paidAmount)}
                        ${isPartial ? `<span style="font-size:12px;font-weight:500;color:#d97706;margin-left:8px;background:#fef3c7;padding:2px 8px;border-radius:20px;">Partial &middot; requested ${_formatAmount(r.amount)}</span>` : ''}
                    </span>
                </div>
                ${isPartial && r.partialReason ? `
                <div class="pr-detail-row" style="background:#fffbeb;border-radius:8px;padding:10px 14px;margin-top:4px;border:1.5px solid #fcd34d;">
                    <span class="pr-detail-label" style="color:#d97706;">Client&rsquo;s Reason</span>
                    <span class="pr-detail-value" style="color:#92400e;font-style:italic;">&ldquo;${_esc(r.partialReason)}&rdquo;</span>
                </div>` : ''}` : '';

            proofSection = `
            <div class="pr-detail-section">
                <div class="pr-detail-section-title">Payment Proof</div>
                ${paidAmountHtml}
                <div class="pr-detail-row">
                    <span class="pr-detail-label">Reference No.</span>
                    <span class="pr-detail-value">${_esc(r.referenceNumber || '—')}</span>
                </div>
                <div class="pr-detail-row">
                    <span class="pr-detail-label">Submitted At</span>
                    <span class="pr-detail-value">${submittedDate}</span>
                </div>
                <div class="pr-detail-row">
                    <span class="pr-detail-label">Receipt</span>
                    <span class="pr-detail-value">
                        <img src="${_esc(r.proofBase64)}" class="pr-receipt-thumb" alt="Receipt"
                             onclick="prOpenReceiptViewer('${_esc(r.proofBase64)}')">
                    </span>
                </div>
            </div>`;
        }

        // Action buttons — inline multi-state (no browser dialogs)
        let actionButtons = '';
        if (r.status === 'submitted') {
            actionButtons = `
            <div class="pr-detail-section" style="margin-top:10px;">
                <div class="pr-detail-section-title">Admin Actions</div>
                <div id="prActionMain" style="display:flex;gap:10px;margin-top:10px;flex-wrap:wrap;">
                    <button class="pr-btn-verify" onclick="prShowVerifyConfirm()">
                        <i data-lucide="check-circle" style="width:15px;height:15px;"></i> Mark as Paid
                    </button>
                    <button class="pr-btn-reject" onclick="prShowRejectInput()">
                        <i data-lucide="x-circle" style="width:15px;height:15px;"></i> Reject
                    </button>
                    <button class="pr-btn-delete" onclick="prShowDeleteConfirm()">
                        <i data-lucide="trash-2" style="width:15px;height:15px;"></i> Delete
                    </button>
                </div>
                <div id="prVerifyConfirm" style="display:none;margin-top:14px;background:#f0fdf9;border:1.5px solid #6ee7b7;border-radius:10px;padding:14px;">
                    <p style="font-size:13.5px;color:#065f46;font-weight:500;margin:0 0 12px;">Confirm marking this payment as verified and paid?</p>
                    <div style="display:flex;gap:8px;">
                        <button class="pr-btn-verify" onclick="prConfirmVerify('${id}')">
                            <i data-lucide="check" style="width:14px;height:14px;"></i> Yes, Mark as Paid
                        </button>
                        <button class="pr-btn-cancel" onclick="prCancelAction()">Cancel</button>
                    </div>
                </div>
                <div id="prRejectForm" style="display:none;margin-top:14px;background:#fff5f5;border:1.5px solid #fecaca;border-radius:10px;padding:14px;">
                    <label style="font-size:12.5px;font-weight:600;color:#b91c1c;display:block;margin-bottom:8px;">Rejection Reason <span style="color:#ef4444;">*</span></label>
                    <textarea id="prRejectReason" class="pr-form-textarea" placeholder="Enter the reason for rejection…" style="border-color:#fca5a5;min-height:70px;resize:vertical;"></textarea>
                    <div id="prRejectError" style="display:none;color:#b91c1c;font-size:12.5px;margin-top:6px;"></div>
                    <div style="display:flex;gap:8px;margin-top:10px;">
                        <button class="pr-btn-reject" onclick="prConfirmReject('${id}')">
                            <i data-lucide="x-circle" style="width:14px;height:14px;"></i> Confirm Rejection
                        </button>
                        <button class="pr-btn-cancel" onclick="prCancelAction()">Cancel</button>
                    </div>
                </div>
                <div id="prDeleteConfirm" style="display:none;margin-top:14px;background:#fff5f5;border:1.5px solid #fecaca;border-radius:10px;padding:14px;">
                    <p style="font-size:13.5px;color:#b91c1c;font-weight:500;margin:0 0 12px;">Permanently delete this payment request?</p>
                    <div style="display:flex;gap:8px;">
                        <button class="pr-btn-delete" onclick="prConfirmDelete('${id}')">Yes, Delete</button>
                        <button class="pr-btn-cancel" onclick="prCancelAction()">Cancel</button>
                    </div>
                </div>
            </div>`;
        } else if (r.status === 'partial_pending') {
            actionButtons = `
            <div class="pr-detail-section" style="margin-top:10px;">
                <div class="pr-detail-section-title">Partial Payment Request</div>
                <div style="background:#fff7ed;border:1.5px solid #fed7aa;border-radius:10px;padding:14px;margin-top:10px;">
                    <div style="font-size:13.5px;color:#7c2d12;margin-bottom:4px;">
                        Client requests to pay <strong style="font-size:15px;">${_formatAmount(r.requestedPartialAmount)}</strong>
                        instead of the requested <strong>${_formatAmount(r.amount)}</strong>.
                    </div>
                    ${r.partialReason ? `<div style="font-size:13px;color:#9a3412;font-style:italic;margin-top:6px;">"${_esc(r.partialReason)}"</div>` : ''}
                    ${r.partialRequestedAt ? `<div style="font-size:11.5px;color:#c2410c;margin-top:8px;">Requested on: ${_formatDate(r.partialRequestedAt)}</div>` : ''}
                </div>
                <div id="prPartialActionMain" style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap;">
                    <button class="pr-btn-verify" onclick="prShowApprovePartialConfirm()">
                        <i data-lucide="check-circle" style="width:15px;height:15px;"></i> Approve Partial
                    </button>
                    <button class="pr-btn-reject" onclick="prShowDeclinePartialInput()">
                        <i data-lucide="x-circle" style="width:15px;height:15px;"></i> Decline Request
                    </button>
                    <button class="pr-btn-delete" onclick="prShowDeleteConfirm()">
                        <i data-lucide="trash-2" style="width:15px;height:15px;"></i> Delete
                    </button>
                </div>
                <div id="prApprovePartialConfirm" style="display:none;margin-top:14px;background:#f0fdf9;border:1.5px solid #6ee7b7;border-radius:10px;padding:14px;">
                    <p style="font-size:13.5px;color:#065f46;font-weight:500;margin:0 0 12px;">
                        Approve client to pay <strong>${_formatAmount(r.requestedPartialAmount)}</strong>? The client will be notified to proceed with payment.
                    </p>
                    <div style="display:flex;gap:8px;">
                        <button class="pr-btn-verify" onclick="prConfirmApprovePartial('${id}')">
                            <i data-lucide="check" style="width:14px;height:14px;"></i> Yes, Approve
                        </button>
                        <button class="pr-btn-cancel" onclick="prCancelPartialAction()">Cancel</button>
                    </div>
                </div>
                <div id="prDeclinePartialForm" style="display:none;margin-top:14px;background:#fff5f5;border:1.5px solid #fecaca;border-radius:10px;padding:14px;">
                    <label style="font-size:12.5px;font-weight:600;color:#b91c1c;display:block;margin-bottom:8px;">Reason for Declining <span style="color:#ef4444;">*</span></label>
                    <textarea id="prDeclinePartialReason" class="pr-form-textarea" placeholder="e.g. Full payment is required per contract terms…" style="border-color:#fca5a5;min-height:70px;"></textarea>
                    <div id="prDeclinePartialError" style="display:none;color:#b91c1c;font-size:12.5px;margin-top:6px;"></div>
                    <div style="display:flex;gap:8px;margin-top:10px;">
                        <button class="pr-btn-reject" onclick="prConfirmDeclinePartial('${id}')">
                            <i data-lucide="x-circle" style="width:14px;height:14px;"></i> Confirm Decline
                        </button>
                        <button class="pr-btn-cancel" onclick="prCancelPartialAction()">Cancel</button>
                    </div>
                </div>
                <div id="prDeleteConfirm" style="display:none;margin-top:14px;background:#fff5f5;border:1.5px solid #fecaca;border-radius:10px;padding:14px;">
                    <p style="font-size:13.5px;color:#b91c1c;font-weight:500;margin:0 0 12px;">Permanently delete this payment request?</p>
                    <div style="display:flex;gap:8px;">
                        <button class="pr-btn-delete" onclick="prConfirmDelete('${id}')">Yes, Delete</button>
                        <button class="pr-btn-cancel" onclick="prCancelDelete()">Cancel</button>
                    </div>
                </div>
            </div>`;
        } else if (r.status === 'pending' || r.status === 'rejected') {
            actionButtons = `
            <div class="pr-detail-section" style="margin-top:10px;">
                <div class="pr-detail-section-title">Admin Actions</div>
                <div id="prSingleAction" style="margin-top:10px;">
                    <button class="pr-btn-delete" onclick="prShowDeleteConfirm()">
                        <i data-lucide="trash-2" style="width:15px;height:15px;"></i> Delete Request
                    </button>
                </div>
                <div id="prDeleteConfirm" style="display:none;margin-top:14px;background:#fff5f5;border:1.5px solid #fecaca;border-radius:10px;padding:14px;">
                    <p style="font-size:13.5px;color:#b91c1c;font-weight:500;margin:0 0 12px;">Permanently delete this payment request?</p>
                    <div style="display:flex;gap:8px;">
                        <button class="pr-btn-delete" onclick="prConfirmDelete('${id}')">Yes, Delete</button>
                        <button class="pr-btn-cancel" onclick="prCancelDelete()">Cancel</button>
                    </div>
                </div>
            </div>`;
        }

        const verifiedSection = r.status === 'verified' ? `
            <div class="pr-detail-row">
                <span class="pr-detail-label">Verified At</span>
                <span class="pr-detail-value">${verifiedDate}</span>
            </div>
            <div class="pr-detail-row">
                <span class="pr-detail-label">Verified By</span>
                <span class="pr-detail-value">${_esc(r.verifiedBy || '—')}</span>
            </div>
            ${r.invoiceId ? `<div class="pr-detail-row" style="margin-top:12px;">
                <button onclick="prPrintInvoice('${_esc(r.invoiceId)}')"
                    style="display:inline-flex;align-items:center;gap:7px;background:#1e3a5f;color:#fff;border:none;border-radius:8px;padding:9px 18px;font-size:13px;font-weight:600;cursor:pointer;">
                    <i data-lucide="printer" style="width:15px;height:15px;"></i> Print Invoice
                </button>
            </div>` : ''}` : '';

        body.innerHTML = `
            <div class="pr-detail-section">
                <div class="pr-detail-section-title">Request Info</div>
                <div class="pr-detail-row">
                    <span class="pr-detail-label">Client</span>
                    <span class="pr-detail-value">${_esc(r.clientName || _nameFromEmail(r.clientEmail))}</span>
                </div>
                <div class="pr-detail-row">
                    <span class="pr-detail-label">Email</span>
                    <span class="pr-detail-value">${_esc(r.clientEmail || '—')}</span>
                </div>
                <div class="pr-detail-row">
                    <span class="pr-detail-label">Billing Period</span>
                    <span class="pr-detail-value">${_esc(r.billingPeriod || '—')}</span>
                </div>
                <div class="pr-detail-row">
                    <span class="pr-detail-label">Project</span>
                    <span class="pr-detail-value">${_esc(r.projectName || '—')}</span>
                </div>
                <div class="pr-detail-row">
                    <span class="pr-detail-label">Amount</span>
                    <span class="pr-detail-value" style="font-weight:700;color:#00a85e;font-size:15px;">${formattedAmt}</span>
                </div>
                <div class="pr-detail-row">
                    <span class="pr-detail-label">Due Date</span>
                    <span class="pr-detail-value">${dueDate}</span>
                </div>
                <div class="pr-detail-row">
                    <span class="pr-detail-label">Status</span>
                    <span class="pr-detail-value">${statusBadge}</span>
                </div>
                <div class="pr-detail-row">
                    <span class="pr-detail-label">Created At</span>
                    <span class="pr-detail-value">${createdDate}</span>
                </div>
                <div class="pr-detail-row">
                    <span class="pr-detail-label">Created By</span>
                    <span class="pr-detail-value">${_esc(r.createdBy || '—')}</span>
                </div>
                ${r.notes ? `<div class="pr-detail-row">
                    <span class="pr-detail-label">Notes</span>
                    <span class="pr-detail-value">${_esc(r.notes)}</span>
                </div>` : ''}
                ${verifiedSection}
            </div>

            <div class="pr-detail-section">
                <div class="pr-detail-section-title">QR Code</div>
                ${qrSection}
            </div>

            ${rejectedHtml}
            ${proofSection}
            ${actionButtons}
        `;

        modal.style.display = 'flex';
        if (typeof lucide !== 'undefined') lucide.createIcons();
    };

    window.prCloseDetailModal = function () {
        const modal = document.getElementById('prDetailModal');
        if (modal) modal.style.display = 'none';
        _currentId = null;
    };

    window.prPrintInvoice = async function (invoiceId) {
        try {
            const doc = await db.collection('invoices').doc(invoiceId).get();
            if (!doc.exists) { _showToast('Invoice not found.', true); return; }
            if (typeof window.invPrintById === 'function') {
                window.invPrintById({ id: doc.id, ...doc.data() });
            }
        } catch (e) {
            _showToast('Could not load invoice: ' + e.message, true);
        }
    };

    // ══════════════════════════════════════════════════════
    // RECEIPT VIEWER
    // ══════════════════════════════════════════════════════

    window.prOpenReceiptViewer = function (url) {
        const viewer = document.getElementById('prReceiptViewer');
        const img    = document.getElementById('prReceiptViewerImg');
        if (!viewer || !img) return;
        img.src = url;
        viewer.style.display = 'flex';
    };

    window.prCloseReceiptViewer = function () {
        const viewer = document.getElementById('prReceiptViewer');
        if (viewer) viewer.style.display = 'none';
    };

    // ══════════════════════════════════════════════════════
    // INLINE ACTION CONTROLS (Verify / Reject / Delete)
    // ══════════════════════════════════════════════════════

    // ── Partial Payment Approval ──

    window.prCancelPartialAction = function () {
        const main = document.getElementById('prPartialActionMain');
        if (main) main.style.display = 'flex';
        ['prApprovePartialConfirm', 'prDeclinePartialForm', 'prDeleteConfirm'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
    };

    window.prShowApprovePartialConfirm = function () {
        document.getElementById('prPartialActionMain').style.display = 'none';
        document.getElementById('prApprovePartialConfirm').style.display = 'block';
        if (typeof lucide !== 'undefined') lucide.createIcons();
    };

    window.prShowDeclinePartialInput = function () {
        document.getElementById('prPartialActionMain').style.display = 'none';
        document.getElementById('prDeclinePartialForm').style.display = 'block';
        document.getElementById('prDeclinePartialReason')?.focus();
        if (typeof lucide !== 'undefined') lucide.createIcons();
    };

    window.prConfirmApprovePartial = async function (id) {
        const r   = _allRequests.find(x => x.id === id);
        if (!r) return;
        const btn = document.querySelector('#prApprovePartialConfirm .pr-btn-verify');
        if (btn) { btn.disabled = true; btn.textContent = 'Approving…'; }
        try {
            const approvedBy = auth.currentUser?.email || '';
            await db.collection('paymentRequests').doc(id).update({
                status:                'pending',
                approvedPartialAmount: r.requestedPartialAmount,
                partialApprovedBy:     approvedBy,
                partialApprovedAt:     firebase.firestore.FieldValue.serverTimestamp(),
                partialDeclinedReason: null
            });
            // Notify client their partial payment request was approved
            if (r.clientUid) {
                db.collection('notifications').doc(r.clientUid).collection('items').add({
                    type:      'partial_approved',
                    message:   `Your partial payment of ${_formatAmount(r.requestedPartialAmount)} for "${r.billingPeriod || 'a billing period'}" has been approved. You can now submit your payment.`,
                    isRead:    false,
                    relatedId: id,
                    createdAt: firebase.firestore.Timestamp.fromDate(new Date())
                }).catch(e => console.warn('Notification error:', e));
            }

            prCloseDetailModal();
            _loadRequests();
            _showToast(`Partial payment of ${_formatAmount(r.requestedPartialAmount)} approved. Client can now submit payment.`);
        } catch (e) {
            console.error('PaymentRequests: approve partial error', e);
            if (btn) { btn.disabled = false; btn.textContent = 'Yes, Approve'; }
            prCancelPartialAction();
            _showToast('Could not approve: ' + e.message, true);
        }
    };

    window.prConfirmDeclinePartial = async function (id) {
        const reason = (document.getElementById('prDeclinePartialReason')?.value || '').trim();
        const errEl  = document.getElementById('prDeclinePartialError');
        if (!reason) {
            if (errEl) { errEl.textContent = 'Please enter a reason.'; errEl.style.display = 'block'; }
            return;
        }
        if (errEl) errEl.style.display = 'none';
        const btn = document.querySelector('#prDeclinePartialForm .pr-btn-reject');
        if (btn) { btn.disabled = true; btn.textContent = 'Declining…'; }
        try {
            await db.collection('paymentRequests').doc(id).update({
                status:                'pending',
                approvedPartialAmount: null,
                requestedPartialAmount: null,
                partialReason:         null,
                partialDeclinedReason: reason
            });
            // Notify client their partial payment request was declined
            const _decReq = _allRequests.find(x => x.id === id) || {};
            if (_decReq.clientUid) {
                db.collection('notifications').doc(_decReq.clientUid).collection('items').add({
                    type:      'partial_declined',
                    message:   `Your partial payment request for "${_decReq.billingPeriod || 'a billing period'}" was declined. Reason: ${reason}`,
                    isRead:    false,
                    relatedId: id,
                    createdAt: firebase.firestore.Timestamp.fromDate(new Date())
                }).catch(e => console.warn('Notification error:', e));
            }

            prCloseDetailModal();
            _loadRequests();
            _showToast('Partial payment request declined. Client must pay full amount.');
        } catch (e) {
            console.error('PaymentRequests: decline partial error', e);
            if (btn) { btn.disabled = false; btn.textContent = 'Confirm Decline'; }
            if (errEl) { errEl.textContent = 'Error: ' + e.message; errEl.style.display = 'block'; }
        }
    };

    window.prShowVerifyConfirm = function () {
        document.getElementById('prActionMain').style.display  = 'none';
        document.getElementById('prVerifyConfirm').style.display = 'block';
        if (typeof lucide !== 'undefined') lucide.createIcons();
    };

    window.prShowRejectInput = function () {
        document.getElementById('prActionMain').style.display = 'none';
        document.getElementById('prRejectForm').style.display  = 'block';
        document.getElementById('prRejectReason')?.focus();
        if (typeof lucide !== 'undefined') lucide.createIcons();
    };

    window.prShowDeleteConfirm = function () {
        const main   = document.getElementById('prActionMain');
        const single = document.getElementById('prSingleAction');
        if (main)   main.style.display   = 'none';
        if (single) single.style.display = 'none';
        document.getElementById('prDeleteConfirm').style.display = 'block';
    };

    window.prCancelAction = function () {
        const main = document.getElementById('prActionMain');
        if (main) main.style.display = 'flex';
        ['prVerifyConfirm', 'prRejectForm', 'prDeleteConfirm'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
    };

    window.prCancelDelete = function () {
        const single = document.getElementById('prSingleAction');
        if (single) single.style.display = 'block';
        const conf = document.getElementById('prDeleteConfirm');
        if (conf) conf.style.display = 'none';
    };

    window.prConfirmVerify = async function (id) {
        const btn = document.querySelector('#prVerifyConfirm .pr-btn-verify');
        if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
        try {
            const verifiedBy = auth.currentUser ? auth.currentUser.email : '';
            await db.collection('paymentRequests').doc(id).update({
                status:     'verified',
                verifiedAt: firebase.firestore.FieldValue.serverTimestamp(),
                verifiedBy
            });

            // Auto-generate invoice from this verified payment request
            const req = _allRequests.find(x => x.id === id) || { id };
            if (typeof window.invGenerateFromPaymentRequest === 'function') {
                const invoiceId = await window.invGenerateFromPaymentRequest(req);
                if (invoiceId) {
                    // Fetch the generated invoice data and embed a snapshot in the payment request
                    // so clients can view their invoice without needing direct invoices collection access
                    let invoiceSnapshot = null;
                    try {
                        const invDoc = await db.collection('invoices').doc(invoiceId).get();
                        if (invDoc.exists) invoiceSnapshot = invDoc.data();
                    } catch (snapErr) {
                        console.warn('PaymentRequests: could not fetch invoice snapshot', snapErr);
                    }
                    const updateData = { invoiceId };
                    if (invoiceSnapshot) updateData.invoiceSnapshot = invoiceSnapshot;
                    await db.collection('paymentRequests').doc(id).update(updateData);
                    const r = _allRequests.find(x => x.id === id);
                    if (r) { r.invoiceId = invoiceId; if (invoiceSnapshot) r.invoiceSnapshot = invoiceSnapshot; }
                }
            }

            // Notify the client their payment has been verified
            const _verReq = _allRequests.find(x => x.id === id) || {};
            if (_verReq.clientUid) {
                db.collection('notifications').doc(_verReq.clientUid).collection('items').add({
                    type:      'payment_verified',
                    message:   `Your payment for "${_verReq.billingPeriod || 'a billing period'}" has been verified and marked as paid.`,
                    isRead:    false,
                    relatedId: id,
                    createdAt: firebase.firestore.Timestamp.fromDate(new Date())
                }).catch(e => console.warn('Notification error:', e));
            }

            prCloseDetailModal();
            _loadRequests();
            _showToast('Payment marked as paid. Invoice generated.');
        } catch (e) {
            console.error('PaymentRequests: verify error', e);
            if (btn) { btn.disabled = false; btn.textContent = 'Yes, Mark as Paid'; }
            prCancelAction();
            _showToast('Could not verify payment: ' + e.message, true);
        }
    };

    window.prConfirmReject = async function (id) {
        const reason = (document.getElementById('prRejectReason')?.value || '').trim();
        const errEl  = document.getElementById('prRejectError');
        if (!reason) {
            if (errEl) { errEl.textContent = 'Please enter a rejection reason.'; errEl.style.display = 'block'; }
            return;
        }
        if (errEl) errEl.style.display = 'none';

        const btn = document.querySelector('#prRejectForm .pr-btn-reject');
        if (btn) { btn.disabled = true; btn.textContent = 'Rejecting…'; }
        try {
            await db.collection('paymentRequests').doc(id).update({
                status:         'rejected',
                rejectedReason: reason,
                rejectedAt:     firebase.firestore.FieldValue.serverTimestamp()
            });

            // Notify the client their payment was rejected
            const _rejReq = _allRequests.find(x => x.id === id) || {};
            if (_rejReq.clientUid) {
                db.collection('notifications').doc(_rejReq.clientUid).collection('items').add({
                    type:      'payment_rejected',
                    message:   `Your payment for "${_rejReq.billingPeriod || 'a billing period'}" was rejected. Reason: ${reason}`,
                    isRead:    false,
                    relatedId: id,
                    createdAt: firebase.firestore.Timestamp.fromDate(new Date())
                }).catch(e => console.warn('Notification error:', e));
            }

            prCloseDetailModal();
            _loadRequests();
            _showToast('Payment request rejected.');
        } catch (e) {
            console.error('PaymentRequests: reject error', e);
            if (btn) { btn.disabled = false; btn.textContent = 'Confirm Rejection'; }
            if (errEl) { errEl.textContent = 'Error: ' + e.message; errEl.style.display = 'block'; }
        }
    };

    window.prConfirmDelete = async function (id) {
        const btn = document.querySelector('#prDeleteConfirm .pr-btn-delete');
        if (btn) { btn.disabled = true; btn.textContent = 'Deleting…'; }
        try {
            await db.collection('paymentRequests').doc(id).delete();
            prCloseDetailModal();
            _loadRequests();
            _showToast('Payment request deleted.');
        } catch (e) {
            console.error('PaymentRequests: delete error', e);
            if (btn) { btn.disabled = false; btn.textContent = 'Yes, Delete'; }
            prCancelDelete();
            _showToast('Could not delete request: ' + e.message, true);
        }
    };

    // ══════════════════════════════════════════════════════
    // PRINT ALL REQUESTS
    // ══════════════════════════════════════════════════════

    window.prPrintAllRequests = function () {
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            alert('Please allow popups to print the payment requests.');
            return;
        }

        const now = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
        const totalBilled = _allRequests.reduce((sum, r) => sum + (r.amount || 0), 0);
        const totalVerified = _allRequests.filter(r => r.status === 'verified')
            .reduce((sum, r) => sum + (r.paidAmount != null ? r.paidAmount : (r.amount || 0)), 0);
        const totalOutstanding = totalBilled - totalVerified;

        const rows = _allRequests.map((r, idx) => {
            const name = _esc(r.clientName || _nameFromEmail(r.clientEmail));
            const period = _esc(r.billingPeriod || '—');
            const project = _esc(r.projectName || '—');
            const isPartial = r.paidAmount && r.paidAmount < r.amount;
            const amount = isPartial
                ? `${_formatAmount(r.paidAmount)} (Partial of ${_formatAmount(r.amount)})`
                : _formatAmount(r.amount);
            const due = _formatDate(r.dueDate);
            const status = r.status.charAt(0).toUpperCase() + r.status.slice(1).replace('_', ' ');

            return `
                <tr>
                    <td>${idx + 1}</td>
                    <td>${name}</td>
                    <td>${period}</td>
                    <td>${project}</td>
                    <td style="text-align:right;">${amount}</td>
                    <td>${due}</td>
                    <td><span class="status-${r.status}">${status}</span></td>
                </tr>`;
        }).join('');

        const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Payment Requests - ${now}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #1f2937; }
        .header { text-align: center; margin-bottom: 30px; border-bottom: 3px solid #00a85e; padding-bottom: 20px; }
        .header h1 { font-size: 28px; color: #00a85e; margin-bottom: 8px; }
        .header p { font-size: 14px; color: #6b7280; }
        .summary { display: flex; justify-content: space-around; margin-bottom: 30px; }
        .summary-card { text-align: center; padding: 15px; background: #f9fafb; border-radius: 8px; flex: 1; margin: 0 10px; }
        .summary-card .label { font-size: 12px; color: #6b7280; text-transform: uppercase; margin-bottom: 5px; }
        .summary-card .value { font-size: 20px; font-weight: 700; color: #1f2937; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th { background: #f3f4f6; padding: 12px; text-align: left; font-size: 12px; font-weight: 600; color: #374151; border-bottom: 2px solid #d1d5db; }
        td { padding: 10px 12px; border-bottom: 1px solid #e5e7eb; font-size: 13px; }
        tr:hover { background: #f9fafb; }
        .status-pending { color: #d97706; font-weight: 600; }
        .status-partial_pending { color: #f97316; font-weight: 600; }
        .status-submitted { color: #3b82f6; font-weight: 600; }
        .status-verified { color: #00a85e; font-weight: 600; }
        .status-rejected { color: #ef4444; font-weight: 600; }
        .footer { margin-top: 40px; text-align: center; font-size: 12px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 20px; }
        @media print {
            body { padding: 20px; }
            .no-print { display: none; }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>💳 Payment Requests</h1>
        <p>DAC's Building Design Services</p>
        <p style="margin-top:8px;">Generated on ${now}</p>
    </div>

    <div class="summary">
        <div class="summary-card">
            <div class="label">Total Requests</div>
            <div class="value">${_allRequests.length}</div>
        </div>
        <div class="summary-card">
            <div class="label">Total Billed</div>
            <div class="value">${_formatAmount(totalBilled)}</div>
        </div>
        <div class="summary-card">
            <div class="label">Total Collected</div>
            <div class="value" style="color:#00a85e;">${_formatAmount(totalVerified)}</div>
        </div>
        <div class="summary-card">
            <div class="label">Outstanding</div>
            <div class="value" style="color:#ef4444;">${_formatAmount(totalOutstanding)}</div>
        </div>
    </div>

    <table>
        <thead>
            <tr>
                <th>#</th>
                <th>Client</th>
                <th>Billing Period</th>
                <th>Project</th>
                <th style="text-align:right;">Amount</th>
                <th>Due Date</th>
                <th>Status</th>
            </tr>
        </thead>
        <tbody>
            ${rows}
        </tbody>
    </table>

    <div class="footer">
        <p>DAC's Building Design Services - Payment Requests Report</p>
        <p>This is a computer-generated document.</p>
    </div>

    <script>
        window.onload = function() {
            setTimeout(function() {
                window.print();
            }, 500);
        };
    </script>
</body>
</html>`;

        printWindow.document.write(html);
        printWindow.document.close();
    };

    // ══════════════════════════════════════════════════════
    // HELPERS
    // ══════════════════════════════════════════════════════

    function _showLoading(on) {
        const load  = document.getElementById('prLoadingState');
        const wrap  = document.getElementById('prTableWrap');
        const empty = document.getElementById('prEmptyState');
        if (on) {
            if (load)  { load.style.display = 'flex'; load.innerHTML = '<div class="un-loading-spinner"></div><span>Loading payment requests\u2026</span>'; }
            if (wrap)  wrap.style.display  = 'none';
            if (empty) empty.style.display = 'none';
        } else {
            if (load) load.style.display = 'none';
        }
    }

    function _showError(msg) {
        const load = document.getElementById('prLoadingState');
        if (load) {
            load.style.display = 'flex';
            load.innerHTML = `
                <div style="text-align:center;">
                    <div style="font-size:28px;margin-bottom:8px;">&#9888;&#65039;</div>
                    <p style="color:#b91c1c;font-weight:600;margin-bottom:4px;">Could not load payment requests.</p>
                    <p style="color:#6b7280;font-size:13px;">${_esc(msg || '')}</p>
                </div>`;
        }
    }

    function _setText(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    // Compress image to fit within Firestore's 1MB field limit
    // QR codes need max ~500px — compresses large photos down aggressively
    function _compressToBase64(file, maxPx, quality) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = reject;
            reader.onload = e => {
                const img = new Image();
                img.onerror = reject;
                img.onload = () => {
                    let w = img.width, h = img.height;
                    if (w > maxPx || h > maxPx) {
                        if (w > h) { h = Math.round(h * maxPx / w); w = maxPx; }
                        else       { w = Math.round(w * maxPx / h); h = maxPx; }
                    }
                    const canvas = document.createElement('canvas');
                    canvas.width = w; canvas.height = h;
                    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                    resolve(canvas.toDataURL('image/jpeg', quality));
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    function _tsToMs(ts) {
        if (!ts) return 0;
        if (typeof ts.toDate === 'function') return ts.toDate().getTime();
        if (ts instanceof Date) return ts.getTime();
        if (typeof ts === 'number') return ts;
        return new Date(ts).getTime() || 0;
    }

    function _formatDate(ts) {
        const ms = _tsToMs(ts);
        if (!ms) return '\u2014';
        return new Date(ms).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    }

    function _formatAmount(val) {
        const n = parseFloat(val);
        if (isNaN(n)) return '\u20b10.00';
        return '\u20b1' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function _nameFromEmail(email) {
        if (!email) return 'Unknown';
        return email.split('@')[0].replace(/[._-]/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase());
    }

    function _esc(str) {
        return String(str || '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function _showToast(msg, isError = false) {
        const existing = document.getElementById('prToast');
        if (existing) existing.remove();
        const toast = document.createElement('div');
        toast.id = 'prToast';
        toast.style.cssText = [
            'position:fixed;bottom:28px;right:28px;z-index:99999;',
            `background:${isError ? '#b91c1c' : '#065f46'};`,
            'color:#fff;padding:12px 20px;border-radius:10px;',
            'font-size:14px;font-weight:500;font-family:inherit;',
            'box-shadow:0 4px 20px rgba(0,0,0,.22);',
            'animation:pr-fadein .2s ease;max-width:320px;line-height:1.4;'
        ].join('');
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(() => { if (toast.parentNode) toast.remove(); }, 3500);
    }

    function _statusBadge(status) {
        const map = {
            pending:         ['pr-status-pending',  'clock',        'Pending'],
            partial_pending: ['pr-status-partial',  'help-circle',  'Approval Pending'],
            submitted:       ['pr-status-submitted', 'upload',      'Submitted'],
            verified:        ['pr-status-verified',  'check-circle','Verified'],
            rejected:        ['pr-status-rejected',  'x-circle',   'Rejected']
        };
        const [cls, icon, label] = map[status] || ['pr-status-pending', 'clock', status];
        return `<span class="pr-status ${cls}"><span class="pr-status-dot"></span>${label}</span>`;
    }

})();
