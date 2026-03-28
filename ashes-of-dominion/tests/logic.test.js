const test = require('node:test');
const assert = require('node:assert/strict');

const {
    STATUS_ORDER,
    calculateTaskStatus,
    normalizeSubtasksTree,
    calculateTaskAssignees,
    calculateNodeAssignees,
    elevateSameStatusSubtasks,
    getSubtaskStats
} = require('../logic.js');

test('calculateTaskStatus returns earliest status across nested subtasks', () => {
    const tree = [
        { id: 1, status: 'done', children: [] },
        {
            id: 2,
            status: 'progress',
            children: [
                { id: 3, status: 'review', children: [] }
            ]
        }
    ];
    assert.equal(calculateTaskStatus(tree), 'progress');
});

test('calculateTaskStatus returns queue when any queue exists', () => {
    const tree = [
        { id: 1, status: 'done', children: [] },
        { id: 2, status: 'queue', children: [] }
    ];
    assert.equal(calculateTaskStatus(tree), 'queue');
});

test('normalizeSubtasksTree aggregates status and assignees from children', () => {
    const tree = [
        {
            id: 10,
            status: 'done',
            assignees: ['x'],
            children: [
                { id: 11, status: 'review', assignees: ['a'], children: [] },
                { id: 12, status: 'done', assignees: ['b'], children: [] }
            ]
        }
    ];

    const normalized = normalizeSubtasksTree(tree);

    assert.equal(normalized[0].status, 'review');
    assert.deepEqual(new Set(normalized[0].assignees), new Set(['a', 'b']));
});

test('normalizeSubtasksTree supports legacy subtasks field', () => {
    const tree = [
        {
            id: 20,
            subtasks: [
                { id: 21, status: 'done', assignees: ['a'], subtasks: [] }
            ]
        }
    ];

    const normalized = normalizeSubtasksTree(tree);

    assert.equal(normalized[0].children.length, 1);
    assert.equal(normalized[0].children[0].id, 21);
    assert.equal(normalized[0].children[0].status, 'done');
});

test('calculateTaskAssignees collects unique assignees recursively', () => {
    const tree = [
        {
            id: 30,
            assignees: ['root'],
            children: [
                { id: 31, assignees: ['a'], children: [] },
                { id: 32, assignees: ['a', 'b'], children: [] }
            ]
        }
    ];

    const all = calculateTaskAssignees(tree).sort();
    assert.deepEqual(all, ['a', 'b', 'root']);
});

test('calculateNodeAssignees includes nested children', () => {
    const node = {
        id: 40,
        assignees: ['root'],
        children: [
            { id: 41, assignees: ['a'], children: [] }
        ]
    };

    const all = calculateNodeAssignees(node).sort();
    assert.deepEqual(all, ['a', 'root']);
});

test('elevateSameStatusSubtasks lifts matching statuses recursively', () => {
    const tree = [
        {
            id: 50,
            status: 'queue',
            children: [
                { id: 51, status: 'queue', children: [] },
                { id: 52, status: 'review', children: [] }
            ]
        }
    ];

    const elevated = elevateSameStatusSubtasks(tree, 'queue', 'progress');

    assert.equal(elevated[0].status, 'progress');
    assert.equal(elevated[0].children[0].status, 'progress');
    assert.equal(elevated[0].children[1].status, 'review');
});

test('getSubtaskStats counts nested subtasks and done items', () => {
    const tree = [
        {
            id: 60,
            status: 'done',
            children: [
                { id: 61, status: 'done', children: [] },
                { id: 62, status: 'progress', children: [] }
            ]
        }
    ];

    const stats = getSubtaskStats(tree);
    assert.equal(stats.total, 3);
    assert.equal(stats.done, 2);
});

test('STATUS_ORDER keeps expected ordering', () => {
    assert.ok(STATUS_ORDER.queue < STATUS_ORDER.progress);
    assert.ok(STATUS_ORDER.progress < STATUS_ORDER.review);
    assert.ok(STATUS_ORDER.review < STATUS_ORDER.done);
});
