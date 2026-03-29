const ASSIGNEE_COLORS = ['#22c55e', '#06b6d4', '#14b8a6', '#a855f7', '#374151', '#f472b6', '#f97316', '#64748b'];
const TASK_COLORS = ['#e94560', '#f7c35c', '#64d2ff', '#4ade80', '#a78bfa', '#fb923c', '#f472b6', '#34d399', '#60a5fa', '#f87171'];

const STATUS_ORDER = { queue: 0, progress: 1, review: 2, done: 3 };
const STATUS_LIST = ['queue', 'progress', 'review', 'done'];
const STATUS_LABELS = { queue: 'В очереди', progress: 'В работе', review: 'На проверке', done: 'Готово' };
const PRIORITY_ORDER = ['low', 'medium', 'high', 'critical'];
const PRIORITY_LABELS = { low: 'Низкий', medium: 'Средний', high: 'Высокий', critical: 'Критичный' };
const PRIORITY_NUMS = { critical: '1', high: '2', medium: '3', low: '4' };

const LOCAL_ASSIGNEE_COLORS_KEY = 'aod.assigneeColors';

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

function resolveAssigneeColor(assignee, index = 0) {
    if (assignee && assignee.color) return assignee.color;
    const local = assignee ? getLocalAssigneeColor(assignee.id) : '';
    if (local) return local;
    const seed = assignee ? hashString(assignee.name || assignee.id) : index;
    return pickAssigneeColor(seed || 0);
}

function showToast(msg, type = 'info') {
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

function getTaskColorById(taskId) {
    const task = window.tasks.find(t => t.id == taskId);
    return task ? (task.color || '') : '';
}

function findSubtaskById(nodes, id) {
    for (const n of nodes || []) {
        if (n.id === id) return n;
        const kids = n.children || n.subtasks || [];
        const found = findSubtaskById(kids, id);
        if (found) return found;
    }
    return null;
}

function hasSubtasks(task) {
    return Array.isArray(task?.subtasks) && task.subtasks.length > 0;
}

function getSubtaskStats(subtasks) {
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
}

function renderProgressMeta(subtasks) {
    const stats = getSubtaskStats(subtasks);
    if (!stats.total) return '';
    const pct = Math.round((stats.done / stats.total) * 100);
    return `<div class="task-meta"><span>${stats.done}/${stats.total} задач</span><div class="progress-bar"><span style="width:${pct}%"></span></div></div>`;
}

function calculateTaskAssignees(subtasks) {
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
}

function normalizeSubtasksTree(subtasks) {
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
    return normalize(subtasks || []);
}

function calculateNodeAssignees(node) {
    const allAssignees = new Set();
    if (node.assignees) {
        node.assignees.forEach(a => allAssignees.add(String(a)));
    }
    const children = node.children || node.subtasks || [];
    if (children.length > 0) {
        children.forEach(child => {
            calculateNodeAssignees(child).forEach(a => allAssignees.add(a));
        });
    }
    return Array.from(allAssignees);
}

function calculateTaskStatus(subtasks) {
    if (!subtasks || subtasks.length === 0) return 'queue';

    const getAllSubtasks = (nodes) => {
        let result = [];
        for (const n of nodes) {
            result.push(n);
            const kids = n.children || n.subtasks || [];
            if (kids.length > 0) result = result.concat(getAllSubtasks(kids));
        }
        return result;
    };

    const allSubtasks = getAllSubtasks(subtasks);
    if (allSubtasks.length === 0) return 'queue';

    let minStatus = 'done';
    let minOrder = STATUS_ORDER.done;

    for (const sub of allSubtasks) {
        const order = STATUS_ORDER[sub.status] || 0;
        if (order < minOrder) {
            minOrder = order;
            minStatus = sub.status;
        }
    }

    return minStatus;
}

function elevateSameStatusSubtasks(subtasks, oldStatus, newStatus) {
    const elevate = (nodes) => (nodes || []).map(n => {
        const rawChildren = n.children || n.subtasks || [];
        const newChildren = rawChildren.length > 0 ? elevate(rawChildren) : [];
        if (n.status === oldStatus) {
            return { ...n, status: newStatus, children: newChildren };
        }
        return { ...n, children: newChildren };
    });
    return elevate(subtasks);
}
