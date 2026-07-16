function openBadgeDropdown(event, badge) {
    event.stopPropagation();
    const existing = document.querySelector('.badge-dropdown');
    if (existing) existing.remove();
    
    document.removeEventListener('click', closeBadgeDropdownOnce);
    
    setTimeout(() => {
        document.addEventListener('click', closeBadgeDropdownOnce);
    }, 0);

    const type = badge.dataset.type;
    const taskId = parseInt(badge.dataset.taskId);
    const subtaskId = badge.dataset.subtask ? parseInt(badge.dataset.subtask) : null;
    const currentValue = badge.dataset.value;

    const dropdown = document.createElement('div');
    dropdown.className = 'badge-dropdown';
    dropdown.innerHTML = '<div class="badge-option" style="cursor:default;text-align:center;opacity:0.7;">🔒 Только просмотр</div>';

    const rect = event.target.closest('.assignee-tag, .assignee-placeholder, .clickable-badge')?.getBoundingClientRect() || { bottom: event.clientY + 4, left: event.clientX };
    dropdown.style.position = 'fixed';
    dropdown.style.left = rect.left + 'px';
    document.body.appendChild(dropdown);
    
    const dropdownHeight = dropdown.offsetHeight;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    
    if (spaceBelow < dropdownHeight && spaceAbove >= dropdownHeight) {
        dropdown.style.top = (rect.top - dropdownHeight - 4) + 'px';
    } else {
        dropdown.style.top = (rect.bottom + 4) + 'px';
    }
}

function closeBadgeDropdown() {
    const existing = document.querySelector('.badge-dropdown');
    if (existing) existing.remove();
}

function closeBadgeDropdownOnce(event) {
    const dropdown = document.querySelector('.badge-dropdown');
    if (!dropdown) {
        document.removeEventListener('click', closeBadgeDropdownOnce);
        return;
    }
    if (dropdown.contains(event.target)) {
        return;
    }
    dropdown.remove();
    document.removeEventListener('click', closeBadgeDropdownOnce);
}

function openAddModal() {
    showToast('База законсервирована, невозможно добавить задачу', 'error');
}

function closeModal() {}

function editTask(id) {
    showToast('База законсервирована, редактирование невозможно', 'error');
}

function renderTaskColorPicker(selectedColor = '') {}

function selectTaskColor(color, el) {}

function openSubtaskModal(taskId, subtaskId = null, parentId = null) {
    showToast('База законсервирована, невозможно добавить подзадачу', 'error');
}

function closeSubtaskModal() {}

function openAuthModal() { showToast('База законсервирована', 'error'); }
function closeAuthModal() {}
function showAuthTab(tab) {}

function openAssigneesPanel() {
    renderAssigneesList();
    document.getElementById('assigneesPanel').classList.add('active');
}
function closeAssigneesPanel() { document.getElementById('assigneesPanel').classList.remove('active'); }

function showColorPicker(event, assigneeId) {
    showToast('База законсервирована', 'error');
}

function toggleFilterDropdown(type) {
    const dropdown = document.getElementById(`filter${type.charAt(0).toUpperCase() + type.slice(1)}Dropdown`);
    const btn = document.getElementById(`filter${type.charAt(0).toUpperCase() + type.slice(1)}Btn`);
    
    if (!dropdown || !btn) return;
    
    document.querySelectorAll('.filter-dropdown-content').forEach(d => {
        if (d !== dropdown) d.classList.remove('active');
    });
    document.querySelectorAll('.filter-btn').forEach(b => {
        if (b !== btn) b.classList.remove('active');
    });
    
    dropdown.classList.toggle('active');
    btn.classList.toggle('active');
}

function toggleFilter(type, value) {
    const arr = type === 'assignee' ? filterAssignee : type === 'priority' ? filterPriority : filterStatus;
    const idx = arr.indexOf(value);
    if (idx >= 0) {
        arr.splice(idx, 1);
    } else {
        arr.push(value);
    }
    saveFilters();
    renderFilterDropdowns();
    renderTasks();
    renderTaskHistory();
}

function resetFilters() {
    filterAssignee = [];
    filterPriority = [];
    filterStatus = [];
    filterHistoryAssignee = [];
    filterHistoryPriority = [];
    filterHistoryStatus = [];
    saveFilters();
    renderFilterDropdowns();
    renderTasks();
    if (currentView === 'history') {
        renderTaskHistory();
    }
}

function applyFilters() {
    renderTasks();
}

function toggleTask(id) {
    if (expandedTasks.has(id)) expandedTasks.delete(id);
    else expandedTasks.add(id);
    saveExpandedState();
    renderTasks();
}

function toggleSubtask(subtaskId) {
    if (expandedSubtasks.has(subtaskId)) expandedSubtasks.delete(subtaskId);
    else expandedSubtasks.add(subtaskId);
    saveExpandedState();
    renderTasks();
}

function setView(view) {
    currentView = view;
    document.getElementById('taskList').classList.toggle('hidden', view !== 'list');
    document.getElementById('kanbanBoard').classList.toggle('active', view === 'kanban');
    document.getElementById('historyBoard').classList.toggle('active', view === 'history');
    document.getElementById('filterHistoryTypeContainer').style.display = view === 'history' ? 'block' : 'none';
    document.getElementById('filterHistoryAssigneeContainer').style.display = view === 'history' ? 'block' : 'none';
    document.getElementById('filterHistoryPriorityContainer').style.display = view === 'history' ? 'block' : 'none';
    document.getElementById('filterHistoryStatusContainer').style.display = view === 'history' ? 'block' : 'none';
    document.getElementById('filterAssigneeContainer').style.display = view === 'history' ? 'none' : 'block';
    document.getElementById('filterPriorityContainer').style.display = view === 'history' ? 'none' : 'block';
    document.getElementById('filterStatusContainer').style.display = view === 'history' ? 'none' : 'block';
    document.querySelectorAll('.view-toggle .btn-secondary').forEach((b, i) => {
        const active = (view === 'list' && i === 0) || (view === 'kanban' && i === 1) || (view === 'history' && i === 2);
        b.classList.toggle('active', active);
    });
    if (view === 'history') {
        renderFilterDropdowns();
    }
}

function toggleHistoryFilter(type) {
    const idx = historyFilterTypes.indexOf(type);
    if (idx >= 0) {
        if (historyFilterTypes.length > 1) {
            historyFilterTypes.splice(idx, 1);
        }
    } else {
        historyFilterTypes.push(type);
    }
    renderFilterDropdowns();
    renderTaskHistory();
}

function toggleHistoryAssigneeFilter(id) {
    const idx = filterHistoryAssignee.indexOf(id);
    if (idx >= 0) {
        filterHistoryAssignee.splice(idx, 1);
    } else {
        filterHistoryAssignee.push(id);
    }
    updateFilterCount('historyAssignee', filterHistoryAssignee.length);
    renderTaskHistory();
}

function toggleHistoryPriorityFilter(value) {
    const idx = filterHistoryPriority.indexOf(value);
    if (idx >= 0) {
        filterHistoryPriority.splice(idx, 1);
    } else {
        filterHistoryPriority.push(value);
    }
    updateFilterCount('historyPriority', filterHistoryPriority.length);
    renderTaskHistory();
}

function toggleHistoryStatusFilter(value) {
    const idx = filterHistoryStatus.indexOf(value);
    if (idx >= 0) {
        filterHistoryStatus.splice(idx, 1);
    } else {
        filterHistoryStatus.push(value);
    }
    updateFilterCount('historyStatus', filterHistoryStatus.length);
    renderTaskHistory();
}

function handleHistoryDragStart(e, entryId) {}
function handleHistoryDragEnd(e) {}
function handleHistoryDragOver(e) {}
function handleHistoryDragLeave(e) {}
function canMoveEntry() { return false; }

function reorderEntriesForTaskOnDate(taskId, subtaskId, date, entryOrder) { return []; }

async function handleHistoryDrop(e, targetDate) {}
async function handleHistoryDateChange(e, entryId) {}

function handleTaskDragStart(e, taskId) { 
    e.currentTarget.classList.add('dragging'); 
}

function handleSubtaskDragStart(e, taskId, subtaskId) { 
    e.stopPropagation();
    e.currentTarget.classList.add('dragging'); 
}

function handleDragEnd(e) { 
    if (e.currentTarget) e.currentTarget.classList.remove('dragging'); 
    document.querySelectorAll('.kanban-column').forEach(c => c.classList.remove('drag-over')); 
}

function handleDragOver(e) { e.preventDefault(); }
function handleDragLeave(e) { e.currentTarget.classList.remove('drag-over'); }

async function handleDrop(e, status) { 
    e.preventDefault(); 
}

function isDescendant(source, targetTaskId, targetSubtaskId) { return false; }

async function handleDropAsSubtask(targetTaskId, targetSubtaskId) {}

function handleListTaskDragStart(e, taskId) {}

function handleListSubtaskDragStart(e, taskId, subtaskId) {}

function handleListDragEnd(e) {
    if (e.currentTarget) e.currentTarget.classList.remove('dragging');
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
}

function handleListDragOver(e, targetTaskId, targetSubtaskId, hasSubtasks) {}

function handleListDragLeave(e) {}

function handleListDragEnd(e) {
    if (e.currentTarget) e.currentTarget.classList.remove('dragging');
    document.querySelectorAll('.drag-insert-before, .drag-insert-after, .drop-target, .drag-over').forEach(el => {
        el.classList.remove('drag-insert-before', 'drag-insert-after', 'drop-target', 'drag-over');
    });
}

async function handleListDrop(e, targetTaskId, targetSubtaskId) {}

function findAndRemoveSubtask(subtasks, subtaskId) {
    for (let i = 0; i < (subtasks || []).length; i++) {
        if (subtasks[i].id === subtaskId) {
            return subtasks.splice(i, 1)[0];
        }
        const kids = subtasks[i].children || subtasks[i].subtasks || [];
        if (kids.length > 0) {
            const found = findAndRemoveSubtask(kids, subtaskId);
            if (found) return found;
        }
    }
    return null;
}

function findSubtaskParentArray(subtasks, subtaskId) {
    for (let i = 0; i < (subtasks || []).length; i++) {
        if (subtasks[i].id === subtaskId) {
            return { array: subtasks, index: i };
        }
        const kids = subtasks[i].children || subtasks[i].subtasks || [];
        if (kids.length > 0) {
            const found = findSubtaskParentArray(kids, subtaskId);
            if (found) return found;
        }
    }
    return null;
}

async function saveTaskOrder() {}

function showToast(msg, type = 'info') {
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

window.applyCurrentStateFromHistory = async function() {};
window.applyCurrentStateFromHistoryInternal = async function() {};
