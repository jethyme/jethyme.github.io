function openBadgeDropdown(event, badge) {
    if (!canEdit) return;
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

    if (type === 'assignee') {
        const selectedIds = currentValue ? currentValue.split(',') : [];
        dropdown.innerHTML = assignees.map(a => {
            const isSelected = selectedIds.includes(String(a.id));
            const color = a.color || '#888';
            const textColor = getContrastColor(color);
            return '<div class="badge-option' + (isSelected ? ' selected' : '') + '" data-id="' + a.id + '" style="background:' + color + ';color:' + textColor + ';">' + a.name + '<span class="check">&#10003;</span></div>';
        }).join('');
    } else {
        const options = type === 'priority' ? PRIORITY_ORDER.map(p => ({ value: p, label: PRIORITY_LABELS[p] })) : STATUS_LIST.map(s => ({ value: s, label: STATUS_LABELS[s] }));
        dropdown.innerHTML = options.map(opt => {
            const cls = type === 'priority' ? 'priority-' + opt.value : 'status-' + opt.value;
            const isSelected = opt.value === currentValue;
            return '<div class="badge-option ' + cls + (isSelected ? ' selected' : '') + '" data-value="' + opt.value + '">' + opt.label + '<span class="check">&#10003;</span></div>';
        }).join('');
    }

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

    if (type === 'assignee') {
        dropdown.querySelectorAll('.badge-option').forEach(opt => {
            opt.addEventListener('click', async () => {
                const id = opt.dataset.id;
                let selectedIds = currentValue ? currentValue.split(',') : [];
                const isSelected = selectedIds.includes(id);
                if (isSelected) {
                    selectedIds = selectedIds.filter(s => s !== id);
                } else {
                    selectedIds.push(id);
                }
                const assignee = assignees.find(a => String(a.id) === String(id));
                const name = assignee ? assignee.name : id;
                opt.innerHTML = name + (selectedIds.includes(id) ? '<span class="check">&#10003;</span>' : '');
                if (subtaskId) {
                    await updateSubtaskAssignees(taskId, subtaskId, selectedIds);
                } else {
                    await updateTaskAssignees(taskId, selectedIds);
                }
                dropdown.remove();
            });
        });
    } else {
        dropdown.querySelectorAll('.badge-option').forEach(opt => {
            opt.addEventListener('click', async (e) => {
                e.stopPropagation();
                const newValue = opt.dataset.value;
                dropdown.remove();
                if (type === 'priority') {
                    if (subtaskId) {
                        await changeSubtaskPriority(taskId, subtaskId, newValue);
                    } else {
                        await changeTaskPriority(taskId, newValue);
                    }
                } else {
                    if (subtaskId) {
                        await changeSubtaskStatus(taskId, subtaskId, newValue);
                    } else {
                        await changeTaskStatus(taskId, newValue);
                    }
                }
            });
        });
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
    if (!canEdit) return;
    closeBadgeDropdown();
    document.getElementById('modalTitle').textContent = 'Задача';
    document.getElementById('taskForm').reset();
    document.getElementById('taskId').value = '';
    document.getElementById('taskColor').value = '';
    renderBadgeSelector('taskPrioritySelect', 'priority', 'medium');
    renderBadgeSelector('taskStatusSelect', 'status', 'queue');
    renderAssigneesSelect('taskAssigneesSelect', []);
    renderTaskColorPicker();
    document.getElementById('taskModal').classList.add('active');
}

function closeModal() {
    document.getElementById('taskModal').classList.remove('active');
}

function editTask(id) {
    closeBadgeDropdown();
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    document.getElementById('modalTitle').textContent = 'Редактировать';
    document.getElementById('taskId').value = task.id;
    document.getElementById('taskTitle').value = task.title;
    document.getElementById('taskColor').value = task.color || '';
    renderBadgeSelector('taskPrioritySelect', 'priority', task.priority || 'medium');
    renderBadgeSelector('taskStatusSelect', 'status', task.status || 'queue');
    renderAssigneesSelect('taskAssigneesSelect', task.assignees);
    renderTaskColorPicker(task.color || '');
    document.getElementById('taskModal').classList.add('active');
}

function renderTaskColorPicker(selectedColor = '') {
    const container = document.getElementById('taskColorPicker');
    if (!container) return;
    container.innerHTML = TASK_COLORS.map(c => {
        const border = selectedColor === c ? '2px solid #fff' : '2px solid transparent';
        return '<span class="color-swatch" data-color="' + c + '" style="width:22px;height:22px;border-radius:4px;background:' + c + ';cursor:pointer;border:' + border + ';" onclick="selectTaskColor(\'' + c + '\', this)"></span>';
    }).join('');
}

function selectTaskColor(color, el) {
    document.getElementById('taskColor').value = color;
    renderTaskColorPicker(color);
}

function openSubtaskModal(taskId, subtaskId = null, parentId = null) {
    if (!canEdit) return;
    closeBadgeDropdown();
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    document.getElementById('subtaskTaskId').value = taskId;
    document.getElementById('subtaskParentId').value = parentId || '';
    document.getElementById('subtaskId').value = subtaskId || '';

    const findInTree = (nodes, id) => {
        for (const n of nodes) {
            if (n.id === id) return n;
            if (n.children) {
                const found = findInTree(n.children, id);
                if (found) return found;
            }
        }
        return null;
    };

    let subtask = null;
    if (subtaskId) {
        subtask = findInTree(task.subtasks, subtaskId);
        document.getElementById('subtaskModalTitle').textContent = 'Редактировать подзадачу';
    } else if (parentId) {
        document.getElementById('subtaskModalTitle').textContent = 'Дочерняя подзадача';
    } else {
        document.getElementById('subtaskModalTitle').textContent = 'Подзадача';
    }

    document.getElementById('subtaskTitle').value = subtask ? subtask.title : '';
    
    const currentPriority = subtask ? (subtask.priority || 'medium') : (task.priority || 'medium');
    renderBadgeSelector('subtaskPrioritySelect', 'priority', currentPriority);
    
    const currentStatus = subtask ? (subtask.status || 'queue') : 'queue';
    renderBadgeSelector('subtaskStatusSelect', 'status', currentStatus);
    
    const parentNode = parentId ? findInTree(task.subtasks, parentId) : null;
    const selectedAssignees = subtask
        ? (subtask.assignees || [])
        : (parentNode ? (parentNode.assignees || []) : task.assignees);
    renderAssigneesSelect('subtaskAssigneesSelect', selectedAssignees);

    document.getElementById('subtaskModal').classList.add('active');
}

function closeSubtaskModal() {
    document.getElementById('subtaskModal').classList.remove('active');
}

function openAuthModal() { document.getElementById('authModal').classList.add('active'); showAuthTab('login'); }
function closeAuthModal() { document.getElementById('authModal').classList.remove('active'); }
function showAuthTab(tab) {
    document.getElementById('loginForm').classList.toggle('hidden', tab !== 'login');
    document.getElementById('registerForm').classList.toggle('hidden', tab !== 'register');
    document.querySelectorAll('.auth-tabs button').forEach((b, i) => b.classList.toggle('active', (tab === 'login') === (i === 0)));
}

function openAssigneesPanel() {
    renderAssigneesList();
    document.getElementById('assigneesPanel').classList.add('active');
}
function closeAssigneesPanel() { document.getElementById('assigneesPanel').classList.remove('active'); }

function showColorPicker(event, assigneeId) {
    event.stopPropagation();
    const existing = document.querySelector('.color-picker-popup');
    if (existing) existing.remove();

    const popup = document.createElement('div');
    popup.className = 'color-picker-popup';

    ASSIGNEE_COLORS.forEach(color => {
        const btn = document.createElement('span');
        btn.style.background = color;
        btn.onclick = () => updateAssigneeColor(assigneeId, color);
        popup.appendChild(btn);
    });

    const host = event.target.closest('.assignee-item') || event.target.parentElement;
    if (host) {
        host.style.position = 'relative';
        popup.style.top = '26px';
        popup.style.left = '0';
        host.appendChild(popup);
    } else {
        document.body.appendChild(popup);
    }

    setTimeout(() => {
        const close = (e) => {
            if (!popup.contains(e.target)) {
                popup.remove();
                document.removeEventListener('click', close);
            }
        };
        document.addEventListener('click', close);
    }, 0);
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

function handleHistoryDragStart(e, entryId) {
    if (!canEdit || !e.dataTransfer) return;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', entryId);
    window.historyDragItem = entryId;
    e.target.classList.add('dragging');
}

function handleHistoryDragEnd(e) {
    document.querySelectorAll('.history-item.dragging').forEach(el => el.classList.remove('dragging'));
    document.querySelectorAll('.history-item').forEach(el => {
        el.classList.remove('drag-insert-before', 'drag-insert-after');
    });
    document.querySelectorAll('.history-date-entries').forEach(el => el.classList.remove('drag-over'));
    window.historyDragItem = null;
}

function handleHistoryDragOver(e) {
    if (!canEdit) return;
    e.preventDefault();
    const container = e.currentTarget;
    container.classList.add('drag-over');
    
    const items = Array.from(container.querySelectorAll('.history-item:not(.dragging)'));
    if (items.length === 0) {
        container.dataset.insertAfterId = '';
        return;
    }
    
    const mouseY = e.clientY;
    let insertIdx = 0;
    for (let i = 0; i < items.length; i++) {
        const rect = items[i].getBoundingClientRect();
        if (mouseY < rect.top + rect.height / 2) {
            break;
        }
        insertIdx = i + 1;
    }
    
    items.forEach(item => item.classList.remove('drag-insert-before', 'drag-insert-after'));
    
    if (insertIdx < items.length) {
        items[insertIdx].classList.add('drag-insert-before');
    } else if (items.length > 0) {
        items[items.length - 1].classList.add('drag-insert-after');
    }
    
    const afterId = insertIdx > 0 ? items[insertIdx - 1].id.replace('history-', '') : '';
    container.dataset.insertAfterId = afterId;
}

function handleHistoryDragLeave(e) {
    const container = e.currentTarget;
    container.classList.remove('drag-over');
    container.querySelectorAll('.history-item').forEach(item => {
        item.classList.remove('drag-insert-before', 'drag-insert-after');
    });
}

async function handleHistoryDrop(e, targetDate) {
    if (!canEdit || !window.historyDragItem) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('drag-over');
    
    const entryId = window.historyDragItem;
    const target = e.currentTarget;
    const insertAfterId = target.dataset.insertAfterId;
    
    const draggedEntry = taskHistory.find(h => h.id === entryId);
    if (!draggedEntry) {
        window.historyDragItem = null;
        return;
    }
    
    const sourceDate = draggedEntry.changed_at;
    const taskId = draggedEntry.task_id;
    const subtaskId = draggedEntry.subtask_id;
    
    if (sourceDate === targetDate) {
        const taskIdNum = parseInt(taskId);
        const subtaskIdNum = subtaskId ? parseInt(subtaskId) : null;
        
        const allEntries = taskHistory.filter(h => 
            h.task_id === taskIdNum && h.changed_at === sourceDate
        ).sort((a, b) => a.order_index - b.order_index);
        
        const currentIdx = allEntries.findIndex(h => h.id === entryId);
        
        let targetIdx = 0;
        if (insertAfterId) {
            const afterIdx = allEntries.findIndex(h => h.id === parseInt(insertAfterId));
            targetIdx = afterIdx >= 0 ? afterIdx + 1 : 0;
        }
        
        if (targetIdx < 0) targetIdx = 0;
        
        if (currentIdx !== targetIdx && currentIdx >= 0) {
            const movedEntry = allEntries[currentIdx];
            const movedSubtaskId = movedEntry.subtask_id;
            const isCreation = movedEntry.change_type === 'creation';
            
            let newOrder;
            
            const movedGroup = allEntries.filter(h => {
                if (movedSubtaskId === null || movedSubtaskId === undefined) {
                    return h.subtask_id === null || h.subtask_id === undefined;
                }
                return h.subtask_id === movedSubtaskId;
            });
            
            const otherEntries = allEntries.filter(h => {
                if (movedSubtaskId === null || movedSubtaskId === undefined) {
                    return !(h.subtask_id === null || h.subtask_id === undefined);
                }
                return h.subtask_id !== movedSubtaskId;
            });
            
            if (subtaskIdNum !== null) {
                let insertAt = targetIdx;
                
                if (targetIdx < allEntries.length) {
                    const targetEntry = allEntries[targetIdx];
                    const targetSubtaskId = targetEntry.subtask_id;
                    
                    if (targetEntry.change_type === 'creation' || isCreation) {
                        const targetGroupStart = otherEntries.findIndex(h => {
                            if (targetSubtaskId === null || targetSubtaskId === undefined) {
                                return h.subtask_id === null || h.subtask_id === undefined;
                            }
                            return h.subtask_id === targetSubtaskId;
                        });
                        if (targetGroupStart >= 0) {
                            const targetGroup = otherEntries.filter(h => {
                                if (targetSubtaskId === null || targetSubtaskId === undefined) {
                                    return h.subtask_id === null || h.subtask_id === undefined;
                                }
                                return h.subtask_id === targetSubtaskId;
                            });
                            insertAt = targetGroupStart + targetGroup.length;
                        }
                    }
                }
                
                insertAt = Math.min(insertAt, otherEntries.length);
                otherEntries.splice(insertAt, 0, ...movedGroup);
                newOrder = otherEntries;
            } else {
                const [moved] = allEntries.splice(currentIdx, 1);
                allEntries.splice(targetIdx, 0, moved);
                newOrder = allEntries;
            }
            
            const updates = newOrder.map((h, i) => 
                sbClient.from('task_history').update({ order_index: i }).eq('id', h.id)
            );
            await Promise.all(updates);
        }
    } else {
        const taskIdNum = parseInt(taskId);
        
        const creationEntry = taskHistory.find(h => 
            h.task_id === taskIdNum && h.subtask_id === subtaskId && h.change_type === 'creation'
        );
        
        if (creationEntry) {
            const creationDate = new Date(creationEntry.changed_at);
            const targetDateObj = new Date(targetDate);
            
            if (targetDateObj < creationDate) {
                const updates = [];
                updates.push(sbClient.from('task_history').update({ changed_at: targetDate, order_index: 0 }).eq('id', creationEntry.id));
                updates.push(sbClient.from('task_history').update({ changed_at: targetDate, order_index: 1 }).eq('id', entryId));
                
                const otherTargetEntries = taskHistory.filter(h => 
                    h.task_id === taskIdNum && h.subtask_id === subtaskId && h.changed_at === targetDate && h.id !== entryId && h.id !== creationEntry.id
                );
                otherTargetEntries.forEach((h, i) => {
                    updates.push(sbClient.from('task_history').update({ order_index: i + 2 }).eq('id', h.id));
                });
                
                const sourceEntries = taskHistory.filter(h => 
                    h.task_id === taskIdNum && h.subtask_id === subtaskId && h.changed_at === sourceDate
                );
                sourceEntries.forEach((h, i) => {
                    updates.push(sbClient.from('task_history').update({ order_index: i }).eq('id', h.id));
                });
                
                await Promise.all(updates);
            } else {
                const targetEntries = taskHistory.filter(h => 
                    h.task_id === taskIdNum && h.changed_at === targetDate
                ).sort((a, b) => a.order_index - b.order_index);
                
                const movedEntry = taskHistory.find(h => h.id === entryId);
                const movedSubtaskId = movedEntry ? movedEntry.subtask_id : null;
                const isCreation = movedEntry && movedEntry.change_type === 'creation';
                
                const movedGroup = taskHistory.filter(h => {
                    if (movedSubtaskId === null || movedSubtaskId === undefined) {
                        return h.task_id === taskIdNum && (h.subtask_id === null || h.subtask_id === undefined) && h.changed_at === sourceDate;
                    }
                    return h.task_id === taskIdNum && h.subtask_id === movedSubtaskId && h.changed_at === sourceDate;
                }).sort((a, b) => a.order_index - b.order_index);
                
                const otherSourceEntries = taskHistory.filter(h => 
                    h.task_id === taskIdNum && h.changed_at === sourceDate && 
                    !movedGroup.some(m => m.id === h.id)
                ).sort((a, b) => a.order_index - b.order_index);
                
                let insertIdx = 0;
                if (insertAfterId) {
                    const afterIdx = targetEntries.findIndex(h => h.id === parseInt(insertAfterId));
                    insertIdx = afterIdx >= 0 ? afterIdx + 1 : 0;
                }
                
                let finalInsertIdx = insertIdx;
                if (targetEntries.length > 0 && insertIdx < targetEntries.length) {
                    const targetEntry = targetEntries[insertIdx];
                    const targetSubtaskId = targetEntry.subtask_id;
                    
                    if (targetEntry.change_type === 'creation' || isCreation) {
                        const groupStart = targetEntries.findIndex(h => {
                            if (targetSubtaskId === null || targetSubtaskId === undefined) {
                                return h.subtask_id === null || h.subtask_id === undefined;
                            }
                            return h.subtask_id === targetSubtaskId;
                        });
                        if (groupStart >= 0) {
                            const groupLen = targetEntries.filter(h => {
                                if (targetSubtaskId === null || targetSubtaskId === undefined) {
                                    return h.subtask_id === null || h.subtask_id === undefined;
                                }
                                return h.subtask_id === targetSubtaskId;
                            }).length;
                            finalInsertIdx = groupStart + groupLen;
                        }
                    }
                }
                
                finalInsertIdx = Math.min(finalInsertIdx, targetEntries.length);
                
                const newTargetOrder = [...targetEntries];
                newTargetOrder.splice(finalInsertIdx, 0, ...movedGroup.map(h => ({ ...h, changed_at: targetDate })));
                
                const updates = newTargetOrder.map((h, i) => 
                    sbClient.from('task_history').update({ changed_at: targetDate, order_index: i }).eq('id', h.id)
                );
                
                otherSourceEntries.forEach((h, i) => {
                    updates.push(sbClient.from('task_history').update({ order_index: i }).eq('id', h.id));
                });
                
                await Promise.all(updates);
            }
        } else {
            const targetEntries = taskHistory.filter(h => 
                h.task_id === taskIdNum && h.subtask_id === subtaskId && h.changed_at === targetDate
            ).sort((a, b) => a.order_index - b.order_index);
            
            let insertIdx = 0;
            if (insertAfterId) {
                const afterIdx = targetEntries.findIndex(h => h.id === parseInt(insertAfterId));
                insertIdx = afterIdx >= 0 ? afterIdx + 1 : 0;
            }
            
            const sourceEntries = taskHistory.filter(h => 
                h.task_id === taskIdNum && h.subtask_id === subtaskId && h.changed_at === sourceDate && h.id !== entryId
            ).sort((a, b) => a.order_index - b.order_index);
            
            const newOrder = [...targetEntries];
            newOrder.splice(insertIdx, 0, { id: entryId });
            
            const updates = newOrder.map((h, i) => {
                if (h.id === entryId) {
                    return sbClient.from('task_history').update({ changed_at: targetDate, order_index: i }).eq('id', entryId);
                }
                return sbClient.from('task_history').update({ changed_at: targetDate, order_index: i }).eq('id', h.id);
            });
            
            sourceEntries.forEach((h, i) => {
                updates.push(sbClient.from('task_history').update({ order_index: i }).eq('id', h.id));
            });
            
            await Promise.all(updates);
        }
    }
    
    await loadTaskHistory();
    applyCurrentStateFromHistory(taskId, subtaskId);
    
    window.historyDragItem = null;
    delete target.dataset.insertAfterId;
}

async function applyCurrentStateFromHistory(taskId, subtaskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    const taskEntries = taskHistory.filter(e => e.task_id === taskId && e.subtask_id === subtaskId);
    taskEntries.sort((a, b) => {
        const dateCompare = new Date(b.changed_at) - new Date(a.changed_at);
        if (dateCompare !== 0) return dateCompare;
        return b.order_index - a.order_index;
    });
    
    if (taskEntries.length === 0) return;
    
    const latestEntry = taskEntries[0];
    
    if (!subtaskId) {
        if (latestEntry.change_type === 'status' || latestEntry.change_type === 'creation') {
            await changeTaskStatusDirect(taskId, latestEntry.new_status || 'queue');
        }
        if (latestEntry.change_type === 'priority' || latestEntry.change_type === 'creation') {
            await changeTaskPriorityDirect(taskId, latestEntry.new_priority || 'medium');
        }
        if (latestEntry.change_type === 'assignee' || latestEntry.change_type === 'creation') {
            const assignees = latestEntry.new_assignees ? latestEntry.new_assignees.split(',').filter(a => a) : [];
            await updateTaskAssigneesDirect(taskId, assignees);
        }
    } else {
        if (latestEntry.change_type === 'status' || latestEntry.change_type === 'creation') {
            await changeSubtaskStatusDirect(taskId, subtaskId, latestEntry.new_status || 'queue');
        }
        if (latestEntry.change_type === 'priority' || latestEntry.change_type === 'creation') {
            await changeSubtaskPriorityDirect(taskId, subtaskId, latestEntry.new_priority || 'medium');
        }
        if (latestEntry.change_type === 'assignee' || latestEntry.change_type === 'creation') {
            const assignees = latestEntry.new_assignees ? latestEntry.new_assignees.split(',').filter(a => a) : [];
            await updateSubtaskAssigneesDirect(taskId, subtaskId, assignees);
        }
    }
}

async function handleHistoryDateChange(e, entryId) {
    if (!canEdit) return;
    const newDate = e.target.value;
    const entry = taskHistory.find(h => h.id === entryId);
    if (!entry) return;
    const oldDate = entry.changed_at;
    const oldOrder = entry.order_index;
    const entriesOnNewDate = taskHistory.filter(h => h.changed_at === newDate && h.id !== entryId);
    const newOrder = entriesOnNewDate.length;
    
    await sbClient.from('task_history').update({ changed_at: newDate, order_index: newOrder }).eq('id', entryId);
    await loadTaskHistory();
    
    if (oldDate !== newDate) {
        await applyCurrentStateFromHistory(entry.task_id, entry.subtask_id);
    }
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await login(document.getElementById('loginEmail').value, document.getElementById('loginPassword').value); }
    catch (err) { showToast(err.message, 'error'); }
});

document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await register(document.getElementById('registerEmail').value, document.getElementById('registerPassword').value); }
    catch (err) { showToast(err.message, 'error'); }
});

document.getElementById('taskForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('taskId').value;
    const task = tasks.find(t => t.id == id);
    await saveTask({
        id: id ? parseInt(id) : null,
        title: document.getElementById('taskTitle').value,
        color: document.getElementById('taskColor').value || null,
        priority: getSelectedBadgeValue('taskPrioritySelect'),
        status: getSelectedBadgeValue('taskStatusSelect'),
        assignees: getSelectedAssignees('taskAssigneesSelect'),
        subtasks: task ? task.subtasks : []
    });
    closeModal();
});

document.getElementById('subtaskForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const taskId = parseInt(document.getElementById('subtaskTaskId').value);
    const subtaskId = document.getElementById('subtaskId').value;
    const parentId = document.getElementById('subtaskParentId').value;
    await saveSubtask(taskId, {
        id: subtaskId ? parseInt(subtaskId) : null,
        parentId: parentId ? parseInt(parentId) : null,
        title: document.getElementById('subtaskTitle').value,
        priority: getSelectedBadgeValue('subtaskPrioritySelect'),
        status: getSelectedBadgeValue('subtaskStatusSelect'),
        assignees: getSelectedAssignees('subtaskAssigneesSelect')
    });
    closeSubtaskModal();
});

document.addEventListener('click', (e) => {
    const filterOption = e.target.closest('.filter-option');
    if (filterOption) {
        const checkbox = filterOption.querySelector('input[type="checkbox"]');
        if (checkbox && !e.target.closest('input[type="checkbox"]')) {
            checkbox.checked = !checkbox.checked;
            checkbox.dispatchEvent(new Event('change'));
        }
    }
});

document.addEventListener('click', (e) => {
    if (!e.target.closest('.filter-dropdown')) {
        document.querySelectorAll('.filter-dropdown-content').forEach(d => d.classList.remove('active'));
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    }
});

document.addEventListener('click', (e) => {
    const modal = e.target.closest('.modal');
    if (modal && !e.target.closest('.modal-content')) {
        modal.classList.remove('active');
    }
});

function handleTaskDragStart(e, taskId) { 
    if (!canEdit) return; 
    draggedItem = { type: 'task', taskId }; 
    e.currentTarget.classList.add('dragging'); 
}

function handleSubtaskDragStart(e, taskId, subtaskId) { 
    if (!canEdit) return; 
    e.stopPropagation();
    draggedItem = { type: 'subtask', taskId, subtaskId }; 
    e.currentTarget.classList.add('dragging'); 
}

function handleDragEnd(e) { 
    if (e.currentTarget) e.currentTarget.classList.remove('dragging'); 
    draggedItem = null;
    document.querySelectorAll('.kanban-column').forEach(c => c.classList.remove('drag-over')); 
}

function handleDragOver(e) { if (!canEdit) return; e.preventDefault(); e.currentTarget.classList.add('drag-over'); }
function handleDragLeave(e) { e.currentTarget.classList.remove('drag-over'); }

async function handleDrop(e, status) { 
    if (!canEdit) return; 
    e.preventDefault(); 
    e.currentTarget.classList.remove('drag-over'); 
    
    if (draggedItem) {
        if (draggedItem.type === 'task') {
            await updateTaskStatus(draggedItem.taskId, status);
        } else if (draggedItem.type === 'subtask') {
            await updateSubtaskStatus(draggedItem.taskId, draggedItem.subtaskId, status);
        }
        draggedItem = null;
    }
}

function isDescendant(source, targetTaskId, targetSubtaskId) {
    if (source.type === 'task') {
        const sourceTask = tasks.find(t => t.id === source.taskId);
        if (!sourceTask) return false;
        
        if (!targetSubtaskId && targetTaskId === source.taskId) {
            return true;
        }
        
        if (targetSubtaskId) {
            return findSubtaskById(sourceTask.subtasks, targetSubtaskId) !== null;
        }
        return false;
    }
    
    if (source.type === 'subtask') {
        const sourceTask = tasks.find(t => t.id === source.taskId);
        if (!sourceTask) return false;
        
        const sourceSub = findSubtaskById(sourceTask.subtasks, source.subtaskId);
        if (!sourceSub) return false;
        
        if (targetSubtaskId) {
            return findSubtaskById(sourceSub.children || sourceSub.subtasks || [], targetSubtaskId) !== null;
        }
        return false;
    }
    return false;
}

async function handleDropAsSubtask(targetTaskId, targetSubtaskId) {
    const source = listDragItem;
    if (!source) return;

    const targetTask = tasks.find(t => t.id === targetTaskId);
    if (!targetTask) {
        listDragItem = null;
        return;
    }

    let sourceSubtask = null;
    
    if (source.type === 'task') {
        const sourceTask = tasks.find(t => t.id === source.taskId);
        if (!sourceTask) {
            listDragItem = null;
            return;
        }
        sourceSubtask = {
            id: sourceTask.id,
            title: sourceTask.title,
            priority: sourceTask.priority || 'medium',
            status: sourceTask.status,
            assignees: sourceTask.assignees || [],
            color: sourceTask.color,
            children: sourceTask.subtasks || []
        };
        tasks.splice(tasks.indexOf(sourceTask), 1);
    } else if (source.type === 'subtask') {
        const sourceTask = tasks.find(t => t.id === source.taskId);
        if (!sourceTask) {
            listDragItem = null;
            return;
        }
        sourceSubtask = findAndRemoveSubtask(sourceTask.subtasks, source.subtaskId);
        if (!sourceSubtask) {
            listDragItem = null;
            return;
        }
    }

    if (targetSubtaskId) {
        const targetSub = findSubtaskById(targetTask.subtasks, targetSubtaskId);
        if (targetSub) {
            targetSub.children = targetSub.children || [];
            targetSub.children.push(sourceSubtask);
        }
    } else {
        targetTask.subtasks = targetTask.subtasks || [];
        targetTask.subtasks.push(sourceSubtask);
    }

    targetTask.subtasks = normalizeSubtasksTree(targetTask.subtasks);
    if (hasSubtasks(targetTask)) {
        targetTask.status = calculateTaskStatus(targetTask.subtasks);
        targetTask.assignees = calculateTaskAssignees(targetTask.subtasks);
    }

    await sbClient.from('tasks').update({
        subtasks: JSON.stringify(targetTask.subtasks),
        status: targetTask.status,
        assignees: targetTask.assignees.join(',')
    }).eq('id', targetTaskId);

    if (source.type === 'task') {
        await sbClient.from('tasks').delete().eq('id', source.taskId);
    } else if (source.type === 'subtask') {
        const sourceTask = tasks.find(t => t.id === source.taskId);
        if (sourceTask) {
            sourceTask.subtasks = normalizeSubtasksTree(sourceTask.subtasks);
            if (hasSubtasks(sourceTask)) {
                sourceTask.status = calculateTaskStatus(sourceTask.subtasks);
                sourceTask.assignees = calculateTaskAssignees(sourceTask.subtasks);
            }
            await sbClient.from('tasks').update({
                subtasks: JSON.stringify(sourceTask.subtasks),
                status: sourceTask.status,
                assignees: sourceTask.assignees.join(',')
            }).eq('id', source.taskId);
        }
    }

    listDragItem = null;
    renderTasks();
}

function handleListTaskDragStart(e, taskId) {
    if (!canEdit) return;
    e.stopPropagation();
    listDragItem = { type: 'task', taskId };
    e.currentTarget.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', 'task-' + taskId);
}

function handleListSubtaskDragStart(e, taskId, subtaskId) {
    if (!canEdit) return;
    e.stopPropagation();
    listDragItem = { type: 'subtask', taskId, subtaskId };
    e.currentTarget.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', 'subtask-' + subtaskId);
}

function handleListDragEnd(e) {
    if (e.currentTarget) e.currentTarget.classList.remove('dragging');
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    listDragItem = null;
}

function handleListDragOver(e, targetTaskId, targetSubtaskId, hasSubtasks) {
    if (!canEdit || !listDragItem) return;
    e.preventDefault();
    e.stopPropagation();

    const target = e.currentTarget;
    const rect = target.getBoundingClientRect();
    const height = rect.height;
    
    const topThird = rect.top + height / 3;
    const bottomThird = rect.top + 2 * height / 3;
    const mouseY = e.clientY;
    
    let insertType, insertBefore;
    
    if (mouseY < topThird) {
        insertType = 'before';
        insertBefore = true;
    } else if (mouseY > bottomThird) {
        insertType = 'after';
        insertBefore = false;
    } else {
        insertType = 'child';
        insertBefore = true;
    }
    
    target.classList.remove('drag-insert-before', 'drag-insert-after', 'drop-target', 'drag-over');
    
    const isSameItem = (listDragItem.type === 'task' && String(listDragItem.taskId) === String(targetTaskId)) ||
                       (listDragItem.type === 'subtask' && String(listDragItem.subtaskId) === String(targetSubtaskId));
    
    const isChild = isDescendant(listDragItem, targetTaskId, targetSubtaskId);
    
    if (isSameItem || isChild) {
        target.classList.remove('drag-insert-before', 'drag-insert-after', 'drop-target', 'drag-over');
        return;
    }

    if (insertType === 'child') {
        target.classList.add('drop-target');
    } else if (insertType === 'before') {
        target.classList.add('drag-insert-before');
    } else if (insertType === 'after') {
        target.classList.add('drag-insert-after');
    }
    
    target.dataset.insertType = insertType;
    target.dataset.insertBefore = insertBefore ? 'true' : 'false';
    target.dataset.targetTaskId = targetTaskId;
    target.dataset.targetSubtaskId = targetSubtaskId || '';
}

function handleListDragLeave(e) {
    e.currentTarget.classList.remove('drag-insert-before', 'drag-insert-after', 'drop-target', 'drag-over');
}

function handleListDragEnd(e) {
    if (e.currentTarget) e.currentTarget.classList.remove('dragging');
    document.querySelectorAll('.drag-insert-before, .drag-insert-after, .drop-target, .drag-over').forEach(el => {
        el.classList.remove('drag-insert-before', 'drag-insert-after', 'drop-target', 'drag-over');
    });
    listDragItem = null;
}

async function handleListDrop(e, targetTaskId, targetSubtaskId) {
    if (!canEdit || !listDragItem) return;
    e.preventDefault();
    e.stopPropagation();

    const target = e.currentTarget;
    const insertType = target.dataset.insertType || 'before';
    const insertBefore = target.dataset.insertBefore === 'true';
    const tgtTaskId = parseInt(target.dataset.targetTaskId);
    const tgtSubtaskId = target.dataset.targetSubtaskId ? parseInt(target.dataset.targetSubtaskId) : null;
    
    target.classList.remove('drag-insert-before', 'drag-insert-after', 'drop-target', 'drag-over');

    const source = listDragItem;
    const sourceTask = tasks.find(t => t.id === source.taskId);
    if (!sourceTask) {
        listDragItem = null;
        return;
    }

    const targetTask = tasks.find(t => t.id === tgtTaskId);
    if (!targetTask) {
        listDragItem = null;
        return;
    }

    let sourceElement = null;
    if (source.type === 'task') {
        const sourceIndex = tasks.findIndex(t => t.id === source.taskId);
        if (sourceIndex === -1) {
            listDragItem = null;
            return;
        }
        sourceElement = tasks.splice(sourceIndex, 1)[0];
    } else if (source.type === 'subtask') {
        sourceElement = findAndRemoveSubtask(sourceTask.subtasks, source.subtaskId);
        if (!sourceElement) {
            listDragItem = null;
            return;
        }
        sourceTask.subtasks = normalizeSubtasksTree(sourceTask.subtasks);
        if (hasSubtasks(sourceTask)) {
            sourceTask.status = calculateTaskStatus(sourceTask.subtasks);
            sourceTask.assignees = calculateTaskAssignees(sourceTask.subtasks);
        }
        await sbClient.from('tasks').update({
            subtasks: JSON.stringify(sourceTask.subtasks),
            status: sourceTask.status,
            assignees: sourceTask.assignees.join(',')
        }).eq('id', source.taskId);
    }

    if (insertType === 'child') {
        if (tgtSubtaskId) {
            const targetSub = findSubtaskById(targetTask.subtasks, tgtSubtaskId);
            if (targetSub) {
                targetSub.children = targetSub.children || [];
                targetSub.children.unshift(sourceElement);
            }
        } else {
            targetTask.subtasks = targetTask.subtasks || [];
            targetTask.subtasks.unshift(sourceElement);
        }

        targetTask.subtasks = normalizeSubtasksTree(targetTask.subtasks);
        if (hasSubtasks(targetTask)) {
            targetTask.status = calculateTaskStatus(targetTask.subtasks);
            targetTask.assignees = calculateTaskAssignees(targetTask.subtasks);
        }

        await sbClient.from('tasks').update({
            subtasks: JSON.stringify(targetTask.subtasks),
            status: targetTask.status,
            assignees: targetTask.assignees.join(',')
        }).eq('id', tgtTaskId);

        if (source.type === 'task') {
            await sbClient.from('tasks').delete().eq('id', source.taskId);
        }
    }
    else {
        if (tgtSubtaskId) {
            const result = findSubtaskParentArray(targetTask.subtasks, tgtSubtaskId);
            if (result) {
                const targetIndexInArray = insertBefore ? result.index : result.index + 1;
                
                if (source.type === 'task') {
                    const newSubtask = {
                        id: sourceElement.id,
                        title: sourceElement.title,
                        priority: sourceElement.priority || 'medium',
                        status: sourceElement.status,
                        assignees: sourceElement.assignees || [],
                        color: sourceElement.color,
                        children: sourceElement.subtasks || []
                    };
                    result.array.splice(targetIndexInArray, 0, newSubtask);
                    
                    await sbClient.from('tasks').delete().eq('id', source.taskId);
                } else {
                    result.array.splice(targetIndexInArray, 0, sourceElement);
                }

                targetTask.subtasks = normalizeSubtasksTree(targetTask.subtasks);
                if (hasSubtasks(targetTask)) {
                    targetTask.status = calculateTaskStatus(targetTask.subtasks);
                    targetTask.assignees = calculateTaskAssignees(targetTask.subtasks);
                }

                await sbClient.from('tasks').update({
                    subtasks: JSON.stringify(targetTask.subtasks),
                    status: targetTask.status,
                    assignees: targetTask.assignees.join(',')
                }).eq('id', tgtTaskId);
            }
        }
        else {
            if (source.type === 'task') {
                let targetIndex = tasks.findIndex(t => t.id === tgtTaskId);
                if (targetIndex === -1) {
                    listDragItem = null;
                    return;
                }
                if (insertBefore) {
                    tasks.splice(targetIndex, 0, sourceElement);
                } else {
                    tasks.splice(targetIndex + 1, 0, sourceElement);
                }
                await saveTaskOrder();
            }
            else {
                const newTask = {
                    title: sourceElement.title,
                    priority: sourceElement.priority || 'medium',
                    status: sourceElement.status || 'queue',
                    assignees: sourceElement.assignees || [],
                    color: sourceElement.color,
                    subtasks: sourceElement.children || [],
                    order_index: 0
                };

                let targetIndex = tasks.findIndex(t => t.id === tgtTaskId);
                if (targetIndex === -1) {
                    targetIndex = 0;
                }

                if (insertBefore) {
                    tasks.splice(targetIndex, 0, newTask);
                } else {
                    tasks.splice(targetIndex + 1, 0, newTask);
                }

                const { data, error } = await sbClient.from('tasks').insert([{
                    title: newTask.title,
                    priority: newTask.priority,
                    status: newTask.status,
                    assignees: newTask.assignees.join(','),
                    color: newTask.color,
                    subtasks: JSON.stringify(newTask.subtasks),
                    order_index: 0
                }]).select();

                if (error) {
                    console.error(error);
                    showToast('Ошибка при создании задачи', 'error');
                    tasks.splice(insertBefore ? targetIndex : targetIndex + 1, 1);
                } else if (data && data[0]) {
                    const insertedTask = tasks[insertBefore ? targetIndex : targetIndex + 1];
                    insertedTask.id = data[0].id;
                }

                await saveTaskOrder();
            }
        }
    }

    listDragItem = null;
    renderTasks();
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

async function saveTaskOrder() {
    const orderUpdates = tasks.map((task, index) => {
        return sbClient.from('tasks').update({ order_index: index }).eq('id', task.id);
    });
    await Promise.all(orderUpdates);
    renderTasks();
}

function showToast(msg, type = 'info') {
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}
