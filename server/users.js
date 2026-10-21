/*
 * Реестр пользователей, авторизовавшихся через Twitch.
 *
 * Хранит всех, кто когда-либо заходил через Twitch, и право (approved),
 * которое админ выдаёт вручную. Без права пользователь не может играть.
 *
 * Файл: server/data/users.json (в git не попадает).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function newToken() {
    return crypto.randomBytes(24).toString('hex');
}

class UserStore {
    constructor(file) {
        this.file = file;
        this.users = new Map();   // id -> user
        this.sessions = new Map(); // token -> userId
        this.load();
    }

    load() {
        try {
            const raw = fs.readFileSync(this.file, 'utf8');
            const data = JSON.parse(raw);
            (data.users || []).forEach(user => this.users.set(String(user.id), user));
            (data.sessions || []).forEach(s => this.sessions.set(s.token, s.userId));
            console.log(`[users] Загружено пользователей: ${this.users.size}`);
        } catch (e) {
            if (e.code !== 'ENOENT') {
                console.error('[users] Не удалось прочитать файл пользователей:', e.message);
            }
            console.log('[users] Файл пользователей не найден — начинаем с пустого списка');
        }
    }

    save() {
        const dir = path.dirname(this.file);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const tmp = this.file + '.tmp';
        const payload = JSON.stringify({
            users: Array.from(this.users.values()),
            sessions: Array.from(this.sessions.entries()).map(([token, userId]) => ({ token, userId }))
        }, null, 2);
        fs.writeFileSync(tmp, payload, 'utf8');
        fs.renameSync(tmp, this.file);
    }

    /* Регистрация/обновление профиля после входа через Twitch */
    upsert(profile) {
        const id = String(profile.id || '').trim();
        if (!id) throw new Error('Twitch не вернул id пользователя');
        const login = String(profile.login || '').toLowerCase();
        const now = new Date().toISOString();

        let user = this.users.get(id);
        if (!user) {
            user = {
                id: id,
                login: login,
                displayName: profile.displayName || login || id,
                approved: false,
                source: profile.source || 'twitch',
                firstSeenAt: now,
                approvedAt: null,
                lastSeenAt: now
            };
            this.users.set(id, user);
        } else {
            if (login) user.login = login;
            if (profile.displayName) user.displayName = profile.displayName;
            user.lastSeenAt = now;
        }
        this.save();
        return user;
    }

    get(id) {
        return this.users.get(String(id || '')) || null;
    }

    byLogin(login) {
        const name = String(login || '').toLowerCase();
        if (!name) return null;
        for (const user of this.users.values()) {
            if (String(user.login || '').toLowerCase() === name) return user;
        }
        return null;
    }

    list() {
        return Array.from(this.users.values()).sort((a, b) =>
            String(b.lastSeenAt || '').localeCompare(String(a.lastSeenAt || '')));
    }

    setApproved(id, approved) {
        const user = this.get(id);
        if (!user) return null;
        user.approved = !!approved;
        user.approvedAt = user.approved ? new Date().toISOString() : null;
        this.save();
        return user;
    }

    /* Одобрить ник, который ещё не заходил через сайт (игрок из чата) */
    approveLogin(login, displayName) {
        const name = String(login || '').toLowerCase().trim();
        if (!name) return null;
        let user = this.byLogin(name);
        if (!user) {
            user = {
                id: 'login:' + name,
                login: name,
                displayName: displayName || name,
                approved: true,
                source: 'manual',
                firstSeenAt: new Date().toISOString(),
                approvedAt: new Date().toISOString(),
                lastSeenAt: new Date().toISOString()
            };
            this.users.set(user.id, user);
        } else {
            user.approved = true;
            user.approvedAt = new Date().toISOString();
        }
        this.save();
        return user;
    }

    /* Логины всех, кому выдано право (для проверки доступа из чата) */
    approvedLogins() {
        const list = [];
        this.users.forEach(user => {
            if (user.approved && user.login) list.push(String(user.login).toLowerCase());
        });
        return list;
    }

    createSession(userId) {
        const token = newToken();
        this.sessions.set(token, String(userId));
        this.save();
        return token;
    }

    userBySession(token) {
        if (!token) return null;
        const userId = this.sessions.get(String(token));
        if (!userId) return null;
        return this.get(userId);
    }

    destroySession(token) {
        if (!token) return false;
        const ok = this.sessions.delete(String(token));
        if (ok) this.save();
        return ok;
    }
}

/* Публичное представление пользователя (без токенов) */
function publicUser(user) {
    if (!user) return null;
    return {
        id: user.id,
        login: user.login,
        displayName: user.displayName || user.login,
        approved: !!user.approved,
        source: user.source || 'twitch',
        firstSeenAt: user.firstSeenAt || null,
        approvedAt: user.approvedAt || null,
        lastSeenAt: user.lastSeenAt || null
    };
}

module.exports = { UserStore, publicUser };
