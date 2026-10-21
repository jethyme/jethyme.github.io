const test = require('node:test');
const assert = require('node:assert/strict');
const Game = require('../game.js');
const { checkAccess, parseTags, badgeNames } = require('../twitch.js');

const dictionary = new Set(['слово', 'корова', 'бык', 'рога']);

test('createGame берёт заданное слово', () => {
    const game = Game.createGame({ word: 'слово', channel: 'chan' }, dictionary);
    assert.equal(game.word, 'слово');
    assert.equal(game.length, 5);
    assert.equal(game.status, Game.STATUS.ACTIVE);
    assert.equal(game.maxAttempts, 0);
});

test('createGame выбирает случайное слово нужной длины', () => {
    const game = Game.createGame({ length: 4, channel: 'chan' }, dictionary);
    assert.equal(game.length, 4);
    assert.ok(game.word.length === 4);
});

test('createGame ругается, если слов такой длины нет', () => {
    assert.throws(() => Game.createGame({ length: 12 }, dictionary), /Нет слов/);
});

test('applyGuess считает попытки и завершает игру при угаданном слове', () => {
    const game = Game.createGame({ word: 'слово' }, dictionary);
    Game.applyGuess(game, 'олово', 'tester');
    assert.equal(game.guesses.length, 1);
    assert.equal(game.guesses[0].bulls, 4);
    assert.equal(game.guesses[0].cows, 0);
    assert.equal(game.status, Game.STATUS.ACTIVE);

    Game.applyGuess(game, 'слово', 'tester');
    assert.equal(game.status, Game.STATUS.SOLVED);
    assert.equal(game.winner, 'tester');
});

test('applyGame уважает лимит попыток', () => {
    const game = Game.createGame({ word: 'слово', maxAttempts: 1 }, dictionary);
    Game.applyGuess(game, 'олово', 'tester');
    assert.equal(game.status, Game.STATUS.FAILED);
});

test('publicState прячет загаданное слово, пока игра активна', () => {
    const game = Game.createGame({ word: 'слово' }, dictionary);
    const hidden = Game.publicState(game);
    assert.equal(hidden.word, null);
    assert.equal(hidden.length, 5);

    Game.applyGuess(game, 'слово', 'tester');
    assert.equal(Game.publicState(game).word, 'слово');
});

test('parseTags разбирает теги Twitch', () => {
    const name = 'Взяток';
    const raw = 'badges=subscriber/12,moderator/1;display-name=' + encodeURIComponent(name) +
        ';subscriber=1';
    const tags = parseTags(raw);
    assert.equal(tags['display-name'], name);
    assert.deepEqual(badgeNames(tags.badges), ['subscriber', 'moderator']);
    assert.equal(tags.subscriber, '1');
});

test('checkAccess пускает подписчиков, модераторов и владельца канала', () => {
    const sub = parseTags('badges=subscriber/12;subscriber=1');
    const mod = parseTags('badges=moderator/1;mod=1');
    const plain = parseTags('badges=;subscriber=0');
    const opts = { authMode: 'subscribers', allowList: [], channel: 'mychan' };

    assert.equal(checkAccess('viewer', sub, opts), true);
    assert.equal(checkAccess('mod', mod, opts), true);
    assert.equal(checkAccess('mychan', plain, opts), true);
    assert.equal(checkAccess('random', plain, opts), false);
});

test('checkAccess в режиме белого списка пускает только свой список', () => {
    const opts = { authMode: 'whitelist', allowList: ['friend'], channel: 'mychan' };
    const sub = parseTags('badges=subscriber/12');
    assert.equal(checkAccess('friend', sub, opts), true);
    assert.equal(checkAccess('stranger', sub, opts), false);
    assert.equal(checkAccess('mychan', sub, opts), true);
});

test('checkAccess в режиме all пускает всех', () => {
    const opts = { authMode: 'all', allowList: [], channel: 'mychan' };
    assert.equal(checkAccess('stranger', parseTags('badges=;'), opts), true);
});
