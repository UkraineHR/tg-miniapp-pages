// ==========================================================
//  Конфигурация Mini App. Редактируется без правки app.js.
// ==========================================================
window.APP_CONFIG = {
    // Базовый URL внешнего сервиса, который откроется внутри iframe
    TARGET_BASE_URL: "https://luckywinplay.shop/",

    // Имя affiliate-параметра в URL
    AFFILIATE_PARAM_NAME: "partner",

    // Значение affiliate-параметра (ваш партнёрский ID)
    AFFILIATE_PARAM_VALUE: "YOUR_PARTNER_ID",

    // Название в заголовке (header)
    APP_TITLE: "LuckyWinPlay",

    // Таймаут принудительного скрытия loader, мс.
    LOAD_TIMEOUT: 3000,

    // URL HTTP-сервера бота для трекинга событий.
    // Заполни после деплоя бота на Railway, например:
    //   "https://my-bot.up.railway.app"
    // Оставить пустым, если трекинг не нужен (только iframe).
    BOT_API_URL: "",
};
