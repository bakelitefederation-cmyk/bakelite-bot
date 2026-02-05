// ===================================
//     🛡️ BAKELITE BOT v3.3
// ===================================
const TelegramBot = require('node-telegram-bot-api');

// ================== CONFIG =====================
const CONFIG = {
    TOKEN: process.env.BOT_TOKEN || '',
    ADMIN: process.env.ADMIN_ID || null,
    VERSION: '3.3.0'
};

if (!CONFIG.TOKEN) {
    console.error('❌ Ошибка: BOT_TOKEN не найден!');
    process.exit(1);
}

// ================== DATA STORAGE =====================
const dataStore = {
    defenders: new Map(),        // Защитники
    reports: new Map(),          // Заявки
    sessions: new Map(),         // Сессии ввода пользователя
    states: new Map()            // Ожидаемые состояния
};

let reportCounter = 0;

// ================== INITIALIZE BOT =====================

// Важно: указываем allowed_updates для callback_query
const bot = new TelegramBot(CONFIG.TOKEN, {
    polling: {
        params: {
            allowed_updates: ['message', 'callback_query']
        }
    }
});

// ================== UTILS =====================
function genReportId() {
    reportCounter++;
    return `RPT-${Date.now()}-${reportCounter}`;
}

function getStatusEmoji(status) {
    const icons = {
        pending: '🟡',
        in_progress: '🟠',
        completed: '🟢',
        rejected: '🔴'
    };
    return icons[status] || '⚪';
}

function clearUserSession(userId) {
    dataStore.sessions.delete(userId.toString());
    dataStore.states.delete(userId.toString());
}

// ================== START MENU =====================

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;

    // Очищаем старое состояние
    clearUserSession(msg.from.id);

    const welcomeMessage = `
🛡️ <b>Добро пожаловать в Bakelite Bot v${CONFIG.VERSION}!</b>

Я — твой помощник в ситуации, когда нужна помощь по вопросам киберпреступности.
Здесь ты можешь:

🛡️ Стать защитником — помогать другим
🆘 Запросить помощь — оставить заявку о проблеме
📊 Узнать статус своей заявки
📖 Получить подсказку по функциям

Пожалуйста, выбери действие ниже 👇
    `;

    await bot.sendMessage(chatId, welcomeMessage, {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [{ text: '🛡️ Стать защитником', callback_data: 'MENU_JOIN' }],
                [{ text: '🆘 Запросить помощь', callback_data: 'MENU_REPORT' }],
                [{ text: '📊 Статус моей заявки', callback_data: 'MENU_STATUS' }],
                [{ text: '📖 Справка', callback_data: 'MENU_HELP' }]
            ]
        }
    });
});

// ================== CALLBACK HANDLER =====================

bot.on('callback_query', async (callbackQuery) => {
    const { data, message } = callbackQuery;
    const chatId = message.chat.id;
    const userId = callbackQuery.from.id.toString();

    // Обязательно отвечаем на callback чтобы убрать "часики"
    await bot.answerCallbackQuery(callbackQuery.id);

    try {
        if (data === 'MENU_JOIN') {
            return showJoinRegionMenu(chatId, userId, message.message_id);
        }
        if (data === 'MENU_REPORT') {
            return showReportRegionMenu(chatId, userId, message.message_id);
        }
        if (data === 'MENU_STATUS') {
            return showStatus(chatId, userId, message.message_id);
        }
        if (data === 'MENU_HELP') {
            return showHelp(chatId, message.message_id);
        }

        // Обработка выбора региона
        if (data.startsWith('REG_')) {
            return handleRegionSelection(chatId, userId, message.message_id, data);
        }

        // Обработка типа преступления
        if (data.startsWith('CRIME_')) {
            return handleCrimeType(chatId, userId, message.message_id, data);
        }

        // Подтверждение отправки
        if (data === 'CONFIRM_YES' || data === 'CONFIRM_NO') {
            return handleConfirmation(chatId, userId, message.message_id, data);
        }

    } catch (error) {
        console.error('Ошибка обработки callback:', error);
        bot.sendMessage(chatId, '⚠️ Произошла ошибка. Используйте /start для начала.');
    }
});

// ================== INLINE MENUS =====================

// Справка
async function showHelp(chatId, messageId) {
    const text = `
📖 <b>Справка по функциям</b>

• 🛡️ <b>Стать защитником</b> — зарегистрироваться для помощи другим
• 🆘 <b>Запросить помощь</b> — создать заявку
• 📊 <b>Статус заявки</b> — просмотреть свои заявки и их статусы
• 📖 <b>Справка</b> — это окно

Нажми кнопку ниже, чтобы вернуться в меню.
    `;
    await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [{ text: '📋 Главное меню', callback_data: 'MENU_START' }]
            ]
        }
    });
}

// Главное меню
bot.onText(/\/menu/, async (msg) => {
    await bot.sendMessage(msg.chat.id, '📋 Главное меню:', {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🛡️ Стать защитником', callback_data: 'MENU_JOIN' }],
                [{ text: '🆘 Запросить помощь', callback_data: 'MENU_REPORT' }],
                [{ text: '📊 Статус моей заявки', callback_data: 'MENU_STATUS' }],
                [{ text: '📖 Справка', callback_data: 'MENU_HELP' }]
            ]
        }
    });
});

// Меню выбора региона для регистрации
async function showJoinRegionMenu(chatId, userId, messageId) {
    dataStore.sessions.set(userId, { type: 'join', step: 1, data: {} });

    await bot.editMessageText(
        `🛡️ <b>Стать защитником</b>\n\nВыберите ваш регион:`,
        {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🇷🇺 Россия', callback_data: 'REG_ru' }],
                    [{ text: '🇺🇦 Украина', callback_data: 'REG_ua' }],
                    [{ text: '🇰🇿 Казахстан', callback_data: 'REG_kz' }],
                    [{ text: '🌍 Другое', callback_data: 'REG_other' }],
                    [{ text: '📋 Главное меню', callback_data: 'MENU_START' }]
                ]
            }
        }
    );
}

// Меню выбора региона для заявки
async function showReportRegionMenu(chatId, userId, messageId) {
    dataStore.sessions.set(userId, { type: 'report', step: 1, data: {} });

    await bot.editMessageText(
        `🆘 <b>Запросить помощь</b>\n\nВыберите регион инцидента:`,
        {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🇷🇺 Россия', callback_data: 'REG_ru' }],
                    [{ text: '🇺🇦 Украина', callback_data: 'REG_ua' }],
                    [{ text: '🇰🇿 Казахстан', callback_data: 'REG_kz' }],
                    [{ text: '🌍 Другое', callback_data: 'REG_other' }],
                    [{ text: '📋 Главное меню', callback_data: 'MENU_START' }]
                ]
            }
        }
    );
}

// Показывает статус заявок
async function showStatus(chatId, userId, messageId) {
    const userReports = Array.from(dataStore.reports.values())
        .filter(r => r.userId === userId);

    let text = `<b>📊 Статус ваших заявок</b>\n\n`;

    if (userReports.length === 0) {
        text += `У вас пока нет заявок.\n\n`;
    } else {
        userReports.forEach(r => {
            text += `${getStatusEmoji(r.status)} <b>ID:</b> ${r.id} — <b>${r.status}</b>\n`;
        });
    }

    await bot.editMessageText(text, {
        chat_id: chatId,
        message_id,
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [{ text: '🔄 Обновить', callback_data: 'MENU_STATUS' }],
                [{ text: '📋 Главное меню', callback_data: 'MENU_START' }]
            ]
        }
    });
}

// ================== HANDLERS =====================

// Обработка выбора региона
async function handleRegionSelection(chatId, userId, messageId, regionData) {
    const session = dataStore.sessions.get(userId);
    if (!session) return;

    const regions = {
        REG_ru: 'Россия',
        REG_ua: 'Украина',
        REG_kz: 'Казахстан',
        REG_other: 'Другое'
    };

    session.data.region = regions[regionData];
    session.step++;

    // Обработка для регистрации защитника
    if (session.type === 'join') {
        dataStore.states.set(userId, 'await_nickname');

        await bot.sendMessage(chatId,
            `📍 <b>Регион:</b> ${session.data.region}\nВведите ваш псевдоним:`
        );
        return;
    }

    // Обработка для заявки
    await bot.editMessageText(
        `📍 <b>Регион выбран:</b> ${session.data.region}\n\n` +
        `🆘 <b>Выберите тип проблемы:</b>`,
        {
            chat_id,
            message_id,
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '💰 Вымогательство', callback_data: 'CRIME_extortion' }],
                    [{ text: '😔 Кибербуллинг', callback_data: 'CRIME_bullying' }],
                    [{ text: '🎭 Мошенничество', callback_data: 'CRIME_fraud' }],
                    [{ text: '🌀 Другое', callback_data: 'CRIME_other' }],
                    [{ text: '📋 Главное меню', callback_data: 'MENU_START' }]
                ]
            }
        }
    );
}

// Обработка выбора типа преступления
async function handleCrimeType(chatId, userId, messageId, crimeData) {
    const session = dataStore.sessions.get(userId);
    if (!session) return;

    const types = {
        CRIME_extortion: 'Вымогательство',
        CRIME_bullying: 'Кибербуллинг',
        CRIME_fraud: 'Мошенничество',
        CRIME_other: 'Другое'
    };

    session.data.crimeType = types[crimeData] || 'Не указано';
    session.step++;
    dataStore.states.set(userId, 'await_description');

    await bot.sendMessage(chatId, `📝 Опишите ситуацию подробно:`);
}

// Обработка подтверждения отправки
async function handleConfirmation(chatId, userId, messageId, confirmData) {
    const session = dataStore.sessions.get(userId);
    if (!session) return;

    if (confirmData === 'CONFIRM_YES') {
        // Защитник
        if (session.type === 'join') {
            const defenderId = `${userId}-${Date.now()}`;
            dataStore.defenders.set(defenderId, {
                userId,
                nickname: session.data.nickname,
                region: session.data.region
            });

            await bot.editMessageText(
                `✅ Регистрация защитника успешна!`,
                { chat_id: chatId, message_id }
            );
        }
        // Заявка
        else if (session.type === 'report') {
            const rId = genReportId();
            dataStore.reports.set(rId, {
                id: rId,
                userId,
                region: session.data.region,
                crimeType: session.data.crimeType,
                description: session.data.description,
                status: 'pending'
            });

            await bot.editMessageText(
                `✅ Заявка отправлена!\nID: ${rId}`,
                { chat_id: chatId, message_id }
            );
        }
    } else {
        await bot.editMessageText(
            `❌ Отмена действия`,
            { chat_id: chatId, message_id }
        );
    }

    // Очистка
    clearUserSession(userId);
}

// ================== MESSAGE HANDLER =====================

bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/')) return;

    const userId = msg.from.id.toString();
    const currentState = dataStore.states.get(userId);
    const session = dataStore.sessions.get(userId);

    if (!session) return;

    // Ввод псевдонима
    if (currentState === 'await_nickname') {
        session.data.nickname = msg.text.trim();
        dataStore.states.set(userId, 'await_specialty');

        return bot.sendMessage(msg.chat.id,
            `👤 Псевдоним сохранён: <b>${session.data.nickname}</b>\n` +
            `Опишите вашу специализацию:`,
            { parse_mode: 'HTML' }
        );
    }

    // Ввод описания специализации
    if (currentState === 'await_specialty') {
        session.data.specialty = msg.text.trim();
        dataStore.states.delete(userId);

        return bot.sendMessage(msg.chat.id,
            `📋 Специализация: <b>${session.data.specialty}</b>\n` +
            `Подтвердите регистрацию:`,
            {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✅ Подтвердить', callback_data: 'CONFIRM_YES' }],
                        [{ text: '❌ Отменить', callback_data: 'CONFIRM_NO' }],
                        [{ text: '📋 Главное меню', callback_data: 'MENU_START' }]
                    ]
                }
            }
        );
    }

    // Ввод описания проблемы
    if (currentState === 'await_description') {
        session.data.description = msg.text.trim();
        dataStore.states.delete(userId);

        return bot.sendMessage(msg.chat.id,
            `📄 Описание получено.\nНажмите кнопку ниже для отправки:`,
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✅ Отправить заявку', callback_data: 'CONFIRM_YES' }],
                        [{ text: '❌ Отменить', callback_data: 'CONFIRM_NO' }],
                        [{ text: '📋 Главное меню', callback_data: 'MENU_START' }]
                    ]
                }
            }
        );
    }
});

console.log('📌 Bot запущен и готов к работе!');
