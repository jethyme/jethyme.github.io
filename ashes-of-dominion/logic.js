(function (global) {
    const STATUS_ORDER = global.STATUS_ORDER || { queue: 0, progress: 1, review: 2, done: 3 };

    function hasSubtasks(task) {
        return (Array.isArray(task?.subtasks) && task.subtasks.length > 0) ||
               (Array.isArray(task?.children) && task.children.length > 0);
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
        return `<div class="task-meta"><span>${stats.done}/${stats.total} готово</span><div class="progress-bar"><span style="width:${pct}%"></span></div></div>`;
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

    const AOD = {
        STATUS_ORDER,
        hasSubtasks,
        getSubtaskStats,
        renderProgressMeta,
        calculateTaskAssignees,
        normalizeSubtasksTree,
        calculateNodeAssignees,
        calculateTaskStatus,
        elevateSameStatusSubtasks
    };

    Object.assign(global, AOD);

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = AOD;
    }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
