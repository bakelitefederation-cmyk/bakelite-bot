// ============================================
// 🛡️ Bakelite Bot v3.4 — Polling, Fixed Inline Buttons
// ============================================

const TelegramBot = require("node-telegram-bot-api");
require("dotenv").config();

// ================== CONFIG ==================
const CONFIG = {
    TOKEN: process.env.BOT_TOKEN,
    ADMIN_IDS: process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(",") : [], // список админов
    VERSION: "3.4.0",
};

if (!CONFIG.TOKEN) {
    console.error("❌ Отсутствует BOT_TOKEN!");
    process.exit(1);
}

// ================== DATA STORE ==================
const dataStore = {
    pendingDefenders: new Map(),
    defenders: new Map(),
    pendingReports: new Map(),
    activeReports: new Map(),
    sessions: new Map(),
    states: new Map(),
};

// ================== BOT INIT ==================
// обязательно разрешаем polling включать callback_query
const bot = new TelegramBot(CONFIG.TOKEN, {
    polling: {
        params: {
            allowed_updates: ["message", "callback_query"],
        },
    },
});

// ================== UTILS ==================
function generateReportId() {
    return `R-${Date.now()}`;
}

function generateDefenderId() {
    return `D-${Date.now()}`;
}

// внутри callback всегда пиши answerCallbackQuery,
// иначе кнопки будут “крутиться” без ответа
async function safeAnswerCallback(queryId, text) {
    try {
        await bot.answerCallbackQuery(queryId, { text });
    } catch (err) {
        console.error("Callback answer error:", err);
    }
}

function clearUserSession(userId) {
    dataStore.sessions.delete(userId);
    dataStore.states.delete(userId);
}

// ================== START ==================
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    clearUserSession(msg.from.id.toString());

    const welcome = `
🛡️ <b>Bakelite Bot v${CONFIG.VERSION}</b>

Привет, <b>${msg.from.first_name}</b>!
Я помогу тебе:

🛡️ Стать защитником
🆘 Запросить помощь
📊 Посмотреть статус заявки
📖 Справка

Нажми на одну из кнопок ниже 👇
`;

    await bot.sendMessage(chatId, welcome, {
        parse_mode: "HTML",
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "🛡️ Стать защитником", callback_data: "MENU_JOIN" },
                ],
                [
                    {
                        text: "🆘 Запросить помощь",
                        callback_data: "MENU_REPORT",
                    },
                ],
                [
                    {
                        text: "📊 Статус моей заявки",
                        callback_data: "MENU_STATUS",
                    },
                ],
                [{ text: "📖 Справка", callback_data: "MENU_HELP" }],
            ],
        },
    });
});

// Для удобства интерактивное меню /start можно вызвать и callback’ом
bot.on("callback_query", async (q) => {
    if (q.data === "MENU_START") {
        return bot.sendMessage(q.message.chat.id, "/start");
    }
});

// ================== HELP ==================
async function showHelp(chatId, messageId, queryId) {
    await safeAnswerCallback(queryId, "Открываю справку");
    const text = `
📖 <b>Справка</b>

• 🛡️ Стать защитником — регистрация
• 🆘 Запросить помощь — создать заявку
• 📊 Статус моей заявки — просмотреть
• 📖 Справка — это окно
`;
    await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "HTML",
        reply_markup: {
            inline_keyboard: [
                [
                    {
                        text: "📋 Вернуться в меню",
                        callback_data: "MENU_START",
                    },
                ],
            ],
        },
    });
}

// ================== CALLBACK ==================
bot.on("callback_query", async (callbackQuery) => {
    const { data, from, message, id: queryId } = callbackQuery;
    const chatId = message.chat.id;
    const userId = from.id.toString();

    try {
        // Главные пункты меню
        if (data === "MENU_HELP") {
            return showHelp(chatId, message.message_id, queryId);
        }
        if (data === "MENU_STATUS") {
            return showStatus(chatId, userId, message.message_id, queryId);
        }
        if (data === "MENU_JOIN") {
            return startJoin(chatId, userId, message.message_id, queryId);
        }
        if (data === "MENU_REPORT") {
            return startReport(chatId, userId, message.message_id, queryId);
        }

        // Регион для регистрации/заявки
        if (data.startsWith("REG_")) {
            return handleRegion(chatId, userId, message.message_id, data, queryId);
        }

        // Тип преступления
        if (data.startsWith("CRIME_")) {
            return handleCrime(chatId, userId, message.message_id, data, queryId);
        }

        // Подтверждение (общий)
        if (data.startsWith("CONF_")) {
            return handleMainConfirm(chatId, userId, message.message_id, data, queryId);
        }

        // Админ принимает/отклоняет защитника
        if (data.startsWith("ADM_DEF_")) {
            return handleAdminDefender(chatId, userId, message.message_id, data, queryId);
        }

        // Админ принимает/отклоняет помощь
        if (data.startsWith("ADM_REP_")) {
            return handleAdminReport(chatId, userId, message.message_id, data, queryId);
        }
    } catch (error) {
        console.error("Callback error:", error);
        await safeAnswerCallback(queryId, "⚠️ Произошла ошибка, попробуйте /start");
    }
});

// ================== ФУНКЦИИ ==================

// Статус пользователя
async function showStatus(chatId, userId, messageId, queryId) {
    await safeAnswerCallback(queryId, "Показываю статус");

    const userReports = [];

    dataStore.pendingReports.forEach((r) => {
        if (r.userId === userId) userReports.push(r);
    });
    dataStore.activeReports.forEach((r) => {
        if (r.userId === userId) userReports.push(r);
    });

    let text = `<b>📊 Статус ваших заявок</b>\n\n`;
    if (userReports.length === 0) {
        text += "У вас пока нет заявок";
    } else {
        userReports.forEach((r) => {
            text += `• ${r.id} — ${r.status}\n`;
        });
    }

    await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "HTML",
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "🔄 Обновить", callback_data: "MENU_STATUS" },
                ],
                [
                    { text: "📋 Главное меню", callback_data: "MENU_START" },
                ],
            ],
        },
    });
}

// Start join defender
async function startJoin(chatId, userId, messageId, queryId) {
    await safeAnswerCallback(queryId, "Вы выбрали регистрацию защитника");

    dataStore.sessions.set(userId, {
        type: "join",
        step: 1,
        data: {},
    });

    await bot.editMessageText(
        `🛡️ <b>Стать защитником</b>\n\nВыберите регион:`,
        {
            chat_id: chatId,
            message_id,
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "🇷🇺 Россия", callback_data: "REG_ru" },
                        { text: "🇺🇦 Украина", callback_data: "REG_ua" },
                    ],
                    [
                        { text: "🇰🇿 Казахстан", callback_data: "REG_kz" },
                        { text: "🌍 Другое", callback_data: "REG_other" },
                    ],
                    [
                        {
                            text: "📋 Главное меню",
                            callback_data: "MENU_START",
                        },
                    ],
                ],
            },
        }
    );
}

// ================== HANDLE REGION ==================

async function handleRegion(chatId, userId, messageId, regionData, queryId) {
    await safeAnswerCallback(queryId, "Регион выбран");

    const session = dataStore.sessions.get(userId);
    if (!session) return;

    const regionMap = {
        "REG_ru": "Россия",
        "REG_ua": "Украина",
        "REG_kz": "Казахстан",
        "REG_other": "Другое"
    };
    session.data.region = regionMap[regionData] || "Не указано";
    session.step++;

    // Защитник или заявка?
    if (session.type === "join") {
        // Следующий шаг: псевдоним
        dataStore.states.set(userId, "WAIT_NICKNAME");
        return bot.sendMessage(chatId,
            `📍 Регион: <b>${session.data.region}</b>\n` +
            `Введите ваш псевдоним:`,
            { parse_mode: "HTML" }
        );
    }

    // Если заявка о помощи
    await bot.editMessageText(
        `📍 Регион выбран: <b>${session.data.region}</b>\n\n` +
        `🆘 Выберите тип киберпреступности:`,
        {
            chat_id: chatId,
            message_id,
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: [
                    [{ text: "💰 Вымогательство", callback_data: "CRIME_extortion" }],
                    [{ text: "😔 Кибербуллинг", callback_data: "CRIME_bullying" }],
                    [{ text: "🎭 Мошенничество", callback_data: "CRIME_fraud" }],
                    [{ text: "🌀 Другое", callback_data: "CRIME_other" }],
                    [{ text: "📋 Главное меню", callback_data: "MENU_START" }]
                ]
            }
        }
    );
}

// ================== HANDLE CRIME TYPE ==================

async function handleCrime(chatId, userId, messageId, crimeData, queryId) {
    await safeAnswerCallback(queryId, "Тип проблемы выбран");

    const session = dataStore.sessions.get(userId);
    if (!session) return;

    const crimeMap = {
        "CRIME_extortion": "Вымогательство",
        "CRIME_bullying": "Кибербуллинг",
        "CRIME_fraud": "Мошенничество",
        "CRIME_other": "Другое"
    };
    session.data.crimeType = crimeMap[crimeData] || "Не указано";
    session.step++;
    dataStore.states.set(userId, "WAIT_DESCRIPTION");

    await bot.sendMessage(chatId,
        `📝 Вы выбрали: <b>${session.data.crimeType}</b>\n` +
        `Опишите ситуацию подробно:`,
        { parse_mode: "HTML" }
    );
}

// ================== HANDLE TEXT INPUT ==================

bot.on("message", async (msg) => {
    if (!msg.text || msg.text.startsWith("/")) return;
    const userId = msg.from.id.toString();
    const state = dataStore.states.get(userId);
    const session = dataStore.sessions.get(userId);
    if (!session) return;

    // Ввод псевдонима защитника
    if (state === "WAIT_NICKNAME") {
        session.data.nickname = msg.text.trim();
        dataStore.states.set(userId, "WAIT_SPECIALTY");

        return bot.sendMessage(msg.chat.id,
            `👤 Псевдоним установлен: <b>${session.data.nickname}</b>\n` +
            `Опишите вашу специализацию:`, { parse_mode: "HTML" }
        );
    }

    // Ввод специализации защитника
    if (state === "WAIT_SPECIALTY") {
        session.data.specialty = msg.text.trim();
        dataStore.states.delete(userId);

        // Показываем предпроверку
        return bot.sendMessage(msg.chat.id,
            `📋 <b>Предварительный просмотр</b>\n\n` +
            `🔹 Регион: ${session.data.region}\n` +
            `🔹 Псевдоним: ${session.data.nickname}\n` +
            `🔹 Специализация: ${session.data.specialty}\n\n` +
            `Подтвердите регистрацию как защитника:`,
            {
                parse_mode: "HTML",
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "✅ Подтвердить регистрацию", callback_data: `CONF_JOIN_YES` },
                            { text: "❌ Отклонить", callback_data: `CONF_JOIN_NO` }
                        ],
                        [{ text: "📋 Главное меню", callback_data: "MENU_START" }]
                    ]
                }
            }
        );
    }

    // Ввод описания проблемы
    if (state === "WAIT_DESCRIPTION") {
        session.data.description = msg.text.trim();
        dataStore.states.delete(userId);

        return bot.sendMessage(msg.chat.id,
            `📄 Описание принято.\nНажмите кнопку для отправки:`,
            {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "✅ Отправить заявку", callback_data: "CONF_REP_YES" },
                            { text: "❌ Отменить", callback_data: "CONF_REP_NO" }
                        ],
                        [{ text: "📋 Главное меню", callback_data: "MENU_START" }]
                    ]
                }
            }
        );
    }
});

// ================== HANDLE CONFIRMATIONS ==================

async function handleMainConfirm(chatId, userId, messageId, data, queryId) {
    await safeAnswerCallback(queryId, "Обработка подтверждения…");

    const session = dataStore.sessions.get(userId);

    // Если подтверждение вступления защитником
    if (data === "CONF_JOIN_YES" && session?.type === "join") {
        const defenderId = generateDefenderId();
        dataStore.pendingDefenders.set(defenderId, {
            id: defenderId,
            userId,
            ...session.data,
            status: "pending"
        });
        clearUserSession(userId);

        // Уведомляем всех админов
        for (const admin of CONFIG.ADMIN_IDS) {
            await bot.sendMessage(admin,
                `🛡️ <b>Новая заявка на защитника</b>\n\n` +
                `Псевдоним: ${session.data.nickname}\n` +
                `Регион: ${session.data.region}\n` +
                `Специализация: ${session.data.specialty}\n\n` +
                `ID заявки: ${defenderId}`,
                {
                    parse_mode: "HTML",
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: "✅ Принять", callback_data: `ADM_DEF_ACCEPT_${defenderId}` },
                                { text: "❌ Отклонить", callback_data: `ADM_DEF_REJECT_${defenderId}` }
                            ],
                            [
                                { text: `👤 Профиль @${session.data.nickname}`, url: `tg://user?id=${userId}` }
                            ]
                        ]
                    }
                }
            );
        }

        return bot.editMessageText(
            `📨 Заявка отправлена администрации. Ожидайте одобрения.`,
            { chat_id: chatId, message_id }
        );
    }

    // Если отказ
    if (data === "CONF_JOIN_NO") {
        clearUserSession(userId);
        return bot.editMessageText(
            `❌ Регистрация отменена.`,
            { chat_id, message_id }
        );
    }

    // Если подтверждение заявки о помощи
    if (data === "CONF_REP_YES" && session?.type === "report") {
        const reportId = generateReportId();
        dataStore.pendingReports.set(reportId, {
            id: reportId,
            userId,
            ...session.data,
            status: "pending"
        });
        clearUserSession(userId);

        // Уведомляем всех админов
        for (const admin of CONFIG.ADMIN_IDS) {
            await bot.sendMessage(admin,
                `📢 <b>Новая заявка о помощи</b>\n\n` +
                `Регион: ${session.data.region}\n` +
                `Тип: ${session.data.crimeType}\n` +
                `Описание: ${session.data.description.substring(0,200)}...\n\n` +
                `ID заявки: ${reportId}`,
                {
                    parse_mode: "HTML",
                    reply_markup: [
                        [
                            { text: "✅ Взять в работу", callback_data: `ADM_REP_ACCEPT_${reportId}` },
                            { text: "❌ Отклонить", callback_data: `ADM_REP_REJECT_${reportId}` }
                        ]
                    ]
                }
            );
        }

        return bot.editMessageText(
            `📨 Ваша заявка отправлена администрации.`,
            { chat_id: chatId, message_id }
        );
    }

    if (data === "CONF_REP_NO") {
        clearUserSession(userId);
        return bot.editMessageText(
            `❌ Отправка заявки отменена.`,
            { chat_id, message_id }
        );
    }
}

// ================== HANDLE REGION ==================

async function handleRegion(chatId, userId, messageId, regionData, queryId) {
    await safeAnswerCallback(queryId, "Регион выбран");

    const session = dataStore.sessions.get(userId);
    if (!session) return;

    const regionMap = {
        "REG_ru": "Россия",
        "REG_ua": "Украина",
        "REG_kz": "Казахстан",
        "REG_other": "Другое"
    };
    session.data.region = regionMap[regionData] || "Не указано";
    session.step++;

    // Защитник или заявка?
    if (session.type === "join") {
        // Следующий шаг: псевдоним
        dataStore.states.set(userId, "WAIT_NICKNAME");
        return bot.sendMessage(chatId,
            `📍 Регион: <b>${session.data.region}</b>\n` +
            `Введите ваш псевдоним:`,
            { parse_mode: "HTML" }
        );
    }

    // Если заявка о помощи
    await bot.editMessageText(
        `📍 Регион выбран: <b>${session.data.region}</b>\n\n` +
        `🆘 Выберите тип киберпреступности:`,
        {
            chat_id: chatId,
            message_id,
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: [
                    [{ text: "💰 Вымогательство", callback_data: "CRIME_extortion" }],
                    [{ text: "😔 Кибербуллинг", callback_data: "CRIME_bullying" }],
                    [{ text: "🎭 Мошенничество", callback_data: "CRIME_fraud" }],
                    [{ text: "🌀 Другое", callback_data: "CRIME_other" }],
                    [{ text: "📋 Главное меню", callback_data: "MENU_START" }]
                ]
            }
        }
    );
}

// ================== HANDLE CRIME TYPE ==================

async function handleCrime(chatId, userId, messageId, crimeData, queryId) {
    await safeAnswerCallback(queryId, "Тип проблемы выбран");

    const session = dataStore.sessions.get(userId);
    if (!session) return;

    const crimeMap = {
        "CRIME_extortion": "Вымогательство",
        "CRIME_bullying": "Кибербуллинг",
        "CRIME_fraud": "Мошенничество",
        "CRIME_other": "Другое"
    };
    session.data.crimeType = crimeMap[crimeData] || "Не указано";
    session.step++;
    dataStore.states.set(userId, "WAIT_DESCRIPTION");

    await bot.sendMessage(chatId,
        `📝 Вы выбрали: <b>${session.data.crimeType}</b>\n` +
        `Опишите ситуацию подробно:`,
        { parse_mode: "HTML" }
    );
}

// ================== HANDLE TEXT INPUT ==================

bot.on("message", async (msg) => {
    if (!msg.text || msg.text.startsWith("/")) return;
    const userId = msg.from.id.toString();
    const state = dataStore.states.get(userId);
    const session = dataStore.sessions.get(userId);
    if (!session) return;

    // Ввод псевдонима защитника
    if (state === "WAIT_NICKNAME") {
        session.data.nickname = msg.text.trim();
        dataStore.states.set(userId, "WAIT_SPECIALTY");

        return bot.sendMessage(msg.chat.id,
            `👤 Псевдоним установлен: <b>${session.data.nickname}</b>\n` +
            `Опишите вашу специализацию:`, { parse_mode: "HTML" }
        );
    }

    // Ввод специализации защитника
    if (state === "WAIT_SPECIALTY") {
        session.data.specialty = msg.text.trim();
        dataStore.states.delete(userId);

        // Показываем предпроверку
        return bot.sendMessage(msg.chat.id,
            `📋 <b>Предварительный просмотр</b>\n\n` +
            `🔹 Регион: ${session.data.region}\n` +
            `🔹 Псевдоним: ${session.data.nickname}\n` +
            `🔹 Специализация: ${session.data.specialty}\n\n` +
            `Подтвердите регистрацию как защитника:`,
            {
                parse_mode: "HTML",
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "✅ Подтвердить регистрацию", callback_data: `CONF_JOIN_YES` },
                            { text: "❌ Отклонить", callback_data: `CONF_JOIN_NO` }
                        ],
                        [{ text: "📋 Главное меню", callback_data: "MENU_START" }]
                    ]
                }
            }
        );
    }

    // Ввод описания проблемы
    if (state === "WAIT_DESCRIPTION") {
        session.data.description = msg.text.trim();
        dataStore.states.delete(userId);

        return bot.sendMessage(msg.chat.id,
            `📄 Описание принято.\nНажмите кнопку для отправки:`,
            {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "✅ Отправить заявку", callback_data: "CONF_REP_YES" },
                            { text: "❌ Отменить", callback_data: "CONF_REP_NO" }
                        ],
                        [{ text: "📋 Главное меню", callback_data: "MENU_START" }]
                    ]
                }
            }
        );
    }
});

// ================== HANDLE CONFIRMATIONS ==================

async function handleMainConfirm(chatId, userId, messageId, data, queryId) {
    await safeAnswerCallback(queryId, "Обработка подтверждения…");

    const session = dataStore.sessions.get(userId);

    // Если подтверждение вступления защитником
    if (data === "CONF_JOIN_YES" && session?.type === "join") {
        const defenderId = generateDefenderId();
        dataStore.pendingDefenders.set(defenderId, {
            id: defenderId,
            userId,
            ...session.data,
            status: "pending"
        });
        clearUserSession(userId);

        // Уведомляем всех админов
        for (const admin of CONFIG.ADMIN_IDS) {
            await bot.sendMessage(admin,
                `🛡️ <b>Новая заявка на защитника</b>\n\n` +
                `Псевдоним: ${session.data.nickname}\n` +
                `Регион: ${session.data.region}\n` +
                `Специализация: ${session.data.specialty}\n\n` +
                `ID заявки: ${defenderId}`,
                {
                    parse_mode: "HTML",
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: "✅ Принять", callback_data: `ADM_DEF_ACCEPT_${defenderId}` },
                                { text: "❌ Отклонить", callback_data: `ADM_DEF_REJECT_${defenderId}` }
                            ],
                            [
                                { text: `👤 Профиль @${session.data.nickname}`, url: `tg://user?id=${userId}` }
                            ]
                        ]
                    }
                }
            );
        }

        return bot.editMessageText(
            `📨 Заявка отправлена администрации. Ожидайте одобрения.`,
            { chat_id: chatId, message_id }
        );
    }

    // Если отказ
    if (data === "CONF_JOIN_NO") {
        clearUserSession(userId);
        return bot.editMessageText(
            `❌ Регистрация отменена.`,
            { chat_id, message_id }
        );
    }

    // Если подтверждение заявки о помощи
    if (data === "CONF_REP_YES" && session?.type === "report") {
        const reportId = generateReportId();
        dataStore.pendingReports.set(reportId, {
            id: reportId,
            userId,
            ...session.data,
            status: "pending"
        });
        clearUserSession(userId);

        // Уведомляем всех админов
        for (const admin of CONFIG.ADMIN_IDS) {
            await bot.sendMessage(admin,
                `📢 <b>Новая заявка о помощи</b>\n\n` +
                `Регион: ${session.data.region}\n` +
                `Тип: ${session.data.crimeType}\n` +
                `Описание: ${session.data.description.substring(0,200)}...\n\n` +
                `ID заявки: ${reportId}`,
                {
                    parse_mode: "HTML",
                    reply_markup: [
                        [
                            { text: "✅ Взять в работу", callback_data: `ADM_REP_ACCEPT_${reportId}` },
                            { text: "❌ Отклонить", callback_data: `ADM_REP_REJECT_${reportId}` }
                        ]
                    ]
                }
            );
        }

        return bot.editMessageText(
            `📨 Ваша заявка отправлена администрации.`,
            { chat_id: chatId, message_id }
        );
    }

    if (data === "CONF_REP_NO") {
        clearUserSession(userId);
        return bot.editMessageText(
            `❌ Отправка заявки отменена.`,
            { chat_id, message_id }
        );
    }
}

