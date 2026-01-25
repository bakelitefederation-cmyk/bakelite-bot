const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

// ====================
// НАСТРОЙКИ
// ====================
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || '123456789';

// Проверка переменных
console.log('=== ENV CHECK ===');
console.log('BOT_TOKEN exists:', !!BOT_TOKEN);
console.log('BOT_TOKEN first 10 chars:', BOT_TOKEN ? BOT_TOKEN.substring(0, 10) + '...' : 'MISSING!');
console.log('ADMIN_CHAT_ID:', ADMIN_CHAT_ID);

if (!BOT_TOKEN) {
  console.error('❌ FATAL: BOT_TOKEN is not set in Railway variables!');
  process.exit(1);
}

// ====================
// СОЗДАЁМ БОТА
// ====================
console.log('🤖 Initializing bot...');
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
console.log('✅ Bot created');

// ====================
// ВЕБ-СЕРВЕР (для Railway)
// ====================
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Bakelite Defence Bot</title>
      <style>
        body { font-family: Arial; text-align: center; padding: 50px; background: #0a0a0a; color: white; }
        h1 { color: #4CAF50; }
        .status { background: #1a1a1a; padding: 20px; border-radius: 10px; margin: 20px; }
      </style>
    </head>
    <body>
      <h1>🤖 Bakelite Defence Bot</h1>
      <div class="status">
        <p><strong>Status:</strong> <span style="color: #4CAF50;">RUNNING</span></p>
        <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
        <p><strong>Bot:</strong> @bakelite_defence_bot</p>
      </div>
      <p>Telegram bot for cybercrime victims assistance</p>
    </body>
    </html>
  `);
});

// ====================
// КОМАНДЫ БОТА
// ====================

// /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  console.log(`/start from ${chatId}`);
  
  const text = `
🛡️ *Bakelite Defence Bot* v2.0

*Команды:*
/report - Подать заявку о проблеме
/join - Стать защитником
/status - Проверить статус
/feedback - Оставить отзыв
/help - Помощь

*Статистика:*
Бот работает на Railway
Время: ${new Date().toLocaleTimeString()}

⚠️ *Внимание:* Мы не юридическая организация.
  `;
  
  bot.sendMessage(chatId, text, { parse_mode: 'Markdown' })
    .then(() => console.log(`✅ Sent /start to ${chatId}`))
    .catch(err => console.error(`❌ Error to ${chatId}:`, err.message));
});

// /help
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  console.log(`/help from ${chatId}`);
  
  const text = `
📖 *ПОМОЩЬ*

1. */report* - Опишите проблему
2. Защитник из вашего региона получит уведомление
3. С вами свяжутся в течение 24 часов

*Безопасность:*
• Не сообщайте пароли/данные карт
• Используйте псевдонимы
• Сохраняйте скриншоты

*Контакты:* 
Для связи с админом: @ваш_никнейм
  `;
  
  bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
});

// /report
bot.onText(/\/report/, (msg) => {
  const chatId = msg.chat.id;
  console.log(`/report from ${chatId}`);
  
  bot.sendMessage(chatId, '📝 *Шаг 1 из 2*\nВ какой стране вы находитесь?', { parse_mode: 'Markdown' });
  
  bot.once('message', (response) => {
    const country = response.text;
    
    bot.sendMessage(chatId, '📝 *Шаг 2 из 2*\nОпишите проблему подробно:', { parse_mode: 'Markdown' });
    
    bot.once('message', async (response2) => {
      const problem = response2.text;
      
      // Сохраняем "в память" (для теста)
      const reportId = Date.now();
      
      // Уведомляем админа
      bot.sendMessage(
        ADMIN_CHAT_ID,
        `🚨 НОВАЯ ЗАЯВКА #${reportId}\n\n` +
        `От: ${chatId}\n` +
        `Страна: ${country}\n` +
        `Проблема: ${problem.substring(0, 100)}...`
      ).catch(err => console.error('Admin notify error:', err));
      
      // Ответ пользователю
      bot.sendMessage(
        chatId,
        `✅ *Заявка #${reportId} принята!*\n\n` +
        `Защитники из ${country} уведомлены.\n` +
        `С вами свяжутся в течение 24 часов.\n\n` +
        `Используйте /status для проверки.`,
        { parse_mode: 'Markdown' }
      );
    });
  });
});

// /join
bot.onText(/\/join/, (msg) => {
  const chatId = msg.chat.id;
  console.log(`/join from ${chatId}`);
  
  const text = `
🛡️ *Регистрация защитника*

Чтобы стать защитником:
1. Заполните анкету: [ссылка на Google Form]
2. Админ проверит ваши данные
3. После проверки вы будете получать уведомления

*Требования:*
• Возраст 18+
• Навыки: юрист, психолог, IT или желание помочь
• Ответственность

*Контакты для анкеты:* @ваш_никнейм
  `;
  
  bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
});

// /status
bot.onText(/\/status/, (msg) => {
  const chatId = msg.chat.id;
  
  bot.sendMessage(
    chatId,
    `📊 *Статус системы*\n\n` +
    `Бот: ✅ Работает\n` +
    `Платформа: Railway\n` +
    `Время: ${new Date().toLocaleTimeString()}\n` +
    `Ваш ID: ${chatId}\n\n` +
    `_Для проверки конкретной заявки напишите админу_`,
    { parse_mode: 'Markdown' }
  );
});

// /feedback
bot.onText(/\/feedback/, (msg) => {
  const chatId = msg.chat.id;
  
  bot.sendMessage(
    chatId,
    `💬 *Обратная связь*\n\n` +
    `Напишите ваши предложения или жалобы:\n` +
    `@ваш_никнейм\n\n` +
    `Или используйте Google Form: [ссылка]`,
    { parse_mode: 'Markdown' }
  );
});

// Обработка ошибок бота
bot.on('polling_error', (error) => {
  console.error('❌ Polling error:', error.code, error.message);
});

bot.on('webhook_error', (error) => {
  console.error('❌ Webhook error:', error);
});

// ====================
// ЗАПУСК СЕРВЕРА
// ====================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server started on port ${PORT}`);
  console.log(`⏰ ${new Date().toLocaleString()}`);
  console.log('================================');
});

// Сообщение при запуске
console.log('================================');
console.log('🛡️ BAKELITE DEFENCE BOT v2.0');
console.log('🚀 Deployed on Railway');
console.log('🤖 Bot should respond to commands');
console.log('================================');
