// ==================== НАЧАЛО ФАЙЛА ====================
console.log('🚀 Начинаем загрузку Bakelite Bot...');

// 1. Импорты (проверьте написание!)
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

// 2. Проверка переменных окружения
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = process.env.ADMIN_ID;
const PORT = process.env.PORT || 3000;

console.log('✅ Импорты загружены');
console.log(`🔑 BOT_TOKEN: ${BOT_TOKEN ? 'установлен' : 'НЕ УСТАНОВЛЕН!'}`);
console.log(`👑 ADMIN_ID: ${ADMIN_ID || 'не установлен'}`);

if (!BOT_TOKEN) {
    console.error('❌ ОШИБКА: BOT_TOKEN не установлен!');
    console.error('Добавьте в Railway: BOT_TOKEN=ваш_токен');
    process.exit(1);
}

// 3. Создание бота (простейший вариант)
try {
    console.log('🤖 Создаем Telegram бота...');
    const bot = new TelegramBot(BOT_TOKEN, { polling: true });
    console.log('✅ Бот создан успешно!');
    
    // 4. Базовая команда /start
    bot.onText(/\/start/, (msg) => {
        const chatId = msg.chat.id;
        const userName = msg.from.first_name || 'Пользователь';
        
        bot.sendMessage(chatId, 
            `🛡️ Привет, ${userName}!\n\nЯ - Bakelite Bot. Работаю!\n\nКоманды:\n/start - это меню\n/help - помощь`,
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🛡️ Стать защитником', callback_data: 'join' }],
                        [{ text: '🆘 Запросить помощь', callback_data: 'report' }],
                        [{ text: '📖 Справка', callback_data: 'help' }]
                    ]
                }
            }
        );
    });
    
    // 5. Команда /help
    bot.onText(/\/help/, (msg) => {
        bot.sendMessage(msg.chat.id, '📖 Справка: Используйте /start для меню');
    });
    
    // 6. Обработка callback кнопок
    bot.on('callback_query', (callbackQuery) => {
        const chatId = callbackQuery.message.chat.id;
        const data = callbackQuery.data;
        
        if (data === 'join') {
            bot.sendMessage(chatId, 'Используйте команду /join');
        } else if (data === 'report') {
            bot.sendMessage(chatId, 'Используйте команду /report');
        } else if (data === 'help') {
            bot.sendMessage(chatId, 'Используйте команду /help');
        }
        
        bot.answerCallbackQuery(callbackQuery.id);
    });
    
    console.log('✅ Обработчики команд установлены');
    
    // 7. Веб-сервер для Railway health checks
    const app = express();
    app.get('/', (req, res) => {
        res.json({ 
            status: 'online', 
            bot: 'Bakelite Bot',
            time: new Date().toISOString() 
        });
    });
    
    app.listen(PORT, () => {
        console.log(`🌐 Веб-сервер запущен на порту ${PORT}`);
        console.log('=========================================');
        console.log('✅ BAKELITE BOT УСПЕШНО ЗАПУЩЕН!');
        console.log('=========================================');
    });
    
    // 8. Обработка ошибок бота
    bot.on('polling_error', (error) => {
        console.error('Polling error:', error.message);
    });
    
} catch (error) {
    console.error('❌ КРИТИЧЕСКАЯ ОШИБКА:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
}
// ==================== КОНЕЦ ФАЙЛА ====================
