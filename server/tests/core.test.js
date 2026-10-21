const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../../wordle/wordle-core.js');

test('scoreGuess: точное совпадение и буква в другом месте', () => {
    assert.deepEqual(Core.scoreGuess('слово', 'слово'), ['correct', 'correct', 'correct', 'correct', 'correct']);
    // лишняя "о" в начале не засчитывается: обе "о" загаданного слова уже заняты
    assert.deepEqual(Core.scoreGuess('олово', 'слово'), ['absent', 'correct', 'correct', 'correct', 'correct']);
    assert.deepEqual(Core.scoreGuess('крова', 'корова'), ['correct', 'present', 'present', 'present', 'absent']);
    assert.deepEqual(Core.scoreGuess('абракадабра', 'слово'), ['absent', 'absent', 'absent', 'absent', 'absent']);
});

test('scoreGuess: повторяющиеся буквы считаются один раз', () => {
    // в загадочном слове две "о", обе заняты своими позициями — лишние становятся серыми
    assert.deepEqual(Core.scoreGuess('ооооо', 'слово'), ['absent', 'absent', 'correct', 'absent', 'correct']);
});

test('countBullsCows различает быков и коров', () => {
    assert.deepEqual(Core.countBullsCows('олово', 'слово'), { bulls: 4, cows: 0 });
    assert.deepEqual(Core.countBullsCows('крова', 'корова'), { bulls: 1, cows: 3 });
    assert.deepEqual(Core.countBullsCows('слово', 'слово'), { bulls: 5, cows: 0 });
});

test('validateGuess принимает одно слово нужной длины', () => {
    const dict = new Set(['слово', 'корова']);
    assert.deepEqual(Core.validateGuess('Слово', 5, dict), { ok: true, word: 'слово', reason: null });
    assert.deepEqual(Core.validateGuess('"слово"', 5, dict), { ok: true, word: 'слово', reason: null });
});

test('validateGuess отклоняет мусор', () => {
    const dict = new Set(['слово']);
    assert.equal(Core.validateGuess('два слова', 5, dict).ok, false);
    assert.equal(Core.validateGuess('кот', 5, dict).reason, Core.REASONS.WRONG_LENGTH);
    assert.equal(Core.validateGuess('несуще', 5, dict).reason, Core.REASONS.WRONG_LENGTH);
    assert.equal(Core.validateGuess('12345', 5, dict).reason, Core.REASONS.NOT_A_WORD);
    assert.equal(Core.validateGuess('', 5, dict).reason, Core.REASONS.EMPTY);
});

test('rankBest сортирует по быкам и коровам', () => {
    const guesses = [
        { word: 'ааааа', bulls: 0, cows: 0 },
        { word: 'ббббб', bulls: 1, cows: 2 },
        { word: 'ввввв', bulls: 1, cows: 0 }
    ];
    const best = Core.rankBest(guesses, 2);
    assert.equal(best[0].word, 'ббббб');
    assert.equal(best[1].word, 'ввввв');
});

test('lastGuesses отдаёт свежие попытки первыми', () => {
    const guesses = [1, 2, 3, 4].map(n => ({ word: 'word' + n }));
    assert.deepEqual(Core.lastGuesses(guesses, 2).map(g => g.word), ['word4', 'word3']);
});
