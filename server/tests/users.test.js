const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { UserStore, publicUser } = require('../users.js');
const { checkAccess } = require('../twitch.js');

function tempStore() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wordle-users-'));
    return new UserStore(path.join(dir, 'users.json'));
}

test('upsert запоминает нового пользователя Twitch', () => {
    const store = tempStore();
    const user = store.upsert({ id: '123', login: 'tester', displayName: 'Тестер' });

    assert.equal(user.id, '123');
    assert.equal(user.login, 'tester');
    assert.equal(user.approved, false);
    assert.equal(store.list().length, 1);
});

test('повторный вход не теряет выданное право', () => {
    const store = tempStore();
    store.upsert({ id: '123', login: 'tester' });
    store.setApproved('123', true);

    const again = store.upsert({ id: '123', login: 'tester' });
    assert.equal(again.approved, true);
    assert.deepEqual(store.approvedLogins(), ['tester']);
});

test('setApproved отбирает и возвращает право', () => {
    const store = tempStore();
    store.upsert({ id: '123', login: 'tester' });
    store.setApproved('123', true);
    assert.equal(store.get('123').approved, true);

    store.setApproved('123', false);
    assert.equal(store.get('123').approved, false);
    assert.deepEqual(store.approvedLogins(), []);
});

test('approveLogin даёт право нику из чата без входа на сайт', () => {
    const store = tempStore();
    const user = store.approveLogin('Чат_Юзер');
    assert.equal(user.approved, true);
    assert.deepEqual(store.approvedLogins(), ['чат_юзер']);
    assert.equal(store.byLogin('ЧАТ_ЮЗЕР').id, user.id);
});

test('сессия живёт между перезапусками сервера', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wordle-users-'));
    const file = path.join(dir, 'users.json');

    const store = new UserStore(file);
    const user = store.upsert({ id: '123', login: 'tester' });
    const token = store.createSession(user.id);

    const reloaded = new UserStore(file);
    const found = reloaded.userBySession(token);
    assert.equal(found.login, 'tester');
    assert.equal(reloaded.userBySession('чужая-сессия'), null);
});

test('publicUser не отдаёт лишнего', () => {
    const store = tempStore();
    const user = store.upsert({ id: '123', login: 'tester', displayName: 'Тестер' });
    const view = publicUser(user);
    assert.equal(view.login, 'tester');
    assert.equal(view.approved, false);
    assert.equal('token' in view, false);
});

test('checkAccess в режиме approved пускает только одобренных', () => {
    const opts = {
        authMode: 'approved',
        allowList: [],
        approvedLogins: ['friend'],
        channel: 'mychan'
    };
    const sub = { badges: 'subscriber/12', subscriber: '1' };

    assert.equal(checkAccess('friend', sub, opts), true);
    assert.equal(checkAccess('stranger', sub, opts), false);
    assert.equal(checkAccess('mychan', sub, opts), true);
});
