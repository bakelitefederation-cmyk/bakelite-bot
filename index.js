// ============================================
// 🛡️ BAKELITE BOT v3.0 - ПОЛНОСТЬЮ ПЕРЕРАБОТАННЫЙ КОД
// ============================================

const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

console.log('🚀 Загружаем Bakelite Bot v3.0...');

// ================= КОНФИГУРАЦИЯ =================
const CONFIG = {
    BOT_TOKEN: process.env.BOT_TOKEN || '',
    ADMIN_ID: parseInt(process.env.ADMIN_ID) || null,
    VERSION: '3.0.0',
    PORT: process.env.PORT || 3000,
    NODE_ENV: process.env.NODE_ENV || 'development'
};

// Проверка токена
if (!CONFIG.BOT_TOKEN) {
    console.error('❌ ОШИБКА: BOT_TOKEN не установлен!');
    console.error('ℹ️  Установите переменную среды BOT_TOKEN');
    process.exit(1);
}

// ================= ХРАНЕНИЕ ДАННЫХ =================
const data = {
    defenders: new Map(),
    pendingDefenders: new Map(),
    reports: new Map(),
    userSessions: new Map(),
    userStates: new Map()
};

let reportCounter = 1;
let defenderCounter = 1;

console.log('✅ Структура данных создана');

// ================= ИНИЦИАЛИЗАЦИЯ БОТА =================
console.log('🤖 Инициализируем Telegram бота...');

const botOptions = {
    polling: CONFIG.NODE_ENV === 'development'
};

const bot = new TelegramBot(CONFIG.BOT_TOKEN, botOptions);

if (CONFIG.NODE_ENV === 'production') {
    console.log('🌐 Режим production: настраиваем веб-сервер для Railway...');
    const app = express();
    
    app.use(express.json());
    
    app.get('/', (req, res) => {
        res.json({ 
            status: 'online', 
            version: CONFIG.VERSION,
            service: 'Bakelite Bot'
        });
    });
    
    app.post(`/bot${CONFIG.BOT_TOKEN}`, (req, res) => {
        bot.processUpdate(req.body);
        res.sendStatus(200);
    });
    
    app.listen(CONFIG.PORT, () => {
        console.log(`✅ Сервер запущен на порту ${CONFIG.PORT}`);
        console.log(`✅ Вебхук настроен: /bot${CONFIG.BOT_TOKEN.substring(0, 15)}...`);
    });
    
    // Устанавливаем вебхук
    const webhookUrl = process.env.RAILWAY_PUBLIC_DOMAIN 
        ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/bot${CONFIG.BOT_TOKEN}`
        : process.env.WEBHOOK_URL;
    
    if (webhookUrl) {
        bot.setWebHook(webhookUrl).then(() => {
            console.log(`✅ Вебхук установлен: ${webhookUrl}`);
        }).catch(console.error);
    }
} else {
    console.log('🔧 Режим development: используем polling');
    bot.startPolling();
}

console.log('✅ Бот инициализирован успешно');

// ================= ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =================

function generateReportId() {
    return `RPT-${Date.now()}-${reportCounter++}`;
}

function generateDefenderId() {
    return `DEF-${Date.now()}-${defenderCounter++}`;
}

function getStatusEmoji(status) {
    const emojis = {
        'pending': '🟡',
        'in_progress': '🟠',
        'completed': '🟢',
        'rejected': '🔴',
        'assigned': '🔵'
    };
    return emojis[status] || '⚪';
}

async function notifyDefenders(report) {
    console.log(`🔔 Ищу защитников для уведомления по заявке ${report.id}`);
    
    let notifiedCount = 0;
    
    // Ищем защитников в том же регионе
    for (const [defenderId, defender] of data.defenders) {
        if (defender.region === report.region && defender.isActive) {
            try {
                const message = `
🆘 <b>НОВАЯ ЗАЯВКА О ПОМОЩИ</b>

<b>ID заявки:</b> ${report.id}
<b>Регион:</b> ${report.region}
<b>Тип проблемы:</b> ${report.crimeType}
<b>Дата:</b> ${new Date(report.createdAt).toLocaleString('ru-RU')}

<b>Краткое описание:</b>
${report.description.substring(0, 200)}${report.description.length > 200 ? '...' : ''}

<b>Статус:</b> ${report.status}
                `;
                
                await bot.sendMessage(defender.userId, message, {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { 
                                    text: '✅ Взять в работу', 
                                    callback_data: `take_report_${report.id}` 
                                },
                                { 
                                    text: '👁️ Посмотреть', 
                                    callback_data: `view_report_${report.id}` 
                                }
                            ]
                        ]
                    }
                });
                
                console.log(`✅ Уведомление отправлено защитнику ${defender.username || defender.userId}`);
                notifiedCount++;
                
                // Ограничим количество уведомлений
                if (notifiedCount >= 10) break;
                
            } catch (error) {
                console.error(`❌ Ошибка отправки уведомления защитнику ${defenderId}:`, error.message);
            }
        }
    }
    
    console.log(`📊 Уведомления отправлены ${notifiedCount} защитникам`);
    return notifiedCount;
}

async function clearUserState(userId) {
    data.userStates.delete(userId.toString());
    data.userSessions.delete(userId.toString());
}

// ================= ОСНОВНЫЕ КОМАНДЫ =================

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const userName = msg.from.first_name || 'Пользователь';
    
    console.log(`/start от ${userName} (${userId})`);
    
    // Очищаем предыдущее состояние
    await clearUserState(userId);
    
    const welcomeMessage = `
🛡️ <b>Добро пожаловать в Bakelite Bot v${CONFIG.VERSION}!</b>

👋 Привет, ${userName}! Я - система помощи жертвам киберпреступлений.

👇 <b>Выберите действие:</b>
    `;
    
    const keyboard = {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🛡️ Стать защитником', callback_data: 'menu_join' }],
                [{ text: '🆘 Запросить помощь', callback_data: 'menu_report' }],
                [{ text: '📊 Статус моей заявки', callback_data: 'menu_status' }],
                [{ text: '📖 Справка', callback_data: 'menu_help' }]
            ]
        }
    };
    
    try {
        await bot.sendMessage(chatId, welcomeMessage, {
            parse_mode: 'HTML',
            ...keyboard
        });
    } catch (error) {
        console.error('Ошибка отправки приветствия:', error);
    }
});

bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;
    
    const helpMessage = `
📖 <b>СПРАВКА И ИНСТРУКЦИИ</b>

<b>Основные функции:</b>
• 🛡️ <b>Стать защитником</b> - зарегистрироваться как волонтер для помощи другим
• 🆘 <b>Запросить помощь</b> - создать заявку если вы стали жертвой киберпреступления
• 📊 <b>Статус заявки</b> - отслеживать ваши обращения
• 📖 <b>Справка</b> - эта страница

<b>Процесс "Стать защитником":</b>
1. Выбор региона
2. Ввод псевдонима
3. Описание вашей специализации
4. Подтверждение регистрации

<b>Процесс "Запросить помощь":</b>
1. Выбор региона инцидента
2. Выбор типа проблемы
3. Подробное описание ситуации
4. Подтверждение и отправка

<b>Что делать если кнопки не работают?</b>
Используйте команду /start для перезагрузки меню.

<b>Поддержка:</b>
Для вопросов используйте команду /start и выберите "Справка"
    `;
    
    try {
        await bot.sendMessage(chatId, helpMessage, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📋 Вернуться в меню', callback_data: 'menu_main' }]
                ]
            }
        });
    } catch (error) {
        console.error('Ошибка отправки справки:', error);
    }
});

bot.onText(/\/admin/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (CONFIG.ADMIN_ID && userId !== CONFIG.ADMIN_ID) {
        await bot.sendMessage(chatId, '❌ Доступ запрещен');
        return;
    }
    
    const stats = `
<b>📊 АДМИНИСТРАТИВНАЯ ПАНЕЛЬ</b>

<b>Общая статистика:</b>
• Защитников: ${data.defenders.size}
• Ожидающих защитников: ${data.pendingDefenders.size}
• Активных заявок: ${Array.from(data.reports.values()).filter(r => r.status === 'pending' || r.status === 'in_progress').length}
• Всего заявок: ${data.reports.size}

<b>Последние 5 заявок:</b>
${Array.from(data.reports.values())
    .slice(-5)
    .reverse()
    .map(report => `• ${report.id} - ${report.crimeType} - ${report.status}`)
    .join('\n') || 'Нет заявок'}

<b>Система:</b>
• Версия: ${CONFIG.VERSION}
• Режим: ${CONFIG.NODE_ENV}
• Время работы: ${process.uptime().toFixed(0)} сек.
    `;
    
    try {
        await bot.sendMessage(chatId, stats, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔄 Обновить', callback_data: 'admin_refresh' }],
                    [{ text: '📋 В меню', callback_data: 'menu_main' }]
                ]
            }
        });
    } catch (error) {
        console.error('Ошибка админ-панели:', error);
    }
});

// ================= ОБРАБОТЧИК CALLBACK (ИСПРАВЛЕННЫЙ) =================

bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const userId = callbackQuery.from.id;
    const callbackData = callbackQuery.data;
    const messageId = callbackQuery.message.message_id;
    
    console.log(`📲 Callback: "${callbackData}" от ${userId}`);
    
    try {
        // Немедленно отвечаем на callback чтобы убрать "часики"
        await bot.answerCallbackQuery(callbackQuery.id);
        
        // Обработка разных типов callback данных
        if (callbackData === 'menu_join') {
            await handleJoinMenu(chatId, userId, messageId);
        }
        else if (callbackData === 'menu_report') {
            await handleReportMenu(chatId, userId, messageId);
        }
        else if (callbackData === 'menu_status') {
            await handleStatusMenu(chatId, userId, messageId);
        }
        else if (callbackData === 'menu_help') {
            await handleHelpMenu(chatId, messageId);
        }
        else if (callbackData === 'menu_main') {
            await handleMainMenu(chatId, userId, messageId);
        }
        else if (callbackData === 'admin_refresh') {
            await bot.deleteMessage(chatId, messageId);
            await bot.sendMessage(chatId, 'Обновляю...').then(msg => {
                setTimeout(() => {
                    bot.deleteMessage(chatId, msg.message_id);
                    bot.sendMessage(chatId, 'Используйте /admin для обновления');
                }, 1000);
            });
        }
        else if (callbackData.startsWith('region_')) {
            await handleRegionSelection(chatId, userId, messageId, callbackData);
        }
        else if (callbackData.startsWith('crime_')) {
            await handleCrimeSelection(chatId, userId, messageId, callbackData);
        }
        else if (callbackData.startsWith('confirm_')) {
            await handleConfirmation(chatId, userId, messageId, callbackData);
        }
        else if (callbackData.startsWith('take_report_')) {
            await handleTakeReport(chatId, userId, messageId, callbackData);
        }
        else if (callbackData.startsWith('view_report_')) {
            await handleViewReport(chatId, userId, messageId, callbackData);
        }
        else {
            console.warn(`Неизвестный callback_data: ${callbackData}`);
            await bot.sendMessage(chatId, '❌ Неизвестная команда. Используйте /start');
        }
    } catch (error) {
        console.error('❌ Ошибка обработки callback:', error);
        try {
            await bot.sendMessage(chatId, '⚠️ Произошла ошибка. Попробуйте еще раз или используйте /start');
        } catch (sendError) {
            console.error('Не удалось отправить сообщение об ошибке:', sendError);
        }
    }
});

// ================= ОБРАБОТКА СООБЩЕНИЙ (для текстовых ответов) =================

bot.on('message', async (msg) => {
    // Пропускаем команды и не-текстовые сообщения
    if (msg.text?.startsWith('/') || !msg.text) return;
    
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const userText = msg.text.trim();
    
    const userState = data.userStates.get(userId.toString());
    
    if (!userState) {
        // Если нет активного состояния, предлагаем меню
        await bot.sendMessage(chatId, 'Используйте меню или команду /start для начала работы');
        return;
    }
    
    try {
        if (userState.waitingFor === 'defender_nickname') {
            await handleDefenderNickname(chatId, userId, userText);
        }
        else if (userState.waitingFor === 'defender_specialty') {
            await handleDefenderSpecialty(chatId, userId, userText);
        }
        else if (userState.waitingFor === 'report_description') {
            await handleReportDescription(chatId, userId, userText);
        }
        else {
            await bot.sendMessage(chatId, 'Сначала выберите действие в меню');
            await clearUserState(userId);
        }
    } catch (error) {
        console.error('Ошибка обработки сообщения:', error);
        await bot.sendMessage(chatId, '❌ Произошла ошибка. Начните заново с /start');
        await clearUserState(userId);
    }
});

// ================= ФУНКЦИИ ОБРАБОТКИ МЕНЮ =================

async function handleJoinMenu(chatId, userId, messageId) {
    console.log(`🛡️ Пользователь ${userId} начал регистрацию защитника`);
    
    // Создаем сессию
    data.userSessions.set(userId.toString(), {
        type: 'join',
        step: 1,
        data: {}
    });
    
    // Устанавливаем состояние
    data.userStates.set(userId.toString(), {
        action: 'join',
        step: 'region'
    });
    
    const keyboard = {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '🇷🇺 Россия', callback_data: 'region_ru' },
                    { text: '🇺🇦 Украина', callback_data: 'region_ua' }
                ],
                [
                    { text: '🇰🇿 Казахстан', callback_data: 'region_kz' },
                    { text: '🌍 Другое', callback_data: 'region_other' }
                ],
                [{ text: '📋 Вернуться в меню', callback_data: 'menu_main' }]
            ]
        }
    };
    
    try {
        await bot.editMessageText(
            `🛡️ <b>СТАТЬ ЗАЩИТНИКОМ</b>\n\n` +
            `<b>Шаг 1/3:</b> Выберите ваш регион:`,
            {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML',
                ...keyboard
            }
        );
    } catch (error) {
        console.error('Ошибка редактирования сообщения:', error);
        // Если не удалось отредактировать, отправляем новое
        await bot.sendMessage(chatId, 
            `🛡️ <b>СТАТЬ ЗАЩИТНИКОМ</b>\n\n` +
            `<b>Шаг 1/3:</b> Выберите ваш регион:`,
            { parse_mode: 'HTML', ...keyboard }
        );
    }
}

async function handleReportMenu(chatId, userId, messageId) {
    console.log(`🆘 Пользователь ${userId} начал заявку о помощи`);
    
    // Создаем сессию
    data.userSessions.set(userId.toString(), {
        type: 'report',
        step: 1,
        data: {}
    });
    
    // Устанавливаем состояние
    data.userStates.set(userId.toString(), {
        action: 'report',
        step: 'region'
    });
    
    const keyboard = {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '🇷🇺 Россия', callback_data: 'region_ru' },
                    { text: '🇺🇦 Украина', callback_data: 'region_ua' }
                ],
                [
                    { text: '🇰🇿 Казахстан', callback_data: 'region_kz' },
                    { text: '🌍 Другое', callback_data: 'region_other' }
                ],
                [{ text: '📋 Вернуться в меню', callback_data: 'menu_main' }]
            ]
        }
    };
    
    try {
        await bot.editMessageText(
            `🆘 <b>ЗАПРОС ПОМОЩИ</b>\n\n` +
            `<b>Шаг 1/4:</b> Выберите регион, где произошел инцидент:`,
            {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML',
                ...keyboard
            }
        );
    } catch (error) {
        console.error('Ошибка редактирования сообщения:', error);
        await bot.sendMessage(chatId, 
            `🆘 <b>ЗАПРОС ПОМОЩИ</b>\n\n` +
            `<b>Шаг 1/4:</b> Выберите регион, где произошел инцидент:`,
            { parse_mode: 'HTML', ...keyboard }
        );
    }
}

async function handleStatusMenu(chatId, userId, messageId) {
    console.log(`📊 Пользователь ${userId} запросил статус`);
    
    // Находим заявки пользователя
    const userReports = Array.from(data.reports.values())
        .filter(report => report.userId === userId.toString());
    
    // Находим заявки защитника
    const defenderReports = Array.from(data.reports.values())
        .filter(report => report.assignedTo === userId.toString());
    
    try {
        if (userReports.length === 0 && defenderReports.length === 0) {
            await bot.editMessageText(
                `📊 <b>СТАТУС ЗАЯВОК</b>\n\n` +
                `У вас пока нет заявок о помощи.\n\n` +
                `Используйте кнопку "🆘 Запросить помощь" в меню.`,
                {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '📋 Вернуться в меню', callback_data: 'menu_main' }]
                        ]
                    }
                }
            );
            return;
        }
        
        let statusMessage = `📊 <b>СТАТУС ВАШИХ ЗАЯВОК</b>\n\n`;
        
        if (userReports.length > 0) {
            statusMessage += `<b>Ваши заявки как пострадавшего:</b> ${userReports.length}\n\n`;
            
            userReports.forEach((report, index) => {
                statusMessage += `${index + 1}. ${getStatusEmoji(report.status)} <b>Заявка #${report.id}</b>\n`;
                statusMessage += `   Тип: ${report.crimeType}\n`;
                statusMessage += `   Статус: ${report.status}\n`;
                if (report.assignedTo) {
                    statusMessage += `   Назначена защитнику: ${report.assignedToName || 'ID: ' + report.assignedTo}\n`;
                }
                statusMessage += `   Дата: ${new Date(report.createdAt).toLocaleDateString('ru-RU')}\n\n`;
            });
        }
        
        if (defenderReports.length > 0) {
            statusMessage += `<b>Заявки, назначенные вам как защитнику:</b> ${defenderReports.length}\n\n`;
            
            defenderReports.forEach((report, index) => {
                statusMessage += `${index + 1}. ${getStatusEmoji(report.status)} <b>Заявка #${report.id}</b>\n`;
                statusMessage += `   Тип: ${report.crimeType}\n`;
                statusMessage += `   Статус: ${report.status}\n`;
                statusMessage += `   От: пользователь ${report.userId}\n`;
                statusMessage += `   Дата: ${new Date(report.createdAt).toLocaleDateString('ru-RU')}\n\n`;
            });
        }
        
        statusMessage += `<i>Для обновления статуса проверьте позже.</i>`;
        
        await bot.editMessageText(statusMessage, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔄 Обновить', callback_data: 'menu_status' }],
                    [{ text: '📋 В меню', callback_data: 'menu_main' }]
                ]
            }
        });
    } catch (error) {
        console.error('Ошибка статуса:', error);
        await bot.sendMessage(chatId, '❌ Ошибка при получении статуса');
    }
}

async function handleHelpMenu(chatId, messageId) {
    const helpMessage = `
📖 <b>СПРАВКА</b>

Используйте кнопки в меню для навигации.

<b>Основные функции:</b>
• 🛡️ Стать защитником - помогать другим
• 🆘 Запросить помощь - если стали жертвой
• 📊 Статус заявки - отслеживать обращения
• 📖 Справка - эта страница

<b>Контакты поддержки:</b>
Для вопросов используйте команду /help или обратитесь к администратору.
    `;
    
    try {
        await bot.editMessageText(helpMessage, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📋 Вернуться в меню', callback_data: 'menu_main' }]
                ]
            }
        });
    } catch (error) {
        console.error('Ошибка справки:', error);
        await bot.sendMessage(chatId, helpMessage, { parse_mode: 'HTML' });
    }
}

async function handleMainMenu(chatId, userId, messageId) {
    try {
        await bot.editMessageText(
            `🛡️ <b>Добро пожаловать в Bakelite Bot v${CONFIG.VERSION}!</b>\n\n` +
            `👇 <b>Выберите действие:</b>`,
            {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🛡️ Стать защитником', callback_data: 'menu_join' }],
                        [{ text: '🆘 Запросить помощь', callback_data: 'menu_report' }],
                        [{ text: '📊 Статус моей заявки', callback_data: 'menu_status' }],
                        [{ text: '📖 Справка', callback_data: 'menu_help' }]
                    ]
                }
            }
        );
    } catch (error) {
        console.error('Ошибка главного меню:', error);
        // Отправляем новое сообщение если не удалось отредактировать
        await bot.sendMessage(chatId, 
            `🛡️ <b>Добро пожаловать в Bakelite Bot v${CONFIG.VERSION}!</b>\n\n` +
            `👇 <b>Выберите действие:</b>`,
            {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🛡️ Стать защитником', callback_data: 'menu_join' }],
                        [{ text: '🆘 Запросить помощь', callback_data: 'menu_report' }],
                        [{ text: '📊 Статус моей заявки', callback_data: 'menu_status' }],
                        [{ text: '📖 Справка', callback_data: 'menu_help' }]
                    ]
                }
            }
        );
    }
}

// ================= ФУНКЦИИ ОБРАБОТКИ ВЫБОРА РЕГИОНА =================

async function handleRegionSelection(chatId, userId, messageId, regionData) {
    console.log(`📍 Пользователь ${userId} выбрал регион: ${regionData}`);
    
    const session = data.userSessions.get(userId.toString());
    if (!session) {
        await bot.sendMessage(chatId, '❌ Сессия не найдена. Начните заново с /start');
        return;
    }
    
    // Определяем регион
    let region, regionEmoji;
    switch (regionData) {
        case 'region_ru': 
            region = 'Россия'; 
            regionEmoji = '🇷🇺';
            break;
        case 'region_ua': 
            region = 'Украина'; 
            regionEmoji = '🇺🇦';
            break;
        case 'region_kz': 
            region = 'Казахстан'; 
            regionEmoji = '🇰🇿';
            break;
        case 'region_other': 
            region = 'Другое'; 
            regionEmoji = '🌍';
            break;
        default: 
            region = 'Не указано';
            regionEmoji = '📍';
    }
    
    // Сохраняем регион в сессии
    session.data.region = region;
    session.data.regionEmoji = regionEmoji;
    session.step = 2;
    data.userSessions.set(userId.toString(), session);
    
    // Обновляем состояние пользователя
    const userState = data.userStates.get(userId.toString());
    if (userState) {
        if (userState.action === 'join') {
            userState.waitingFor = 'defender_nickname';
            data.userStates.set(userId.toString(), userState);
            
            await bot.editMessageText(
                `${regionEmoji} <b>Регион выбран: ${region}</b>\n\n` +
                `<b>Шаг 2/3:</b> Введите ваш псевдоним (имя в системе):\n\n` +
                `<i>Пример: CyberHelper, SecurityGuard, WhiteHat42</i>\n\n` +
                `<b>Просто напишите сообщение с псевдонимом:</b>`,
                {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '↩️ Назад', callback_data: session.type === 'join' ? 'menu_join' : 'menu_report' }],
                            [{ text: '📋 В меню', callback_data: 'menu_main' }]
                        ]
                    }
                }
            );
        } 
        else if (userState.action === 'report') {
            userState.step = 'crime';
            data.userStates.set(userId.toString(), userState);
            
            const keyboard = {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '💰 Вымогательство', callback_data: 'crime_extortion' },
                            { text: '😔 Буллинг', callback_data: 'crime_bullying' }
                        ],
                        [
                            { text: '🎭 Мошенничество', callback_data: 'crime_fraud' },
                            { text: '⚖️ Шантаж', callback_data: 'crime_blackmail' }
                        ],
                        [
                            { text: '💔 Домогательства', callback_data: 'crime_harassment' },
                            { text: '🔐 Взлом', callback_data: 'crime_hacking' }
                        ],
                        [
                            { text: '🌀 Другое', callback_data: 'crime_other' }
                        ],
                        [
                            { text: '↩️ Назад', callback_data: 'menu_report' },
                            { text: '📋 В меню', callback_data: 'menu_main' }
                        ]
                    ]
                }
            };
            
            await bot.editMessageText(
                `${regionEmoji} <b>Регион инцидента: ${region}</b>\n\n` +
                `<b>Шаг 2/4:</b> Выберите тип проблемы:`,
                {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'HTML',
                    ...keyboard
                }
            );
        }
    }
}

// ================= ФУНКЦИИ ОБРАБОТКИ ВЫБОРА ПРЕСТУПЛЕНИЯ =================

async function handleCrimeSelection(chatId, userId, messageId, crimeData) {
    console.log(`⚠️ Пользователь ${userId} выбрал: ${crimeData}`);
    
    const session = data.userSessions.get(userId.toString());
    if (!session) {
        await bot.sendMessage(chatId, '❌ Сессия не найдена. Начните заново.');
        return;
    }
    
    // Определяем тип преступления
    let crimeType, crimeEmoji;
    switch (crimeData) {
        case 'crime_extortion': 
            crimeType = 'Вымогательство'; 
            crimeEmoji = '💰';
            break;
        case 'crime_bullying': 
            crimeType = 'Кибербуллинг'; 
            crimeEmoji = '😔';
            break;
        case 'crime_fraud': 
            crimeType = 'Мошенничество'; 
            crimeEmoji = '🎭';
            break;
        case 'crime_blackmail': 
            crimeType = 'Шантаж'; 
            crimeEmoji = '⚖️';
            break;
        case 'crime_harassment': 
            crimeType = 'Домогательства'; 
            crimeEmoji = '💔';
            break;
        case 'crime_hacking': 
            crimeType = 'Взлом аккаунта'; 
            crimeEmoji = '🔐';
            break;
        case 'crime_other': 
            crimeType = 'Другое'; 
            crimeEmoji = '🌀';
            break;
        default: 
            crimeType = 'Не указано';
            crimeEmoji = '⚠️';
    }
    
    // Сохраняем в сессии
    session.data.crimeType = crimeType;
    session.data.crimeEmoji = crimeEmoji;
    session.step = 3;
    data.userSessions.set(userId.toString(), session);
    
    // Обновляем состояние
    const userState = data.userStates.get(userId.toString());
    if (userState) {
        userState.waitingFor = 'report_description';
        data.userStates.set(userId.toString(), userState);
    }
    
    await bot.editMessageText(
        `${crimeEmoji} <b>Тип проблемы: ${crimeType}</b>\n\n` +
        `<b>Шаг 3/4:</b> Опишите ситуацию подробно:\n\n` +
        `<i>• Что произошло?\n` +
        `• Когда это случилось?\n` +
        `• Есть ли доказательства (скриншоты, ссылки, переписка)?\n` +
        `• Что уже предприняли?</i>\n\n` +
        `<b>Просто напишите подробное сообщение:</b>`,
        {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '↩️ Назад', callback_data: 'menu_report' }],
                    [{ text: '📋 В меню', callback_data: 'menu_main' }]
                ]
            }
        }
    );
}

// ================= ОБРАБОТКА ТЕКСТОВЫХ СООБЩЕНИЙ =================

async function handleDefenderNickname(chatId, userId, nickname) {
    const session = data.userSessions.get(userId.toString());
    if (!session) {
        await bot.sendMessage(chatId, '❌ Сессия не найдена. Начните заново.');
        return;
    }
    
    if (nickname.length < 2 || nickname.length > 50) {
        await bot.sendMessage(chatId, '❌ Псевдоним должен быть от 2 до 50 символов. Попробуйте еще раз:');
        return;
    }
    
    // Сохраняем псевдоним
    session.data.nickname = nickname;
    session.step = 3;
    data.userSessions.set(userId.toString(), session);
    
    // Обновляем состояние
    const userState = data.userStates.get(userId.toString());
    if (userState) {
        userState.waitingFor = 'defender_specialty';
        data.userStates.set(userId.toString(), userState);
    }
    
    await bot.sendMessage(chatId,
        `👤 <b>Псевдоним: ${nickname}</b>\n\n` +
        `<b>Шаг 3/3:</b> Опишите вашу специализацию или опыт:\n\n` +
        `<i>Пример: "Юрист в области IT-права", "Психолог, работаю с жертвами буллинга", "IT-специалист, помогаю с восстановлением аккаунтов"</i>\n\n` +
        `<b>Напишите сообщение с описанием:</b>`,
        {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📋 В меню', callback_data: 'menu_main' }]
                ]
            }
        }
    );
}

async function handleDefenderSpecialty(chatId, userId, specialty) {
    const session = data.userSessions.get(userId.toString());
    if (!session) {
        await bot.sendMessage(chatId, '❌ Сессия не найдена. Начните заново.');
        return;
    }
    
    if (specialty.length < 10 || specialty.length > 500) {
        await bot.sendMessage(chatId, '❌ Описание должно быть от 10 до 500 символов. Попробуйте еще раз:');
        return;
    }
    
    // Сохраняем специализацию
    session.data.specialty = specialty;
    session.data.createdAt = new Date().toISOString();
    
    // Создаем защитника
    const defenderId = generateDefenderId();
    const defender = {
        id: defenderId,
        userId: userId.toString(),
        nickname: session.data.nickname,
        specialty: specialty,
        region: session.data.region,
        regionEmoji: session.data.regionEmoji,
        isActive: true,
        joinedAt: new Date().toISOString(),
        helpedCount: 0,
        rating: 0
    };
    
    // Сохраняем в defenders
    data.defenders.set(defenderId, defender);
    
    // Очищаем состояния
    await clearUserState(userId);
    
    const keyboard = {
        reply_markup: {
            inline_keyboard: [
                [{ text: '✅ Подтвердить регистрацию', callback_data: 'confirm_yes' }],
                [{ text: '❌ Отменить', callback_data: 'confirm_no' }]
            ]
        }
    };
    
    await bot.sendMessage(chatId,
        `🛡️ <b>ПРЕДВАРИТЕЛЬНЫЙ ПРОСМОТР</b>\n\n` +
        `<b>Ваши данные:</b>\n` +
        `• Регион: ${session.data.regionEmoji} ${session.data.region}\n` +
        `• Псевдоним: ${session.data.nickname}\n` +
        `• Специализация: ${specialty.substring(0, 100)}${specialty.length > 100 ? '...' : ''}\n\n` +
        `<b>Подтвердить регистрацию как защитника?</b>\n\n` +
        `<i>После подтверждения вы сможете получать уведомления о новых заявках в вашем регионе и помогать людям.</i>`,
        {
            parse_mode: 'HTML',
            ...keyboard
        }
    );
}

async function handleReportDescription(chatId, userId, description) {
    const session = data.userSessions.get(userId.toString());
    if (!session) {
        await bot.sendMessage(chatId, '❌ Сессия не найдена. Начните заново.');
        return;
    }
    
    if (description.length < 20 || description.length > 2000) {
        await bot.sendMessage(chatId, '❌ Описание должно быть от 20 до 2000 символов. Попробуйте еще раз:');
        return;
    }
    
    // Сохраняем описание
    session.data.description = description;
    session.data.createdAt = new Date().toISOString();
    session.step = 4;
    data.userSessions.set(userId.toString(), session);
    
    const keyboard = {
        reply_markup: {
            inline_keyboard: [
                [{ text: '✅ Отправить заявку', callback_data: 'confirm_yes' }],
                [{ text: '❌ Отменить', callback_data: 'confirm_no' }],
                [{ text: '📋 В меню', callback_data: 'menu_main' }]
            ]
        }
    };
    
    await bot.sendMessage(chatId,
        `📋 <b>ПРЕДВАРИТЕЛЬНЫЙ ПРОСМОТР ЗАЯВКИ</b>\n\n` +
        `<b>Регион:</b> ${session.data.regionEmoji} ${session.data.region}\n` +
        `<b>Тип проблемы:</b> ${session.data.crimeEmoji} ${session.data.crimeType}\n` +
        `<b>Описание:</b>\n${description.substring(0, 300)}${description.length > 300 ? '...' : ''}\n\n` +
        `<b>Отправить заявку?</b>\n\n` +
        `<i>После отправки защитники в вашем регионе получат уведомление и смогут вам помочь.</i>`,
        {
            parse_mode: 'HTML',
            ...keyboard
        }
    );
}

// ================= ОБРАБОТКА ПОДТВЕРЖДЕНИЯ =================

async function handleConfirmation(chatId, userId, messageId, confirmData) {
    console.log(`✅ Пользователь ${userId} подтвердил: ${confirmData}`);
    
    const session = data.userSessions.get(userId.toString());
    
    try {
        if (confirmData === 'confirm_yes') {
            if (!session) {
                await bot.editMessageText('❌ Сессия не найдена. Начните заново.', {
                    chat_id: chatId,
                    message_id: messageId
                });
                return;
            }
            
            if (session.type === 'join') {
                // Завершаем регистрацию защитника
                const defenderId = `DEF-${userId}-${Date.now()}`;
                const defender = {
                    id: defenderId,
                    userId: userId.toString(),
                    nickname: session.data.nickname || 'Аноним',
                    specialty: session.data.specialty || 'Не указано',
                    region: session.data.region || 'Не указано',
                    isActive: true,
                    joinedAt: new Date().toISOString(),
                    helpedCount: 0
                };
                
                data.defenders.set(defenderId, defender);
                data.pendingDefenders.delete(userId.toString());
                
                await bot.editMessageText(
                    `🎉 <b>РЕГИСТРАЦИЯ УСПЕШНА!</b>\n\n` +
                    `Теперь вы зарегистрированы как защитник.\n\n` +
                    `<b>Ваши данные:</b>\n` +
                    `• Псевдоним: ${defender.nickname}\n` +
                    `• Регион: ${defender.region}\n` +
                    `• Специализация: ${defender.specialty.substring(0, 100)}${defender.specialty.length > 100 ? '...' : ''}\n\n` +
                    `<i>Вы будете получать уведомления о новых заявках в вашем регионе.</i>`,
                    {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'HTML',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '📋 В главное меню', callback_data: 'menu_main' }]
                            ]
                        }
                    }
                );
                
                console.log(`✅ Защитник зарегистрирован: ${defender.nickname} (${userId})`);
                
            } else if (session.type === 'report') {
                // Создаем заявку о помощи
                const reportId = generateReportId();
                const report = {
                    id: reportId,
                    userId: userId.toString(),
                    region: session.data.region || 'Не указано',
                    regionEmoji: session.data.regionEmoji || '📍',
                    crimeType: session.data.crimeType || 'Не указано',
                    crimeEmoji: session.data.crimeEmoji || '⚠️',
                    description: session.data.description || '',
                    status: 'pending',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    assignedTo: null,
                    assignedToName: null
                };
                
                data.reports.set(reportId, report);
                
                // Отправляем уведомления защитникам
                const notifiedCount = await notifyDefenders(report);
                
                await bot.editMessageText(
                    `✅ <b>ЗАЯВКА ОТПРАВЛЕНА!</b>\n\n` +
                    `<b>ID вашей заявки:</b> ${reportId}\n` +
                    `<b>Статус:</b> Ожидает защитника\n` +
                    `<b>Уведомлено защитников:</b> ${notifiedCount}\n\n` +
                    `<i>Защитник свяжется с вами когда возьмется за работу.\n` +
                    `Вы можете отслеживать статус в меню "Статус моей заявки".</i>`,
                    {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'HTML',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '📊 Проверить статус', callback_data: 'menu_status' }],
                                [{ text: '📋 В главное меню', callback_data: 'menu_main' }]
                            ]
                        }
                    }
                );
                
                console.log(`✅ Заявка создана: ${reportId} от ${userId}`);
                
                // Уведомляем администратора
                if (CONFIG.ADMIN_ID) {
                    try {
                        await bot.sendMessage(CONFIG.ADMIN_ID,
                            `📨 <b>НОВАЯ ЗАЯВКА</b>\n\n` +
                            `<b>ID:</b> ${reportId}\n` +
                            `<b>От:</b> ${userId}\n` +
                            `<b>Регион:</b> ${report.region}\n` +
                            `<b>Тип:</b> ${report.crimeType}\n` +
                            `<b>Уведомлено:</b> ${notifiedCount} защитников`,
                            { parse_mode: 'HTML' }
                        );
                    } catch (adminError) {
                        console.error('Ошибка уведомления администратора:', adminError);
                    }
                }
            }
            
            // Очищаем сессию после успешного подтверждения
            await clearUserState(userId);
            
        } else if (confirmData === 'confirm_no') {
            await bot.editMessageText(
                '❌ Действие отменено.\n\n' +
                'Используйте /start для начала работы.',
                {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '📋 В главное меню', callback_data: 'menu_main' }]
                        ]
                    }
                }
            );
            
            // Очищаем сессию
            await clearUserState(userId);
        }
    } catch (error) {
        console.error('❌ Ошибка подтверждения:', error);
        await bot.sendMessage(chatId, '❌ Произошла ошибка. Попробуйте еще раз с /start');
        await clearUserState(userId);
    }
}

// ================= ОБРАБОТКА ЗАЯВОК ЗАЩИТНИКАМИ =================

async function handleTakeReport(chatId, userId, messageId, callbackData) {
    const reportId = callbackData.replace('take_report_', '');
    const report = data.reports.get(reportId);
    
    if (!report) {
        await bot.answerCallbackQuery({ 
            callback_query_id: callbackData.id, 
            text: '❌ Заявка не найдена' 
        });
        return;
    }
    
    if (report.status !== 'pending') {
        await bot.answerCallbackQuery({ 
            callback_query_id: callbackData.id, 
            text: `❌ Заявка уже в работе (статус: ${report.status})` 
        });
        return;
    }
    
    // Проверяем, является ли пользователь защитником
    const defender = Array.from(data.defenders.values()).find(d => d.userId === userId.toString());
    if (!defender) {
        await bot.answerCallbackQuery({ 
            callback_query_id: callbackData.id, 
            text: '❌ Вы не зарегистрированы как защитник' 
        });
        return;
    }
    
    // Назначаем заявку защитнику
    report.status = 'in_progress';
    report.assignedTo = userId.toString();
    report.assignedToName = defender.nickname;
    report.updatedAt = new Date().toISOString();
    
    data.reports.set(reportId, report);
    
    // Уведомляем пострадавшего
    try {
        await bot.sendMessage(report.userId,
            `🛡️ <b>ВАША ЗАЯВКА ПРИНЯТА В РАБОТУ!</b>\n\n` +
            `<b>Защитник:</b> ${defender.nickname}\n` +
            `<b>ID заявки:</b> ${reportId}\n` +
            `<b>Статус:</b> В работе\n\n` +
            `<i>Защитник свяжется с вами в ближайшее время.</i>`,
            { parse_mode: 'HTML' }
        );
    } catch (error) {
        console.error('Не удалось уведомить пострадавшего:', error);
    }
    
    // Обновляем сообщение у защитника
    await bot.editMessageText(
        `✅ <b>ВЫ ВЗЯЛИ ЗАЯВКУ В РАБОТУ</b>\n\n` +
        `<b>ID заявки:</b> ${reportId}\n` +
        `<b>Тип:</b> ${report.crimeType}\n` +
        `<b>Описание:</b>\n${report.description.substring(0, 500)}${report.description.length > 500 ? '...' : ''}\n\n` +
        `<b>ID пользователя:</b> ${report.userId}\n\n` +
        `<i>Свяжитесь с пользователем через Telegram.</i>`,
        {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📨 Написать пользователю', url: `tg://user?id=${report.userId}` }],
                    [{ text: '✅ Завершить работу', callback_data: `complete_report_${reportId}` }]
                ]
            }
        }
    );
    
    console.log(`✅ Защитник ${defender.nickname} взял заявку ${reportId}`);
}

async function handleViewReport(chatId, userId, messageId, callbackData) {
    const reportId = callbackData.replace('view_report_', '');
    const report = data.reports.get(reportId);
    
    if (!report) {
        await bot.answerCallbackQuery({ 
            callback_query_id: callbackData.id, 
            text: '❌ Заявка не найдена' 
        });
        return;
    }
    
    await bot.editMessageText(
        `👁️ <b>ПРОСМОТР ЗАЯВКИ</b>\n\n` +
        `<b>ID:</b> ${report.id}\n` +
        `<b>Регион:</b> ${report.region}\n` +
        `<b>Тип:</b> ${report.crimeType}\n` +
        `<b>Статус:</b> ${report.status}\n` +
        `<b>Дата:</b> ${new Date(report.createdAt).toLocaleString('ru-RU')}\n\n` +
        `<b>Описание:</b>\n${report.description}\n\n` +
        `<i>ID пользователя: ${report.userId}</i>`,
        {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '✅ Взять в работу', callback_data: `take_report_${reportId}` }],
                    [{ text: '↩️ Назад к списку', callback_data: 'menu_main' }]
                ]
            }
        }
    );
}

// ================= ОБРАБОТКА ОШИБОК =================

bot.on('polling_error', (error) => {
    console.error('❌ Ошибка polling:', error.message);
});

bot.on('webhook_error', (error) => {
    console.error('❌ Ошибка webhook:', error.message);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Неперехваченное исключение:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Необработанный промис:', reason);
});

// ================= ЗАПУСК СЕРВЕРА =================

if (CONFIG.NODE_ENV !== 'production') {
    const app = express();
    
    app.get('/', (req, res) => {
        res.json({ 
            status: 'Bakelite Bot v3.0 работает',
            version: CONFIG.VERSION,
            mode: 'development',
            stats: {
                defenders: data.defenders.size,
                reports: data.reports.size,
                activeSessions: data.userSessions.size
            }
        });
    });
    
    app.listen(CONFIG.PORT, () => {
        console.log(`✅ Сервер запущен на порту ${CONFIG.PORT}`);
        console.log(`✅ Бот готов к работе!`);
        console.log(`✅ Используйте /start в Telegram`);
    });
}

console.log('====================================');
console.log(`🛡️  Bakelite Bot v${CONFIG.VERSION} запущен`);
console.log(`🔧 Режим: ${CONFIG.NODE_ENV}`);
console.log(`🤖 Бот: @${bot.options.username || 'не определен'}`);
console.log('====================================');
