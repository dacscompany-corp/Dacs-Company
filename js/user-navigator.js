<<<<<<< HEAD
// ════════════════════════════════════════════════════════════
// USER NAVIGATOR MODULE
// Loads admin users (users collection) + client registrations
// (clientUsers collection) into one unified table.
// ════════════════════════════════════════════════════════════

(function () {
    'use strict';

    // ── State ────────────────────────────────────────────────
    let _allUsers  = [];
    let _loading   = false;   // guard against duplicate calls

    // ── Public entry point ───────────────────────────────────
    window.initUserNavigator = function () {
        if (_loading) return;
        _loadUsers();
    };

    // ── Load from both Firestore collections ─────────────────
    async function _loadUsers() {
        _loading = true;
        _showLoading(true);

        let adminUsers  = [];
        let clientUsers = [];
        let adminErr    = null;
        let clientErr   = null;

        // Load admin users — separate try/catch so one failure won't block the other
        try {
            const snap = await db.collection('users').get();
            adminUsers = snap.docs.map(doc => {
                const d = doc.data();
                return {
                    uid:       doc.id,
                    _type:     'admin',
                    name:      d.displayName || d.name || null,
                    email:     d.email || '',
                    role:      d.role || 'owner',
                    status:    d.status || 'active',
                    lastLogin: d.lastLogin || d.last_login || null,
                    createdAt: d.createdAt || null
                };
            });
        } catch (e) {
            adminErr = e;
            console.warn('UserNavigator: could not load admin users —', e.message);
        }

        // Load client users — no orderBy to avoid requiring a composite index
        try {
            const snap = await db.collection('clientUsers').get();
            clientUsers = snap.docs.map(doc => {
                const d = doc.data();
                return {
                    uid:       doc.id,
                    _type:     'client',
                    name:      ((d.firstName || '') + ' ' + (d.lastName || '')).trim() || null,
                    email:     d.email || '',
                    role:      'client',
                    status:    d.status || 'active',
                    photoURL:  d.photoURL || '',
                    lastLogin: d.lastLogin || null,
                    createdAt: d.createdAt || null
                };
            });
        } catch (e) {
            clientErr = e;
            console.warn('UserNavigator: could not load client users —', e.message);
        }

        _loading = false;
        _showLoading(false);

        // Both collections failed with permissions error
        if (adminErr && clientErr) {
            _showPermissionError();
            return;
        }

        // FIFO: latest registered appears first (newest at top)
        _allUsers = [...adminUsers, ...clientUsers].sort((a, b) =>
            _tsToMs(b.createdAt) - _tsToMs(a.createdAt)
        );
        _renderStats(_allUsers);
        _renderTable(_allUsers);

        // Warn in the UI if one collection was blocked (but still show the other)
        if (adminErr)  _showPartialWarning('Admin users could not be loaded — check Firestore rules for the <b>users</b> collection.');
        if (clientErr) _showPartialWarning('Client users could not be loaded — check Firestore rules for the <b>clientUsers</b> collection.');
    }

    // ── Stats cards ──────────────────────────────────────────
    function _renderStats(users) {
        const total    = users.length;
        const active   = users.filter(u => u.status === 'active').length;
        const inactive = total - active;
        _setText('unTotalCount',    total);
        _setText('unActiveCount',   active);
        _setText('unInactiveCount', inactive);
    }

    // ── Render table ─────────────────────────────────────────
    function _renderTable(users) {
        const tbody = document.getElementById('unTableBody');
        const table = document.getElementById('unTable');
        const empty = document.getElementById('unEmptyState');
        if (!tbody) return;

        if (users.length === 0) {
            if (table) table.style.display = 'none';
            if (empty) empty.style.display = 'flex';
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        if (table) table.style.display = 'table';
        if (empty) empty.style.display = 'none';

        tbody.innerHTML = users.map(u => _buildRow(u)).join('');
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    function _buildRow(user) {
        const name    = user.name || _nameFromEmail(user.email);
        const initial = (name[0] || 'U').toUpperCase();

        const typeBadge   = _typeBadge(user._type);
        const roleBadge   = `<span class="un-role-badge ${_roleClass(user.role)}">${_roleLabel(user.role)}</span>`;
        const statusBadge = _statusBadge(user.status);

        const toggleBtn = user.status === 'active'
            ? `<button class="un-btn-toggle un-btn-deactivate" onclick="unToggleStatus('${user.uid}','active','${user._type}')">Deactivate</button>`
            : `<button class="un-btn-toggle un-btn-activate"   onclick="unToggleStatus('${user.uid}','inactive','${user._type}')">Activate</button>`;

        const avatarContent = user.photoURL
            ? `<img src="${user.photoURL}" alt="${_esc(initial)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
            : initial;

        return `
        <tr data-uid="${user.uid}" data-type="${user._type}">
            <td>
                <div class="un-user-cell">
                    <div class="un-avatar ${user._type === 'client' ? 'un-avatar-client' : ''}">${avatarContent}</div>
                    <span class="un-user-name">${_esc(name)}</span>
                </div>
            </td>
            <td style="color:#6b7280;font-size:13px;">${_esc(user.email)}</td>
            <td>${typeBadge}</td>
            <td>${roleBadge}</td>
            <td>${statusBadge}</td>
            <td>
                <div class="un-actions">
                    <button class="un-btn-view" onclick="unViewProfile('${user.uid}','${user._type}')">
                        <i data-lucide="eye" style="width:13px;height:13px;"></i> View
                    </button>
                    ${toggleBtn}
                </div>
            </td>
        </tr>`;
    }

    // ── Filter ───────────────────────────────────────────────
    window.unFilterUsers = function () {
        const q      = (document.getElementById('unSearchInput')?.value || '').toLowerCase().trim();
        const type   = document.getElementById('unTypeFilter')?.value   || '';
        const role   = document.getElementById('unRoleFilter')?.value   || '';
        const status = document.getElementById('unStatusFilter')?.value || '';

        const filtered = _allUsers.filter(u => {
            const name  = (u.name || _nameFromEmail(u.email)).toLowerCase();
            const email = (u.email || '').toLowerCase();
            const matchSearch = !q      || name.includes(q) || email.includes(q);
            const matchType   = !type   || u._type === type;
            const matchRole   = !role   || u.role === role;
            const matchStatus = !status || u.status === status;
            return matchSearch && matchType && matchRole && matchStatus;
        });

        _renderTable(filtered);
    };

    // ── Toggle status ────────────────────────────────────────
    window.unToggleStatus = async function (uid, currentStatus, userType) {
        const newStatus  = currentStatus === 'active' ? 'inactive' : 'active';
        const collection = userType === 'client' ? 'clientUsers' : 'users';
        try {
            await db.collection(collection).doc(uid).update({ status: newStatus });
            const user = _allUsers.find(u => u.uid === uid);
            if (user) user.status = newStatus;
            _renderStats(_allUsers);
            unFilterUsers();
        } catch (err) {
            console.error('UserNavigator: toggle status failed', err);
            alert('Could not update user status. Please try again.');
        }
    };

    // ── View Profile Modal ────────────────────────────────────
    window.unViewProfile = function (uid, userType) {
        const user = _allUsers.find(u => u.uid === uid && u._type === userType);
        if (!user) return;

        const name    = user.name || _nameFromEmail(user.email);
        const initial = (name[0] || 'U').toUpperCase();

        const avatar = document.getElementById('unModalAvatar');
        const nameEl = document.getElementById('unModalName');
        const badge  = document.getElementById('unModalRoleBadge');

        if (avatar) {
            avatar.className = `un-modal-avatar${user._type === 'client' ? ' un-avatar-client' : ''}`;
            if (user.photoURL) {
                avatar.innerHTML = `<img src="${user.photoURL}" alt="${_esc(initial)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
            } else {
                avatar.textContent = initial;
            }
        }
        if (nameEl) nameEl.textContent = name;
        if (badge) {
            badge.textContent = _roleLabel(user.role);
            badge.className   = `un-role-badge ${_roleClass(user.role)}`;
        }

        const body = document.getElementById('unProfileBody');
        if (body) {
            body.innerHTML = `
                <div class="un-profile-section">
                    <div class="un-profile-section-title">Account Info</div>
                    <div class="un-profile-row">
                        <span class="un-profile-label">Full Name</span>
                        <span class="un-profile-value">${_esc(name)}</span>
                    </div>
                    <div class="un-profile-row">
                        <span class="un-profile-label">Email</span>
                        <span class="un-profile-value">${_esc(user.email)}</span>
                    </div>
                    <div class="un-profile-row">
                        <span class="un-profile-label">User Type</span>
                        <span class="un-profile-value">${_typeBadge(user._type)}</span>
                    </div>
                    <div class="un-profile-row">
                        <span class="un-profile-label">Role</span>
                        <span class="un-profile-value"><span class="un-role-badge ${_roleClass(user.role)}">${_roleLabel(user.role)}</span></span>
                    </div>
                    <div class="un-profile-row">
                        <span class="un-profile-label">Status</span>
                        <span class="un-profile-value">${_statusBadge(user.status)}</span>
                    </div>
                </div>
                <div class="un-profile-section">
                    <div class="un-profile-section-title">Registration</div>
                    <div class="un-profile-row">
                        <span class="un-profile-label">Registered</span>
                        <span class="un-profile-value">${_formatDate(user.createdAt)}</span>
                    </div>
                    <div class="un-profile-row">
                        <span class="un-profile-label">User ID</span>
                        <span class="un-profile-value" style="font-size:11px;color:#9ca3af;word-break:break-all;">${uid}</span>
                    </div>
                </div>
                <div class="un-modal-footer" style="padding:0;margin-top:8px;border:none;display:flex;justify-content:flex-end;gap:10px;">
                    <button class="un-btn-toggle ${user.status === 'active' ? 'un-btn-deactivate' : 'un-btn-activate'}"
                        onclick="unToggleStatus('${uid}','${user.status}','${user._type}');unCloseProfile();">
                        ${user.status === 'active' ? 'Deactivate User' : 'Activate User'}
                    </button>
                    <button class="un-modal-btn-close" onclick="unCloseProfile()">Close</button>
                </div>`;
        }

        const modal = document.getElementById('unProfileModal');
        if (modal) {
            modal.style.display = 'flex';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    };

    window.unCloseProfile = function () {
        const modal = document.getElementById('unProfileModal');
        if (modal) modal.style.display = 'none';
    };

    // ── Error / warning states ────────────────────────────────
    function _showPermissionError() {
        const wrap = document.getElementById('unLoadingState');
        if (!wrap) return;
        wrap.style.display = 'flex';
        wrap.innerHTML = `
            <div style="text-align:center;max-width:480px;">
                <div style="font-size:32px;margin-bottom:10px;">🔒</div>
                <p style="font-weight:700;color:#b91c1c;font-size:15px;margin-bottom:6px;">Firestore Permission Denied</p>
                <p style="color:#6b7280;font-size:13px;line-height:1.6;">
                    Your Firestore security rules do not allow listing the
                    <code style="background:#f3f4f6;padding:1px 5px;border-radius:4px;">users</code> and
                    <code style="background:#f3f4f6;padding:1px 5px;border-radius:4px;">clientUsers</code> collections.<br><br>
                    Go to <b>Firebase Console → Firestore → Rules</b> and add the rules shown below.
                </p>
                <pre style="background:#1e1e2e;color:#a6e3a1;padding:14px 16px;border-radius:10px;font-size:11.5px;text-align:left;margin-top:12px;overflow-x:auto;line-height:1.7;">match /users/{uid} {
  allow read: if request.auth != null;
}
match /clientUsers/{uid} {
  allow read: if request.auth != null;
}</pre>
            </div>`;
    }

    function _showPartialWarning(msg) {
        const wrap = document.getElementById('unTableWrap') || document.querySelector('.un-table-wrap');
        if (!wrap) return;
        const el = document.createElement('div');
        el.style.cssText = 'padding:10px 18px;background:#fef9c3;border-bottom:1px solid #fde047;font-size:12.5px;color:#854d0e;display:flex;align-items:center;gap:8px;';
        el.innerHTML = `⚠️ ${msg}`;
        wrap.prepend(el);
    }

    // ── Helpers ───────────────────────────────────────────────
    function _showLoading(on) {
        const loading = document.getElementById('unLoadingState');
        const table   = document.getElementById('unTable');
        const empty   = document.getElementById('unEmptyState');
        if (on) {
            if (loading) { loading.style.display = 'flex'; loading.innerHTML = '<div class="un-loading-spinner"></div><span>Loading users…</span>'; }
            if (table)   table.style.display   = 'none';
            if (empty)   empty.style.display   = 'none';
        } else {
            if (loading) loading.style.display = 'none';
        }
    }

    function _setText(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    function _tsToMs(ts) {
        if (!ts) return 0;
        if (typeof ts.toDate === 'function') return ts.toDate().getTime();
        if (ts instanceof Date) return ts.getTime();
        if (typeof ts === 'number') return ts;
        return new Date(ts).getTime() || 0;
    }

    function _nameFromEmail(email) {
        if (!email) return 'Unknown';
        return email.split('@')[0].replace(/[._-]/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase());
    }

    function _esc(str) {
        return String(str || '')
            .replace(/&/g,'&amp;').replace(/</g,'&lt;')
            .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function _typeBadge(type) {
        return type === 'client'
            ? `<span class="un-type-badge un-type-client">Client</span>`
            : `<span class="un-type-badge un-type-admin">Admin</span>`;
    }

    function _roleLabel(role) {
        const map = { owner:'Owner', staff:'Staff', worker:'Worker',
                      teamLeader:'Team Leader', engineer:'Engineer', client:'Client' };
        return map[role] || (role ? role.charAt(0).toUpperCase() + role.slice(1) : 'User');
    }

    function _roleClass(role) {
        const map = { owner:'un-role-owner', staff:'un-role-staff',
                      worker:'un-role-worker', teamLeader:'un-role-teamleader',
                      engineer:'un-role-engineer', client:'un-role-client' };
        return map[role] || 'un-role-default';
    }

    function _statusBadge(status) {
        return status === 'inactive'
            ? `<span class="un-status-badge un-status-inactive"><span class="un-status-dot"></span>Inactive</span>`
            : `<span class="un-status-badge un-status-active"><span class="un-status-dot"></span>Active</span>`;
    }


    function _formatDate(ts) {
        const ms = _tsToMs(ts);
        if (!ms) return '—';
        return new Date(ms).toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' });
    }

})();
=======
// ════════════════════════════════════════════════════════════
// USER NAVIGATOR MODULE
// Loads admin users (users collection) + client registrations
// (clientUsers collection) into one unified table.
// ════════════════════════════════════════════════════════════

(function () {
    'use strict';

    // ── State ────────────────────────────────────────────────
    let _allUsers  = [];
    let _loading   = false;   // guard against duplicate calls

    // ── Public entry point ───────────────────────────────────
    window.initUserNavigator = function () {
        if (_loading) return;
        _loadUsers();
    };

    // ── Load from both Firestore collections ─────────────────
    async function _loadUsers() {
        _loading = true;
        _showLoading(true);

        let adminUsers  = [];
        let clientUsers = [];
        let adminErr    = null;
        let clientErr   = null;

        // Load admin users — separate try/catch so one failure won't block the other
        try {
            const snap = await db.collection('users').get();
            adminUsers = snap.docs.map(doc => {
                const d = doc.data();
                return {
                    uid:       doc.id,
                    _type:     'admin',
                    name:      d.displayName || d.name || null,
                    email:     d.email || '',
                    role:      d.role || 'owner',
                    status:    d.status || 'active',
                    lastLogin: d.lastLogin || d.last_login || null,
                    createdAt: d.createdAt || null
                };
            });
        } catch (e) {
            adminErr = e;
            console.warn('UserNavigator: could not load admin users —', e.message);
        }

        // Load client users — no orderBy to avoid requiring a composite index
        try {
            const snap = await db.collection('clientUsers').get();
            clientUsers = snap.docs.map(doc => {
                const d = doc.data();
                return {
                    uid:       doc.id,
                    _type:     'client',
                    name:      ((d.firstName || '') + ' ' + (d.lastName || '')).trim() || null,
                    email:     d.email || '',
                    role:      'client',
                    status:    d.status || 'active',
                    photoURL:  d.photoURL || '',
                    lastLogin: d.lastLogin || null,
                    createdAt: d.createdAt || null
                };
            });
        } catch (e) {
            clientErr = e;
            console.warn('UserNavigator: could not load client users —', e.message);
        }

        _loading = false;
        _showLoading(false);

        // Both collections failed with permissions error
        if (adminErr && clientErr) {
            _showPermissionError();
            return;
        }

        // FIFO: latest registered appears first (newest at top)
        _allUsers = [...adminUsers, ...clientUsers].sort((a, b) =>
            _tsToMs(b.createdAt) - _tsToMs(a.createdAt)
        );
        _renderStats(_allUsers);
        _renderTable(_allUsers);

        // Warn in the UI if one collection was blocked (but still show the other)
        if (adminErr)  _showPartialWarning('Admin users could not be loaded — check Firestore rules for the <b>users</b> collection.');
        if (clientErr) _showPartialWarning('Client users could not be loaded — check Firestore rules for the <b>clientUsers</b> collection.');
    }

    // ── Stats cards ──────────────────────────────────────────
    function _renderStats(users) {
        const total    = users.length;
        const active   = users.filter(u => u.status === 'active').length;
        const inactive = total - active;
        _setText('unTotalCount',    total);
        _setText('unActiveCount',   active);
        _setText('unInactiveCount', inactive);
    }

    // ── Render table ─────────────────────────────────────────
    function _renderTable(users) {
        const tbody = document.getElementById('unTableBody');
        const table = document.getElementById('unTable');
        const empty = document.getElementById('unEmptyState');
        if (!tbody) return;

        if (users.length === 0) {
            if (table) table.style.display = 'none';
            if (empty) empty.style.display = 'flex';
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        if (table) table.style.display = 'table';
        if (empty) empty.style.display = 'none';

        tbody.innerHTML = users.map(u => _buildRow(u)).join('');
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    function _buildRow(user) {
        const name    = user.name || _nameFromEmail(user.email);
        const initial = (name[0] || 'U').toUpperCase();

        const typeBadge   = _typeBadge(user._type);
        const roleBadge   = `<span class="un-role-badge ${_roleClass(user.role)}">${_roleLabel(user.role)}</span>`;
        const statusBadge = _statusBadge(user.status);

        const toggleBtn = user.status === 'active'
            ? `<button class="un-btn-toggle un-btn-deactivate" onclick="unToggleStatus('${user.uid}','active','${user._type}')">Deactivate</button>`
            : `<button class="un-btn-toggle un-btn-activate"   onclick="unToggleStatus('${user.uid}','inactive','${user._type}')">Activate</button>`;

        const avatarContent = user.photoURL
            ? `<img src="${user.photoURL}" alt="${_esc(initial)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
            : initial;

        return `
        <tr data-uid="${user.uid}" data-type="${user._type}">
            <td>
                <div class="un-user-cell">
                    <div class="un-avatar ${user._type === 'client' ? 'un-avatar-client' : ''}">${avatarContent}</div>
                    <span class="un-user-name">${_esc(name)}</span>
                </div>
            </td>
            <td style="color:#6b7280;font-size:13px;">${_esc(user.email)}</td>
            <td>${typeBadge}</td>
            <td>${roleBadge}</td>
            <td>${statusBadge}</td>
            <td>
                <div class="un-actions">
                    <button class="un-btn-view" onclick="unViewProfile('${user.uid}','${user._type}')">
                        <i data-lucide="eye" style="width:13px;height:13px;"></i> View
                    </button>
                    ${toggleBtn}
                </div>
            </td>
        </tr>`;
    }

    // ── Filter ───────────────────────────────────────────────
    window.unFilterUsers = function () {
        const q      = (document.getElementById('unSearchInput')?.value || '').toLowerCase().trim();
        const type   = document.getElementById('unTypeFilter')?.value   || '';
        const role   = document.getElementById('unRoleFilter')?.value   || '';
        const status = document.getElementById('unStatusFilter')?.value || '';

        const filtered = _allUsers.filter(u => {
            const name  = (u.name || _nameFromEmail(u.email)).toLowerCase();
            const email = (u.email || '').toLowerCase();
            const matchSearch = !q      || name.includes(q) || email.includes(q);
            const matchType   = !type   || u._type === type;
            const matchRole   = !role   || u.role === role;
            const matchStatus = !status || u.status === status;
            return matchSearch && matchType && matchRole && matchStatus;
        });

        _renderTable(filtered);
    };

    // ── Toggle status ────────────────────────────────────────
    window.unToggleStatus = async function (uid, currentStatus, userType) {
        const newStatus  = currentStatus === 'active' ? 'inactive' : 'active';
        const collection = userType === 'client' ? 'clientUsers' : 'users';
        try {
            await db.collection(collection).doc(uid).update({ status: newStatus });
            const user = _allUsers.find(u => u.uid === uid);
            if (user) user.status = newStatus;
            _renderStats(_allUsers);
            unFilterUsers();
        } catch (err) {
            console.error('UserNavigator: toggle status failed', err);
            alert('Could not update user status. Please try again.');
        }
    };

    // ── View Profile Modal ────────────────────────────────────
    window.unViewProfile = function (uid, userType) {
        const user = _allUsers.find(u => u.uid === uid && u._type === userType);
        if (!user) return;

        const name    = user.name || _nameFromEmail(user.email);
        const initial = (name[0] || 'U').toUpperCase();

        const avatar = document.getElementById('unModalAvatar');
        const nameEl = document.getElementById('unModalName');
        const badge  = document.getElementById('unModalRoleBadge');

        if (avatar) {
            avatar.className = `un-modal-avatar${user._type === 'client' ? ' un-avatar-client' : ''}`;
            if (user.photoURL) {
                avatar.innerHTML = `<img src="${user.photoURL}" alt="${_esc(initial)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
            } else {
                avatar.textContent = initial;
            }
        }
        if (nameEl) nameEl.textContent = name;
        if (badge) {
            badge.textContent = _roleLabel(user.role);
            badge.className   = `un-role-badge ${_roleClass(user.role)}`;
        }

        const body = document.getElementById('unProfileBody');
        if (body) {
            body.innerHTML = `
                <div class="un-profile-section">
                    <div class="un-profile-section-title">Account Info</div>
                    <div class="un-profile-row">
                        <span class="un-profile-label">Full Name</span>
                        <span class="un-profile-value">${_esc(name)}</span>
                    </div>
                    <div class="un-profile-row">
                        <span class="un-profile-label">Email</span>
                        <span class="un-profile-value">${_esc(user.email)}</span>
                    </div>
                    <div class="un-profile-row">
                        <span class="un-profile-label">User Type</span>
                        <span class="un-profile-value">${_typeBadge(user._type)}</span>
                    </div>
                    <div class="un-profile-row">
                        <span class="un-profile-label">Role</span>
                        <span class="un-profile-value"><span class="un-role-badge ${_roleClass(user.role)}">${_roleLabel(user.role)}</span></span>
                    </div>
                    <div class="un-profile-row">
                        <span class="un-profile-label">Status</span>
                        <span class="un-profile-value">${_statusBadge(user.status)}</span>
                    </div>
                </div>
                <div class="un-profile-section">
                    <div class="un-profile-section-title">Registration</div>
                    <div class="un-profile-row">
                        <span class="un-profile-label">Registered</span>
                        <span class="un-profile-value">${_formatDate(user.createdAt)}</span>
                    </div>
                    <div class="un-profile-row">
                        <span class="un-profile-label">User ID</span>
                        <span class="un-profile-value" style="font-size:11px;color:#9ca3af;word-break:break-all;">${uid}</span>
                    </div>
                </div>
                <div class="un-modal-footer" style="padding:0;margin-top:8px;border:none;display:flex;justify-content:flex-end;gap:10px;">
                    <button class="un-btn-toggle ${user.status === 'active' ? 'un-btn-deactivate' : 'un-btn-activate'}"
                        onclick="unToggleStatus('${uid}','${user.status}','${user._type}');unCloseProfile();">
                        ${user.status === 'active' ? 'Deactivate User' : 'Activate User'}
                    </button>
                    <button class="un-modal-btn-close" onclick="unCloseProfile()">Close</button>
                </div>`;
        }

        const modal = document.getElementById('unProfileModal');
        if (modal) {
            modal.style.display = 'flex';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    };

    window.unCloseProfile = function () {
        const modal = document.getElementById('unProfileModal');
        if (modal) modal.style.display = 'none';
    };

    // ── Error / warning states ────────────────────────────────
    function _showPermissionError() {
        const wrap = document.getElementById('unLoadingState');
        if (!wrap) return;
        wrap.style.display = 'flex';
        wrap.innerHTML = `
            <div style="text-align:center;max-width:480px;">
                <div style="font-size:32px;margin-bottom:10px;">🔒</div>
                <p style="font-weight:700;color:#b91c1c;font-size:15px;margin-bottom:6px;">Firestore Permission Denied</p>
                <p style="color:#6b7280;font-size:13px;line-height:1.6;">
                    Your Firestore security rules do not allow listing the
                    <code style="background:#f3f4f6;padding:1px 5px;border-radius:4px;">users</code> and
                    <code style="background:#f3f4f6;padding:1px 5px;border-radius:4px;">clientUsers</code> collections.<br><br>
                    Go to <b>Firebase Console → Firestore → Rules</b> and add the rules shown below.
                </p>
                <pre style="background:#1e1e2e;color:#a6e3a1;padding:14px 16px;border-radius:10px;font-size:11.5px;text-align:left;margin-top:12px;overflow-x:auto;line-height:1.7;">match /users/{uid} {
  allow read: if request.auth != null;
}
match /clientUsers/{uid} {
  allow read: if request.auth != null;
}</pre>
            </div>`;
    }

    function _showPartialWarning(msg) {
        const wrap = document.getElementById('unTableWrap') || document.querySelector('.un-table-wrap');
        if (!wrap) return;
        const el = document.createElement('div');
        el.style.cssText = 'padding:10px 18px;background:#fef9c3;border-bottom:1px solid #fde047;font-size:12.5px;color:#854d0e;display:flex;align-items:center;gap:8px;';
        el.innerHTML = `⚠️ ${msg}`;
        wrap.prepend(el);
    }

    // ── Helpers ───────────────────────────────────────────────
    function _showLoading(on) {
        const loading = document.getElementById('unLoadingState');
        const table   = document.getElementById('unTable');
        const empty   = document.getElementById('unEmptyState');
        if (on) {
            if (loading) { loading.style.display = 'flex'; loading.innerHTML = '<div class="un-loading-spinner"></div><span>Loading users…</span>'; }
            if (table)   table.style.display   = 'none';
            if (empty)   empty.style.display   = 'none';
        } else {
            if (loading) loading.style.display = 'none';
        }
    }

    function _setText(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    function _tsToMs(ts) {
        if (!ts) return 0;
        if (typeof ts.toDate === 'function') return ts.toDate().getTime();
        if (ts instanceof Date) return ts.getTime();
        if (typeof ts === 'number') return ts;
        return new Date(ts).getTime() || 0;
    }

    function _nameFromEmail(email) {
        if (!email) return 'Unknown';
        return email.split('@')[0].replace(/[._-]/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase());
    }

    function _esc(str) {
        return String(str || '')
            .replace(/&/g,'&amp;').replace(/</g,'&lt;')
            .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function _typeBadge(type) {
        return type === 'client'
            ? `<span class="un-type-badge un-type-client">Client</span>`
            : `<span class="un-type-badge un-type-admin">Admin</span>`;
    }

    function _roleLabel(role) {
        const map = { owner:'Owner', staff:'Staff', worker:'Worker',
                      teamLeader:'Team Leader', engineer:'Engineer', client:'Client' };
        return map[role] || (role ? role.charAt(0).toUpperCase() + role.slice(1) : 'User');
    }

    function _roleClass(role) {
        const map = { owner:'un-role-owner', staff:'un-role-staff',
                      worker:'un-role-worker', teamLeader:'un-role-teamleader',
                      engineer:'un-role-engineer', client:'un-role-client' };
        return map[role] || 'un-role-default';
    }

    function _statusBadge(status) {
        return status === 'inactive'
            ? `<span class="un-status-badge un-status-inactive"><span class="un-status-dot"></span>Inactive</span>`
            : `<span class="un-status-badge un-status-active"><span class="un-status-dot"></span>Active</span>`;
    }


    function _formatDate(ts) {
        const ms = _tsToMs(ts);
        if (!ms) return '—';
        return new Date(ms).toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' });
    }

})();
>>>>>>> f75981c5053db8cd901b052df2a28c208b2225af
