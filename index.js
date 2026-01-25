const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

// Токен бота (замени своим)
const token = '8556003527:AAGqajdqGbSGhahl0_mp1J8IF3vDY_IAGXY';

// Создаём бота
const bot = new TelegramBot(token, {polling: true});

// Веб-сервер для Cyclic
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send(`
    <html>
      <body style="background: black; color: white; padding: 50px;">
        <h1>🤖 Bakelite Defence Bot</h1>
        <p>Status: <span style="color: green;">ACTIVE</span></p>
        <p>Time: ${new Date().toLocaleString()}</p>
      </body>
    </html>
  `);
});

// Команда /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 
    `🛡️ *Bakelite Defence Bot*\n\n` +
    `Команды:\n` +
    `/report - Подать заявку\n` +
    `/help - Помощь\n\n` +
    `_Бот работает на Cyclic.sh_`,
    {parse_mode: 'Markdown'}
  );
  console.log('User started:', chatId);
});

// Команда /report
bot.onText(/\/report/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, '📝 Опишите проблему:');
  
  bot.once('message', (response) => {
    // Просто сохраняем в память для примера
    const report = {
      id: Date.now(),
      chatId: chatId,
      problem: response.text,
      time: new Date().toISOString()
    };
    
    // Отправляем подтверждение
    bot.sendMessage(chatId, 
      `✅ Заявка #${report.id} принята!\n` +
      `Защитник свяжется в течение 24 часов.`
    );
    
    console.log('New report:', report);
  });
});

// Запускаем сервер
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🤖 Bot started with token: ${token.substring(0, 10)}...`);
  console.log(`⏰ ${new Date().toLocaleString()}`);
});
