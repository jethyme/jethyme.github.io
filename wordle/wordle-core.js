/*
 * Общая логика игры Wordle: подсчёт совпадений, разбор сообщений чата,
 * рейтинг лучших и последних попыток.
 * Работает и в браузере (window.WordleCore), и в Node (require).
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.WordleCore = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const STATUS = {
        CORRECT: 'correct',   // буква на своём месте
        PRESENT: 'present',   // буква есть, но в другом месте
        ABSENT: 'absent'      // буквы нет в слове
    };

    const REASONS = {
        EMPTY: 'empty',
        NOT_A_WORD: 'not-a-word',
        TOO_MANY_WORDS: 'too-many-words',
        WRONG_LENGTH: 'wrong-length',
        UNKNOWN_WORD: 'unknown-word'
    };

    const REASON_TEXT = {
        'empty': 'пустое сообщение',
        'not-a-word': 'сообщение состоит не из одного слова',
        'too-many-words': 'в сообщении несколько слов',
        'wrong-length': 'неверная длина слова',
        'unknown-word': 'такого слова нет в словаре'
    };

    /* Приводит сообщение к «голому» слову: убирает пробелы по краям,
     * парные кавычки и пунктуацию по краям. */
    function normalizeWord(raw) {
        return String(raw == null ? '' : raw)
            .trim()
            .toLowerCase()
            .replace(/^[\s"'«»„“”‘’«»`*_~]+/, '')
            .replace(/[\s"'«»„“”‘’«»`*_~.,!?;:%()\[\]{}/\\|—–-]+$/, '');
    }

    /* Проверка слова по словарю (Set или массив). */
    function isInDictionary(word, dictionary) {
        if (!dictionary) return true;
        if (typeof dictionary.has === 'function') return dictionary.has(word);
        if (Array.isArray(dictionary)) return dictionary.indexOf(word) !== -1;
        return false;
    }

    /* Разбор сообщения из чата: подходит ли оно как попытка.
     * Возвращает { ok, word, reason }. */
    function validateGuess(text, length, dictionary) {
        const trimmed = String(text == null ? '' : text).trim();
        if (!trimmed) {
            return { ok: false, reason: REASONS.EMPTY };
        }
        const word = normalizeWord(trimmed);
        if (!word) {
            return { ok: false, reason: REASONS.EMPTY };
        }
        if (/\s/.test(word)) {
            return { ok: false, reason: REASONS.TOO_MANY_WORDS };
        }
        if (!/^[а-яёa-z]+$/i.test(word)) {
            return { ok: false, reason: REASONS.NOT_A_WORD };
        }
        if (typeof length === 'number' && word.length !== length) {
            return { ok: false, reason: REASONS.WRONG_LENGTH };
        }
        if (!isInDictionary(word, dictionary)) {
            return { ok: false, reason: REASONS.UNKNOWN_WORD };
        }
        return { ok: true, word: word, reason: null };
    }

    /* Классический разбор Wordle: сначала точные совпадения, потом «буква есть в другом месте».
     * Повторяющиеся буквы обрабатываются корректно (лишние буквы становятся серыми). */
    function scoreGuess(guess, secret) {
        const size = Math.min(guess.length, secret.length);
        const result = new Array(size).fill(STATUS.ABSENT);
        const available = {};

        for (let i = 0; i < size; i++) {
            if (guess[i] === secret[i]) {
                result[i] = STATUS.CORRECT;
            } else {
                available[secret[i]] = (available[secret[i]] || 0) + 1;
            }
        }

        for (let i = 0; i < size; i++) {
            if (result[i] === STATUS.CORRECT) continue;
            const ch = guess[i];
            if ((available[ch] || 0) > 0) {
                result[i] = STATUS.PRESENT;
                available[ch]--;
            }
        }

        return result;
    }

    /* Быки (точное место) и коровы (буква есть в другом месте). */
    function countBullsCows(guess, secret) {
        const marks = scoreGuess(guess, secret);
        let bulls = 0, cows = 0;
        for (const mark of marks) {
            if (mark === STATUS.CORRECT) bulls++;
            else if (mark === STATUS.PRESENT) cows++;
        }
        return { bulls: bulls, cows: cows };
    }

    /* Лучшие попытки: больше «быков» — лучше, при равенстве больше «коров». */
    function rankBest(guesses, limit) {
        const max = typeof limit === 'number' ? limit : 5;
        return guesses
            .slice()
            .sort(function (a, b) {
                if (b.bulls !== a.bulls) return b.bulls - a.bulls;
                if (b.cows !== a.cows) return b.cows - a.cows;
                if (b.word.length !== a.word.length) return b.word.length - a.word.length;
                return a.word < b.word ? -1 : (a.word > b.word ? 1 : 0);
            })
            .slice(0, max);
    }

    /* Последние попытки: от свежих к старым. */
    function lastGuesses(guesses, limit) {
        const max = typeof limit === 'number' ? limit : 10;
        return guesses.slice(-max).reverse();
    }

    /* Эмодзи-строка для шаринга результата (как в Wordle). */
    function shareRow(marks) {
        return marks.map(function (mark) {
            if (mark === STATUS.CORRECT) return '🟩';
            if (mark === STATUS.PRESENT) return '🟨';
            return '⬛';
        }).join('');
    }

    function reasonText(reason) {
        return REASON_TEXT[reason] || reason || '';
    }

    return {
        STATUS: STATUS,
        REASONS: REASONS,
        normalizeWord: normalizeWord,
        isInDictionary: isInDictionary,
        validateGuess: validateGuess,
        scoreGuess: scoreGuess,
        countBullsCows: countBullsCows,
        rankBest: rankBest,
        lastGuesses: lastGuesses,
        shareRow: shareRow,
        reasonText: reasonText
    };
});
