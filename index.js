// ============================================
// 🛡️ BAKELITE DEFENCE BOT v4.1 - С ИНЛАЙН КНОПКАМИ
// Версия: 4.1.0
// Контакт: @kartochniy
// ============================================

const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ============================================
// КОНФИГУРАЦИЯ
// ============================================

const SYSTEM_CONFIG = {
    BOT_TOKEN: process.env.BOT_TOKEN || '',
    ADMIN_CHAT_ID: process.env.ADMIN_CHAT_ID || '',
    TECH_SUPPORT: '@kartochniy',
    PORT: process.env.PORT || 3000,
    
    // Добавляем кнопки
    INLINE_BUTTONS: {
        APPROVE_DEFENDER: 'approve_defender_',
        REJECT_DEFENDER: 'reject_defender_',
        ASSIGN_REPORT: 'assign_report_',
        CLOSE_REPORT: 'close_report_',
        VIEW_DETAILS: 'view_details_'
    }
};

// ============================================
// ОБНОВЛЕННЫЙ КЛАСС BOT
// ============================================

class BakeliteBotWithButtons {
    constructor() {
        this.dataManager = new DataManager();
        this.bot = null;
        this.app = express();
        this.setupBot();
        this.setupWebServer();
    }
    
    setupBot() {
        this.bot = new TelegramBot(SYSTEM_CONFIG.BOT_TOKEN, { polling: true });
        
        // Основные команды
        this.bot.onText(/\/start/, (msg) => this.handleStart(msg));
        this.bot.onText(/\/help/, (msg) => this.handleHelp(msg));
        this.bot.onText(/\/report/, (msg) => this.handleReport(msg));
        this.bot.onText(/\/join/, (msg) => this.handleJoin(msg));
        this.bot.onText(/\/status/, (msg) => this.handleStatus(msg));
        
        // Админские команды
        this.bot.onText(/\/admin/, (msg) => this.handleAdmin(msg));
        this.bot.onText(/\/defenders/, (msg) => this.handleDefendersList(msg));
        this.bot.onText(/\/reports/, (msg) => this.handleReportsList(msg));
        
        // Обработка инлайн-кнопок
        this.bot.on('callback_query', (callbackQuery) => {
            this.handleInlineButton(callbackQuery);
        });
    }
    
    // ==================== ИНЛАЙН КНОПКИ ====================
    
    async handleInlineButton(callbackQuery) {
        const chatId = callbackQuery.message.chat.id;
        const userId = callbackQuery.from.id;
        const data = callbackQuery.data;
        const messageId = callbackQuery.message.message_id;
        
        // Проверяем что это админ
        if (userId.toString() !== SYSTEM_CONFIG.ADMIN_CHAT_ID) {
            this.bot.answerCallbackQuery(callbackQuery.id, {
                text: '❌ Только администратор может использовать эти кнопки',
                show_alert: true
            });
            return;
        }
        
        // Обрабатываем кнопку
        if (data.startsWith(SYSTEM_CONFIG.INLINE_BUTTONS.APPROVE_DEFENDER)) {
            await this.approveDefender(callbackQuery);
        } 
        else if (data.startsWith(SYSTEM_CONFIG.INLINE_BUTTONS.REJECT_DEFENDER)) {
            await this.rejectDefender(callbackQuery);
        }
        else if (data.startsWith(SYSTEM_CONFIG.INLINE_BUTTONS.VIEW_DETAILS)) {
            await this.showDetails(callbackQuery);
        }
        
        this.bot.answerCallbackQuery(callbackQuery.id);
    }
    
    async approveDefender(callbackQuery) {
        const appId = callbackQuery.data.replace(SYSTEM_CONFIG.INLINE_BUTTONS.APPROVE_DEFENDER, '');
        const chatId = callbackQuery.message.chat.id;
        const messageId = callbackQuery.message.message_id;
        
        // Находим заявку
        const application = this.dataManager.defenders.get(appId);
        if (!application) {
            this.bot.sendMessage(chatId, '❌ Заявка не найдена');
            return;
        }
        
        // Одобряем
        application.status = 'approved';
        application.reviewedAt = new Date().toISOString();
        this.dataManager.defenders.set(appId, application);
        this.dataManager.savePersistentData();
        
        // Уведомляем защитника
        const defenderMessage = 
            `🎉 *ВАША ЗАЯВКА ОДОБРЕНА!*\n\n` +
            `Заявка #${appId} одобрена администратором.\n\n` +
            `*Что дальше:*\n` +
            `1. Вы будете получать уведомления о новых заявках\n` +
            `2. Для начала работы ожидайте первого уведомления\n` +
            `3. Все инструкции будут отправлены отдельно\n\n` +
            `*Ваши данные:*\n` +
            `• Имя: ${application.defenderName}\n` +
            `• Регион: ${application.region}\n` +
            `• Навыки: ${application.skills}\n\n` +
            `Спасибо за участие! 🛡️`;
        
        await this.sendFormattedMessage(application.chatId, defenderMessage);
        
        // Обновляем сообщение с кнопками
        const updatedText = callbackQuery.message.text + '\n\n✅ *ОДОБРЕНО АДМИНИСТРАТОРОМ*';
        
        await this.bot.editMessageText(updatedText, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown'
        });
        
        // Удаляем кнопки
        await this.bot.editMessageReplyMarkup({
            inline_keyboard: []
        }, {
            chat_id: chatId,
            message_id: messageId
        });
        
        this.bot.sendMessage(chatId, `✅ Защитник #${appId} одобрен и уведомлен`);
    }
    
    async rejectDefender(callbackQuery) {
        const appId = callbackQuery.data.replace(SYSTEM_CONFIG.INLINE_BUTTONS.REJECT_DEFENDER, '');
        const chatId = callbackQuery.message.chat.id;
        const messageId = callbackQuery.message.message_id;
        
        const application = this.dataManager.defenders.get(appId);
        if (!application) {
            this.bot.sendMessage(chatId, '❌ Заявка не найдена');
            return;
        }
        
        application.status = 'rejected';
        application.reviewedAt = new Date().toISOString();
        this.dataManager.defenders.set(appId, application);
        this.dataManager.savePersistentData();
        
        const defenderMessage = 
            `📝 *ПО ВАШЕЙ ЗАЯВКЕ #${appId}*\n\n` +
            `К сожалению, ваша заявка не была одобрена.\n\n` +
            `*Возможные причины:*\n` +
            `• Неполная информация\n` +
            `• Требуются дополнительные навыки\n` +
            `• Ограничение по региону\n` +
            `• Другие организационные причины\n\n` +
            `Вы можете подать заявку повторно через 30 дней.\n` +
            `Спасибо за понимание.`;
        
        await this.sendFormattedMessage(application.chatId, defenderMessage);
        
        const updatedText = callbackQuery.message.text + '\n\n❌ *ОТКЛОНЕНО АДМИНИСТРАТОРОМ*';
        
        await this.bot.editMessageText(updatedText, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown'
        });
        
        await this.bot.editMessageReplyMarkup({
            inline_keyboard: []
        }, {
            chat_id: chatId,
            message_id: messageId
        });
        
        this.bot.sendMessage(chatId, `❌ Заявка #${appId} отклонена`);
    }
    
    // ==================== АДМИН КОМАНДЫ ====================
    
    async handleAdmin(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        if (userId.toString() !== SYSTEM_CONFIG.ADMIN_CHAT_ID) {
            this.bot.sendMessage(chatId, '❌ Только для администратора');
            return;
        }
        
        const stats = this.dataManager.getStatistics();
        
        const adminPanel = 
            `👑 *АДМИН ПАНЕЛЬ*\n\n` +
            `*Статистика:*\n` +
            `• Заявок всего: ${stats.totalReports}\n` +
            `• Новых заявок: ${stats.reportsByStatus.new || 0}\n` +
            `• Заявок защитников: ${stats.totalDefenders}\n` +
            `• На проверке: ${stats.defendersByStatus.pending || 0}\n\n` +
            `*Быстрые команды:*\n` +
            `/defenders - Список заявок защитников\n` +
            `/reports - Список заявок о проблемах\n` +
            `/stats - Детальная статистика\n\n` +
            `*ID для копирования:*\n` +
            `\`${userId}\`\n\n` +
            `Нажми на ID выше чтобы скопировать`;
        
        await this.sendFormattedMessage(chatId, adminPanel);
    }
    
    async handleDefendersList(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        if (userId.toString() !== SYSTEM_CONFIG.ADMIN_CHAT_ID) {
            this.bot.sendMessage(chatId, '❌ Только для администратора');
            return;
        }
        
        const pendingDefenders = [];
        
        for (const [appId, application] of this.dataManager.defenders) {
            if (application.status === 'pending') {
                pendingDefenders.push({ appId, application });
            }
        }
        
        if (pendingDefenders.length === 0) {
            this.bot.sendMessage(chatId, '✅ Нет заявок защитников на проверке');
            return;
        }
        
        for (const { appId, application } of pendingDefenders) {
            const defenderMessage = 
                `🛡️ *ЗАЯВКА ЗАЩИТНИКА #${appId}*\n\n` +
                `*Кандидат:* ${application.defenderName}\n` +
                `*Регион:* ${application.region}\n` +
                `*Навыки:* ${application.skills}\n` +
                `*Время подачи:* ${new Date(application.submittedAt).toLocaleString('ru-RU')}\n\n` +
                `*ID для копирования:*\n` +
                `\`${appId}\`\n` +
                `\`${application.userId}\`\n\n` +
                `Нажми на ID чтобы скопировать`;
            
            // Создаем инлайн-кнопки
            const inlineKeyboard = {
                inline_keyboard: [
                    [
                        {
                            text: '✅ Одобрить',
                            callback_data: SYSTEM_CONFIG.INLINE_BUTTONS.APPROVE_DEFENDER + appId
                        },
                        {
                            text: '❌ Отклонить',
                            callback_data: SYSTEM_CONFIG.INLINE_BUTTONS.REJECT_DEFENDER + appId
                        }
                    ],
                    [
                        {
                            text: '📋 Подробнее',
                            callback_data: SYSTEM_CONFIG.INLINE_BUTTONS.VIEW_DETAILS + appId
                        }
                    ]
                ]
            };
            
            await this.bot.sendMessage(chatId, defenderMessage, {
                parse_mode: 'Markdown',
                reply_markup: inlineKeyboard
            });
        }
    }
    
    async handleReportsList(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        if (userId.toString() !== SYSTEM_CONFIG.ADMIN_CHAT_ID) {
            this.bot.sendMessage(chatId, '❌ Только для администратора');
            return;
        }
        
        const newReports = [];
        
        for (const [reportId, report] of this.dataManager.reports) {
            if (report.status === 'new') {
                newReports.push({ reportId, report });
            }
        }
        
        if (newReports.length === 0) {
            this.bot.sendMessage(chatId, '✅ Нет новых заявок о проблемах');
            return;
        }
        
        for (const { reportId, report } of newReports) {
            const reportMessage = 
                `🚨 *ЗАЯВКА #${reportId}*\n\n` +
                `*От:* ${report.userName}\n` +
                `*Страна:* ${report.country}\n` +
                `*Тип:* ${report.problemType}\n` +
                `*Время:* ${new Date(report.createdAt).toLocaleString('ru-RU')}\n\n` +
                `*Описание:*\n${report.description.substring(0, 200)}...\n\n` +
                `*ID для копирования:*\n` +
                `\`${reportId}\`\n` +
                `\`${report.userId}\`\n\n` +
                `Нажми на ID чтобы скопировать`;
            
            await this.sendFormattedMessage(chatId, reportMessage);
        }
    }
    
    // ==================== ОСНОВНЫЕ КОМАНДЫ ====================
    
    async handleStart(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        const welcome = 
            `🛡️ *Bakelite Defence System*\n\n` +
            `Ваш ID: \`${userId}\`\n\n` +
            `Нажми на ID выше чтобы скопировать\n\n` +
            `*Команды:*\n` +
            `/report - Подать заявку\n` +
            `/join - Стать защитником\n` +
            `/help - Помощь\n\n` +
            `Поддержка: ${SYSTEM_CONFIG.TECH_SUPPORT}`;
        
        await this.sendFormattedMessage(chatId, welcome);
    }
    
    async handleHelp(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        const helpText = 
            `*📋 ВАШ ID:* \`${userId}\`\n\n` +
            `*Команды:*\n` +
            `/start - Начало работы\n` +
            `/report - Подать заявку о проблеме\n` +
            `/join - Стать защитником\n` +
            `/status - Статус системы\n\n` +
            `*Для копирования ID:*\n` +
            `1. Нажми на ID выше\n` +
            `2. Выберите "Копировать"\n` +
            `3. Вставьте куда нужно\n\n` +
            `Поддержка: ${SYSTEM_CONFIG.TECH_SUPPORT}`;
        
        await this.sendFormattedMessage(chatId, helpText);
    }
    
    async handleReport(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        // Сохраняем заявку
        const reportId = 'RPT-' + Date.now();
        const report = {
            id: reportId,
            userId: userId,
            userName: msg.from.first_name || 'User',
            chatId: chatId,
            country: 'Не указана',
            problemType: 'Не указана',
            description: 'Не указано',
            status: 'new',
            createdAt: new Date().toISOString()
        };
        
        this.dataManager.reports.set(reportId, report);
        this.dataManager.savePersistentData();
        
        // Отправляем админу
        const adminMessage = 
            `🚨 *НОВАЯ ЗАЯВКА #${reportId}*\n\n` +
            `*От:* ${report.userName}\n` +
            `*ID пользователя:* \`${userId}\`\n` +
            `*ID заявки:* \`${reportId}\`\n\n` +
            `*Для ответа:*\n` +
            `tg://user?id=${userId}\n\n` +
            `Нажми на ID чтобы скопировать`;
        
        await this.sendFormattedMessage(SYSTEM_CONFIG.ADMIN_CHAT_ID, adminMessage);
        
        // Отправляем пользователю
        const userMessage = 
            `✅ *ЗАЯВКА #${reportId} ПРИНЯТА*\n\n` +
            `*Ваш ID:* \`${userId}\`\n` +
            `*ID заявки:* \`${reportId}\`\n\n` +
            `Сохраните эти ID для отслеживания.\n` +
            `С вами свяжутся в течение 24 часов.\n\n` +
            `Нажми на ID чтобы скопировать`;
        
        await this.sendFormattedMessage(chatId, userMessage);
    }
    
    async handleJoin(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const userName = msg.from.first_name || 'User';
        
        // Создаем заявку защитника
        const appId = 'DEF-' + Date.now();
        const application = {
            id: appId,
            userId: userId,
            userName: userName,
            defenderName: userName,
            chatId: chatId,
            region: 'Не указан',
            skills: 'Не указаны',
            status: 'pending',
            submittedAt: new Date().toISOString()
        };
        
        this.dataManager.defenders.set(appId, application);
        this.dataManager.savePersistentData();
        
        // Отправляем админу с кнопками
        const adminMessage = 
            `🛡️ *НОВАЯ ЗАЯВКА ЗАЩИТНИКА #${appId}*\n\n` +
            `*Кандидат:* ${userName}\n` +
            `*ID кандидата:* \`${userId}\`\n` +
            `*ID заявки:* \`${appId}\`\n\n` +
            `Нажми на ID чтобы скопировать`;
        
        // Инлайн-кнопки для админа
        const inlineKeyboard = {
            inline_keyboard: [
                [
                    {
                        text: '✅ Одобрить',
                        callback_data: SYSTEM_CONFIG.INLINE_BUTTONS.APPROVE_DEFENDER + appId
                    },
                    {
                        text: '❌ Отклонить',
                        callback_data: SYSTEM_CONFIG.INLINE_BUTTONS.REJECT_DEFENDER + appId
                    }
                ]
            ]
        };
        
        await this.bot.sendMessage(SYSTEM_CONFIG.ADMIN_CHAT_ID, adminMessage, {
            parse_mode: 'Markdown',
            reply_markup: inlineKeyboard
        });
        
        // Отправляем пользователю
        const userMessage = 
            `✅ *ВАША ЗАЯВКА #${appId} ПРИНЯТА*\n\n` +
            `*Ваш ID:* \`${userId}\`\n` +
            `*ID заявки:* \`${appId}\`\n\n` +
            `Сохраните эти ID.\n` +
            `Администратор проверит заявку в течение 1-3 дней.\n\n` +
            `Нажми на ID чтобы скопировать`;
        
        await this.sendFormattedMessage(chatId, userMessage);
    }
    
    async handleStatus(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        const statusMessage = 
            `📊 *СТАТУС СИСТЕМЫ*\n\n` +
            `*Ваш ID:* \`${userId}\`\n\n` +
            `Система работает нормально.\n` +
            `Поддержка: ${SYSTEM_CONFIG.TECH_SUPPORT}\n\n` +
            `Нажми на ID чтобы скопировать`;
        
        await this.sendFormattedMessage(chatId, statusMessage);
    }
    
    // ==================== ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ ====================
    
    async sendFormattedMessage(chatId, text) {
        try {
            await this.bot.sendMessage(chatId, text, {
                parse_mode: 'Markdown',
                disable_web_page_preview: true
            });
        } catch (error) {
            console.error('Ошибка отправки сообщения:', error.message);
        }
    }
    
    setupWebServer() {
        this.app.get('/', (req, res) => {
            res.json({ status: 'Bot is running', version: '4.1.0' });
        });
        
        this.app.listen(SYSTEM_CONFIG.PORT, () => {
            console.log(`🚀 Bot running on port ${SYSTEM_CONFIG.PORT}`);
        });
    }
}

// ============================================
// ПРОСТОЙ МЕНЕДЖЕР ДАННЫХ
// ============================================

class DataManager {
    constructor() {
        this.reports = new Map();
        this.defenders = new Map();
        this.loadData();
    }
    
    loadData() {
        try {
            if (fs.existsSync('data.json')) {
                const data = JSON.parse(fs.readFileSync('data.json', 'utf8'));
                this.reports = new Map(data.reports || []);
                this.defenders = new Map(data.defenders || []);
            }
        } catch (error) {
            console.error('Ошибка загрузки данных:', error.message);
        }
    }
    
    savePersistentData() {
        try {
            const data = {
                reports: Array.from(this.reports.entries()),
                defenders: Array.from(this.defenders.entries()),
                savedAt: new Date().toISOString()
            };
            fs.writeFileSync('data.json', JSON.stringify(data, null, 2), 'utf8');
        } catch (error) {
            console.error('Ошибка сохранения данных:', error.message);
        }
    }
    
    getStatistics() {
        const reportsByStatus = { new: 0, in_progress: 0, resolved: 0 };
        const defendersByStatus = { pending: 0, approved: 0, rejected: 0 };
        
        for (const report of this.reports.values()) {
            reportsByStatus[report.status] = (reportsByStatus[report.status] || 0) + 1;
        }
        
        for (const defender of this.defenders.values()) {
            defendersByStatus[defender.status] = (defendersByStatus[defender.status] || 0) + 1;
        }
        
        return {
            totalReports: this.reports.size,
            totalDefenders: this.defenders.size,
            reportsByStatus,
            defendersByStatus
        };
    }
}

// ============================================
// ЗАПУСК БОТА
// ============================================

// Проверка переменных
if (!SYSTEM_CONFIG.BOT_TOKEN || !SYSTEM_CONFIG.ADMIN_CHAT_ID) {
    console.error('❌ ОШИБКА: Установите BOT_TOKEN и ADMIN_CHAT_ID в Railway Variables');
    console.error('BOT_TOKEN:', SYSTEM_CONFIG.BOT_TOKEN ? 'Есть' : 'Нет');
    console.error('ADMIN_CHAT_ID:', SYSTEM_CONFIG.ADMIN_CHAT_ID ? 'Есть' : 'Нет');
    process.exit(1);
}

console.log('🚀 Запуск Bakelite Defence Bot v4.1');
console.log('📞 Техподдержка:', SYSTEM_CONFIG.TECH_SUPPORT);

// Запускаем бота
const bot = new BakeliteBotWithButtons();
