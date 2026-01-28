// ============================================
// 🛡️ BAKELITE BOT v2.0 - ПОЛНЫЙ ФУНКЦИОНАЛ
// Репозиторий: https://github.com/kartochniy/bakelite-bot
// Хостинг: Railway.com
// ============================================

// ================= ИМПОРТЫ =================
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

console.log('🚀 Загружаем Bakelite Bot...');

// ================= КОНФИГУРАЦИЯ =================
const CONFIG = {
    BOT_TOKEN: process.env.BOT_TOKEN || '',
    ADMIN_ID: process.env.ADMIN_ID || '',
    VERSION: '2.0.0',
    PORT: process.env.PORT || 3000,
    
    REGIONS: ['Россия', 'Украина', 'Казахстан', 'Другое'],
    CRIME_TYPES: ['Вымогательство', 'Кибербуллинг', 'Мошенничество', 'Другое']
};

// Проверка токена
if (!CONFIG.BOT_TOKEN) {
    console.error('❌ ОШИБКА: BOT_TOKEN не установлен!');
    console.error('Добавьте в Railway: BOT_TOKEN=ваш_токен_бота');
    process.exit(1);
}

// ================= ХРАНЕНИЕ ДАННЫХ =================
const data = {
    // Защитники (одобренные)
    defenders: new Map(),        // userId -> {pseudonym, region, specialty}
    
    // Заявки на защитников (ожидают одобрения)
    pendingDefenders: new Map(), // appId -> {userId, userName, region, pseudonym, specialty, createdAt}
    
    // Заявки о помощи
    reports: new Map(),          // reportId -> {userId, userName, region, crimeType, description, status, createdAt}
    
    // Сессии пользователей
    userSessions: new Map()      // userId -> {type, step, data}
};

console.log('✅ Структура данных создана');

// ================= УТИЛИТЫ =================
function generateId(prefix) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `${prefix}_${timestamp}_${random}`;
}

function formatDate(date) {
    return new Date(date).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function getStatusText(status) {
    const statuses = {
        'pending': '🟡 Ожидает защитника',
        'in_progress': '🟠 В работе',
        'completed': '🟢 Завершена',
        'rejected': '🔴 Отклонена'
    };
    return statuses[status] || status;
}

// ================= ИНИЦИАЛИЗАЦИЯ БОТА =================
console.log('🤖 Инициализируем Telegram бота...');
const bot = new TelegramBot(CONFIG.BOT_TOKEN, { polling: true });
const app = express();

console.log('✅ Бот создан успешно');

// ================= КЛАВИАТУРЫ =================
const Keyboards = {
    // Главное меню
    mainMenu: {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🛡️ Стать защитником', callback_data: 'menu_join' }],
                [{ text: '🆘 Запросить помощь', callback_data: 'menu_report' }],
                [{ text: '📊 Статус моей заявки', callback_data: 'menu_status' }],
                [{ text: '📖 Справка', callback_data: 'menu_help' }]
            ]
        }
    },
    
    // Выбор региона
    regions: {
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
    },
    
    // Выбор типа преступления
    crimeTypes: {
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
    },
    
    // Подтверждение
    confirm: {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '✅ Да, отправить', callback_data: 'confirm_yes' },
                    { text: '❌ Нет, отменить', callback_data: 'confirm_no' }
                ]
            ]
        }
    },
    
    // Назад в меню
    backToMenu: {
        reply_markup: {
            inline_keyboard: [
                [{ text: '📋 Вернуться в меню', callback_data: 'menu_main' }]
            ]
        }
    },
    
    // Действия защитника (взять/отказаться от заявки)
    defenderActions: (reportId) => ({
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '✅ Взять заявку', callback_data: `def_take_${reportId}` },
                    { text: '❌ Отказаться', callback_data: `def_decline_${reportId}` }
                ]
            ]
        }
    }),
    
    // Действия админа (одобрить/отклонить защитника)
    adminActions: (appId) => ({
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '✅ Одобрить', callback_data: `admin_approve_${appId}` },
                    { text: '❌ Отклонить', callback_data: `admin_reject_${appId}` }
                ]
            ]
        }
    })
};

// ================= КОМАНДА /start =================
bot.onText(/^\/start(?:\s|$)/i, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const userName = msg.from.first_name || 'Пользователь';
    
    console.log(`/start от ${userName} (${userId})`);
    
    const welcomeMessage = `
🛡️ <b>Добро пожаловать в Bakelite Bot v${CONFIG.VERSION}!</b>

👋 Привет, ${userName}! Я - система помощи жертвам киберпреступлений.

✨ <b>Мои функции:</b>
• 🛡️ Стать защитником - помогать другим
• 🆘 Запросить помощь - если вы стали жертвой
• 📊 Статус заявки - отслеживать ваши обращения
• 📖 Справка - узнать подробности о функциях

👇 <b>Выберите действие:</b>
    `;
    
    bot.sendMessage(chatId, welcomeMessage, {
        parse_mode: 'HTML',
        ...Keyboards.mainMenu
    });
});

// ================= КОМАНДА /help =================
bot.onText(/^\/help(?:\s|$)/i, (msg) => {
    const chatId = msg.chat.id;
    
    const helpMessage = `
📖 <b>СПРАВКА ПО КОМАНДАМ</b>

<b>Основные команды:</b>
/start - Главное меню с выбором действий
/join - Стать защитником
/report - Запросить помощь
/status - Статус моей заявки
/help - Эта справка
/menu - Вернуться в меню

<b>Процесс "Стать защитником":</b>
1️⃣ Выбор региона (Россия/Украина/Казахстан/Другое)
2️⃣ Ввод псевдонима
3️⃣ Указание специальности
4️⃣ Отправка заявки на одобрение администратору

<b>Процесс "Запросить помощь":</b>
1️⃣ Выбор региона происшествия
2️⃣ Выбор типа киберпреступности
3️⃣ Подробное описание проблемы
4️⃣ Отправка заявки защитникам региона

<b>Что дальше?</b>
• Заявки защитников проверяются администратором
• Заявки о помощи отправляются защитникам региона
• Защитник свяжется с вами в личных сообщениях

📞 <b>По всем вопросам:</b> Обращайтесь к администратору.
    `;
    
    bot.sendMessage(chatId, helpMessage, {
        parse_mode: 'HTML',
        ...Keyboards.backToMenu
    });
});

// ================= КОМАНДА /join =================
bot.onText(/^\/join(?:\s|$)/i, (msg) => {
    handleJoinCommand(msg);
});

// ================= КОМАНДА /report =================
bot.onText(/^\/report(?:\s|$)/i, (msg) => {
    handleReportCommand(msg);
});

// ================= КОМАНДА /status =================
bot.onText(/^\/status(?:\s|$)/i, (msg) => {
    handleStatusCommand(msg);
});

// ================= КОМАНДА /menu =================
bot.onText(/^\/menu(?:\s|$)/i, (msg) => {
    const chatId = msg.chat.id;
    const userName = msg.from.first_name || 'Пользователь';
    
    bot.sendMessage(chatId, 
        `🛡️ <b>Возвращаемся в меню...</b>\n\nВыберите действие:`,
        {
            parse_mode: 'HTML',
            ...Keyboards.mainMenu
        }
    );
});

// ================= ОБРАБОТЧИК CALLBACK-ЗАПРОСОВ =================
bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const userId = callbackQuery.from.id;
    const data = callbackQuery.data;
    const messageId = callbackQuery.message.message_id;
    
    console.log(`Callback от ${userId}: ${data}`);
    
    try {
        // Обработка меню
        if (data.startsWith('menu_')) {
            await handleMenuCallback(callbackQuery);
        }
        // Обработка выбора региона
        else if (data.startsWith('region_')) {
            await handleRegionCallback(callbackQuery);
        }
        // Обработка выбора типа преступления
        else if (data.startsWith('crime_')) {
            await handleCrimeCallback(callbackQuery);
        }
        // Обработка подтверждения
        else if (data.startsWith('confirm_')) {
            await handleConfirmationCallback(callbackQuery);
        }
        // Обработка действий защитника
        else if (data.startsWith('def_')) {
            await handleDefenderActionCallback(callbackQuery);
        }
        // Обработка действий админа
        else if (data.startsWith('admin_')) {
            await handleAdminActionCallback(callbackQuery);
        }
        
        // Подтверждаем получение callback
        await bot.answerCallbackQuery(callbackQuery.id);
        
    } catch (error) {
        console.error('Ошибка обработки callback:', error);
        await bot.answerCallbackQuery(callbackQuery.id, {
            text: '❌ Произошла ошибка',
            show_alert: true
        });
    }
});

// ================= ОБРАБОТЧИК ТЕКСТОВЫХ СООБЩЕНИЙ =================
bot.on('message', (msg) => {
    // Пропускаем команды
    if (msg.text && msg.text.startsWith('/')) {
        return;
    }
    
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text || '';
    
    // Получаем сессию пользователя
    const session = data.userSessions.get(userId.toString());
    if (!session) {
        // Если нет сессии, показываем меню
        const userName = msg.from.first_name || 'Пользователь';
        bot.sendMessage(chatId, 
            `🛡️ <b>${userName}, используйте меню для навигации:</b>`,
            {
                parse_mode: 'HTML',
                ...Keyboards.mainMenu
            }
        );
        return;
    }
    
    // Обрабатываем в зависимости от типа сессии
    if (session.type === 'join') {
        handleJoinMessage(chatId, userId, text, session);
    } else if (session.type === 'report') {
        handleReportMessage(chatId, userId, text, session);
    }
});

// ================= ФУНКЦИИ ОБРАБОТКИ КОМАНД =================

// Обработка команды /join
async function handleJoinCommand(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const userName = msg.from.first_name || 'Пользователь';
    const userUsername = msg.from.username || '';
    
    console.log(`/join от ${userName} (${userId})`);
    
    // Проверяем, не является ли уже защитником
    const existingDefender = data.defenders.get(userId.toString());
    if (existingDefender) {
        bot.sendMessage(chatId,
            `🛡️ <b>Вы уже защитник!</b>\n\n` +
            `Псевдоним: ${existingDefender.pseudonym}\n` +
            `Регион: ${existingDefender.region}\n` +
            `Специальность: ${existingDefender.specialty}\n\n` +
            `Вы можете помогать людям в вашем регионе.`,
            { parse_mode: 'HTML', ...Keyboards.backToMenu }
        );
        return;
    }
    
    // Проверяем, не подавал ли уже заявку
    const pendingApps = Array.from(data.pendingDefenders.values());
    const existingApp = pendingApps.find(app => app.userId === userId.toString());
    if (existingApp) {
        bot.sendMessage(chatId,
            `🔄 <b>Заявка уже на рассмотрении</b>\n\n` +
            `Ваша заявка #${existingApp.id} ожидает проверки администратором.\n` +
            `Обычно это занимает 1-3 дня.`,
            { parse_mode: 'HTML', ...Keyboards.backToMenu }
        );
        return;
    }
    
    // Создаем сессию
    data.userSessions.set(userId.toString(), {
        type: 'join',
        step: 1,
        data: {
            userName: userName,
            userUsername: userUsername
        }
    });
    
    // Отправляем первый шаг
    bot.sendMessage(chatId,
        `🛡️ <b>СТАТЬ ЗАЩИТНИКОМ</b>\n\n` +
        `<b>Шаг 1/3:</b> Выберите ваш регион:`,
        { parse_mode: 'HTML', ...Keyboards.regions }
    );
}

// Обработка команды /report
async function handleReportCommand(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const userName = msg.from.first_name || 'Пользователь';
    const userUsername = msg.from.username || '';
    
    console.log(`/report от ${userName} (${userId})`);
    
    // Создаем сессию
    data.userSessions.set(userId.toString(), {
        type: 'report',
        step: 1,
        data: {
            userName: userName,
            userUsername: userUsername
        }
    });
    
    // Отправляем первый шаг
    bot.sendMessage(chatId,
        `🆘 <b>ЗАПРОС ПОМОЩИ</b>\n\n` +
        `<b>Шаг 1/4:</b> Выберите регион, где произошел инцидент:`,
        { parse_mode: 'HTML', ...Keyboards.regions }
    );
}

// Обработка команды /status
async function handleStatusCommand(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    console.log(`/status от ${userId}`);
    
    // Получаем заявки пользователя
    const userReports = Array.from(data.reports.values())
        .filter(report => report.userId === userId.toString());
    
    if (userReports.length === 0) {
        bot.sendMessage(chatId,
            `📊 <b>СТАТУС ЗАЯВОК</b>\n\n` +
            `У вас пока нет заявок о помощи.\n\n` +
            `Используйте команду /report чтобы создать заявку.`,
            { parse_mode: 'HTML', ...Keyboards.backToMenu }
        );
        return;
    }
    
    // Группируем по статусам
    const pendingCount = userReports.filter(r => r.status === 'pending').length;
    const inProgressCount = userReports.filter(r => r.status === 'in_progress').length;
    const completedCount = userReports.filter(r => r.status === 'completed').length;
    const rejectedCount = userReports.filter(r => r.status === 'rejected').length;
    
    let statusMessage = `
📊 <b>СТАТУС ВАШИХ ЗАЯВОК</b>

<b>Статистика:</b>
🟡 Ожидают: ${pendingCount}
🟠 В работе: ${inProgressCount}
🟢 Завершены: ${completedCount}
🔴 Отклонены: ${rejectedCount}

<b>Всего заявок:</b> ${userReports.length}

<b>Последние заявки:</b>
    `;
    
    // Показываем последние 5 заявок
    const recentReports = userReports
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 5);
    
    recentReports.forEach((report, index) => {
        statusMessage += `
${index + 1}. <b>Заявка #${report.id}</b>
   Тип: ${report.crimeType}
   Статус: ${getStatusText(report.status)}
   Дата: ${formatDate(report.createdAt)}
   ${report.assignedDefender ? `Защитник: ${report.assignedDefender}\n` : ''}
        `;
    });
    
    statusMessage += `
<i>Защитник свяжется с вами когда возьмется за работу или завершит её.</i>
    `;
    
    bot.sendMessage(chatId, statusMessage, {
        parse_mode: 'HTML',
        ...Keyboards.backToMenu
    });
}

// ================= ФУНКЦИИ ОБРАБОТКИ CALLBACK =================

// Обработка меню
async function handleMenuCallback(callbackQuery) {
    const chatId = callbackQuery.message.chat.id;
    const userId = callbackQuery.from.id;
    const data = callbackQuery.data;
    
    switch (data) {
        case 'menu_join':
            await handleJoinCommand({
                chat: { id: chatId },
                from: { id: userId, first_name: 'Пользователь' }
            });
            break;
            
        case 'menu_report':
            await handleReportCommand({
                chat: { id: chatId },
                from: { id: userId, first_name: 'Пользователь' }
            });
            break;
            
        case 'menu_status':
            await handleStatusCommand({
                chat: { id: chatId },
                from: { id: userId }
            });
            break;
            
        case 'menu_help':
            bot.sendMessage(chatId,
                `📖 <b>Справка по командам</b>\n\n` +
                `Используйте меню для навигации или команды:\n` +
                `/start - главное меню\n` +
                `/join - стать защитником\n` +
                `/report - запросить помощь\n` +
                `/status - статус заявок\n` +
                `/help - подробная справка`,
                { parse_mode: 'HTML', ...Keyboards.backToMenu }
            );
            break;
            
        case 'menu_main':
            const userName = callbackQuery.from.first_name || 'Пользователь';
            bot.editMessageText(
                `🛡️ <b>Добро пожаловать в Bakelite Bot v${CONFIG.VERSION}!</b>\n\n` +
                `👋 Привет, ${userName}! Выберите действие:`,
                {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id,
                    parse_mode: 'HTML',
                    ...Keyboards.mainMenu
                }
            );
            break;
    }
}

// Обработка выбора региона
async function handleRegionCallback(callbackQuery) {
    const chatId = callbackQuery.message.chat.id;
    const userId = callbackQuery.from.id;
    const data = callbackQuery.data;
    
    const session = data.userSessions.get(userId.toString());
    if (!session) {
        await bot.answerCallbackQuery(callbackQuery.id, {
            text: '❌ Сессия не найдена. Начните заново.',
            show_alert: true
        });
        return;
    }
    
    // Определяем регион
    let region;
    switch (data) {
        case 'region_ru':
            region = 'Россия';
            break;
        case 'region_ua':
            region = 'Украина';
            break;
        case 'region_kz':
            region = 'Казахстан';
            break;
        case 'region_other':
            region = 'Другое';
            break;
        default:
            region = 'Не указано';
    }
    
    // Сохраняем регион в сессии
    session.data.region = region;
    session.step = 2;
    data.userSessions.set(userId.toString(), session);
    
    // Отправляем следующий шаг в зависимости от типа сессии
    if (session.type === 'join') {
        bot.editMessageText(
            `✅ <b>Регион выбран: ${region}</b>\n\n` +
            `<b>Шаг 2/3:</b> Введите ваш псевдоним (имя, под которым вас будут знать в системе):\n\n` +
            `<i>Пример: CyberHelper, SecurityPro, ITGuardian</i>\n\n` +
            `<b>Просто напишите сообщение с псевдонимом:</b>`,
            {
                chat_id: chatId,
                message_id: callbackQuery.message.message_id,
                parse_mode: 'HTML'
            }
        );
    } else if (session.type === 'report') {
        bot.editMessageText(
            `✅ <b>Регион: ${region}</b>\n\n` +
            `<b>Шаг 2/4:</b> Выберите тип киберпреступности:`,
            {
                chat_id: chatId,
                message_id: callbackQuery.message.message_id,
                parse_mode: 'HTML',
                ...Keyboards.crimeTypes
            }
        );
    }
}

// Обработка выбора типа преступления
async function handleCrimeCallback(callbackQuery) {
    const chatId = callbackQuery.message.chat.id;
    const userId = callbackQuery.from.id;
    const data = callbackQuery.data;
    
    const session = data.userSessions.get(userId.toString());
    if (!session || session.type !== 'report') return;
    
    // Определяем тип преступления
    let crimeType;
    switch (data) {
        case 'crime_extortion':
            crimeType = 'Вымогательство';
            break;
        case 'crime_bullying':
            crimeType = 'Кибербуллинг';
            break;
        case 'crime_fraud':
            crimeType = 'Мошенничество';
            break;
        case 'crime_other':
            crimeType = 'Другое';
            break;
        default:
            crimeType = 'Не указано';
    }
    
    // Сохраняем тип преступления в сессии
    session.data.crimeType = crimeType;
    session.step = 3;
    data.userSessions.set(userId.toString(), session);
    
    // Отправляем следующий шаг
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
            message_id: callbackQuery.message.message_id,
            parse_mode: 'HTML'
        }
    );
}

// Обработка подтверждения
async function handleConfirmationCallback(callbackQuery) {
    const chatId = callbackQuery.message.chat.id;
    const userId = callbackQuery.from.id;
    const data = callbackQuery.data;
    
    const session = data.userSessions.get(userId.toString());
    if (!session) return;
    
    if (data === 'confirm_yes') {
        if (session.type === 'join') {
            // Создаем заявку защитника
            const appId = generateId('DEF_APP');
            const application = {
                id: appId,
                userId: userId.toString(),
                userName: session.data.userName,
                userUsername: session.data.userUsername,
                region: session.data.region,
                pseudonym: session.data.pseudonym,
                specialty: session.data.specialty,
                status: 'pending',
                createdAt: new Date().toISOString()
            };
            
            data.pendingDefenders.set(appId, application);
            
            // Уведомляем пользователя
            bot.editMessageText(
                `✅ <b>ЗАЯВКА ОТПРАВЛЕНА!</b>\n\n` +
                `Ваша заявка #${appId} отправлена на проверку администратору.\n\n` +
                `<b>Что дальше:</b>\n` +
                `• Администратор проверит вашу заявку\n` +
                `• Вы получите уведомление о результате\n` +
                `• Обычно проверка занимает 1-3 дня\n\n` +
                `Спасибо за желание помогать! 🛡️`,
                {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id,
                    parse_mode: 'HTML',
                    ...Keyboards.backToMenu
                }
            );
            
            // Уведомляем админа
            await notifyAdminAboutDefenderApplication(application);
            
            // Удаляем сессию
            data.userSessions.delete(userId.toString());
            
        } else if (session.type === 'report') {
            // Создаем заявку о помощи
            const reportId = generateId('REPORT');
            const report = {
                id: reportId,
                userId: userId.toString(),
                userName: session.data.userName,
                userUsername: session.data.userUsername,
                region: session.data.region,
                crimeType: session.data.crimeType,
                description: session.data.description,
                status: 'pending',
                assignedDefender: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            
            data.reports.set(reportId, report);
            
            // Уведомляем пользователя
            bot.editMessageText(
                `✅ <b>ЗАЯВКА #${reportId} ПРИНЯТА!</b>\n\n` +
                `Ваша заявка успешно отправлена защитникам региона.\n\n` +
                `<b>Что дальше:</b>\n` +
                `• Защитники получат уведомление\n` +
                `• Первый откликнувшийся возьмет вашу заявку\n` +
                `• Защитник свяжется с вами в личных сообщениях\n\n` +
                `<i>Сохраните ID заявки: ${reportId}</i>`,
                {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id,
                    parse_mode: 'HTML',
                    ...Keyboards.backToMenu
                }
            );
            
            // Уведомляем защитников
            await notifyDefendersAboutReport(report);
            
            // Удаляем сессию
            data.userSessions.delete(userId.toString());
        }
        
    } else if (data === 'confirm_no') {
        // Отмена
        const userName = callbackQuery.from.first_name || 'Пользователь';
        
        bot.editMessageText(
            `❌ <b>Действие отменено</b>\n\n` +
            `Вы вернулись в главное меню.`,
            {
                chat_id: chatId,
                message_id: callbackQuery.message.message_id,
                parse_mode: 'HTML',
                ...Keyboards.mainMenu
            }
        );
        
        // Удаляем сессию
        data.userSessions.delete(userId.toString());
    }
}

// Обработка действий защитника
async function handleDefenderActionCallback(callbackQuery) {
    const chatId = callbackQuery.message.chat.id;
    const userId = callbackQuery.from.id;
    const data = callbackQuery.data;
    
    // Проверяем, является ли пользователь защитником
    const defender = data.defenders.get(userId.toString());
    if (!defender) {
        await bot.answerCallbackQuery(callbackQuery.id, {
            text: '❌ Вы не являетесь защитником',
            show_alert: true
        });
        return;
    }
    
    const parts = data.split('_');
    const action = parts[1]; // take или decline
    const reportId = parts[2];
    
    const report = data.reports.get(reportId);
    if (!report) {
        await bot.answerCallbackQuery(callbackQuery.id, {
            text: '❌ Заявка не найдена',
            show_alert: true
        });
        return;
    }
    
    if (action === 'take') {
        // Защитник берет заявку
        report.status = 'in_progress';
        report.assignedDefender = defender.pseudonym;
        report.updatedAt = new Date().toISOString();
        
        data.reports.set(reportId, report);
        
        // Уведомляем жертву
        await notifyVictimAboutDefender(report, defender);
        
        // Обновляем сообщение
        bot.editMessageText(
            `✅ <b>Вы взяли заявку #${reportId}</b>\n\n` +
            `<b>Информация о заявке:</b>\n` +
            `• Тип: ${report.crimeType}\n` +
            `• Регион: ${report.region}\n` +
            `• Пользователь: ${report.userName}\n\n` +
            `<b>Что делать:</b>\n` +
            `1. Свяжитесь с пользователем через Telegram\n` +
            `2. Помогите решить проблему\n` +
            `3. Уведомите пользователя о завершении работы\n\n` +
            `<i>Удачи в помощи! 🛡️</i>`,
            {
                chat_id: chatId,
                message_id: callbackQuery.message.message_id,
                parse_mode: 'HTML'
            }
        );
        
        await bot.answerCallbackQuery(callbackQuery.id, {
            text: '✅ Заявка принята! Свяжитесь с пользователем.',
            show_alert: true
        });
        
    } else if (action === 'decline') {
        // Защитник отказывается от заявки
        bot.editMessageText(
            `❌ <b>Вы отказались от заявки #${reportId}</b>\n\n` +
            `Заявка будет предложена другим защитникам.`,
            {
                chat_id: chatId,
                message_id: callbackQuery.message.message_id,
                parse_mode: 'HTML'
            }
        );
        
        await bot.answerCallbackQuery(callbackQuery.id, {
            text: 'Заявка отклонена',
            show_alert: false
        });
    }
}

// Обработка действий админа
async function handleAdminActionCallback(callbackQuery) {
    const chatId = callbackQuery.message.chat.id;
    const userId = callbackQuery.from.id;
    const data = callbackQuery.data;
    
    // Проверяем, является ли пользователь админом
    if (userId.toString() !== CONFIG.ADMIN_ID) {
        await bot.answerCallbackQuery(callbackQuery.id, {
            text: '❌ Только администратор',
            show_alert: true
        });
        return;
    }
    
    const parts = data.split('_');
    const action = parts[1]; // approve или reject
    const appId = parts[2];
    
    const application = data.pendingDefenders.get(appId);
    if (!application) {
        await bot.answerCallbackQuery(callbackQuery.id, {
            text: '❌ Заявка не найдена',
            show_alert: true
        });
        return;
    }
    
    if (action === 'approve') {
        // Одобряем заявку защитника
        const defender = {
            userId: application.userId,
            userName: application.userName,
            userUsername: application.userUsername,
            region: application.region,
            pseudonym: application.pseudonym,
            specialty: application.specialty,
            approvedAt: new Date().toISOString(),
            completedReports: 0
        };
        
        data.defenders.set(application.userId, defender);
        data.pendingDefenders.delete(appId);
        
        // Уведомляем нового защитника
        await notifyDefenderAboutApproval(defender);
        
        // Обновляем сообщение
        bot.editMessageText(
            `✅ <b>Заявка защитника одобрена!</b>\n\n` +
            `<b>Данные защитника:</b>\n` +
            `• Псевдоним: ${defender.pseudonym}\n` +
            `• Регион: ${defender.region}\n` +
            `• Специальность: ${defender.specialty}\n\n` +
            `Теперь он будет получать уведомления о новых заявках.`,
            {
                chat_id: chatId,
                message_id: callbackQuery.message.message_id,
                parse_mode: 'HTML'
            }
        );
        
        await bot.answerCallbackQuery(callbackQuery.id, {
            text: '✅ Защитник одобрен',
            show_alert: false
        });
        
    } else if (action === 'reject') {
        // Отклоняем заявку защитника
        data.pendingDefenders.delete(appId);
        
        // Обновляем сообщение
        bot.editMessageText(
            `❌ <b>Заявка защитника отклонена</b>`,
            {
                chat_id: chatId,
                message_id: callbackQuery.message.message_id,
                parse_mode: 'HTML'
            }
        );
        
        await bot.answerCallbackQuery(callbackQuery.id, {
            text: '❌ Заявка отклонена',
            show_alert: false
        });
    }
}

// ================= ФУНКЦИИ ОБРАБОТКИ СООБЩЕНИЙ =================

// Обработка сообщений для регистрации защитника
function handleJoinMessage(chatId, userId, text, session) {
    if (session.step === 2) {
        // Шаг 2: Псевдоним
        if (text.length < 2 || text.length > 50) {
            bot.sendMessage(chatId,
                '❌ Псевдоним должен быть от 2 до 50 символов.\n\nПопробуйте еще раз:'
            );
            return;
        }
        
        session.data.pseudonym = text;
        session.step = 3;
        data.userSessions.set(userId.toString(), session);
        
        bot.sendMessage(chatId,
            `✅ <b>Псевдоним принят: ${text}</b>\n\n` +
            `<b>Шаг 3/3:</b> Опишите вашу специальность (кем вы являетесь):\n\n` +
            `<i>Пример: "Юрист по киберправу", "IT специалист по безопасности", "Психолог, работаю с жертвами кибербуллинга"</i>\n\n` +
            `<b>Просто напишите сообщение со специальностью:</b>`,
            { parse_mode: 'HTML' }
        );
        
    } else if (session.step === 3) {
        // Шаг 3: Специальность
        if (text.length < 5) {
            bot.sendMessage(chatId,
                '❌ Пожалуйста, опишите вашу специальность подробнее (минимум 5 символов).\n\nПопробуйте еще раз:'
            );
            return;
        }
        
        session.data.specialty = text;
        session.step = 4; // Шаг подтверждения
        data.userSessions.set(userId.toString(), session);
        
        // Показываем подтверждение
        bot.sendMessage(chatId,
            `📋 <b>ПОДТВЕРЖДЕНИЕ ЗАЯВКИ</b>\n\n` +
            `<b>Ваши данные:</b>\n` +
            `• Регион: ${session.data.region}\n` +
            `• Псевдоним: ${session.data.pseudonym}\n` +
            `• Специальность: ${session.data.specialty}\n\n` +
            `<b>Подтвердите отправку заявки на защитника:</b>`,
            { parse_mode: 'HTML', ...Keyboards.confirm }
        );
    }
}

// Обработка сообщений для заявки о помощи
function handleReportMessage(chatId, userId, text, session) {
    if (session.step === 3) {
        // Шаг 3: Описание проблемы
        if (text.length < 50) {
            bot.sendMessage(chatId,
                '❌ Пожалуйста, опишите проблему подробнее (минимум 50 символов).\n\n' +
                'Что произошло, когда, какие есть доказательства?'
            );
            return;
        }
        
        session.data.description = text;
        session.step = 4; // Шаг подтверждения
        data.userSessions.set(userId.toString(), session);
        
        // Показываем подтверждение
        bot.sendMessage(chatId,
            `📋 <b>ПОДТВЕРЖДЕНИЕ ЗАЯВКИ</b>\n\n` +
            `<b>Ваши данные:</b>\n` +
            `• Регион: ${session.data.region}\n` +
            `• Тип преступления: ${session.data.crimeType}\n` +
            `• Описание: ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}\n\n` +
            `<b>Подтвердите отправку заявки:</b>`,
            { parse_mode: 'HTML', ...Keyboards.confirm }
        );
        
    } else if (session.step === 2 && session.data.crimeType === 'Другое') {
        // Если выбрано "Другое" на шаге 2
        if (text.length < 5) {
            bot.sendMessage(chatId,
                '❌ Пожалуйста, укажите вид киберпреступности (минимум 5 символов).'
            );
            return;
        }
        
        session.data.crimeType = text;
        session.step = 3;
        data.userSessions.set(userId.toString(), session);
        
        bot.sendMessage(chatId,
            `✅ <b>Тип преступления: ${text}</b>\n\n` +
            `<b>Шаг 3/4:</b> Опишите подробно вашу проблему:\n\n` +
            `<i>Что указать:</i>\n` +
            `• Что именно произошло?\n` +
            `• Когда (дата и время)?\n` +
            `• Какие есть доказательства?\n` +
            `• Контактные данные для связи\n\n` +
            `<b>Просто напишите подробное описание:</b>`,
            { parse_mode: 'HTML' }
        );
        
    } else if (session.step === 1 && session.data.region === 'Другое') {
        // Если выбрано "Другое" на шаге 1
        if (text.length < 3) {
            bot.sendMessage(chatId,
                '❌ Пожалуйста, укажите страну (минимум 3 символа).'
            );
            return;
        }
        
        session.data.region = text;
        session.step = 2;
        data.userSessions.set(userId.toString(), session);
        
        bot.sendMessage(chatId,
            `✅ <b>Регион: ${text}</b>\n\n` +
            `<b>Шаг 2/4:</b> Выберите тип киберпреступности:`,
            { parse_mode: 'HTML', ...Keyboards.crimeTypes }
        );
    }
}

// ================= ФУНКЦИИ УВЕДОМЛЕНИЙ =================

// Уведомление админа о новой заявке защитника
async function notifyAdminAboutDefenderApplication(application) {
    if (!CONFIG.ADMIN_ID) {
        console.warn('ADMIN_ID не установлен, уведомление админу не отправлено');
        return;
    }
    
    try {
        const message = `
🛡️ <b>НОВАЯ ЗАЯВКА ЗАЩИТНИКА</b>

<b>ID заявки:</b> ${application.id}
<b>Пользователь:</b> ${application.userName} (@${application.userUsername})
<b>Регион:</b> ${application.region}
<b>Псевдоним:</b> ${application.pseudonym}
<b>Специальность:</b> ${application.specialty}
<b>Дата:</b> ${formatDate(application.createdAt)}

👇 <b>Одобрить или отклонить?</b>
        `;
        
        await bot.sendMessage(CONFIG.ADMIN_ID, message, {
            parse_mode: 'HTML',
            ...Keyboards.adminActions(application.id)
        });
        
        console.log(`✅ Уведомление отправлено админу о заявке защитника #${application.id}`);
        
    } catch (error) {
        console.error('❌ Ошибка отправки уведомления админу:', error.message);
    }
}

// Уведомление защитников о новой заявке
async function notifyDefendersAboutReport(report) {
    try {
        // Получаем всех защитников региона
        const defenders = Array.from(data.defenders.values())
            .filter(defender => defender.region === report.region);
        
        if (defenders.length === 0) {
            console.log(`⚠️ Нет защитников в регионе ${report.region}`);
            return;
        }
        
        console.log(`📢 Уведомляем ${defenders.length} защитников о заявке #${report.id}`);
        
        const message = `
🆘 <b>НОВАЯ ЗАЯВКА О ПОМОЩИ</b>

<b>ID заявки:</b> ${report.id}
<b>Регион:</b> ${report.region}
<b>Тип преступления:</b> ${report.crimeType}
<b>Описание:</b> ${report.description.substring(0, 150)}${report.description.length > 150 ? '...' : ''}

👇 <b>Хотите взять эту заявку?</b>
        `;
        
        // Отправляем каждому защитнику
        for (const defender of defenders) {
            try {
                await bot.sendMessage(defender.userId, message, {
                    parse_mode: 'HTML',
                    ...Keyboards.defenderActions(report.id)
                });
                
                // Небольшая задержка между сообщениями
                await new Promise(resolve => setTimeout(resolve, 100));
                
            } catch (error) {
                if (error.response && error.response.statusCode === 403) {
                    // Защитник заблокировал бота
                    console.log(`⚠️ Защитник ${defender.userId} заблокировал бота`);
                } else {
                    console.error(`❌ Ошибка отправки защитнику ${defender.userId}:`, error.message);
                }
            }
        }
        
    } catch (error) {
        console.error('❌ Ошибка уведомления защитников:', error);
    }
}

// Уведомление жертвы о том, что защитник взял заявку
async function notifyVictimAboutDefender(report, defender) {
    try {
        await bot.sendMessage(report.userId,
            `🛡️ <b>Защитник назначен на вашу заявку!</b>\n\n` +
            `Ваша заявка #${report.id} взята в работу защитником.\n\n` +
            `<b>Защитник:</b> ${defender.pseudonym}\n` +
            `<b>Специальность:</b> ${defender.specialty}\n\n` +
            `Защитник свяжется с вами в ближайшее время для оказания помощи.`,
            { parse_mode: 'HTML' }
        );
        
        console.log(`✅ Уведомление отправлено жертве ${report.userId} о защитнике`);
        
    } catch (error) {
        console.error('❌ Ошибка отправки уведомления жертве:', error);
    }
}

// Уведомление защитника об одобрении заявки
async function notifyDefenderAboutApproval(defender) {
    try {
        await bot.sendMessage(defender.userId,
            `🎉 <b>Поздравляем! Вы стали защитником!</b>\n\n` +
            `Ваша заявка на защитника была одобрена администратором.\n\n` +
            `<b>Ваши данные:</b>\n` +
            `• Псевдоним: ${defender.pseudonym}\n` +
            `• Регион: ${defender.region}\n` +
            `• Специальность: ${defender.specialty}\n\n` +
            `Теперь вы будете получать уведомления о новых заявках в вашем регионе.\n` +
            `Спасибо за готовность помогать людям! 🛡️`,
            { parse_mode: 'HTML' }
        );
        
        console.log(`✅ Уведомление отправлено новому защитнику ${defender.userId}`);
        
    } catch (error) {
        console.error('❌ Ошибка отправки уведомления защитнику:', error);
    }
}

// ================= ОБРАБОТКА ОШИБОК БОТА =================
bot.on('polling_error', (error) => {
    console.error('❌ Polling error:', error.message);
});

bot.on('error', (error) => {
    console.error('❌ Bot error:', error);
});

// ================= ВЕБ-СЕРВЕР ДЛЯ RAILWAY =================
app.get('/', (req, res) => {
    const stats = {
        status: 'online',
        bot: 'Bakelite Bot',
        version: CONFIG.VERSION,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        statistics: {
            defenders: data.defenders.size,
            pendingDefenders: data.pendingDefenders.size,
            reports: data.reports.size,
            sessions: data.userSessions.size
        }
    };
    
    res.json(stats);
});

// Запускаем веб-сервер
app.listen(CONFIG.PORT, () => {
    console.log(`🌐 Веб-сервер запущен на порту ${CONFIG.PORT}`);
});

// ================= ЗАПУСК БОТА =================
console.log('=========================================');
console.log('✅ BAKELITE BOT УСПЕШНО ЗАПУЩЕН!');
console.log('=========================================');
console.log(`🤖 Версия: ${CONFIG.VERSION}`);
console.log(`🌐 Порт: ${CONFIG.PORT}`);
console.log(`👑 Админ ID: ${CONFIG.ADMIN_ID || 'не установлен'}`);
console.log(`📊 Статистика:`);
console.log(`   🛡️ Защитников: ${data.defenders.size}`);
console.log(`   📝 Заявок: ${data.reports.size}`);
console.log(`   ⏳ Ожидают проверки: ${data.pendingDefenders.size}`);
console.log('=========================================');
