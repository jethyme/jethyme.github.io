const SUPABASE_URL = 'https://nrrqiedzcwmgzqkmaret.supabase.co';
const SUPABASE_KEY = 'sb_publishable_1edDcYXXILaZ27t7oMEWMA_KIt2Ivck';
const sbClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const LOCAL_EXPANDED_KEY = 'aod.expandedState';
const LOCAL_FILTERS_KEY = 'aod.filters';

let tasks = window.tasks || [];
let assignees = window.assignees || [];
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
    document.getElementById('loginBtn').style.display = currentUser ? 'none' : 'block';
    document.getElementById('userEmail').textContent = currentUser?.email;
    document.getElementById('userBadge').className = canEdit ? 'user-badge' : 'user-badge readonly';
}

function updateEditControls() {
    document.getElementById('addTaskBtn').disabled = !canEdit;
}

async function checkAuth() {
    const { data: { session } } = await sbClient.auth.getSession();
    if (session) {
        currentUser = session.user;
        const { data } = await sbClient.from('allowed_users').select('user_id').eq('user_id', currentUser.id).single();
        canEdit = !!data;
        updateUserUI();
        updateEditControls();
    }
}

async function login(email, password) {
    const { data, error } = await sbClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    currentUser = data.user;
    const { data: perm } = await sbClient.from('allowed_users').select('user_id').eq('user_id', currentUser.id).single();
    canEdit = !!perm;
    updateUserUI();
    updateEditControls();
    window.renderTasks();
    showToast('Вход выполнен', 'success');
    window.closeAuthModal();
}

async function register(email, password) {
    const { error } = await sbClient.auth.signUp({ email, password });
    if (error) throw error;
    showToast('Проверьте email для подтверждения', 'success');
    window.closeAuthModal();
}

async function logout() {
    await sbClient.auth.signOut();
    currentUser = null;
    canEdit = false;
    updateUserUI();
    updateEditControls();
    window.renderTasks();
    showToast('Выход выполнен', 'success');
}

async function loadAssignees() {
    const { data, error } = await sbClient.from('assignees').select('*').order('name');
    if (error) {
        console.error(error);
        showToast('Не удалось загрузить исполнителей', 'error');
        return;
    }
    if (data && data.length) {
        assigneeColorDbSupported = data.some(row => Object.prototype.hasOwnProperty.call(row, 'color'));
    }
    assignees = (data || []).map((a, idx) => ({
        ...a,
        color: resolveAssigneeColor(a, idx)
    }));
    window.renderAssigneesSelect();
}

async function loadTasks() {
    const { data, error } = await sbClient.from('tasks').select('*').order('order_index', { ascending: true, nullsFirst: true });
    if (error) {
        console.error(error);
        showToast('Ошибка загрузки задач', 'error');
        return;
    }
    if (data && data.length) {
        taskColorDbSupported = data.some(row => Object.prototype.hasOwnProperty.call(row, 'color'));
    }
    tasks = (data || []).map((t, idx) => ({
        ...t,
        assignees: t.assignees ? t.assignees.split(',').filter(a => a) : [],
        subtasks: typeof t.subtasks === 'string' ? JSON.parse(t.subtasks || '[]') : (t.subtasks || []),
        order_index: t.order_index ?? idx
    }));

    const tasksNeedingOrder = tasks.filter(t => t.order_index === undefined || t.order_index === null);
    if (tasksNeedingOrder.length > 0) {
        const updates = tasksNeedingOrder.map(t => {
            t.order_index = tasks.indexOf(t);
            return sbClient.from('tasks').update({ order_index: t.order_index }).eq('id', t.id);
        });
        await Promise.all(updates);
    }

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
}

async function saveTask(taskData) {
    if (!canEdit) { showToast('Только для редакторов', 'error'); return false; }

    const task = tasks.find(t => t.id === taskData.id);
    let newSubtasks = taskData.subtasks || [];

    if (task && taskData.status !== task.status) {
        const oldOrder = STATUS_ORDER[task.status] ?? 0;
        const newOrder = STATUS_ORDER[taskData.status] ?? 0;

        if (newOrder > oldOrder) {
            newSubtasks = elevateSameStatusSubtasks(newSubtasks, task.status, taskData.status);
        }
    }

    newSubtasks = normalizeSubtasksTree(newSubtasks);

    const hasSubs = newSubtasks && newSubtasks.length > 0;
    const newStatus = hasSubs ? calculateTaskStatus(newSubtasks) : (taskData.status || 'queue');
    const newAssignees = hasSubs ? calculateTaskAssignees(newSubtasks) : (taskData.assignees || []);
    const payload = {
        title: taskData.title,
        color: taskData.color || null,
        priority: taskData.priority,
        status: newStatus,
        assignees: newAssignees.join(','),
        subtasks: JSON.stringify(newSubtasks)
    };

    if (taskData.id) {
        const { error } = await sbClient.from('tasks').update(payload).eq('id', taskData.id);
        if (error) {
            if (payload.color !== undefined) {
                taskColorDbSupported = false;
                const fallback = { ...payload };
                delete fallback.color;
                const { error: fallbackError } = await sbClient.from('tasks').update(fallback).eq('id', taskData.id);
                if (fallbackError) {
                    console.error(fallbackError);
                    showToast('Ошибка сохранения', 'error');
                    return false;
                }
            } else {
                console.error(error);
                showToast('Ошибка сохранения', 'error');
                return false;
            }
        }
    } else {
        const { error } = await sbClient.from('tasks').insert([payload]);
        if (error) {
            if (payload.color !== undefined) {
                taskColorDbSupported = false;
                const fallback = { ...payload };
                delete fallback.color;
                const { error: fallbackError } = await sbClient.from('tasks').insert([fallback]);
                if (fallbackError) {
                    console.error(fallbackError);
                    showToast('Ошибка сохранения', 'error');
                    return false;
                }
            } else {
                console.error(error);
                showToast('Ошибка сохранения', 'error');
                return false;
            }
        }
    }
    await loadTasks();
    showToast('', 'success');
    return true;
}

async function deleteTask(id) {
    if (!canEdit || !confirm('Удалить?')) return;
    await sbClient.from('tasks').delete().eq('id', id);
    await loadTasks();
    showToast('Удалено', 'success');
}

async function updateTaskStatus(taskId, newStatus) {
    if (!canEdit) return;
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const oldOrder = STATUS_ORDER[task.status] ?? 0;
    const newOrder = STATUS_ORDER[newStatus] ?? 0;

    let newSubtasks = task.subtasks;

    if (hasSubtasks(task) && newOrder > oldOrder) {
        newSubtasks = elevateSameStatusSubtasks(task.subtasks, task.status, newStatus);
    }

    newSubtasks = normalizeSubtasksTree(newSubtasks);
    task.subtasks = newSubtasks;
    if (hasSubtasks(task)) {
        task.status = calculateTaskStatus(task.subtasks);
        task.assignees = calculateTaskAssignees(task.subtasks);
    } else {
        task.status = newStatus;
        task.assignees = task.assignees || [];
    }

    await sbClient.from('tasks').update({
        status: task.status,
        subtasks: JSON.stringify(newSubtasks),
        assignees: task.assignees.join(',')
    }).eq('id', taskId);
    await loadTasks();
}

async function updateSubtaskStatus(taskId, subtaskId, newStatus) {
    if (!canEdit) return;
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const updateInTree = (nodes) => nodes.map(n => {
        if (n.id === subtaskId) {
            const oldStatus = n.status;
            const oldOrder = STATUS_ORDER[oldStatus] ?? 0;
            const newOrder = STATUS_ORDER[newStatus] ?? 0;
            let nextChildren = n.children || n.subtasks || [];
            if (newOrder > oldOrder && nextChildren.length > 0) {
                nextChildren = elevateSameStatusSubtasks(nextChildren, oldStatus, newStatus);
            }
            return { ...n, status: newStatus, children: nextChildren };
        }
        const kids = n.children || n.subtasks || [];
        if (kids.length > 0) {
            return { ...n, children: updateInTree(kids) };
        }
        return n;
    });

    task.subtasks = normalizeSubtasksTree(updateInTree(task.subtasks));
    if (hasSubtasks(task)) {
        task.status = calculateTaskStatus(task.subtasks);
        task.assignees = calculateTaskAssignees(task.subtasks);
    }

    await sbClient.from('tasks').update({
        status: task.status,
        subtasks: JSON.stringify(task.subtasks),
        assignees: task.assignees.join(',')
    }).eq('id', taskId);
    await loadTasks();
}

async function changeTaskPriority(taskId, newPriority) {
    if (!canEdit) return;
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    task.priority = newPriority;
    await sbClient.from('tasks').update({ priority: newPriority }).eq('id', taskId).select();
    window.renderTasks();
}

async function changeTaskStatus(taskId, newStatus) {
    if (!canEdit) return;
    await updateTaskStatus(taskId, newStatus);
}

async function changeSubtaskPriority(taskId, subtaskId, newPriority) {
    if (!canEdit) return;
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const target = findSubtaskById(task.subtasks, subtaskId);
    if (!target) return;
    target.priority = newPriority;
    task.subtasks = normalizeSubtasksTree(task.subtasks);
    if (hasSubtasks(task)) {
        task.status = calculateTaskStatus(task.subtasks);
        task.assignees = calculateTaskAssignees(task.subtasks);
    }
    await sbClient.from('tasks').update({
        status: task.status,
        subtasks: JSON.stringify(task.subtasks),
        assignees: task.assignees.join(',')
    }).eq('id', taskId);
    await loadTasks();
}

async function changeSubtaskStatus(taskId, subtaskId, newStatus) {
    if (!canEdit) return;
    await updateSubtaskStatus(taskId, subtaskId, newStatus);
}

async function updateTaskAssignees(taskId, newAssignees) {
    if (!canEdit) return;
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    task.assignees = newAssignees || [];
    await sbClient.from('tasks').update({ assignees: task.assignees.join(',') }).eq('id', taskId);
    await loadTasks();
}

async function updateSubtaskAssignees(taskId, subtaskId, newAssignees) {
    if (!canEdit) return;
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const updateInTree = (nodes) => nodes.map(n => {
        if (n.id === subtaskId) return { ...n, assignees: newAssignees };
        const kids = n.children || n.subtasks || [];
        if (kids.length > 0) return { ...n, children: updateInTree(kids) };
        return n;
    });
    task.subtasks = normalizeSubtasksTree(updateInTree(task.subtasks));
    if (hasSubtasks(task)) {
        task.status = calculateTaskStatus(task.subtasks);
        task.assignees = calculateTaskAssignees(task.subtasks);
    }
    await sbClient.from('tasks').update({
        status: task.status,
        subtasks: JSON.stringify(task.subtasks),
        assignees: task.assignees.join(',')
    }).eq('id', taskId);
    await loadTasks();
}

async function saveSubtask(taskId, subtaskData) {
    if (!canEdit) { showToast('Только для редакторов', 'error'); return false; }
    const task = tasks.find(t => t.id === taskId);
    if (!task) return false;

    if (subtaskData.id) {
        const updateInTree = (nodes) => nodes.map(n => {
            if (n.id === subtaskData.id) {
                return { ...n, title: subtaskData.title, priority: subtaskData.priority, status: subtaskData.status, assignees: subtaskData.assignees };
            }
            if (n.children) return { ...n, children: updateInTree(n.children) };
            return n;
        });
        task.subtasks = updateInTree(task.subtasks);
    } else {
        const newSubtask = {
            id: Date.now(),
            title: subtaskData.title,
            priority: subtaskData.priority,
            status: subtaskData.status,
            assignees: subtaskData.assignees,
            children: []
        };
        if (subtaskData.parentId) {
            const addToParent = (nodes) => nodes.map(n => {
                if (n.id === subtaskData.parentId) return { ...n, children: [...(n.children || []), newSubtask] };
                if (n.children) return { ...n, children: addToParent(n.children) };
                return n;
            });
            task.subtasks = addToParent(task.subtasks);
        } else {
            task.subtasks.push(newSubtask);
        }
    }

    task.subtasks = normalizeSubtasksTree(task.subtasks);
    if (hasSubtasks(task)) {
        task.status = calculateTaskStatus(task.subtasks);
        task.assignees = calculateTaskAssignees(task.subtasks);
    } else {
        task.assignees = task.assignees || [];
    }

    await sbClient.from('tasks').update({
        status: task.status,
        subtasks: JSON.stringify(task.subtasks),
        assignees: task.assignees.join(',')
    }).eq('id', taskId);
    await loadTasks();
    showToast('Подзадача сохранена', 'success');
    return true;
}

async function deleteSubtask(taskId, subtaskId) {
    if (!canEdit || !confirm('Удалить?')) return;
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const deleteFromTree = (nodes) => nodes.filter(n => n.id !== subtaskId).map(n => ({
        ...n, children: n.children ? deleteFromTree(n.children) : []
    }));
    task.subtasks = normalizeSubtasksTree(deleteFromTree(task.subtasks));
    if (hasSubtasks(task)) {
        task.status = calculateTaskStatus(task.subtasks);
        task.assignees = calculateTaskAssignees(task.subtasks);
    } else {
        task.status = task.status || 'queue';
        task.assignees = task.assignees || [];
    }
    await sbClient.from('tasks').update({
        status: task.status,
        subtasks: JSON.stringify(task.subtasks),
        assignees: task.assignees.join(',')
    }).eq('id', taskId);
    await loadTasks();
    showToast('Удалено', 'success');
}

async function addAssignee() {
    const input = document.getElementById('newAssigneeName');
    const name = input.value.trim();
    if (!name || !canEdit) return;
    const color = pickAssigneeColor(hashString(name));
    let created = null;
    if (assigneeColorDbSupported) {
        const { data: withColor, error: colorError } = await sbClient.from('assignees').insert([{ name, color }]).select();
        if (!colorError) {
            created = withColor && withColor[0];
        } else {
            assigneeColorDbSupported = false;
        }
    }
    if (!created) {
        const { data: noColor, error: fallbackError } = await sbClient.from('assignees').insert([{ name }]).select();
        if (fallbackError) {
            console.error(fallbackError);
            showToast('Не удалось создать исполнителя', 'error');
            return;
        }
        created = noColor && noColor[0];
        if (created) setLocalAssigneeColor(created.id, color);
    }
    input.value = '';
    await loadAssignees();
    window.renderAssigneesList();
    showToast('Создан', 'success');
}

async function deleteAssignee(id) {
    if (!canEdit || !confirm('Удалить?')) return;
    await sbClient.from('assignees').delete().eq('id', id);
    await loadAssignees();
    window.renderAssigneesList();
    showToast('Удалён', 'success');
}

async function updateAssigneeColor(id, color) {
    if (!canEdit) return;
    if (assigneeColorDbSupported) {
        const { error } = await sbClient.from('assignees').update({ color }).eq('id', id);
        if (error) {
            assigneeColorDbSupported = false;
        }
    }
    if (!assigneeColorDbSupported) {
        setLocalAssigneeColor(id, color);
    }
    await loadAssignees();
    window.renderAssigneesList();
    window.renderTasks();
    document.querySelector('.color-picker-popup')?.remove();
}

async function saveTaskOrder() {
    const orderUpdates = tasks.map((task, index) => {
        return sbClient.from('tasks').update({ order_index: index }).eq('id', task.id);
    });
    await Promise.all(orderUpdates);
    window.renderTasks();
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
