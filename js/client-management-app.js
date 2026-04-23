// ════════════════════════════════════════════════════════════════
// CLIENT MANAGEMENT PORTAL — Construction Cost-Plus System
// Separate from client-app.js (design services portal).
// Uses the `constructionClientUsers` Firestore collection.
// ════════════════════════════════════════════════════════════════

'use strict';

// ── State ────────────────────────────────────────────────────────
let cmCurrentUser     = null;
let cmCurrentProfile  = null;
let cmProjectData     = null;   // linked construction project
let cmWeeklyBills     = [];
let cmProgressLogs    = [];
let cmRevolvingFund   = null;
let _cmNotifUnsub     = null;
let _cmBillUnsub      = null;
let _cmNotifications  = [];
let _cmFirestoreNotifs= [];
let cmSidebarOpen     = true;

const CM_COLLECTION = 'constructionClientUsers';

// ── Helpers ──────────────────────────────────────────────────────
function cmFmt(n) {
    return '₱' + (Number(n) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function cmEsc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function cmSet(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }
function cmErr(id, v) { const el = document.getElementById(id); if (!el) return; el.textContent = v; el.classList.add('show'); }
function cmClear(id) { const el = document.getElementById(id); if (!el) return; el.textContent = ''; el.classList.remove('show'); }
function cmIsValid(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }

// ── Auth State ───────────────────────────────────────────────────
auth.onAuthStateChanged(async function(user) {
    if (user) {
        try {
            const doc = await db.collection(CM_COLLECTION).doc(user.uid).get();
            if (!doc.exists) {
                await auth.signOut();
                cmCurrentUser = null;
                cmShowLogin();
                cmShowLoginError('Access denied. This account is not registered as a construction management client.');
                return;
            }
        } catch (err) {
            console.error('CM auth check:', err);
            await auth.signOut();
            cmCurrentUser = null;
            cmShowLogin();
            cmShowLoginError('Unable to verify your account. Please try again.');
            return;
        }

        cmCurrentUser = user;
        try {
            await Promise.all([cmLoadProfile(user), cmLoadProjectData(user)]);
            cmEnterDashboard();
        } catch (err) {
            console.error('CM portal load error:', err);
            cmShowToast('Error loading data. Please refresh.');
        }
    } else {
        cmCurrentUser = null;
        cmShowLogin();
    }
});

// ── Show Login ───────────────────────────────────────────────────
function cmShowLogin() {
    document.getElementById('dashboard-page').classList.remove('active');
    document.getElementById('login-page').classList.add('active');
    document.getElementById('login-email').value = '';
    document.getElementById('login-password').value = '';
    cmClearLoginErrors();
    switchToLogin();
    if (_cmBillUnsub)   { _cmBillUnsub();   _cmBillUnsub   = null; }
    if (_cmNotifUnsub)  { _cmNotifUnsub();  _cmNotifUnsub  = null; }
    cmCurrentUser = null; cmCurrentProfile = null; cmProjectData = null;
}

function cmShowLoginError(msg) {
    const el = document.getElementById('login-error');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
}

function cmClearLoginErrors() {
    ['login-error','err-login-email','err-login-password'].forEach(cmClear);
}

function cmClearSignupErrors() {
    ['err-su-firstname','err-su-lastname','err-su-email','err-su-password','err-su-confirm'].forEach(cmClear);
}

// ── Demo Account ─────────────────────────────────────────────────
const CM_DEMO_EMAIL = 'demo@dacs.com';
const CM_DEMO_PASS  = 'demo1234';

function cmLoadDemoData() {
    cmCurrentUser = { uid: 'demo-uid', email: CM_DEMO_EMAIL, isDemo: true };
    cmCurrentProfile = {
        firstName : 'Juan',
        lastName  : 'Dela Cruz',
        email     : CM_DEMO_EMAIL,
        photoURL   : null,
        createdAt  : { toDate: () => new Date('2025-01-15') }
    };
    cmProjectData = {
        id          : 'demo-project',
        projectName : 'Dela Cruz Residence',
        location    : 'Quezon City, Metro Manila',
        startDate   : '2025-02-01',
        clientEmail : CM_DEMO_EMAIL,
        status      : 'Active'
    };
    cmWeeklyBills = [
        {
            weekEndingDate   : '2025-04-18',
            labor            : 45000,
            materials        : 62000,
            delivery         : 3500,
            consumables      : 1200,
            other            : 800,
            directCostTotal  : 112500,
            managementFeeRate: 0.15,
            managementFee    : 16875,
            totalDue         : 129375,
            status           : 'Overdue'
        },
        {
            weekEndingDate   : '2025-04-11',
            labor            : 42000,
            materials        : 55000,
            delivery         : 2800,
            consumables      : 900,
            other            : 500,
            directCostTotal  : 101200,
            managementFeeRate: 0.15,
            managementFee    : 15180,
            totalDue         : 116380,
            status           : 'Paid'
        },
        {
            weekEndingDate   : '2025-04-04',
            labor            : 38000,
            materials        : 48500,
            delivery         : 2200,
            consumables      : 750,
            other            : 300,
            directCostTotal  : 89750,
            managementFeeRate: 0.15,
            managementFee    : 13462.5,
            totalDue         : 103212.5,
            status           : 'Paid'
        },
        {
            weekEndingDate   : '2025-03-28',
            labor            : 40000,
            materials        : 51000,
            delivery         : 2500,
            consumables      : 850,
            other            : 400,
            directCostTotal  : 94750,
            managementFeeRate: 0.15,
            managementFee    : 14212.5,
            totalDue         : 108962.5,
            status           : 'Paid'
        },
        {
            weekEndingDate   : '2025-03-21',
            labor            : 35000,
            materials        : 44000,
            delivery         : 1800,
            consumables      : 600,
            other            : 200,
            directCostTotal  : 81600,
            managementFeeRate: 0.15,
            managementFee    : 12240,
            totalDue         : 93840,
            status           : 'Paid'
        }
    ];
    cmProgressLogs = [
        {
            date          : '2025-04-18',
            weather       : 'Sunny',
            workDone      : 'Completed second-floor slab formwork. Rebar installation at 70%.',
            materialsUsed : '50 bags cement, 2 tons rebar',
            nextDayPlan   : 'Continue rebar work and start concrete pouring for slab.',
            visibleToClient: true,
            photos        : []
        },
        {
            date          : '2025-04-17',
            weather       : 'Partly Cloudy',
            workDone      : 'Installed electrical conduits on ground floor. Plumbing rough-in complete.',
            materialsUsed : 'PVC conduit 50 pcs, copper wire 200m',
            nextDayPlan   : 'Formwork for second floor columns.',
            visibleToClient: true,
            photos        : []
        }
    ];
    cmRevolvingFund = { initialAmount: 100000, currentBalance: 42350 };
}

// ── Login ────────────────────────────────────────────────────────
window.doLogin = async function() {
    cmClearLoginErrors();
    const email = document.getElementById('login-email').value.trim();
    const pass  = document.getElementById('login-password').value;
    let valid = true;

    if (!email)              { cmErr('err-login-email',    'Please enter your email address.');               valid = false; }
    else if (!cmIsValid(email)){ cmErr('err-login-email',  'That email doesn\'t look right.');                valid = false; }
    if (!pass)               { cmErr('err-login-password', 'Please enter your password.');                    valid = false; }
    if (!valid) return;

    // ── Demo bypass ──────────────────────────────────────────────
    if (email === CM_DEMO_EMAIL && pass === CM_DEMO_PASS) {
        const btn = document.getElementById('btn-login');
        btn.disabled = true; btn.textContent = 'Loading demo…';
        setTimeout(() => {
            cmLoadDemoData();
            cmEnterDashboard();
            btn.disabled = false; btn.textContent = 'Sign In';
        }, 600);
        return;
    }

    const btn = document.getElementById('btn-login');
    btn.disabled = true; btn.textContent = 'Signing in…';

    try {
        await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
        await auth.signInWithEmailAndPassword(email, pass);
        // onAuthStateChanged handles the rest
    } catch (err) {
        const el = document.getElementById('login-error');
        if (err.code === 'auth/user-not-found')      el.textContent = 'No account found with that email.';
        else if (err.code === 'auth/wrong-password')  el.textContent = 'Wrong password. Please try again.';
        else if (err.code === 'auth/too-many-requests') el.textContent = 'Too many failed attempts. Please wait.';
        else if (err.code === 'auth/invalid-credential') el.textContent = 'Incorrect email or password. Please try again.';
        else                                          el.textContent = 'Incorrect email or password. Please try again.';
        if (el) el.classList.add('show');
        btn.disabled = false; btn.textContent = 'Sign In';
    }
};

// ── Sign Up ──────────────────────────────────────────────────────
window.doSignup = async function() {
    cmClearSignupErrors();
    const firstName = document.getElementById('su-firstname').value.trim();
    const lastName  = document.getElementById('su-lastname').value.trim();
    const email     = document.getElementById('su-email').value.trim();
    const password  = document.getElementById('su-password').value;
    const confirm   = document.getElementById('su-confirm').value;
    let valid = true;

    if (!firstName)                { cmErr('err-su-firstname', 'Please enter your first name.');       valid = false; }
    if (!lastName)                 { cmErr('err-su-lastname',  'Please enter your last name.');        valid = false; }
    if (!email)                    { cmErr('err-su-email',     'Please enter your email address.');    valid = false; }
    else if (!cmIsValid(email))    { cmErr('err-su-email',     'Enter a valid email address.');        valid = false; }
    if (!password)                 { cmErr('err-su-password',  'Please create a password.');           valid = false; }
    else if (password.length < 8)  { cmErr('err-su-password',  'Password must be at least 8 characters.'); valid = false; }
    if (!confirm)                  { cmErr('err-su-confirm',   'Please re-enter your password.');      valid = false; }
    else if (confirm !== password) { cmErr('err-su-confirm',   'Passwords don\'t match.');             valid = false; }
    if (!valid) return;

    const btn = document.getElementById('btn-signup');
    btn.disabled = true; btn.textContent = 'Creating account…';

    try {
        await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        await db.collection(CM_COLLECTION).doc(cred.user.uid).set({
            firstName, lastName, email,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            role: 'client'
        });
        // onAuthStateChanged handles the rest
    } catch (err) {
        let msg = 'Something went wrong. Please try again.';
        if (err.code === 'auth/email-already-in-use') msg = 'An account with this email already exists. Try signing in.';
        if (err.code === 'auth/weak-password')        msg = 'Password is too weak. Choose a stronger one.';
        cmErr('err-su-email', msg);
        btn.disabled = false; btn.textContent = 'Create Account';
    }
};

// ── Logout ───────────────────────────────────────────────────────
window.confirmLogout = function() { document.getElementById('logout-modal').classList.add('show'); };
window.closeLogoutModal = function(e) {
    if (e && e.target !== document.getElementById('logout-modal')) return;
    document.getElementById('logout-modal').classList.remove('show');
};
window.doLogout = async function() {
    window.closeLogoutModal();
    if (_cmBillUnsub)  { _cmBillUnsub();  _cmBillUnsub  = null; }
    if (_cmNotifUnsub) { _cmNotifUnsub(); _cmNotifUnsub = null; }
    if (cmCurrentUser && cmCurrentUser.isDemo) {
        cmCurrentUser = null; cmCurrentProfile = null;
        cmProjectData = null; cmWeeklyBills = []; cmProgressLogs = [];
        cmShowLogin();
        return;
    }
    try { await auth.signOut(); } catch (err) { console.error(err); }
};

// ── Load Profile ─────────────────────────────────────────────────
async function cmLoadProfile(user) {
    try {
        const doc = await db.collection(CM_COLLECTION).doc(user.uid).get();
        cmCurrentProfile = doc.exists ? doc.data() : { firstName: 'Client', lastName: '', email: user.email };
    } catch (err) {
        cmCurrentProfile = { firstName: 'Client', lastName: '', email: user.email };
    }
}

// ── Load Project Data ─────────────────────────────────────────────
async function cmLoadProjectData(user) {
    try {
        // Find construction project(s) linked to this client email
        const snap = await db.collection('constructionProjects')
            .where('clientEmail', '==', user.email)
            .limit(1)
            .get();
        cmProjectData = snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };

        if (cmProjectData) {
            // Load weekly bills (exclude drafts)
            const billSnap = await db.collection('constructionProjects')
                .doc(cmProjectData.id)
                .collection('weeklyBills')
                .where('status', 'in', ['Submitted', 'Paid', 'Overdue'])
                .orderBy('weekEndingDate', 'desc')
                .get();
            cmWeeklyBills = billSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            // Load revolving fund
            const rfSnap = await db.collection('constructionProjects')
                .doc(cmProjectData.id)
                .collection('revolvingFund')
                .limit(1)
                .get();
            cmRevolvingFund = rfSnap.empty ? null : rfSnap.docs[0].data();

            // Load progress logs visible to client
            const logSnap = await db.collection('constructionProjects')
                .doc(cmProjectData.id)
                .collection('dailyLogs')
                .where('visibleToClient', '==', true)
                .orderBy('date', 'desc')
                .limit(30)
                .get();
            cmProgressLogs = logSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        }
    } catch (err) {
        console.warn('CM project data load:', err.message);
        // Non-blocking — dashboard will show empty state
    }
}

// ── Enter Dashboard ──────────────────────────────────────────────
function cmEnterDashboard() {
    document.getElementById('login-page').classList.remove('active');
    document.getElementById('dashboard-page').classList.add('active');

    cmRefreshUserDisplay();

    if (window.innerWidth > 768) {
        document.getElementById('sidebar').classList.remove('closed');
        document.getElementById('main-content').classList.remove('expanded');
        cmSidebarOpen = true;
    }

    cmShowSection('dashboard');
    cmPopulateDashboard();
    cmPopulateWeeklyBilling();
    cmPopulateProcurementList();
    cmPopulateProgress();
    cmPopulateRevolvingFund();
    cmPopulateDocuments();
    cmSubscribeNotifications();

    if (localStorage.getItem('dac-dark') === '1') {
        document.body.classList.add('dark-mode');
        document.getElementById('icon-moon').style.display = 'none';
        document.getElementById('icon-sun').style.display  = '';
    }
}

// ── Refresh User Display ─────────────────────────────────────────
function cmRefreshUserDisplay() {
    const p  = cmCurrentProfile || {};
    const fn = p.firstName || 'Client';
    const ln = p.lastName  || '';
    const em = p.email || (cmCurrentUser?.email || '');
    const fullName = (fn + ' ' + ln).trim();
    const initials = ((fn[0] || '') + (ln[0] || '')).toUpperCase() || 'CL';

    const setAvatar = (id, ini, photo) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = photo ? '' : ini;
        if (photo) el.innerHTML = `<img src="${photo}" alt="avatar" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" onerror="this.parentElement.textContent='${ini}'">`;
    };

    setAvatar('sidebar-avatar',    initials, p.photoURL);
    cmSet('sidebar-name',  fullName);
    cmSet('sidebar-email', em);
    setAvatar('topbar-avatar',     initials, p.photoURL);
    cmSet('topbar-name',   fn);
    setAvatar('profile-avatar-lg', initials, p.photoURL);
    cmSet('profile-fullname',      fullName);
    cmSet('profile-email-display', em);
    cmSet('pf-name',  fullName);
    cmSet('pf-email', em);

    const since = p.createdAt?.toDate
        ? p.createdAt.toDate().toLocaleDateString('en-PH', { year:'numeric', month:'long', day:'numeric' })
        : '—';
    cmSet('pf-since', since);
}

// ── Section Navigation ───────────────────────────────────────────
const CM_SECTION_TITLES = {
    dashboard        : 'Dashboard',
    billing          : 'Payment',
    'weekly-billing' : 'Weekly Summary',
    'procurement-list': 'Materials Procurement List',
    'revolving-fund' : 'Revolving Fund',
    progress         : 'Progress & Photos',
    notifications    : 'Notifications',
    documents        : 'Documents',
    profile          : 'Profile'
};

window.showSection = function(id) {
    document.querySelectorAll('.sub-page').forEach(el => el.classList.remove('active'));
    const target = document.getElementById('section-' + id);
    if (target) target.classList.add('active');
    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.remove('active');
        const oc = el.getAttribute('onclick') || '';
        if (oc.includes("'" + id + "'") || oc.includes('"' + id + '"')) el.classList.add('active');
    });
    const title = CM_SECTION_TITLES[id] || id;
    cmSet('topbar-title', title);

    if (id === 'weekly-billing')    cmPopulateWeeklyBilling();
    if (id === 'procurement-list')  cmPopulateProcurementList();
    if (id === 'progress')          cmPopulateProgress();
    if (id === 'revolving-fund')    cmPopulateRevolvingFund();
    if (id === 'documents')         cmPopulateDocuments();
    if (id === 'notifications')     cmRenderNotifHistory();
    if (id === 'billing' && typeof initClientPayment === 'function') initClientPayment();

    if (window.innerWidth <= 768) cmCloseSidebar();
};

function cmShowSection(id) { window.showSection(id); }

// ── Dashboard ─────────────────────────────────────────────────────
function cmPopulateDashboard() {
    const proj = cmProjectData;

    if (!proj) {
        const noProj = document.getElementById('no-project-state');
        const projContent = document.getElementById('project-content');
        if (noProj) noProj.style.display = '';
        if (projContent) projContent.style.display = 'none';
        cmSet('hero-design-pct', '₱0');
        cmSet('hero-design-sub', 'no overdue bills');
        cmSet('hero-billed-pct', '₱0');
        cmSet('hero-billed-sub', '0 bills paid');
        cmSet('hero-activity-count', '0');
        cmSet('kpi-labor-value', '₱0');
        cmSet('kpi-procurement-value', '₱0');
        cmSet('kpi-site-value', '₱0');
        return;
    }

    const noProj = document.getElementById('no-project-state');
    const projContent = document.getElementById('project-content');
    if (noProj) noProj.style.display = 'none';
    if (projContent) projContent.style.display = '';

    cmSet('dash-project-title', proj.projectName || 'Construction Project');
    cmSet('dash-project-sub', (proj.location || '') + (proj.startDate ? ' · Started ' + proj.startDate : ''));

    // Compute billing totals from weekly bills
    const paidBills = cmWeeklyBills.filter(b => b.status === 'Paid');
    const overdueBills = cmWeeklyBills.filter(b => b.status === 'Overdue');
    const totalBilled = cmWeeklyBills.reduce((s, b) => s + (b.totalDue || 0), 0);
    const totalPaid   = paidBills.reduce((s, b) => s + (b.totalDue || 0), 0);
    const outstanding = totalBilled - totalPaid;

    // Hero KPIs
    cmSet('hero-design-pct', cmFmt(outstanding));
    cmSet('hero-design-sub', overdueBills.length ? overdueBills.length + ' overdue bill(s)' : 'no overdue bills');
    cmSet('hero-billed-pct', cmFmt(totalPaid));
    cmSet('hero-billed-sub', paidBills.length + ' bill(s) paid');
    cmSet('hero-activity-count', cmWeeklyBills.length);
    cmSet('hero-activity-last', cmWeeklyBills.length ? 'latest: week of ' + (cmWeeklyBills[0].weekEndingDate || '—') : '—');

    // Stat cards
    cmSet('stat-budget', cmFmt(totalBilled));
    cmSet('stat-budget-sub', 'Total billed to date');
    cmSet('stat-usage', cmFmt(totalPaid));
    cmSet('stat-usage-sub', cmFmt(outstanding) + ' outstanding');
    cmSet('stat-progress', cmWeeklyBills.length + ' weeks');
    cmSet('stat-progress-sub', paidBills.length + ' paid · ' + overdueBills.length + ' overdue');

    // Scope of Services KPIs
    const totalLabor       = cmWeeklyBills.reduce((s, b) => s + (b.labor || 0), 0);
    const totalProcurement = cmWeeklyBills.reduce((s, b) =>
        s + (b.materials || 0) + (b.delivery || 0) + (b.consumables || 0) + (b.other || 0), 0);
    const totalSiteSupervision = totalLabor + totalProcurement;
    cmSet('kpi-labor-value', cmFmt(totalLabor));
    cmSet('kpi-labor-sub', cmWeeklyBills.length + ' week(s) of labor recorded');
    cmSet('kpi-procurement-value', cmFmt(totalProcurement));
    cmSet('kpi-procurement-sub', 'Materials, delivery & supplies');
    cmSet('kpi-site-value', cmFmt(totalSiteSupervision));
    cmSet('kpi-site-sub', 'Labor + Procurement total');

    // Bar — % paid
    const pctPaid = totalBilled > 0 ? Math.round((totalPaid / totalBilled) * 100) : 0;
    const barUsage = document.getElementById('bar-usage');
    if (barUsage) barUsage.style.width = pctPaid + '%';

    // Recent activity list
    const actList = document.getElementById('activity-list');
    if (actList) {
        if (!cmWeeklyBills.length) {
            actList.innerHTML = '<div class="empty-state"><p>No activity yet.</p></div>';
        } else {
            actList.innerHTML = cmWeeklyBills.slice(0, 5).map(b => {
                const statusColor = b.status === 'Paid' ? '#15803d' : b.status === 'Overdue' ? '#dc2626' : '#2563eb';
                return `<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid #f1f5f9;">
                    <div>
                        <div style="font-weight:600;font-size:14px;color:#1f2937;">Week ending ${cmEsc(b.weekEndingDate || '—')}</div>
                        <div style="font-size:12.5px;color:#9ca3af;margin-top:2px;">Direct costs + 15% mgmt fee</div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-weight:700;color:#1f2937;">${cmFmt(b.totalDue || 0)}</div>
                        <span style="font-size:11px;font-weight:700;color:${statusColor};">${cmEsc(b.status || '—')}</span>
                    </div>
                </div>`;
            }).join('');
        }
    }
}

// ── Weekly Billing ────────────────────────────────────────────────
function cmPopulateWeeklyBilling() {
    if (!cmProjectData) {
        cmSet('wb-sum-billed', '₱0');
        cmSet('wb-sum-paid', '₱0');
        cmSet('wb-sum-outstanding', '₱0');
        cmSet('wb-sum-fees', '₱0');
        const tbody = document.getElementById('wb-tbody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:32px;color:#b0c8bc;font-style:italic;">No project assigned yet.</td></tr>';
        return;
    }

    const bills = cmWeeklyBills;
    const totalBilled     = bills.reduce((s, b) => s + (b.totalDue || 0), 0);
    const totalPaid       = bills.filter(b => b.status === 'Paid').reduce((s, b) => s + (b.totalDue || 0), 0);
    const outstanding     = totalBilled - totalPaid;
    const totalFees       = bills.reduce((s, b) => s + (b.managementFee || 0), 0);
    const overdueBills    = bills.filter(b => b.status === 'Overdue');

    cmSet('wb-sum-billed',      cmFmt(totalBilled));
    cmSet('wb-sum-paid',        cmFmt(totalPaid));
    cmSet('wb-sum-outstanding', cmFmt(outstanding));
    cmSet('wb-sum-fees',        cmFmt(totalFees));

    // Overdue alert
    const alert = document.getElementById('wb-overdue-alert');
    const alertMsg = document.getElementById('wb-overdue-msg');
    if (alert && alertMsg) {
        if (overdueBills.length) {
            alertMsg.textContent = overdueBills.length + ' overdue bill(s). Payment was due within 24 hours of submission. Please settle immediately.';
            alert.style.display = 'flex';
            const badge = document.getElementById('weekly-overdue-badge');
            if (badge) { badge.textContent = overdueBills.length; badge.style.display = ''; }
        } else {
            alert.style.display = 'none';
        }
    }

    const tbody = document.getElementById('wb-tbody');
    if (!tbody) return;

    if (!bills.length) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:32px;color:#b0c8bc;font-style:italic;">No billing entries submitted yet.</td></tr>';
        return;
    }

    const statusStyles = {
        Paid:      { bg: '#dcfce7', color: '#15803d' },
        Submitted: { bg: '#dbeafe', color: '#1d4ed8' },
        Overdue:   { bg: '#fee2e2', color: '#dc2626' }
    };

    tbody.innerHTML = bills.map((b, i) => {
        const ss = statusStyles[b.status] || { bg: '#f3f4f6', color: '#6b7280' };
        const labor       = b.labor       || 0;
        const materials   = b.materials   || 0;
        const otherCosts  = (b.delivery   || 0) + (b.consumables || 0) + (b.other || 0);
        const directTotal = b.directCostTotal || (labor + materials + otherCosts);
        const mgmtFee     = b.managementFee   || (directTotal * (b.managementFeeRate || 0.15));
        const totalDue    = b.totalDue         || (directTotal + mgmtFee);

        return `<tr>
            <td><strong>${cmEsc(b.weekEndingDate || '—')}</strong><div style="font-size:11px;color:#9ca3af;">Week ${bills.length - i}</div></td>
            <td>${cmFmt(labor)}</td>
            <td>${cmFmt(materials)}</td>
            <td>${cmFmt(otherCosts)}</td>
            <td><strong>${cmFmt(directTotal)}</strong></td>
            <td style="color:#7c3aed;font-weight:600;">${cmFmt(mgmtFee)}</td>
            <td><strong style="font-size:15px;">${cmFmt(totalDue)}</strong></td>
            <td><span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:11.5px;font-weight:700;background:${ss.bg};color:${ss.color};">${cmEsc(b.status)}</span></td>
            <td><button onclick="openWBDetail(${JSON.stringify(b).replace(/'/g,'&#39;')})" style="padding:5px 12px;border-radius:7px;border:1.5px solid #d1fae5;background:#f0fdf4;color:#059669;font-size:12px;font-weight:600;cursor:pointer;">View</button></td>
        </tr>`;
    }).join('');
}

// ── Progress & Photos ─────────────────────────────────────────────
function cmPopulateProgress() {
    // Daily logs
    const logList = document.getElementById('progress-logs-list');
    if (logList) {
        if (!cmProgressLogs.length) {
            logList.innerHTML = '<div style="padding:40px;text-align:center;color:#9ca3af;font-size:14px;">No site logs shared yet.</div>';
        } else {
            logList.innerHTML = cmProgressLogs.map(log => `
                <div class="progress-log-item" style="padding:16px 22px;border-bottom:1px solid #f1f5f9;">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                        <strong style="font-size:14px;color:#1f2937;">${cmEsc(log.date || '—')}</strong>
                        <span style="font-size:12px;color:#9ca3af;">${cmEsc(log.weather || '')}</span>
                    </div>
                    <div style="font-size:13.5px;color:#374151;margin-bottom:6px;">${cmEsc(log.workDone || 'No details provided.')}</div>
                    ${log.materialsUsed ? `<div style="font-size:12.5px;color:#6b7280;">Materials used: ${cmEsc(log.materialsUsed)}</div>` : ''}
                    ${log.nextDayPlan  ? `<div style="font-size:12.5px;color:#6b7280;margin-top:4px;">Tomorrow: ${cmEsc(log.nextDayPlan)}</div>` : ''}
                </div>`).join('');
        }
    }

    // Photos
    const photoGrid = document.getElementById('progress-photos-grid');
    if (photoGrid) {
        const photos = cmProgressLogs.flatMap(l => (l.photos || []).map(p => ({ url: p, date: l.date })));
        cmSet('photo-count-badge', photos.length + ' Photo' + (photos.length !== 1 ? 's' : ''));
        if (!photos.length) {
            photoGrid.innerHTML = '<div style="padding:24px;text-align:center;color:#9ca3af;font-size:14px;grid-column:1/-1;">No progress photos yet.</div>';
        } else {
            photoGrid.innerHTML = photos.map(p => `
                <div onclick="openPhotoViewer('${cmEsc(p.url)}','${cmEsc(p.date)}')" style="cursor:pointer;border-radius:10px;overflow:hidden;aspect-ratio:1;background:#f3f4f6;">
                    <img src="${cmEsc(p.url)}" alt="Site photo" style="width:100%;height:100%;object-fit:cover;" loading="lazy" onerror="this.parentElement.innerHTML='<div style=\'display:flex;align-items:center;justify-content:center;height:100%;color:#9ca3af;\'>📷</div>'">
                </div>`).join('');
        }
    }

    // Walkthroughs
    const walkList = document.getElementById('walkthrough-list');
    if (walkList && cmProjectData) {
        db.collection('constructionProjects').doc(cmProjectData.id)
            .collection('walkthroughs')
            .orderBy('date', 'desc')
            .limit(10)
            .get()
            .then(snap => {
                if (snap.empty) {
                    walkList.innerHTML = '<div style="padding:32px;text-align:center;color:#9ca3af;font-size:14px;">No walkthroughs recorded yet.</div>';
                    return;
                }
                walkList.innerHTML = snap.docs.map(d => {
                    const w = d.data();
                    return `<div style="padding:16px 22px;border-bottom:1px solid #f1f5f9;">
                        <div style="font-weight:600;color:#1f2937;margin-bottom:4px;">${cmEsc(w.milestone || '—')} <span style="font-size:12px;color:#9ca3af;font-weight:400;">· ${cmEsc(w.date || '')}</span></div>
                        <div style="font-size:13.5px;color:#374151;margin-bottom:4px;">${cmEsc(w.discussed || '')}</div>
                        ${w.agreed ? `<div style="font-size:12.5px;color:#059669;font-weight:600;">Agreed: ${cmEsc(w.agreed)}</div>` : ''}
                    </div>`;
                }).join('');
            })
            .catch(() => { walkList.innerHTML = '<div style="padding:32px;text-align:center;color:#9ca3af;">Unable to load walkthroughs.</div>'; });
    }
}

// ── Revolving Fund ────────────────────────────────────────────────
function cmPopulateRevolvingFund() {
    const rf = cmRevolvingFund;
    const fundTotal   = rf ? (rf.fundAmount || 0) : 0;
    const spent       = rf ? (rf.totalSpent || 0) : 0;
    const balance     = rf ? (rf.currentBalance !== undefined ? rf.currentBalance : fundTotal - spent) : 0;
    const balancePct  = fundTotal > 0 ? Math.round((balance / fundTotal) * 100) : 0;

    cmSet('rf-balance',     cmFmt(balance));
    cmSet('rf-balance-pct', balancePct + '% of fund remaining');
    cmSet('rf-spent',       cmFmt(spent));
    cmSet('rf-total',       cmFmt(fundTotal));

    // Low balance alert (below 20%)
    const lowAlert = document.getElementById('rf-low-alert');
    const navBadge = document.getElementById('rf-low-badge');
    if (lowAlert) lowAlert.style.display = (fundTotal > 0 && balancePct < 20) ? 'flex' : 'none';
    if (navBadge) navBadge.style.display = (fundTotal > 0 && balancePct < 20) ? '' : 'none';

    if (!cmProjectData) {
        ['rf-replenish-tbody','rf-expense-tbody'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:24px;color:#b0c8bc;font-style:italic;">No project assigned.</td></tr>';
        });
        return;
    }

    // Replenishments
    db.collection('constructionProjects').doc(cmProjectData.id)
        .collection('revolvingFundReplenishments')
        .orderBy('date', 'desc')
        .get()
        .then(snap => {
            const tbody = document.getElementById('rf-replenish-tbody');
            if (!tbody) return;
            if (snap.empty) {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:24px;color:#b0c8bc;font-style:italic;">No replenishments yet.</td></tr>';
                return;
            }
            tbody.innerHTML = snap.docs.map(d => {
                const r = d.data();
                return `<tr>
                    <td>${cmEsc(r.date || '—')}</td>
                    <td style="font-weight:600;color:#15803d;">${cmFmt(r.amount || 0)}</td>
                    <td>${r.receiptsCount ? r.receiptsCount + ' receipt(s)' : '—'}</td>
                    <td>${cmEsc(r.remarks || '—')}</td>
                </tr>`;
            }).join('');
        }).catch(() => {});

    // Expenses
    db.collection('constructionProjects').doc(cmProjectData.id)
        .collection('revolvingFundExpenses')
        .orderBy('date', 'desc')
        .get()
        .then(snap => {
            const tbody = document.getElementById('rf-expense-tbody');
            if (!tbody) return;
            if (snap.empty) {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:24px;color:#b0c8bc;font-style:italic;">No expenses recorded yet.</td></tr>';
                return;
            }
            tbody.innerHTML = snap.docs.map(d => {
                const e = d.data();
                return `<tr>
                    <td>${cmEsc(e.date || '—')}</td>
                    <td>${cmEsc(e.item || '—')}</td>
                    <td style="font-weight:600;">${cmFmt(e.amount || 0)}</td>
                    <td>${e.receiptUrl ? `<button onclick="openPhotoViewer('${cmEsc(e.receiptUrl)}','Receipt: ${cmEsc(e.item)}')" style="padding:4px 10px;border-radius:6px;border:1px solid #d1fae5;background:#f0fdf4;color:#059669;font-size:12px;cursor:pointer;">View</button>` : '—'}</td>
                </tr>`;
            }).join('');
        }).catch(() => {});
}

// ── Documents ─────────────────────────────────────────────────────
function cmPopulateDocuments() {
    // Signed contract
    const contractSection = document.getElementById('docs-contract-section');
    if (contractSection) {
        if (cmProjectData && cmProjectData.contractUrl) {
            contractSection.innerHTML = `
                <div style="display:flex;align-items:center;gap:14px;padding:10px 0;">
                    <div style="width:44px;height:44px;border-radius:12px;background:#f0fdf4;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    </div>
                    <div style="flex:1;">
                        <div style="font-weight:700;color:#1f2937;">Project Management & Procurement Agreement</div>
                        <div style="font-size:12.5px;color:#9ca3af;margin-top:2px;">Signed contract · View only</div>
                    </div>
                    <a href="${cmEsc(cmProjectData.contractUrl)}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border-radius:8px;background:#059669;color:#fff;font-size:13px;font-weight:600;text-decoration:none;">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        View
                    </a>
                </div>`;
        } else {
            contractSection.innerHTML = '<div style="padding:12px 0;color:#9ca3af;font-size:14px;">No signed contract uploaded yet.</div>';
        }
    }

    // Invoices placeholder
    const invoiceList = document.getElementById('docs-invoice-list');
    if (invoiceList && !cmProjectData) {
        invoiceList.innerHTML = '<div style="padding:32px;text-align:center;color:#9ca3af;font-size:14px;">No project assigned.</div>';
    } else if (invoiceList) {
        invoiceList.innerHTML = '<div style="padding:32px;text-align:center;color:#9ca3af;font-size:14px;">Invoices will appear here after payments are verified.</div>';
    }

    // SOWA section
    const sowaSection = document.getElementById('docs-sowa-section');
    if (sowaSection) {
        sowaSection.innerHTML = '<div style="padding:12px 0;color:#9ca3af;font-size:14px;">No SOWA available yet.</div>';
    }
}

// ── Notifications ─────────────────────────────────────────────────
function cmSubscribeNotifications() {
    if (!cmCurrentUser) return;
    if (_cmNotifUnsub) { _cmNotifUnsub(); _cmNotifUnsub = null; }

    _cmNotifUnsub = db.collection('notifications')
        .where('userId', '==', cmCurrentUser.uid)
        .orderBy('createdAt', 'desc')
        .limit(30)
        .onSnapshot(snap => {
            _cmFirestoreNotifs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            cmUpdateNotifBadge();
            cmRenderNotifDropdown();
        }, err => { console.warn('CM notif subscribe:', err.message); });
}

function cmUpdateNotifBadge() {
    const unread = _cmFirestoreNotifs.filter(n => !n.read).length;
    const dot = document.getElementById('notif-dot');
    const navBadge = document.getElementById('notif-nav-badge');
    if (dot)      { dot.style.display      = unread ? '' : 'none'; }
    if (navBadge) { navBadge.style.display = unread ? '' : 'none'; navBadge.textContent = unread; }
}

function cmRenderNotifDropdown() {
    const list = document.getElementById('notif-list');
    if (!list) return;
    const notifs = _cmFirestoreNotifs.slice(0, 8);
    if (!notifs.length) {
        list.innerHTML = '<div style="padding:24px;text-align:center;color:#9ca3af;font-size:13px;">No notifications yet.</div>';
        return;
    }
    list.innerHTML = notifs.map(n => `
        <div style="padding:12px 16px;border-bottom:1px solid #f1f5f9;${n.read ? '' : 'background:#f0fdf4;'}cursor:pointer;" onclick="cmMarkRead('${n.id}')">
            <div style="font-size:13px;font-weight:${n.read ? '400' : '600'};color:#1f2937;">${cmEsc(n.message || n.title || '—')}</div>
            <div style="font-size:11.5px;color:#9ca3af;margin-top:3px;">${n.createdAt?.toDate ? n.createdAt.toDate().toLocaleDateString('en-PH') : '—'}</div>
        </div>`).join('');
}

async function cmMarkRead(notifId) {
    try { await db.collection('notifications').doc(notifId).update({ read: true }); } catch(e) {}
}

window.markAllRead = async function() {
    const unread = _cmFirestoreNotifs.filter(n => !n.read);
    await Promise.all(unread.map(n => cmMarkRead(n.id)));
};

window.renderNotifHistory = function cmRenderNotifHistory() {
    const el = document.getElementById('notif-history-list');
    if (!el) return;
    if (!_cmFirestoreNotifs.length) {
        el.innerHTML = '<div style="padding:48px;text-align:center;color:#9ca3af;"><div style="font-size:32px;margin-bottom:10px;">🔔</div><div style="font-weight:600;font-size:14px;">No notifications yet.</div></div>';
        return;
    }
    el.innerHTML = _cmFirestoreNotifs.map(n => `
        <div style="padding:16px 22px;border-bottom:1px solid #f1f5f9;${n.read ? '' : 'background:#f0fdf4;'}">
            <div style="font-size:13.5px;font-weight:${n.read ? '400' : '700'};color:#1f2937;">${cmEsc(n.message || n.title || '—')}</div>
            <div style="font-size:12px;color:#9ca3af;margin-top:4px;">${n.createdAt?.toDate ? n.createdAt.toDate().toLocaleDateString('en-PH', {year:'numeric',month:'long',day:'numeric'}) : '—'}</div>
        </div>`).join('');
};

// ── Sidebar / Topbar ──────────────────────────────────────────────
window.toggleSidebar = function() {
    const sidebar = document.getElementById('sidebar');
    const main    = document.getElementById('main-content');
    const overlay = document.getElementById('overlay');
    const burger  = document.getElementById('burger');
    if (window.innerWidth <= 768) {
        const open = sidebar.classList.toggle('open');
        overlay.classList.toggle('show', open);
        burger.classList.toggle('open', open);
    } else {
        cmSidebarOpen = !cmSidebarOpen;
        sidebar.classList.toggle('closed', !cmSidebarOpen);
        main.classList.toggle('expanded', !cmSidebarOpen);
    }
};

window.closeSidebar = function() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('overlay').classList.remove('show');
    document.getElementById('burger').classList.remove('open');
};
function cmCloseSidebar() { window.closeSidebar(); }

window.toggleNotifications = function() {
    document.getElementById('notif-dropdown').classList.toggle('show');
};

window.toggleDarkMode = function() {
    document.body.classList.toggle('dark-mode');
    const dark = document.body.classList.contains('dark-mode');
    localStorage.setItem('dac-dark', dark ? '1' : '0');
    document.getElementById('icon-moon').style.display = dark ? 'none' : '';
    document.getElementById('icon-sun').style.display  = dark ? '' : 'none';
};

// ── Profile ───────────────────────────────────────────────────────
window.toggleEditProfile = function() {
    const view = document.getElementById('profile-view-mode');
    const edit = document.getElementById('profile-edit-mode');
    if (!view || !edit) return;
    const editing = edit.style.display !== 'none';
    view.style.display = editing ? '' : 'none';
    edit.style.display = editing ? 'none' : '';
    if (!editing) {
        document.getElementById('edit-firstname').value = cmCurrentProfile?.firstName || '';
        document.getElementById('edit-lastname').value  = cmCurrentProfile?.lastName  || '';
    }
    document.getElementById('btn-edit-profile').textContent = editing ? 'Edit Profile' : 'Cancel';
};

window.cancelEditProfile = function() { window.toggleEditProfile(); };

window.saveProfile = async function() {
    const fn = document.getElementById('edit-firstname').value.trim();
    const ln = document.getElementById('edit-lastname').value.trim();
    if (!fn) { cmErr('err-edit-firstname', 'First name is required.'); return; }
    try {
        await db.collection(CM_COLLECTION).doc(cmCurrentUser.uid).update({ firstName: fn, lastName: ln });
        cmCurrentProfile.firstName = fn;
        cmCurrentProfile.lastName  = ln;
        cmRefreshUserDisplay();
        window.toggleEditProfile();
        cmShowToast('Profile updated ✓');
    } catch (err) { cmShowToast('Error saving profile.'); }
};

window.triggerAvatarUpload = function() { document.getElementById('avatar-file-input')?.click(); };
window.handleAvatarUpload  = function(event) {
    const file = event.target.files?.[0];
    if (!file || !cmCurrentUser) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            await db.collection(CM_COLLECTION).doc(cmCurrentUser.uid).update({ photoURL: e.target.result });
            cmCurrentProfile.photoURL = e.target.result;
            cmRefreshUserDisplay();
            cmShowToast('Photo updated ✓');
        } catch (err) { cmShowToast('Error uploading photo.'); }
    };
    reader.readAsDataURL(file);
    event.target.value = '';
};

// ── Change Password ───────────────────────────────────────────────
window.toggleChangePassword = function() {
    const form  = document.getElementById('change-pw-form');
    const ph    = document.getElementById('change-pw-placeholder');
    const open  = form && form.style.display !== 'none';
    if (form) form.style.display  = open ? 'none' : '';
    if (ph)   ph.style.display    = open ? '' : 'none';
};

window.doChangePassword = async function() {
    const cur  = document.getElementById('pw-current').value;
    const nw   = document.getElementById('pw-new').value;
    const conf = document.getElementById('pw-confirm-new').value;
    cmClear('err-pw-current'); cmClear('err-pw-new'); cmClear('err-pw-confirm-new');
    if (!cur)              { cmErr('err-pw-current',    'Enter your current password.');          return; }
    if (!nw || nw.length < 8){ cmErr('err-pw-new',     'New password must be at least 8 chars.'); return; }
    if (nw !== conf)       { cmErr('err-pw-confirm-new','Passwords don\'t match.');               return; }
    try {
        const cred = firebase.auth.EmailAuthProvider.credential(cmCurrentUser.email, cur);
        await cmCurrentUser.reauthenticateWithCredential(cred);
        await cmCurrentUser.updatePassword(nw);
        cmShowToast('Password changed ✓');
        window.toggleChangePassword();
    } catch (err) {
        if (err.code === 'auth/wrong-password') cmErr('err-pw-current', 'Current password is incorrect.');
        else cmShowToast('Error changing password: ' + err.message);
    }
};

// ── Auth helpers (used by login form) ────────────────────────────
window.switchToLogin  = function switchToLogin()  {
    const fl = document.getElementById('form-login');  if (fl) fl.style.display = '';
    const fs = document.getElementById('form-signup'); if (fs) fs.style.display = 'none';
};
window.switchToSignup = function switchToSignup() {
    const fl = document.getElementById('form-login');  if (fl) fl.style.display = 'none';
    const fs = document.getElementById('form-signup'); if (fs) fs.style.display = '';
};

// ── Password toggle / strength ────────────────────────────────────
window.togglePassword = function(inputId, eyeId) {
    const inp = document.getElementById(inputId);
    const eye = document.getElementById(eyeId);
    if (!inp) return;
    inp.type = inp.type === 'password' ? 'text' : 'password';
    if (eye) {
        eye.style.opacity = inp.type === 'text' ? '0.5' : '1';
    }
};

window.updateNewPwStrength = function() {};   // stub

// ── Toast ─────────────────────────────────────────────────────────
function cmShowToast(msg, duration) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._t);
    t._t = setTimeout(() => t.classList.remove('show'), duration || 3000);
}
window.showToast = cmShowToast;

// ── Forgot Password ───────────────────────────────────────────────
window.doForgotPassword = function() {
    const modal = document.getElementById('forgotPasswordModal');
    const input = document.getElementById('forgotEmailInput');
    const msg   = document.getElementById('forgotPasswordMsg');
    const loginEmail = (document.getElementById('login-email') || {}).value || '';
    if (input) input.value = loginEmail;
    if (msg)   { msg.style.display = 'none'; }
    if (modal) modal.style.display = 'flex';
};
window.closeForgotPasswordModal = function() {
    const m = document.getElementById('forgotPasswordModal'); if (m) m.style.display = 'none';
};
window.sendResetEmail = async function() {
    const input = document.getElementById('forgotEmailInput');
    const msg   = document.getElementById('forgotPasswordMsg');
    const btn   = document.getElementById('sendResetBtn');
    const email = (input ? input.value : '').trim();
    const show  = (text, err) => {
        if (!msg) return;
        msg.textContent = text; msg.style.display = 'block';
        msg.style.background = err ? '#fef2f2' : '#f0fdf4';
        msg.style.color      = err ? '#b91c1c' : '#065f46';
        msg.style.border     = '1px solid ' + (err ? '#fecaca' : '#a7f3d0');
    };
    if (!email) { show('Please enter your email.', true); return; }
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
    try {
        await firebase.auth().sendPasswordResetEmail(email);
        show('Reset link sent! Check your inbox.', false);
        if (input) input.value = '';
        setTimeout(window.closeForgotPasswordModal, 3000);
    } catch (e) {
        show(e.code === 'auth/user-not-found' ? 'No account found.' : 'Failed to send email.', true);
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Send Reset Link'; }
    }
};

// Close notification dropdown when clicking outside
document.addEventListener('click', function(e) {
    const wrap = document.getElementById('notif-wrap');
    if (wrap && !wrap.contains(e.target)) {
        const dd = document.getElementById('notif-dropdown');
        if (dd) dd.classList.remove('show');
    }
});

// ── Accomplishment Reports (stub — same as design portal) ─────────
window.filterReports = function() {};
function populateReports() {}
function populateBilling() {
    // Wire up existing billing section (payment requests module)
    if (typeof initClientPayment === 'function') initClientPayment();
}

// ── Report Modal (stub) ───────────────────────────────────────────
window.closeReportModal = function(e) {
    const m = document.getElementById('report-modal');
    if (m && (!e || e.target === m)) m.classList.remove('show');
};

// ══════════════════════════════════════════════════════════════════
// MATERIALS PROCUREMENT LIST
// ══════════════════════════════════════════════════════════════════

let _plItems = [];
let _plBuyItemData = null;
let _plReceiptFile = null;

async function cmPopulateProcurementList() {
    if (!cmProjectData) {
        const tbody = document.getElementById('pl-tbody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:32px;color:#b0c8bc;font-style:italic;">No project assigned yet.</td></tr>';
        return;
    }

    if (cmCurrentUser && cmCurrentUser.isDemo) {
        _plItems = [
            { id: 'demo-1', item: 'Plywood (¾ inch)', qty: '20 pcs', estPrice: 650, status: 'Pending', boughtBy: null, actualAmount: null, receiptUrl: null, notes: '' },
            { id: 'demo-2', item: 'Door Hinges (Heavy Duty)', qty: '12 pairs', estPrice: 180, status: 'Bought by Company', boughtBy: 'company', actualAmount: 2100, receiptUrl: null, notes: 'Purchased at ACE Hardware' },
            { id: 'demo-3', item: 'Epoxy Adhesive', qty: '5 tubes', estPrice: 95, status: 'Bought by Client', boughtBy: 'client', actualAmount: 475, receiptUrl: null, notes: '' },
            { id: 'demo-4', item: 'Laminate Sheet (White)', qty: '30 pcs', estPrice: 420, status: 'Pending', boughtBy: null, actualAmount: null, receiptUrl: null, notes: '' },
            { id: 'demo-5', item: 'Cabinet Handles', qty: '24 pcs', estPrice: 65, status: 'Pending', boughtBy: null, actualAmount: null, receiptUrl: null, notes: '' },
        ];
        plRenderTable(_plItems);
        plUpdateSummary(_plItems);
        return;
    }

    try {
        const snap = await db.collection('constructionProjects')
            .doc(cmProjectData.id)
            .collection('procurementList')
            .orderBy('createdAt', 'desc')
            .get();
        _plItems = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        plRenderTable(_plItems);
        plUpdateSummary(_plItems);
    } catch (err) {
        console.warn('Procurement list load:', err.message);
        const tbody = document.getElementById('pl-tbody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:32px;color:#b0c8bc;font-style:italic;">Unable to load items.</td></tr>';
    }
}

function plUpdateSummary(items) {
    const total   = items.length;
    const pending = items.filter(i => i.status === 'Pending').length;
    const client  = items.filter(i => i.boughtBy === 'client').length;
    const company = items.filter(i => i.boughtBy === 'company').length;
    cmSet('pl-total-items',   total);
    cmSet('pl-pending-items', pending);
    cmSet('pl-client-items',  client);
    cmSet('pl-company-items', company);
    const badge = document.getElementById('procurement-pending-badge');
    if (badge) { badge.textContent = pending; badge.style.display = pending ? '' : 'none'; }
}

function plRenderTable(items) {
    const tbody = document.getElementById('pl-tbody');
    if (!tbody) return;
    if (!items.length) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:32px;color:#b0c8bc;font-style:italic;">No items on the procurement list yet.</td></tr>';
        return;
    }

    const statusBadgeClass = {
        'Pending'          : 'pm-badge pm-badge-pending',
        'Bought by Client' : 'pm-badge pm-badge-client',
        'Bought by Company': 'pm-badge pm-badge-company',
    };
    const rowClass = {
        'Pending'          : 'pl-row-pending',
        'Bought by Client' : 'pl-row-client',
        'Bought by Company': 'pl-row-company',
    };

    tbody.innerHTML = items.map(it => {
        const badgeClass = statusBadgeClass[it.status] || 'pm-badge';
        const trClass    = rowClass[it.status] || '';
        const estFmt     = it.estPrice    ? cmFmt(it.estPrice)    : '—';
        const actFmt     = it.actualAmount ? cmFmt(it.actualAmount) : '—';
        const buyerLabel = it.boughtBy === 'client' ? 'You' : it.boughtBy === 'company' ? 'Company' : '—';

        const receiptBtn = it.receiptUrl
            ? `<button class="pl-action-btn pl-btn-view-receipt" onclick="plViewReceipt('${cmEsc(it.receiptUrl)}','${cmEsc(it.item)}')">
                 <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                 View
               </button>`
            : '<span style="color:#d1d5db;font-size:13px;">—</span>';

        const actionBtn = it.status === 'Pending'
            ? `<button class="pl-action-btn pl-btn-buy" onclick="plOpenBuyModal(${JSON.stringify(it).replace(/'/g,"&#39;")})">
                 <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                 Mark Bought
               </button>`
            : `<span class="pl-done-label">
                 <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                 Done
               </span>`;

        return `<tr class="${trClass}">
            <td><strong>${cmEsc(it.item || '—')}</strong></td>
            <td style="color:#6b7280;">${cmEsc(it.qty || '—')}</td>
            <td>${estFmt}</td>
            <td><span class="${badgeClass}">${cmEsc(it.status || '—')}</span></td>
            <td style="font-weight:600;">${actFmt}</td>
            <td>${buyerLabel}</td>
            <td>${receiptBtn}</td>
            <td>${actionBtn}</td>
        </tr>`;
    }).join('');
}

window.filterProcurementList = function() {
    const q = (document.getElementById('pl-search')?.value || '').toLowerCase();
    const filtered = _plItems.filter(i => (i.item || '').toLowerCase().includes(q));
    plRenderTable(filtered);
};

// ── Mark as Bought Modal ──────────────────────────────────────────
window.plOpenBuyModal = function(item) {
    _plBuyItemData = item;
    _plReceiptFile = null;
    document.getElementById('plBuyItemId').value   = item.id;
    document.getElementById('plBuyItemName').textContent = item.item || '—';
    document.getElementById('plBuyItemQty').textContent  = item.qty  || '—';
    document.getElementById('plBuyItemEst').textContent  = item.estPrice ? cmFmt(item.estPrice) : '—';
    document.getElementById('plBuyAmount').value   = '';
    document.getElementById('plBuyNotes').value    = '';
    document.getElementById('plReceiptPreview').style.display = 'none';
    document.getElementById('plReceiptPreview').innerHTML = '';
    document.getElementById('plReceiptFile').value = '';
    ['err-plBuyAmount','err-plReceipt'].forEach(cmClear);
    document.getElementById('plBuyModal').style.display = 'flex';
};

window.plCloseBuyModal = function() {
    document.getElementById('plBuyModal').style.display = 'none';
    _plBuyItemData = null;
    _plReceiptFile = null;
};

window.plPreviewReceipt = function(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    _plReceiptFile = file;
    const preview = document.getElementById('plReceiptPreview');
    preview.style.display = '';
    if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = e => {
            preview.innerHTML = `<img src="${e.target.result}" alt="receipt preview" style="max-width:100%;max-height:200px;border-radius:10px;border:1.5px solid #e5e7eb;display:block;"/>`;
        };
        reader.readAsDataURL(file);
    } else {
        preview.innerHTML = `<div class="pm-receipt-file-chip">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            ${cmEsc(file.name)}
        </div>`;
    }
    cmClear('err-plReceipt');
};

window.plHandleReceiptDrop = function(event) {
    event.preventDefault();
    document.getElementById('plReceiptUploadWrap').style.borderColor = '#d1d5db';
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    const dt = new DataTransfer();
    dt.items.add(file);
    document.getElementById('plReceiptFile').files = dt.files;
    plPreviewReceipt({ target: { files: [file] } });
};

window.plSubmitBought = async function() {
    const amount = parseFloat(document.getElementById('plBuyAmount').value);
    let valid = true;

    cmClear('err-plBuyAmount');
    cmClear('err-plReceipt');

    if (!amount || amount <= 0) { cmErr('err-plBuyAmount', 'Please enter the actual amount paid.'); valid = false; }
    if (!_plReceiptFile)        { cmErr('err-plReceipt',   'Please upload your proof of receipt.'); valid = false; }
    if (!valid) return;

    const btn = document.getElementById('plBuySubmitBtn');
    btn.disabled = true; btn.textContent = 'Submitting…';

    try {
        const itemId = document.getElementById('plBuyItemId').value;
        const notes  = document.getElementById('plBuyNotes').value.trim();
        let receiptUrl = null;

        // Upload receipt to Firebase Storage
        if (_plReceiptFile && cmCurrentUser && !cmCurrentUser.isDemo) {
            const ext  = _plReceiptFile.name.split('.').pop();
            const path = `procurementReceipts/${cmProjectData.id}/${itemId}_client_${Date.now()}.${ext}`;
            const ref  = firebase.storage().ref(path);
            await ref.put(_plReceiptFile);
            receiptUrl = await ref.getDownloadURL();
        } else if (cmCurrentUser?.isDemo) {
            receiptUrl = null;
        }

        const updateData = {
            status      : 'Bought by Client',
            boughtBy    : 'client',
            actualAmount: amount,
            receiptUrl  : receiptUrl,
            notes       : notes,
            boughtAt    : firebase.firestore.FieldValue.serverTimestamp(),
            boughtByUid : cmCurrentUser.uid
        };

        if (!cmCurrentUser.isDemo) {
            await db.collection('constructionProjects')
                .doc(cmProjectData.id)
                .collection('procurementList')
                .doc(itemId)
                .update(updateData);
        }

        // Update local state
        const idx = _plItems.findIndex(i => i.id === itemId);
        if (idx !== -1) Object.assign(_plItems[idx], { ...updateData, status: 'Bought by Client' });

        plRenderTable(_plItems);
        plUpdateSummary(_plItems);
        plCloseBuyModal();
        cmShowToast('Item marked as bought successfully.');
    } catch (err) {
        console.error('plSubmitBought:', err);
        cmShowToast('Error submitting. Please try again.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Confirm Purchase';
    }
};

// ── Receipt Viewer ────────────────────────────────────────────────
window.plViewReceipt = function(url, itemName) {
    document.getElementById('plReceiptViewTitle').textContent = 'Receipt — ' + itemName;
    const img = document.getElementById('plReceiptViewImg');
    const pdf = document.getElementById('plReceiptViewPdf');
    if (url.toLowerCase().includes('.pdf') || url.startsWith('data:application/pdf')) {
        img.style.display = 'none';
        pdf.src = url; pdf.style.display = '';
    } else {
        pdf.style.display = 'none';
        img.src = url; img.style.display = '';
    }
    document.getElementById('plReceiptViewModal').style.display = 'flex';
};

window.plCloseReceiptView = function() {
    document.getElementById('plReceiptViewModal').style.display = 'none';
    document.getElementById('plReceiptViewImg').src = '';
    document.getElementById('plReceiptViewPdf').src = '';
};
