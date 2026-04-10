document.addEventListener('DOMContentLoaded', async () => {
    document.addEventListener('click', (e) => {
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
    await loadTaskHistory();
});
