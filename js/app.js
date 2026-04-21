/**
 * Mini App - редирект на целевой URL без iframe.
 *
 * Зачем без iframe: целевой сайт использует first-party cookies
 * (tracking / session). При встраивании в iframe с чужого домена
 * браузеры блокируют third-party cookies → сайт не работает.
 *
 * Решение: полная навигация (window.location.replace) — пользователь
 * остаётся внутри Telegram WebView, cookies работают как first-party.
 */
(function () {
    'use strict';

    var tg  = (window.Telegram && window.Telegram.WebApp) || null;
    var cfg = window.APP_CONFIG || {};

    // ---- 1. Telegram WebApp SDK ----
    if (tg) {
        try { tg.ready(); } catch (e) {}
        try { tg.expand(); } catch (e) {}
    }

    // ---- 2. Построение целевого URL ----
    function buildTargetUrl() {
        var base = cfg.TARGET_BASE_URL || '';
        var parts = [];

        if (cfg.AFFILIATE_PARAM_NAME && cfg.AFFILIATE_PARAM_VALUE) {
            parts.push(
                encodeURIComponent(cfg.AFFILIATE_PARAM_NAME) + '=' +
                encodeURIComponent(cfg.AFFILIATE_PARAM_VALUE)
            );
        }

        var user = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
        var tgId = (user && user.id) ? user.id : 'unknown';
        parts.push('subid=' + encodeURIComponent(String(tgId)));

        var startParam = (tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param) || 'direct';
        parts.push('source=' + encodeURIComponent(String(startParam)));

        var sep = base.indexOf('?') === -1 ? '?' : '&';
        return base + sep + parts.join('&');
    }

    var targetUrl = buildTargetUrl();
    console.log('Target URL:', targetUrl);

    // ---- 3. Трекинг webapp_open (fire-and-forget) ----
    function trackOpen() {
        return new Promise(function (resolve) {
            if (!cfg.BOT_API_URL || !tg || !tg.initData) {
                return resolve();
            }
            try {
                var apiUrl = cfg.BOT_API_URL.replace(/\/$/, '') + '/webapp_event';
                fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        event: 'open',
                        initData: tg.initData,
                    }),
                    keepalive: true,
                })
                    .then(function (r) { console.log('webapp_event:', r.status); })
                    .catch(function (err) { console.warn('webapp_event failed:', err); })
                    .finally(resolve);

                // Таймаут на случай медленного бэка — не блокируем редирект дольше 1.5 сек
                setTimeout(resolve, 1500);
            } catch (e) {
                console.warn('trackOpen error:', e);
                resolve();
            }
        });
    }

    // ---- 4. Редирект ----
    // Задержка 600 мс: показываем спиннер чуть-чуть, чтобы не мигало,
    // и даём шанс улететь трекингу.
    function redirect() {
        // replace() — чтобы back-кнопка не возвращала на эту страницу
        window.location.replace(targetUrl);
    }

    var minDelay = new Promise(function (r) { setTimeout(r, 600); });

    Promise.all([minDelay, trackOpen()])
        .then(redirect)
        .catch(function (err) {
            console.error('Redirect flow error:', err);
            // Если что-то пошло не так — покажем кнопку ручного перехода
            var btn = document.getElementById('openBtn');
            if (btn) {
                btn.hidden = false;
                btn.href = targetUrl;
            }
        });

    // Fallback: если редирект почему-то не произошёл за 5 секунд — показать кнопку
    setTimeout(function () {
        var btn = document.getElementById('openBtn');
        if (btn && btn.hidden) {
            btn.hidden = false;
            btn.href = targetUrl;
        }
    }, 5000);

    // Клик по кнопке "Продолжить"
    var openBtn = document.getElementById('openBtn');
    if (openBtn) {
        openBtn.addEventListener('click', function (e) {
            e.preventDefault();
            redirect();
        });
    }
})();
