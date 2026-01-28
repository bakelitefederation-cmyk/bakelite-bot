// ============================================
// 🛡️ BAKELITE-BOT - МИНИМАЛЬНАЯ РАБОЧАЯ ВЕРСИЯ
// ============================================

const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

// Конфигурация
const CONFIG = {
    BOT_TOKEN: process.env.BOT_TOKEN || '',
    ADMIN_ID: process.env.ADMIN_ID || '',
    VERSION: '1.0.0',
    PORT: process.env.PORT || 3000
};

// Проверка токена
if (!CONFIG.BOT_TOKEN) {
    console.error('❌ ОШИБКА: BOT_TOKEN не установлен');
    console.error('Установите в Railway: BOT_TOKEN=ваш_токен_бота');
    process.exit(1);
}

// Создаем бота
const bot = new TelegramBot(CONFIG.BOT_TOKEN, { polling: true });
const app = express();

// ============================================
// ХРАНЕНИЕ ДАННЫХ (В ПАМЯТИ)
// ============================================

const data = {
    reports: new Map(),      // reportId -> {userId, region, crimeType, description, status}
    defenders: new Map(),    // userId -> {pseudonym, region, specialty}
    pendingDefenders: new Map(), // appId -> {userId, pseudonym, region, specialty}
    userSessions: new Map()  // userId -> {type, step, data}
};

// ============================================
// КЛАВИАТУРЫ
// ============================================

const Keyboards = {
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
                ]
            ]
        }
    },
    
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
                ]
            ]
        }
    },
    
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
    
    backToMenu: {
        reply_markup: {
            inline_keyboard: [
                [{ text: '📋 Вернуться в меню', callback_data: 'menu_main' }]
            ]
        }
    }
};

// ============================================
// КОМАНДА /start
// ============================================

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const userName = msg.from.first_name || 'Пользователь';
    
    const welcomeMessage = `
🛡️ <b>Добро пожаловать в Bakelite Bot v${CONFIG.VERSION}!</b>

👋 Привет, ${userName}! Я - бот помощи жертвам киберпреступлений.

👇 <b>Выберите действие:</b>
    `;
    
    bot.sendMessage(chatId, welcomeMessage, {
        parse_mode: 'HTML',
        ...Keyboards.mainMenu
    });
});

// ============================================
// КОМАНДА /help
// ============================================

bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    
    const helpMessage = `
📖 <b>СПРАВКА</b>

<b>Основные команды:</b>
/start - Главное меню
/join - Стать защитником
/report - Запросить помощь
/status - Статус заявок
/help - Эта справка

<b>Как работает бот:</b>
1. 🛡️ <b>Защитники</b> регистрируются через /join
2. 🆘 <b>Жертвы</b> создают заявки через /report
3. 📋 <b>Админ</b> одобряет защитников
4. 🔔 <b>Защитники</b> получают уведомления о новых заявках
5. 💬 <b>Защитник</b> связывается с жертвой напрямую
    `;
    
    bot.sendMessage(chatId, helpMessage, {
        parse_mode: 'HTML',
        ...Keyboards.backToMenu
    });
});

// ============================================
## ПРОДОЛЖЕНИЕ - ОБРАБОТКА КОМАНДЫ /join

bot.onText(/\/join/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const userName = msg.from.first_name || 'Пользователь';
    
    // Проверяем, не является ли уже защитником
    const existingDefender = data.defenders.get(userId.toString());
    if (existingDefender) {
        bot.sendMessage(chatId,
            `🛡️ <b>Вы уже защитник!</b>\n\n` +
            `Псевдоним: ${existingDefender.pseudonym}\n` +
            `Регион: ${existingDefender.region}\n` +
            `Специальность: ${existingDefender.specialty}`,
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
            userUsername: msg.from.username || ''
        }
    });
    
    // Отправляем первый шаг
    bot.sendMessage(chatId,
        `🛡️ <b>СТАТЬ ЗАЩИТНИКОМ</b>\n\n` +
        `<b>Шаг 1/3:</b> Выберите ваш регион:`,
        { parse_mode: 'HTML', ...Keyboards.regions }
    );
});

// ============================================
## ПРОДОЛЖЕНИЕ - ОБРАБОТКА КОМАНДЫ /report

bot.onText(/\/report/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const userName = msg.from.first_name || 'Пользователь';
    
    // Создаем сессию
    data.userSessions.set(userId.toString(), {
        type: 'report',
        step: 1,
        data: {
            userName: userName,
            userUsername: msg.from.username || ''
        }
    });
    
    // Отправляем первый шаг
    bot.sendMessage(chatId,
        `🆘 <b>ЗАПРОС ПОМОЩИ</b>\n\n` +
        `<b>Шаг 1/4:</b> Выберите регион, где произошел инцидент:`,
        { parse_mode: 'HTML', ...Keyboards.regions }
    );
});

// ============================================
## ПРОДОЛЖЕНИЕ - ОБРАБОТКА КОМАНДЫ /status

bot.onText(/\/status/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    // Находим все заявки пользователя
    const userReports = Array.from(data.reports.values())
        .filter(report => report.userId === userId.toString());
    
    if (userReports.length === 0) {
        bot.sendMessage(chatId,
            `📊 <b>СТАТУС ЗАЯВОК</b>\n\n` +
            `У вас пока нет заявок о помощи.\n\n` +
            `Используйте /report чтобы создать заявку.`,
            { parse_mode: 'HTML', ...Keyboards.backToMenu }
        );
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
    
    bot.sendMessage(chatId, statusMessage, {
        parse_mode: 'HTML',
        ...Keyboards.backToMenu
    });
});

// ============================================
## ПРОДОЛЖЕНИЕ - ОБРАБОТКА CALLBACK-ЗАПРОСОВ

bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const userId = callbackQuery.from.id;
    const data = callbackQuery.data;
    const messageId = callbackQuery.message.message_id;
    
    console.log(`Callback от ${userId}: ${data}`);
    
    try {
        // Обработка меню
        if (data === 'menu_join') {
            await bot.answerCallbackQuery(callbackQuery.id);
            bot.sendMessage(chatId, 'Используйте команду /join', { ...Keyboards.backToMenu });
        }
        else if (data === 'menu_report') {
            await bot.answerCallbackQuery(callbackQuery.id);
            bot.sendMessage(chatId, 'Используйте команду /report', { ...Keyboards.backToMenu });
        }
        else if (data === 'menu_status') {
            await bot.answerCallbackQuery(callbackQuery.id);
            bot.sendMessage(chatId, 'Используйте команду /status', { ...Keyboards.backToMenu });
        }
        else if (data === 'menu_help') {
            await bot.answerCallbackQuery(callbackQuery.id);
            bot.sendMessage(chatId, 'Используйте команду /help', { ...Keyboards.backToMenu });
        }
        else if (data === 'menu_main') {
            await bot.answerCallbackQuery(callbackQuery.id);
            bot.sendMessage(chatId, 'Возвращаемся в меню...', { ...Keyboards.mainMenu });
        }
        
        // Обработка регионов
        else if (data.startsWith('region_')) {
            await handleRegionSelection(callbackQuery);
        }
        
        // Обработка типов преступлений
        else if (data.startsWith('crime_')) {
            await handleCrimeSelection(callbackQuery);
        }
        
        // Обработка подтверждения
        else if (data.startsWith('confirm_')) {
            await handleConfirmation(callbackQuery);
        }
        
    } catch (error) {
        console.error('Ошибка обработки callback:', error);
        await bot.answerCallbackQuery(callbackQuery.id, {
            text: '❌ Произошла ошибка',
            show_alert: true
        });
    }
});

// ============================================
## ПРОДОЛЖЕНИЕ - ФУНКЦИИ ОБРАБОТКИ

async function handleRegionSelection(callbackQuery) {
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
        case 'region_ru': region = 'Россия'; break;
        case 'region_ua': region = 'Украина'; break;
        case 'region_kz': region = 'Казахстан'; break;
        case 'region_other': region = 'Другое'; break;
        default: region = 'Не указано';
    }
    
    // Сохраняем в сессии
    session.data.region = region;
    session.step = 2;
    data.userSessions.set(userId.toString(), session);
    
    // Отправляем следующий шаг
    if (session.type === 'join') {
        bot.editMessageText(
            `✅ <b>Регион: ${region}</b>\n\n` +
            `<b>Шаг 2/3:</b> Введите ваш псевдоним (имя в системе):\n\n` +
            `<i>Пример: CyberHelper, SecurityGuard, ITProtector</i>`,
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
    
    await bot.answerCallbackQuery(callbackQuery.id);
}

// ============================================
## ПРОДОЛЖЕНИЕ - ОБРАБОТКА ТЕКСТОВЫХ СООБЩЕНИЙ

bot.on('message', (msg) => {
    // Пропускаем команды
    if (msg.text && msg.text.startsWith('/')) return;
    
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text || '';
    
    const session = data.userSessions.get(userId.toString());
    if (!session) return;
    
    // Обработка сообщений для регистрации защитника
    if (session.type === 'join' && session.step === 2) {
        // Шаг 2: Получение псевдонима
        if (text.length < 2 || text.length > 50) {
            bot.sendMessage(chatId,
                '❌ Псевдоним должен быть от 2 до 50 символов.\nПопробуйте еще раз:'
            );
            return;
        }
        
        session.data.pseudonym = text;
        session.step = 3;
        data.userSessions.set(userId.toString(), session);
        
        bot.sendMessage(chatId,
            `✅ <b>Псевдоним: ${text}</b>\n\n` +
            `<b>Шаг 3/3:</b> Опишите вашу специальность:\n\n` +
            `<i>Пример: "Юрист по киберправу", "IT-специалист по безопасности", "Психолог"</i>`,
            { parse_mode: 'HTML' }
        );
    }
    else if (session.type === 'join' && session.step === 3) {
        // Шаг 3: Получение специальности
        if (text.length < 5) {
            bot.sendMessage(chatId,
                '❌ Опишите специальность подробнее (минимум 5 символов).\nПопробуйте еще раз:'
            );
            return;
        }
        
        session.data.specialty = text;
        session.step = 4; // Подтверждение
        data.userSessions.set(userId.toString(), session);
        
        bot.sendMessage(chatId,
            `📋 <b>ПОДТВЕРЖДЕНИЕ ЗАЯВКИ</b>\n\n` +
            `<b>Ваши данные:</b>\n` +
            `• Регион: ${session.data.region}\n` +
            `• Псевдоним: ${session.data.pseudonym}\n` +
            `• Специальность: ${session.data.specialty}\n\n` +
            `<b>Подтвердите отправку:</b>`,
            { parse_mode: 'HTML', ...Keyboards.confirm }
        );
    }
});

// ============================================
## ПРОДОЛЖЕНИЕ - ВЕБ-СЕРВЕР ДЛЯ RAILWAY

app.get('/', (req, res) => {
    res.json({
        status: 'online',
        bot: 'Bakelite Bot',
        version: CONFIG.VERSION,
        uptime: process.uptime(),
        reports: data.reports.size,
        defenders: data.defenders.size,
        users: data.userSessions.size
    });
});

// Запускаем сервер
app.listen(CONFIG.PORT, () => {
    console.log('🚀 Bakelite Bot запущен!');
    console.log('🤖 Версия:', CONFIG.VERSION);
    console.log('🌐 Порт:', CONFIG.PORT);
    console.log('📊 Данные в памяти:', {
        reports: data.reports.size,
        defenders: data.defenders.size,
        sessions: data.userSessions.size
    });
    console.log('=======================================');
});
