// ============================================
// 🛡️ BAKELITE BOT — Полный рабочий код
// ============================================

const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

console.log('🚀 Запуск Bakelite Bot...');

// ================== КОНФИГУРАЦИЯ ==================

const CONFIG = {
    BOT_TOKEN: process.env.BOT_TOKEN || '',
    ADMIN_ID: parseInt(process.env.ADMIN_ID) || null,
    VERSION: '3.2.0',
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: process.env.PORT || 3000
};

if (!CONFIG.BOT_TOKEN) {
    console.error('❌ BOT_TOKEN отсутствует!');
    process.exit(1);
}

// ================== ХРАНЕНИЕ ДАННЫХ ==================

const dataStore = {
    defenders: new Map(),
    reports: new Map(),
    sessions: new Map(),
    states: new Map(),
};

let reportCount = 0;

// ================== ИНИЦИАЛИЗАЦИЯ БОТА ==================

const bot = new TelegramBot(CONFIG.BOT_TOKEN, {
    polling: CONFIG.NODE_ENV !== 'production'
});

if (CONFIG.NODE_ENV === 'production') {
    const app = express();
    app.use(express.json());

    app.post(`/bot${CONFIG.BOT_TOKEN}`, (req, res) => {
        bot.processUpdate(req.body);
        res.sendStatus(200);
    });

    app.listen(CONFIG.PORT, () => {
        console.log(`🌐 Сервер запущен на порту ${CONFIG.PORT}`);
    });

    const webhookURL = process.env.RAILWAY_PUBLIC_DOMAIN ?
        `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/bot${CONFIG.BOT_TOKEN}` :
        process.env.WEBHOOK_URL;

    if (webhookURL) {
        bot.setWebHook(webhookURL).catch(console.error);
    }
}

bot.on('polling_error', console.error);
bot.on('webhook_error', console.error);

console.log('🤖 Бот инициализирован');

// ================== УТИЛИТЫ ==================

function createReportId() {
    return `R-${Date.now()}-${++reportCount}`;
}

function clearUserSession(userId) {
    dataStore.sessions.delete(userId.toString());
    dataStore.states.delete(userId.toString());
}

function getStatusIcon(status) {
    const icons = {
        pending: '🟡',
        in_progress: '🟠',
        completed: '🟢',
        rejected: '🔴'
    };
    return icons[status] || '⚪';
}

// ================== /start ==================

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;

    clearUserSession(msg.from.id);

    await bot.sendMessage(chatId,
        `🛡️ <b>Bakelite Bot v${CONFIG.VERSION}</b>\nВыберите действие:`,
        {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🛡️ Стать защитником', callback_data: 'JOIN_START' }],
                    [{ text: '🆘 Запросить помощь', callback_data: 'REPORT_START' }],
                    [{ text: '📊 Статус заявки', callback_data: 'STATUS_SHOW' }],
                    [{ text: '📖 Справка', callback_data: 'SHOW_HELP' }]
                ]
            }
        }
    );
});

// ================== CALLBACK_QUERY ==================

bot.on('callback_query', async (query) => {
    await bot.answerCallbackQuery(query.id);

    const { data, message } = query;
    const chatId = message.chat.id;
    const userId = query.from.id.toString();

    try {
        if (data === 'SHOW_HELP') {
            return showHelp(chatId, message.message_id);
        }

        if (data === 'STATUS_SHOW') {
            return showStatus(chatId, userId, message.message_id);
        }

        if (data === 'JOIN_START') {
            return startJoin(chatId, userId, message.message_id);
        }

        if (data === 'REPORT_START') {
            return startReport(chatId, userId, message.message_id);
        }

        if (data.startsWith('REG_')) {
            return handleRegion(chatId, userId, message.message_id, data);
        }

        if (data.startsWith('CRIME_')) {
            return handleCrime(chatId, userId, message.message_id, data);
        }

        if (data === 'CONFIRM_YES' || data === 'CONFIRM_NO') {
            return handleConfirmation(chatId, userId, message.message_id, data);
        }

    } catch (err) {
        console.error('Callback error:', err);
    }
});

// ================== HELP ==================

async function showHelp(chatId, messageId) {
    const text = `
📖 <b>Справка</b>

🛡️ Стать защитником — регистрация.
🆘 Запросить помощь — создать заявку.
📊 Статус заявки — посмотреть прогресс.
📖 Справка — это окно.

Используйте кнопки для навигации.
    `;
    await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [{ text: '📋 Главное меню', callback_data: 'MAIN_MENU' }]
            ]
        }
    });
}

// ================== START JOIN ==================

async function startJoin(chatId, userId, messageId) {
    dataStore.sessions.set(userId, { type: 'join', step: 1, data: {} });

    await bot.editMessageText(
        `🛡️ Регистрация защитника — Выберите регион:`,
        {
            chat_id,
            message_id,
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🇷🇺 Россия', callback_data: 'REG_ru' }],
                    [{ text: '🇺🇦 Украина', callback_data: 'REG_ua' }],
                    [{ text: '🇰🇿 Казахстан', callback_data: 'REG_kz' }],
                    [{ text: '🌍 Другое', callback_data: 'REG_other' }],
                    [{ text: '📋 Главное меню', callback_data: 'MAIN_MENU' }]
                ]
            }
        }
    );
}

// ================== START REPORT ==================

async function startReport(chatId, userId, messageId) {
    dataStore.sessions.set(userId, { type: 'report', step: 1, data: {} });

    await bot.editMessageText(
        `🆘 Создание заявки — Выберите регион:`,
        {
            chat_id,
            message_id,
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🇷🇺 Россия', callback_data: 'REG_ru' }],
                    [{ text: '🇺🇦 Украина', callback_data: 'REG_ua' }],
                    [{ text: '🇰🇿 Казахстан', callback_data: 'REG_kz' }],
                    [{ text: '🌍 Другое', callback_data: 'REG_other' }],
                    [{ text: '📋 Главное меню', callback_data: 'MAIN_MENU' }]
                ]
            }
        }
    );
}

// ================== HANDLE REGION ==================

async function handleRegion(chatId, userId, messageId, data) {
    const session = dataStore.sessions.get(userId);

    if (!session) return;

    const regions = {
        REG_ru: 'Россия',
        REG_ua: 'Украина',
        REG_kz: 'Казахстан',
        REG_other: 'Другое'
    };

    session.data.region = regions[data];
    session.step++;

    if (session.type === 'join') {
        dataStore.states.set(userId, 'wait_nickname');
        await bot.sendMessage(chatId, `Введите ваш псевдоним:`);
    } else {
        await bot.editMessageText(
            `🆘 Выбран регион: ${session.data.region}\nВыберите тип проблемы:`,
            {
                chat_id,
                message_id,
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '💰 Вымогательство', callback_data: 'CRIME_extortion' }],
                        [{ text: '😔 Кибербуллинг', callback_data: 'CRIME_bullying' }],
                        [{ text: '🎭 Мошенничество', callback_data: 'CRIME_fraud' }],
                        [{ text: '🌀 Другое', callback_data: 'CRIME_other' }],
                        [{ text: '📋 Главное меню', callback_data: 'MAIN_MENU' }]
                    ]
                }
            }
        );
    }
}

// ================== HANDLE CRIME ==================

async function handleCrime(chatId, userId, messageId, data) {
    const session = dataStore.sessions.get(userId);
    if (!session) return;

    session.data.crimeType = data.replace('CRIME_', '');
    session.step++;
    dataStore.states.set(userId, 'wait_description');

    await bot.sendMessage(chatId, `Опишите ситуацию подробно:`);
}

// ================== HANDLE CONFIRMATION ==================

async function handleConfirmation(chatId, userId, messageId, data) {
    const session = dataStore.sessions.get(userId);
    if (!session) return;

    if (data === 'CONFIRM_YES') {
        if (session.type === 'join') {
            const defenderId = `${userId}-${Date.now()}`;
            dataStore.defenders.set(defenderId, {
                userId,
                region: session.data.region
            });

            await bot.editMessageText(
                `🛡️ Регистрация завершена!`,
                { chat_id: chatId, message_id }
            );

        } else {
            const rId = createReportId();
            dataStore.reports.set(rId, {
                id: rId,
                userId,
                region: session.data.region,
                crimeType: session.data.crimeType,
                description: session.data.description,
                status: 'pending'
            });

            await bot.editMessageText(
                `✅ Заявка создана! ID: ${rId}`,
                { chat_id, message_id }
            );
        }
    } else {
        await bot.editMessageText(
            `❌ Действие отменено.`,
            { chat_id, message_id }
        );
    }

    clearUserSession(userId);
}

// ================== MESSAGE TEXT HANDLER ==================

bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/')) return;

    const userId = msg.from.id.toString();
    const state = dataStore.states.get(userId);
    const session = dataStore.sessions.get(userId);

    if (!session) return;

    if (state === 'wait_nickname') {
        session.data.nickname = msg.text.trim();
        dataStore.states.delete(userId);

        await bot.sendMessage(msg.chat.id,
            `Ник сохранён: ${session.data.nickname}\nВведите специализацию:`);
        dataStore.states.set(userId, 'wait_specialty');
    }
    else if (state === 'wait_specialty') {
        session.data.specialty = msg.text.trim();
        dataStore.states.delete(userId);

        await bot.sendMessage(msg.chat.id,
            `Специализация: ${session.data.specialty}`,
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✅ Подтвердить', callback_data: 'CONFIRM_YES' }],
                        [{ text: '❌ Отменить', callback_data: 'CONFIRM_NO' }],
                        [{ text: '📋 Главное меню', callback_data: 'MAIN_MENU' }]
                    ]
                }
            }
        );
    }
    else if (state === 'wait_description') {
        session.data.description = msg.text.trim();
        dataStore.states.delete(userId);

        await bot.sendMessage(msg.chat.id,
            `Описание принято.`,
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✅ Отправить', callback_data: 'CONFIRM_YES' }],
                        [{ text: '❌ Отменить', callback_data: 'CONFIRM_NO' }],
                        [{ text: '📋 Главное меню', callback_data: 'MAIN_MENU' }]
                    ]
                }
            }
        );
    }
});

console.log('✨ Bakelite Bot запущен и готов к работе');
