// ============================================================
// EXPENSES TRACKER MODULE — DAC's Building Design Services
// ============================================================

// ── Global State ─────────────────────────────────────────────
let expProjects       = [];
let expFolders        = [];   // { id, name, description, totalBudget }
let _foldersUnsub     = null;
let _expandedFolders  = new Set(); // folder ids currently expanded
let expCurrentProject = null;
let expExpenses       = [];
let expPayroll        = [];
let expCharts         = {};
let expUnsubscribers  = [];
let expCategories     = []; // { id, name, color } stored in Firestore

// ── Search / filter state ─────────────────────────────────
let _expSearch = { name: '', category: '', amtMin: '', amtMax: '', month: '' };
let _paySearch = { name: '' };
let _projectsUnsub = null;

// ── Bootstrap ────────────────────────────────────────────────
function initExpensesModule() {
    setupExpenseFormListeners();
    setupPayrollFormListeners();
    setupEditExpenseFormListeners();
    setupEditPayrollFormListeners();
    loadCategories();
}

// ════════════════════════════════════════════════════════════
// CATEGORY MANAGEMENT
// ════════════════════════════════════════════════════════════
async function loadCategories() {
    if (!currentUser) return;
    try {
        const snap = await db.collection('categories')
            .where('userId', '==', currentUser.uid)
            .orderBy('createdAt', 'asc')
            .get();
        expCategories = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        populateExpSearchCategories();
        refreshCategoryDropdown();
        renderCategoryManager();
    } catch (e) {
        // If index not ready, fallback without orderBy
        try {
            const snap = await db.collection('categories')
                .where('userId', '==', currentUser.uid)
                .get();
            expCategories = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        populateExpSearchCategories();
            refreshCategoryDropdown();
            renderCategoryManager();
        } catch(e2) { console.error('loadCategories:', e2); }
    }
}

function refreshCategoryDropdown() {
    const sel = document.getElementById('expCategory');
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = '<option value="">Select category…</option>';
    expCategories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.name;
        opt.textContent = cat.name;
        if (cat.name === current) opt.selected = true;
        sel.appendChild(opt);
    });
}

function renderCategoryManager() {
    const container = document.getElementById('expCategoryList');
    if (!container) return;
    if (!expCategories.length) {
        container.innerHTML = '<span style="color:#aaa;font-size:0.8rem;">No categories yet. Add one above.</span>';
        return;
    }
    container.innerHTML = expCategories.map(cat => `
        <div class="exp-cat-chip" style="--cat-color:${cat.color}">
            <span class="exp-cat-dot" style="background:${cat.color}"></span>
            <span>${cat.name}</span>
            <button type="button" class="exp-cat-del" onclick="deleteCategory('${cat.id}')" title="Delete">✕</button>
        </div>`).join('');
}

async function addCategory() {
    const nameInput  = document.getElementById('catNameInput');
    const colorInput = document.getElementById('catColorInput');
    const name  = nameInput?.value.trim();
    const color = colorInput?.value || '#00D084';
    if (!name) { showExpNotif('Enter a category name.', 'error'); return; }
    if (expCategories.find(c => c.name.toLowerCase() === name.toLowerCase())) {
        showExpNotif('Category already exists.', 'error'); return;
    }
    try {
        const ref = await db.collection('categories').add({
            userId: currentUser.uid,
            name, color,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        expCategories.push({ id: ref.id, name, color });
        refreshCategoryDropdown();
        renderCategoryManager();
        if (nameInput) nameInput.value = '';
        showExpNotif(`"${name}" added!`, 'success');
    } catch (e) { showExpNotif('Error: ' + e.message, 'error'); }
}

function toggleCatManager() {
    const panel = document.getElementById('catManagerPanel');
    if (!panel) return;
    const isOpen = panel.style.display !== 'none';
    panel.style.display = isOpen ? 'none' : 'block';
}

async function deleteCategory(id) {
    if (!confirm('Delete this category?')) return;
    try {
        await db.collection('categories').doc(id).delete();
        expCategories = expCategories.filter(c => c.id !== id);
        refreshCategoryDropdown();
        renderCategoryManager();
        showExpNotif('Category deleted.', 'success');
    } catch (e) { showExpNotif('Error: ' + e.message, 'error'); }
}

// ════════════════════════════════════════════════════════════
// LOAD PROJECTS
// ════════════════════════════════════════════════════════════
function loadProjects() {
    // Cancel previous listeners
    if (_projectsUnsub) { _projectsUnsub(); _projectsUnsub = null; }
    if (_foldersUnsub)  { _foldersUnsub();  _foldersUnsub  = null; }

    // Listen to folders
    _foldersUnsub = db.collection('folders')
        .where('userId', '==', currentUser.uid)
        .onSnapshot(snap => {
            expFolders = snap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0));
            _renderAllPanels();
        }, err => console.error('folders listener:', err));

    // Listen to projects
    _projectsUnsub = db.collection('projects')
        .where('userId', '==', currentUser.uid)
        .onSnapshot(snap => {
            expProjects = snap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .sort((a, b) => {
                    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
                    if (b.year !== a.year) return (b.year||0) - (a.year||0);
                    return months.indexOf(b.month) - months.indexOf(a.month);
                });

            if (expCurrentProject) {
                const updated = expProjects.find(p => p.id === expCurrentProject.id);
                if (updated) expCurrentProject = updated;
            }

            _renderAllPanels();

            if (expProjects.length > 0 && !expCurrentProject) {
                selectProject(expProjects[0].id);
            } else if (expCurrentProject) {
                updateBudgetOverview();
                updateExpCharts();
            } else {
                updateBudgetOverview();
            }
        }, err => console.error('projects listener:', err));
}

function _renderAllPanels() {
    renderProjectPanel('expOverviewList');
    renderProjectPanel('expExpensesList');
    renderProjectPanel('expPayrollList');
}

// ── Render one panel's project list (folder-aware) ───────────
function renderProjectPanel(containerId) {
    var el = document.getElementById(containerId);
    if (!el) return;
    var isOverview = containerId === 'expOverviewList';
    var unfiledProjects = expProjects.filter(function(p){ return !p.folderId; });

    if (expFolders.length === 0 && unfiledProjects.length === 0) {
        el.innerHTML = '<p class="exp-empty">No folders yet.<br>Click <strong>+ New Folder</strong> above.</p>';
        return;
    }

    var html = '';

    expFolders.forEach(function(folder) {
        var fid          = folder.id;
        var fname        = (folder.name || 'Unnamed').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        var fdesc        = (folder.description || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        var folderBudget = folder.totalBudget || 0;
        var isExpanded   = _expandedFolders.has(fid);
        var folderProjs  = expProjects.filter(function(p){ return p.folderId === fid; });
        var totalSpent   = folderProjs.reduce(function(s,p){ return s+(p._spent||0); }, 0);
        var usedPct      = folderBudget > 0 ? Math.min((totalSpent/folderBudget)*100, 100) : 0;
        var barColor     = usedPct>90?'#ef4444':usedPct>70?'#f59e0b':'#00D084';
        var chevCls      = isExpanded ? 'exp-folder-chevron expanded' : 'exp-folder-chevron';
        var emoji        = isExpanded ? '📂' : '📁';

        html += '<div class="exp-folder-block">'
            + '<div class="exp-folder-header" onclick="toggleFolder(\'' + fid + '\')">'
                + '<div class="exp-folder-header-left">'
                +   '<span class="' + chevCls + '">&#9654;</span>'
                +   '<span class="exp-folder-icon-emoji">' + emoji + '</span>'
                +   '<div class="exp-folder-info">'
                +     '<strong>' + fname + '</strong>'
                +     (fdesc ? '<span>' + fdesc + '</span>' : '')
                +   '</div>'
                + '</div>'
                + '<div class="exp-folder-header-right">'
                +   '<span class="exp-folder-budget">&#8369;' + formatNum(folderBudget) + '</span>'
                +   '<div class="exp-folder-actions">'
                +     '<button class="exp-icon-btn exp-icon-btn-add" title="Add Month" onclick="event.stopPropagation();openCreateMonthModal(\'' + fid + '\')">&#xFF0B;</button>'
                +     '<button class="exp-icon-btn exp-icon-btn-edit" title="Edit" onclick="event.stopPropagation();openEditFolderModal(\'' + fid + '\')">&#9998;</button>'
                +     '<button class="exp-icon-btn exp-icon-btn-danger" title="Delete" onclick="event.stopPropagation();deleteFolder(\'' + fid + '\')">&#128465;</button>'
                +   '</div>'
                + '</div>'
            + '</div>';

        if (folderBudget > 0) {
            html += '<div class="exp-folder-progress-bar">'
                  + '<div class="exp-folder-progress-fill" style="width:' + usedPct.toFixed(1) + '%;background:' + barColor + '"></div>'
                  + '</div>';
        }

        if (isExpanded) {
            if (folderProjs.length === 0) {
                html += '<div class="exp-folder-empty">No months yet — click <strong>+</strong> to add one.</div>';
            } else {
                folderProjs.forEach(function(p) {
                    var active = (expCurrentProject && expCurrentProject.id === p.id) ? 'active' : '';
                    if (isOverview) {
                        html += '<div class="exp-proj-row exp-proj-row-selectable exp-proj-row-child ' + active + '" onclick="selectProject(\'' + p.id + '\')">'
                              +   '<div class="exp-proj-row-info">'
                              +     '<div class="exp-proj-row-name-wrap">'
                              +       '<span class="exp-proj-select-dot"></span>'
                              +       '<strong>' + p.month + ' ' + p.year + '</strong>'
                              +     '</div>'
                              +     '<span>&#8369;' + formatNum(p.monthlyBudget) + '</span>'
                              +   '</div>'
                              +   '<div class="exp-proj-row-actions">'
                              +     '<button class="exp-icon-btn exp-icon-btn-view" title="View this month" onclick="event.stopPropagation();selectProject(\'' + p.id + '\');openProjectModal(\'' + p.id + '\')"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/></svg></button>'
                              +     '<button class="exp-icon-btn exp-icon-btn-edit" title="Edit" onclick="event.stopPropagation();openProjectModal(\'' + p.id + '\')">&#9998;</button>'
                              +     '<button class="exp-icon-btn exp-icon-btn-danger" title="Delete" onclick="event.stopPropagation();deleteProject(\'' + p.id + '\')">&#128465;</button>'
                              +   '</div>'
                              + '</div>';
                    } else {
                        html += '<div class="exp-proj-row exp-proj-row-child ' + active + '" onclick="selectProject(\'' + p.id + '\')">'
                              +   '<div class="exp-proj-row-info">'
                              +     '<strong>' + p.month + ' ' + p.year + '</strong>'
                              +     '<span>&#8369;' + formatNum(p.monthlyBudget) + '</span>'
                              +   '</div>'
                              +   '<div class="exp-proj-row-actions">'
                              +     '<button class="exp-icon-btn exp-icon-btn-edit" title="Edit" onclick="event.stopPropagation();openEditProjectModal(\'' + p.id + '\')">&#9998;</button>'
                              +     '<button class="exp-icon-btn exp-icon-btn-danger" title="Delete" onclick="event.stopPropagation();deleteProject(\'' + p.id + '\')">&#128465;</button>'
                              +   '</div>'
                              + '</div>';
                    }
                });
            }
        }

        html += '</div>';
    });

    if (unfiledProjects.length > 0) {
        html += '<div class="exp-unfiled-label">Unfiled Months</div>';
        unfiledProjects.forEach(function(p) {
            var active = (expCurrentProject && expCurrentProject.id === p.id) ? 'active' : '';
            if (isOverview) {
                html += '<div class="exp-proj-row exp-proj-row-selectable ' + active + '" onclick="selectProject(\'' + p.id + '\')">'
                      +   '<div class="exp-proj-row-info">'
                      +     '<div class="exp-proj-row-name-wrap">'
                      +       '<span class="exp-proj-select-dot"></span>'
                      +       '<strong>' + p.month + ' ' + p.year + '</strong>'
                      +     '</div>'
                      +     '<span>&#8369;' + formatNum(p.monthlyBudget) + '</span>'
                      +   '</div>'
                      +   '<div class="exp-proj-row-actions">'
                      +     '<button class="exp-icon-btn exp-icon-btn-view" title="View this month" onclick="event.stopPropagation();selectProject(\'' + p.id + '\');openProjectModal(\'' + p.id + '\')"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/></svg></button>'
                      +     '<button class="exp-icon-btn exp-icon-btn-add" title="Move to Folder" onclick="event.stopPropagation();openMoveToFolderModal(\'' + p.id + '\')">&#128193;</button>'
                      +     '<button class="exp-icon-btn exp-icon-btn-danger" title="Delete" onclick="event.stopPropagation();deleteProject(\'' + p.id + '\')">&#128465;</button>'
                      +   '</div>'
                      + '</div>';
            } else {
                html += '<div class="exp-proj-row ' + active + '" onclick="selectProject(\'' + p.id + '\')">'
                      +   '<div class="exp-proj-row-info">'
                      +     '<strong>' + p.month + ' ' + p.year + '</strong>'
                      +     '<span>&#8369;' + formatNum(p.monthlyBudget) + '</span>'
                      +   '</div>'
                      +   '<div class="exp-proj-row-actions">'
                      +     '<button class="exp-icon-btn exp-icon-btn-add" title="Move to Folder" onclick="event.stopPropagation();openMoveToFolderModal(\'' + p.id + '\')">&#128193;</button>'
                      +     '<button class="exp-icon-btn exp-icon-btn-edit" title="Edit" onclick="event.stopPropagation();openEditProjectModal(\'' + p.id + '\')">&#9998;</button>'
                      +     '<button class="exp-icon-btn exp-icon-btn-danger" title="Delete" onclick="event.stopPropagation();deleteProject(\'' + p.id + '\')">&#128465;</button>'
                      +   '</div>'
                      + '</div>';
            }
        });
    }

    el.innerHTML = html;
}

function toggleFolder(folderId) {
    if (_expandedFolders.has(folderId)) {
        _expandedFolders.delete(folderId);
    } else {
        _expandedFolders.add(folderId);
    }
    _renderAllPanels();
}

// ════════════════════════════════════════════════════════════
// EDIT PROJECT
// ════════════════════════════════════════════════════════════
function openEditProjectModal(projectId) {
    const p = expProjects.find(p => p.id === projectId);
    if (!p) return;
    document.getElementById('editProjectId').value   = p.id;
    document.getElementById('editProjMonth').value   = p.month;
    document.getElementById('editProjYear').value    = p.year;
    document.getElementById('editProjBudget').value  = p.monthlyBudget;
    openExpModal('editProjectModal');
}

async function handleEditProject(e) {
    e.preventDefault();
    const id     = document.getElementById('editProjectId').value;
    const month  = document.getElementById('editProjMonth').value;
    const year   = parseInt(document.getElementById('editProjYear').value);
    const budget = parseFloat(document.getElementById('editProjBudget').value);
    if (!id || !month || !year || !budget) return;

    try {
        showExpLoading('editProjectBtn', true);
        await db.collection('projects').doc(id).update({
            month, year, monthlyBudget: budget
        });
        showExpNotif('Project updated! ✓', 'success');
        closeExpModal('editProjectModal');
    } catch(err) {
        console.error('handleEditProject:', err);
        showExpNotif('Failed to update project.', 'error');
    } finally {
        showExpLoading('editProjectBtn', false);
    }
}

// ════════════════════════════════════════════════════════════
// SELECT PROJECT
// ════════════════════════════════════════════════════════════
function selectProject(id) {
    expCurrentProject = expProjects.find(p => p.id === id) || null;

    renderProjectPanel('expOverviewList');
    renderProjectPanel('expExpensesList');
    renderProjectPanel('expPayrollList');

    const label = expCurrentProject
        ? `Active: ${expCurrentProject.month} ${expCurrentProject.year}`
        : 'No project selected';
    ['expBadgeOverview','expBadgeExpenses','expBadgePayroll','expBadgeReports']
        .forEach(bid => setText(bid, label));

    expUnsubscribers.forEach(u => u());
    expUnsubscribers = [];

    if (!expCurrentProject) {
        expExpenses = [];
        expPayroll  = [];
        renderExpensesTable();
        renderPayrollTable();
        updateBudgetOverview();
        return;
    }

    subscribeExpenses();
    subscribePayroll();
}

// ════════════════════════════════════════════════════════════
// REAL-TIME FIRESTORE LISTENERS
// ════════════════════════════════════════════════════════════
function subscribeExpenses() {
    if (!expCurrentProject || !currentUser) return;
    const unsub = db.collection('expenses')
        .where('projectId', '==', expCurrentProject.id)
        .where('userId', '==', currentUser.uid)
        .onSnapshot(snap => {
            expExpenses = snap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .sort((a, b) => new Date(b.dateTime || 0) - new Date(a.dateTime || 0));
            populateMonthDropdown();
            renderExpensesTable();
            updateBudgetOverview();
            updateExpCharts();
        }, err => console.error('expenses listener:', err));
    expUnsubscribers.push(unsub);
}

function subscribePayroll() {
    if (!expCurrentProject || !currentUser) return;
    const unsub = db.collection('payroll')
        .where('projectId', '==', expCurrentProject.id)
        .where('userId', '==', currentUser.uid)
        .onSnapshot(snap => {
            expPayroll = snap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .sort((a, b) => new Date(b.paymentDate || 0) - new Date(a.paymentDate || 0));
            renderPayrollTable();
            updateBudgetOverview();
            updateExpCharts();
        }, err => console.error('payroll listener:', err));
    expUnsubscribers.push(unsub);
}

// ════════════════════════════════════════════════════════════
// BUDGET OVERVIEW STATS
// ════════════════════════════════════════════════════════════
function updateBudgetOverview() {
    const budget  = expCurrentProject?.monthlyBudget || 0;
    const exps    = expExpenses.reduce((s, e) => s + (e.amount || 0), 0);
    const pay     = expPayroll.reduce((s, p) => s + (p.totalSalary || 0), 0);
    const spent   = exps + pay;
    const remain  = budget - spent;
    const usedPct = budget > 0 ? (spent / budget) * 100 : 0;
    const expPct  = budget > 0 ? (exps  / budget) * 100 : 0;
    const payPct  = budget > 0 ? (pay   / budget) * 100 : 0;
    const remPct  = Math.max(0, 100 - usedPct);

    setText('expTotalBudget', '₱' + formatNum(budget));
    if (expCurrentProject?.month && expCurrentProject?.year) {
        setText('expPeriodLabel', expCurrentProject.month + ' ' + expCurrentProject.year + ' allocation');
    }

    setText('expUsedPct', usedPct.toFixed(1) + '%');
    const statusCard  = document.getElementById('expKpiStatusCard');
    const healthBadge = document.getElementById('expHealthBadge');
    const healthSub   = document.getElementById('expHealthSub');
    const healthIco   = document.getElementById('expHealthIcon');
    if (statusCard && healthBadge && healthSub && healthIco) {
        statusCard.classList.remove('status-warning', 'status-danger');
        if (usedPct > 100) {
            statusCard.classList.add('status-danger');
            healthBadge.textContent = 'OVER BUDGET';
            healthSub.textContent   = 'utilized — OVER BUDGET';
            healthIco.setAttribute('data-lucide', 'shield-x');
        } else if (usedPct > 85) {
            statusCard.classList.add('status-warning');
            healthBadge.textContent = 'NEAR LIMIT';
            healthSub.textContent   = 'utilized — NEAR LIMIT';
            healthIco.setAttribute('data-lucide', 'shield-alert');
        } else if (usedPct > 60) {
            healthBadge.textContent = 'ON TRACK';
            healthSub.textContent   = 'utilized — ON TRACK';
            healthIco.setAttribute('data-lucide', 'shield-check');
        } else {
            healthBadge.textContent = 'HEALTHY';
            healthSub.textContent   = 'utilized — HEALTHY';
            healthIco.setAttribute('data-lucide', 'shield-check');
        }
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    const folderBudgetEl = document.getElementById('expFolderBudget');
    if (folderBudgetEl) {
        const folderId = expCurrentProject?.folderId;
        const folder   = folderId ? expFolders.find(f => f.id === folderId) : null;
        folderBudgetEl.textContent = folder ? '₱' + formatNum(folder.totalBudget) : '—';
    }

    setText('expTotalExpenses', '₱' + formatNum(exps));
    setText('expExpenseCount',  expExpenses.length + ' transaction' + (expExpenses.length !== 1 ? 's' : ''));
    setText('expExpPct',        expPct.toFixed(1) + '% of budget');
    setBar('expExpBar', expPct);

    setText('expTotalPayroll', '₱' + formatNum(pay));
    const workerSet = new Set(expPayroll.map(p => p.workerName || p.id));
    setText('expPayrollCount', workerSet.size + ' worker' + (workerSet.size !== 1 ? 's' : ''));
    setText('expPayPct', payPct.toFixed(1) + '% of budget');
    setBar('expPayBar', payPct);

    setText('expTotalSpent', '₱' + formatNum(spent));
    const folderId2   = expCurrentProject?.folderId;
    const folder2     = folderId2 ? expFolders.find(f => f.id === folderId2) : null;
    const contractVal = folder2?.totalBudget || 0;
    const spentOfContract = contractVal > 0 ? (spent / contractVal) * 100 : 0;
    setText('expSpentOfContract', spentOfContract.toFixed(1) + '% of contract value');
    setBar('expSpentBar', Math.min(spentOfContract, 100));

    setText('expRemaining', '₱' + formatNum(Math.abs(remain)));
    const varianceCard = document.getElementById('expVarianceCard');
    const varianceIcon = document.getElementById('expVarianceIcon');
    const varianceMeta = document.getElementById('expVarianceMeta');
    if (varianceCard) {
        if (remain < 0) {
            varianceCard.classList.add('is-over');
            if (varianceIcon) varianceIcon.setAttribute('data-lucide', 'trending-down');
            if (varianceMeta) varianceMeta.textContent = 'Over budget — immediate review needed';
            setBar('expRemBar', 100);
        } else {
            varianceCard.classList.remove('is-over');
            if (varianceIcon) varianceIcon.setAttribute('data-lucide', 'trending-up');
            if (varianceMeta) varianceMeta.textContent = 'Remaining available';
            setBar('expRemBar', remPct);
        }
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    // ── Contract variance (folder total budget vs spent) ──────
    const contractVarEl  = document.getElementById('expContractVariance');
    const contractVarBar = document.getElementById('expContractVarBar');
    if (contractVarEl) {
        if (contractVal > 0) {
            const cRemain = contractVal - spent;
            const cPct    = Math.min(Math.max((cRemain / contractVal) * 100, 0), 100);
            const isOver  = cRemain < 0;
            contractVarEl.textContent = (isOver ? '-' : '') + '₱' + formatNum(Math.abs(cRemain));
            contractVarEl.style.color = isOver ? '#ef4444' : '#00D084';
            if (contractVarBar) {
                contractVarBar.style.width      = Math.max(cPct, 2).toFixed(1) + '%';
                contractVarBar.style.background = isOver ? '#ef4444' : '#00D084';
            }
        } else {
            contractVarEl.textContent = '— no folder';
            contractVarEl.style.color = '#9ca3af';
            if (contractVarBar) contractVarBar.style.width = '0%';
        }
    }

    const matW = Math.min(expPct, 100);
    const payW = Math.min(payPct, Math.max(0, 100 - matW));
    const remW = Math.max(0, 100 - matW - payW);
    setBarWidth('expStackMaterials', matW);
    setBarWidth('expStackPayroll',   payW);
    setBarWidth('expStackRemaining', remW);
    setText('expRemPct',    remPct.toFixed(1) + '% remaining');
    setText('expLegMatPct', expPct.toFixed(1) + '%');
    setText('expLegPayPct', payPct.toFixed(1) + '%');
    setText('expLegRemPct', remPct.toFixed(1) + '%');
}

function setBar(id, pct) {
    const el = document.getElementById(id);
    if (el) el.style.width = Math.min(Math.max(pct, 0), 100).toFixed(1) + '%';
}
function setBarWidth(id, pct) {
    const el = document.getElementById(id);
    if (el) el.style.width = Math.min(Math.max(pct, 0), 100).toFixed(1) + '%';
}

// ════════════════════════════════════════════════════════════
// EXPENSE TABLE
// ════════════════════════════════════════════════════════════
function renderExpensesTable() {
    const tbody = document.getElementById('expensesTbody');
    if (!tbody) return;
    if (!expCurrentProject) {
        tbody.innerHTML = '<tr><td colspan="7" class="exp-empty-row">👈 Select a project from the list.</td></tr>';
        return;
    }
    if (!expExpenses.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="exp-empty-row">No expenses yet. Click ＋ Add Expense.</td></tr>';
        return;
    }

    const { name, category, amtMin, amtMax, month } = _expSearch;
    const filtered = expExpenses.filter(e => {
        if (name && !(e.expenseName || '').toLowerCase().includes(name.toLowerCase())) return false;
        if (category && e.category !== category) return false;
        if (amtMin !== '' && (e.amount || 0) < parseFloat(amtMin)) return false;
        if (amtMax !== '' && (e.amount || 0) > parseFloat(amtMax)) return false;
        if (month && e.dateTime) {
            const d = new Date(e.dateTime);
            const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
            if (key !== month) return false;
        }
        return true;
    });

    if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="exp-empty-row">🔍 No expenses match your filters.</td></tr>';
        _updateExpSearchCount(0, expExpenses.length);
        return;
    }

    const groups = {};
    filtered.forEach(e => {
        const key = e.category || 'Uncategorized';
        if (!groups[key]) groups[key] = [];
        groups[key].push(e);
    });

    let html = '';
    Object.entries(groups).forEach(([category, items]) => {
        const cat = expCategories.find(c => c.name === category);
        const color = cat ? cat.color : '#9ca3af';
        const subtotal = items.reduce((s, e) => s + (e.amount || 0), 0);
        const r = parseInt((color.replace('#','')).substring(0,2),16);
        const g = parseInt((color.replace('#','')).substring(2,4),16);
        const b = parseInt((color.replace('#','')).substring(4,6),16);
        html += `
        <tr class="exp-group-header">
            <td colspan="7">
                <div class="exp-group-header-inner" style="--cat-color:${color};--cat-bg:rgba(${r},${g},${b},0.08);border-left-color:${color}">
                    <span class="exp-group-dot" style="background:${color}"></span>
                    <span class="exp-group-name" style="color:${color}">${category}</span>
                    <span class="exp-group-count">${items.length} item${items.length > 1 ? 's' : ''}</span>
                    <span class="exp-group-subtotal">₱${formatNum(subtotal)}</span>
                </div>
            </td>
        </tr>`;
        items.forEach(e => {
            html += `
        <tr class="exp-group-row">
            <td>${formatDate(e.dateTime)}</td>
            <td><strong>${_highlightMatch(e.expenseName || '—', name)}</strong></td>
            <td class="exp-notes-cell">${e.notes ? '<span class="exp-notes-text">' + e.notes + '</span>' : '<span class="exp-notes-empty">—</span>'}</td>
            <td>${e.quantity || 1}</td>
            <td>₱${formatNum(e.amount)}</td>
            <td>${getReceiptThumbsHTML(e)}</td>
            <td class="exp-action-cell">
                <button class="exp-icon-btn exp-icon-btn-edit" title="Edit" onclick="openEditExpenseModal('${e.id}')"><i data-lucide="pencil"></i></button>
                <button class="exp-icon-btn exp-icon-btn-danger" title="Delete" onclick="deleteExpense('${e.id}')"><i data-lucide="trash-2"></i></button>
            </td>
        </tr>`;
        });
    });
    const grandTotal = filtered.reduce((s, e) => s + (e.amount || 0), 0);
    html += `
        <tr class="exp-total-row">
            <td colspan="4"></td>
            <td class="exp-total-label">TOTAL</td>
            <td class="exp-total-value">₱${formatNum(grandTotal)}</td>
            <td></td>
        </tr>`;

    tbody.innerHTML = html;
    _updateExpSearchCount(filtered.length, expExpenses.length);
    if (window.lucide) lucide.createIcons();
}

// ════════════════════════════════════════════════════════════
// SEARCH HELPERS
// ════════════════════════════════════════════════════════════
function applyExpenseSearch() {
    _expSearch.name     = document.getElementById('expSearchName')?.value     || '';
    _expSearch.category = document.getElementById('expSearchCategory')?.value || '';
    _expSearch.amtMin   = document.getElementById('expSearchAmtMin')?.value   || '';
    _expSearch.amtMax   = document.getElementById('expSearchAmtMax')?.value   || '';
    _expSearch.month    = document.getElementById('expSearchMonth')?.value    || '';

    const hasFilter = Object.values(_expSearch).some(v => v !== '');
    const clearBtn = document.getElementById('expSearchClearBtn');
    if (clearBtn) clearBtn.style.display = hasFilter ? 'inline-flex' : 'none';
    _renderFilterChips();
    renderExpensesTable();
}

function clearExpenseSearch() {
    _expSearch = { name: '', category: '', amtMin: '', amtMax: '', month: '' };
    ['expSearchName','expSearchCategory','expSearchAmtMin','expSearchAmtMax',
     'expSearchMonth'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const clearBtn = document.getElementById('expSearchClearBtn');
    if (clearBtn) clearBtn.style.display = 'none';
    _renderFilterChips();
    renderExpensesTable();
}

function _updateExpSearchCount(shown, total) {
    const count = document.getElementById('expSearchCount');
    const bar   = document.getElementById('expFilterBar');
    if (!count || !bar) return;
    const hasFilter = Object.values(_expSearch).some(v => v !== '');
    if (total > 0) {
        bar.style.display = 'flex';
        if (hasFilter && shown < total) {
            count.textContent = `Showing ${shown} of ${total} expenses`;
            count.className = 'exp-filter-count filtered';
        } else {
            count.textContent = `${total} expense${total !== 1 ? 's' : ''}`;
            count.className = 'exp-filter-count';
        }
    } else {
        bar.style.display = 'none';
    }
    _renderFilterChips();
}

function _renderFilterChips() {
    const wrap = document.getElementById('expFilterChips');
    if (!wrap) return;
    const chips = [];
    const monthNames = ['January','February','March','April','May','June',
                        'July','August','September','October','November','December'];
    if (_expSearch.name)
        chips.push({ label: `Name: "${_expSearch.name}"`, clear: () => { document.getElementById('expSearchName').value=''; _expSearch.name=''; }});
    if (_expSearch.category)
        chips.push({ label: `📂 ${_expSearch.category}`, clear: () => { document.getElementById('expSearchCategory').value=''; _expSearch.category=''; }});
    if (_expSearch.amtMin || _expSearch.amtMax) {
        const lo = _expSearch.amtMin ? `₱${_expSearch.amtMin}` : '₱0';
        const hi = _expSearch.amtMax ? `₱${_expSearch.amtMax}` : '∞';
        chips.push({ label: `Amount: ${lo}–${hi}`, clear: () => {
            ['expSearchAmtMin','expSearchAmtMax'].forEach(id => { const el = document.getElementById(id); if(el) el.value=''; });
            _expSearch.amtMin=''; _expSearch.amtMax='';
        }});
    }
    if (_expSearch.month) {
        const [yr, mo] = _expSearch.month.split('-');
        chips.push({ label: `📅 ${monthNames[parseInt(mo)-1]} ${yr}`, clear: () => { document.getElementById('expSearchMonth').value=''; _expSearch.month=''; }});
    }
    if (!chips.length) { wrap.innerHTML = ''; return; }
    wrap.innerHTML = chips.map((c, i) => `<span class="exp-chip" onclick="_clearChip(${i})">${c.label} <span class="exp-chip-x">×</span></span>`).join('');
    wrap._chipClears = chips.map(c => c.clear);
}

function _clearChip(i) {
    const wrap = document.getElementById('expFilterChips');
    if (wrap && wrap._chipClears && wrap._chipClears[i]) {
        wrap._chipClears[i]();
        applyExpenseSearch();
    }
}

function _highlightMatch(text, query) {
    if (!query || !text) return text;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return text;
    return text.slice(0, idx)
        + `<mark class="exp-search-highlight">${text.slice(idx, idx + query.length)}</mark>`
        + text.slice(idx + query.length);
}

function populateExpSearchCategories() {
    const sel = document.getElementById('expSearchCategory');
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = '<option value="">All Categories</option>' +
        expCategories.map(c =>
            `<option value="${c.name}" ${c.name === current ? 'selected' : ''}>${c.name}</option>`
        ).join('');
}

function populateMonthDropdown() {
    const sel = document.getElementById('expSearchMonth');
    if (!sel) return;
    const current = sel.value;
    const monthSet = new Set();
    expExpenses.forEach(e => {
        if (!e.dateTime) return;
        const d = new Date(e.dateTime);
        monthSet.add(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
    });
    const months = Array.from(monthSet).sort().reverse();
    const names = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    sel.innerHTML = '<option value="">📅 All Months</option>' +
        months.map(key => {
            const [yr, mo] = key.split('-');
            return `<option value="${key}" ${key===current?'selected':''}>${names[parseInt(mo)-1]} ${yr}</option>`;
        }).join('');
}

// ════════════════════════════════════════════════════════════
// PAYROLL TABLE
// ════════════════════════════════════════════════════════════
function renderPayrollTable() {
    const tbody = document.getElementById('payrollTbody');
    if (!tbody) return;
    if (!expCurrentProject) {
        tbody.innerHTML = '<tr><td colspan="8" class="exp-empty-row">👈 Select a project from the list.</td></tr>';
        return;
    }
    if (!expPayroll.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="exp-empty-row">No payroll entries yet. Click ＋ Add Payroll Entry.</td></tr>';
        return;
    }

    const name = _paySearch.name || '';
    const filtered = name
        ? expPayroll.filter(p => (p.workerName || '').toLowerCase().includes(name.toLowerCase()))
        : expPayroll;

    if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="exp-empty-row">🔍 No workers match your search.</td></tr>';
        _updatePaySearchCount(0, expPayroll.length);
        return;
    }

    const grandTotal = filtered.reduce((s, p) => s + (p.totalSalary || 0), 0);

    tbody.innerHTML = filtered.map(p => `
        <tr>
            <td>${formatDate(p.paymentDate)}</td>
            <td><strong>${_highlightMatch(p.workerName || '—', name)}</strong></td>
            <td>${p.role || '—'}</td>
            <td class="exp-notes-cell">${p.notes ? '<span class="exp-notes-text">' + p.notes + '</span>' : '<span class="exp-notes-empty">—</span>'}</td>
            <td>${p.daysWorked || 0}</td>
            <td>₱${formatNum(p.dailyRate)}</td>
            <td>₱${formatNum(p.totalSalary)}</td>
            <td>${getReceiptThumbsHTML(p)}</td>
            <td class="exp-action-cell">
                <button class="exp-icon-btn exp-icon-btn-edit" title="Edit" onclick="openEditPayrollModal('${p.id}')"><i data-lucide="pencil"></i></button>
                <button class="exp-icon-btn exp-icon-btn-danger" title="Delete" onclick="deletePayroll('${p.id}')"><i data-lucide="trash-2"></i></button>
            </td>
        </tr>`).join('') + `
        <tr class="exp-total-row">
            <td colspan="6"></td>
            <td class="exp-total-label">TOTAL</td>
            <td class="exp-total-value">₱${formatNum(grandTotal)}</td>
            <td></td>
        </tr>`;

    _updatePaySearchCount(filtered.length, expPayroll.length);
    if (window.lucide) lucide.createIcons();
}

function applyPayrollSearch() {
    _paySearch.name = document.getElementById('paySearchName')?.value || '';
    const hasFilter = !!_paySearch.name;
    const clearBtn  = document.getElementById('paySearchClearBtn');
    if (clearBtn) clearBtn.style.display = hasFilter ? 'inline-flex' : 'none';
    renderPayrollTable();
}

function clearPayrollSearch() {
    _paySearch.name = '';
    const el = document.getElementById('paySearchName');
    if (el) el.value = '';
    const clearBtn = document.getElementById('paySearchClearBtn');
    if (clearBtn) clearBtn.style.display = 'none';
    const count = document.getElementById('paySearchCount');
    if (count) count.style.display = 'none';
    renderPayrollTable();
}

function _updatePaySearchCount(shown, total) {
    const count = document.getElementById('paySearchCount');
    if (!count) return;
    if (_paySearch.name) {
        count.textContent = `Showing ${shown} of ${total} entries`;
        count.style.display = 'inline-block';
    } else {
        count.style.display = 'none';
    }
}

// ════════════════════════════════════════════════════════════
// PROJECT CRUD
// ════════════════════════════════════════════════════════════
let _pendingFolderId = null;

function openCreateMonthModal(folderId) {
    _pendingFolderId = folderId;
    const folder = expFolders.find(f => f.id === folderId);
    const label  = document.getElementById('createProjectFolderLabel');
    if (label) label.textContent = folder ? `📁 ${folder.name}` : '';
    document.getElementById('createProjectForm').reset();
    openExpModal('createProjectModal');
}

async function handleCreateProject(e) {
    e.preventDefault();
    const month    = document.getElementById('projMonth').value;
    const year     = parseInt(document.getElementById('projYear').value);
    const budget   = parseFloat(document.getElementById('projBudget').value);
    const folderId = _pendingFolderId;
    if (!month || !year || !budget) return;

    const dupe = expProjects.find(p =>
        p.month === month && p.year === year && p.folderId === (folderId || null)
    );
    if (dupe) {
        showExpNotif(`${month} ${year} already exists in this folder.`, 'error'); return;
    }
    try {
        showExpLoading('createProjectBtn', true);
        const data = {
            userId: currentUser.uid, month, year,
            monthlyBudget: budget,
            folderId: folderId || null,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        const ref = await db.collection('projects').add(data);
        if (folderId) _expandedFolders.add(folderId);
        showExpNotif('Month added!', 'success');
        document.getElementById('createProjectForm').reset();
        _pendingFolderId = null;
        closeExpModal('createProjectModal');
        selectProject(ref.id);
    } catch (err) {
        showExpNotif('Error: ' + err.message, 'error');
    } finally {
        showExpLoading('createProjectBtn', false);
    }
}

// ════════════════════════════════════════════════════════════
// FOLDER CRUD
// ════════════════════════════════════════════════════════════
async function handleCreateFolder(e) {
    e.preventDefault();
    const name   = document.getElementById('folderName').value.trim();
    const desc   = document.getElementById('folderDesc').value.trim();
    const budget = parseFloat(document.getElementById('folderBudget').value) || 0;
    if (!name) return;
    try {
        showExpLoading('createFolderBtn', true);
        const ref = await db.collection('folders').add({
            userId: currentUser.uid, name, description: desc,
            totalBudget: budget,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        _expandedFolders.add(ref.id);
        showExpNotif('Project folder created!', 'success');
        document.getElementById('createFolderForm').reset();
        closeExpModal('createFolderModal');
    } catch (err) {
        showExpNotif('Error: ' + err.message, 'error');
    } finally {
        showExpLoading('createFolderBtn', false);
    }
}

let _editingFolderId = null;
function openEditFolderModal(id) {
    const f = expFolders.find(x => x.id === id);
    if (!f) return;
    _editingFolderId = id;
    document.getElementById('editFolderName').value   = f.name        || '';
    document.getElementById('editFolderDesc').value   = f.description || '';
    document.getElementById('editFolderBudget').value = f.totalBudget || '';
    openExpModal('editFolderModal');
}

async function handleEditFolder(e) {
    e.preventDefault();
    if (!_editingFolderId) return;
    const name   = document.getElementById('editFolderName').value.trim();
    const desc   = document.getElementById('editFolderDesc').value.trim();
    const budget = parseFloat(document.getElementById('editFolderBudget').value) || 0;
    try {
        showExpLoading('editFolderBtn', true);
        await db.collection('folders').doc(_editingFolderId).update({
            name, description: desc, totalBudget: budget
        });
        showExpNotif('Folder updated!', 'success');
        closeExpModal('editFolderModal');
        _editingFolderId = null;
    } catch (err) {
        showExpNotif('Error: ' + err.message, 'error');
    } finally {
        showExpLoading('editFolderBtn', false);
    }
}

async function deleteFolder(id) {
    const folder = expFolders.find(f => f.id === id);
    const count  = expProjects.filter(p => p.folderId === id).length;
    const msg    = count > 0
        ? `Delete folder "${folder?.name}" and its ${count} month(s)? All expenses & payroll inside will also be deleted.`
        : `Delete folder "${folder?.name}"?`;
    if (!confirm(msg)) return;
    try {
        const uid = currentUser.uid;
        const projsInFolder = expProjects.filter(p => p.folderId === id);
        for (const p of projsInFolder) {
            const [eSnap, paySnap] = await Promise.all([
                db.collection('expenses').where('projectId','==',p.id).where('userId','==',uid).get(),
                db.collection('payroll').where('projectId','==',p.id).where('userId','==',uid).get()
            ]);
            const batch = db.batch();
            eSnap.docs.forEach(d => batch.delete(d.ref));
            paySnap.docs.forEach(d => batch.delete(d.ref));
            batch.delete(db.collection('projects').doc(p.id));
            await batch.commit();
        }
        await db.collection('folders').doc(id).delete();
        _expandedFolders.delete(id);
        if (expCurrentProject && expProjects.find(p => p.id === expCurrentProject.id)?.folderId === id) {
            expCurrentProject = null;
            updateBudgetOverview();
        }
        showExpNotif('Folder deleted.', 'success');
    } catch (err) {
        showExpNotif('Error: ' + err.message, 'error');
    }
}

async function deleteProject(id) {
    if (!confirm('Delete this project and ALL its expenses & payroll?')) return;
    try {
        const uid = currentUser.uid;
        const [eSnap, pSnap] = await Promise.all([
            db.collection('expenses').where('projectId','==',id).where('userId','==',uid).get(),
            db.collection('payroll').where('projectId','==',id).where('userId','==',uid).get()
        ]);
        const batch = db.batch();
        eSnap.docs.forEach(d => batch.delete(d.ref));
        pSnap.docs.forEach(d => batch.delete(d.ref));
        batch.delete(db.collection('projects').doc(id));
        await batch.commit();
        if (expCurrentProject?.id === id) {
            expCurrentProject = null; expExpenses = []; expPayroll = [];
        }
        showExpNotif('Project deleted.', 'success');
        await loadProjects();
    } catch (err) {
        showExpNotif('Error: ' + err.message, 'error');
    }
}

// ════════════════════════════════════════════════════════════
// EXPENSE FORM
// ════════════════════════════════════════════════════════════
function setupExpenseFormListeners() {
    const form = document.getElementById('addExpenseForm');
    if (!form) return;
    const qty  = document.getElementById('expQty');
    const cost = document.getElementById('expUnitCost');
    const amt  = document.getElementById('expAmount');
    const recalc = () => { if (amt) amt.value = ((parseFloat(qty?.value) || 1) * (parseFloat(cost?.value) || 0)).toFixed(2); };
    qty?.addEventListener('input', recalc);
    cost?.addEventListener('input', recalc);
    form.addEventListener('submit', handleAddExpense);

    const receiptInput = document.getElementById('expReceipt');
    receiptInput?.addEventListener('change', (ev) => {
        const files = Array.from(ev.target.files);
        files.forEach(file => {
            if (file.size > 5 * 1024 * 1024) {
                showExpNotif(`"${file.name}" is over 5 MB and was skipped.`, 'error');
                return;
            }
            addReceiptPreviewItem(file);
        });
        ev.target.value = '';
    });
}

let _stagedReceipts = [];
let _stagedPayReceipts = [];

function addReceiptPreviewItem(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const dataURL = e.target.result;
        const index = _stagedReceipts.length;
        _stagedReceipts.push({ file, dataURL });

        const grid = document.getElementById('expReceiptGrid');
        if (!grid) return;
        grid.style.display = 'grid';

        const item = document.createElement('div');
        item.className = 'exp-receipt-thumb';
        item.dataset.index = index;
        item.innerHTML = `
            <img src="${dataURL}" alt="Receipt ${index + 1}">
            <button type="button" class="exp-receipt-remove" onclick="removeReceiptPreview(${index})">✕</button>
            <span class="exp-receipt-num">${index + 1}</span>`;
        grid.appendChild(item);
    };
    reader.readAsDataURL(file);
}

function removeReceiptPreview(index) {
    _stagedReceipts[index] = null;
    const grid = document.getElementById('expReceiptGrid');
    if (!grid) return;
    const item = grid.querySelector(`[data-index="${index}"]`);
    if (item) item.remove();
    const remaining = _stagedReceipts.filter(r => r !== null);
    if (!remaining.length) grid.style.display = 'none';
}

function clearReceiptPreview() {
    _stagedReceipts = [];
    const grid = document.getElementById('expReceiptGrid');
    if (grid) { grid.innerHTML = ''; grid.style.display = 'none'; }
    const input = document.getElementById('expReceipt');
    if (input) input.value = '';
}

function compressImageToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
                const MAX = 900;
                let w = img.width, h = img.height;
                if (w > MAX || h > MAX) {
                    if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
                    else       { w = Math.round(w * MAX / h); h = MAX; }
                }
                const canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', 0.75));
            };
            img.onerror = reject;
            img.src = ev.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

async function handleAddExpense(e) {
    e.preventDefault();
    if (!expCurrentProject) { showExpNotif('Select a project first.', 'error'); return; }

    try {
        showExpLoading('addExpenseBtn', true);

        const validReceipts = _stagedReceipts.filter(r => r !== null);
        const receiptImages = [];
        for (const item of validReceipts) {
            const compressed = await compressImageToBase64(item.file);
            receiptImages.push(compressed);
        }

        const expenseData = {
            projectId:   expCurrentProject.id,
            userId:      currentUser.uid,
            expenseName: document.getElementById('expName').value.trim(),
            category:    document.getElementById('expCategory').value,
            quantity:    parseFloat(document.getElementById('expQty').value) || 1,
            amount:      parseFloat(document.getElementById('expAmount').value) || 0,
            dateTime:    document.getElementById('expDateTime').value,
            notes:       document.getElementById('expNotes').value.trim(),
            receiptURL:  receiptImages[0] || '',
            receiptImages: receiptImages,
            createdAt:   firebase.firestore.FieldValue.serverTimestamp()
        };

        await db.collection('expenses').add(expenseData);
        showExpNotif(receiptImages.length > 0 ? `Expense + ${receiptImages.length} receipt(s) saved! ✓` : 'Expense added! ✓', 'success');

        document.getElementById('addExpenseForm').reset();
        clearReceiptPreview();
        closeExpModal('addExpenseModal');
    } catch (err) {
        showExpNotif('Error saving expense: ' + err.message, 'error');
        console.error(err);
    } finally {
        showExpLoading('addExpenseBtn', false);
    }
}

async function deleteExpense(id) {
    if (!confirm('Delete this expense?')) return;
    try { await db.collection('expenses').doc(id).delete(); showExpNotif('Deleted.', 'success'); }
    catch (err) { showExpNotif('Error: ' + err.message, 'error'); }
}

// ════════════════════════════════════════════════════════════
// PAYROLL FORM
// ════════════════════════════════════════════════════════════
function setupPayrollFormListeners() {
    const form = document.getElementById('addPayrollForm');
    if (!form) return;
    const days = document.getElementById('payDays');
    const rate = document.getElementById('payDailyRate');
    const tot  = document.getElementById('payTotal');
    const recalc = () => { if (tot) tot.value = ((parseFloat(days?.value) || 0) * (parseFloat(rate?.value) || 0)).toFixed(2); };
    days?.addEventListener('input', recalc);
    rate?.addEventListener('input', recalc);
    form.addEventListener('submit', handleAddPayroll);

    // Wire up receipt image picker
    const receiptInput = document.getElementById('payReceipt');
    receiptInput?.addEventListener('change', (ev) => {
        const files = Array.from(ev.target.files);
        files.forEach(file => {
            if (file.size > 5 * 1024 * 1024) {
                showExpNotif(`"${file.name}" is over 5 MB and was skipped.`, 'error');
                return;
            }
            addPayReceiptPreviewItem(file);
        });
        ev.target.value = '';
    });
}

function addPayReceiptPreviewItem(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const dataURL = e.target.result;
        const index = _stagedPayReceipts.length;
        _stagedPayReceipts.push({ file, dataURL });

        const grid = document.getElementById('payReceiptGrid');
        if (!grid) return;
        grid.style.display = 'grid';

        const item = document.createElement('div');
        item.className = 'exp-receipt-thumb';
        item.dataset.index = index;
        item.innerHTML = `
            <img src="${dataURL}" alt="Receipt ${index + 1}">
            <button type="button" class="exp-receipt-remove" onclick="removePayReceiptPreview(${index})">✕</button>
            <span class="exp-receipt-num">${index + 1}</span>`;
        grid.appendChild(item);
    };
    reader.readAsDataURL(file);
}

function removePayReceiptPreview(index) {
    _stagedPayReceipts[index] = null;
    const grid = document.getElementById('payReceiptGrid');
    if (!grid) return;
    const item = grid.querySelector(`[data-index="${index}"]`);
    if (item) item.remove();
    const remaining = _stagedPayReceipts.filter(r => r !== null);
    if (!remaining.length) grid.style.display = 'none';
}

function clearPayReceiptPreview() {
    _stagedPayReceipts = [];
    const grid = document.getElementById('payReceiptGrid');
    if (grid) { grid.innerHTML = ''; grid.style.display = 'none'; }
    const input = document.getElementById('payReceipt');
    if (input) input.value = '';
}

async function handleAddPayroll(e) {
    e.preventDefault();
    if (!expCurrentProject) { showExpNotif('Select a project first.', 'error'); return; }
    try {
        showExpLoading('addPayrollBtn', true);
        const d = parseFloat(document.getElementById('payDays').value) || 0;
        const r = parseFloat(document.getElementById('payDailyRate').value) || 0;

        // Compress and collect receipt images
        const validReceipts = _stagedPayReceipts.filter(r => r !== null);
        const receiptImages = [];
        for (const item of validReceipts) {
            const compressed = await compressImageToBase64(item.file);
            receiptImages.push(compressed);
        }

        await db.collection('payroll').add({
            projectId:   expCurrentProject.id, userId: currentUser.uid,
            workerName:  document.getElementById('payWorkerName').value.trim(),
            role:        document.getElementById('payRole').value.trim(),
            daysWorked: d, dailyRate: r, totalSalary: d * r,
            paymentDate: document.getElementById('payDate').value,
            notes:       document.getElementById('payNotes').value.trim(),
            receiptImages: receiptImages,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showExpNotif('Payroll entry added!', 'success');
        document.getElementById('addPayrollForm').reset();
        clearPayReceiptPreview();
        closeExpModal('addPayrollModal');
    } catch (err) {
        showExpNotif('Error: ' + err.message, 'error');
    } finally {
        showExpLoading('addPayrollBtn', false);
    }
}

async function deletePayroll(id) {
    if (!confirm('Delete this payroll entry?')) return;
    try { await db.collection('payroll').doc(id).delete(); showExpNotif('Deleted.', 'success'); }
    catch (err) { showExpNotif('Error: ' + err.message, 'error'); }
}

// ════════════════════════════════════════════════════════════
// CHARTS
// ════════════════════════════════════════════════════════════
function updateExpCharts() {
    renderCategoryPieChart();
    renderBudgetBarChart();
    renderReportsSummaryTable();
}

function renderCategoryPieChart() {
    const ctx = document.getElementById('expCategoryChart');
    if (!ctx) return;
    const cats = {};
    expCategories.forEach(c => { cats[c.name] = 0; });
    cats['Payroll'] = 0;
    expExpenses.forEach(e => {
        const k = e.category || 'Others';
        if (!(k in cats)) cats[k] = 0;
        cats[k] += (e.amount || 0);
    });
    cats['Payroll'] = expPayroll.reduce((s, p) => s + (p.totalSalary || 0), 0);
    const labels = Object.keys(cats).filter(k => cats[k] > 0);
    const data   = labels.map(k => cats[k]);
    const bgColors = labels.map(k => {
        if (k === 'Payroll') return '#f97316';
        const cat = expCategories.find(c => c.name === k);
        return cat ? cat.color + 'cc' : '#a78bfa';
    });
    if (expCharts.pie) expCharts.pie.destroy();
    expCharts.pie = new Chart(ctx, {
        type: 'doughnut',
        data: { labels, datasets: [{ data, backgroundColor: bgColors, borderWidth: 2, borderColor: '#fff' }] },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 12 } },
                tooltip: { callbacks: { label: c => ` ₱${formatNum(c.parsed)} (${((c.parsed / c.chart.getDatasetMeta(0).total) * 100).toFixed(1)}%)` } }
            }
        }
    });
}

function renderBudgetBarChart() {
    const ctx = document.getElementById('expBudgetChart');
    if (!ctx || !expCurrentProject) return;
    const budget = expCurrentProject.monthlyBudget || 0;
    const spent  = expExpenses.reduce((s, e) => s + (e.amount || 0), 0)
                 + expPayroll.reduce((s, p) => s + (p.totalSalary || 0), 0);
    if (expCharts.bar) expCharts.bar.destroy();
    expCharts.bar = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Budget', 'Actual Spend'],
            datasets: [{ data: [budget, spent],
                backgroundColor: ['rgba(0,208,132,0.2)', spent > budget ? 'rgba(239,68,68,0.2)' : 'rgba(79,172,254,0.2)'],
                borderColor: ['#00D084', spent > budget ? '#ef4444' : '#4facfe'],
                borderWidth: 2, borderRadius: 8
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, ticks: { callback: v => '₱' + formatNum(v), font: { size: 11 } }, grid: { color: 'rgba(0,0,0,0.05)' } },
                x: { grid: { display: false } }
            }
        }
    });
}

function renderReportsSummaryTable() {
    const tbody = document.getElementById('expSummaryTbody');
    if (!tbody) return;
    const cats = {};
    expCategories.forEach(c => { cats[c.name] = 0; });
    cats['Payroll'] = 0;
    expExpenses.forEach(e => {
        const k = e.category || 'Others';
        if (!(k in cats)) cats[k] = 0;
        cats[k] += (e.amount || 0);
    });
    cats['Payroll'] = expPayroll.reduce((s, p) => s + (p.totalSalary || 0), 0);
    const total = Object.values(cats).reduce((a, b) => a + b, 0);
    const colorMap = {};
    expCategories.forEach(c => { colorMap[c.name] = c.color; });
    colorMap['Payroll'] = '#f97316';
    const colors = colorMap;
    const rows = Object.entries(cats).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    if (!rows.length) { tbody.innerHTML = '<tr><td colspan="3" class="exp-empty-row">No data yet.</td></tr>'; return; }
    tbody.innerHTML = rows.map(([cat, amt]) => `
        <tr>
            <td><span style="display:inline-block;width:10px;height:10px;background:${colors[cat]};border-radius:2px;margin-right:6px;vertical-align:middle"></span>${cat}</td>
            <td>₱${formatNum(amt)}</td>
            <td>${total > 0 ? ((amt / total) * 100).toFixed(1) : 0}%</td>
        </tr>`).join('');
}

// ════════════════════════════════════════════════════════════
// PROJECT DETAIL MODAL
// ════════════════════════════════════════════════════════════
let _pm = null, _pmExp = [], _pmPay = [], _pmUnsubs = [], _pmCharts = {};

function openProjectModal(id) {
    _pm = expProjects.find(p => p.id === id);
    if (!_pm || !currentUser) return;

    _pmUnsubs.forEach(u => u()); _pmUnsubs = [];
    Object.values(_pmCharts).forEach(c => { try { c.destroy(); } catch(e){} }); _pmCharts = {};

    setText('pmTitle',  _pm.month + ' ' + _pm.year);
    setText('pmBudget', '₱' + formatNum(_pm.monthlyBudget));

    ['pmTotalExp','pmTotalPay','pmTotalSpent','pmRemaining'].forEach(i => setText(i, '₱0.00'));
    setText('pmUsedPct', '0%'); setText('pmRemPct', '100% remaining');
    const bar = document.getElementById('pmProgressBar');
    if (bar) { bar.style.width = '0%'; bar.style.background = '#00D084'; }

    const et = document.getElementById('pmExpTbody');
    const pt = document.getElementById('pmPayTbody');
    if (et) et.innerHTML = '<tr><td colspan="6" class="exp-empty-row">Loading…</td></tr>';
    if (pt) pt.innerHTML = '<tr><td colspan="5" class="exp-empty-row">Loading…</td></tr>';

    openExpModal('projectDetailModal');

    _pmUnsubs.push(
        db.collection('expenses')
          .where('projectId', '==', id)
          .where('userId', '==', currentUser.uid)
          .onSnapshot(snap => {
              _pmExp = snap.docs.map(d => ({ id: d.id, ...d.data() }))
                          .sort((a, b) => new Date(b.dateTime||0) - new Date(a.dateTime||0));
              _pmRenderStats(); _pmRenderExpTable(); _pmRenderCharts();
          }, err => console.error('pm expenses:', err))
    );
    _pmUnsubs.push(
        db.collection('payroll')
          .where('projectId', '==', id)
          .where('userId', '==', currentUser.uid)
          .onSnapshot(snap => {
              _pmPay = snap.docs.map(d => ({ id: d.id, ...d.data() }))
                          .sort((a, b) => new Date(b.paymentDate||0) - new Date(a.paymentDate||0));
              _pmRenderStats(); _pmRenderPayTable(); _pmRenderCharts();
          }, err => console.error('pm payroll:', err))
    );
}

function closeProjectModal() {
    closeExpModal('projectDetailModal');
    _pmUnsubs.forEach(u => u()); _pmUnsubs = [];
    Object.values(_pmCharts).forEach(c => { try { c.destroy(); } catch(e){} }); _pmCharts = {};
}

function _pmRenderStats() {
    const budget = _pm?.monthlyBudget || 0;
    const exps   = _pmExp.reduce((s,e) => s+(e.amount||0), 0);
    const pay    = _pmPay.reduce((s,p) => s+(p.totalSalary||0), 0);
    const spent  = exps + pay;
    const remain = budget - spent;
    const pct    = budget > 0 ? (spent/budget)*100 : 0;
    setText('pmTotalExp',   '₱'+formatNum(exps));
    setText('pmTotalPay',   '₱'+formatNum(pay));
    setText('pmTotalSpent', '₱'+formatNum(spent));
    setText('pmRemaining',  '₱'+formatNum(remain));
    setText('pmUsedPct',    pct.toFixed(1)+'%');
    setText('pmRemPct',     (100-pct).toFixed(1)+'% remaining');
    const bar = document.getElementById('pmProgressBar');
    if (bar) {
        const w = Math.min(pct,100);
        bar.style.width = w+'%';
        bar.style.background = w>90?'#ef4444':w>70?'#f59e0b':'#00D084';
    }
}

function _pmRenderExpTable() {
    const tbody = document.getElementById('pmExpTbody');
    if (!tbody) return;
    if (!_pmExp.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="exp-empty-row">No expenses yet.</td></tr>';
        return;
    }

    const groups = {};
    _pmExp.forEach(e => {
        const key = e.category || 'Uncategorized';
        if (!groups[key]) groups[key] = [];
        groups[key].push(e);
    });

    let html = '';
    Object.entries(groups).forEach(([category, items]) => {
        const cat = expCategories.find(c => c.name === category);
        const color = cat ? cat.color : '#9ca3af';
        const subtotal = items.reduce((s, e) => s + (e.amount || 0), 0);
        const r = parseInt((color.replace('#','')).substring(0,2),16);
        const g = parseInt((color.replace('#','')).substring(2,4),16);
        const b = parseInt((color.replace('#','')).substring(4,6),16);
        html += `
        <tr class="exp-group-header">
            <td colspan="6">
                <div class="exp-group-header-inner" style="--cat-color:${color};--cat-bg:rgba(${r},${g},${b},0.08);border-left-color:${color}">
                    <span class="exp-group-dot" style="background:${color}"></span>
                    <span class="exp-group-name" style="color:${color}">${category}</span>
                    <span class="exp-group-count">${items.length} item${items.length > 1 ? 's' : ''}</span>
                    <span class="exp-group-subtotal">₱${formatNum(subtotal)}</span>
                </div>
            </td>
        </tr>`;
        items.forEach(e => {
            html += `
        <tr class="exp-group-row">
            <td>${formatDate(e.dateTime)}</td>
            <td><strong>${e.expenseName||'—'}</strong></td>
            <td class="exp-notes-cell">${e.notes ? '<span class="exp-notes-text">'+e.notes+'</span>' : '<span class="exp-notes-empty">—</span>'}</td>
            <td>${e.quantity||1}</td>
            <td>₱${formatNum(e.amount)}</td>
            <td>${getReceiptThumbsHTML(e)}</td>
        </tr>`;
        });
    });

    const grandTotal = _pmExp.reduce((s, e) => s + (e.amount || 0), 0);
    html += `
        <tr class="exp-total-row">
            <td colspan="3"></td>
            <td class="exp-total-label">TOTAL</td>
            <td class="exp-total-value">₱${formatNum(grandTotal)}</td>
            <td></td>
        </tr>`;

    tbody.innerHTML = html;
}

function _pmRenderPayTable() {
    const tbody = document.getElementById('pmPayTbody');
    if (!tbody) return;
    if (!_pmPay.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="exp-empty-row">No payroll yet.</td></tr>';
        return;
    }
    const totalSalary = _pmPay.reduce((s, p) => s + (p.totalSalary || 0), 0);
    tbody.innerHTML = _pmPay.map(p => `
        <tr>
            <td>${formatDate(p.paymentDate)}</td>
            <td><strong>${p.workerName||'—'}</strong></td>
            <td>${p.role||'—'}</td>
            <td class="exp-notes-cell">${p.notes ? '<span class="exp-notes-text">'+p.notes+'</span>' : '<span class="exp-notes-empty">—</span>'}</td>
            <td>${p.daysWorked||0} days × ₱${formatNum(p.dailyRate)}</td>
            <td>₱${formatNum(p.totalSalary)}</td>
            <td>${getReceiptThumbsHTML(p)}</td>
        </tr>`).join('') + `
        <tr class="exp-pm-total-row">
            <td colspan="6" style="text-align:right;font-weight:700;padding:0.6rem 0.75rem;border-top:2px solid #e5e7eb;color:#374151;">TOTAL</td>
            <td style="font-weight:800;padding:0.6rem 0.75rem;border-top:2px solid #e5e7eb;color:#1a1a1a;">₱${formatNum(totalSalary)}</td>
        </tr>`;
}

function _pmRenderCharts() {
    const pieCtx = document.getElementById('pmCategoryChart');
    if (pieCtx) {
        const cats = {};
        expCategories.forEach(c => { cats[c.name] = 0; });
        cats['Payroll'] = 0;
        _pmExp.forEach(e => {
            const k = e.category||'Others';
            if (!(k in cats)) cats[k] = 0;
            cats[k] += (e.amount||0);
        });
        cats['Payroll'] = _pmPay.reduce((s,p) => s+(p.totalSalary||0), 0);
        const labels = Object.keys(cats).filter(k => cats[k]>0);
        const data   = labels.map(k => cats[k]);
        const bgColors = labels.map(k => {
            if (k==='Payroll') return '#f97316';
            const cat = expCategories.find(c => c.name===k);
            return cat ? cat.color+'cc' : '#a78bfa';
        });
        if (_pmCharts.pie) _pmCharts.pie.destroy();
        _pmCharts.pie = new Chart(pieCtx, {
            type: 'doughnut',
            data: { labels, datasets: [{ data, backgroundColor: bgColors, borderWidth:2, borderColor:'#fff' }] },
            options: { responsive:true, maintainAspectRatio:false,
                plugins: { legend:{position:'right',labels:{font:{size:11},padding:10}},
                    tooltip:{callbacks:{label:c=>` ₱${formatNum(c.parsed)} (${((c.parsed/c.chart.getDatasetMeta(0).total)*100).toFixed(1)}%)`}} }
            }
        });
    }
    const barCtx = document.getElementById('pmBudgetChart');
    if (barCtx && _pm) {
        const budget = _pm.monthlyBudget||0;
        const spent  = _pmExp.reduce((s,e)=>s+(e.amount||0),0)+_pmPay.reduce((s,p)=>s+(p.totalSalary||0),0);
        if (_pmCharts.bar) _pmCharts.bar.destroy();
        _pmCharts.bar = new Chart(barCtx, {
            type: 'bar',
            data: { labels:['Budget','Actual Spend'], datasets:[{ data:[budget,spent],
                backgroundColor:['rgba(0,208,132,0.15)',spent>budget?'rgba(239,68,68,0.15)':'rgba(79,172,254,0.15)'],
                borderColor:['#00D084',spent>budget?'#ef4444':'#4facfe'], borderWidth:2, borderRadius:8 }]},
            options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}},
                scales:{ y:{beginAtZero:true,ticks:{callback:v=>'₱'+formatNum(v),font:{size:10}},grid:{color:'rgba(0,0,0,0.05)'}}, x:{grid:{display:false}} }
            }
        });
    }
}

// ════════════════════════════════════════════════════════════
// RECEIPT / LIGHTBOX
// ════════════════════════════════════════════════════════════
function getReceiptThumbsHTML(e) {
    const images = e.receiptImages?.length
        ? e.receiptImages
        : (e.receiptURL ? [e.receiptURL] : []);
    if (!images.length) return '<span class="exp-no-receipt">—</span>';

    _receiptStore[e.id] = { images, name: e.expenseName || 'Expense' };

    const thumbsHTML = images.slice(0, 3).map((src, i) =>
        `<img src="${src}" class="exp-inline-thumb" onclick="openLightbox('${e.id}',${i})" alt="receipt">`
    ).join('');
    const more = images.length > 3
        ? `<span class="exp-thumb-more" onclick="openLightbox('${e.id}',0)">+${images.length - 3}</span>`
        : '';
    return `<div class="exp-thumb-row">${thumbsHTML}${more}</div>`;
}

const _receiptStore = {};

let _lbImages = [], _lbCurrent = 0, _lbTitle = '';
let _lbZoom = 1, _lbDragging = false, _lbTranslate = { x: 0, y: 0 };

function openLightbox(expenseId, startIndex = 0) {
    const data = _receiptStore[expenseId];
    if (!data) return;
    _lbImages  = data.images;
    _lbCurrent = startIndex;
    _lbTitle   = data.name;

    const lb = document.getElementById('receiptLightbox');
    if (!lb) return;
    document.getElementById('lbTitle').textContent = `📎 ${_lbTitle}`;
    _lbRender();
    lb.classList.add('active');
    document.body.style.overflow = 'hidden';
    setTimeout(_lbSetupZoom, 60);
}

function _lbRender() {
    const img     = document.getElementById('lbMainImg');
    const counter = document.getElementById('lbCounter');
    const thumbs  = document.getElementById('lbThumbs');
    if (img) { img.src = _lbImages[_lbCurrent]; _lbResetZoom(false); }
    if (counter) counter.textContent = `${_lbCurrent + 1} / ${_lbImages.length}`;
    if (thumbs) {
        thumbs.innerHTML = _lbImages.map((src, i) => `
            <img src="${src}" class="lb-thumb ${i === _lbCurrent ? 'active' : ''}"
                 onclick="lbGoto(${i})" alt="receipt ${i+1}">`
        ).join('');
        thumbs.style.display = _lbImages.length > 1 ? 'flex' : 'none';
    }
    const prev = document.getElementById('lbPrev');
    const next = document.getElementById('lbNext');
    if (prev) prev.style.display = _lbImages.length > 1 ? 'flex' : 'none';
    if (next) next.style.display = _lbImages.length > 1 ? 'flex' : 'none';
    _lbUpdateZoomUI();
}

function _lbClampTranslate() {
    const img  = document.getElementById('lbMainImg');
    const wrap = document.getElementById('lbImgWrap');
    if (!img || !wrap || _lbZoom <= 1) { _lbTranslate = { x: 0, y: 0 }; return; }
    const iw = img.offsetWidth  * _lbZoom;
    const ih = img.offsetHeight * _lbZoom;
    const ww = wrap.offsetWidth;
    const wh = wrap.offsetHeight;
    const maxX = Math.max(0, (iw - ww) / 2);
    const maxY = Math.max(0, (ih - wh) / 2);
    _lbTranslate.x = Math.min(maxX, Math.max(-maxX, _lbTranslate.x));
    _lbTranslate.y = Math.min(maxY, Math.max(-maxY, _lbTranslate.y));
}

function _lbApplyTransform() {
    const img = document.getElementById('lbMainImg');
    if (!img) return;
    _lbClampTranslate();
    img.style.transform = `scale(${_lbZoom}) translate(${_lbTranslate.x / _lbZoom}px, ${_lbTranslate.y / _lbZoom}px)`;
    img.style.cursor = _lbZoom > 1 ? (_lbDragging ? 'grabbing' : 'grab') : 'zoom-in';
}

function _lbResetZoom(apply = true) {
    _lbZoom = 1;
    _lbTranslate = { x: 0, y: 0 };
    if (apply) { _lbApplyTransform(); _lbUpdateZoomUI(); }
}

function _lbUpdateZoomUI() {
    const btn  = document.getElementById('lbZoomBtn');
    const pct  = document.getElementById('lbZoomPct');
    if (btn) btn.textContent = _lbZoom > 1 ? '↩ Reset' : '🔍';
    if (pct) {
        pct.textContent = _lbZoom > 1 ? `${Math.round(_lbZoom * 100)}%` : '';
        pct.style.display = _lbZoom > 1 ? 'inline' : 'none';
    }
}

function lbZoomIn()  { _lbZoom = Math.min(5, _lbZoom + 0.5); _lbApplyTransform(); _lbUpdateZoomUI(); }
function lbZoomOut() {
    _lbZoom = Math.max(1, _lbZoom - 0.5);
    if (_lbZoom === 1) _lbTranslate = { x: 0, y: 0 };
    _lbApplyTransform(); _lbUpdateZoomUI();
}
function lbZoomToggle() { _lbZoom > 1 ? _lbResetZoom() : lbZoomIn(); }

function _lbSetupZoom() {
    const img  = document.getElementById('lbMainImg');
    const wrap = document.getElementById('lbImgWrap');
    if (!img || !wrap || wrap._zoomReady) return;
    wrap._zoomReady = true;

    img.addEventListener('click', () => {
        if (_lbDragging) return;
        _lbZoom > 1 ? _lbResetZoom() : (() => { _lbZoom = 2.5; _lbApplyTransform(); _lbUpdateZoomUI(); })();
    });

    wrap.addEventListener('wheel', (e) => {
        e.preventDefault();
        _lbZoom = Math.min(5, Math.max(1, _lbZoom + (e.deltaY < 0 ? 0.3 : -0.3)));
        if (_lbZoom === 1) _lbTranslate = { x: 0, y: 0 };
        _lbApplyTransform(); _lbUpdateZoomUI();
    }, { passive: false });

    img.addEventListener('mousedown', (e) => {
        if (_lbZoom <= 1) return;
        e.preventDefault();
        const ox = e.clientX - _lbTranslate.x;
        const oy = e.clientY - _lbTranslate.y;
        _lbDragging = false;
        img.style.cursor = 'grabbing';
        const onMove = (e) => {
            _lbDragging = true;
            _lbTranslate.x = e.clientX - ox;
            _lbTranslate.y = e.clientY - oy;
            _lbApplyTransform();
        };
        const onUp = () => {
            img.style.cursor = 'grab';
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            setTimeout(() => { _lbDragging = false; }, 50);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });

    let _touches = [];
    let _initDist = 0, _initZoom = 1;
    wrap.addEventListener('touchstart', (e) => {
        _touches = Array.from(e.touches);
        if (_touches.length === 2) {
            _initDist = Math.hypot(_touches[1].clientX - _touches[0].clientX, _touches[1].clientY - _touches[0].clientY);
            _initZoom = _lbZoom;
        }
    }, { passive: true });
    wrap.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2) {
            e.preventDefault();
            const dist = Math.hypot(e.touches[1].clientX - e.touches[0].clientX, e.touches[1].clientY - e.touches[0].clientY);
            _lbZoom = Math.min(5, Math.max(1, _initZoom * (dist / _initDist)));
            if (_lbZoom === 1) _lbTranslate = { x: 0, y: 0 };
            _lbApplyTransform(); _lbUpdateZoomUI();
        }
    }, { passive: false });
}

function lbGoto(i) { _lbCurrent = i; _lbRender(); }
function lbPrev()  { _lbCurrent = (_lbCurrent - 1 + _lbImages.length) % _lbImages.length; _lbRender(); }
function lbNext()  { _lbCurrent = (_lbCurrent + 1) % _lbImages.length; _lbRender(); }

function closeLightbox() {
    const lb = document.getElementById('receiptLightbox');
    if (lb) lb.classList.remove('active');
    document.body.style.overflow = '';
    _lbResetZoom();
    const wrap = document.getElementById('lbImgWrap');
    if (wrap) wrap._zoomReady = false;
}

function viewReceipt(expenseId) {
    if (!_receiptStore[expenseId]) {
        const expense = expExpenses.find(e => e.id === expenseId)
                     || _pmExp.find(e => e.id === expenseId);
        if (!expense) return;
        const images = expense.receiptImages?.length
            ? expense.receiptImages
            : (expense.receiptURL ? [expense.receiptURL] : []);
        _receiptStore[expenseId] = { images, name: expense.expenseName || 'Expense' };
    }
    openLightbox(expenseId, 0);
}

// ════════════════════════════════════════════════════════════
// EDIT EXPENSE
// ════════════════════════════════════════════════════════════
let _editingExpenseId   = null;
let _editStagedReceipts = [];
let _editKeptImages     = [];

function openEditExpenseModal(id) {
    const e = expExpenses.find(x => x.id === id);
    if (!e) return;
    _editingExpenseId = id; _editStagedReceipts = []; _editKeptImages = [];
    document.getElementById('editExpName').value     = e.expenseName || '';
    document.getElementById('editExpDateTime').value = e.dateTime    || '';
    document.getElementById('editExpQty').value      = e.quantity    || 1;
    document.getElementById('editExpUnitCost').value = e.quantity && e.amount
        ? (e.amount / e.quantity).toFixed(2) : (e.amount || '');
    document.getElementById('editExpAmount').value   = e.amount || '';
    document.getElementById('editExpNotes').value    = e.notes  || '';
    const sel = document.getElementById('editExpCategory');
    sel.innerHTML = '<option value="">Select category…</option>' +
        expCategories.map(c =>
            `<option value="${c.name}" ${c.name === e.category ? 'selected' : ''}>${c.name}</option>`
        ).join('');
    const imgs = e.receiptImages?.length ? e.receiptImages : (e.receiptURL ? [e.receiptURL] : []);
    _editKeptImages = [...imgs];
    _renderEditExpGrid();
    openExpModal('editExpenseModal');
}

function _renderEditExpGrid() {
    const grid = document.getElementById('editExpReceiptGrid');
    if (!grid) return;
    grid.innerHTML = '';
    let count = 0;
    _editKeptImages.forEach((src, i) => {
        count++;
        const d = document.createElement('div');
        d.className = 'exp-receipt-thumb';
        d.innerHTML = `<img src="${src}" alt="Receipt ${count}">
            <button type="button" class="exp-receipt-remove" onclick="_removeEditExpKept(${i})">✕</button>
            <span class="exp-receipt-num">${count}</span>`;
        grid.appendChild(d);
    });
    _editStagedReceipts.forEach((item, i) => {
        if (!item) return; count++;
        const d = document.createElement('div');
        d.className = 'exp-receipt-thumb exp-receipt-thumb-new';
        d.innerHTML = `<img src="${item.dataURL}" alt="New ${count}">
            <button type="button" class="exp-receipt-remove" onclick="_removeEditExpStaged(${i})">✕</button>
            <span class="exp-receipt-num">${count}</span>
            <span class="exp-receipt-new-badge">NEW</span>`;
        grid.appendChild(d);
    });
    grid.style.display = count > 0 ? 'grid' : 'none';
}
function _removeEditExpKept(i)   { _editKeptImages.splice(i, 1);  _renderEditExpGrid(); }
function _removeEditExpStaged(i) { _editStagedReceipts[i] = null; _renderEditExpGrid(); }

function setupEditExpenseFormListeners() {
    const form = document.getElementById('editExpenseForm');
    if (!form) return;
    const qty  = document.getElementById('editExpQty');
    const cost = document.getElementById('editExpUnitCost');
    const amt  = document.getElementById('editExpAmount');
    const recalc = () => {
        if (amt) amt.value = ((parseFloat(qty?.value) || 1) * (parseFloat(cost?.value) || 0)).toFixed(2);
    };
    qty?.addEventListener('input', recalc);
    cost?.addEventListener('input', recalc);
    document.getElementById('editExpReceiptInput')?.addEventListener('change', ev => {
        Array.from(ev.target.files).forEach(file => {
            const reader = new FileReader();
            reader.onload = e => { _editStagedReceipts.push({ file, dataURL: e.target.result }); _renderEditExpGrid(); };
            reader.readAsDataURL(file);
        });
        ev.target.value = '';
    });
    form.addEventListener('submit', handleEditExpense);
}

async function handleEditExpense(ev) {
    ev.preventDefault();
    if (!_editingExpenseId) return;
    try {
        showExpLoading('editExpenseBtn', true);
        const newImgs = [];
        for (const item of _editStagedReceipts.filter(x => x !== null))
            newImgs.push(await compressImageToBase64(item.file));
        const finalImages = [..._editKeptImages, ...newImgs];
        await db.collection('expenses').doc(_editingExpenseId).update({
            expenseName:   document.getElementById('editExpName').value.trim(),
            category:      document.getElementById('editExpCategory').value,
            quantity:      parseFloat(document.getElementById('editExpQty').value) || 1,
            amount:        parseFloat(document.getElementById('editExpAmount').value) || 0,
            dateTime:      document.getElementById('editExpDateTime').value,
            notes:         document.getElementById('editExpNotes').value.trim(),
            receiptURL:    finalImages[0] || '',
            receiptImages: finalImages,
        });
        showExpNotif('Expense updated! ✓', 'success');
        closeExpModal('editExpenseModal');
        _editingExpenseId = null; _editStagedReceipts = []; _editKeptImages = [];
    } catch (err) { showExpNotif('Error: ' + err.message, 'error'); console.error(err); }
    finally { showExpLoading('editExpenseBtn', false); }
}

// ════════════════════════════════════════════════════════════
// EDIT PAYROLL
// ════════════════════════════════════════════════════════════
let _editingPayrollId = null;
let _editPayStaged    = [];
let _editPayKept      = [];

function openEditPayrollModal(id) {
    const p = expPayroll.find(x => x.id === id);
    if (!p) return;
    _editingPayrollId = id; _editPayStaged = []; _editPayKept = [];
    document.getElementById('editPayWorkerName').value = p.workerName  || '';
    document.getElementById('editPayRole').value       = p.role        || '';
    document.getElementById('editPayDays').value       = p.daysWorked  || '';
    document.getElementById('editPayDailyRate').value  = p.dailyRate   || '';
    document.getElementById('editPayTotal').value      = p.totalSalary || '';
    // Ensure paymentDate is in datetime-local format (YYYY-MM-DDTHH:mm)
    const _payDt = p.paymentDate || '';
    document.getElementById('editPayDate').value = _payDt.includes('T') ? _payDt : (_payDt ? _payDt + 'T00:00' : '');
    document.getElementById('editPayNotes').value      = p.notes       || '';
    const imgs = p.receiptImages?.length ? p.receiptImages : (p.receiptURL ? [p.receiptURL] : []);
    _editPayKept = [...imgs];
    _renderEditPayGrid();
    openExpModal('editPayrollModal');
}

function _renderEditPayGrid() {
    const grid = document.getElementById('editPayReceiptGrid');
    if (!grid) return;
    grid.innerHTML = '';
    let count = 0;
    _editPayKept.forEach((src, i) => {
        count++;
        const d = document.createElement('div');
        d.className = 'exp-receipt-thumb';
        d.innerHTML = `<img src="${src}" alt="Receipt ${count}">
            <button type="button" class="exp-receipt-remove" onclick="_removeEditPayKept(${i})">✕</button>
            <span class="exp-receipt-num">${count}</span>`;
        grid.appendChild(d);
    });
    _editPayStaged.forEach((item, i) => {
        if (!item) return; count++;
        const d = document.createElement('div');
        d.className = 'exp-receipt-thumb exp-receipt-thumb-new';
        d.innerHTML = `<img src="${item.dataURL}" alt="New ${count}">
            <button type="button" class="exp-receipt-remove" onclick="_removeEditPayStaged(${i})">✕</button>
            <span class="exp-receipt-num">${count}</span>
            <span class="exp-receipt-new-badge">NEW</span>`;
        grid.appendChild(d);
    });
    grid.style.display = count > 0 ? 'grid' : 'none';
}
function _removeEditPayKept(i)   { _editPayKept.splice(i, 1); _renderEditPayGrid(); }
function _removeEditPayStaged(i) { _editPayStaged[i] = null;  _renderEditPayGrid(); }

function setupEditPayrollFormListeners() {
    const form = document.getElementById('editPayrollForm');
    if (!form) return;
    const days = document.getElementById('editPayDays');
    const rate = document.getElementById('editPayDailyRate');
    const tot  = document.getElementById('editPayTotal');
    const recalc = () => {
        if (tot) tot.value = ((parseFloat(days?.value) || 0) * (parseFloat(rate?.value) || 0)).toFixed(2);
    };
    days?.addEventListener('input', recalc);
    rate?.addEventListener('input', recalc);
    document.getElementById('editPayReceiptInput')?.addEventListener('change', ev => {
        Array.from(ev.target.files).forEach(file => {
            const reader = new FileReader();
            reader.onload = e => { _editPayStaged.push({ file, dataURL: e.target.result }); _renderEditPayGrid(); };
            reader.readAsDataURL(file);
        });
        ev.target.value = '';
    });
    form.addEventListener('submit', handleEditPayroll);
}

async function handleEditPayroll(ev) {
    ev.preventDefault();
    if (!_editingPayrollId) return;
    try {
        showExpLoading('editPayrollBtn', true);
        const d = parseFloat(document.getElementById('editPayDays').value) || 0;
        const r = parseFloat(document.getElementById('editPayDailyRate').value) || 0;
        const newImgs = [];
        for (const item of _editPayStaged.filter(x => x !== null))
            newImgs.push(await compressImageToBase64(item.file));
        const finalImages = [..._editPayKept, ...newImgs];
        await db.collection('payroll').doc(_editingPayrollId).update({
            workerName:    document.getElementById('editPayWorkerName').value.trim(),
            role:          document.getElementById('editPayRole').value.trim(),
            daysWorked:    d, dailyRate: r, totalSalary: d * r,
            paymentDate:   document.getElementById('editPayDate').value,
            notes:         document.getElementById('editPayNotes').value.trim(),
            receiptURL:    finalImages[0] || '',
            receiptImages: finalImages,
        });
        showExpNotif('Payroll updated! ✓', 'success');
        closeExpModal('editPayrollModal');
        _editingPayrollId = null; _editPayStaged = []; _editPayKept = [];
    } catch (err) { showExpNotif('Error: ' + err.message, 'error'); console.error(err); }
    finally { showExpLoading('editPayrollBtn', false); }
}

// ════════════════════════════════════════════════════════════
// MODAL HELPERS
// ════════════════════════════════════════════════════════════
function openExpModal(id)  { const m = document.getElementById(id); if (m) m.classList.add('active'); }
function closeExpModal(id) {
    const m = document.getElementById(id);
    if (m) m.classList.remove('active');
    // Clear staged payroll receipts when closing that modal
    if (id === 'addPayrollModal') clearPayReceiptPreview();
}
function guardExpModal(modalId) {
    if (!expCurrentProject) { showExpNotif('Please select a project first.', 'error'); return; }
    openExpModal(modalId);
}

// ════════════════════════════════════════════════════════════
// UTILITIES
// ════════════════════════════════════════════════════════════
function getCategoryBadgeHTML(category) {
    if (!category) return '<span class="exp-badge" style="background:#f3f4f6;color:#6b7280">—</span>';
    const cat = expCategories.find(c => c.name === category);
    const color = cat ? cat.color : '#a78bfa';
    const hex = color.replace('#','');
    const r = parseInt(hex.substring(0,2),16);
    const g = parseInt(hex.substring(2,4),16);
    const b = parseInt(hex.substring(4,6),16);
    return `<span class="exp-badge" style="background:rgba(${r},${g},${b},0.15);color:${color};border:1px solid rgba(${r},${g},${b},0.3)">${category}</span>`;
}

function formatNum(n) {
    if (n === undefined || n === null) return '0.00';
    return Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function formatDate(d) {
    if (!d) return '—';
    const dt = new Date(d);
    const datePart = dt.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
    // Only show time if the value includes a time component (not midnight exactly from date-only input)
    const hasTime = typeof d === 'string' && d.includes('T') && !d.endsWith('T00:00') && !d.endsWith('T00:00:00');
    if (hasTime) {
        const timePart = dt.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true });
        return datePart + ' · ' + timePart;
    }
    return datePart;
}
function setText(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }
function showExpNotif(msg, type = 'success') {
    const n = document.getElementById('expNotification');
    if (!n) return;
    n.textContent = msg;
    n.className = 'exp-notification ' + type + ' show';
    setTimeout(() => n.classList.remove('show'), 3500);
}
function showExpLoading(btnId, loading) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.disabled = loading;
    btn.textContent = loading ? 'Saving…' : (btn.dataset.label || 'Save');
}

console.log('✅ Expenses Tracker Module Loaded');
// ════════════════════════════════════════════════════════════
// REPORTS DASHBOARD — Weekly / Monthly / Quarterly / Semi / Annual
// ════════════════════════════════════════════════════════════
let _rptState = {
    period:      'monthly',
    year:        new Date().getFullYear(),
    projects:    [],
    allExpenses: [],
    allPayroll:  [],
    loading:     false
};
let _rptCharts = {};

function initReportsDashboard() {
    // Populate year selector
    const yearSel = document.getElementById('rptYearSel');
    if (yearSel) {
        const cy = new Date().getFullYear();
        const prev = yearSel.value ? parseInt(yearSel.value) : _rptState.year;
        yearSel.innerHTML = '';
        for (let y = cy + 1; y >= cy - 4; y--) {
            const o = document.createElement('option');
            o.value = y; o.textContent = y;
            if (y === prev) o.selected = true;
            yearSel.appendChild(o);
        }
        _rptState.year = parseInt(yearSel.value) || cy;
    }

    // Sync period tabs
    document.querySelectorAll('.rpt-tab').forEach(t =>
        t.classList.toggle('active', t.dataset.period === _rptState.period)
    );
    if (typeof lucide !== 'undefined') lucide.createIcons();
    _rptUpdateAxisHint(_rptState.period);
    loadRptData();
}

function onRptYearChange() {
    _rptState.year = parseInt(document.getElementById('rptYearSel')?.value) || new Date().getFullYear();
    loadRptData();
}

function setRptPeriod(period) {
    _rptState.period = period;
    document.querySelectorAll('.rpt-tab').forEach(t =>
        t.classList.toggle('active', t.dataset.period === period)
    );
    _rptUpdateAxisHint(period);
    renderReportsDashboard();
}

function _rptUpdateAxisHint(period) {
    const el = document.getElementById('rptAxisHintText');
    if (!el) return;
    const hints = {
        weekly:    'X-axis: <strong>W1, W2, W3…</strong> — W = Week number. W1 is the 1st week of January, up to W52/W53 in December.',
        monthly:   'X-axis: <strong>Jan, Feb, Mar…</strong> — Each bar represents one calendar month.',
        quarterly: 'X-axis: <strong>Q1 – Q4</strong> — Q = Quarter. Q1=Jan–Mar · Q2=Apr–Jun · Q3=Jul–Sep · Q4=Oct–Dec',
        semi:      'X-axis: <strong>H1, H2</strong> — H = Half-year. H1=Jan–Jun (first 6 months) · H2=Jul–Dec (last 6 months)',
        annual:    'X-axis: <strong>Full Year</strong> — One combined bar showing total spending for the entire year.'
    };
    el.innerHTML = hints[period] || '';
}

async function loadRptData() {
    if (!currentUser) return;
    _rptState.loading = true;
    _rptShowLoading();

    try {
        // Company-wide: all projects across ALL folders for this year
        const folderProjects = expProjects.filter(p => p.year === _rptState.year);
        if (!folderProjects.length) {
            _rptShowEmpty(`No projects found for ${_rptState.year}. Try a different year.`);
            return;
        }

        // Update company subtitle
        const folderCount  = new Set(folderProjects.map(p => p.folderId).filter(Boolean)).size;
        const projCount    = folderProjects.length;
        setText('rptCompanySub',
            `${projCount} project period${projCount!==1?'s':''} · ${folderCount} folder${folderCount!==1?'s':''} · ${_rptState.year}`);

        const ids = folderProjects.map(p => p.id);
        let allExps = [], allPay = [];

        // Chunk into groups of 10 (Firestore 'in' limit)
        for (let i = 0; i < ids.length; i += 10) {
            const chunk = ids.slice(i, i + 10);
            const [eSnap, pSnap] = await Promise.all([
                db.collection('expenses').where('userId','==',currentUser.uid).where('projectId','in',chunk).get(),
                db.collection('payroll').where('userId','==',currentUser.uid).where('projectId','in',chunk).get()
            ]);
            allExps.push(...eSnap.docs.map(d => ({ id: d.id, ...d.data() })));
            allPay.push( ...pSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        }

        _rptState.projects    = folderProjects;
        _rptState.allExpenses = allExps;
        _rptState.allPayroll  = allPay;
        renderReportsDashboard();
    } catch(err) {
        console.error('loadRptData:', err);
        _rptShowEmpty('Error loading data: ' + err.message);
    } finally {
        _rptState.loading = false;
    }
}

function _rptShowLoading() {
    const row = document.getElementById('rptKpiRow');
    if (row) row.innerHTML = '<div class="rpt-loading"><span class="rpt-spinner"></span>Loading report data…</div>';
}

function _rptShowEmpty(msg) {
    const row = document.getElementById('rptKpiRow');
    if (row) row.innerHTML = `<div class="rpt-empty-state"><i data-lucide="bar-chart-2" class="rpt-empty-ico"></i><p>${msg}</p></div>`;
    const tbody = document.getElementById('rptSummaryTbody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="exp-empty-row">${msg}</td></tr>`;
    Object.values(_rptCharts).forEach(c => { try { c.destroy(); } catch(e){} }); _rptCharts = {};
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function renderReportsDashboard() {
    if (!_rptState.projects?.length) return;
    const groups = _computePeriodGroups(_rptState.period, _rptState.year,
        _rptState.projects, _rptState.allExpenses, _rptState.allPayroll);
    _rptRenderKPIs(groups);
    _rptRenderTrendChart(groups);
    _rptRenderCompositionChart();
    _rptRenderBvaChart(groups);
    _rptRenderCategoryChart();
    _rptRenderTable(groups);
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ════════════════════════════════════════════════════════════
// PERIOD GROUPING ENGINE
// ════════════════════════════════════════════════════════════
const _MONTHS = ['January','February','March','April','May','June',
                 'July','August','September','October','November','December'];
const _MON3   = _MONTHS.map(m => m.substring(0,3));

function _computePeriodGroups(period, year, projects, expenses, payroll) {
    const projByMonth = {};
    projects.forEach(p => { projByMonth[p.month] = p; });

    const expByProj = {}, payByProj = {};
    projects.forEach(p => { expByProj[p.id] = []; payByProj[p.id] = []; });
    expenses.forEach(e => { if (expByProj[e.projectId]) expByProj[e.projectId].push(e); });
    payroll.forEach(p => { if (payByProj[p.projectId]) payByProj[p.projectId].push(p); });

    function _sumMonths(monthNames) {
        let budget = 0, mats = 0, labor = 0, tx = 0;
        const workers = new Set();
        monthNames.forEach(mo => {
            const proj = projByMonth[mo];
            if (!proj) return;
            budget += proj.monthlyBudget || 0;
            (expByProj[proj.id] || []).forEach(e => { mats += e.amount || 0; tx++; });
            (payByProj[proj.id] || []).forEach(p => { labor += p.totalSalary || 0; workers.add(p.workerName || p.id); });
        });
        const totalSpent = mats + labor;
        const remaining  = budget - totalSpent;
        const usedPct    = budget > 0 ? (totalSpent / budget) * 100 : 0;
        return { budget, mats, labor, totalSpent, remaining, usedPct, txCount: tx, workerCount: workers.size };
    }

    function _status(pct) {
        if (pct > 100) return 'danger';
        if (pct > 85)  return 'warning';
        if (pct > 60)  return 'ontrack';
        return 'healthy';
    }

    switch (period) {

        case 'annual': {
            const d = _sumMonths(_MONTHS);
            const totalContract = expFolders.reduce((s, f) => s + (f.totalBudget || 0), 0);
            return [{ label: `FY ${year}`, shortLabel: `${year}`, months: _MONTHS,
                contractValue: totalContract, ...d, status: _status(d.usedPct) }];
        }

        case 'semi': {
            return [
                { label:`H1 ${year}`, shortLabel:'H1', months:_MONTHS.slice(0,6)  },
                { label:`H2 ${year}`, shortLabel:'H2', months:_MONTHS.slice(6,12) }
            ].map(h => ({ ...h, ..._sumMonths(h.months), status: _status(_sumMonths(h.months).usedPct) }));
        }

        case 'quarterly': {
            return [
                { label:`Q1 ${year}`, shortLabel:'Q1', months:_MONTHS.slice(0,3) },
                { label:`Q2 ${year}`, shortLabel:'Q2', months:_MONTHS.slice(3,6) },
                { label:`Q3 ${year}`, shortLabel:'Q3', months:_MONTHS.slice(6,9) },
                { label:`Q4 ${year}`, shortLabel:'Q4', months:_MONTHS.slice(9,12) }
            ].map(q => ({ ...q, ..._sumMonths(q.months), status: _status(_sumMonths(q.months).usedPct) }));
        }

        case 'monthly': {
            return _MONTHS.map((mo, i) => {
                const d = _sumMonths([mo]);
                return { label:`${mo} ${year}`, shortLabel:_MON3[i], months:[mo], ...d, status:_status(d.usedPct) };
            });
        }

        case 'weekly': {
            const weeks = _getWeeksInYear(year);
            return weeks.map(wk => {
                let budget = 0, mats = 0, labor = 0, tx = 0;
                const workers = new Set();

                expenses.forEach(e => {
                    if (!e.dateTime) return;
                    const d = new Date(e.dateTime);
                    if (d >= wk.start && d <= wk.end) { mats += e.amount || 0; tx++; }
                });
                payroll.forEach(p => {
                    if (!p.paymentDate) return;
                    const d = new Date(p.paymentDate);
                    if (d >= wk.start && d <= wk.end) { labor += p.totalSalary || 0; workers.add(p.workerName || p.id); }
                });

                // Prorate monthly budget across this week's days
                for (let day = new Date(wk.start); day <= wk.end; day.setDate(day.getDate() + 1)) {
                    const mo = _MONTHS[day.getMonth()];
                    const proj = projByMonth[mo];
                    if (!proj) continue;
                    const daysInMo = new Date(day.getFullYear(), day.getMonth() + 1, 0).getDate();
                    budget += (proj.monthlyBudget || 0) / daysInMo;
                }

                const totalSpent = mats + labor;
                const remaining  = Math.round(budget) - totalSpent;
                const usedPct    = budget > 0 ? (totalSpent / budget) * 100 : 0;
                return {
                    label: `Wk ${wk.num} · ${_fmtDateShort(wk.start)}`,
                    shortLabel: `W${wk.num}`,
                    months: [],
                    budget: Math.round(budget), mats, labor, totalSpent,
                    remaining, usedPct, txCount: tx, workerCount: workers.size,
                    status: _status(usedPct)
                };
            }).filter(w => w.budget > 0 || w.totalSpent > 0);
        }

        default: return [];
    }
}

function _getWeeksInYear(year) {
    const weeks = [];
    // Monday of the first ISO week that contains Jan 4
    let d = new Date(year, 0, 4);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    let num = 1;
    while (true) {
        const start = new Date(d);
        const end   = new Date(d); end.setDate(end.getDate() + 6);
        // Only include weeks that overlap with the target year
        if (start.getFullYear() > year) break;
        if (end.getFullYear() >= year && start.getFullYear() <= year) {
            const cs = start.getFullYear() < year ? new Date(year, 0, 1) : start;
            const ce = end.getFullYear()   > year ? new Date(year, 11,31) : end;
            weeks.push({ num, start: cs, end: ce });
        }
        d.setDate(d.getDate() + 7); num++;
        if (num > 55) break;
    }
    return weeks;
}

function _fmtDateShort(d) {
    return new Date(d).toLocaleDateString('en-PH', { month:'short', day:'numeric' });
}

// ════════════════════════════════════════════════════════════
// REPORT KPI CARDS
// ════════════════════════════════════════════════════════════
function _rptRenderKPIs(groups) {
    const row = document.getElementById('rptKpiRow');
    if (!row) return;
    // Company-wide: sum all folder budgets
    const contract   = expFolders.reduce((s, f) => s + (f.totalBudget || 0), 0);
    const totBudget  = groups.reduce((s, g) => s + g.budget, 0);
    const totMats    = groups.reduce((s, g) => s + g.mats, 0);
    const totLabor   = groups.reduce((s, g) => s + g.labor, 0);
    const totSpent   = groups.reduce((s, g) => s + g.totalSpent, 0);
    const totRemain  = totBudget - totSpent;
    const totPct     = totBudget > 0 ? (totSpent / totBudget) * 100 : 0;
    const activeGrps = groups.filter(g => g.budget > 0 || g.totalSpent > 0).length;

    const periodLabels = { weekly:'Weekly View', monthly:'Monthly View', quarterly:'Quarterly View', semi:'Semi-Annual View', annual:'Annual View' };

    row.innerHTML = `
        <div class="rpt-kpi-card rpt-kpi-contract">
            <div class="rpt-kpi-ico-wrap"><i data-lucide="building-2" class="rpt-kpi-ico"></i></div>
            <div class="rpt-kpi-body">
                <div class="rpt-kpi-label">Contract Value</div>
                <div class="rpt-kpi-val">₱${formatNum(contract)}</div>
                <div class="rpt-kpi-sub">Company-Wide · ${_rptState.year}</div>
            </div>
        </div>
        <div class="rpt-kpi-card rpt-kpi-budget">
            <div class="rpt-kpi-ico-wrap"><i data-lucide="calendar-range" class="rpt-kpi-ico"></i></div>
            <div class="rpt-kpi-body">
                <div class="rpt-kpi-label">Budget Allocated</div>
                <div class="rpt-kpi-val">₱${formatNum(totBudget)}</div>
                <div class="rpt-kpi-sub">${periodLabels[_rptState.period]} · ${activeGrps} active period${activeGrps !== 1 ? 's':''}</div>
            </div>
        </div>
        <div class="rpt-kpi-card rpt-kpi-materials">
            <div class="rpt-kpi-ico-wrap"><i data-lucide="hard-hat" class="rpt-kpi-ico"></i></div>
            <div class="rpt-kpi-body">
                <div class="rpt-kpi-label">Materials &amp; Direct Costs</div>
                <div class="rpt-kpi-val">₱${formatNum(totMats)}</div>
                <div class="rpt-kpi-sub">${totBudget > 0 ? ((totMats/totBudget)*100).toFixed(1) : 0}% of allocated budget</div>
            </div>
        </div>
        <div class="rpt-kpi-card rpt-kpi-labor">
            <div class="rpt-kpi-ico-wrap"><i data-lucide="users" class="rpt-kpi-ico"></i></div>
            <div class="rpt-kpi-body">
                <div class="rpt-kpi-label">Labor &amp; Payroll</div>
                <div class="rpt-kpi-val">₱${formatNum(totLabor)}</div>
                <div class="rpt-kpi-sub">${totBudget > 0 ? ((totLabor/totBudget)*100).toFixed(1) : 0}% of allocated budget</div>
            </div>
        </div>
        <div class="rpt-kpi-card rpt-kpi-spent">
            <div class="rpt-kpi-ico-wrap"><i data-lucide="sigma" class="rpt-kpi-ico"></i></div>
            <div class="rpt-kpi-body">
                <div class="rpt-kpi-label">Total Spent</div>
                <div class="rpt-kpi-val">₱${formatNum(totSpent)}</div>
                <div class="rpt-kpi-sub">${totPct.toFixed(1)}% utilized · ${contract > 0 ? ((totSpent/contract)*100).toFixed(1):0}% of contract</div>
            </div>
        </div>
        <div class="rpt-kpi-card rpt-kpi-variance-wide ${totRemain < 0 ? 'rpt-kpi-over' : 'rpt-kpi-remaining'}">
            <div class="rpt-kpi-ico-wrap"><i data-lucide="${totRemain < 0 ? 'trending-down':'trending-up'}" class="rpt-kpi-ico"></i></div>
            <div class="rpt-kpi-body">
                <div class="rpt-kpi-label" style="margin-bottom:0.6rem">Budget Variance</div>
                <div class="rpt-variance-split">
                    <div class="rpt-variance-col">
                        <div class="rpt-variance-col-label">Period (Allocated)</div>
                        <div class="rpt-variance-col-val">${totRemain < 0 ? '-' : ''}&#8369;${formatNum(Math.abs(totRemain))}</div>
                        <div class="rpt-variance-bar-wrap">
                            <div class="rpt-variance-bar-fill" style="width:${Math.max(Math.min(100-totPct,100),2).toFixed(1)}%;background:rgba(255,255,255,0.75)"></div>
                        </div>
                        <div class="rpt-variance-col-sub">${(100-totPct).toFixed(1)}% of period remaining</div>
                    </div>
                    <div class="rpt-variance-divider"></div>
                    <div class="rpt-variance-col">
                        <div class="rpt-variance-col-label">Contract (Total)</div>
                        <div class="rpt-variance-col-val">${contract > 0 ? ((contract-totSpent)>=0?'':'-')+'&#8369;'+formatNum(Math.abs(contract-totSpent)) : '&#8369;0.00'}</div>
                        <div class="rpt-variance-bar-wrap">
                            <div class="rpt-variance-bar-fill" style="width:${contract>0?Math.max(Math.min(((contract-totSpent)/contract)*100,100),2).toFixed(1):2}%;background:rgba(255,255,255,0.75)"></div>
                        </div>
                        <div class="rpt-variance-col-sub">${contract>0?(((contract-totSpent)/contract)*100).toFixed(1)+'% of contract remaining':'no contract set'}</div>
                    </div>
                </div>
            </div>
        </div>`;
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ════════════════════════════════════════════════════════════
// REPORT CHARTS
// ════════════════════════════════════════════════════════════
function _rptRenderTrendChart(groups) {
    const ctx = document.getElementById('rptTrendChart');
    if (!ctx) return;
    const labels     = groups.map(g => g.shortLabel);
    const matsData   = groups.map(g => g.mats);
    const laborData  = groups.map(g => g.labor);
    const budgetData = groups.map(g => g.budget);

    const titleMap = { weekly:'Weekly Spending Trend', monthly:'Monthly Spending Trend',
        quarterly:'Quarterly Spending Trend', semi:'Semi-Annual Spending Trend', annual:'Annual Overview' };
    setText('rptTrendTitle',    titleMap[_rptState.period] || 'Spending Trend');
    setText('rptTrendSubtitle', 'Materials vs Labor · dashed line = allocated budget');

    if (_rptCharts.trend) _rptCharts.trend.destroy();
    _rptCharts.trend = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { label:'Materials & Costs', data:matsData,
                  backgroundColor:'rgba(59,130,246,0.7)', borderColor:'#3b82f6',
                  borderWidth:1, borderRadius:4, stack:'spend' },
                { label:'Labor & Payroll',   data:laborData,
                  backgroundColor:'rgba(245,158,11,0.7)', borderColor:'#f59e0b',
                  borderWidth:1, borderRadius:4, stack:'spend' },
                { label:'Budget Allocated',  data:budgetData, type:'line',
                  borderColor:'#00D084', backgroundColor:'transparent',
                  borderWidth:2, borderDash:[6,4], pointBackgroundColor:'#00D084',
                  pointRadius:3, tension:0.35 }
            ]
        },
        options: {
            responsive:true, maintainAspectRatio:false,
            plugins: {
                legend:{ position:'bottom', labels:{ font:{size:11}, padding:12 }},
                tooltip:{ callbacks:{ label: c => ` ${c.dataset.label}: ₱${formatNum(c.parsed.y)}` }}
            },
            scales: {
                x:{ stacked:true, grid:{display:false} },
                y:{ stacked:false, beginAtZero:true,
                    ticks:{ callback: v => '₱'+formatNum(v), font:{size:10} },
                    grid:{ color:'rgba(0,0,0,0.05)' }}
            }
        }
    });
}

function _rptRenderCompositionChart() {
    const ctx = document.getElementById('rptCompositionChart');
    if (!ctx) return;
    const cats = {};
    expCategories.forEach(c => { cats[c.name] = 0; });
    _rptState.allExpenses.forEach(e => {
        const k = e.category || 'Others';
        cats[k] = (cats[k] || 0) + (e.amount || 0);
    });
    cats['Payroll'] = _rptState.allPayroll.reduce((s,p) => s+(p.totalSalary||0), 0);
    const labels = Object.keys(cats).filter(k => cats[k] > 0);
    const data   = labels.map(k => cats[k]);
    const colors = labels.map(k => {
        if (k==='Payroll') return '#f97316cc';
        const cat = expCategories.find(c => c.name===k);
        return cat ? cat.color+'cc' : '#a78bfacc';
    });
    if (_rptCharts.comp) _rptCharts.comp.destroy();
    _rptCharts.comp = new Chart(ctx, {
        type:'doughnut',
        data:{ labels, datasets:[{ data, backgroundColor:colors, borderWidth:2, borderColor:'#fff' }]},
        options:{
            responsive:true, maintainAspectRatio:false,
            plugins:{
                legend:{position:'bottom',labels:{font:{size:11},padding:10}},
                tooltip:{callbacks:{label:c=>` ₱${formatNum(c.parsed)} (${((c.parsed/c.chart.getDatasetMeta(0).total)*100).toFixed(1)}%)`}}
            }
        }
    });
}

function _rptRenderBvaChart(groups) {
    const ctx = document.getElementById('rptBudgetVsActualChart');
    if (!ctx) return;
    const filtered = groups.filter(g => g.budget > 0 || g.totalSpent > 0);
    if (_rptCharts.bva) _rptCharts.bva.destroy();
    _rptCharts.bva = new Chart(ctx, {
        type:'bar',
        data:{
            labels: filtered.map(g => g.shortLabel),
            datasets:[
                { label:'Budget',       data:filtered.map(g => g.budget),
                  backgroundColor:'rgba(0,208,132,0.18)', borderColor:'#00D084',
                  borderWidth:2, borderRadius:5 },
                { label:'Actual Spend', data:filtered.map(g => g.totalSpent),
                  backgroundColor:filtered.map(g => g.totalSpent > g.budget ? 'rgba(239,68,68,0.18)' : 'rgba(79,172,254,0.18)'),
                  borderColor:filtered.map(g => g.totalSpent > g.budget ? '#ef4444' : '#4facfe'),
                  borderWidth:2, borderRadius:5 }
            ]
        },
        options:{
            responsive:true, maintainAspectRatio:false,
            plugins:{
                legend:{position:'bottom',labels:{font:{size:11},padding:12}},
                tooltip:{callbacks:{label:c=>` ${c.dataset.label}: ₱${formatNum(c.parsed.y)}`}}
            },
            scales:{
                x:{grid:{display:false}},
                y:{beginAtZero:true, ticks:{callback:v=>'₱'+formatNum(v),font:{size:10}}, grid:{color:'rgba(0,0,0,0.05)'}}
            }
        }
    });
}

function _rptRenderCategoryChart() {
    const ctx = document.getElementById('expCategoryChart');
    if (!ctx) return;
    const cats = {};
    expCategories.forEach(c => { cats[c.name] = 0; });
    cats['Payroll'] = 0;
    _rptState.allExpenses.forEach(e => {
        const k = e.category || 'Others';
        if (!(k in cats)) cats[k] = 0;
        cats[k] += (e.amount || 0);
    });
    cats['Payroll'] = _rptState.allPayroll.reduce((s,p) => s+(p.totalSalary||0), 0);
    const labels = Object.keys(cats).filter(k => cats[k] > 0);
    const data   = labels.map(k => cats[k]);
    const bgColors = labels.map(k => {
        if (k==='Payroll') return '#f97316';
        const cat = expCategories.find(c => c.name===k);
        return cat ? cat.color+'cc' : '#a78bfa';
    });
    if (expCharts.pie) expCharts.pie.destroy();
    expCharts.pie = new Chart(ctx, {
        type:'doughnut',
        data:{ labels, datasets:[{ data, backgroundColor:bgColors, borderWidth:2, borderColor:'#fff' }]},
        options:{
            responsive:true, maintainAspectRatio:false,
            plugins:{
                legend:{position:'bottom',labels:{font:{size:11},padding:12}},
                tooltip:{callbacks:{label:c=>` ₱${formatNum(c.parsed)} (${((c.parsed/c.chart.getDatasetMeta(0).total)*100).toFixed(1)}%)`}}
            }
        }
    });
}

// ════════════════════════════════════════════════════════════
// REPORT TABLE
// ════════════════════════════════════════════════════════════
function _rptRenderTable(groups) {
    const tbody = document.getElementById('rptSummaryTbody');
    if (!tbody) return;

    const titleMap = { weekly:'Weekly Breakdown', monthly:'Monthly Breakdown',
        quarterly:'Quarterly Breakdown', semi:'Semi-Annual Breakdown', annual:'Annual Summary' };
    const subMap = { weekly:`ISO weeks · ${_rptState.year}`, monthly:`All months · ${_rptState.year}`,
        quarterly:`Q1–Q4 · ${_rptState.year}`, semi:`H1 & H2 · ${_rptState.year}`,
        annual:`Full year summary · ${_rptState.year}` };
    setText('rptTableTitle',    titleMap[_rptState.period] || 'Period Breakdown');
    setText('rptTableSubtitle', subMap[_rptState.period]   || '');

    if (!groups.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="exp-empty-row">No data for this period.</td></tr>';
        return;
    }

    const _badge = s => {
        const map = {
            healthy: ['Healthy',     'rpt-badge-healthy'],
            ontrack: ['On Track',    'rpt-badge-ontrack'],
            warning: ['Near Limit',  'rpt-badge-warning'],
            danger:  ['Over Budget', 'rpt-badge-danger']
        };
        const [label, cls] = map[s] || map.healthy;
        return `<span class="rpt-status-badge ${cls}">${label}</span>`;
    };

    const _bar = pct => {
        const c = Math.min(pct, 100);
        const col = pct > 100 ? '#ef4444' : pct > 85 ? '#f59e0b' : '#00D084';
        return `<div class="rpt-inline-bar"><div class="rpt-inline-fill" style="width:${c.toFixed(1)}%;background:${col}"></div></div>`;
    };

    const active = groups.filter(g => g.budget > 0 || g.totalSpent > 0);
    const empty  = groups.filter(g => g.budget === 0 && g.totalSpent === 0);

    let html = active.map(g => `
        <tr>
            <td><strong>${g.label}</strong>${g.txCount ? `<span class="rpt-row-meta">${g.txCount} tx · ${g.workerCount} worker${g.workerCount!==1?'s':''}</span>` : ''}</td>
            <td>₱${formatNum(g.budget)}</td>
            <td>₱${formatNum(g.mats)}</td>
            <td>₱${formatNum(g.labor)}</td>
            <td><strong>₱${formatNum(g.totalSpent)}</strong></td>
            <td class="${g.remaining < 0 ? 'rpt-cell-over' : 'rpt-cell-ok'}">
                ${g.remaining < 0 ? '▲ ' : ''}₱${formatNum(Math.abs(g.remaining))}
            </td>
            <td>
                <div class="rpt-pct-cell">
                    <span class="rpt-pct-num">${g.usedPct.toFixed(1)}%</span>
                    ${_bar(g.usedPct)}
                </div>
            </td>
            <td>${_badge(g.status)}</td>
        </tr>`).join('');

    // Collapsed empty periods row
    if (empty.length) {
        html += `<tr class="rpt-row-empty-periods">
            <td colspan="8" class="rpt-empty-periods-cell">
                <span class="rpt-empty-periods-label">⬜ ${empty.length} period${empty.length>1?'s':''} with no budget or activity: ${empty.map(g=>g.shortLabel).join(', ')}</span>
            </td>
        </tr>`;
    }

    // Totals row
    const tB = active.reduce((s,g) => s+g.budget, 0);
    const tM = active.reduce((s,g) => s+g.mats, 0);
    const tL = active.reduce((s,g) => s+g.labor, 0);
    const tS = active.reduce((s,g) => s+g.totalSpent, 0);
    const tR = tB - tS;
    const tP = tB > 0 ? (tS/tB)*100 : 0;
    html += `
        <tr class="rpt-totals-row">
            <td><strong>TOTAL</strong></td>
            <td><strong>₱${formatNum(tB)}</strong></td>
            <td><strong>₱${formatNum(tM)}</strong></td>
            <td><strong>₱${formatNum(tL)}</strong></td>
            <td><strong>₱${formatNum(tS)}</strong></td>
            <td class="${tR < 0 ? 'rpt-cell-over' : 'rpt-cell-ok'}"><strong>${tR < 0 ? '▲ ' : ''}₱${formatNum(Math.abs(tR))}</strong></td>
            <td><strong>${tP.toFixed(1)}%</strong></td>
            <td></td>
        </tr>`;

    tbody.innerHTML = html;
}

// ════════════════════════════════════════════════════════════
// CSV EXPORT
// ════════════════════════════════════════════════════════════
function exportRptTable() {
    if (!_rptState.projects?.length) { showExpNotif('No report data to export.', 'error'); return; }

    const groups = _computePeriodGroups(_rptState.period, _rptState.year,
        _rptState.projects, _rptState.allExpenses, _rptState.allPayroll);

    // Derive a sensible file name
    const folderIds = [...new Set(_rptState.projects.map(p => p.folderId).filter(Boolean))];
    const firstFolder = folderIds.length === 1 ? expFolders.find(f => f.id === folderIds[0]) : null;
    const reportName = (firstFolder?.name || 'DACs-Report').replace(/\s+/g, '-');

    const esc = v => String(v == null ? '' : v).replace(/"/g, '""');
    const row = arr => arr.map(c => '"' + esc(c) + '"').join(',');

    let csv = '\uFEFF'; // BOM for Excel

    // Section 1: Period Summary
    csv += 'PERIOD SUMMARY\n';
    csv += row(['Period','Budget Allocated','Materials & Costs','Labor & Payroll',
                'Total Spent','Remaining','% Utilized','Status','Transactions','Workers']) + '\n';
    groups.forEach(g => {
        csv += row([
            g.label,
            g.budget.toFixed(2), g.mats.toFixed(2), g.labor.toFixed(2),
            g.totalSpent.toFixed(2), g.remaining.toFixed(2),
            g.usedPct.toFixed(1) + '%', g.status, g.txCount, g.workerCount
        ]) + '\n';
    });
    const tB = groups.reduce((s,g) => s + g.budget, 0);
    const tM = groups.reduce((s,g) => s + g.mats, 0);
    const tL = groups.reduce((s,g) => s + g.labor, 0);
    const tS = groups.reduce((s,g) => s + g.totalSpent, 0);
    csv += row(['TOTAL', tB.toFixed(2), tM.toFixed(2), tL.toFixed(2),
                tS.toFixed(2), (tB - tS).toFixed(2),
                (tB > 0 ? (tS / tB) * 100 : 0).toFixed(1) + '%', '', '', '']) + '\n';

    // Section 2: Expense Detail
    csv += '\nEXPENSE DETAIL\n';
    csv += row(['Date','Project','Category','Expense Name','Notes / Detail','Qty','Amount']) + '\n';
    const sortedExp = [..._rptState.allExpenses]
        .sort((a, b) => new Date(b.dateTime || 0) - new Date(a.dateTime || 0));
    sortedExp.forEach(e => {
        const proj = _rptState.projects.find(p => p.id === e.projectId);
        csv += row([
            e.dateTime ? new Date(e.dateTime).toLocaleString() : '',
            proj ? proj.month + ' ' + proj.year : '',
            e.category || '',
            e.expenseName || '',
            e.notes || '',
            e.quantity || 1,
            (e.amount || 0).toFixed(2)
        ]) + '\n';
    });
    const expTotal = _rptState.allExpenses.reduce((s, e) => s + (e.amount || 0), 0);
    csv += row(['', '', '', '', '', 'TOTAL', expTotal.toFixed(2)]) + '\n';

    // Section 3: Payroll Detail
    csv += '\nPAYROLL DETAIL\n';
    csv += row(['Date','Project','Worker Name','Role','Notes / Detail','Days','Daily Rate','Total Salary']) + '\n';
    const sortedPay = [..._rptState.allPayroll]
        .sort((a, b) => new Date(b.paymentDate || 0) - new Date(a.paymentDate || 0));
    sortedPay.forEach(p => {
        const proj = _rptState.projects.find(pr => pr.id === p.projectId);
        csv += row([
            p.paymentDate ? new Date(p.paymentDate).toLocaleString() : '',
            proj ? proj.month + ' ' + proj.year : '',
            p.workerName || '',
            p.role || '',
            p.notes || '',
            p.daysWorked || 0,
            (p.dailyRate || 0).toFixed(2),
            (p.totalSalary || 0).toFixed(2)
        ]) + '\n';
    });
    const payTotal = _rptState.allPayroll.reduce((s, p) => s + (p.totalSalary || 0), 0);
    csv += row(['', '', '', '', '', '', 'TOTAL', payTotal.toFixed(2)]) + '\n';

    // Trigger download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = reportName + '_' + _rptState.period + '_' + _rptState.year + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showExpNotif('CSV exported successfully!', 'success');
}

console.log('✅ Reports Dashboard Module Loaded');
