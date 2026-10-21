/*
 * Вход и проверка токенов Twitch.
 *
 * Пользователь нажимает «Войти через Twitch» → открывается страница Twitch
 * (OAuth implicit grant) → токен возвращается в адрес страницы → браузер
 * отдаёт его серверу → сервер проверяет токен через Twitch и запоминает
 * пользователя в реестре (server/data/users.json).
 */
const AUTH_URL = 'https://id.twitch.tv/oauth2/authorize';
const VALIDATE_URL = 'https://id.twitch.tv/oauth2/validate';
const USERS_URL = 'https://api.twitch.tv/helix/users';

const DEFAULT_SCOPES = ['openid', 'user:read:email'];

function buildAuthorizeUrl(options) {
    const opts = options || {};
    if (!opts.clientId) throw new Error('Не задан Twitch Client ID');
    const params = new URLSearchParams({
        client_id: opts.clientId,
        redirect_uri: opts.redirectUri || 'http://localhost:3123/wordle/wordle.html',
        response_type: 'token',
        scope: (opts.scopes || DEFAULT_SCOPES).join(' '),
        state: opts.state || String(Date.now())
    });
    return AUTH_URL + '?' + params.toString();
}

/* Проверка токена: возвращает {id, login, clientId, scopes} */
async function validateToken(accessToken) {
    const token = String(accessToken || '').replace(/^oauth:/i, '').trim();
    if (!token) throw new Error('Пустой токен');

    const res = await fetch(VALIDATE_URL, {
        headers: { Authorization: 'Bearer ' + token }
    });
    if (!res.ok) {
        throw new Error(res.status === 401
            ? 'Twitch отклонил токен (401). Войдите заново'
            : 'Twitch не ответил корректно (' + res.status + ')');
    }
    const data = await res.json();
    return {
        id: String(data.user_id || ''),
        login: String(data.login || '').toLowerCase(),
        clientId: data.client_id || '',
        scopes: data.scopes || [],
        expiresIn: data.expires_in || 0
    };
}

/* Отображаемое имя (best effort: нужен clientId и scope user:read:email) */
async function fetchDisplayName(userId, accessToken, clientId) {
    if (!clientId) return null;
    try {
        const res = await fetch(USERS_URL + '?id=' + encodeURIComponent(userId), {
            headers: {
                'Client-Id': clientId,
                Authorization: 'Bearer ' + String(accessToken || '').replace(/^oauth:/i, '')
            }
        });
        if (!res.ok) return null;
        const data = await res.json();
        const user = (data.data || [])[0];
        return user ? (user.display_name || user.login || null) : null;
    } catch (e) {
        return null;
    }
}

module.exports = { buildAuthorizeUrl, validateToken, fetchDisplayName, DEFAULT_SCOPES };
