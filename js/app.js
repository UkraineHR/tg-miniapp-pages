/**
 * Mini App — редирект на целевой URL (Keitaro кампания) без iframe.
 *
 * Безопасный флоу:
 *   1. Получаем initData от Telegram WebApp SDK
 *   2. POST на бот /webapp_resolve с initData → бот ВАЛИДИРУЕТ HMAC + auth_date,
 *      возвращает external_id (непредсказуемый)
 *   3. Строим URL для Keitaro с external_id
 *   4. window.location.replace() — полный переход на Keitaro
 *
 * Если /webapp_resolve вернул ошибку или таймаут — **не редиректим** на raw
 * telegram_id. Показываем кнопку «Повторить».
 */
(function () {
    'use strict';

    var tg  = (window.Telegram && window.Telegram.WebApp) || null;
    var cfg = window.APP_CONFIG || {};

    // ---- 1. Init Telegram WebApp SDK ----
    if (tg) {
        try { tg.ready(); } catch (e) {}
        try { tg.expand(); } catch (e) {}

        // Fullscreen — НЕ на iOS/Android (casino-сайт ломает safe-area)
        var MOBILE_PLATFORMS = ['ios', 'android'];
        var isMobile = MOBILE_PLATFORMS.indexOf(tg.platform || '') !== -1;
        if (!isMobile) {
            setTimeout(function () {
                try {
                    if (typeof tg.requestFullscreen === 'function') {
                        tg.requestFullscreen();
                    }
                } catch (e) {}
            }, 100);
        }
    }

    // ---- UI helpers ----
    function setStatus(msg) {
        var el = document.getElementById('redirectText');
        if (el) el.textContent = msg;
    }

    function showRetryButton(label, onClick) {
        var btn = document.getElementById('openBtn');
        if (!btn) return;
        btn.textContent = label || 'Повторить';
        btn.hidden = false;
        btn.onclick = function (e) {
            e.preventDefault();
            btn.hidden = true;
            onClick();
        };
    }

    function showError(msg) {
        setStatus(msg);
        var spinner = document.querySelector('.spinner');
        if (spinner) spinner.style.display = 'none';
    }

    // ---- 2. Build target URL ----
    function buildTargetUrl(externalId, startParam) {
        var base = cfg.TARGET_BASE_URL || '';
        var parts = [];

        if (cfg.AFFILIATE_PARAM_NAME && cfg.AFFILIATE_PARAM_VALUE) {
            parts.push(
                encodeURIComponent(cfg.AFFILIATE_PARAM_NAME) + '=' +
                encodeURIComponent(cfg.AFFILIATE_PARAM_VALUE)
            );
        }
        // external_id — основной идентификатор. Никаких raw telegram_id здесь.
        parts.push('external_id=' + encodeURIComponent(externalId));
        parts.push('source=' + encodeURIComponent(String(startParam || 'direct')));

        var sep = base.indexOf('?') === -1 ? '?' : '&';
        return base + sep + parts.join('&');
    }

    // ---- 3. Resolve external_id (без fallback на telegram_id!) ----
    //
    // Резолв обязательный — если бэк недоступен, мы НЕ редиректим, а просим
    // повторить. Иначе вся защита от спам-постбэков теряется.
    function resolveExternalId() {
        return new Promise(function (resolve, reject) {
            if (!cfg.BOT_API_URL) {
                return reject(new Error('BOT_API_URL не задан'));
            }
            if (!tg || !tg.initData) {
                return reject(new Error('Нет initData (открой через Telegram)'));
            }

            var apiUrl = cfg.BOT_API_URL.replace(/\/$/, '') + '/webapp_resolve';
            var done = false;

            // 5 сек — последний дедлайн. Дольше юзер уже теряет терпение.
            var timeoutId = setTimeout(function () {
                if (done) return;
                done = true;
                reject(new Error('Таймаут связи с ботом'));
            }, 5000);

            fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ initData: tg.initData }),
            })
                .then(function (r) {
                    return r.json().then(function (data) {
                        return { status: r.status, data: data };
                    });
                })
                .then(function (res) {
                    if (done) return;
                    done = true;
                    clearTimeout(timeoutId);

                    if (res.status === 200 && res.data && res.data.external_id) {
                        resolve({
                            externalId: res.data.external_id,
                            startParam: res.data.start_param || '',
                        });
                    } else if (res.status === 404) {
                        reject(new Error('Сначала нажми /start у бота'));
                    } else if (res.status === 403) {
                        reject(new Error('Сессия устарела, перезапусти приложение'));
                    } else if (res.status === 429) {
                        reject(new Error('Слишком много запросов, подожди'));
                    } else {
                        reject(new Error('Ошибка ' + res.status));
                    }
                })
                .catch(function (err) {
                    if (done) return;
                    done = true;
                    clearTimeout(timeoutId);
                    reject(err);
                });
        });
    }

    // ---- 4. Main flow ----
    function start() {
        setStatus('Переходим...');

        Promise.all([
            new Promise(function (r) { setTimeout(r, 600); }),
            resolveExternalId(),
        ])
            .then(function (results) {
                var resolved = results[1];
                var targetUrl = buildTargetUrl(resolved.externalId, resolved.startParam);
                setStatus('Открываем сайт...');
                try {
                    window.location.replace(targetUrl);
                } catch (e) {
                    try { window.location.href = targetUrl; }
                    catch (e2) {
                        showError('Не получилось перейти');
                        showRetryButton('Открыть в браузере', function () {
                            window.open(targetUrl, '_blank');
                        });
                    }
                }
            })
            .catch(function (err) {
                console.warn('[app] resolve failed:', err);
                showError(String(err && err.message || err) || 'Ошибка');
                showRetryButton('Повторить', start);
            });
    }

    start();
})();
