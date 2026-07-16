document.addEventListener('DOMContentLoaded', async () => {
    document.addEventListener('click', (e) => {
        const badge = e.target.closest('.clickable-badge');
        if (badge) {
            openBadgeDropdown(e, badge);
        }
    });
    
    loadFilters();
    renderFilterDropdowns();
    await loadTasks();
});
