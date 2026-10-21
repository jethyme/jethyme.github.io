/*
 * Минимальный клиент Twitch IRC без внешних зависимостей.
 * Читает сообщения из чата канала вместе с тегами (badges, display-name),
 * чтобы понимать: кто подписчик, кто модератор, кто бот.
 *
 * Токен: OAuth-токен пользователя Twitch со scope chat:read.
 */
const tls = require('tls');
const EventEmitter = require('events');

const IRC_HOST = 'irc.chat.twitch.tv';
const IRC_PORT = 6697;

const AUTH_MODES = ['subscribers', 'whitelist', 'approved', 'all'];

/* Разбор IRC-тегов вида @key=value;key2=value2 */
function parseTags(raw) {
    const tags = {};
    if (!raw) return tags;
    raw.split(';').forEach(part => {
        if (!part) return;
        const idx = part.indexOf('=');
        if (idx === -1) return;
        const key = part.slice(0, idx);
        const value = part.slice(idx + 1);
        tags[key] = decodeURIComponent(value.replace(/\+/g, ' '));
    });
    return tags;
}

/* Бейджи вида subscriber/12,moderator/1 -> ['subscriber','moderator'] */
function badgeNames(badges) {
    if (!badges) return [];
    return badges.split(',').map(b => b.split('/')[0]).filter(Boolean);
}

/* Проверка доступа участника чата.
 * authMode: 'subscribers' — подписчики, модераторы, VIP и владелец канала;
 *            'whitelist'  — только пользователи из allowList;
 *            'approved'   — только те, кому админ выдал право (users.json);
 *            'all'        — все подряд (для отладки). */
function checkAccess(user, tags, options) {
    const opts = options || {};
    const mode = AUTH_MODES.includes(opts.authMode) ? opts.authMode : 'subscribers';
    const allowList = (opts.allowList || []).map(u => String(u).toLowerCase());
    const approved = (opts.approvedLogins || []).map(u => String(u).toLowerCase());
    const channel = String(opts.channel || '').toLowerCase();
    const name = String(user || '').toLowerCase();

    const badges = badgeNames(tags.badges);
    const isSubscriber = badges.includes('subscriber') || badges.includes('founder') ||
        tags.subscriber === '1';
    const isModerator = badges.includes('moderator') || tags.mod === '1';
    const isVip = badges.includes('vip') || tags.vip === '1';
    const isBroadcaster = channel && name === channel;

    if (allowList.includes(name)) return true;
    if (mode === 'all') return true;
    if (mode === 'approved') return approved.includes(name) || isBroadcaster;
    if (mode === 'whitelist') return isBroadcaster;
    return isSubscriber || isModerator || isVip || isBroadcaster;
}

class TwitchClient extends EventEmitter {
    constructor(options) {
        super();
        this.channel = String(options.channel || '').replace(/^#/, '').toLowerCase();
        this.nickname = String(options.nickname || '').toLowerCase();
        this.token = String(options.token || '').replace(/^oauth:/i, '');
        this.authMode = AUTH_MODES.includes(options.authMode) ? options.authMode : 'subscribers';
        this.allowList = (options.allowList || []).map(u => String(u).toLowerCase());
        this.approvedLogins = (options.approvedLogins || []).map(u => String(u).toLowerCase());
        this.ignoreBots = options.ignoreBots !== false;

        this.socket = null;
        this.connected = false;
        this.authenticated = false;
        this.closedByUs = false;
        this.retryCount = 0;
        this.retryTimer = null;
        this.buffer = '';
    }

    /* ---------- Авторизация участника чата ---------- */
    isAuthorized(user, tags) {
        return checkAccess(user, tags, {
            authMode: this.authMode,
            allowList: this.allowList,
            approvedLogins: this.approvedLogins,
            channel: this.channel
        });
    }

    isBot(tags) {
        const badges = badgeNames(tags.badges);
        if (badges.includes('bot')) return true;
        return /bot/i.test(String(tags.display_name || ''));
    }

    /* ---------- Подключение ---------- */
    connect() {
        this.closedByUs = false;
        this.emit('status', this.status());

        if (!this.channel || !this.nickname || !this.token) {
            this.emit('status', this.status('Не заданы channel / nickname / oauthToken'));
            return;
        }

        const socket = tls.connect({
            host: IRC_HOST,
            port: IRC_PORT,
            servername: IRC_HOST
        }, () => {
            this.connected = true;
            this.retryCount = 0;
            socket.write('CAP REQ :twitch.tv/tags twitch.tv/commands\r\n');
            socket.write(`PASS oauth:${this.token}\r\n`);
            socket.write(`NICK ${this.nickname}\r\n`);
            this.emit('status', this.status('Подключение к Twitch…'));
        });

        this.socket = socket;

        socket.setEncoding('utf8');
        socket.on('data', chunk => this.onData(chunk));
        socket.on('error', err => {
            this.emit('status', this.status('Ошибка сокета: ' + err.message));
            this.emit('error', err);
        });
        socket.on('close', () => {
            this.connected = false;
            this.authenticated = false;
            this.emit('status', this.status('Соединение закрыто'));
            this.scheduleReconnect();
        });
    }

    onData(chunk) {
        this.buffer += chunk;
        let idx;
        while ((idx = this.buffer.indexOf('\n')) !== -1) {
            const raw = this.buffer.slice(0, idx).replace(/\r$/, '');
            this.buffer = this.buffer.slice(idx + 1);
            this.handleLine(raw);
        }
    }

    handleLine(raw) {
        if (!raw) return;

        let tags = {};
        let rest = raw;
        if (raw.startsWith('@')) {
            const spaceIdx = raw.indexOf(' ');
            tags = parseTags(raw.slice(1, spaceIdx === -1 ? raw.length : spaceIdx));
            rest = spaceIdx === -1 ? '' : raw.slice(spaceIdx + 1);
        }

        if (rest.startsWith('PING')) {
            this.send('PONG :' + (rest.slice(5).trim() || 'tmi.twitch.tv'));
            return;
        }

        if (rest.startsWith('PONG')) return;

        if (rest.startsWith('NOTICE')) {
            const notice = rest.split(' : ').slice(1).join(' ');
            if (/Login authentication failed|improperly formatted auth token/i.test(notice)) {
                this.emit('status', this.status('Токен отклонён Twitch: ' + notice.trim()));
                this.emit('token-error', notice.trim());
            }
            return;
        }

        const match = /^:([^!]+)![^ ]+ PRIVMSG (#\S+)\s*:([\s\S]*)$/.exec(rest);
        if (!match) {
            if (rest.startsWith('001')) {
                this.authenticated = true;
                this.emit('status', this.status('Авторизация пройдена'));
                this.join();
            }
            return;
        }

        const user = match[1].toLowerCase();
        const channel = match[2].replace('#', '').toLowerCase();
        const text = match[3];

        if (this.ignoreBots && this.isBot(tags)) return;

        this.emit('message', {
            channel: channel,
            user: user,
            displayName: tags['display-name'] || user,
            text: text,
            tags: tags,
            badges: badgeNames(tags.badges),
            authorized: this.isAuthorized(user, tags),
            subscriber: badgeNames(tags.badges).includes('subscriber') ||
                badgeNames(tags.badges).includes('founder') || tags.subscriber === '1',
            moderator: badgeNames(tags.badges).includes('moderator') || tags.mod === '1'
        });
    }

    join() {
        this.send(`JOIN #${this.channel}`);
        this.emit('status', this.status(`В канале #${this.channel}`));
    }

    send(line) {
        if (this.socket && !this.socket.destroyed) {
            this.socket.write(line + '\r\n');
        }
    }

    status(error) {
        return {
            connected: this.connected,
            authenticated: this.authenticated,
            channel: this.channel,
            nickname: this.nickname,
            authMode: this.authMode,
            error: error || null
        };
    }

    scheduleReconnect() {
        if (this.closedByUs) return;
        if (this.retryTimer) return;
        const delay = Math.min(30000, 1000 * Math.pow(2, this.retryCount));
        this.retryCount++;
        this.emit('status', this.status(`Переподключение через ${Math.round(delay / 1000)} с…`));
        this.retryTimer = setTimeout(() => {
            this.retryTimer = null;
            this.connect();
        }, delay);
    }

    disconnect() {
        this.closedByUs = true;
        if (this.retryTimer) {
            clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }
        if (this.socket) {
            try { this.socket.end(); } catch (e) { /* ignore */ }
            this.socket.destroy();
        }
        this.socket = null;
        this.connected = false;
        this.authenticated = false;
    }
}

/* Менеджер клиентов: по одному соединению на канал. */
class TwitchHub extends EventEmitter {
    constructor() {
        super();
        this.clients = new Map();
    }

    ensure(channel, options) {
        const key = String(channel || '').replace(/^#/, '').toLowerCase();
        if (!key) return null;
        const existing = this.clients.get(key);
        if (existing && existing.nickname === String(options.nickname || '').toLowerCase() &&
            existing.token === String(options.token || '').replace(/^oauth:/i, '')) {
            existing.authMode = options.authMode || existing.authMode;
            existing.allowList = options.allowList || existing.allowList;
            existing.approvedLogins = options.approvedLogins || existing.approvedLogins;
            return existing;
        }
        if (existing) {
            existing.disconnect();
            this.clients.delete(key);
        }
        const client = new TwitchClient(Object.assign({}, options, { channel: key }));
        client.on('status', status => this.emit('status', status));
        client.on('message', message => this.emit('message', message));
        client.on('token-error', err => this.emit('token-error', err));
        client.connect();
        this.clients.set(key, client);
        return client;
    }

    get(channel) {
        return this.clients.get(String(channel || '').replace(/^#/, '').toLowerCase()) || null;
    }

    disconnectAll() {
        this.clients.forEach(client => client.disconnect());
        this.clients.clear();
    }
}

module.exports = { TwitchClient, TwitchHub, checkAccess, parseTags, badgeNames, AUTH_MODES };
