const LOCAL_EXPANDED_KEY = 'aod.expandedState';
const LOCAL_FILTERS_KEY = 'aod.filters';
const DB_URL = 'data.json';

let tasks = window.tasks || [];
let assignees = window.assignees || [];
window.tasks = tasks;
window.assignees = assignees;
let currentUser = null;
let canEdit = false;
let taskColorDbSupported = true;
let assigneeColorDbSupported = true;
let expandedTasks = new Set();
let expandedSubtasks = new Set();
let draggedItem = null;
let listDragItem = null;
let dropIndicator = null;
let dropTargetPlaceholder = null;
let filterAssignee = [];
let filterPriority = [];
let filterStatus = [];
let taskHistory = [];
let historyFilterTypes = ['creation', 'status'];
let filterHistoryAssignee = [];
let filterHistoryPriority = [];
let filterHistoryStatus = [];
let currentView = 'list';

window.historyFilterTypes = historyFilterTypes;
window.filterHistoryAssignee = filterHistoryAssignee;
window.filterHistoryPriority = filterHistoryPriority;
window.filterHistoryStatus = filterHistoryStatus;

function getExpandedStateKey() {
    const userEmail = currentUser?.email || 'anonymous';
    return LOCAL_EXPANDED_KEY + ':' + userEmail;
}

function loadExpandedState() {
    try {
        const data = localStorage.getItem(getExpandedStateKey());
        if (data) {
            const parsed = JSON.parse(data);
            return {
                tasks: new Set(parsed.tasks || []),
                subtasks: new Set(parsed.subtasks || [])
            };
        }
    } catch (e) {
        console.warn('Failed to load expanded state:', e);
    }
    return null;
}

function saveExpandedState() {
    try {
        const data = {
            tasks: Array.from(expandedTasks),
            subtasks: Array.from(expandedSubtasks)
        };
        localStorage.setItem(getExpandedStateKey(), JSON.stringify(data));
    } catch (e) {
        console.warn('Failed to save expanded state:', e);
    }
}

function saveFilters() {
    try {
        localStorage.setItem(LOCAL_FILTERS_KEY, JSON.stringify({
            assignee: filterAssignee,
            priority: filterPriority,
            status: filterStatus
        }));
    } catch (e) {}
}

function loadFilters() {
    try {
        const data = JSON.parse(localStorage.getItem(LOCAL_FILTERS_KEY));
        if (data) {
            filterAssignee = data.assignee || [];
            filterPriority = data.priority || [];
            filterStatus = data.status || [];
        }
    } catch (e) {}
}

function updateUserUI() {
    document.getElementById('userContainer').style.display = currentUser ? 'flex' : 'none';
    document.getElementById('loginBtn').style.display = 'none';
    document.getElementById('userEmail').textContent = currentUser?.email;
    document.getElementById('userBadge').className = 'user-badge readonly';
}

function updateEditControls() {
    document.getElementById('addTaskBtn').disabled = true;
}

async function checkAuth() {
    currentUser = { email: 'readonly' };
    canEdit = false;
    updateUserUI();
    updateEditControls();
}

async function login(email, password) {
    showToast('База законсервирована, вход недоступен', 'error');
}

async function register(email, password) {
    showToast('База законсервирована, регистрация недоступна', 'error');
}

async function logout() {
    showToast('База законсервирована', 'info');
}

function showReadonlyToast() {
    showToast('База законсервирована, изменения невозможны', 'error');
}

async function loadAssignees() {
    assigneeColorDbSupported = true;
    showToast('Загрузка данных...', 'info');
}

async function loadTasks() {
    try {
        const response = await fetch(DB_URL + '?v=' + Date.now());
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const db = await response.json();
        
        assignees = (db.assignees || []).map((a, idx) => ({
            ...a,
            color: resolveAssigneeColor(a, idx)
        }));
        window.assignees = assignees;
        
        if (db.assignees && db.assignees.length) {
            assigneeColorDbSupported = db.assignees.some(row => row.color !== undefined && row.color !== null);
        }
        if (db.tasks && db.tasks.length) {
            taskColorDbSupported = db.tasks.some(row => row.color !== undefined && row.color !== null);
        }
        
        tasks = (db.tasks || []).map((t, idx) => ({
            ...t,
            assignees: t.assignees ? (Array.isArray(t.assignees) ? t.assignees : String(t.assignees).split(',').filter(a => a)) : [],
            subtasks: typeof t.subtasks === 'string' ? JSON.parse(t.subtasks || '[]') : (t.subtasks || []),
            order_index: t.order_index ?? idx
        }));
        window.tasks = tasks;
        
        taskHistory = (db.taskHistory || []).map(h => ({
            ...h,
            new_assignees: h.new_assignees ? (Array.isArray(h.new_assignees) ? h.new_assignees.join(',') : String(h.new_assignees)) : null
        }));
        window.taskHistory = taskHistory;
        
        tasks.forEach(task => {
            task.subtasks = normalizeSubtasksTree(task.subtasks);
            if (hasSubtasks(task)) {
                task.status = calculateTaskStatus(task.subtasks);
                task.assignees = calculateTaskAssignees(task.subtasks);
            } else {
                task.status = task.status || 'queue';
                task.assignees = task.assignees || [];
            }
        });

        const savedState = loadExpandedState();
        if (savedState) {
            expandedTasks = savedState.tasks;
            expandedSubtasks = savedState.subtasks;
        } else {
            tasks.forEach(task => {
                expandedTasks.add(task.id);
                const collectSubtaskIds = (subtasks) => {
                    subtasks.forEach(sub => {
                        expandedSubtasks.add(sub.id);
                        const children = sub.children || sub.subtasks || [];
                        collectSubtaskIds(children);
                    });
                };
                collectSubtaskIds(task.subtasks);
            });
        }
        window.renderTasks();
        window.renderTaskHistory();
        window.renderAssigneesSelect();
        window.renderAssigneesList();
        window.renderFilterDropdowns();
        showToast('Данные загружены', 'success');
    } catch (e) {
        console.error(e);
        showToast('Ошибка загрузки данных', 'error');
    }
}

async function saveTask(taskData) {
    showReadonlyToast();
    return false;
}

async function deleteTask(id) {
    showReadonlyToast();
}

async function updateTaskStatus(taskId, newStatus) {
    showReadonlyToast();
}

async function updateSubtaskStatus(taskId, subtaskId, newStatus) {
    showReadonlyToast();
}

async function changeTaskPriority(taskId, newPriority) {
    showReadonlyToast();
}

async function changeTaskStatus(taskId, newStatus) {
    showReadonlyToast();
}

async function changeSubtaskPriority(taskId, subtaskId, newPriority) {
    showReadonlyToast();
}

async function changeSubtaskStatus(taskId, subtaskId, newStatus) {
    showReadonlyToast();
}

async function updateTaskAssignees(taskId, newAssignees) {
    showReadonlyToast();
}

async function updateSubtaskAssignees(taskId, subtaskId, newAssignees) {
    showReadonlyToast();
}

async function saveSubtask(taskId, subtaskData) {
    showReadonlyToast();
    return false;
}

async function deleteSubtask(taskId, subtaskId) {
    showReadonlyToast();
}

async function addAssignee() {
    showReadonlyToast();
}

async function deleteAssignee(id) {
    showReadonlyToast();
}

async function updateAssigneeColor(id, color) {
    showReadonlyToast();
}

async function saveTaskOrder() {
    showReadonlyToast();
}

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

window.findAndRemoveSubtask = findAndRemoveSubtask;
window.findSubtaskParentArray = findSubtaskParentArray;
window.saveTaskOrder = saveTaskOrder;

async function loadTaskHistory() {
}

async function saveHistoryEntry(entryData) {
    showReadonlyToast();
    return false;
}

async function deleteHistoryEntry(id) {
    showReadonlyToast();
}

function determineLatestEntry(taskId, subtaskId) {
    const taskEntries = taskHistory.filter(e => e.task_id === taskId && e.subtask_id === subtaskId);
    if (taskEntries.length === 0) return null;
    taskEntries.sort((a, b) => {
        const dateCompare = new Date(b.changed_at) - new Date(a.changed_at);
        if (dateCompare !== 0) return dateCompare;
        return b.order_index - a.order_index;
    });
    return taskEntries[0].id;
}

async function updateHistoryEntryDate(id, newDate) {
    showReadonlyToast();
}

async function updateHistoryEntryOrder(id, newOrder, newDate) {
    showReadonlyToast();
}

async function initializeHistoryForExistingTasks() {
    showReadonlyToast();
}

window.loadTaskHistory = loadTaskHistory;
window.saveHistoryEntry = saveHistoryEntry;
window.deleteHistoryEntry = deleteHistoryEntry;
window.updateHistoryEntryDate = updateHistoryEntryDate;
window.updateHistoryEntryOrder = updateHistoryEntryOrder;
window.initializeHistoryForExistingTasks = initializeHistoryForExistingTasks;
window.findSubtaskById = findSubtaskById;

async function changeTaskStatusDirect(taskId, newStatus) {
    showReadonlyToast();
}

async function changeTaskPriorityDirect(taskId, newPriority) {
    showReadonlyToast();
}

async function updateTaskAssigneesDirect(taskId, newAssignees) {
    showReadonlyToast();
}

async function changeSubtaskStatusDirect(taskId, subtaskId, newStatus) {
    showReadonlyToast();
}

async function changeSubtaskPriorityDirect(taskId, subtaskId, newPriority) {
    showReadonlyToast();
}

async function updateSubtaskAssigneesDirect(taskId, subtaskId, newAssignees) {
    showReadonlyToast();
}

window.changeTaskStatusDirect = changeTaskStatusDirect;
window.changeTaskPriorityDirect = changeTaskPriorityDirect;
window.updateTaskAssigneesDirect = updateTaskAssigneesDirect;
window.changeSubtaskStatusDirect = changeSubtaskStatusDirect;
window.changeSubtaskPriorityDirect = changeSubtaskPriorityDirect;
window.updateSubtaskAssigneesDirect = updateSubtaskAssigneesDirect;
