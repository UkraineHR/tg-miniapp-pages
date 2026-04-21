/**
 * Mini App: инициализация Telegram WebApp SDK и загрузка iframe.
 *
 * Важно: из-за CORS/редиректов событие iframe.onload может не сработать,
 * даже если страница по факту загрузилась. Поэтому loader принудительно
 * скрывается через фиксированный таймаут (по умолчанию 3 сек), а "экран
 * ошибки" по таймауту отключён — он доступен только как ручной fallback.
 */
(function () {
    'use strict';

    // ---- 1. Telegram WebApp SDK ----
    var tg = (window.Telegram && window.Telegram.WebApp) || null;
    var cfg = window.APP_CONFIG || {};

    if (tg) {
        try { tg.ready(); } catch (e) {}
        try { tg.expand(); } catch (e) {}
        try { tg.enableClosingConfirmation(); } catch (e) {}

        // Фон — из темы Telegram (фолбэк — тёмный)
        try {
            var bg = (tg.themeParams && tg.themeParams.bg_color) || '#1a1a2e';
            document.body.style.backgroundColor = bg;
        } catch (e) {}
    }

    // ---- 2. Заголовок ----
    var titleEl = document.getElementById('appTitle');
    if (titleEl && cfg.APP_TITLE) {
        titleEl.textContent = cfg.APP_TITLE;
    }

    // ---- 3. Данные пользователя ----
    var user = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
    var telegramId = (user && user.id) ? user.id : 'unknown';
    var startParam = (tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param) || 'direct';

    // ---- 4. Сборка целевого URL ----
    function buildTargetUrl() {
        var base = cfg.TARGET_BASE_URL || '';
        var parts = [];

        if (cfg.AFFILIATE_PARAM_NAME && cfg.AFFILIATE_PARAM_VALUE) {
            parts.push(
                encodeURIComponent(cfg.AFFILIATE_PARAM_NAME) + '=' +
                encodeURIComponent(cfg.AFFILIATE_PARAM_VALUE)
            );
        }
        parts.push('subid=' + encodeURIComponent(String(telegramId)));
        parts.push('source=' + encodeURIComponent(String(startParam)));

        // Учитываем, если в base уже есть query
        var sep = base.indexOf('?') === -1 ? '?' : '&';
        return base + sep + parts.join('&');
    }

    var targetUrl = buildTargetUrl();

    // ---- 4.5. Трекинг открытия Mini App ----
    // Шлём на бота POST /webapp_event с подписанным initData.
    // Это работает только если BOT_API_URL задан и бот поднят на HTTPS.
    function trackWebAppOpen() {
        if (!cfg.BOT_API_URL || !tg || !tg.initData) return;

        try {
            fetch(cfg.BOT_API_URL.replace(/\/$/, '') + '/webapp_event', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    event: 'open',
                    initData: tg.initData,
                }),
                // Не блокируем UI — fire-and-forget
                keepalive: true,
            }).then(function (r) {
                console.log('webapp_event response:', r.status);
            }).catch(function (err) {
                console.warn('webapp_event failed:', err);
            });
        } catch (e) {
            console.warn('trackWebAppOpen error:', e);
        }
    }

    // Трекаем сразу после инициализации (не ждём iframe)
    trackWebAppOpen();

    // ---- 5. Загрузка iframe ----
    var frame    = document.getElementById('appFrame');
    var loader   = document.getElementById('loader');
    var fallback = document.getElementById('fallback');

    // Таймаут принудительного скрытия loader (из конфига, fallback 3 сек)
    var HIDE_LOADER_AFTER = (typeof cfg.LOAD_TIMEOUT === 'number')
        ? cfg.LOAD_TIMEOUT
        : 3000;

    var loaderHidden = false;
    function hideLoader() {
        if (loaderHidden) return;
        loaderHidden = true;
        if (loader) loader.classList.add('hidden');
        console.log('Loader hidden');
    }

    if (frame) {
        // Скрываем loader по onload (срабатывает при нормальной загрузке)
        frame.addEventListener('load', function () {
            console.log('iframe onload fired');
            hideLoader();
        });

        // Принудительное скрытие — на случай CORS/редиректов, когда onload не стрельнёт
        setTimeout(function () {
            if (!loaderHidden) {
                console.log('Forced loader hide after ' + HIDE_LOADER_AFTER + 'ms');
                hideLoader();
            }
        }, HIDE_LOADER_AFTER);

        frame.src = targetUrl;
    }

    // ---- 6. Закрытие (крестик в header) ----
    function closeApp() {
        try {
            if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
        } catch (e) {}
        try {
            if (tg && tg.close) tg.close();
        } catch (e) {}
    }

    var closeBtn = document.getElementById('closeBtn');
    if (closeBtn) closeBtn.addEventListener('click', closeApp);

    // ---- 7. Ручной fallback: "Открыть в браузере" ----
    // Экран ошибки автоматически НЕ показывается (CORS мешает определить реальную загрузку),
    // но кнопка под ним остаётся функциональной, если экран показать вручную.
    function openInBrowser() {
        try {
            if (tg && typeof tg.openLink === 'function') {
                tg.openLink(targetUrl);
                if (tg.close) tg.close();
                return;
            }
        } catch (e) {}
        window.open(targetUrl, '_blank');
    }

    var openBtn = document.getElementById('openBrowserBtn');
    if (openBtn) openBtn.addEventListener('click', openInBrowser);

    // ---- 8. Системная кнопка "Назад" Telegram ----
    if (tg && tg.BackButton) {
        try {
            tg.BackButton.show();
            tg.BackButton.onClick(function () {
                closeApp();
            });
        } catch (e) {}
    }

    // Экспорт на случай, если где-то в HTML остались onclick="..."
    window.closeApp = closeApp;
    window.openInBrowser = openInBrowser;

    // ---- Debug ----
    console.log('WebApp initialized');
    console.log('Telegram ID:', telegramId);
    console.log('Source:', startParam);
    console.log('Target URL:', targetUrl);
})();
