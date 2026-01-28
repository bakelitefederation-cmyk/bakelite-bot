// ============================================
// 🛡️ BAKELITE BOT v2.1 - ИСПРАВЛЕННЫЕ ИНЛАЙН-КНОПКИ
// ============================================

const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

console.log('🚀 Загружаем Bakelite Bot...');

// ================= КОНФИГУРАЦИЯ =================
const CONFIG = {
    BOT_TOKEN: process.env.BOT_TOKEN || '',
    ADMIN_ID: process.env.ADMIN_ID || '',
    VERSION: '2.1.0',
    PORT: process.env.PORT || 3000
};

// Проверка токена
if (!CONFIG.BOT_TOKEN) {
    console.error('❌ ОШИБКА: BOT_TOKEN не установлен!');
    process.exit(1);
}

// ================= ХРАНЕНИЕ ДАННЫХ =================
const data = {
    defenders: new Map(),
    pendingDefenders: new Map(),
    reports: new Map(),
    userSessions: new Map()
};

console.log('✅ Структура данных создана');

// ================= ИНИЦИАЛИЗАЦИЯ БОТА =================
console.log('🤖 Инициализируем Telegram бота...');
const bot = new TelegramBot(CONFIG.BOT_TOKEN, { 
    polling: {
        interval: 300,
        autoStart: true,
        params: {
            timeout: 10
        }
    }
});

const app = express();

console.log('✅ Бот создан успешно');

// ================= КОМАНДА /start =================
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const userName = msg.from.first_name || 'Пользователь';
    
    console.log(`/start от ${userName}`);
    
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
    
    bot.sendMessage(chatId, welcomeMessage, {
        parse_mode: 'HTML',
        ...keyboard
    }).catch(err => console.error('Ошибка отправки:', err));
});

// ================= КОМАНДА /help =================
bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    
    const helpMessage = `
📖 <b>СПРАВКА</b>

Используйте кнопки в меню для навигации.

<b>Процесс "Стать защитником":</b>
1. Выбор региона
2. Ввод псевдонима
3. Описание специальности
4. Отправка заявки

<b>Процесс "Запросить помощь":</b>
1. Выбор региона
2. Выбор типа проблемы
3. Описание ситуации
4. Отправка заявки
    `;
    
    bot.sendMessage(chatId, helpMessage, {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [{ text: '📋 Вернуться в меню', callback_data: 'menu_main' }]
            ]
        }
    }).catch(err => console.error('Ошибка отправки:', err));
});

// ================= ОСНОВНОЙ ОБРАБОТЧИК CALLBACK =================
bot.on('callback_query', (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const userId = callbackQuery.from.id;
    const data = callbackQuery.data;
    const messageId = callbackQuery.message.message_id;
    
    console.log(`📲 Callback получен: ${data} от ${userId}`);
    
    // Отвечаем сразу, чтобы убрать "часики"
    bot.answerCallbackQuery(callbackQuery.id).catch(() => {});
    
    // Обработка меню
    if (data === 'menu_join') {
        handleJoinMenu(chatId, userId, messageId);
    }
    else if (data === 'menu_report') {
        handleReportMenu(chatId, userId, messageId);
    }
    else if (data === 'menu_status') {
        handleStatusMenu(chatId, userId, messageId);
    }
    else if (data === 'menu_help') {
        handleHelpMenu(chatId, messageId);
    }
    else if (data === 'menu_main') {
        handleMainMenu(chatId, userId, messageId);
    }
    // Обработка регионов
    else if (data === 'region_ru' || data === 'region_ua' || 
             data === 'region_kz' || data === 'region_other') {
        handleRegionSelection(chatId, userId, messageId, data);
    }
    // Обработка типов преступлений
    else if (data === 'crime_extortion' || data === 'crime_bullying' ||
             data === 'crime_fraud' || data === 'crime_other') {
        handleCrimeSelection(chatId, userId, messageId, data);
    }
    // Обработка подтверждения
    else if (data === 'confirm_yes' || data === 'confirm_no') {
        handleConfirmation(chatId, userId, messageId, data);
    }
});

// ================= ФУНКЦИИ ОБРАБОТКИ МЕНЮ =================

function handleJoinMenu(chatId, userId, messageId) {
    console.log(`🛡️ Пользователь ${userId} начал регистрацию защитника`);
    
    // Создаем сессию
    data.userSessions.set(userId.toString(), {
        type: 'join',
        step: 1,
        data: {}
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
    
    bot.editMessageText(
        `🛡️ <b>СТАТЬ ЗАЩИТНИКОМ</b>\n\n` +
        `<b>Шаг 1/3:</b> Выберите ваш регион:`,
        {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            ...keyboard
        }
    ).catch(err => console.error('Ошибка редактирования:', err));
}

function handleReportMenu(chatId, userId, messageId) {
    console.log(`🆘 Пользователь ${userId} начал заявку о помощи`);
    
    // Создаем сессию
    data.userSessions.set(userId.toString(), {
        type: 'report',
        step: 1,
        data: {}
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
    
    bot.editMessageText(
        `🆘 <b>ЗАПРОС ПОМОЩИ</b>\n\n` +
        `<b>Шаг 1/4:</b> Выберите регион, где произошел инцидент:`,
        {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            ...keyboard
        }
    ).catch(err => console.error('Ошибка редактирования:', err));
}

function handleStatusMenu(chatId, userId, messageId) {
    console.log(`📊 Пользователь ${userId} запросил статус`);
    
    // Находим заявки пользователя
    const userReports = Array.from(data.reports.values())
        .filter(report => report.userId === userId.toString());
    
    if (userReports.length === 0) {
        bot.editMessageText(
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
        ).catch(err => console.error('Ошибка редактирования:', err));
        return;
    }
    
    let statusMessage = `📊 <b>СТАТУС ВАШИХ ЗАЯВОК</b>\n\n`;
    statusMessage += `<b>Всего заявок:</b> ${userReports.length}\n\n`;
    
    userReports.forEach((report, index) => {
        const statusEmoji = {
            'pending': '🟡',
            'in_progress': '🟠',
            'completed': '🟢',
            'rejected': '🔴'
        }[report.status] || '⚪';
        
        statusMessage += `${index + 1}. ${statusEmoji} <b>Заявка #${report.id}</b>\n`;
        statusMessage += `   Тип: ${report.crimeType}\n`;
        statusMessage += `   Статус: ${report.status}\n`;
        statusMessage += `   Дата: ${new Date(report.createdAt).toLocaleDateString('ru-RU')}\n\n`;
    });
    
    statusMessage += `<i>Защитник свяжется с вами когда возьмется за работу.</i>`;
    
    bot.editMessageText(statusMessage, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [{ text: '📋 Вернуться в меню', callback_data: 'menu_main' }]
            ]
        }
    }).catch(err => console.error('Ошибка редактирования:', err));
}

function handleHelpMenu(chatId, messageId) {
    const helpMessage = `
📖 <b>СПРАВКА</b>

Используйте кнопки в меню для навигации.

<b>Основные функции:</b>
• 🛡️ Стать защитником - помогать другим
• 🆘 Запросить помощь - если стали жертвой
• 📊 Статус заявки - отслеживать обращения
• 📖 Справка - эта страница

<b>Контакты поддержки:</b>
Для вопросов обращайтесь к администратору.
    `;
    
    bot.editMessageText(helpMessage, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [{ text: '📋 Вернуться в меню', callback_data: 'menu_main' }]
            ]
        }
    }).catch(err => console.error('Ошибка редактирования:', err));
}

function handleMainMenu(chatId, userId, messageId) {
    const userName = 'Пользователь'; // В реальном боте нужно получить имя
    
    bot.editMessageText(
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
    ).catch(err => console.error('Ошибка редактирования:', err));
}

// ================= ФУНКЦИИ ОБРАБОТКИ ВЫБОРА РЕГИОНА =================

function handleRegionSelection(chatId, userId, messageId, regionData) {
    console.log(`📍 Пользователь ${userId} выбрал регион: ${regionData}`);
    
    const session = data.userSessions.get(userId.toString());
    if (!session) {
        bot.sendMessage(chatId, '❌ Сессия не найдена. Начните заново.')
            .catch(err => console.error('Ошибка отправки:', err));
        return;
    }
    
    // Определяем регион
    let region;
    switch (regionData) {
        case 'region_ru': region = 'Россия'; break;
        case 'region_ua': region = 'Украина'; break;
        case 'region_kz': region = 'Казахстан'; break;
        case 'region_other': region = 'Другое'; break;
        default: region = 'Не указано';
    }
    
    // Сохраняем регион в сессии
    session.data.region = region;
    session.step = 2;
    data.userSessions.set(userId.toString(), session);
    
    if (session.type === 'join') {
        bot.editMessageText(
            `✅ <b>Регион выбран: ${region}</b>\n\n` +
            `<b>Шаг 2/3:</b> Введите ваш псевдоним (имя в системе):\n\n` +
            `<i>Пример: CyberHelper, SecurityGuard</i>\n\n` +
            `<b>Просто напишите сообщение с псевдонимом:</b>`,
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
        ).catch(err => console.error('Ошибка редактирования:', err));
    } 
    else if (session.type === 'report') {
        const keyboard = {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '💰 Вымогательство', callback_data: 'crime_extortion' },
                        { text: '👥 Кибербуллинг', callback_data: 'crime_bullying' }
                    ],
                    [
                        { text: '💸 Мошенничество', callback_data: 'crime_fraud' },
                        { text: '❓ Другое', callback_data: 'crime_other' }
                    ],
                    [{ text: '📋 Вернуться в меню', callback_data: 'menu_main' }]
                ]
            }
        };
        
        bot.editMessageText(
            `✅ <b>Регион: ${region}</b>\n\n` +
            `<b>Шаг 2/4:</b> Выберите тип киберпреступности:`,
            {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML',
                ...keyboard
            }
        ).catch(err => console.error('Ошибка редактирования:', err));
    }
}

// ================= ФУНКЦИИ ОБРАБОТКИ ТИПА ПРЕСТУПЛЕНИЯ =================

function handleCrimeSelection(chatId, userId, messageId, crimeData) {
    console.log(`⚖️ Пользователь ${userId} выбрал тип: ${crimeData}`);
    
    const session = data.userSessions.get(userId.toString());
    if (!session || session.type !== 'report') return;
    
    // Определяем тип преступления
    let crimeType;
    switch (crimeData) {
        case 'crime_extortion': crimeType = 'Вымогательство'; break;
        case 'crime_bullying': crimeType = 'Кибербуллинг'; break;
        case 'crime_fraud': crimeType = 'Мошенничество'; break;
        case 'crime_other': crimeType = 'Другое'; break;
        default: crimeType = 'Не указано';
    }
    
    // Сохраняем тип преступления в сессии
    session.data.crimeType = crimeType;
    session.step = 3;
    data.userSessions.set(userId.toString(), session);
    
    bot.editMessageText(
        `✅ <b>Тип: ${crimeType}</b>\n\n` +
        `<b>Шаг 3/4:</b> Опишите подробно вашу проблему:\n\n` +
        `<i>Что указать:</i>\n` +
        `• Что именно произошло?\n` +
        `• Когда (дата и время)?\n` +
        `• Какие есть доказательства?\n` +
        `• Контактные данные для связи\n\n` +
        `<b>Просто напишите подробное описание:</b>`,
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
    ).catch(err => console.error('Ошибка редактирования:', err));
}

// ================= ОБРАБОТКА ТЕКСТОВЫХ СООБЩЕНИЙ =================
bot.on('message', (msg) => {
    // Пропускаем команды
    if (msg.text && msg.text.startsWith('/')) {
        return;
    }
    
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text || '';
    
    console.log(`💬 Текст от ${userId}: ${text.substring(0, 50)}...`);
    
    const session = data.userSessions.get(userId.toString());
    if (!session) {
        // Если нет сессии, показываем меню
        bot.sendMessage(chatId, 
            `🛡️ <b>Используйте меню для навигации:</b>`,
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
        ).catch(err => console.error('Ошибка отправки:', err));
        return;
    }
    
    // Обработка для регистрации защитника
    if (session.type === 'join' && session.step === 2) {
        handleDefenderPseudonym(chatId, userId, text, session);
    }
    else if (session.type === 'join' && session.step === 3) {
        handleDefenderSpecialty(chatId, userId, text, session);
    }
    // Обработка для заявки о помощи
    else if (session.type === 'report' && session.step === 3) {
        handleReportDescription(chatId, userId, text, session);
    }
});

function handleDefenderPseudonym(chatId, userId, text, session) {
    if (text.length < 2 || text.length > 50) {
        bot.sendMessage(chatId,
            '❌ Псевдоним должен быть от 2 до 50 символов.\nПопробуйте еще раз:'
        ).catch(err => console.error('Ошибка отправки:', err));
        return;
    }
    
    session.data.pseudonym = text;
    session.step = 3;
    data.userSessions.set(userId.toString(), session);
    
    bot.sendMessage(chatId,
        `✅ <b>Псевдоним принят: ${text}</b>\n\n` +
        `<b>Шаг 3/3:</b> Опишите вашу специальность:\n\n` +
        `<i>Пример: "Юрист по киберправу", "IT-специалист", "Психолог"</i>\n\n` +
        `<b>Просто напишите сообщение со специальностью:</b>`,
        { parse_mode: 'HTML' }
    ).catch(err => console.error('Ошибка отправки:', err));
}

function handleDefenderSpecialty(chatId, userId, text, session) {
    if (text.length < 5) {
        bot.sendMessage(chatId,
            '❌ Опишите специальность подробнее (минимум 5 символов).\nПопробуйте еще раз:'
        ).catch(err => console.error('Ошибка отправки:', err));
        return;
    }
    
    session.data.specialty = text;
    
    // Показываем подтверждение
    const keyboard = {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '✅ Да, отправить', callback_data: 'confirm_yes' },
                    { text: '❌ Нет, отменить', callback_data: 'confirm_no' }
                ]
            ]
        }
    };
    
    bot.sendMessage(chatId,
        `📋 <b>ПОДТВЕРЖДЕНИЕ ЗАЯВКИ ЗАЩИТНИКА</b>\n\n` +
        `<b>Ваши данные:</b>\n` +
        `• Регион: ${session.data.region}\n` +
        `• Псевдоним: ${session.data.pseudonym}\n` +
        `• Специальность: ${session.data.specialty}\n\n` +
        `<b>Подтвердите отправку заявки:</b>`,
        { parse_mode: 'HTML', ...keyboard }
    ).catch(err => console.error('Ошибка отправки:', err));
}

function handleReportDescription(chatId, userId, text, session) {
    if (text.length < 50) {
        bot.sendMessage(chatId,
            '❌ Пожалуйста, опишите проблему подробнее (минимум 50 символов).\n\n' +
            'Что произошло, когда, какие есть доказательства?'
        ).catch(err => console.error('Ошибка отправки:', err));
        return;
    }
    
    session.data.description = text;
    
    // Показываем подтверждение
    const keyboard = {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '✅ Да, отправить', callback_data: 'confirm_yes' },
                    { text: '❌ Нет, отменить', callback_data: 'confirm_no' }
                ]
            ]
        }
    };
    
    bot.sendMessage(chatId,
        `📋 <b>ПОДТВЕРЖДЕНИЕ ЗАЯВКИ О ПОМОЩИ</b>\n\n` +
        `<b>Ваши данные:</b>\n` +
        `• Регион: ${session.data.region}\n` +
        `• Тип: ${session.data.crimeType}\n` +
        `• Описание: ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}\n\n` +
        `<b>Подтвердите отправку заявки:</b>`,
        { parse_mode: 'HTML', ...keyboard }
    ).catch(err => console.error('Ошибка отправки:', err));
}

// ================= ОБРАБОТКА ПОДТВЕРЖДЕНИЯ =================

function handleConfirmation(chatId, userId, messageId, confirmData) {
    console.log(`✅ Пользователь ${userId} подтвердил: ${confirmData}`);
    
    const session = data.userSessions.get(userId.toString());
    if (!session) return;
    
    if (confirmData === 'confirm_yes') {
        if (session.type === 'join') {
            // Создаем заявку защитника
            const appId = 'DEF_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            const application = {
                id: appId,
                userId: userId.toString(),
                region: session.data.region,
                pseudonym: session.data.pseudonym,
                specialty: session.data.specialty,
                status: 'pending',
                createdAt: new Date().toISOString()
            };
            
            data.pendingDefenders.set(appId, application);
            
            bot.editMessageText(
                `✅ <b>ЗАЯВКА ЗАЩИТНИКА ОТПРАВЛЕНА!</b>\n\n` +
                `Ваша заявка #${appId} отправлена на проверку.\n\n` +
                `<b>Что дальше:</b>\n` +
                `• Администратор проверит вашу заявку\n` +
                `• Вы получите уведомление о результате\n` +
                `• Обычно проверка занимает 1-3 дня\n\n` +
                `Спасибо за желание помогать! 🛡️`,
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
            ).catch(err => console.error('Ошибка редактирования:', err));
            
            // Уведомляем админа
            notifyAdminAboutDefender(application);
            
        } else if (session.type === 'report') {
            // Создаем заявку о помощи
            const reportId = 'REP_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            const report = {
                id: reportId,
                userId: userId.toString(),
                region: session.data.region,
                crimeType: session.data.crimeType,
                description: session.data.description,
                status: 'pending',
                createdAt: new Date().toISOString()
            };
            
            data.reports.set(reportId, report);
            
            bot.editMessageText(
                `✅ <b>ЗАЯВКА О ПОМОЩИ ОТПРАВЛЕНА!</b>\n\n` +
                `Ваша заявка #${reportId} успешно отправлена.\n\n` +
                `<b>Что дальше:</b>\n` +
                `• Защитники получат уведомление\n` +
                `• Первый откликнувшийся возьмет вашу заявку\n` +
                `• Защитник свяжется с вами в личных сообщениях\n\n` +
                `<i>Сохраните ID заявки: ${reportId}</i>`,
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
            ).catch(err => console.error('Ошибка редактирования:', err));
        }
        
        // Удаляем сессию
        data.userSessions.delete(userId.toString());
        
    } else if (confirmData === 'confirm_no') {
        bot.editMessageText(
            `❌ <b>Действие отменено</b>\n\n` +
            `Вы вернулись в главное меню.`,
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
        ).catch(err => console.error('Ошибка редактирования:', err));
        
        // Удаляем сессию
        data.userSessions.delete(userId.toString());
    }
}

// ================= ФУНКЦИЯ УВЕДОМЛЕНИЯ АДМИНА =================

function notifyAdminAboutDefender(application) {
    if (!CONFIG.ADMIN_ID) {
        console.log('⚠️ ADMIN_ID не установлен, уведомление не отправлено');
        return;
    }
    
    const message = `
🛡️ <b>НОВАЯ ЗАЯВКА ЗАЩИТНИКА</b>

<b>ID заявки:</b> ${application.id}
<b>Регион:</b> ${application.region}
<b>Псевдоним:</b> ${application.pseudonym}
<b>Специальность:</b> ${application.specialty}
<b>Дата:</b> ${new Date(application.createdAt).toLocaleString('ru-RU')}
    `;
    
    const keyboard = {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '✅ Одобрить', callback_data: `admin_approve_${application.id}` },
                    { text: '❌ Отклонить', callback_data: `admin_reject_${application.id}` }
                ]
            ]
        }
    };
    
    bot.sendMessage(CONFIG.ADMIN_ID, message, {
        parse_mode: 'HTML',
        ...keyboard
    }).catch(err => console.error('Ошибка отправки админу:', err));
}

// ================= ОБРАБОТКА ОШИБОК =================
bot.on('polling_error', (error) => {
    console.error('❌ Polling error:', error.message);
});

bot.on('error', (error) => {
    console.error('❌ Bot error:', error);
});

// ================= ВЕБ-СЕРВЕР ДЛЯ RAILWAY =================
app.get('/', (req, res) => {
    res.json({
        status: 'online',
        bot: 'Bakelite Bot',
        version: CONFIG.VERSION,
        uptime: process.uptime(),
        statistics: {
            defenders: data.defenders.size,
            pendingDefenders: data.pendingDefenders.size,
            reports: data.reports.size,
            sessions: data.userSessions.size
        }
    });
});

// Запускаем веб-сервер
app.listen(CONFIG.PORT, () => {
    console.log(`🌐 Веб-сервер запущен на порту ${CONFIG.PORT}`);
});

// ================= ЗАПУСК БОТА =================
console.log('=========================================');
console.log('✅ BAKELITE BOT v2.1 УСПЕШНО ЗАПУЩЕН!');
console.log('=========================================');
console.log(`🤖 Версия: ${CONFIG.VERSION}`);
console.log(`🌐 Порт: ${CONFIG.PORT}`);
console.log(`👑 Админ ID: ${CONFIG.ADMIN_ID || 'не установлен'}`);
console.log('=========================================');
