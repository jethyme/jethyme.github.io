/*
 * Логика игр на сервере: создание, применение попыток, публичное состояние.
 */
const crypto = require('crypto');
const Core = require('../wordle/wordle-core.js');

const STATUS = {
    ACTIVE: 'active',
    SOLVED: 'solved',
    FAILED: 'failed',
    STOPPED: 'stopped'
};

function createId() {
    return crypto.randomBytes(4).toString('hex');
}

function pickRandomWord(dictionary, length) {
    const pool = [];
    for (const word of dictionary) {
        if (word.length === length) pool.push(word);
    }
    if (!pool.length) return null;
    return pool[Math.floor(Math.random() * pool.length)];
}

function createGame(options, dictionary) {
    const length = Math.max(1, Number(options.length) || 5);
    let word = String(options.word || '').trim().toLowerCase();

    if (!word) {
        word = pickRandomWord(dictionary, length);
        if (!word) {
            const error = new Error('Нет слов такой длины в словаре');
            error.code = 'NO_WORDS';
            throw error;
        }
    }

    return {
        id: createId(),
        word: word,
        length: word.length,
        channel: String(options.channel || '').replace(/^#/, '').toLowerCase(),
        authMode: options.authMode || 'subscribers',
        maxAttempts: Number(options.maxAttempts) || 0, // 0 — без ограничения
        status: STATUS.ACTIVE,
        createdAt: new Date().toISOString(),
        finishedAt: null,
        winner: null,
        guesses: [],
        stats: {
            rejected: 0,
            unauthorized: 0,
            rateLimited: 0,
            wrongLength: 0,
            unknownWord: 0,
            tooManyWords: 0,
            notAWord: 0
        }
    };
}

/* Применяет попытку. guess — уже проверенное слово нужной длины. */
function applyGuess(game, guess, author) {
    const marks = Core.scoreGuess(guess, game.word);
    const { bulls, cows } = Core.countBullsCows(guess, game.word);

    const entry = {
        word: guess,
        author: author || '—',
        at: new Date().toISOString(),
        bulls: bulls,
        cows: cows,
        marks: marks
    };
    game.guesses.push(entry);

    if (bulls === game.length) {
        game.status = STATUS.SOLVED;
        game.winner = entry.author;
        game.finishedAt = entry.at;
    } else if (game.maxAttempts > 0 && game.guesses.length >= game.maxAttempts) {
        game.status = STATUS.FAILED;
        game.finishedAt = entry.at;
    }

    return entry;
}

/* Состояние для браузера. Секретное слово скрыто, пока игра активна. */
function publicState(game, options) {
    const reveal = !!(options && options.reveal);
    const showWord = reveal || game.status !== STATUS.ACTIVE;

    return {
        id: game.id,
        length: game.length,
        channel: game.channel,
        authMode: game.authMode,
        maxAttempts: game.maxAttempts,
        status: game.status,
        createdAt: game.createdAt,
        finishedAt: game.finishedAt,
        winner: game.winner,
        attempts: game.guesses.length,
        word: showWord ? game.word : null,
        guesses: game.guesses.map(g => ({
            word: g.word,
            author: g.author,
            at: g.at,
            bulls: g.bulls,
            cows: g.cows,
            marks: g.marks
        })),
        best: Core.rankBest(game.guesses, 5).map(g => ({
            word: g.word, author: g.author, bulls: g.bulls, cows: g.cows, marks: g.marks
        })),
        last: Core.lastGuesses(game.guesses, 10).map(g => ({
            word: g.word, author: g.author, bulls: g.bulls, cows: g.cows, marks: g.marks
        })),
        stats: game.stats
    };
}

function summary(game) {
    return {
        id: game.id,
        channel: game.channel,
        length: game.length,
        status: game.status,
        attempts: game.guesses.length,
        maxAttempts: game.maxAttempts,
        authMode: game.authMode,
        createdAt: game.createdAt,
        winner: game.winner
    };
}

module.exports = { STATUS, createId, createGame, applyGuess, publicState, summary, pickRandomWord };
