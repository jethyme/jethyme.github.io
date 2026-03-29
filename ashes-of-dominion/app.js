const SUPABASE_URL = 'https://nrrqiedzcwmgzqkmaret.supabase.co';
const SUPABASE_KEY = 'sb_publishable_1edDcYXXILaZ27t7oMEWMA_KIt2Ivck';
const sbClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let tasks = [], assignees = [], currentUser = null, canEdit = false;
let taskColorDbSupported = true;
let expandedTasks = new Set();
let expandedSubtasks = new Set();
let draggedItem = null;
let filterAssignee = [], filterPriority = [], filterStatus = [];

const LOCAL_EXPANDED_KEY = 'aod.expandedState';
const LOCAL_FILTERS_KEY = 'aod.filters';

const STATUS_ORDER = { queue: 0, progress: 1, review: 2, done: 3 };
const STATUS_LIST = ['queue', 'progress', 'review', 'done'];
const STATUS_LABELS = { queue: 'В очереди', progress: 'В работе', review: 'На проверке', done: 'Готово' };
const PRIORITY_ORDER = ['low', 'medium', 'high', 'critical'];
const PRIORITY_LABELS = { low: 'Низкий', medium: 'Средний', high: 'Высокий', critical: 'Критичный' };
const PRIORITY_NUMS = { critical: '1', high: '2', medium: '3', low: '4' };

const ASSIGNEE_COLORS = ['#22c55e', '#06b6d4', '#14b8a6', '#a855f7', '#374151', '#f472b6', '#f97316', '#64748b'];
const TASK_COLORS = ['#e94560', '#f7c35c', '#64d2ff', '#4ade80', '#a78bfa', '#fb923c', '#f472b6', '#34d399', '#60a5fa', '#f87171'];

const LOCAL_ASSIGNEE_COLORS_KEY = 'aod.assigneeColors';
let assigneeColorDbSupported = true;

function loadAssigneeColorMap() {
    try {
        return JSON.parse(localStorage.getItem(LOCAL_ASSIGNEE_COLORS_KEY) || '{}');
    } catch (e) {
        return {};
    }
}

function saveAssigneeColorMap(map) {
    try {
        localStorage.setItem(LOCAL_ASSIGNEE_COLORS_KEY, JSON.stringify(map || {}));
    } catch (e) {}
}

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

function setLocalAssigneeColor(id, color) {
    if (!id || !color) return;
    const map = loadAssigneeColorMap();
    map[String(id)] = color;
    saveAssigneeColorMap(map);
}

function getLocalAssigneeColor(id) {
    const map = loadAssigneeColorMap();
    return map[String(id)] || '';
}

function hashString(str) {
    let hash = 0;
    const text = String(str || '');
    for (let i = 0; i < text.length; i++) {
        hash = (hash * 31 + text.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
}

function pickAssigneeColor(seed) {
    const index = Math.abs(seed) % ASSIGNEE_COLORS.length;
    return ASSIGNEE_COLORS[index];
}

function resolveAssigneeColor(assignee, index = 0) {
    if (assignee && assignee.color) return assignee.color;
    const local = assignee ? getLocalAssigneeColor(assignee.id) : '';
    if (local) return local;
    const seed = assignee ? hashString(assignee.name || assignee.id) : index;
    return pickAssigneeColor(seed || 0);
}

function hexToRgb(hex) {
    if (!hex || typeof hex !== 'string') return null;
    let value = hex.trim().replace('#', '');
    if (value.length === 3) {
        value = value.split('').map(c => c + c).join('');
    }
    if (value.length !== 6) return null;
    const num = parseInt(value, 16);
    if (Number.isNaN(num)) return null;
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function rgbToHex(r, g, b) {
    const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
    return '#' + [clamp(r), clamp(g), clamp(b)]
        .map(v => v.toString(16).padStart(2, '0'))
        .join('');
}

function getTaskColorById(taskId) {
    const task = tasks.find(t => t.id == taskId);
    return task ? (task.color || '') : '';
}

function getContrastColor(hex) {
    if (!hex) return '#ffffff';
    const rgb = hexToRgb(hex);
    if (!rgb) return '#ffffff';
    const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
    return luminance > 0.5 ? '#2b2b2b' : '#ffffff';
}

function getShortName(name) {
    const text = String(name || '').trim();
    if (!text) return '';
    return text.split(/\s+/)[0];
}

function mixColor(hexA, hexB, weight) {
    const a = hexToRgb(hexA);
    const b = hexToRgb(hexB);
    if (!a) return hexA || '';
    if (!b) return hexA || '';
    const w = Math.max(0, Math.min(1, weight));
    const r = a.r * (1 - w) + b.r * w;
    const g = a.g * (1 - w) + b.g * w;
    const bl = a.b * (1 - w) + b.b * w;
    return rgbToHex(Math.round(r), Math.round(g), Math.round(bl));
}

function deriveTaskColor(baseColor, depth) {
    if (!baseColor) return '';
    const weight = Math.min(0.12 * depth, 0.6);
    return mixColor(baseColor, '#000000', weight);
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

const hasSubtasks = function hasSubtasks(task) {
    return Array.isArray(task?.subtasks) && task.subtasks.length > 0;
};

const getSubtaskStats = function getSubtaskStats(subtasks) {
    const all = [];
    const walk = (nodes) => {
        (nodes || []).forEach(n => {
            all.push(n);
            const kids = n.children || n.subtasks || [];
            if (kids.length > 0) walk(kids);
        });
    };
    walk(subtasks);
    const total = all.length;
    const done = all.filter(n => n.status === 'done').length;
    return { total, done };
};

const renderProgressMeta = function renderProgressMeta(subtasks) {
    const stats = getSubtaskStats(subtasks);
    if (!stats.total) return '';
    const pct = Math.round((stats.done / stats.total) * 100);
    return `<div class="task-meta"><span>${stats.done}/${stats.total} задач</span><div class="progress-bar"><span style="width:${pct}%"></span></div></div>`;
};

const calculateTaskAssignees = function calculateTaskAssignees(subtasks) {
    const allAssignees = new Set();
    const collectAssignees = (nodes) => {
        for (const n of nodes) {
            if (n.assignees) {
                n.assignees.forEach(a => allAssignees.add(String(a)));
            }
            const children = n.children || n.subtasks || [];
            if (children.length > 0) collectAssignees(children);
        }
    };
    collectAssignees(subtasks || []);
    return Array.from(allAssignees);
};

const normalizeSubtasksTree = function normalizeSubtasksTree(subtasks) {
    const normalize = (nodes) => (nodes || []).map(node => {
        const { subtasks: legacySubtasks, children: existingChildren, ...rest } = node || {};
        const currentChildren = Array.isArray(existingChildren) ? existingChildren : [];
        const legacyChildren = Array.isArray(legacySubtasks) ? legacySubtasks : [];
        const rawChildren = currentChildren.length > 0 ? currentChildren : legacyChildren;
        const children = normalize(rawChildren);
        if (children.length === 0) {
            return {
                ...rest,
                status: STATUS_ORDER.hasOwnProperty(node.status) ? node.status : 'queue',
                assignees: node.assignees || [],
                children: []
            };
        }
        const status = calculateTaskStatus(children);
        const assignees = calculateTaskAssignees(children);
        return { ...rest, status, assignees, children };
    });
    return normalize(subtasks);
};

const calculateNodeAssignees = function calculateNodeAssignees(node) {
    if (!node) return [];
    if (node.assignees && node.assignees.length > 0) return node.assignees;
    const allAssignees = new Set();
    const collectAssignees = (nodes) => {
        for (const n of nodes) {
            if (n.assignees) {
                n.assignees.forEach(a => allAssignees.add(String(a)));
            }
            const children = n.children || n.subtasks || [];
            if (children.length > 0) collectAssignees(children);
        }
    };
    collectAssignees(node.subtasks || []);
    return Array.from(allAssignees);
};

const calculateTaskStatus = function calculateTaskStatus(subtasks) {
    const all = [];
    const walk = (nodes) => {
        (nodes || []).forEach(n => {
            all.push(n);
            const kids = n.children || n.subtasks || [];
            if (kids.length > 0) walk(kids);
        });
    };
    walk(subtasks);
    if (all.length === 0) return 'queue';
    const statusOrder = (s) => STATUS_ORDER[s] ?? 0;
    const maxStatus = all.reduce((max, n) => {
        const order = statusOrder(n.status);
        return order > statusOrder(max) ? n.status : max;
    }, 'queue');
    return maxStatus;
};

const elevateSameStatusSubtasks = function elevateSameStatusSubtasks(subtasks, oldStatus, newStatus) {
    const elevate = (nodes) => {
        const oldOrder = STATUS_ORDER[oldStatus] ?? 0;
        const newOrder = STATUS_ORDER[newStatus] ?? 0;
        if (newOrder <= oldOrder) return nodes;
        
        return nodes.map(n => {
            const nOrder = STATUS_ORDER[n.status] ?? 0;
            if (nOrder === oldOrder) {
                const rawChildren = n.children || n.subtasks || [];
                const newChildren = rawChildren.length > 0 ? elevate(rawChildren) : [];
                if (n.status === oldStatus) {
                    return { ...n, status: newStatus, children: newChildren };
                }
                return { ...n, children: newChildren };
            }
            const rawChildren = n.children || n.subtasks || [];
            const newChildren = rawChildren.length > 0 ? elevate(rawChildren) : [];
            return { ...n, children: newChildren };
        });
    };
    return elevate(subtasks);
};

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

function updateUserUI() {
    document.getElementById('userContainer').style.display = currentUser ? 'flex' : 'none';
    document.getElementById('loginBtn').style.display = currentUser ? 'none' : 'block';
    document.getElementById('userEmail').textContent = currentUser?.email;
    document.getElementById('userBadge').className = canEdit ? 'user-badge' : 'user-badge readonly';
}

function updateEditControls() {
    document.getElementById('addTaskBtn').disabled = !canEdit;
}

async function login(email, password) {
    const { data, error } = await sbClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    currentUser = data.user;
    const { data: perm } = await sbClient.from('allowed_users').select('user_id').eq('user_id', currentUser.id).single();
    canEdit = !!perm;
    updateUserUI();
    updateEditControls();
    renderTasks();
    showToast('Вход выполнен', 'success');
    closeAuthModal();
}

async function register(email, password) {
    const { error } = await sbClient.auth.signUp({ email, password });
    if (error) throw error;
    showToast('Проверьте email для подтверждения', 'success');
    closeAuthModal();
}

async function logout() {
    await sbClient.auth.signOut();
    currentUser = null;
    canEdit = false;
    updateUserUI();
    updateEditControls();
    renderTasks();
    showToast('Выход выполнен', 'success');
}

document.addEventListener('DOMContentLoaded', async () => {
    document.addEventListener('click', (e) => {
        const assigneeTag = e.target.closest('.assignees-list.clickable .assignee-tag');
        if (assigneeTag) {
            const list = e.target.closest('.assignees-list');
            const taskId = parseInt(list.dataset.taskId);
            const subtaskId = list.dataset.subtaskId ? parseInt(list.dataset.subtaskId) : null;
            if (taskId) {
                const badge = document.createElement('span');
                badge.dataset.type = 'assignee';
                badge.dataset.taskId = taskId;
                badge.dataset.subtask = subtaskId || '';
                const task = tasks.find(t => t.id == taskId);
                let ids = [];
                if (subtaskId && task) {
                    const sub = findSubtaskById(task.subtasks, subtaskId);
                    if (sub) {
                        ids = sub.assignees || [];
                    }
                } else if (task) {
                    ids = task.assignees || [];
                }
                badge.dataset.value = ids.join(',');
                openBadgeDropdown(e, badge);
            }
            return;
        }
        const badge = e.target.closest('.clickable-badge');
        if (badge) {
            openBadgeDropdown(e, badge);
        }
    });
    
    await checkAuth();
    loadFilters();
    await loadAssignees();
    renderFilterDropdowns();
    await loadTasks();
});
