/*
 * Сервер игры Wordle для Twitch.
 *
 * Что умеет:
 *   — создавать игры (случайное слово из словаря или заданное);
 *   — принимать сообщения из чата Twitch и считать их попытками;
 *   — отдавать живую доску в браузер через SSE;
 *   — ограничивать, кто может угадывать (подписчики / белый список).
 *
 * Запуск:  node server/server.js      (по умолчанию http://localhost:3123)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { Store } = require('./store');
const { TwitchHub, checkAccess, AUTH_MODES } = require('./twitch');
const Game = require('./game');
const Core = require('../wordle/wordle-core.js');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const LOCAL_SETTINGS = path.join(DATA_DIR, 'settings.local.json');

/* ---------------- Конфигурация ---------------- */

function deepMerge(base, patch) {
    const out = Object.assign({}, base);
    Object.keys(patch || {}).forEach(key => {
        const value = patch[key];
        if (value && typeof value === 'object' && !Array.isArray(value) &&
            out[key] && typeof out[key] === 'object' && !Array.isArray(out[key])) {
            out[key] = deepMerge(out[key], value);
        } else {
            out[key] = value;
        }
    });
    return out;
}

function loadConfig() {
    const base = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
    let local = {};
    try {
        local = JSON.parse(fs.readFileSync(LOCAL_SETTINGS, 'utf8'));
    } catch (e) {
        /* локальных настроек нет — это нормально */
    }
    const cfg = deepMerge(base, local);
    if (process.env.PORT) cfg.port = Number(process.env.PORT);
    if (process.env.ADMIN_KEY) cfg.adminKey = process.env.ADMIN_KEY;
    if (process.env.TWITCH_TOKEN) cfg.twitch.oauthToken = process.env.TWITCH_TOKEN;
    if (process.env.TWITCH_NICK) cfg.twitch.nickname = process.env.TWITCH_NICK;
    if (process.env.TWITCH_CHANNEL) cfg.twitch.channel = process.env.TWITCH_CHANNEL;
    return cfg;
}

function saveLocalSettings(patch) {
    let local = {};
    try {
        local = JSON.parse(fs.readFileSync(LOCAL_SETTINGS, 'utf8'));
    } catch (e) {
        local = {};
    }
    const merged = deepMerge(local, patch);
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(LOCAL_SETTINGS, JSON.stringify(merged, null, 2), 'utf8');
    return merged;
}

const config = loadConfig();
const store = new Store(path.join(DATA_DIR, 'games.json'));
const hub = new TwitchHub();

/* ---------------- Словарь ---------------- */

function loadDictionary() {
    const set = new Set();
    [config.game.dictionaryFile, config.game.singularFile].forEach(rel => {
        const file = path.join(ROOT, rel);
        if (!fs.existsSync(file)) {
            console.warn('[dict] Файл не найден:', rel);
            return;
        }
        fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach(line => {
            const word = line.trim().toLowerCase();
            if (word) set.add(word);
        });
    });
    console.log(`[dict] Слов в словаре: ${set.size}`);
    return set;
}

const dictionary = loadDictionary();

/* ---------------- SSE ---------------- */

const sseClients = new Set();

function sseSend(res, event, data) {
    try {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch (e) {
        sseClients.delete(res);
    }
}

function broadcast(event, data, gameId) {
    sseClients.forEach(res => {
        if (gameId && res._gameId && res._gameId !== gameId) return;
        sseSend(res, event, data);
    });
}

function broadcastGame(game) {
    const state = Game.publicState(game, { reveal: false });
    broadcast('game', state, game.id);
    broadcast('games', store.list().map(Game.summary));
}

/* ---------------- Лимиты ---------------- */

const rateBuckets = new Map(); // gameId:user -> timestamps

function rateLimitOk(gameId, user) {
    const rl = config.twitch.rateLimit || {};
    const max = Number(rl.maxPerUser);
    const window = Number(rl.windowMs) || 15000;
    if (!max || max <= 0) return true;

    const key = `${gameId}:${user}`;
    const now = Date.now();
    const stamps = (rateBuckets.get(key) || []).filter(t => now - t < window);
    if (stamps.length >= max) {
        rateBuckets.set(key, stamps);
        return false;
    }
    stamps.push(now);
    rateBuckets.set(key, stamps);
    return true;
}

/* ---------------- Логика игры из чата ---------------- */

function findActiveGame(channel) {
    const games = store.list().filter(g =>
        g.status === Game.STATUS.ACTIVE && g.channel === String(channel || '').toLowerCase());
    return games[0] || null;
}

function applyChatGuess(game, word, author) {
    Game.applyGuess(game, word, author);
    store.update(game);
    broadcastGame(game);
    if (game.status !== Game.STATUS.ACTIVE) {
        console.log(`[game ${game.id}] Игра окончена (${game.status}). Ответ: ${game.word}`);
    }
}

function handleChatMessage(message) {
    const game = findActiveGame(message.channel);
    if (!game) return;

    const allowed = checkAccess(message.user, message.tags, {
        authMode: game.authMode || config.twitch.authMode,
        allowList: config.twitch.allowList,
        channel: message.channel
    });
    if (!allowed) {
        game.stats.unauthorized++;
        store.update(game);
        return;
    }

    if (!rateLimitOk(game.id, message.user)) {
        game.stats.rateLimited++;
        store.update(game);
        return;
    }

    const text = String(message.text || '').trim();
    const check = config.game.requireDictionary === false
        ? (() => {
            const word = Core.normalizeWord(text);
            if (!word) return { ok: false, reason: Core.REASONS.EMPTY };
            if (/\s/.test(word)) return { ok: false, reason: Core.REASONS.TOO_MANY_WORDS };
            if (!/^[а-яёa-z]+$/i.test(word)) return { ok: false, reason: Core.REASONS.NOT_A_WORD };
            if (word.length !== game.length) return { ok: false, reason: Core.REASONS.WRONG_LENGTH };
            return { ok: true, word };
        })()
        : Core.validateGuess(text, game.length, dictionary);

    if (!check.ok) {
        game.stats.rejected++;
        if (check.reason === Core.REASONS.WRONG_LENGTH) game.stats.wrongLength++;
        else if (check.reason === Core.REASONS.UNKNOWN_WORD) game.stats.unknownWord++;
        else if (check.reason === Core.REASONS.TOO_MANY_WORDS) game.stats.tooManyWords++;
        else if (check.reason === Core.REASONS.NOT_A_WORD) game.stats.notAWord++;
        store.update(game);
        return;
    }

    applyChatGuess(game, check.word, message.displayName || message.user);
}

/* ---------------- Twitch ---------------- */

hub.on('message', handleChatMessage);
hub.on('status', status => {
    broadcast('twitch', status);
    console.log(`[twitch] #${status.channel}: ${status.error || (status.connected ? 'ok' : 'нет связи')}`);
});
hub.on('token-error', err => {
    console.error('[twitch] Ошибка токена:', err);
});

function connectChannel(channel, overrides) {
    const opts = Object.assign({}, config.twitch, overrides || {}, { channel: channel });
    if (!opts.oauthToken) {
        console.warn('[twitch] Нет oauthToken — подключение к каналу пропущено');
        return null;
    }
    if (!opts.nickname) {
        console.warn('[twitch] Не задан nickname (логин Twitch) — подключение пропущено');
        return null;
    }
    return hub.ensure(opts.channel, opts);
}

/* ---------------- HTTP ---------------- */

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon'
};

const STATIC_ROOTS = [
    { prefix: '/cows/', dir: path.join(ROOT, 'cows') },
    { prefix: '/wordle/', dir: path.join(ROOT, 'wordle') },
    { prefix: '/public/', dir: PUBLIC_DIR }
];

function serveStatic(req, res, pathname) {
    let target = null;

    if (pathname === '/' || pathname === '/index.html') {
        target = path.join(PUBLIC_DIR, 'index.html');
    } else if (pathname === '/board.html') {
        target = path.join(PUBLIC_DIR, 'board.html');
    } else {
        for (const root of STATIC_ROOTS) {
            if (!pathname.startsWith(root.prefix)) continue;
            const rel = pathname.slice(root.prefix.length);
            const resolved = path.resolve(root.dir, rel);
            if (resolved.startsWith(root.dir) && fs.existsSync(resolved) &&
                fs.statSync(resolved).isFile()) {
                target = resolved;
            }
            break;
        }
    }

    if (!target) {
        sendJson(res, 404, { error: 'Не найдено' });
        return;
    }

    const ext = path.extname(target).toLowerCase();
    res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': 'no-cache'
    });
    fs.createReadStream(target).pipe(res);
}

function sendJson(res, code, payload) {
    const body = JSON.stringify(payload);
    res.writeHead(code, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        'Cache-Control': 'no-store'
    });
    res.end(body);
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let raw = '';
        req.on('data', chunk => {
            raw += chunk;
            if (raw.length > 1e6) {
                req.destroy();
                reject(new Error('Слишком большой запрос'));
            }
        });
        req.on('end', () => {
            if (!raw) {
                resolve({});
                return;
            }
            try {
                resolve(JSON.parse(raw));
            } catch (e) {
                reject(new Error('Некорректный JSON'));
            }
        });
        req.on('error', reject);
    });
}

function isAdmin(req, query) {
    const key = req.headers['x-admin-key'] || (query && query.key);
    if (!key || !config.adminKey) return false;
    const a = Buffer.from(String(key));
    const b = Buffer.from(String(config.adminKey));
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

function twitchStatusList() {
    const list = [];
    hub.clients.forEach(client => list.push(client.status()));
    return list;
}

async function handleApi(req, res, parsed) {
    const pathname = parsed.pathname;
    const query = parsed.query;
    const method = req.method;

    /* --- служебное --- */
    if (pathname === '/api/status') {
        sendJson(res, 200, {
            ok: true,
            port: config.port,
            host: config.host,
            twitch: {
                configured: !!(config.twitch.oauthToken && config.twitch.nickname),
                channel: config.twitch.channel,
                nickname: config.twitch.nickname,
                authMode: config.twitch.authMode,
                allowList: config.twitch.allowList,
                clients: twitchStatusList()
            },
            authModes: AUTH_MODES,
            games: store.list().map(Game.summary),
            dictionary: { size: dictionary.size }
        });
        return;
    }

    if (pathname === '/api/config') {
        sendJson(res, 200, {
            channel: config.twitch.channel,
            nickname: config.twitch.nickname,
            authMode: config.twitch.authMode,
            allowList: config.twitch.allowList,
            authModes: AUTH_MODES,
            defaultLength: config.game.defaultLength,
            maxLength: config.game.maxLength,
            requireDictionary: config.game.requireDictionary !== false,
            rateLimit: config.twitch.rateLimit,
            hasToken: !!config.twitch.oauthToken
        });
        return;
    }

    /* --- игры --- */
    if (pathname === '/api/games' && method === 'GET') {
        sendJson(res, 200, { games: store.list().map(Game.summary) });
        return;
    }

    if (pathname === '/api/games' && method === 'POST') {
        if (!isAdmin(req, query)) {
            sendJson(res, 403, { error: 'Нужен админ-ключ' });
            return;
        }
        let body;
        try {
            body = await readBody(req);
        } catch (e) {
            sendJson(res, 400, { error: e.message });
            return;
        }

        const length = Number(body.length) || config.game.defaultLength;
        let word = String(body.word || '').trim().toLowerCase();
        if (word && !dictionary.has(word)) {
            sendJson(res, 400, { error: 'Такого слова нет в словаре' });
            return;
        }

        let game;
        try {
            game = Game.createGame({
                length: length,
                word: word,
                channel: body.channel !== undefined ? body.channel : config.twitch.channel,
                authMode: AUTH_MODES.includes(body.authMode) ? body.authMode : config.twitch.authMode,
                maxAttempts: Number(body.maxAttempts) || 0
            }, dictionary);
        } catch (e) {
            sendJson(res, 400, { error: e.message });
            return;
        }

        store.create(game);
        if (game.channel) {
            connectChannel(game.channel, {
                nickname: body.nickname || config.twitch.nickname,
                oauthToken: body.oauthToken || config.twitch.oauthToken
            });
        }
        broadcastGame(game);
        sendJson(res, 200, { game: Game.publicState(game, { reveal: true }) });
        return;
    }

    const gameMatch = /^\/api\/games\/([a-z0-9]+)(\/.*)?$/.exec(pathname);
    if (gameMatch) {
        const game = store.get(gameMatch[1]);
        if (!game) {
            sendJson(res, 404, { error: 'Игра не найдена' });
            return;
        }
        const action = gameMatch[2] || '';

        if (action === '' && method === 'GET') {
            sendJson(res, 200, { game: Game.publicState(game, { reveal: isAdmin(req, query) }) });
            return;
        }

        if (action === '/guess' && method === 'POST') {
            if (!isAdmin(req, query)) {
                sendJson(res, 403, { error: 'Нужен админ-ключ' });
                return;
            }
            let body;
            try {
                body = await readBody(req);
            } catch (e) {
                sendJson(res, 400, { error: e.message });
                return;
            }
            const text = String(body.text || body.word || '').trim();
            const check = Core.validateGuess(text, game.length, dictionary);
            if (!check.ok) {
                sendJson(res, 400, { error: Core.reasonText(check.reason) });
                return;
            }
            if (game.status !== Game.STATUS.ACTIVE) {
                sendJson(res, 400, { error: 'Игра уже окончена' });
                return;
            }
            applyChatGuess(game, check.word, body.author || 'ручной ввод');
            sendJson(res, 200, { game: Game.publicState(game, { reveal: true }) });
            return;
        }

        if (action === '/stop' && method === 'POST') {
            if (!isAdmin(req, query)) {
                sendJson(res, 403, { error: 'Нужен админ-ключ' });
                return;
            }
            game.status = Game.STATUS.STOPPED;
            game.finishedAt = new Date().toISOString();
            store.update(game);
            broadcastGame(game);
            sendJson(res, 200, { game: Game.publicState(game, { reveal: true }) });
            return;
        }

        if (action === '' && method === 'DELETE') {
            if (!isAdmin(req, query)) {
                sendJson(res, 403, { error: 'Нужен админ-ключ' });
                return;
            }
            store.remove(game.id);
            broadcast('games', store.list().map(Game.summary));
            sendJson(res, 200, { ok: true });
            return;
        }
    }

    /* --- Twitch --- */
    if (pathname === '/api/twitch/connect' && method === 'POST') {
        if (!isAdmin(req, query)) {
            sendJson(res, 403, { error: 'Нужен админ-ключ' });
            return;
        }
        let body;
        try {
            body = await readBody(req);
        } catch (e) {
            sendJson(res, 400, { error: e.message });
            return;
        }
        const channel = String(body.channel || '').replace(/^#/, '').toLowerCase();
        if (!channel) {
            sendJson(res, 400, { error: 'Нужен канал' });
            return;
        }
        const patch = {
            twitch: {
                channel: channel,
                nickname: body.nickname || config.twitch.nickname,
                oauthToken: body.oauthToken || config.twitch.oauthToken,
                authMode: AUTH_MODES.includes(body.authMode) ? body.authMode : config.twitch.authMode,
                allowList: Array.isArray(body.allowList) ? body.allowList : config.twitch.allowList
            }
        };
        saveLocalSettings(patch);
        Object.assign(config.twitch, patch.twitch);
        const client = connectChannel(channel, {});
        sendJson(res, 200, { ok: true, status: client ? client.status() : null });
        return;
    }

    if (pathname === '/api/twitch/disconnect' && method === 'POST') {
        if (!isAdmin(req, query)) {
            sendJson(res, 403, { error: 'Нужен админ-ключ' });
            return;
        }
        hub.disconnectAll();
        sendJson(res, 200, { ok: true });
        return;
    }

    sendJson(res, 404, { error: 'Неизвестный метод API' });
}

const server = http.createServer(async (req, res) => {
    const parsed = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsed.pathname;

    try {
        if (pathname.startsWith('/api/')) {
            if (pathname === '/api/events' && req.method === 'GET') {
                res.writeHead(200, {
                    'Content-Type': 'text/event-stream; charset=utf-8',
                    'Cache-Control': 'no-cache, no-transform',
                    'Connection': 'keep-alive',
                    'X-Accel-Buffering': 'no'
                });
                res.write('retry: 2000\n\n');
                sseClients.add(res);
                res._gameId = null;
                sseSend(res, 'hello', { ok: true, games: store.list().map(Game.summary) });
                const ping = setInterval(() => {
                    try { res.write(': ping\n\n'); } catch (e) { /* ignore */ }
                }, 20000);
                req.on('close', () => {
                    clearInterval(ping);
                    sseClients.delete(res);
                });
                return;
            }
            await handleApi(req, res, parsed);
            return;
        }

        if (req.method !== 'GET' && req.method !== 'HEAD') {
            sendJson(res, 405, { error: 'Метод не поддерживается' });
            return;
        }

        serveStatic(req, res, pathname);
    } catch (err) {
        console.error('[http] Ошибка:', err);
        sendJson(res, 500, { error: 'Внутренняя ошибка сервера' });
    }
});

server.listen(config.port, config.host, () => {
    console.log('');
    console.log('  🟩 Wordle-сервер запущен');
    console.log(`     Доска:      http://localhost:${config.port}/board.html`);
    console.log(`     Игра:       http://localhost:${config.port}/cows/wordle.html`);
    console.log(`     Админ-ключ: ${config.adminKey}`);
    console.log('');
    if (config.twitch.channel && config.twitch.oauthToken && config.twitch.nickname) {
        connectChannel(config.twitch.channel, {});
    } else {
        console.log('  [twitch] Канал не подключён: укажите канал, ник и oauthToken');
        console.log('           (см. server/README.md — как получить токен)');
    }
    console.log('');
});

process.on('SIGINT', () => {
    console.log('\n[server] Остановка...');
    hub.disconnectAll();
    server.close(() => process.exit(0));
});

module.exports = { server, config, store, dictionary };
