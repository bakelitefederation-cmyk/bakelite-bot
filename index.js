// ============================================
// 🛡️ BAKELITE BOT v3.1 - ПОЛНАЯ РЕАЛИЗАЦИЯ 🚀
// ============================================

const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

console.log('🚀 Загружаем Bakelite Bot...');

// ================= КОНФИГУРАЦИЯ =================
const CONFIG = {
    BOT_TOKEN: process.env.BOT_TOKEN || '',
    ADMIN_ID: parseInt(process.env.ADMIN_ID) || null,
    VERSION: '3.1.0',
    PORT: process.env.PORT || 3000,
    NODE_ENV: process.env.NODE_ENV || 'development'
};

if (!CONFIG.BOT_TOKEN) {
    console.error('❌ ERROR: BOT_TOKEN is missing!');
    process.exit(1);
}

// ================= ДАННЫЕ =================
const data = {
    defenders: new Map(),
    reports: new Map(),
    sessions: new Map(),
    states: new Map()
};

let reportIndex = 1;

// ================= ИНИЦИАЛИЗАЦИЯ =================
const botOptions = {
    polling: CONFIG.NODE_ENV !== 'production'
};

const bot = new TelegramBot(CONFIG.BOT_TOKEN, botOptions);

if (CONFIG.NODE_ENV === 'production') {
    const app = express();
    app.use(express.json());

    app.post(`/bot${CONFIG.BOT_TOKEN}`, (req, res) => {
        bot.processUpdate(req.body);
        res.sendStatus(200);
    });

    app.listen(CONFIG.PORT, () =>
        console.log(`🚀 Server listening on port ${CONFIG.PORT}`)
    );

    const webhookUrl = process.env.RAILWAY_PUBLIC_DOMAIN
        ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/bot${CONFIG.BOT_TOKEN}`
        : process.env.WEBHOOK_URL;

    if (webhookUrl) {
        bot.setWebHook(`${webhookUrl}`).catch(console.error);
    }
}

// ================= УТИЛИТЫ =================
function genReportId() {
    return `R-${Date.now()}-${reportIndex++}`;
}

function clearSession(userId) {
    data.sessions.delete(userId.toString());
    data.states.delete(userId.toString());
}

// ================= /start =================
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    clearSession(msg.from.id);

    const menu = {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🛡️ Стать защитником', callback_data: 'join_start' }],
                [{ text: '🆘 Запросить помощь', callback_data: 'report_start' }],
                [{ text: '📊 Статус заявки', callback_data: 'status_show' }],
                [{ text: '📖 Справка', callback_data: 'show_help' }]
            ]
        },
        parse_mode: 'HTML'
    };

    await bot.sendMessage(chatId,
        `🛡️ <b>Добро пожаловать!</b>\n` +
        `Выберите действие ниже:`,
        menu
    );
});

// ================= HELP =================
async function showHelp(chatId, messageId) {
    const text = `
📖 <b>СПРАВКА:</b>

🛡️ Стать защитником — Регистрация для помощи другим.
🆘 Запросить помощь — Сообщение о случившемся.
📊 Статус заявки — Просмотр прогресса.
📖 Справка — Эта страница.

Используйте кнопки на экране. /start — Главное меню.
    `;
    await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [{ text: '📋 Вернуться в меню', callback_data: 'main_menu' }]
            ]
        }
    });
}

// ================= Статус =================
async function showStatus(chatId, userId, messageId) {
    let owned = [], assigned = [];
    data.reports.forEach(r => {
        if (r.userId === userId.toString()) owned.push(r);
        if (r.assignedTo === userId.toString()) assigned.push(r);
    });

    let text;
    if (!owned.length && !assigned.length) {
        text = `📊 У вас нет заявок.`;
    } else {
        text = `<b>📊 Статус ваших заявок</b>\n\n`;
        owned.forEach(r => {
            text += `• ${r.id} — ${r.status}\n`;
        });
        assigned.forEach(r => {
            text += `• (Assigned) ${r.id} — ${r.status}\n`;
        });
    }

    await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [{ text: '🔄 Обновить', callback_data: 'status_show' }],
                [{ text: '📋 Главное меню', callback_data: 'main_menu' }]
            ]
        }
    });
}

// ================= ОБРАБОТЧИК CALLBACK =================
bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const userId = q.from.id.toString();
    const dataCb = q.data;
    await bot.answerCallbackQuery(q.id);

    try {
        if (dataCb === 'main_menu') {
            return bot.sendMessage(chatId, 'Вы в меню', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🛡️ Стать защитником', callback_data: 'join_start' }],
                        [{ text: '🆘 Запросить помощь', callback_data: 'report_start' }],
                        [{ text: '📊 Статус заявки', callback_data: 'status_show' }],
                        [{ text: '📖 Справка', callback_data: 'show_help' }]
                    ]
                },
                parse_mode: 'HTML'
            });
        }

        if (dataCb === 'show_help') {
            return showHelp(chatId, q.message.message_id);
        }

        if (dataCb === 'status_show') {
            return showStatus(chatId, userId, q.message.message_id);
        }

        if (dataCb === 'join_start') {
            data.sessions.set(userId, { type: 'join', step: 1, region: null, nickname: null });
            return bot.editMessageText(
                `🛡️ Регистрация защитника — Шаг 1/3\nВыберите регион:`,
                {
                    chat_id: chatId,
                    message_id: q.message.message_id,
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🇷🇺 Россия', callback_data: 'region_ru' }],
                            [{ text: '🇺🇦 Украина', callback_data: 'region_ua' }],
                            [{ text: '🇰🇿 Казахстан', callback_data: 'region_kz' }],
                            [{ text: '🌍 Другое', callback_data: 'region_other' }],
                            [{ text: '📋 Вернуться в меню', callback_data: 'main_menu' }]
                        ]
                    }
                }
            );
        }

        if (dataCb === 'report_start') {
            data.sessions.set(userId, { type: 'report', step: 1 });
            return bot.editMessageText(
                `🆘 Создание заявки — Шаг 1/4\nВыберите регион инцидента:`,
                {
                    chat_id: chatId,
                    message_id: q.message.message_id,
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🇷🇺 Россия', callback_data: 'region_ru' }],
                            [{ text: '🇺🇦 Украина', callback_data: 'region_ua' }],
                            [{ text: '🇰🇿 Казахстан', callback_data: 'region_kz' }],
                            [{ text: '🌍 Другое', callback_data: 'region_other' }],
                            [{ text: '📋 Вернуться в меню', callback_data: 'main_menu' }]
                        ]
                    }
                }
            );
        }

        if (dataCb.startsWith('region_')) {
            const session = data.sessions.get(userId);
            const regions = {
                'region_ru': 'Россия',
                'region_ua': 'Украина',
                'region_kz': 'Казахстан',
                'region_other': 'Другое'
            };
            if (!session) return;
            session.region = regions[dataCb];
            session.step++;

            if (session.type === 'join') {
                data.states.set(userId, 'wait_nickname');
                await bot.sendMessage(chatId,
                    `👤 Введите ваш псевдоним для защитника:`);
            } else {
                await bot.editMessageText(
                    `🆘 Выбран регион: ${session.region}\n` +
                    `Шаг 2/4 — выберите тип проблемы:`,
                    {
                        chat_id: chatId,
                        message_id: q.message.message_id,
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '💰 Вымогательство', callback_data: 'crime_extortion' }],
                                [{ text: '😔 Кибербуллинг', callback_data: 'crime_bullying' }],
                                [{ text: '🎭 Мошенничество', callback_data: 'crime_fraud' }],
                                [{ text: '🌀 Другое', callback_data: 'crime_other' }],
                                [{ text: '📋 Меню', callback_data: 'main_menu' }]
                            ]
                        }
                    }
                );
            }
            return;
        }

        if (dataCb.startsWith('crime_')) {
            const session = data.sessions.get(userId);
            if (!session) return;
            session.crimeType = dataCb.replace('crime_', '');
            session.step++;
            data.states.set(userId, 'wait_description');

            await bot.sendMessage(chatId,
                `📝 Опишите ситуацию подробно:`);
            return;
        }

        if (dataCb === 'confirm_yes') {
            const session = data.sessions.get(userId);
            if (!session) return;

            // Защитник
            if (session.type === 'join') {
                const defenderId = `${userId}-${Date.now()}`;
                data.defenders.set(defenderId, {
                    id: defenderId,
                    userId,
                    nickname: session.nickname,
                    region: session.region
                });

                await bot.editMessageText(
                    `🎉 Регистрация успешна!\nВы зарегистрированы как защитник в регионе ${session.region}`,
                    { chat_id: chatId, message_id: q.message.message_id }
                );

                clearSession(userId);
                return;
            }

            // Заявка
            if (session.type === 'report') {
                const rId = genReportId();
                data.reports.set(rId, {
                    id: rId,
                    userId,
                    region: session.region,
                    crimeType: session.crimeType,
                    description: session.description,
                    status: 'pending'
                });

                await bot.editMessageText(
                    `✅ Заявка отправлена! ID: ${rId}`,
                    { chat_id: chatId, message_id: q.message.message_id }
                );

                clearSession(userId);
                return;
            }
        }

    } catch (err) {
        console.error('Callback error:', err);
    }
});

// ================= ОБРАБОТКА TEXT =================
bot.on('message', async (msg) => {
    if (msg.text?.startsWith('/')) return;
    const userId = msg.from.id.toString();
    const state = data.states.get(userId);

    if (state === 'wait_nickname') {
        const session = data.sessions.get(userId);
        session.nickname = msg.text.trim();
        data.states.set(userId, null);

        await bot.sendMessage(msg.chat.id,
            `Псевдоним сохранён: ${session.nickname}\n` +
            `Введите специализацию:`
        );

        data.states.set(userId, 'wait_specialty');
        return;
    }

    if (state === 'wait_specialty') {
        const session = data.sessions.get(userId);
        session.specialty = msg.text.trim();
        data.states.set(userId, null);

        await bot.sendMessage(msg.chat.id,
            `Специализация: ${session.specialty}\n` +
            `Нажмите Подтвердить:`,
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✅ Подтвердить', callback_data: 'confirm_yes' }],
                        [{ text: '❌ Отменить', callback_data: 'main_menu' }]
                    ]
                }
            }
        );
        return;
    }

    if (state === 'wait_description') {
        const session = data.sessions.get(userId);
        session.description = msg.text.trim();
        data.states.set(userId, null);

        await bot.sendMessage(msg.chat.id,
            `Описание сохранено. Нажмите Отправить:`,
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✅ Отправить заявку', callback_data: 'confirm_yes' }],
                        [{ text: '❌ Отменить', callback_data: 'main_menu' }]
                    ]
                }
            }
        );
        return;
    }
});

console.log('🛡️ Bakelite Bot запущен');

