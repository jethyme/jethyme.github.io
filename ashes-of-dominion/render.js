function renderAssigneeTags(ids, taskId = null, subtaskId = null, canEdit = false) {
    return (ids || []).map((id, index) => {
        const a = assignees.find(x => x.id == id);
        const name = a ? a.name : id;
        const displayName = getShortName(name);
        const color = resolveAssigneeColor(a || { id: id, name: name }, index);
        const textColor = getContrastColor(color);
        const clickable = canEdit ? ' clickable-badge' : '';
        const dataAttrs = canEdit && taskId ? ` data-type="assignee" data-task-id="${taskId}" data-subtask="${subtaskId || ''}" data-value="${(ids || []).join(',')}"` : '';
        return '<span class="assignee-tag' + clickable + '"' + dataAttrs + ' style="background:' + color + ';color:' + textColor + ';">' + displayName + '</span>';
    }).join('');
}

function renderAssigneeCell(ids, taskId, subtaskId, canEditFlag) {
    const tags = renderAssigneeTags(ids, taskId, subtaskId, canEditFlag);
    const currentValue = (ids || []).join(',');
    if (!canEditFlag) {
        return '<div class="assignees-list">' + tags + '</div>';
    }
    const placeholder = '<span class="assignee-placeholder clickable-badge" data-type="assignee" data-task-id="' + taskId + '" data-subtask="' + (subtaskId || '') + '" data-value="' + currentValue + '">&#10010;</span>';
    if (ids && ids.length > 0) {
        return '<div class="assignees-list clickable" data-task-id="' + taskId + '" data-subtask-id="' + (subtaskId || '') + '">' + tags + placeholder + '</div>';
    }
    return '<div class="assignees-list clickable" data-task-id="' + taskId + '" data-subtask-id="' + (subtaskId || '') + '">' + placeholder + '</div>';
}

function renderAssigneeBadge(ids) {
    const count = (ids || []).length;
    if (count === 0) {
        return '<span class="assignee-badge" data-type="assignee" data-value="">+</span>';
    }
    const firstNames = (ids || []).slice(0, 2).map(id => {
        const a = assignees.find(x => x.id == id);
        return a ? getShortName(a.name) : id;
    }).join(', ');
    const suffix = count > 2 ? ' +' + (count - 2) : '';
    return '<span class="assignee-badge" data-type="assignee" data-value="' + ids.join(',') + '">' + firstNames + suffix + '</span>';
}

function renderPriorityBadge(taskId, currentPriority, isSubtask, parentTaskId) {
    if (isSubtask) {
        return '<span class="clickable-badge priority-' + (currentPriority || 'medium') + '" data-type="priority" data-task-id="' + parentTaskId + '" data-subtask="' + taskId + '" data-value="' + (currentPriority || 'medium') + '">' + PRIORITY_LABELS[currentPriority || 'medium'] + '</span>';
    } else {
        return '<span class="clickable-badge priority-' + (currentPriority || 'medium') + '" data-type="priority" data-task-id="' + taskId + '" data-value="' + (currentPriority || 'medium') + '">' + PRIORITY_LABELS[currentPriority || 'medium'] + '</span>';
    }
}

function renderStatusBadge(taskId, currentStatus, isSubtask, parentTaskId) {
    if (isSubtask) {
        return '<span class="clickable-badge status-' + (currentStatus || 'queue') + '" data-type="status" data-task-id="' + parentTaskId + '" data-subtask="' + taskId + '" data-value="' + (currentStatus || 'queue') + '">' + STATUS_LABELS[currentStatus || 'queue'] + '</span>';
    } else {
        return '<span class="clickable-badge status-' + (currentStatus || 'queue') + '" data-type="status" data-task-id="' + taskId + '" data-value="' + (currentStatus || 'queue') + '">' + STATUS_LABELS[currentStatus || 'queue'] + '</span>';
    }
}

function renderAssigneesSelect(containerId = 'taskAssigneesSelect', selectedIds = []) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = assignees.map((a, idx) => {
        const isSelected = selectedIds.includes(String(a.id));
        const color = resolveAssigneeColor(a, idx);
        return `<span class="badge-option ${isSelected ? 'selected' : ''}" 
            style="background: ${color}; color: #fff;"
            onclick="toggleAssigneeBadge(this, '${a.id}')" data-value="${a.id}">
            ${a.name}
            <span class="check">&#10003;</span>
        </span>`;
    }).join('');
}

function toggleAssigneeBadge(element, assigneeId) {
    element.classList.toggle('selected');
}

function getSelectedAssignees(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return [];
    return Array.from(container.querySelectorAll('.selected')).map(el => el.dataset.value);
}

function renderBadgeSelector(containerId, type, selectedValue) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const items = type === 'priority' ? PRIORITY_ORDER : STATUS_LIST;
    const labels = type === 'priority' ? PRIORITY_LABELS : STATUS_LABELS;
    
    container.innerHTML = items.map(item => {
        const isSelected = selectedValue === item;
        return `<span class="badge-option ${type}-${item} ${isSelected ? 'selected' : ''}" 
            onclick="selectBadgeOption(this, '${type}')" data-value="${item}">
            ${labels[item]}
            <span class="check">&#10003;</span>
        </span>`;
    }).join('');
}

function selectBadgeOption(element, type) {
    const container = element.parentElement;
    container.querySelectorAll('.badge-option').forEach(el => el.classList.remove('selected'));
    element.classList.add('selected');
}

function getSelectedBadgeValue(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return '';
    const selected = container.querySelector('.badge-option.selected');
    return selected ? selected.dataset.value : '';
}

function renderAssigneesList() {
    document.getElementById('assigneesList').innerHTML = assignees.map((a, idx) => `
        <div class="assignee-item">
            <div class="assignee-item-name">
                <span class="assignee-color" style="background:${resolveAssigneeColor(a, idx)}" onclick="showColorPicker(event, ${a.id})" title="Выбрать цвет"></span>
                <span>${a.name}</span>
            </div>
            ${canEdit ? `<button class="btn-small btn-secondary" onclick="deleteAssignee(${a.id})">&#10005;</button>` : ''}
        </div>
    `).join('') || '<p style="color:#888;text-align:center">Нет исполнителей</p>';
}

function renderTaskColorPicker(selectedColor = '') {
    const container = document.getElementById('taskColorPicker');
    if (!container) return;
    container.innerHTML = TASK_COLORS.map(c => {
        const border = selectedColor === c ? '2px solid #fff' : '2px solid transparent';
        return '<span class="color-swatch" data-color="' + c + '" style="width:22px;height:22px;border-radius:4px;background:' + c + ';cursor:pointer;border:' + border + ';" onclick="selectTaskColor(\'' + c + '\', this)"></span>';
    }).join('');
}

function matchesFilters(task) {
    if (filterAssignee.length === 0 && filterPriority.length === 0 && filterStatus.length === 0) {
        return true;
    }

    const assigneeMatch = filterAssignee.length === 0 || filterAssignee.some(id => task.assignees.includes(String(id)));
    const priorityMatch = filterPriority.length === 0 || filterPriority.includes(task.priority);
    const statusMatch = filterStatus.length === 0 || filterStatus.includes(task.status);

    return assigneeMatch && priorityMatch && statusMatch;
}

function taskHasMatchingLeaf(task) {
    if (filterAssignee.length === 0 && filterPriority.length === 0 && filterStatus.length === 0) {
        return true;
    }

    const matchesLeaf = (node) => {
        const kids = node.children || node.subtasks || [];
        if (kids.length === 0) {
            const assigneeMatch = filterAssignee.length === 0 || filterAssignee.some(id => (node.assignees || []).includes(String(id)));
            const priorityMatch = filterPriority.length === 0 || filterPriority.includes(node.priority);
            const statusMatch = filterStatus.length === 0 || filterStatus.includes(node.status);
            return assigneeMatch && priorityMatch && statusMatch;
        }
        return kids.some(child => matchesLeaf(child));
    };

    if (!task.subtasks || task.subtasks.length === 0) {
        return matchesFilters(task);
    }

    return task.subtasks.some(sub => matchesLeaf(sub));
}

function filterSubtasks(subtasks) {
    if (filterAssignee.length === 0 && filterPriority.length === 0 && filterStatus.length === 0) {
        return subtasks;
    }

    const filterTree = (nodes) => {
        if (!nodes || nodes.length === 0) return [];

        const result = [];
        for (const node of nodes) {
            const hasChildren = node.children && node.children.length > 0;

            if (hasChildren) {
                const filteredChildren = filterTree(node.children);

                if (filteredChildren.length > 0) {
                    result.push({ ...node, children: filteredChildren });
                }
            } else {
                const assigneeMatch = filterAssignee.length === 0 || filterAssignee.some(id => (node.assignees || []).includes(String(id)));
                const priorityMatch = filterPriority.length === 0 || filterPriority.includes(node.priority);
                const statusMatch = filterStatus.length === 0 || filterStatus.includes(node.status);

                if (assigneeMatch && priorityMatch && statusMatch) {
                    result.push(node);
                }
            }
        }
        return result;
    };

    return filterTree(subtasks);
}

function renderTasks() {
    const container = document.getElementById('tasksContainer');
    if (!container) return;
    const filteredTasks = tasks.filter(taskHasMatchingLeaf);
    container.innerHTML = filteredTasks.map(task => renderTaskRow(task)).join('');
    renderKanban();
}

function renderTaskRow(task) {
    const assigneeIds = calculateNodeAssignees(task);
    const isExpanded = expandedTasks.has(task.id);
    const hasSubtasksFlag = hasSubtasks(task);
    const progressMeta = renderProgressMeta(task.subtasks);
    const taskColor = task.color || '';
    const rowStyleParts = [];
    if (taskColor) {
        rowStyleParts.push('border-left:4px solid ' + taskColor);
        rowStyleParts.push('background: ' + taskColor);
        rowStyleParts.push('color: ' + getContrastColor(taskColor));
    }
    const rowStyle = rowStyleParts.join(';');

    return `
        <div class="task-row" id="task-${task.id}" style="${rowStyle}" draggable="true" ondragstart="handleListTaskDragStart(event, ${task.id})" ondragend="handleListDragEnd(event)" ondragover="handleListDragOver(event, ${task.id}, null, ${hasSubtasksFlag})" ondrop="handleListDrop(event, ${task.id})" ondragleave="handleListDragLeave(event)">
            <div class="expand-btn" onclick="toggleTask(${task.id})" style="${hasSubtasksFlag ? '' : 'visibility:hidden'}">${hasSubtasksFlag ? (isExpanded ? '&#9660;' : '&#9654;') : ''}</div>
            <div class="task-title">${task.title}</div>
            <div>${canEdit ? renderPriorityBadge(task.id, task.priority || 'medium', false) : '<span class="priority-badge priority-' + (task.priority || 'medium') + '">' + PRIORITY_LABELS[task.priority || 'medium'] + '</span>'}</div>
            <div>${canEdit ? renderStatusBadge(task.id, task.status || 'queue', false) : '<span class="status-badge status-' + (task.status || 'queue') + '">' + STATUS_LABELS[task.status || 'queue'] + '</span>'}</div>
            <div>${renderAssigneeCell(assigneeIds, task.id, null, canEdit && !hasSubtasksFlag)}</div>
            <div class="task-actions">
                ${canEdit ? `<button class="btn-icon" onclick="openSubtaskModal(${task.id}, null, null)" title="Добавить подзадачу"><span class="icon-plus">&#10010;</span></button>` : ''}
                ${canEdit ? `<button class="btn-icon" onclick="editTask(${task.id})" title="Редактировать">&#9998;</button>` : ''}
                ${canEdit ? `<button class="btn-icon" onclick="deleteTask(${task.id})" title="Удалить">&#128465;</button>` : ''}
            </div>
        </div>
        <div class="task-subtasks" id="subtasks-${task.id}" style="display:${isExpanded ? 'block' : 'none'}">
            ${renderSubtaskTree(filterSubtasks(task.subtasks), task.id, 0, taskColor)}
        </div>
    `;
}

function renderSubtaskTree(subtasks, taskId, level, baseColor) {
    if (!subtasks || subtasks.length === 0) return '';
    return subtasks.map(sub => {
        const childNodes = sub.children || sub.subtasks || [];
        const hasChildren = childNodes.length > 0;
        const subAssignees = calculateNodeAssignees(sub);
        const isExpanded = expandedSubtasks.has(sub.id);
        const levelClass = 'level-' + Math.min(level, 3);
        const indent = level * 25;
        const derivedColor = baseColor ? deriveTaskColor(baseColor, level + 1) : '';
        const styleParts = [`padding-left:${indent + 15}px`];
        if (derivedColor) {
            styleParts.push('border-left:3px solid ' + derivedColor);
            styleParts.push('background: ' + derivedColor);
            styleParts.push('color: ' + getContrastColor(derivedColor));
        }
        const rowStyle = styleParts.join(';');

        return `
            <div class="subtask-item ${levelClass}" style="${rowStyle}" draggable="true" ondragstart="handleListSubtaskDragStart(event, ${taskId}, ${sub.id})" ondragend="handleListDragEnd(event)" ondragover="handleListDragOver(event, ${taskId}, ${sub.id}, ${hasChildren})" ondrop="handleListDrop(event, ${taskId}, ${sub.id})" ondragleave="handleListDragLeave(event)">
                <div class="expand-btn" onclick="toggleSubtask(${sub.id})">${hasChildren ? (isExpanded ? '&#9660;' : '&#9654;') : ''}</div>
                <div class="task-title"><div class="task-title-main">${sub.title}</div></div>
                <div>${canEdit ? renderPriorityBadge(sub.id, sub.priority || 'medium', true, taskId) : '<span class="priority-badge priority-' + (sub.priority || 'medium') + '">' + PRIORITY_LABELS[sub.priority || 'medium'] + '</span>'}</div>
                <div>${canEdit ? renderStatusBadge(sub.id, sub.status || 'queue', true, taskId) : '<span class="status-badge status-' + (sub.status || 'queue') + '">' + STATUS_LABELS[sub.status || 'queue'] + '</span>'}</div>
                <div>${renderAssigneeCell(subAssignees, taskId, sub.id, canEdit && !hasChildren)}</div>
                <div class="task-actions">
                    ${canEdit ? `<button class="btn-icon" onclick="openSubtaskModal(${taskId}, null, ${sub.id})" title="Добавить дочернюю"><span class="icon-plus">&#10010;</span></button>` : ''}
                    ${canEdit ? `<button class="btn-icon" onclick="openSubtaskModal(${taskId}, ${sub.id})" title="Редактировать">&#9998;</button>` : ''}
                    ${canEdit ? `<button class="btn-icon" onclick="deleteSubtask(${taskId}, ${sub.id})" title="Удалить">&#128465;</button>` : ''}
                </div>
            </div>
            ${isExpanded && hasChildren ? renderSubtaskTree(childNodes, taskId, level + 1, baseColor) : ''}
        `;
    }).join('');
}

function getFullBreadcrumb(rootTask, subtaskId) {
    const path = rootTask ? [rootTask.title] : [];
    
    if (!subtaskId || !rootTask) return path;
    
    const findPath = (nodes, currentPath) => {
        for (const node of nodes || []) {
            const newPath = [...currentPath, node.title];
            if (String(node.id) === String(subtaskId)) {
                return newPath;
            }
            const result = findPath(node.children || node.subtasks || [], newPath);
            if (result) return result;
        }
        return null;
    };
    
    const result = findPath(rootTask.subtasks || [], path);
    return result || path;
}

function findSubtaskById(rootTask, subtaskId) {
    if (!rootTask || !subtaskId) return null;
    const subtaskIdStr = String(subtaskId);
    
    const search = (nodes) => {
        for (const node of nodes || []) {
            if (String(node.id) === subtaskIdStr) {
                return node;
            }
            const found = search(node.children || node.subtasks || []);
            if (found) return found;
        }
        return null;
    };
    
    return search(rootTask.subtasks || []);
}

function shouldShowTask(task) {
    const checkLeaf = (node) => {
        const kids = node.children || node.subtasks || [];
        if (kids.length === 0) {
            const assigneeMatch = filterAssignee.length === 0 || filterAssignee.some(id => (node.assignees || []).includes(String(id)));
            const priorityMatch = filterPriority.length === 0 || filterPriority.includes(node.priority);
            return assigneeMatch && priorityMatch;
        }
        return kids.some(child => checkLeaf(child));
    };
    
    if (!task.subtasks || task.subtasks.length === 0) {
        return matchesFilters(task);
    }
    
    return task.subtasks.some(sub => checkLeaf(sub));
}

function shouldShowSubtask(subtask) {
    const hasChildren = (subtask.children || subtask.subtasks || []).length > 0;
    
    if (hasChildren) {
        const checkLeafDescendants = (node) => {
            const kids = node.children || node.subtasks || [];
            if (kids.length === 0) {
                const assigneeMatch = filterAssignee.length === 0 || filterAssignee.some(id => (node.assignees || []).includes(String(id)));
                const priorityMatch = filterPriority.length === 0 || filterPriority.includes(node.priority);
                return assigneeMatch && priorityMatch;
            }
            return kids.some(child => checkLeafDescendants(child));
        };
        return checkLeafDescendants(subtask);
    }
    
    const assigneeMatch = filterAssignee.length === 0 || filterAssignee.some(id => (subtask.assignees || []).includes(String(id)));
    const priorityMatch = filterPriority.length === 0 || filterPriority.includes(subtask.priority);
    return assigneeMatch && priorityMatch;
}

function renderKanban() {
    const columns = { queue: [], progress: [], review: [], done: [] };
    const showAllColumns = filterStatus.length === 0;

    tasks.filter(shouldShowTask).forEach(task => {
        const taskStatus = STATUS_ORDER.hasOwnProperty(task.status) ? task.status : 'queue';
        columns[taskStatus].push({ type: 'task', task: task });

        const collectSubtasks = (subtasks, rootTaskId, parentSubtaskId, depth) => {
            subtasks.forEach(sub => {
                if (!shouldShowSubtask(sub)) return;
                const subStatus = STATUS_ORDER.hasOwnProperty(sub.status) ? sub.status : 'queue';
                columns[subStatus].push({
                    type: 'subtask',
                    task: sub,
                    rootTaskId: rootTaskId,
                    parentSubtaskId: parentSubtaskId,
                    depth: depth
                });
                const kids = sub.children || sub.subtasks || [];
                if (kids.length > 0) collectSubtasks(kids, rootTaskId, sub.id, depth + 1);
            });
        };
        collectSubtasks(task.subtasks || [], task.id, null, 0);
    });

    Object.keys(columns).forEach(status => {
        const container = document.getElementById(status + 'Tasks');
        const column = container?.closest('.kanban-column');
        
        if (showAllColumns || filterStatus.includes(status)) {
            if (container) {
                container.innerHTML = renderKanbanColumn(columns[status]);
            }
            column?.classList.remove('hidden-column');
        } else {
            if (container) {
                container.innerHTML = '';
            }
            column?.classList.add('hidden-column');
        }
    });
}

function renderKanbanColumn(items) {
    const result = [];
    const consumedSubtasks = new Set();
    const subtasksByRoot = new Map();
    const taskIdsInColumn = new Set();
    const subtaskIdsInColumn = new Set();

    items.filter(i => i.type === 'task').forEach(t => {
        taskIdsInColumn.add(t.task.id);
    });
    items.filter(i => i.type === 'subtask').forEach(s => {
        subtaskIdsInColumn.add(s.task.id);
    });

    items.filter(i => i.type === 'subtask').forEach(sub => {
        const list = subtasksByRoot.get(sub.rootTaskId) || [];
        list.push(sub);
        subtasksByRoot.set(sub.rootTaskId, list);
    });

    items.filter(i => i.type === 'task').forEach(item => {
        const related = subtasksByRoot.get(item.task.id) || [];
        related.forEach(s => consumedSubtasks.add(s.task.id));
        result.push({ type: 'nested', task: item.task, subtasks: related });
    });

    const remainingSubtasks = items.filter(i =>
        i.type === 'subtask' && !consumedSubtasks.has(i.task.id)
    );

    remainingSubtasks.forEach(item => {
        if (consumedSubtasks.has(item.task.id)) return;

        const hasParentInColumn = item.parentSubtaskId ?
            subtaskIdsInColumn.has(item.parentSubtaskId) :
            taskIdsInColumn.has(item.rootTaskId);

        if (!hasParentInColumn) {
            const children = remainingSubtasks.filter(c =>
                String(c.parentSubtaskId) === String(item.task.id) && !consumedSubtasks.has(c.task.id)
            );

            if (children.length > 0) {
                const allDescendants = [];
                const collectDescendants = (parentId) => {
                    remainingSubtasks.filter(c => String(c.parentSubtaskId) === String(parentId) && !consumedSubtasks.has(c.task.id)).forEach(child => {
                        allDescendants.push(child);
                        consumedSubtasks.add(child.task.id);
                        collectDescendants(child.task.id);
                    });
                };
                collectDescendants(item.task.id);

                const rootTask = tasks.find(t => t.id === item.rootTaskId);
                const breadcrumb = getFullBreadcrumb(rootTask, item.task.id);

                result.push({
                    type: 'orphan-nested',
                    task: item.task,
                    subtasks: allDescendants,
                    rootTaskId: item.rootTaskId,
                    breadcrumb: breadcrumb,
                    orphanSubtaskId: item.task.id
                });

                consumedSubtasks.add(item.task.id);
            }
        }
    });

    const finalRemaining = items.filter(i =>
        i.type === 'subtask' && !consumedSubtasks.has(i.task.id)
    );

    const groupsByParent = new Map();
    const orphanSubtasksByRoot = new Map();

    finalRemaining.forEach(item => {
        const parentId = item.parentSubtaskId || item.rootTaskId;
        const hasParentInColumn = item.parentSubtaskId ?
            subtaskIdsInColumn.has(item.parentSubtaskId) :
            taskIdsInColumn.has(item.rootTaskId);

        if (!hasParentInColumn) {
            if (!groupsByParent.has(String(parentId))) {
                groupsByParent.set(String(parentId), []);
            }
            groupsByParent.get(String(parentId)).push(item);
        }
    });

    groupsByParent.forEach((groupItems, parentId) => {
        const rootTaskId = groupItems[0].rootTaskId;
        if (String(parentId) === String(rootTaskId)) {
            groupItems.forEach(item => {
                if (!consumedSubtasks.has(item.task.id)) {
                    if (!orphanSubtasksByRoot.has(rootTaskId)) {
                        orphanSubtasksByRoot.set(rootTaskId, []);
                    }
                    orphanSubtasksByRoot.get(rootTaskId).push(item);
                    consumedSubtasks.add(item.task.id);
                }
            });
            return;
        }

        const rootTask = tasks.find(t => t.id === rootTaskId);
        const breadcrumb = getFullBreadcrumb(rootTask, parentId);
        const realSubtask = findSubtaskById(rootTask, parentId);

        const children = [];
        const collectChildren = (pId) => {
            groupItems.filter(i => String(i.parentSubtaskId) === String(pId)).forEach(item => {
                children.push(item);
                consumedSubtasks.add(item.task.id);
                collectChildren(item.task.id);
            });
        };
        collectChildren(parentId);

        const displayTitle = breadcrumb[breadcrumb.length - 1] || 'Подзадача';
        result.push({
            type: 'orphan-nested',
            task: realSubtask || { title: displayTitle, id: parentId },
            subtasks: children,
            rootTaskId: rootTaskId,
            breadcrumb: breadcrumb,
            orphanSubtaskId: parseInt(parentId)
        });

        children.forEach(c => consumedSubtasks.add(c.task.id));
    });

    orphanSubtasksByRoot.forEach((items, rootId) => {
        const rootTask = tasks.find(t => t.id === rootId);
        if (rootTask) {
            result.push({
                type: 'task-as-subtask',
                task: rootTask,
                subtasks: items,
                rootTaskId: rootId,
                breadcrumb: []
            });
        }
    });

    finalRemaining.forEach(item => {
        if (!consumedSubtasks.has(item.task.id)) {
            result.push({ type: 'subtask', item: item });
        }
    });

    const html = result.map(entry => {
        if (entry.type === 'nested') return renderKanbanNested(entry.task, entry.subtasks, null);
        if (entry.type === 'task') return renderKanbanCard(entry.task, null, 0);
        if (entry.type === 'task-as-subtask') return renderKanbanTaskAsSubtask(entry.task, entry.subtasks, entry.rootTaskId);
        if (entry.type === 'orphan-nested') {
            return renderKanbanCardWithChildren(entry.task, entry.subtasks, entry.rootTaskId, entry.breadcrumb, entry.orphanSubtaskId);
        }
        return renderKanbanCard(entry.item.task, entry.item.rootTaskId, entry.item.depth, entry.item.parentSubtaskId);
    }).join('');

    return html ? '<div class="kanban-column-content">' + html + '</div>' : '<div class="kanban-empty">Пусто</div>';
}

function renderKanbanCard(task, rootTaskId, depth, parentSubtaskId = null) {
    const assigneeIds = task.assignees || [];

    const isTask = !rootTaskId;
    const depthClass = !isTask ? ' depth-' + Math.min(depth + 1, 3) : '';
    const cardClass = isTask ? 'kanban-card' : ('kanban-child' + depthClass);
    const clickHandler = isTask
        ? (canEdit ? 'if(!event.target.closest(\'.clickable-badge\'))editTask(' + task.id + ')' : '')
        : (canEdit ? 'if(!event.target.closest(\'.clickable-badge\'))openSubtaskModal(' + rootTaskId + ',' + task.id + ')' : '');
    const dragHandler = isTask
        ? (canEdit ? 'handleTaskDragStart(event, ' + task.id + ')' : '')
        : (canEdit ? 'handleSubtaskDragStart(event, ' + rootTaskId + ', ' + task.id + ')' : '');
    const dragAttr = canEdit ? 'draggable="true"' : 'draggable="false"';
    const dragEvents = canEdit ? ('ondragstart="' + dragHandler + '" ondragend="handleDragEnd(event)"') : '';
    const baseColor = isTask ? (task.color || '') : getTaskColorById(rootTaskId);
    const derivedColor = !isTask && baseColor ? deriveTaskColor(baseColor, depth + 1) : baseColor;
    const hasColor = !!derivedColor;

    const fullCardClass = cardClass + (hasColor ? '' : ' no-color');

    const styleParts = [canEdit ? 'cursor:pointer' : 'cursor:default'];
    if (hasColor) {
        styleParts.push('border-left:4px solid ' + derivedColor + ' !important');
        styleParts.push('background: ' + derivedColor + ' !important');
        styleParts.push('color: ' + getContrastColor(derivedColor) + ' !important');
    }
    const style = styleParts.join(';');

    if (isTask) {
        return '<div class="' + fullCardClass + '" ' + dragAttr + ' ' +
               (clickHandler ? 'onclick="' + clickHandler + '" ' : '') +
               dragEvents + ' ' +
               'style="' + style + '" ' +
               'title="' + task.title + (canEdit ? ' (клик для редактирования)' : '') + '">' +
            '<div class="kanban-card-header' + (hasColor ? '' : ' no-color') + '">' +
                '<div class="title">' + task.title + '</div>' +
                 '<div class="meta">' + (canEdit ? renderPriorityBadge(task.id, task.priority || 'medium', false) : '<span class="priority-badge priority-' + (task.priority || 'medium') + '">' + PRIORITY_LABELS[task.priority || 'medium'] + '</span>') + '</div>' +
                 '<div>' + renderAssigneeCell(assigneeIds, task.id, null, false) + '</div>' +
            '</div>' +
        '</div>';
    }

    return '<div class="' + fullCardClass + '" ' + dragAttr + ' ' +
           (clickHandler ? 'onclick="' + clickHandler + '" ' : '') +
           dragEvents + ' ' +
           'style="' + style + '" ' +
           'title="' + task.title + (canEdit ? ' (клик для редактирования)' : '') + '">' +
        '<div class="name">' + task.title + '</div>' +
        '<div class="meta">' + (canEdit ? renderPriorityBadge(task.id, task.priority || 'medium', true, rootTaskId) : '<span class="priority-badge priority-' + (task.priority || 'medium') + '">' + PRIORITY_LABELS[task.priority || 'medium'] + '</span>') + '</div>' +
        '<div class="' + (canEdit ? 'assignees-list clickable' : 'assignees-list') + '" data-task-id="' + task.id + '" data-subtask-id="">' + renderAssigneeTags(assigneeIds, canEdit) + '</div>' +
    '</div>';
}

function renderKanbanCardWithChildren(task, children, rootTaskId, breadcrumb = [], orphanSubtaskId = null) {
    const assigneeIds = task.assignees || [];
    const baseColor = rootTaskId ? getTaskColorById(rootTaskId) : (task.color || '');
    const hasColor = !!baseColor;
    const editTaskId = orphanSubtaskId || task.id;

    const styleParts = [canEdit ? 'cursor:pointer' : 'cursor:default'];
    if (hasColor) {
        styleParts.push('border-left:4px solid ' + baseColor + ' !important');
        styleParts.push('background: ' + baseColor + ' !important');
        styleParts.push('color: ' + getContrastColor(baseColor) + ' !important');
    }
    const style = styleParts.join(';');

    const dragAttr = canEdit ? 'draggable="true"' : 'draggable="false"';
    const dragEvents = canEdit ? ('ondragstart="handleSubtaskDragStart(event, ' + rootTaskId + ', ' + task.id + ')" ondragend="handleDragEnd(event)"') : '';
    const clickHandler = canEdit ? ('onclick="if(event.target.closest(\'.clickable-badge\'))return;event.stopPropagation();openSubtaskModal(' + rootTaskId + ',' + editTaskId + ')"') : '';

    const newBreadcrumb = [...breadcrumb, task.title];
    const childrenHtml = children && children.length > 0 ? renderKanbanChildren(task, children, rootTaskId, task.id, newBreadcrumb) : '';

    const breadcrumbHtml = (breadcrumb.length > 0 && children && children.length > 0) ? '<div class="breadcrumb">' + breadcrumb.map((crumb, i) => '<span>' + crumb + '</span>').join(' → ') + '</div>' : '';

    return '<div class="kanban-card' + (hasColor ? '' : ' no-color') + '" ' + dragAttr + ' ' +
           (clickHandler ? clickHandler + ' ' : '') +
           dragEvents + ' ' +
           'style="' + style + '" ' +
           'title="' + task.title + (canEdit ? ' (клик для редактирования)' : '') + '">' +
        '<div class="kanban-card-header' + (hasColor ? '' : ' no-color') + '">' +
            '<div class="title">' + task.title + '</div>' +
            '<div class="meta">' + (canEdit ? renderPriorityBadge(editTaskId, task.priority || 'medium', true, rootTaskId) : '<span class="priority-badge priority-' + (task.priority || 'medium') + '">' + PRIORITY_LABELS[task.priority || 'medium'] + '</span>') + '</div>' +
            '<div>' + renderAssigneeCell(assigneeIds, editTaskId, null, false) + '</div>' +
        '</div>' +
        '<div class="kanban-children">' + childrenHtml + '</div>' +
        (breadcrumbHtml ? '<div class="breadcrumb-container">' + breadcrumbHtml + '</div>' : '') +
    '</div>';
}

function renderKanbanTaskAsSubtask(task, subtasks, rootTaskId) {
    const assigneeIds = task.assignees || [];
    const baseColor = task.color || '';
    const hasColor = !!baseColor;

    const styleParts = [canEdit ? 'cursor:pointer' : 'cursor:default'];
    if (hasColor) {
        styleParts.push('border-left:4px solid ' + baseColor + ' !important');
        styleParts.push('background: ' + baseColor + ' !important');
        styleParts.push('color: ' + getContrastColor(baseColor) + ' !important');
    }
    const style = styleParts.join(';');

    const clickHandler = canEdit ? ('onclick="if(event.target.closest(\'.clickable-badge\'))return;event.stopPropagation();editTask(' + task.id + ')"') : '';

    const childrenHtml = renderKanbanChildren(task, subtasks, rootTaskId, task.id, [task.title]);

    return '<div class="kanban-card' + (hasColor ? '' : ' no-color') + '" ' +
           (clickHandler ? clickHandler + ' ' : '') +
           'style="' + style + '" ' +
           'title="' + task.title + (canEdit ? ' (клик для редактирования задачи)' : '') + '">' +
        '<div class="kanban-card-header' + (hasColor ? '' : ' no-color') + '">' +
            '<div class="title">' + task.title + '</div>' +
            '<div class="meta">' + (canEdit ? renderPriorityBadge(task.id, task.priority || 'medium', false) : '<span class="priority-badge priority-' + (task.priority || 'medium') + '">' + PRIORITY_LABELS[task.priority || 'medium'] + '</span>') + '</div>' +
            '<div>' + renderAssigneeCell(assigneeIds, task.id, null, false) + '</div>' +
        '</div>' +
        '<div class="kanban-children">' + childrenHtml + '</div>' +
    '</div>';
}

function renderKanbanChildren(parentTask, children, rootTaskId, orphanParentId, breadcrumb = []) {
    const baseColor = rootTaskId ? getTaskColorById(rootTaskId) : (parentTask.color || '');

    const minDepth = children.length > 0 ? Math.min(...children.map(c => c.depth)) : 0;

    const buildTree = (items) => {
        const roots = [];
        const stack = [{ depth: -1, children: roots }];

        for (const item of items) {
            const node = { item, children: [] };
            const normalizedDepth = item.depth - minDepth;
            while (stack.length > 1 && stack[stack.length - 1].depth >= normalizedDepth) {
                stack.pop();
            }
            stack[stack.length - 1].children.push(node);
            stack.push({ depth: normalizedDepth, children: node.children });
        }

        return roots;
    };

    const tree = buildTree(children);

    const renderNode = (node, depth, nodeBreadcrumb = []) => {
        const item = node.item;
        const subAssignees = item.task.assignees || [];
        const depthClass = 'depth-' + Math.min(depth + 1, 3);
        const dragAttr = canEdit ? 'draggable="true"' : 'draggable="false"';
        const actualRootId = rootTaskId || parentTask.id;
        const dragEvents = canEdit ? ('ondragstart="handleSubtaskDragStart(event, ' + actualRootId + ', ' + item.task.id + ')" ondragend="handleDragEnd(event)"') : '';
        const clickHandler = canEdit ? ('onclick="if(event.target.closest(\'.clickable-badge\'))return;event.stopPropagation();openSubtaskModal(' + actualRootId + ',' + item.task.id + ')"') : '';
        const cursor = canEdit ? 'cursor:pointer' : 'cursor:default';
        const derivedColor = baseColor ? deriveTaskColor(baseColor, depth + 1) : '';
        const hasColor = !!derivedColor;
        const fullDepthClass = depthClass + (hasColor ? '' : ' no-color');
        const styleParts = [cursor];
        if (hasColor) {
            styleParts.push('border-left:4px solid ' + derivedColor + ' !important');
            styleParts.push('background: ' + derivedColor + ' !important');
            styleParts.push('color: ' + getContrastColor(derivedColor) + ' !important');
        }
        const style = styleParts.join(';');

        const nodeHasChildren = node.children.length > 0;
        const priorityNum = PRIORITY_NUMS[item.task.priority || 'medium'] || '3';
        const assigneeHtml = renderAssigneeCell(subAssignees, actualRootId, item.task.id, canEdit && !nodeHasChildren);

        const childrenHtml = node.children.length > 0
            ? '<div class="kanban-children" style="margin-left:12px;">' + node.children.map(child => renderNode(child, depth + 1, [...nodeBreadcrumb, item.task.title])).join('') + '</div>'
            : '';

        return '<div class="kanban-child ' + fullDepthClass + '" ' + dragAttr + ' ' + clickHandler + ' ' + dragEvents + ' style="' + style + '">' +
                '<span class="priority-num p-' + priorityNum + '">' + priorityNum + '</span>' +
                '<div class="content">' +
                    '<div class="name">' + item.task.title + '</div>' +
                    '<div class="assignees">' + assigneeHtml + '</div>' +
                '</div>' +
            '</div>' + childrenHtml;
    };

    return tree.map(n => renderNode(n, 0, breadcrumb)).join('');
}

function renderKanbanNested(task, subtasks, rootTaskId, orphanParentId = null) {
    const assigneeIds = task.assignees || [];
    const baseColor = rootTaskId ? getTaskColorById(rootTaskId) : (task.color || '');

    const orderIndex = new Map(subtasks.map((s, idx) => [s.task.id, idx]));
    const byId = new Map();
    subtasks.forEach(sub => {
        byId.set(sub.task.id, { ...sub, children: [] });
    });

    const roots = [];
    byId.forEach(node => {
        const parentId = node.parentSubtaskId;
        if (parentId === orphanParentId) {
            roots.push(node);
        } else if (parentId && byId.has(parentId)) {
            byId.get(parentId).children.push(node);
        } else {
            roots.push(node);
        }
    });

    const sortTree = (nodes) => {
        nodes.sort((a, b) => (orderIndex.get(a.task.id) ?? 0) - (orderIndex.get(b.task.id) ?? 0));
        nodes.forEach(n => sortTree(n.children));
    };
    sortTree(roots);

    const renderNode = (node, depth) => {
        const subAssignees = node.task.assignees || [];
        const depthClass = 'depth-' + Math.min(depth + 1, 3);
        const dragAttr = canEdit ? 'draggable="true"' : 'draggable="false"';
        const actualRootId = rootTaskId || task.id;
        const dragEvents = canEdit ? ('ondragstart="handleSubtaskDragStart(event, ' + actualRootId + ', ' + node.task.id + ')" ondragend="handleDragEnd(event)"') : '';
        const clickHandler = canEdit ? ('onclick="if(event.target.closest(\'.clickable-badge\'))return;event.stopPropagation();openSubtaskModal(' + actualRootId + ',' + node.task.id + ')"') : '';
        const cursor = canEdit ? 'cursor:pointer' : 'cursor:default';
        const derivedColor = baseColor ? deriveTaskColor(baseColor, depth + 1) : '';
        const hasColor = !!derivedColor;
        const fullDepthClass = depthClass + (hasColor ? '' : ' no-color');
        const styleParts = [cursor];
        if (hasColor) {
            styleParts.push('border-left:4px solid ' + derivedColor + ' !important');
            styleParts.push('background: ' + derivedColor + ' !important');
            styleParts.push('color: ' + getContrastColor(derivedColor) + ' !important');
        }
        const style = styleParts.join(';');
        const childrenHtml = node.children.length > 0
            ? '<div class="kanban-children" style="margin-left:12px;">' + node.children.map(child => renderNode(child, depth + 1)).join('') + '</div>'
            : '';
        const nodeHasChildren = node.children.length > 0;
        const priorityNum = PRIORITY_NUMS[node.task.priority || 'medium'] || '3';
        const assigneeHtml = renderAssigneeCell(subAssignees, actualRootId, node.task.id, canEdit && !nodeHasChildren);
        return '<div class="kanban-child ' + fullDepthClass + '" ' + dragAttr + ' ' + clickHandler + ' ' + dragEvents + ' style="' + style + '">' +
                '<span class="priority-num p-' + priorityNum + '">' + priorityNum + '</span>' +
                '<div class="content">' +
                    '<div class="name">' + node.task.title + '</div>' +
                    '<div class="assignees">' + assigneeHtml + '</div>' +
                '</div>' +
            '</div>' + childrenHtml;
    };

    const childrenHtml = roots.map(n => renderNode(n, 0)).join('');
    const dragAttr = canEdit ? 'draggable="true"' : 'draggable="false"';
    const dragEvents = canEdit ? ('ondragstart="handleTaskDragStart(event, ' + task.id + ')" ondragend="handleDragEnd(event)"') : '';
    const clickHandler = canEdit ? ('onclick="if(event.target.closest(\'.clickable-badge\'))return;event.stopPropagation();editTask(' + task.id + ')"') : '';
    const cursor = canEdit ? 'cursor:pointer' : 'cursor:default';
    const styleParts = [cursor];
    if (baseColor) {
        styleParts.push('border-left:4px solid ' + baseColor);
        styleParts.push('background: ' + baseColor);
        styleParts.push('color: ' + getContrastColor(baseColor));
    }
    const style = styleParts.join(';');

    return '<div class="kanban-card" ' + dragAttr + ' ' + clickHandler + ' ' + dragEvents + ' style="' + style + '" ' +
           'title="' + task.title + (canEdit ? ' (клик для редактирования)' : '') + '">' +
        '<div class="kanban-card-header">' +
            '<div class="title">' + task.title + '</div>' +
             '<div class="meta">' + (canEdit ? renderPriorityBadge(task.id, task.priority || 'medium', false) : '<span class="priority-badge priority-' + (task.priority || 'medium') + '">' + PRIORITY_LABELS[task.priority || 'medium'] + '</span>') + '</div>' +
               '<div>' + renderAssigneeCell(assigneeIds, task.id, null, false) + '</div>' +
          '</div>' +
        '<div class="kanban-children">' + childrenHtml + '</div>' +
    '</div>';
}

function renderFilterDropdowns() {
    const assigneeDropdown = document.getElementById('filterAssigneeDropdown');
    if (assigneeDropdown) {
        assigneeDropdown.innerHTML = assignees.map(a => {
            const isChecked = filterAssignee.includes(String(a.id));
            const color = a.color || '#888';
            const textColor = getContrastColor(color);
            return `<div class="badge-option ${isChecked ? 'selected' : ''}" style="background:${color};color:${textColor};" onclick="toggleFilter('assignee', '${a.id}')">
                ${a.name}
                <span class="check">&#10003;</span>
            </div>`;
        }).join('');
        updateFilterCount('assignee', filterAssignee.length);
    }

    const priorityDropdown = document.getElementById('filterPriorityDropdown');
    if (priorityDropdown) {
        priorityDropdown.innerHTML = PRIORITY_ORDER.map(p => {
            const isChecked = filterPriority.includes(p);
            return `<div class="badge-option priority-${p} ${isChecked ? 'selected' : ''}" onclick="toggleFilter('priority', '${p}')">
                ${PRIORITY_LABELS[p]}
                <span class="check">&#10003;</span>
            </div>`;
        }).join('');
        updateFilterCount('priority', filterPriority.length);
    }

    const statusDropdown = document.getElementById('filterStatusDropdown');
    if (statusDropdown) {
        statusDropdown.innerHTML = STATUS_LIST.map(s => {
            const isChecked = filterStatus.includes(s);
            return `<div class="badge-option status-${s} ${isChecked ? 'selected' : ''}" onclick="toggleFilter('status', '${s}')">
                ${STATUS_LABELS[s]}
                <span class="check">&#10003;</span>
            </div>`;
        }).join('');
        updateFilterCount('status', filterStatus.length);
    }
    
    const historyTypeDropdown = document.getElementById('filterHistoryTypeDropdown');
    if (historyTypeDropdown) {
        const types = [
            { value: 'creation', label: 'Создание' },
            { value: 'status', label: 'Смена статуса' },
            { value: 'priority', label: 'Смена приоритета' },
            { value: 'assignee', label: 'Смена исполнителей' }
        ];
        historyTypeDropdown.innerHTML = types.map(t => {
            const isChecked = historyFilterTypes.includes(t.value);
            return `<div class="badge-option ${isChecked ? 'selected' : ''}" onclick="toggleHistoryFilter('${t.value}')">
                ${t.label}
                <span class="check">&#10003;</span>
            </div>`;
        }).join('');
        updateFilterCount('historyType', historyFilterTypes.length);
    }
    
    const historyAssigneeDropdown = document.getElementById('filterHistoryAssigneeDropdown');
    if (historyAssigneeDropdown) {
        historyAssigneeDropdown.innerHTML = assignees.map(a => {
            const isChecked = filterHistoryAssignee.includes(String(a.id));
            const color = a.color || '#888';
            const textColor = getContrastColor(color);
            return `<div class="badge-option ${isChecked ? 'selected' : ''}" style="background:${color};color:${textColor};" onclick="toggleHistoryAssigneeFilter('${a.id}')">
                ${a.name}
                <span class="check">&#10003;</span>
            </div>`;
        }).join('');
        updateFilterCount('historyAssignee', filterHistoryAssignee.length);
    }
    
    const historyPriorityDropdown = document.getElementById('filterHistoryPriorityDropdown');
    if (historyPriorityDropdown) {
        historyPriorityDropdown.innerHTML = PRIORITY_ORDER.map(p => {
            const isChecked = filterHistoryPriority.includes(p);
            return `<div class="badge-option priority-${p} ${isChecked ? 'selected' : ''}" onclick="toggleHistoryPriorityFilter('${p}')">
                ${PRIORITY_LABELS[p]}
                <span class="check">&#10003;</span>
            </div>`;
        }).join('');
        updateFilterCount('historyPriority', filterHistoryPriority.length);
    }
    
    const historyStatusDropdown = document.getElementById('filterHistoryStatusDropdown');
    if (historyStatusDropdown) {
        historyStatusDropdown.innerHTML = STATUS_LIST.map(s => {
            const isChecked = filterHistoryStatus.includes(s);
            return `<div class="badge-option status-${s} ${isChecked ? 'selected' : ''}" onclick="toggleHistoryStatusFilter('${s}')">
                ${STATUS_LABELS[s]}
                <span class="check">&#10003;</span>
            </div>`;
        }).join('');
        updateFilterCount('historyStatus', filterHistoryStatus.length);
    }
}

function updateFilterCount(type, count) {
    const el = document.getElementById(`filter${type.charAt(0).toUpperCase() + type.slice(1)}Count`);
    if (el) el.textContent = count > 0 ? `(${count})` : '';
    if (type === 'historyType') {
        const countEl = document.getElementById('filterHistoryTypeCount');
        if (countEl) countEl.textContent = historyFilterTypes.length > 0 ? `(${historyFilterTypes.length})` : '';
    }
}

function matchesHistoryFilters(entry) {
    const types = window.historyFilterTypes || [];
    if (types.length === 0) return true;
    if (!types.includes(entry.change_type)) return false;
    
    const assignees = window.filterHistoryAssignee || [];
    if (assignees.length > 0) {
        const entryAssignees = entry.new_assignees ? entry.new_assignees.split(',').filter(a => a) : [];
        const hasMatch = entryAssignees.some(a => assignees.includes(a));
        if (!hasMatch) return false;
    }
    const priorities = window.filterHistoryPriority || [];
    if (priorities.length > 0 && entry.new_priority && !priorities.includes(entry.new_priority)) return false;
    const statuses = window.filterHistoryStatus || [];
    if (statuses.length > 0 && entry.new_status && !statuses.includes(entry.new_status)) return false;
    
    return true;
}

function getTaskCurrentState(taskId, subtaskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return null;
    if (!subtaskId) {
        return { status: task.status, priority: task.priority, assignees: task.assignees };
    }
    const subtask = findSubtaskById(task, subtaskId);
    if (!subtask) return null;
    return { status: subtask.status, priority: subtask.priority, assignees: subtask.assignees };
}

function renderHistoryItem(entry) {
    const task = tasks.find(t => t.id === entry.task_id);
    const taskColor = task ? task.color : '';
    const textColor = taskColor ? getContrastColor(taskColor) : '';
    const rowStyle = taskColor ? 'border-left:4px solid ' + taskColor + '; background: ' + taskColor + '; color: ' + textColor + ';' : '';
    const changeLabels = { creation: 'Создание', status: 'Смена статуса', priority: 'Смена приоритета', assignee: 'Смена исполнителей' };
    const changeLabel = changeLabels[entry.change_type] || entry.change_type;
    const priorityLabel = PRIORITY_LABELS[entry.new_priority || 'medium'];
    const statusLabel = STATUS_LABELS[entry.new_status || 'queue'];
    const statusBadge = '<span class="clickable-badge status-' + (entry.new_status || 'queue') + '">' + statusLabel + '</span>';
    const priorityBadge = '<span class="clickable-badge priority-' + (entry.new_priority || 'medium') + '">' + priorityLabel + '</span>';
    const assigneeHtml = entry.new_assignees ? renderAssigneeTags(entry.new_assignees.split(',').filter(a => a)) : '';
    const canDrag = canEdit ? 'draggable="true" ondragstart="handleHistoryDragStart(event, ' + entry.id + ')" ondragend="handleHistoryDragEnd(event)"' : '';
    return `
        <div class="history-item" id="history-${entry.id}" ${canDrag} style="${rowStyle}">
            <div class="history-date-cell">
                <input type="date" value="${entry.changed_at}" onchange="handleHistoryDateChange(event, ${entry.id})" ${!canEdit ? 'disabled' : ''}>
            </div>
            <div class="history-title-cell">
                <div class="history-task-title">${entry.task_title}</div>
                <div class="history-task-path">${entry.task_path}</div>
            </div>
            <div class="history-change-cell">
                <span class="change-type-badge change-type-${entry.change_type}">${changeLabel}</span>
            </div>
            <div class="history-status-cell">${statusBadge}</div>
            <div class="history-priority-cell">${priorityBadge}</div>
            <div class="history-assignees-cell">${assigneeHtml || '-'}</div>
            <div class="history-actions-cell">
                ${canEdit ? '<button class="btn-icon history-delete-btn" onclick="deleteHistoryEntry(' + entry.id + ')" title="Удалить">🗑️</button>' : ''}
            </div>
        </div>
    `;
}

function renderTaskHistory() {
    const container = document.getElementById('historyContainer');
    if (!container) return;
    const historyData = window.taskHistory || [];
    const filtered = historyData.filter(matchesHistoryFilters);
    const byDate = {};
    filtered.forEach(entry => {
        const date = entry.changed_at || 'unknown';
        if (!byDate[date]) byDate[date] = [];
        byDate[date].push(entry);
    });
    const dates = Object.keys(byDate).sort((a, b) => new Date(b) - new Date(a));
    let html = '';
    dates.forEach(date => {
        const dateEntries = byDate[date].sort((a, b) => {
            if (a.order_index !== b.order_index) return b.order_index - a.order_index;
            return b.id - a.id;
        });
        const formattedDate = new Date(date).toLocaleDateString('ru-RU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        html += `<div class="history-date-header">${formattedDate}</div>`;
        html += '<div class="history-date-entries" data-date="' + date + '" ondragover="handleHistoryDragOver(event)" ondragleave="handleHistoryDragLeave(event)" ondrop="handleHistoryDrop(event, \'' + date + '\')">';
        dateEntries.forEach(entry => {
            html += renderHistoryItem(entry);
        });
        html += '</div>';
    });
    container.innerHTML = html || '<div class="history-empty">Нет записей истории</div>';
}

window.renderTasks = renderTasks;
window.renderAssigneesSelect = renderAssigneesSelect;
window.renderAssigneesList = renderAssigneesList;
window.renderTaskColorPicker = renderTaskColorPicker;
window.renderFilterDropdowns = renderFilterDropdowns;
window.renderBadgeSelector = renderBadgeSelector;
window.selectBadgeOption = selectBadgeOption;
window.getSelectedBadgeValue = getSelectedBadgeValue;
window.renderTaskHistory = renderTaskHistory;
window.findSubtaskById = findSubtaskById;
