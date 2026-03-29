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
