const fs = require('fs');
const path = require('path');

class Store {
    constructor(file) {
        this.file = file;
        this.games = new Map();
        this.load();
    }

    load() {
        try {
            const raw = fs.readFileSync(this.file, 'utf8');
            const data = JSON.parse(raw);
            (data.games || []).forEach(game => this.games.set(game.id, game));
            console.log(`[store] Загружено игр: ${this.games.size}`);
        } catch (e) {
            if (e.code !== 'ENOENT') {
                console.error('[store] Не удалось прочитать файл игр:', e.message);
            }
            this.games.set = this.games.set;
            console.log('[store] Файл игр не найден — начинаем с пустого списка');
        }
    }

    save() {
        const dir = path.dirname(this.file);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const tmp = this.file + '.tmp';
        const payload = JSON.stringify({ games: Array.from(this.games.values()) }, null, 2);
        fs.writeFileSync(tmp, payload, 'utf8');
        fs.renameSync(tmp, this.file);
    }

    create(game) {
        this.games.set(game.id, game);
        this.save();
        return game;
    }

    get(id) {
        return this.games.get(id) || null;
    }

    list() {
        return Array.from(this.games.values()).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    }

    remove(id) {
        const ok = this.games.delete(id);
        if (ok) this.save();
        return ok;
    }

    update(game) {
        this.games.set(game.id, game);
        this.save();
        return game;
    }
}

module.exports = { Store };
