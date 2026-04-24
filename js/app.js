/**
 * Mini App — редирект на целевой URL (Keitaro кампания) без iframe.
 *
 * Флоу:
 *   1. Получаем initData от Telegram WebApp SDK
 *   2. POST на бот /webapp_resolve с initData → бот возвращает external_id юзера
 *      (непредсказуемый идентификатор, маппится на telegram_id только в БД бота)
 *   3. Строим URL для Keitaro с external_id (не raw telegram_id для безопасности)
 *   4. window.location.replace() — полный переход на Keitaro
 *
 * Cookie работают first-party, iframe не используем.
 */
(function () {
    'use strict';

    var tg  = (window.Telegram && window.Telegram.WebApp) || null;
    var cfg = window.APP_CONFIG || {};

    // ---- Debug panel (при ?debug=1) ----
    var _debugStatus = '';
    function showDebug(line) {
        _debugStatus += line + '\n';
        var el = document.getElementById('debugInfo');
        if (!el) {
            el = document.createElement('div');
            el.id = 'debugInfo';
            el.style.cssText = 'position:fixed;top:8px;left:8px;right:8px;padding:8px;' +
                'background:rgba(0,0,0,.75);color:#39FF14;font:11px monospace;' +
                'z-index:9999;border-radius:6px;white-space:pre-wrap;max-height:40vh;overflow:auto';
            document.body && document.body.appendChild(el);
        }
        el.textContent = _debugStatus;
    }
    var DEBUG_MODE = /[?&]debug=1\b/.test(window.location.search);

    // ---- 1. Инициализация Telegram WebApp SDK ----
    if (tg) {
        try { tg.ready(); } catch (e) {}
        try { tg.expand(); } catch (e) {}

        if (DEBUG_MODE) {
            showDebug('tg.version = ' + tg.version);
            showDebug('tg.platform = ' + tg.platform);
            showDebug('requestFullscreen exists = ' + (typeof tg.requestFullscreen === 'function'));
            showDebug('isFullscreen initial = ' + tg.isFullscreen);
        }

        // Fullscreen события — только для диагностики
        try {
            tg.onEvent && tg.onEvent('fullscreenFailed', function (data) {
                console.warn('[FS] failed:', JSON.stringify(data));
                if (DEBUG_MODE) showDebug('FS FAILED: ' + JSON.stringify(data));
            });
            tg.onEvent && tg.onEvent('fullscreenChanged', function () {
                console.log('[FS] isFullscreen=', tg.isFullscreen);
                if (DEBUG_MODE) showDebug('FS CHANGED: isFullscreen=' + tg.isFullscreen);
            });
        } catch (e) { /* ignore */ }

        // Fullscreen — НЕ на iOS/Android (casino-сайт ломает safe-area)
        var MOBILE_PLATFORMS = ['ios', 'android'];
        var isMobile = MOBILE_PLATFORMS.indexOf(tg.platform || '') !== -1;
        if (DEBUG_MODE) showDebug('Platform: ' + tg.platform + ' | isMobile=' + isMobile);

        if (!isMobile) {
            setTimeout(function () {
                try {
                    if (typeof tg.requestFullscreen === 'function') {
                        tg.requestFullscreen();
                        if (DEBUG_MODE) showDebug('Calling requestFullscreen()...');
                    }
                } catch (e) {
                    if (DEBUG_MODE) showDebug('ERROR fullscreen: ' + e);
                }
            }, 100);
        }
    }

    // ---- UI-статус ----
    function setStatus(msg) {
        var el = document.getElementById('redirectText');
        if (el) el.textContent = msg;
        console.log('[app]', msg);
    }
    setStatus('Переходим...');

    // ---- 2. Построение целевого URL (Keitaro campaign) ----
    //
    // external_id — непредсказуемый ID юзера в нашей БД.
    // startParam — deep-link tag из /start?start=...
    // affiliate — partner-параметр если задан в config.js
    function buildTargetUrl(externalId, startParam) {
        var base = cfg.TARGET_BASE_URL || '';
        var parts = [];

        if (cfg.AFFILIATE_PARAM_NAME && cfg.AFFILIATE_PARAM_VALUE) {
            parts.push(
                encodeURIComponent(cfg.AFFILIATE_PARAM_NAME) + '=' +
                encodeURIComponent(cfg.AFFILIATE_PARAM_VALUE)
            );
        }

        // external_id — основной идентификатор (вместо raw telegram_id)
        parts.push('external_id=' + encodeURIComponent(externalId || 'unknown'));

        parts.push('source=' + encodeURIComponent(String(startParam || 'direct')));

        var sep = base.indexOf('?') === -1 ? '?' : '&';
        return base + sep + parts.join('&');
    }

    // ---- 3. Получение external_id от бота ----
    //
    // Mini-app отдаёт initData (подписанный Telegram). Бот валидирует HMAC
    // и возвращает external_id для юзера. Если бот недоступен или URL не задан —
    // fallback: используем telegram_id напрямую (для backward-compat).
    function resolveExternalId() {
        return new Promise(function (resolve) {
            if (!cfg.BOT_API_URL || !tg || !tg.initData) {
                // Нет бэка или initData — fallback на telegram_id
                var user = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
                var fallback = (user && user.id) ? String(user.id) : 'unknown';
                if (DEBUG_MODE) showDebug('No BOT_API_URL, fallback: ' + fallback);
                return resolve({
                    externalId: fallback,
                    startParam: (tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param) || '',
                });
            }

            var apiUrl = cfg.BOT_API_URL.replace(/\/$/, '') + '/webapp_resolve';
            if (DEBUG_MODE) showDebug('Resolving external_id via ' + apiUrl);

            var done = false;
            var finishOnce = function (result) {
                if (done) return;
                done = true;
                resolve(result);
            };

            // Таймаут 2 сек — если бот тормозит, не мучаем юзера
            setTimeout(function () {
                if (!done) {
                    console.warn('[resolve] timeout, using fallback');
                    if (DEBUG_MODE) showDebug('Resolve TIMEOUT, fallback');
                    var user = tg.initDataUnsafe && tg.initDataUnsafe.user;
                    finishOnce({
                        externalId: (user && user.id) ? String(user.id) : 'unknown',
                        startParam: (tg.initDataUnsafe && tg.initDataUnsafe.start_param) || '',
                    });
                }
            }, 2000);

            fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ initData: tg.initData }),
            })
                .then(function (r) {
                    return r.json().then(function (data) { return { ok: r.ok, data: data }; });
                })
                .then(function (res) {
                    if (res.ok && res.data && res.data.external_id) {
                        if (DEBUG_MODE) showDebug('Got external_id: ' + res.data.external_id);
                        finishOnce({
                            externalId: res.data.external_id,
                            startParam: res.data.start_param || '',
                        });
                    } else {
                        console.warn('[resolve] bad response:', res);
                        if (DEBUG_MODE) showDebug('Resolve failed, fallback');
                        var user = tg.initDataUnsafe && tg.initDataUnsafe.user;
                        finishOnce({
                            externalId: (user && user.id) ? String(user.id) : 'unknown',
                            startParam: (tg.initDataUnsafe && tg.initDataUnsafe.start_param) || '',
                        });
                    }
                })
                .catch(function (err) {
                    console.warn('[resolve] fetch error:', err);
                    if (DEBUG_MODE) showDebug('Resolve ERROR: ' + err);
                    var user = tg.initDataUnsafe && tg.initDataUnsafe.user;
                    finishOnce({
                        externalId: (user && user.id) ? String(user.id) : 'unknown',
                        startParam: (tg.initDataUnsafe && tg.initDataUnsafe.start_param) || '',
                    });
                });
        });
    }

    // ---- 4. Главный флоу ----
    var minDelay = new Promise(function (r) { setTimeout(r, 600); });

    Promise.all([minDelay, resolveExternalId()])
        .then(function (results) {
            var resolved = results[1];
            var targetUrl = buildTargetUrl(resolved.externalId, resolved.startParam);
            console.log('[app] Target URL:', targetUrl);

            if (DEBUG_MODE) {
                showDebug('Target: ' + targetUrl);
                showDebug('REDIRECT SKIPPED (debug mode)');
                // В debug даём кнопку для ручного перехода
                var btn = document.getElementById('openBtn');
                if (btn) {
                    btn.hidden = false;
                    btn.href = targetUrl;
                }
                return;
            }

            // Редирект
            setStatus('Открываем сайт...');
            try {
                window.location.replace(targetUrl);
            } catch (e) {
                try {
                    window.location.href = targetUrl;
                } catch (e2) {
                    var btn = document.getElementById('openBtn');
                    if (btn) { btn.hidden = false; btn.href = targetUrl; }
                }
            }
        })
        .catch(function (err) {
            console.error('[app] flow error:', err);
            if (DEBUG_MODE) showDebug('FATAL: ' + err);
        });

    // Fallback на случай если что-то пошло не так — кнопка через 5 сек
    setTimeout(function () {
        var btn = document.getElementById('openBtn');
        if (btn && btn.hidden) {
            // Строим URL с fallback-данными если resolveExternalId ещё не завершился
            var user = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
            var fallbackUrl = buildTargetUrl(
                (user && user.id) ? String(user.id) : 'unknown',
                (tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param) || ''
            );
            btn.hidden = false;
            btn.href = fallbackUrl;
        }
    }, 5000);

    // Ручной клик по кнопке "Продолжить"
    var openBtn = document.getElementById('openBtn');
    if (openBtn) {
        openBtn.addEventListener('click', function (e) {
            e.preventDefault();
            if (openBtn.href) {
                window.location.href = openBtn.href;
            }
        });
    }
})();
