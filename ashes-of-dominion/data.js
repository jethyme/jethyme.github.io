const SUPABASE_URL = 'https://nrrqiedzcwmgzqkmaret.supabase.co';
const SUPABASE_KEY = 'sb_publishable_1edDcYXXILaZ27t7oMEWMA_KIt2Ivck';
const sbClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const LOCAL_EXPANDED_KEY = 'aod.expandedState';
const LOCAL_FILTERS_KEY = 'aod.filters';

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
    window.assignees = assignees;
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
    window.tasks = tasks;

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
        const { error, data } = await sbClient.from('tasks').insert([payload]).select();
        if (error) {
            if (payload.color !== undefined) {
                taskColorDbSupported = false;
                const fallback = { ...payload };
                delete fallback.color;
                const { error: fallbackError } = await sbClient.from('tasks').insert([fallback]).select();
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
    const newTask = tasks.find(t => t.title === taskData.title && !taskData.id);
    if (newTask) {
        await saveHistoryEntry({
            task_id: newTask.id,
            subtask_id: null,
            change_type: 'creation',
            changed_at: new Date().toISOString().split('T')[0],
            
            task_title: newTask.title,
            task_path: newTask.title,
            new_status: newTask.status || 'queue',
            new_priority: newTask.priority || 'medium',
            new_assignees: (newTask.assignees || []).join(',')
        });
    }
    showToast('', 'success');
    return true;
}

async function deleteTask(id) {
    if (!canEdit || !confirm('Удалить?')) return;
    await sbClient.from('task_history').delete().eq('task_id', id);
    await sbClient.from('tasks').delete().eq('id', id);
    await loadTasks();
    await loadTaskHistory();
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
    
    await saveHistoryEntry({
        task_id: taskId,
        subtask_id: null,
        change_type: 'status',
        changed_at: new Date().toISOString().split('T')[0],
        task_title: task.title,
        task_path: task.title,
        new_status: newStatus,
        new_priority: task.priority || 'medium',
        new_assignees: (task.assignees || []).join(',')
    });
    
    if (task.subtasks && task.subtasks.length > 0) {
        const updateSubtasksStatus = (subtasks, path) => {
            subtasks.forEach(sub => {
                const subPath = path + ' → ' + sub.title;
                const children = sub.children || sub.subtasks || [];
                if (children.length === 0 && sub.status !== (newStatus === 'done' ? 'done' : (newStatus === 'progress' ? 'progress' : (newStatus === 'review' ? 'review' : 'queue')))) {
                    saveHistoryEntry({
                        task_id: taskId,
                        subtask_id: sub.id,
                        change_type: 'status',
                        changed_at: new Date().toISOString().split('T')[0],
                        task_title: sub.title,
                        task_path: subPath,
                        new_status: sub.status,
                        new_priority: sub.priority || 'medium',
                        new_assignees: (sub.assignees || []).join(',')
                    });
                }
                if (children.length > 0) {
                    updateSubtasksStatus(children, subPath);
                }
            });
        };
        updateSubtasksStatus(task.subtasks, task.title);
    }
    
    await loadTasks();
}

async function updateSubtaskStatus(taskId, subtaskId, newStatus) {
    if (!canEdit) return;
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const subtask = findSubtaskById(task, subtaskId);
    const subtaskPath = subtask ? task.title + ' → ' + subtask.title : '';

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
    await saveHistoryEntry({
        task_id: taskId,
        subtask_id: subtaskId,
        change_type: 'status',
        changed_at: new Date().toISOString().split('T')[0],
        
        task_title: subtask ? subtask.title : '',
        task_path: subtaskPath,
        new_status: newStatus,
        new_priority: subtask ? (subtask.priority || 'medium') : 'medium',
        new_assignees: subtask ? (subtask.assignees || []).join(',') : ''
    });
    await loadTasks();
}

async function changeTaskPriority(taskId, newPriority) {
    if (!canEdit) return;
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    task.priority = newPriority;
    await sbClient.from('tasks').update({ priority: newPriority }).eq('id', taskId).select();
    await saveHistoryEntry({
        task_id: taskId,
        subtask_id: null,
        change_type: 'priority',
        changed_at: new Date().toISOString().split('T')[0],
        
        task_title: task.title,
        task_path: task.title,
        new_status: task.status || 'queue',
        new_priority: newPriority,
        new_assignees: (task.assignees || []).join(',')
    });
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

    const subtask = findSubtaskById(task, subtaskId);
    const subtaskPath = subtask ? task.title + ' → ' + subtask.title : '';

    const updateInTree = (nodes) => nodes.map(n => {
        if (String(n.id) === String(subtaskId)) {
            return { ...n, priority: newPriority };
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
    if (subtask) {
        await saveHistoryEntry({
            task_id: taskId,
            subtask_id: subtaskId,
            change_type: 'priority',
            changed_at: new Date().toISOString().split('T')[0],
            
            task_title: subtask.title,
            task_path: subtaskPath,
            new_status: subtask.status || 'queue',
            new_priority: newPriority,
            new_assignees: (subtask.assignees || []).join(',')
        });
    }
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
    await saveHistoryEntry({
        task_id: taskId,
        subtask_id: null,
        change_type: 'assignee',
        changed_at: new Date().toISOString().split('T')[0],
        
        task_title: task.title,
        task_path: task.title,
        new_status: task.status || 'queue',
        new_priority: task.priority || 'medium',
        new_assignees: (newAssignees || []).join(',')
    });
    await loadTasks();
}

async function updateSubtaskAssignees(taskId, subtaskId, newAssignees) {
    if (!canEdit) return;
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const subtask = findSubtaskById(task, subtaskId);
    const subtaskPath = subtask ? task.title + ' → ' + subtask.title : '';
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
    if (subtask) {
        await saveHistoryEntry({
            task_id: taskId,
            subtask_id: subtaskId,
            change_type: 'assignee',
            changed_at: new Date().toISOString().split('T')[0],
            
            task_title: subtask.title,
            task_path: subtaskPath,
            new_status: subtask.status || 'queue',
            new_priority: subtask.priority || 'medium',
            new_assignees: (newAssignees || []).join(',')
        });
    }
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
        const newSubtaskId = Date.now();
        const newSubtask = {
            id: newSubtaskId,
            title: subtaskData.title,
            priority: subtaskData.priority,
            status: subtaskData.status,
            assignees: subtaskData.assignees,
            children: []
        };
        if (subtaskData.parentId) {
            const addToParent = (nodes) => nodes.map(n => {
                if (String(n.id) === String(subtaskData.parentId)) return { ...n, children: [...(n.children || []), newSubtask] };
                if (n.children) return { ...n, children: addToParent(n.children) };
                return n;
            });
            task.subtasks = addToParent(task.subtasks);
        } else {
            task.subtasks.push(newSubtask);
        }
        const findInTree = (nodes, id) => {
            for (const n of nodes) {
                if (String(n.id) === String(id)) return n;
                if (n.children) {
                    const found = findInTree(n.children, id);
                    if (found) return found;
                }
            }
            return null;
        };
        const newSubtaskFull = findInTree(task.subtasks, newSubtaskId);
        if (newSubtaskFull) {
            if (subtaskData.parentId) {
                const getSubtaskById = (nodes, id) => {
                    for (const n of nodes) {
                        if (n.id === id) return n;
                        if (n.children) {
                            const found = getSubtaskById(n.children, id);
                            if (found) return found;
                        }
                    }
                    return null;
                };
                const parentSubtask = getSubtaskById(task.subtasks, subtaskData.parentId);
                if (parentSubtask) {
                    const existingParentEntry = window.taskHistory.find(h => 
                        h.task_id === taskId && h.subtask_id === parentSubtask.id && h.change_type === 'creation'
                    );
                    if (!existingParentEntry) {
                        const getParentPath = (nodes, id, path = []) => {
                            for (const n of nodes) {
                                if (String(n.id) === String(id)) return [...path, n.title];
                                if (n.children) {
                                    const found = getParentPath(n.children, id, [...path, n.title]);
                                    if (found) return found;
                                }
                            }
                            return null;
                        };
                        const parentFullPath = getParentPath(task.subtasks, parentSubtask.id, [task.title]);
                        const parentPath = parentFullPath ? parentFullPath.join(' → ') : task.title + ' → ' + parentSubtask.title;
                        await saveHistoryEntry({
                            task_id: taskId,
                            subtask_id: parentSubtask.id,
                            change_type: 'creation',
                            changed_at: new Date().toISOString().split('T')[0],
                            task_title: parentSubtask.title,
                            task_path: parentPath,
                            new_status: parentSubtask.status || 'queue',
                            new_priority: parentSubtask.priority || 'medium',
                            new_assignees: (parentSubtask.assignees || []).join(',')
                        });
                    }
                }
            }
            
            const getFullPath = (nodes, id, path = []) => {
                for (const n of nodes) {
                    if (String(n.id) === String(id)) return [...path, n.title];
                    if (n.children) {
                        const found = getFullPath(n.children, id, [...path, n.title]);
                        if (found) return found;
                    }
                }
                return null;
            };
            const fullPath = getFullPath(task.subtasks, newSubtaskFull.id, [task.title]);
            const subtaskPath = fullPath ? fullPath.join(' → ') : task.title + ' → ' + newSubtaskFull.title;
            await saveHistoryEntry({
                task_id: taskId,
                subtask_id: newSubtaskFull.id,
                change_type: 'creation',
                changed_at: new Date().toISOString().split('T')[0],
                task_title: newSubtaskFull.title,
                task_path: subtaskPath,
                new_status: newSubtaskFull.status || 'queue',
                new_priority: newSubtaskFull.priority || 'medium',
                new_assignees: (newSubtaskFull.assignees || []).join(',')
            });
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
    await sbClient.from('task_history').delete().match({ task_id: taskId, subtask_id: subtaskId });
    await loadTasks();
    await loadTaskHistory();
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

async function loadTaskHistory() {
    const { data, error } = await sbClient.from('task_history').select('*').order('changed_at', { ascending: false }).order('order_index', { ascending: true });
    if (error) {
        console.error(error);
        showToast('Ошибка загрузки истории', 'error');
        return;
    }
    taskHistory = data || [];
    window.taskHistory = data || [];
    window.renderTaskHistory();
}

async function saveHistoryEntry(entryData) {
    if (!canEdit) return false;
    const date = entryData.changed_at || new Date().toISOString().split('T')[0];
    const taskId = entryData.task_id;
    const subtaskId = entryData.subtask_id;
    const existingOnDate = window.taskHistory.filter(h => 
        h.changed_at === date && 
        h.task_id === taskId &&
        h.subtask_id === subtaskId
    );
    let orderIndex = entryData.order_index;
    if (orderIndex === undefined || orderIndex === null) {
        const maxIdx = window.taskHistory.reduce((max, e) => Math.max(max, e.order_index || 0), 0);
        orderIndex = maxIdx + 1;
    }
    const payload = {
        task_id: entryData.task_id,
        subtask_id: entryData.subtask_id != null ? entryData.subtask_id : null,
        change_type: entryData.change_type,
        changed_at: date,
        order_index: orderIndex,
        task_title: entryData.task_title,
        task_path: entryData.task_path || '',
        new_status: entryData.new_status || null,
        new_priority: entryData.new_priority || null,
        new_assignees: entryData.new_assignees || null
    };
    const { error } = await sbClient.from('task_history').insert([payload]);
    if (error) {
        console.error(error);
        showToast('Ошибка сохранения записи истории', 'error');
        return false;
    }
    await loadTaskHistory();
    return true;
}

async function deleteHistoryEntry(id) {
    if (!canEdit || !confirm('Удалить запись истории?')) return;
    const entry = window.taskHistory.find(e => e.id === id);
    if (!entry) return;
    
    if (entry.change_type === 'creation') {
        const allTaskEntries = window.taskHistory.filter(e => 
            e.task_id === entry.task_id && 
            e.subtask_id === entry.subtask_id
        );
        for (const e of allTaskEntries) {
            await sbClient.from('task_history').delete().eq('id', e.id);
        }
        
        if (entry.subtask_id) {
            await deleteSubtask(entry.task_id, entry.subtask_id);
        } else {
            await deleteTask(entry.task_id);
        }
    } else {
        await sbClient.from('task_history').delete().eq('id', id);
        await loadTaskHistory();
        await window.applyCurrentStateFromHistoryInternal(entry.task_id, entry.subtask_id);
    }
    await loadTaskHistory();
    await loadTasks();
    showToast('Удалено', 'success');
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
    if (!canEdit) return;
    const { error } = await sbClient.from('task_history').update({ changed_at: newDate }).eq('id', id);
    if (error) {
        console.error(error);
        showToast('Ошибка обновления даты', 'error');
        return;
    }
    await loadTaskHistory();
}

async function updateHistoryEntryOrder(id, newOrder, newDate) {
    if (!canEdit) return;
    const entry = taskHistory.find(e => e.id === id);
    if (!entry) return;
    const sameDateEntries = taskHistory.filter(e => e.changed_at === newDate && e.id !== id);
    const updates = sameDateEntries.map(e => {
        const idx = e.order_index >= newOrder ? e.order_index + 1 : e.order_index;
        return sbClient.from('task_history').update({ order_index: idx, changed_at: newDate }).eq('id', e.id);
    });
    updates.push(sbClient.from('task_history').update({ order_index: newOrder, changed_at: newDate }).eq('id', id));
    await Promise.all(updates);
    await loadTaskHistory();
}

async function initializeHistoryForExistingTasks() {
    await sbClient.from('task_history').delete().neq('id', 0);
    const historyEntries = [];
    tasks.forEach(task => {
        const taskPath = task.title;
        historyEntries.push({
            task_id: task.id,
            subtask_id: null,
            change_type: 'creation',
            changed_at: '2026-03-27',
            
            task_title: task.title,
            task_path: taskPath,
            new_status: task.status || 'queue',
            new_priority: task.priority || 'medium',
            new_assignees: (task.assignees || []).join(',')
        });
        const collectLeafSubtasks = (subtasks, path) => {
            subtasks.forEach(sub => {
                const subPath = path + ' → ' + sub.title;
                const children = sub.children || sub.subtasks || [];
                if (children.length === 0) {
                    historyEntries.push({
                        task_id: task.id,
                        subtask_id: sub.id,
                        change_type: 'creation',
                        changed_at: '2026-03-27',
                        
                        task_title: sub.title,
                        task_path: subPath,
                        new_status: sub.status || 'queue',
                        new_priority: sub.priority || 'medium',
                        new_assignees: (sub.assignees || []).join(',')
                    });
                } else {
                    collectLeafSubtasks(children, subPath);
                }
            });
        };
        if (task.subtasks && task.subtasks.length > 0) {
            collectLeafSubtasks(task.subtasks, taskPath);
        }
    });
    if (historyEntries.length > 0) {
        const { error } = await sbClient.from('task_history').insert(historyEntries);
        if (error) console.error(error);
        else showToast('История инициализирована', 'success');
    }
    await loadTaskHistory();
}

window.loadTaskHistory = loadTaskHistory;
window.saveHistoryEntry = saveHistoryEntry;
window.deleteHistoryEntry = deleteHistoryEntry;
window.updateHistoryEntryDate = updateHistoryEntryDate;
window.updateHistoryEntryOrder = updateHistoryEntryOrder;
window.initializeHistoryForExistingTasks = initializeHistoryForExistingTasks;
window.findSubtaskById = findSubtaskById;

async function changeTaskStatusDirect(taskId, newStatus) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    task.status = newStatus;
    await sbClient.from('tasks').update({ status: newStatus }).eq('id', taskId);
    window.renderTasks();
}

async function changeTaskPriorityDirect(taskId, newPriority) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    task.priority = newPriority;
    await sbClient.from('tasks').update({ priority: newPriority }).eq('id', taskId);
    window.renderTasks();
}

async function updateTaskAssigneesDirect(taskId, newAssignees) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    task.assignees = newAssignees || [];
    await sbClient.from('tasks').update({ assignees: (newAssignees || []).join(',') }).eq('id', taskId);
    window.renderTasks();
}

async function changeSubtaskStatusDirect(taskId, subtaskId, newStatus) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const updateInTree = (nodes) => nodes.map(n => {
        if (n.id === subtaskId) return { ...n, status: newStatus };
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
    window.renderTasks();
}

async function changeSubtaskPriorityDirect(taskId, subtaskId, newPriority) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const updateInTree = (nodes) => nodes.map(n => {
        if (n.id === subtaskId) return { ...n, priority: newPriority };
        const kids = n.children || n.subtasks || [];
        if (kids.length > 0) return { ...n, children: updateInTree(kids) };
        return n;
    });
    task.subtasks = normalizeSubtasksTree(updateInTree(task.subtasks));
    await sbClient.from('tasks').update({ subtasks: JSON.stringify(task.subtasks) }).eq('id', taskId);
    window.renderTasks();
}

async function updateSubtaskAssigneesDirect(taskId, subtaskId, newAssignees) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const updateInTree = (nodes) => nodes.map(n => {
        if (n.id === subtaskId) return { ...n, assignees: newAssignees };
        const kids = n.children || n.subtasks || [];
        if (kids.length > 0) return { ...n, children: updateInTree(kids) };
        return n;
    });
    task.subtasks = normalizeSubtasksTree(updateInTree(task.subtasks));
    await sbClient.from('tasks').update({ subtasks: JSON.stringify(task.subtasks) }).eq('id', taskId);
    window.renderTasks();
}

window.changeTaskStatusDirect = changeTaskStatusDirect;
window.changeTaskPriorityDirect = changeTaskPriorityDirect;
window.updateTaskAssigneesDirect = updateTaskAssigneesDirect;
window.changeSubtaskStatusDirect = changeSubtaskStatusDirect;
window.changeSubtaskPriorityDirect = changeSubtaskPriorityDirect;
window.updateSubtaskAssigneesDirect = updateSubtaskAssigneesDirect;
