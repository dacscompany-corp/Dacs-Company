// ════════════════════════════════════════════════════════════
// CLIENT PAYMENT MODULE
// Lets clients view and submit payment for payment requests.
// ════════════════════════════════════════════════════════════

(function () {
    'use strict';

    let _requests   = [];
    let _globalQR   = null;  // loaded from settings/paymentQR
    let _currentId  = null;  // id being paid

    // ══════════════════════════════════════════════════════
    // PUBLIC ENTRY POINT
    // ══════════════════════════════════════════════════════

    window.initClientPayment = async function () {
        if (!currentUser || !currentUser.email) return;

        const listEl = document.getElementById('pr-client-list');
        if (!listEl) return;

        listEl.innerHTML = '<div style="color:#9ca3af;font-size:14px;padding:20px 0;"><div class="un-loading-spinner" style="display:inline-block;vertical-align:middle;margin-right:10px;"></div>Loading payment requests\u2026</div>';

        try {
            // Load global QR settings and payment requests in parallel
            const [qrSnap, snap] = await Promise.all([
                db.collection('settings').doc('paymentQR').get(),
                db.collection('paymentRequests')
                    .where('clientEmail', '==', currentUser.email)
                    .get()
            ]);

            _globalQR = qrSnap.exists ? qrSnap.data() : {};

            _requests = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
                .sort((a, b) => _tsToMs(b.createdAt) - _tsToMs(a.createdAt));


            _renderList(listEl);
            _updateNavBadge();
        } catch (e) {
            console.error('ClientPayment: load error', e);
            listEl.innerHTML = `<div style="color:#b91c1c;font-size:13.5px;padding:16px 0;">Could not load payment requests. ${_esc(e.message)}</div>`;
        }
    };

    // ══════════════════════════════════════════════════════
    // RENDER LIST
    // ══════════════════════════════════════════════════════

    function _renderList(listEl) {
        if (!_requests.length) {
            listEl.innerHTML = '<div style="color:#9ca3af;font-size:14px;padding:20px 0;text-align:center;">No payment requests yet.</div>';
            return;
        }

        listEl.innerHTML = `<div class="pr-client-cards-grid">${_requests.map(_buildCard).join('')}</div>`;

        // Init drag-and-drop on upload zones in the pay modal
        listEl.querySelectorAll('.pr-upload-zone').forEach(zone => {
            zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('dragover'); });
            zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
            zone.addEventListener('drop', e => {
                e.preventDefault();
                zone.classList.remove('dragover');
                const file = e.dataTransfer.files?.[0];
                if (!file) return;
                const input = zone.querySelector('input[type="file"]');
                if (input) {
                    // Assign the dropped file to the input and trigger preview
                    const dt = new DataTransfer();
                    dt.items.add(file);
                    input.files = dt.files;
                    prClientPreviewReceipt(input);
                }
            });
        });

        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    function _buildCard(r) {
        const period  = _esc(r.billingPeriod || '—');
        const project = _esc(r.projectName   || '—');
        const amount  = _formatAmount(r.amount);
        const due     = _formatDate(r.dueDate);
        const statusBadge = _statusBadge(r.status);

        // Check if overdue
        const duMs = _tsToMs(r.dueDate);
        const overdue = duMs && duMs < Date.now() && r.status !== 'verified';

        let actionSection = '';
        if (r.status === 'partial_pending') {
            actionSection = `
                <div style="background:#fff7ed;border:1.5px solid #fed7aa;border-radius:10px;padding:12px;">
                    <div style="font-size:11.5px;font-weight:700;color:#c2410c;text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px;">Partial Payment Request Pending</div>
                    <div style="font-size:13px;color:#7c2d12;">Requested to pay <strong>${_formatAmount(r.requestedPartialAmount)}</strong> instead of <strong>${_formatAmount(r.amount)}</strong>.</div>
                    ${r.partialReason ? `<div style="font-size:12.5px;color:#9a3412;margin-top:5px;font-style:italic;">"${_esc(r.partialReason)}"</div>` : ''}
                    <div style="font-size:12px;color:#c2410c;margin-top:6px;">Waiting for admin approval.</div>
                    <div id="prCancelPartialWrap-${r.id}" style="margin-top:10px;">
                        <button onclick="prClientShowCancelPartial('${r.id}')" style="font-size:12px;color:#6b7280;background:none;border:1px solid #d1d5db;border-radius:6px;padding:5px 12px;cursor:pointer;">Cancel Request</button>
                    </div>
                    <div id="prCancelPartialConfirm-${r.id}" style="display:none;margin-top:10px;background:#fff5f5;border:1.5px solid #fecaca;border-radius:8px;padding:10px 12px;">
                        <div style="font-size:12.5px;color:#b91c1c;margin-bottom:8px;">Cancel your partial payment request? The request will go back to pending full payment.</div>
                        <div style="display:flex;gap:8px;">
                            <button onclick="prClientCancelPartialRequest('${r.id}')" style="font-size:12px;color:#fff;background:#dc2626;border:none;border-radius:6px;padding:5px 14px;cursor:pointer;">Yes, Cancel</button>
                            <button onclick="prClientHideCancelPartial('${r.id}')" style="font-size:12px;color:#6b7280;background:none;border:1px solid #d1d5db;border-radius:6px;padding:5px 12px;cursor:pointer;">Keep Request</button>
                        </div>
                    </div>
                </div>`;
        } else if (r.status === 'pending' || r.status === 'rejected') {
            const rejectedNote = r.status === 'rejected' && r.rejectedReason ? `
                <div class="pr-client-rejected-note">
                    <strong>Rejected</strong>
                    ${_esc(r.rejectedReason)}
                </div>` : '';

            const partialDeclinedNote = r.partialDeclinedReason ? `
                <div style="background:#fff7ed;border:1.5px solid #fed7aa;border-radius:10px;padding:10px 12px;margin-bottom:8px;">
                    <div style="font-size:11.5px;font-weight:700;color:#c2410c;margin-bottom:4px;">Partial Payment Request Declined</div>
                    <div style="font-size:12.5px;color:#7c2d12;">${_esc(r.partialDeclinedReason)}</div>
                    <div style="font-size:12px;color:#9a3412;margin-top:4px;">Please pay the full amount of ${_formatAmount(r.amount)}.</div>
                </div>` : '';

            const approvedNote = r.approvedPartialAmount ? `
                <div style="background:#f0fdf9;border:1.5px solid #6ee7b7;border-radius:10px;padding:10px 12px;margin-bottom:8px;">
                    <div style="font-size:11.5px;font-weight:700;color:#065f46;margin-bottom:4px;">Partial Payment Approved</div>
                    <div style="font-size:12.5px;color:#064e3b;">You may now pay <strong>${_formatAmount(r.approvedPartialAmount)}</strong>.</div>
                </div>` : '';

            actionSection = `
                ${partialDeclinedNote}
                ${approvedNote}
                ${rejectedNote}
                <button class="pr-client-pay-btn" onclick="prClientOpenPayModal('${r.id}')">
                    <i data-lucide="upload" style="width:16px;height:16px;"></i>
                    ${r.status === 'rejected' ? 'Resubmit Payment' : 'Submit Payment'}
                </button>`;
        } else if (r.status === 'submitted') {
            const paidAmt   = r.paidAmount != null && !isNaN(r.paidAmount) ? `<div style="font-size:12.5px;color:#374151;margin-top:4px;">Paid: <strong>${_formatAmount(r.paidAmount)}</strong></div>` : '';
            const refNo     = r.referenceNumber ? `<div style="font-size:12.5px;color:#374151;margin-top:4px;">Ref #: <strong>${_esc(r.referenceNumber)}</strong></div>` : '';
            const thumbHtml = r.proofBase64 ? `
                <img src="${_esc(r.proofBase64)}" alt="Your receipt"
                     style="width:56px;height:56px;object-fit:cover;border-radius:8px;border:1.5px solid #bfdbfe;flex-shrink:0;cursor:pointer;"
                     onclick="this.requestFullscreen && this.requestFullscreen()" title="View submitted receipt">` : '';
            actionSection = `
                <div class="pr-client-submitted-note" style="display:flex;align-items:flex-start;gap:12px;">
                    ${thumbHtml}
                    <div style="flex:1;">
                        <strong style="display:block;margin-bottom:4px;font-size:11.5px;text-transform:uppercase;letter-spacing:.4px;">Payment Submitted</strong>
                        Waiting for admin verification.
                        ${paidAmt}
                        ${refNo}
                    </div>
                </div>`;
        } else if (r.status === 'verified') {
            const verifiedDate = r.verifiedAt ? _formatDate(r.verifiedAt) : '';
            actionSection = `
                <div class="pr-client-verified-badge">
                    <i data-lucide="check-circle" style="width:18px;height:18px;"></i>
                    Payment Verified${verifiedDate ? ' · ' + verifiedDate : ''}
                </div>`;
        }

        const issued = _formatDate(r.createdAt);

        return `
        <div class="pr-client-card">
            <div class="pr-client-card-header">
                <div>
                    <div class="pr-client-card-title">${period}</div>
                    <div class="pr-client-card-sub">${project}</div>
                </div>
                <div>${statusBadge}</div>
            </div>
            <div>
                <div class="pr-client-card-amount">${amount}</div>
                <div class="pr-client-card-due ${overdue ? 'overdue' : ''}">
                    Due: ${due}${overdue ? ' · Overdue' : ''}
                </div>
                <div style="font-size:11.5px;color:#9ca3af;margin-top:3px;">Issued: ${issued}</div>
            </div>
            ${actionSection}
        </div>`;
    }

    // ══════════════════════════════════════════════════════
    // PAY MODAL
    // ══════════════════════════════════════════════════════

    window.prClientOpenPayModal = function (id) {
        const r = _requests.find(x => x.id === id);
        if (!r) return;

        _currentId = id;

        const modal = document.getElementById('prClientPayModal');
        if (!modal) return;

        // Set up payment method tabs using global QR settings
        const hasGcash = !!(_globalQR?.gcashQrBase64);
        const hasBank  = !!(_globalQR?.bankQrBase64);
        const tabsWrap = document.getElementById('prMethodTabsWrap');
        const tabGcash = document.getElementById('prTabGcash');
        const tabBank  = document.getElementById('prTabBank');

        const tabsVisible = hasGcash && hasBank;
        if (tabsWrap) { tabsWrap.style.display = tabsVisible ? 'block' : 'none'; tabsWrap.dataset.hasQr = tabsVisible ? 'true' : 'false'; }
        if (tabGcash) tabGcash.style.display  = hasGcash ? '' : 'none';
        if (tabBank)  tabBank.style.display   = hasBank  ? '' : 'none';

        // Show first available method
        const defaultMethod = hasGcash ? 'gcash' : (hasBank ? 'bank' : 'any');
        _setQRForMethod(defaultMethod);

        // Reset tab active state
        if (tabGcash) tabGcash.classList.toggle('active', defaultMethod !== 'bank');
        if (tabBank)  tabBank.classList.toggle('active',  defaultMethod === 'bank');

        // Set billing period heading
        const titleEl = document.getElementById('prClientPayTitle');
        if (titleEl) titleEl.textContent = r.billingPeriod || 'Payment';

        // Set requested amount display
        const amtEl = document.getElementById('prClientPayAmount');
        if (amtEl) amtEl.textContent = _formatAmount(r.amount);

        // Pre-fill amount input; handle admin-approved partial case
        const amtInput = document.getElementById('prClientAmountInput');
        const reqAmtEl = document.getElementById('prClientRequestedAmt');
        const btn      = document.getElementById('prClientSubmitBtn');
        if (amtInput) {
            if (r.approvedPartialAmount) {
                // Admin approved a specific partial — lock to that amount
                amtInput.value             = r.approvedPartialAmount;
                amtInput.dataset.requested = r.approvedPartialAmount; // matches entered → no partial trigger
                amtInput.readOnly          = true;
                amtInput.style.background  = '#f0fdf9';
                amtInput.style.borderColor = '#6ee7b7';
                if (reqAmtEl) reqAmtEl.innerHTML =
                    `<span style="color:#065f46;font-weight:600;">Admin approved: ${_formatAmount(r.approvedPartialAmount)}</span>` +
                    ` <span style="text-decoration:line-through;color:#9ca3af;">${_formatAmount(r.amount)}</span>`;
            } else {
                amtInput.value             = r.amount || '';
                amtInput.dataset.requested = r.amount || 0;
                amtInput.readOnly          = false;
                amtInput.style.background  = '';
                amtInput.style.borderColor = '';
                if (reqAmtEl) reqAmtEl.textContent = _formatAmount(r.amount);
            }
        }

        // Reset button mode and partial reason section
        if (btn) { btn.textContent = 'Submit Payment'; btn.dataset.mode = 'submit'; }
        const reasonWrap = document.getElementById('prPartialReasonWrap');
        const reasonTA   = document.getElementById('prPartialReason');
        if (reasonWrap) reasonWrap.style.display = 'none';
        if (reasonTA)   reasonTA.value = '';

        // Ensure QR and proof sections are visible (they may have been hidden in partial-request mode)
        const qrSection    = document.getElementById('prQRSection');
        const proofSection = document.getElementById('prPaymentProofSection');
        if (qrSection)    qrSection.style.display    = '';
        if (proofSection) proofSection.style.display  = '';

        // Reset form
        const refInput = document.getElementById('prClientRefInput');
        if (refInput) refInput.value = '';

        const fileInput = document.getElementById('prClientReceiptFile');
        if (fileInput) fileInput.value = '';

        const preview = document.getElementById('prClientReceiptPreview');
        if (preview) { preview.style.display = 'none'; preview.querySelector('img').src = ''; }

        const errDiv = document.getElementById('prClientPayError');
        if (errDiv) { errDiv.style.display = 'none'; errDiv.textContent = ''; }

        modal.style.display = 'flex';
        if (typeof lucide !== 'undefined') lucide.createIcons();
    };

    function _setQRForMethod(method) {
        const qrImg = document.getElementById('prClientQRImg');
        if (!qrImg) return;
        let src = '';
        if (method === 'gcash')      src = _globalQR?.gcashQrBase64 || '';
        else if (method === 'bank')  src = _globalQR?.bankQrBase64  || '';
        else                         src = _globalQR?.gcashQrBase64 || _globalQR?.bankQrBase64 || '';
        qrImg.src = src;
        qrImg.style.display = src ? 'block' : 'none';
    }

    window.prSwitchPayMethod = function (method) {
        _setQRForMethod(method);
        document.getElementById('prTabGcash')?.classList.toggle('active', method === 'gcash');
        document.getElementById('prTabBank')?.classList.toggle('active',  method === 'bank');
    };

    window.prCheckPartialAmount = function () {
        const input        = document.getElementById('prClientAmountInput');
        const reasonWrap   = document.getElementById('prPartialReasonWrap');
        const reasonTA     = document.getElementById('prPartialReason');
        const btn          = document.getElementById('prClientSubmitBtn');
        const qrSection    = document.getElementById('prQRSection');
        const proofSection = document.getElementById('prPaymentProofSection');
        const tabsWrap     = document.getElementById('prMethodTabsWrap');
        if (!input || !reasonWrap || !btn) return;
        const entered   = parseFloat(input.value);
        const requested = parseFloat(input.dataset.requested || 0);
        const isPartial = !isNaN(entered) && !isNaN(requested) && Math.abs(entered - requested) > 0.01;
        reasonWrap.style.display = isPartial ? 'block' : 'none';
        if (!isPartial && reasonTA) reasonTA.value = '';
        // In partial-request mode: hide QR and proof fields (not paying yet, just requesting approval)
        if (qrSection)    qrSection.style.display    = isPartial ? 'none' : '';
        if (proofSection) proofSection.style.display  = isPartial ? 'none' : '';
        if (tabsWrap) {
            tabsWrap.style.display = isPartial ? 'none' : (tabsWrap.dataset.hasQr === 'true' ? 'block' : 'none');
        }
        if (isPartial) {
            btn.textContent    = 'Request Partial Approval';
            btn.dataset.mode   = 'partial';
        } else {
            btn.textContent    = 'Submit Payment';
            btn.dataset.mode   = 'submit';
        }
    };

    // Routes to either submit or partial-request based on mode
    window.prClientHandlePayment = function () {
        const btn = document.getElementById('prClientSubmitBtn');
        if (btn?.dataset.mode === 'partial') {
            prClientRequestPartial();
        } else {
            prClientSubmitPayment();
        }
    };

    // Sends a partial payment approval request to admin (no proof upload needed yet)
    window.prClientRequestPartial = async function () {
        const errDiv = document.getElementById('prClientPayError');
        const btn    = document.getElementById('prClientSubmitBtn');
        function showErr(msg) { if (errDiv) { errDiv.textContent = msg; errDiv.style.display = 'block'; } }
        function clearErr()   { if (errDiv) { errDiv.style.display = 'none'; errDiv.textContent = ''; } }
        clearErr();

        const paidAmountRaw = (document.getElementById('prClientAmountInput')?.value || '').trim();
        const paidAmount    = parseFloat(paidAmountRaw);
        if (!paidAmountRaw || isNaN(paidAmount) || paidAmount <= 0) return showErr('Please enter a valid amount.');
        const partialReason = (document.getElementById('prPartialReason')?.value || '').trim();
        if (!partialReason) return showErr('Please provide a reason for the partial payment.');

        if (btn) { btn.disabled = true; btn.textContent = 'Sending Request…'; }
        try {
            await db.collection('paymentRequests').doc(_currentId).update({
                status:                 'partial_pending',
                requestedPartialAmount: paidAmount,
                partialReason,
                partialRequestedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            const req = _requests.find(x => x.id === _currentId);
            if (req) {
                req.status                 = 'partial_pending';
                req.requestedPartialAmount = paidAmount;
                req.partialReason          = partialReason;
            }
            prClientClosePayModal();
            const listEl = document.getElementById('pr-client-list');
            if (listEl) _renderList(listEl);
            _updateNavBadge();
            _showClientToast('Partial payment request sent. Waiting for admin approval.');
        } catch (e) {
            console.error('ClientPayment: partial request error', e);
            showErr('Error sending request: ' + e.message);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Request Partial Approval'; }
        }
    };

    window.prClientClosePayModal = function () {
        const modal = document.getElementById('prClientPayModal');
        if (modal) modal.style.display = 'none';
        _currentId = null;
    };

    // ── Cancel Partial Request ──
    window.prClientShowCancelPartial = function (id) {
        document.getElementById(`prCancelPartialWrap-${id}`).style.display    = 'none';
        document.getElementById(`prCancelPartialConfirm-${id}`).style.display = 'block';
    };

    window.prClientHideCancelPartial = function (id) {
        document.getElementById(`prCancelPartialWrap-${id}`).style.display    = 'block';
        document.getElementById(`prCancelPartialConfirm-${id}`).style.display = 'none';
    };

    window.prClientCancelPartialRequest = async function (id) {
        try {
            await db.collection('paymentRequests').doc(id).update({
                status:                 'pending',
                requestedPartialAmount: null,
                partialReason:          null,
                partialRequestedAt:     null
            });
            const req = _requests.find(x => x.id === id);
            if (req) {
                req.status                 = 'pending';
                req.requestedPartialAmount = null;
                req.partialReason          = null;
            }
            const listEl = document.getElementById('pr-client-list');
            if (listEl) _renderList(listEl);
            _updateNavBadge();
            _showClientToast('Partial payment request cancelled.');
        } catch (e) {
            console.error('ClientPayment: cancel partial error', e);
            _showClientToast('Could not cancel request: ' + e.message, true);
        }
    };

    // ── Receipt Preview ──
    window.prClientPreviewReceipt = function (input) {
        const file    = input.files && input.files[0];
        const preview = document.getElementById('prClientReceiptPreview');
        if (!preview) return;
        const img = preview.querySelector('img');
        if (file) {
            const reader = new FileReader();
            reader.onload = e => {
                if (img) img.src = e.target.result;
                preview.style.display = 'flex';
            };
            reader.readAsDataURL(file);
        } else {
            if (img) img.src = '';
            preview.style.display = 'none';
        }
    };

    // ── Submit Payment ──
    window.prClientSubmitPayment = async function () {
        const errDiv = document.getElementById('prClientPayError');
        const btn    = document.getElementById('prClientSubmitBtn');

        function showErr(msg) {
            if (errDiv) { errDiv.textContent = msg; errDiv.style.display = 'block'; }
        }
        function clearErr() {
            if (errDiv) { errDiv.style.display = 'none'; errDiv.textContent = ''; }
        }
        clearErr();

        if (!_currentId) return showErr('No payment request selected.');

        const paidAmountRaw   = (document.getElementById('prClientAmountInput')?.value || '').trim();
        const referenceNumber = (document.getElementById('prClientRefInput')?.value || '').trim();
        const receiptFile     = document.getElementById('prClientReceiptFile')?.files?.[0];

        const paidAmount = parseFloat(paidAmountRaw);
        if (!paidAmountRaw || isNaN(paidAmount) || paidAmount <= 0) return showErr('Please enter a valid payment amount.');

        // If partial, reason is required
        const amtInput    = document.getElementById('prClientAmountInput');
        const requested   = parseFloat(amtInput?.dataset.requested || 0);
        const isPartial   = Math.abs(paidAmount - requested) > 0.01;
        const partialReason = (document.getElementById('prPartialReason')?.value || '').trim();
        if (isPartial && !partialReason) return showErr('Please provide a reason for paying a different amount.');

        if (!referenceNumber) return showErr('Please enter your reference number.');
        if (!receiptFile)     return showErr('Please upload your receipt image.');

        if (btn) { btn.disabled = true; btn.textContent = 'Submitting…'; }

        try {
            // 1. Compress + convert receipt to base64 (avoids CORS/Storage issues)
            const proofBase64 = await _compressImageToBase64(receiptFile, 1200, 0.75);

            // 2. Update Firestore doc
            await db.collection('paymentRequests').doc(_currentId).update({
                status:          'submitted',
                proofBase64,
                referenceNumber,
                paidAmount,
                partialReason:   isPartial ? partialReason : null,
                submittedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // 3. Update local cache
            const req = _requests.find(x => x.id === _currentId);
            if (req) {
                req.status          = 'submitted';
                req.proofBase64     = proofBase64;
                req.referenceNumber = referenceNumber;
                req.paidAmount      = paidAmount;
                req.partialReason   = isPartial ? partialReason : null;
                req.submittedAt     = new Date();
            }

            prClientClosePayModal();

            // Re-render list
            const listEl = document.getElementById('pr-client-list');
            if (listEl) _renderList(listEl);
            _updateNavBadge();
            _showClientToast('Payment submitted! Please wait for admin verification.');

        } catch (e) {
            console.error('ClientPayment: submit error', e);
            showErr('Error submitting payment: ' + e.message);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Submit Payment'; }
        }
    };

    // ══════════════════════════════════════════════════════
    // NAV BADGE
    // ══════════════════════════════════════════════════════

    function _updateNavBadge() {
        const badge = document.getElementById('billing-badge');
        if (!badge) return;
        const pendingCount = _requests.filter(r =>
            r.status === 'pending' || r.status === 'rejected' || r.status === 'partial_pending'
        ).length;
        if (pendingCount > 0) {
            badge.textContent = pendingCount;
            badge.style.display = 'inline-flex';
        } else {
            badge.style.display = 'none';
        }
    }

    // ══════════════════════════════════════════════════════
    // HELPERS
    // ══════════════════════════════════════════════════════

    function _tsToMs(ts) {
        if (!ts) return 0;
        if (typeof ts.toDate === 'function') return ts.toDate().getTime();
        if (ts instanceof Date) return ts.getTime();
        if (typeof ts === 'number') return ts;
        return new Date(ts).getTime() || 0;
    }

    function _compressImageToBase64(file, maxPx, quality) {
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

    function _esc(str) {
        return String(str || '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function _showClientToast(msg, isError = false) {
        const existing = document.getElementById('prClientToast');
        if (existing) existing.remove();
        const toast = document.createElement('div');
        toast.id = 'prClientToast';
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
        setTimeout(() => { if (toast.parentNode) toast.remove(); }, 4000);
    }

    function _statusBadge(status) {
        const map = {
            pending:         'pr-status-pending',
            partial_pending: 'pr-status-partial',
            submitted:       'pr-status-submitted',
            verified:        'pr-status-verified',
            rejected:        'pr-status-rejected'
        };
        const labels = {
            pending:         'Pending',
            partial_pending: 'Approval Pending',
            submitted:       'Submitted',
            verified:        'Paid',
            rejected:        'Rejected'
        };
        const cls   = map[status]    || 'pr-status-pending';
        const label = labels[status] || status;
        return `<span class="pr-status ${cls}"><span class="pr-status-dot"></span>${label}</span>`;
    }

})();
