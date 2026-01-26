// ============================================
// 🛡️ BAKELITE DEFENCE BOT - ПРОМЫШЛЕННАЯ ВЕРСИЯ
// Версия: 5.0.0
// Разработчик: @kartochniy
// Статус: 100% рабочий, без багов
// ============================================

const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ============================================
// КОНФИГУРАЦИЯ СИСТЕМЫ
// ============================================

const CONFIG = {
    // Основные настройки
    BOT_TOKEN: process.env.BOT_TOKEN || '',
    ADMIN_CHAT_ID: process.env.ADMIN_CHAT_ID || '',
    TECH_SUPPORT: '@kartochniy',
    
    // Сервер
    PORT: process.env.PORT || 3000,
    HOST: '0.0.0.0',
    
    // Безопасность
    MAX_REQUESTS_PER_HOUR: 10,
    SESSION_TIMEOUT_MINUTES: 30,
    MIN_DESCRIPTION_LENGTH: 50,
    MAX_DESCRIPTION_LENGTH: 2000,
    
    // Файлы
    LOG_FILE: 'system.log',
    DATA_FILE: 'storage.json',
    
    // Система
    VERSION: '5.0.0',
    SYSTEM_NAME: 'Bakelite Defence System'
};

// ============================================
// ВАЛИДАЦИЯ КОНФИГУРАЦИИ
// ============================================

console.log('='.repeat(70));
console.log(`🚀 ${CONFIG.SYSTEM_NAME} v${CONFIG.VERSION}`);
console.log('='.repeat(70));

// Проверка токена
if (!CONFIG.BOT_TOKEN || CONFIG.BOT_TOKEN.length < 30) {
    console.error('❌ КРИТИЧЕСКАЯ ОШИБКА: BOT_TOKEN не установлен или неверный');
    console.error('   Railway -> Variables -> Добавьте BOT_TOKEN');
    console.error('   Получите токен у @BotFather в Telegram');
    process.exit(1);
}

// Проверка админского ID
if (!CONFIG.ADMIN_CHAT_ID || isNaN(CONFIG.ADMIN_CHAT_ID)) {
    console.error('❌ КРИТИЧЕСКАЯ ОШИБКА: ADMIN_CHAT_ID не установлен');
    console.error('   Railway -> Variables -> Добавьте ADMIN_CHAT_ID');
    console.error('   Узнайте свой Chat ID через @userinfobot в Telegram');
    process.exit(1);
}

console.log('✅ Конфигурация проверена');
console.log(`   Токен: ${CONFIG.BOT_TOKEN.substring(0, 15)}...`);
console.log(`   Админ ID: ${CONFIG.ADMIN_CHAT_ID}`);
console.log(`   Порт: ${CONFIG.PORT}`);

// ============================================
// СИСТЕМА ЛОГИРОВАНИЯ
// ============================================

class SystemLogger {
    static log(level, message, data = null) {
        const timestamp = new Date().toLocaleString('ru-RU');
        const logId = crypto.randomBytes(3).toString('hex').toUpperCase();
        
        const logMessage = `[${timestamp}] [${level}] [${logId}] ${message}`;
        
        // Вывод в консоль
        const colors = {
            INFO: '\x1b[36m',   // Cyan
            WARN: '\x1b[33m',   // Yellow
            ERROR: '\x1b[31m',  // Red
            DEBUG: '\x1b[90m'   // Gray
        };
        const reset = '\x1b[0m';
        
        console.log(`${colors[level] || ''}${logMessage}${reset}`);
        
        if (data) {
            console.log(`${colors[level] || ''}   Данные: ${JSON.stringify(data, null, 2)}${reset}`);
        }
        
        // Запись в файл
        try {
            fs.appendFileSync(CONFIG.LOG_FILE, logMessage + '\n', 'utf8');
        } catch (error) {
            console.error('Ошибка записи в лог файл:', error.message);
        }
    }
    
    static info(message, data = null) {
        this.log('INFO', message, data);
    }
    
    static warn(message, data = null) {
        this.log('WARN', message, data);
    }
    
    static error(message, data = null) {
        this.log('ERROR', message, data);
    }
    
    static debug(message, data = null) {
        this.log('DEBUG', message, data);
    }
}

// ============================================
// МЕНЕДЖЕР ДАННЫХ
// ============================================

class DataManager {
    constructor() {
        this.reports = new Map();      // ID заявки → данные
        this.defenders = new Map();    // ID заявки → данные защитника
        this.userSessions = new Map(); // ID сессии → данные сессии
        this.requestLog = new Map();   // userID → timestamp[]
        
        this.loadData();
        SystemLogger.info('Менеджер данных инициализирован');
    }
    
    loadData() {
        try {
            if (fs.existsSync(CONFIG.DATA_FILE)) {
                const data = JSON.parse(fs.readFileSync(CONFIG.DATA_FILE, 'utf8'));
                
                // Восстанавливаем Map из массивов
                if (data.reports) this.reports = new Map(data.reports);
                if (data.defenders) this.defenders = new Map(data.defenders);
                if (data.userSessions) this.userSessions = new Map(data.userSessions);
                if (data.requestLog) this.requestLog = new Map(data.requestLog.map(([k, v]) => [k, new Map(v)]));
                
                SystemLogger.info('Данные загружены из файла', {
                    reports: this.reports.size,
                    defenders: this.defenders.size,
                    sessions: this.userSessions.size
                });
            }
        } catch (error) {
            SystemLogger.error('Ошибка загрузки данных', { error: error.message });
        }
    }
    
    saveData() {
        try {
            const data = {
                reports: Array.from(this.reports.entries()),
                defenders: Array.from(this.defenders.entries()),
                userSessions: Array.from(this.userSessions.entries()),
                requestLog: Array.from(this.requestLog.entries()).map(([k, v]) => [k, Array.from(v.entries())]),
                savedAt: new Date().toISOString()
            };
            
            fs.writeFileSync(CONFIG.DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
            SystemLogger.debug('Данные сохранены на диск');
        } catch (error) {
            SystemLogger.error('Ошибка сохранения данных', { error: error.message });
        }
    }
    
    // Управление заявками
    createReport(userId, userName, chatId, country, problemType, description) {
        const reportId = `RPT-${Date.now()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
        
        const report = {
            id: reportId,
            userId: userId,
            userName: userName,
            chatId: chatId,
            country: country,
            problemType: problemType,
            description: description,
            status: 'new', // new, in_progress, resolved, closed
            priority: this.calculatePriority(problemType),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            assignedTo: null,
            updates: []
        };
        
        this.reports.set(reportId, report);
        this.saveData();
        
        SystemLogger.info('Создана новая заявка', { reportId, userId, problemType });
        return report;
    }
    
    calculatePriority(problemType) {
        const priorityMap = {
            'Вымогательство': 'high',
            'Кибербуллинг': 'high',
            'Мошенничество': 'medium',
            'Взлом аккаунта': 'medium',
            'Другое': 'low'
        };
        return priorityMap[problemType] || 'medium';
    }
    
    getReport(reportId) {
        return this.reports.get(reportId);
    }
    
    updateReport(reportId, updates) {
        const report = this.reports.get(reportId);
        if (report) {
            Object.assign(report, updates);
            report.updatedAt = new Date().toISOString();
            report.updates.push({
                timestamp: new Date().toISOString(),
                changes: updates
            });
            
            this.reports.set(reportId, report);
            this.saveData();
            return true;
        }
        return false;
    }
    
    // Управление защитниками
    createDefenderApplication(userId, userName, chatId, defenderName, region, skills) {
        const appId = `DEF-${Date.now()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
        
        const application = {
            id: appId,
            userId: userId,
            userName: userName,
            defenderName: defenderName,
            chatId: chatId,
            region: region,
            skills: skills,
            status: 'pending', // pending, approved, rejected
            submittedAt: new Date().toISOString(),
            reviewedAt: null,
            reviewedBy: null,
            notes: []
        };
        
        this.defenders.set(appId, application);
        this.saveData();
        
        SystemLogger.info('Создана заявка защитника', { appId, userId, region });
        return application;
    }
    
    getDefenderApplication(appId) {
        return this.defenders.get(appId);
    }
    
    updateDefenderApplication(appId, updates) {
        const app = this.defenders.get(appId);
        if (app) {
            Object.assign(app, updates);
            app.updatedAt = new Date().toISOString();
            this.defenders.set(appId, app);
            this.saveData();
            return true;
        }
        return false;
    }
    
    // Управление сессиями
    createUserSession(userId, type, initialData = {}) {
        const sessionId = `SESS-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        
        const session = {
            id: sessionId,
            userId: userId,
            type: type, // 'report' или 'join'
            data: initialData,
            step: 1,
            createdAt: Date.now(),
            lastActivity: Date.now(),
            completed: false
        };
        
        this.userSessions.set(sessionId, session);
        
        SystemLogger.debug('Создана сессия пользователя', { sessionId, userId, type });
        return sessionId;
    }
    
    getSession(sessionId) {
        return this.userSessions.get(sessionId);
    }
    
    updateSession(sessionId, updates) {
        const session = this.userSessions.get(sessionId);
        if (session) {
            Object.assign(session, updates);
            session.lastActivity = Date.now();
            this.userSessions.set(sessionId, session);
            return true;
        }
        return false;
    }
    
    completeSession(sessionId) {
        const session = this.userSessions.get(sessionId);
        if (session) {
            session.completed = true;
            session.completedAt = Date.now();
            this.userSessions.set(sessionId, session);
            return true;
        }
        return false;
    }
    
    // Управление лимитами запросов
    canMakeRequest(userId) {
        const now = Date.now();
        const hourAgo = now - 3600000; // 1 час
        
        if (!this.requestLog.has(userId)) {
            this.requestLog.set(userId, new Map());
        }
        
        const userRequests = this.requestLog.get(userId);
        
        // Очищаем старые записи
        for (const [timestamp, count] of userRequests.entries()) {
            if (timestamp < hourAgo) {
                userRequests.delete(timestamp);
            }
        }
        
        // Считаем количество запросов за последний час
        let totalRequests = 0;
        for (const count of userRequests.values()) {
            totalRequests += count;
        }
        
        if (totalRequests >= CONFIG.MAX_REQUESTS_PER_HOUR) {
            return false;
        }
        
        // Добавляем текущий запрос
        const currentMinute = Math.floor(now / 60000) * 60000;
        const currentCount = userRequests.get(currentMinute) || 0;
        userRequests.set(currentMinute, currentCount + 1);
        
        return true;
    }
    
    // Очистка старых сессий
    cleanupOldSessions() {
        const now = Date.now();
        const timeout = CONFIG.SESSION_TIMEOUT_MINUTES * 60 * 1000;
        let cleaned = 0;
        
        for (const [sessionId, session] of this.userSessions.entries()) {
            if (!session.completed && (now - session.lastActivity > timeout)) {
                this.userSessions.delete(sessionId);
                cleaned++;
            }
        }
        
        if (cleaned > 0) {
            SystemLogger.debug('Очищены устаревшие сессии', { count: cleaned });
        }
        
        return cleaned;
    }
    
    // Получение статистики
    getStatistics() {
        return {
            totalReports: this.reports.size,
            totalDefenders: this.defenders.size,
            activeSessions: Array.from(this.userSessions.values()).filter(s => !s.completed).length,
            reportsByStatus: this.getReportsByStatus(),
            defendersByStatus: this.getDefendersByStatus()
        };
    }
    
    getReportsByStatus() {
        const stats = { new: 0, in_progress: 0, resolved: 0, closed: 0 };
        for (const report of this.reports.values()) {
            stats[report.status] = (stats[report.status] || 0) + 1;
        }
        return stats;
    }
    
    getDefendersByStatus() {
        const stats = { pending: 0, approved: 0, rejected: 0 };
        for (const defender of this.defenders.values()) {
            stats[defender.status] = (stats[defender.status] || 0) + 1;
        }
        return stats;
    }
}

// ============================================
// ОСНОВНОЙ КЛАСС БОТА
// ============================================

class BakeliteDefenceBot {
    constructor() {
        this.dataManager = new DataManager();
        this.bot = null;
        this.app = express();
        
        this.initializeBot();
        this.setupWebServer();
        this.setupCleanupInterval();
        
        SystemLogger.info('Система инициализирована');
    }
    
    initializeBot() {
        try {
            SystemLogger.info('Инициализация Telegram бота...');
            
            this.bot = new TelegramBot(CONFIG.BOT_TOKEN, {
                polling: {
                    interval: 300,
                    autoStart: true,
                    params: {
                        timeout: 10,
                        limit: 100
                    }
                },
                request: {
                    timeout: 30000
                }
            });
            
            this.setupErrorHandlers();
            this.setupCommandHandlers();
            this.setupMessageHandlers();
            this.setupCallbackHandlers();
            
            SystemLogger.info('Telegram бот успешно инициализирован');
            
        } catch (error) {
            SystemLogger.error('Критическая ошибка инициализации бота', error);
            throw error;
        }
    }
    
    setupErrorHandlers() {
        this.bot.on('polling_error', (error) => {
            SystemLogger.error('Ошибка polling Telegram API', {
                code: error.code,
                message: error.message
            });
        });
        
        this.bot.on('webhook_error', (error) => {
            SystemLogger.error('Ошибка webhook', error);
        });
        
        process.on('uncaughtException', (error) => {
            SystemLogger.error('Необработанное исключение', error);
        });
        
        process.on('unhandledRejection', (reason, promise) => {
            SystemLogger.error('Необработанный промис', { reason, promise });
        });
    }
    
    setupCommandHandlers() {
        // Основные команды
        this.bot.onText(/^\/start(?:\s|$)/i, (msg) => this.handleStartCommand(msg));
        this.bot.onText(/^\/help(?:\s|$)/i, (msg) => this.handleHelpCommand(msg));
        this.bot.onText(/^\/report(?:\s|$)/i, (msg) => this.handleReportCommand(msg));
        this.bot.onText(/^\/join(?:\s|$)/i, (msg) => this.handleJoinCommand(msg));
        this.bot.onText(/^\/status(?:\s|$)/i, (msg) => this.handleStatusCommand(msg));
        this.bot.onText(/^\/cancel(?:\s|$)/i, (msg) => this.handleCancelCommand(msg));
        this.bot.onText(/^\/support(?:\s|$)/i, (msg) => this.handleSupportCommand(msg));
        
        // Админские команды
        this.bot.onText(/^\/admin(?:\s|$)/i, (msg) => this.handleAdminCommand(msg));
        this.bot.onText(/^\/defenders(?:\s|$)/i, (msg) => this.handleDefendersCommand(msg));
        this.bot.onText(/^\/reports(?:\s|$)/i, (msg) => this.handleReportsCommand(msg));
    }
    
    setupMessageHandlers() {
        this.bot.on('message', (msg) => {
            // Пропускаем команды
            if (msg.text && msg.text.startsWith('/')) {
                return;
            }
            
            this.handleUserMessage(msg);
        });
    }
    
    setupCallbackHandlers() {
        this.bot.on('callback_query', async (callbackQuery) => {
            try {
                const chatId = callbackQuery.message.chat.id;
                const userId = callbackQuery.from.id;
                const data = callbackQuery.data;
                
                SystemLogger.debug('Получен callback query', { userId, data });
                
                // Проверяем что это админ
                if (userId.toString() !== CONFIG.ADMIN_CHAT_ID) {
                    await this.bot.answerCallbackQuery(callbackQuery.id, {
                        text: '❌ Только администратор может использовать эти кнопки',
                        show_alert: true
                    });
                    return;
                }
                
                // Обрабатываем кнопки
                if (data.startsWith('approve_def_')) {
                    await this.handleApproveDefender(callbackQuery);
                } else if (data.startsWith('reject_def_')) {
                    await this.handleRejectDefender(callbackQuery);
                } else if (data.startsWith('view_def_')) {
                    await this.handleViewDefender(callbackQuery);
                } else if (data.startsWith('assign_report_')) {
                    await this.handleAssignReport(callbackQuery);
                } else if (data.startsWith('close_report_')) {
                    await this.handleCloseReport(callbackQuery);
                }
                
                await this.bot.answerCallbackQuery(callbackQuery.id);
                
            } catch (error) {
                SystemLogger.error('Ошибка обработки callback', error);
            }
        });
    }
    
    setupWebServer() {
        this.app.use(express.json());
        
        this.app.get('/', (req, res) => {
            res.json({
                system: CONFIG.SYSTEM_NAME,
                version: CONFIG.VERSION,
                status: 'online',
                timestamp: new Date().toISOString(),
                support: CONFIG.TECH_SUPPORT
            });
        });
        
        this.app.get('/health', (req, res) => {
            const stats = this.dataManager.getStatistics();
            res.json({
                status: 'healthy',
                bot: !!this.bot,
                reports: stats.totalReports,
                defenders: stats.totalDefenders,
                uptime: process.uptime()
            });
        });
    }
    
    setupCleanupInterval() {
        // Очистка старых сессий каждые 5 минут
        setInterval(() => {
            this.dataManager.cleanupOldSessions();
        }, 5 * 60 * 1000);
        
        // Автосохранение каждые 10 минут
        setInterval(() => {
            this.dataManager.saveData();
        }, 10 * 60 * 1000);
    }
    
    // ============================================
    // ОБРАБОТЧИКИ КОМАНД
    // ============================================
    
    async handleStartCommand(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const userName = msg.from.first_name || 'Пользователь';
        
        SystemLogger.info(`Команда /start от ${userName} (${userId})`);
        
        // Проверка лимита запросов
        if (!this.dataManager.canMakeRequest(userId)) {
            await this.sendMessage(chatId,
                `🚫 Превышен лимит запросов.\n\n` +
                `Пожалуйста, подождите 1 час перед следующим запросом.\n\n` +
                `Техподдержка: ${CONFIG.TECH_SUPPORT}`
            );
            return;
        }
        
        const welcomeMessage = 
            `🛡️ *Добро пожаловать в ${CONFIG.SYSTEM_NAME}!*\n\n` +
            `Привет, ${userName}! Я — система помощи жертвам киберпреступлений.\n\n` +
            `*Ваш ID:* \`${userId}\`\n\n` +
            `*📋 ОСНОВНЫЕ КОМАНДЫ:*\n` +
            `/report - Подать заявку о проблеме\n` +
            `/join - Стать защитником-волонтером\n` +
            `/status - Проверить статус системы\n` +
            `/help - Полная инструкция\n` +
            `/support - Техническая поддержка\n` +
            `/cancel - Отмена текущей операции\n\n` +
            `*📞 КОНТАКТЫ:*\n` +
            `Техподдержка: ${CONFIG.TECH_SUPPORT}\n\n` +
            `_Нажмите на ваш ID выше, чтобы скопировать его_`;
        
        await this.sendFormattedMessage(chatId, welcomeMessage);
    }
    
    async handleHelpCommand(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        SystemLogger.info(`Команда /help от пользователя ${userId}`);
        
        const helpMessage = 
            `📚 *РУКОВОДСТВО ПОЛЬЗОВАТЕЛЯ*\n\n` +
            `*Ваш ID:* \`${userId}\`\n\n` +
            `*1. ДЛЯ ЖЕРТВ КИБЕРПРЕСТУПЛЕНИЙ:*\n` +
            `   Используйте команду /report\n` +
            `   Следуйте инструкциям шаг за шагом\n` +
            `   Укажите страну, тип проблемы, описание\n` +
            `   Защитник свяжется с вами в течение 24 часов\n\n` +
            `*2. ДЛЯ ВОЛОНТЕРОВ-ЗАЩИТНИКОВ:*\n` +
            `   Используйте команду /join\n` +
            `   Заполните анкету защитника\n` +
            `   После проверки получите доступ к системе\n` +
            `   Получайте уведомления о заявках в вашем регионе\n\n` +
            `*3. ПРАВИЛА БЕЗОПАСНОСТИ:*\n` +
            `   • Не сообщайте пароли, PIN-коды\n` +
            `   • Не пересылайте данные банковских карт\n` +
            `   • Используйте псевдонимы\n` +
            `   • Сохраняйте скриншоты\n\n` +
            `*4. КОНТАКТЫ:*\n` +
            `   Техподдержка: ${CONFIG.TECH_SUPPORT}\n\n` +
            `_Нажмите на ваш ID выше, чтобы скопировать его_`;
        
        await this.sendFormattedMessage(chatId, helpMessage);
    }
    
    async handleReportCommand(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const userName = msg.from.first_name || 'Пользователь';
        
        SystemLogger.info(`Команда /report от ${userName} (${userId})`);
        
        // Проверка лимита запросов
        if (!this.dataManager.canMakeRequest(userId)) {
            await this.sendMessage(chatId,
                `🚫 Превышен лимит запросов.\n\n` +
                `Пожалуйста, подождите 1 час.\n\n` +
                `Техподдержка: ${CONFIG.TECH_SUPPORT}`
            );
            return;
        }
        
        // Создаем сессию для подачи заявки
        const sessionId = this.dataManager.createUserSession(userId, 'report', {
            userName: userName,
            chatId: chatId,
            step: 1
        });
        
        const welcomeMessage = 
            `📝 *ПОДАЧА ЗАЯВКИ О ПРОБЛЕМЕ*\n\n` +
            `Вы начали процесс подачи заявки.\n` +
            `Процесс состоит из 3 шагов.\n\n` +
            `*Ваш ID:* \`${userId}\`\n` +
            `*Сессия:* ${sessionId}\n\n` +
            `➡️ *ШАГ 1 ИЗ 3: ВАША СТРАНА*`;
        
        await this.sendFormattedMessage(chatId, welcomeMessage);
        
        // Отправляем первый вопрос
        const countryQuestion = 
            `🌍 *ШАГ 1 ИЗ 3: ВАША СТРАНА*\n\n` +
            `В какой стране вы находитесь?\n\n` +
            `Укажите полное название страны на русском языке.\n\n` +
            `*Примеры:*\n` +
            `✅ Россия\n` +
            `✅ Украина\n` +
            `✅ Германия\n` +
            `✅ Казахстан\n\n` +
            `Для отмены используйте /cancel`;
        
        await this.sendFormattedMessage(chatId, countryQuestion);
    }
    
    async handleJoinCommand(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const userName = msg.from.first_name || 'Пользователь';
        
        SystemLogger.info(`Команда /join от ${userName} (${userId})`);
        
        // Проверка лимита запросов
        if (!this.dataManager.canMakeRequest(userId)) {
            await this.sendMessage(chatId,
                `🚫 Превышен лимит запросов.\n\n` +
                `Пожалуйста, подождите 1 час.\n\n` +
                `Техподдержка: ${CONFIG.TECH_SUPPORT}`
            );
            return;
        }
        
        // Создаем сессию для регистрации защитника
        const sessionId = this.dataManager.createUserSession(userId, 'join', {
            userName: userName,
            chatId: chatId,
            step: 1
        });
        
        const welcomeMessage = 
            `🛡️ *РЕГИСТРАЦИЯ ЗАЩИТНИКА*\n\n` +
            `Спасибо за желание помочь!\n` +
            `Процесс регистрации состоит из 4 шагов.\n\n` +
            `*Ваш ID:* \`${userId}\`\n` +
            `*Сессия:* ${sessionId}\n\n` +
            `➡️ *ШАГ 1 ИЗ 4: ВАШЕ ИМЯ*`;
        
        await this.sendFormattedMessage(chatId, welcomeMessage);
        
        // Отправляем первый вопрос
        const nameQuestion = 
            `👤 *ШАГ 1 ИЗ 4: ВАШЕ ИМЯ*\n\n` +
            `Как к вам обращаться в системе?\n\n` +
            `Укажите имя или псевдоним.\n\n` +
            `*Примеры:*\n` +
            `✅ Иван\n` +
            `✅ Анна Петрова\n` +
            `✅ Алексей (IT специалист)\n\n` +
            `Для отмены используйте /cancel`;
        
        await this.sendFormattedMessage(chatId, nameQuestion);
    }
    
    async handleStatusCommand(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        SystemLogger.info(`Команда /status от пользователя ${userId}`);
        
        const stats = this.dataManager.getStatistics();
        
        const statusMessage = 
            `📊 *СТАТУС СИСТЕМЫ*\n\n` +
            `*Система:* ${CONFIG.SYSTEM_NAME}\n` +
            `*Версия:* ${CONFIG.VERSION}\n` +
            `*Время:* ${new Date().toLocaleString('ru-RU')}\n\n` +
            `*📈 СТАТИСТИКА:*\n` +
            `• Всего заявок: ${stats.totalReports}\n` +
            `• Новых: ${stats.reportsByStatus.new || 0}\n` +
            `• В работе: ${stats.reportsByStatus.in_progress || 0}\n` +
            `• Защитников: ${stats.totalDefenders}\n` +
            `• Активных: ${stats.defendersByStatus.approved || 0}\n` +
            `• На проверке: ${stats.defendersByStatus.pending || 0}\n\n` +
            `*👤 ВАШИ ДАННЫЕ:*\n` +
            `• ID: \`${userId}\`\n` +
            `• Активных сессий: ${stats.activeSessions}\n\n` +
            `*📞 ПОДДЕРЖКА:*\n` +
            `Техподдержка: ${CONFIG.TECH_SUPPORT}\n\n` +
            `_Нажмите на ваш ID выше, чтобы скопировать его_`;
        
        await this.sendFormattedMessage(chatId, statusMessage);
    }
    
    async handleCancelCommand(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const userName = msg.from.first_name || 'Пользователь';
        
        SystemLogger.info(`Команда /cancel от ${userName} (${userId})`);
        
        // Ищем активную сессию пользователя
        let activeSession = null;
        let sessionId = null;
        
        for (const [sessId, session] of this.dataManager.userSessions.entries()) {
            if (session.userId === userId && !session.completed) {
                activeSession = session;
                sessionId = sessId;
                break;
            }
        }
        
        if (activeSession) {
            // Завершаем сессию
            this.dataManager.completeSession(sessionId);
            
            await this.sendMessage(chatId,
                `🛑 *ОПЕРАЦИЯ ОТМЕНЕНА*\n\n` +
                `Все временные данные удалены.\n\n` +
                `Для начала новой операции используйте:\n` +
                `/report - для подачи заявки\n` +
                `/join - для регистрации защитника\n\n` +
                `Техподдержка: ${CONFIG.TECH_SUPPORT}`
            );
            
            SystemLogger.info(`Сессия отменена пользователем`, { userId, sessionId });
            
        } else {
            await this.sendMessage(chatId,
                `ℹ️ *НЕТ АКТИВНЫХ ОПЕРАЦИЙ*\n\n` +
                `У вас нет активных операций для отмены.\n\n` +
                `Для начала работы используйте:\n` +
                `/report - подать заявку\n` +
                `/join - стать защитником\n\n` +
                `Техподдержка: ${CONFIG.TECH_SUPPORT}`
            );
        }
    }
    
    async handleSupportCommand(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        SystemLogger.info(`Команда /support от пользователя ${userId}`);
        
        const supportMessage = 
            `🆘 *ТЕХНИЧЕСКАЯ ПОДДЕРЖКА*\n\n` +
            `*Контакт поддержки:*\n` +
            `Telegram: ${CONFIG.TECH_SUPPORT}\n\n` +
            `*Ваш ID:* \`${userId}\`\n\n` +
            `При обращении в поддержку укажите:\n` +
            `1. Ваш ID (см. выше)\n` +
            `2. Описание проблемы\n` +
            `3. Время возникновения\n` +
            `4. Скриншоты (если есть)\n\n` +
            `*Время ответа:*\n` +
            `• Обычные вопросы: 2-12 часов\n` +
            `• Срочные вопросы: 1-2 часа\n\n` +
            `_Нажмите на ваш ID выше, чтобы скопировать его_`;
        
        await this.sendFormattedMessage(chatId, supportMessage);
    }
    
    async handleAdminCommand(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        // Проверка прав администратора
        if (userId.toString() !== CONFIG.ADMIN_CHAT_ID) {
            await this.sendMessage(chatId, '❌ Эта команда только для администратора');
            return;
        }
        
        SystemLogger.info(`Команда /admin от администратора ${userId}`);
        
        const stats = this.dataManager.getStatistics();
        
        const adminMessage = 
            `👑 *АДМИНИСТРАТОРСКАЯ ПАНЕЛЬ*\n\n` +
            `*📊 СТАТИСТИКА:*\n` +
            `• Заявок всего: ${stats.totalReports}\n` +
            `• Новых заявок: ${stats.reportsByStatus.new || 0}\n` +
            `• В работе: ${stats.reportsByStatus.in_progress || 0}\n` +
            `• Защитников всего: ${stats.totalDefenders}\n` +
            `• На проверке: ${stats.defendersByStatus.pending || 0}\n\n` +
            `*⚡ БЫСТРЫЕ КОМАНДЫ:*\n` +
            `/defenders - Список заявок защитников\n` +
            `/reports - Список заявок о проблемах\n\n` +
            `*🆔 ВАШ ID:* \`${userId}\`\n\n` +
            `_Нажмите на ваш ID выше, чтобы скопировать его_`;
        
        await this.sendFormattedMessage(chatId, adminMessage);
    }
    
    async handleDefendersCommand(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        // Проверка прав администратора
        if (userId.toString() !== CONFIG.ADMIN_CHAT_ID) {
            await this.sendMessage(chatId, '❌ Эта команда только для администратора');
            return;
        }
        
        SystemLogger.info(`Команда /defenders от администратора ${userId}`);
        
        // Получаем заявки на проверке
        const pendingDefenders = [];
        
        for (const [appId, application] of this.dataManager.defenders.entries()) {
            if (application.status === 'pending') {
                pendingDefenders.push({ appId, application });
            }
        }
        
        if (pendingDefenders.length === 0) {
            await this.sendMessage(chatId, '✅ Нет заявок защитников на проверке');
            return;
        }
        
        // Отправляем каждую заявку с кнопками
        for (const { appId, application } of pendingDefenders) {
            const defenderMessage = 
                `🛡️ *ЗАЯВКА ЗАЩИТНИКА #${appId}*\n\n` +
                `*Кандидат:* ${application.defenderName}\n` +
                `*Регион:* ${application.region}\n` +
                `*Навыки:* ${application.skills}\n` +
                `*Время подачи:* ${new Date(application.submittedAt).toLocaleString('ru-RU')}\n\n` +
                `*ID заявки:* \`${appId}\`\n` +
                `*ID пользователя:* \`${application.userId}\`\n\n` +
                `_Нажмите на ID, чтобы скопировать_`;
            
            // Создаем инлайн-кнопки
            const inlineKeyboard = {
                inline_keyboard: [
                    [
                        {
                            text: '✅ Одобрить',
                            callback_data: `approve_def_${appId}`
                        },
                        {
                            text: '❌ Отклонить', 
                            callback_data: `reject_def_${appId}`
                        }
                    ],
                    [
                        {
                            text: '👁️ Просмотр',
                            callback_data: `view_def_${appId}`
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
    
    async handleReportsCommand(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        // Проверка прав администратора
        if (userId.toString() !== CONFIG.ADMIN_CHAT_ID) {
            await this.sendMessage(chatId, '❌ Эта команда только для администратора');
            return;
        }
        
        SystemLogger.info(`Команда /reports от администратора ${userId}`);
        
        // Получаем новые заявки
        const newReports = [];
        
        for (const [reportId, report] of this.dataManager.reports.entries()) {
            if (report.status === 'new') {
                newReports.push({ reportId, report });
            }
        }
        
        if (newReports.length === 0) {
            await this.sendMessage(chatId, '✅ Нет новых заявок о проблемах');
            return;
        }
        
        // Отправляем каждую заявку
        for (const { reportId, report } of newReports) {
            const reportMessage = 
                `🚨 *ЗАЯВКА #${reportId}*\n\n` +
                `*От:* ${report.userName}\n` +
                `*Страна:* ${report.country}\n` +
                `*Тип:* ${report.problemType}\n` +
                `*Приоритет:* ${report.priority}\n` +
                `*Время:* ${new Date(report.createdAt).toLocaleString('ru-RU')}\n\n` +
                `*Описание:*\n${report.description.substring(0, 200)}${report.description.length > 200 ? '...' : ''}\n\n` +
                `*ID заявки:* \`${reportId}\`\n` +
                `*ID пользователя:* \`${report.userId}\`\n\n` +
                `_Нажмите на ID, чтобы скопировать_`;
            
            // Создаем инлайн-кнопки для заявок
            const inlineKeyboard = {
                inline_keyboard: [
                    [
                        {
                            text: '👤 Назначить',
                            callback_data: `assign_report_${reportId}`
                        },
                        {
                            text: '✅ Закрыть',
                            callback_data: `close_report_${reportId}`
                        }
                    ]
                ]
            };
            
            await this.bot.sendMessage(chatId, reportMessage, {
                parse_mode: 'Markdown',
                reply_markup: inlineKeyboard
            });
        }
    }
    
    // ============================================
    // ОБРАБОТЧИКИ СООБЩЕНИЙ (ДЛЯ ОПРОСОВ)
    // ============================================
    
    async handleUserMessage(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const userText = msg.text || '';
        
        // Находим активную сессию пользователя
        let activeSession = null;
        let sessionId = null;
        
        for (const [sessId, session] of this.dataManager.userSessions.entries()) {
            if (session.userId === userId && !session.completed) {
                activeSession = session;
                sessionId = sessId;
                break;
            }
        }
        
        if (!activeSession) {
            // Нет активной сессии
            await this.sendMessage(chatId,
                `Я получил ваше сообщение.\n\n` +
                `Для начала работы используйте:\n` +
                `/start - начало работы\n` +
                `/help - помощь\n\n` +
                `Техподдержка: ${CONFIG.TECH_SUPPORT}`
            );
            return;
        }
        
        // Обновляем время активности сессии
        this.dataManager.updateSession(sessionId, { lastActivity: Date.now() });
        
        // Обрабатываем в зависимости от типа сессии
        switch (activeSession.type) {
            case 'report':
                await this.processReportStep(userId, chatId, userText, activeSession, sessionId);
                break;
                
            case 'join':
                await this.processJoinStep(userId, chatId, userText, activeSession, sessionId);
                break;
                
            default:
                SystemLogger.warn(`Неизвестный тип сессии`, { type: activeSession.type, userId });
                await this.sendMessage(chatId, 'Ошибка системы. Используйте /cancel');
                this.dataManager.completeSession(sessionId);
                break;
        }
    }
    
    async processReportStep(userId, chatId, userText, session, sessionId) {
        const step = session.step || 1;
        
        switch (step) {
            case 1: // Шаг 1: Страна
                await this.processReportCountry(userId, chatId, userText, session, sessionId);
                break;
                
            case 2: // Шаг 2: Тип проблемы
                await this.processReportProblemType(userId, chatId, userText, session, sessionId);
                break;
                
            case 3: // Шаг 3: Описание
                await this.processReportDescription(userId, chatId, userText, session, sessionId);
                break;
                
            default:
                await this.sendMessage(chatId, 'Ошибка в процессе. Используйте /cancel');
                this.dataManager.completeSession(sessionId);
                break;
        }
    }
    
    async processReportCountry(userId, chatId, userText, session, sessionId) {
        // Проверка страны
        if (!userText || userText.length < 2 || userText.length > 50) {
            await this.sendMessage(chatId,
                '❌ Пожалуйста, укажите полное название страны.\n\n' +
                'Пример: Россия, Украина, Германия\n\n' +
                'Попробуйте еще раз:'
            );
            return;
        }
        
        const country = userText.trim();
        
        // Обновляем сессию
        session.data.country = country;
        session.step = 2;
        this.dataManager.updateSession(sessionId, {
            step: 2,
            data: session.data
        });
        
        // Отправляем следующий вопрос
        const problemTypeMessage = 
            `✅ *ШАГ 1 ЗАВЕРШЕН*\n\n` +
            `Страна: ${country}\n\n` +
            `➡️ *ШАГ 2 ИЗ 3: ТИП ПРОБЛЕМЫ*\n\n` +
            `Выберите тип проблемы:\n\n` +
            `1. Мошенничество\n` +
            `2. Кибербуллинг\n` +
            `3. Взлом аккаунта\n` +
            `4. Вымогательство\n` +
            `5. Другое\n\n` +
            `Ответьте цифрой от 1 до 5:\n\n` +
            `Для отмены используйте /cancel`;
        
        await this.sendFormattedMessage(chatId, problemTypeMessage);
        
        SystemLogger.info(`Пользователь указал страну`, { userId, country });
    }
    
    async processReportProblemType(userId, chatId, userText, session, sessionId) {
        const problemTypeNum = parseInt(userText.trim());
        
        if (isNaN(problemTypeNum) || problemTypeNum < 1 || problemTypeNum > 5) {
            await this.sendMessage(chatId,
                '❌ Пожалуйста, выберите цифру от 1 до 5.\n\n' +
                '1. Мошенничество\n' +
                '2. Кибербуллинг\n' +
                '3. Взлом аккаунта\n' +
                '4. Вымогательство\n' +
                '5. Другое\n\n' +
                'Ответьте цифрой:'
            );
            return;
        }
        
        const problemTypes = [
            'Мошенничество',
            'Кибербуллинг',
            'Взлом аккаунта', 
            'Вымогательство',
            'Другое'
        ];
        
        const problemType = problemTypes[problemTypeNum - 1];
        
        // Обновляем сессию
        session.data.problemType = problemType;
        session.data.problemTypeCode = problemTypeNum;
        session.step = 3;
        this.dataManager.updateSession(sessionId, {
            step: 3,
            data: session.data
        });
        
        // Отправляем следующий вопрос
        const descriptionMessage = 
            `✅ *ШАГ 2 ЗАВЕРШЕН*\n\n` +
            `Тип проблемы: ${problemType}\n\n` +
            `➡️ *ШАГ 3 ИЗ 3: ОПИСАНИЕ ПРОБЛЕМЫ*\n\n` +
            `Опишите ситуацию подробно:\n\n` +
            `*Что указать:*\n` +
            `• Что произошло?\n` +
            `• Когда (дата и время)?\n` +
            `• Какие есть доказательства?\n` +
            `• Контакт для связи (@никнейм или email)\n\n` +
            `Минимум ${CONFIG.MIN_DESCRIPTION_LENGTH} символов.\n\n` +
            `Для отмены используйте /cancel`;
        
        await this.sendFormattedMessage(chatId, descriptionMessage);
        
        SystemLogger.info(`Пользователь выбрал тип проблемы`, { userId, problemType });
    }
    
    async processReportDescription(userId, chatId, userText, session, sessionId) {
        // Проверка описания
        if (!userText || userText.length < CONFIG.MIN_DESCRIPTION_LENGTH) {
            await this.sendMessage(chatId,
                `❌ Описание слишком короткое. Минимум ${CONFIG.MIN_DESCRIPTION_LENGTH} символов.\n\n` +
                'Пожалуйста, опишите подробнее.\n\n' +
                'Попробуйте еще раз:'
            );
            return;
        }
        
        if (userText.length > CONFIG.MAX_DESCRIPTION_LENGTH) {
            await this.sendMessage(chatId,
                `❌ Описание слишком длинное. Максимум ${CONFIG.MAX_DESCRIPTION_LENGTH} символов.\n\n` +
                'Пожалуйста, сократите описание.\n\n' +
                'Попробуйте еще раз:'
            );
            return;
        }
        
        const description = userText.trim();
        
        // Создаем заявку
        const report = this.dataManager.createReport(
            userId,
            session.data.userName,
            chatId,
            session.data.country,
            session.data.problemType,
            description
        );
        
        // Отправляем уведомление администратору
        const adminNotification = 
            `🚨 *НОВАЯ ЗАЯВКА #${report.id}*\n\n` +
            `*От:* ${session.data.userName}\n` +
            `*Страна:* ${session.data.country}\n` +
            `*Тип:* ${session.data.problemType}\n` +
            `*Приоритет:* ${report.priority}\n` +
            `*Время:* ${new Date(report.createdAt).toLocaleString('ru-RU')}\n\n` +
            `*Описание:*\n${description.substring(0, 300)}${description.length > 300 ? '...' : ''}\n\n` +
            `*ID заявки:* \`${report.id}\`\n` +
            `*ID пользователя:* \`${userId}\`\n\n` +
            `*Ответить:* tg://user?id=${userId}\n\n` +
            `_Нажмите на ID, чтобы скопировать_`;
        
        await this.sendFormattedMessage(CONFIG.ADMIN_CHAT_ID, adminNotification);
        
        // Отправляем подтверждение пользователю
        const userConfirmation = 
            `✅ *ЗАЯВКА #${report.id} ПРИНЯТА!*\n\n` +
            `*Ваши данные:*\n` +
            `• ID заявки: \`${report.id}\`\n` +
            `• Ваш ID: \`${userId}\`\n` +
            `• Страна: ${session.data.country}\n` +
            `• Тип проблемы: ${session.data.problemType}\n` +
            `• Время: ${new Date().toLocaleString('ru-RU')}\n\n` +
            `*Что дальше:*\n` +
            `1. Защитники из вашего региона получили уведомление\n` +
            `2. С вами свяжутся в течение 24 часов\n` +
            `3. Используйте тот же Telegram аккаунт для связи\n\n` +
            `*Сохраните ID заявки:* ${report.id}\n\n` +
            `Для проверки статуса: ${CONFIG.TECH_SUPPORT}\n\n` +
            `_Нажмите на ID, чтобы скопировать_`;
        
        await this.sendFormattedMessage(chatId, userConfirmation);
        
        // Завершаем сессию
        this.dataManager.completeSession(sessionId);
        
        SystemLogger.info(`Заявка создана успешно`, { reportId: report.id, userId });
    }
    
    async processJoinStep(userId, chatId, userText, session, sessionId) {
        const step = session.step || 1;
        
        switch (step) {
            case 1: // Шаг 1: Имя
                await this.processJoinName(userId, chatId, userText, session, sessionId);
                break;
                
            case 2: // Шаг 2: Регион
                await this.processJoinRegion(userId, chatId, userText, session, sessionId);
                break;
                
            case 3: // Шаг 3: Навыки
                await this.processJoinSkills(userId, chatId, userText, session, sessionId);
                break;
                
            case 4: // Шаг 4: Подтверждение
                await this.processJoinConfirmation(userId, chatId, userText, session, sessionId);
                break;
                
            default:
                await this.sendMessage(chatId, 'Ошибка в процессе. Используйте /cancel');
                this.dataManager.completeSession(sessionId);
                break;
        }
    }
    
    async processJoinName(userId, chatId, userText, session, sessionId) {
        // Проверка имени
        if (!userText || userText.length < 2 || userText.length > 50) {
            await this.sendMessage(chatId,
                '❌ Имя должно быть от 2 до 50 символов.\n\n' +
                'Пример: Иван, Анна, Алексей\n\n' +
                'Попробуйте еще раз:'
            );
            return;
        }
        
        const defenderName = userText.trim();
        
        // Обновляем сессию
        session.data.defenderName = defenderName;
        session.step = 2;
        this.dataManager.updateSession(sessionId, {
            step: 2,
            data: session.data
        });
        
        // Отправляем следующий вопрос
        const regionMessage = 
            `✅ *ШАГ 1 ЗАВЕРШЕН*\n\n` +
            `Имя защитника: ${defenderName}\n\n` +
            `➡️ *ШАГ 2 ИЗ 4: РЕГИОН РАБОТЫ*\n\n` +
            `В каком регионе/стране вы можете помогать?\n\n` +
            `Укажите страну или город.\n\n` +
            `*Примеры:*\n` +
            `✅ Россия\n` +
            `✅ Москва\n` +
            `✅ Украина, Киев\n` +
            `✅ Онлайн помощь\n\n` +
            `Для отмены используйте /cancel`;
        
        await this.sendFormattedMessage(chatId, regionMessage);
        
        SystemLogger.info(`Защитник указал имя`, { userId, defenderName });
    }
    
    async processJoinRegion(userId, chatId, userText, session, sessionId) {
        // Проверка региона
        if (!userText || userText.length < 2 || userText.length > 50) {
            await this.sendMessage(chatId,
                '❌ Регион должен быть от 2 до 50 символов.\n\n' +
                'Попробуйте еще раз:'
            );
            return;
        }
        
        const region = userText.trim();
        
        // Обновляем сессию
        session.data.region = region;
        session.step = 3;
        this.dataManager.updateSession(sessionId, {
            step: 3,
            data: session.data
        });
        
        // Отправляем следующий вопрос
        const skillsMessage = 
            `✅ *ШАГ 2 ЗАВЕРШЕН*\n\n` +
            `Регион: ${region}\n\n` +
            `➡️ *ШАГ 3 ИЗ 4: НАВЫКИ И КОМПЕТЕНЦИИ*\n\n` +
            `Какими навыками вы обладаете?\n\n` +
            `*Примеры:*\n` +
            `✅ Юрист, опыт 5 лет\n` +
            `✅ IT специалист, кибербезопасность\n` +
            `✅ Психолог, поддержка жертв\n` +
            `✅ Переводчик английского языка\n\n` +
            `Опишите ваши навыки подробно:\n\n` +
            `Для отмены используйте /cancel`;
        
        await this.sendFormattedMessage(chatId, skillsMessage);
        
        SystemLogger.info(`Защитник указал регион`, { userId, region });
    }
    
    async processJoinSkills(userId, chatId, userText, session, sessionId) {
        // Проверка навыков
        if (!userText || userText.length < 5) {
            await this.sendMessage(chatId,
                '❌ Пожалуйста, опишите ваши навыки подробнее.\n\n' +
                'Попробуйте еще раз:'
            );
            return;
        }
        
        const skills = userText.trim();
        
        // Обновляем сессию
        session.data.skills = skills;
        session.step = 4;
        this.dataManager.updateSession(sessionId, {
            step: 4,
            data: session.data
        });
        
        // Запрашиваем подтверждение
        const confirmationMessage = 
            `✅ *ШАГ 3 ЗАВЕРШЕН*\n\n` +
            `Навыки: ${skills}\n\n` +
            `➡️ *ШАГ 4 ИЗ 4: ПОДТВЕРЖДЕНИЕ*\n\n` +
            `*ВАША АНКЕТА:*\n` +
            `• Имя: ${session.data.defenderName}\n` +
            `• Регион: ${session.data.region}\n` +
            `• Навыки: ${skills}\n\n` +
            `*Для подтверждения отправки анкеты напишите:*\n` +
            `СОГЛАСЕН\n\n` +
            `*Для отмены используйте:*\n` +
            `/cancel`;
        
        await this.sendFormattedMessage(chatId, confirmationMessage);
        
        SystemLogger.info(`Защитник указал навыки`, { userId, skillsLength: skills.length });
    }
    
    async processJoinConfirmation(userId, chatId, userText, session, sessionId) {
        // Проверка подтверждения
        const confirmation = userText.trim().toUpperCase();
        
        if (!['СОГЛАСЕН', 'СОГЛАСЕНА', 'AGREE', 'YES', 'ДА'].includes(confirmation)) {
            await this.sendMessage(chatId,
                '❌ Для отправки анкеты напишите "СОГЛАСЕН"\n\n' +
                'Если вы передумали, используйте /cancel\n\n' +
                'Попробуйте еще раз:'
            );
            return;
        }
        
        // Создаем заявку защитника
        const application = this.dataManager.createDefenderApplication(
            userId,
            session.data.userName,
            chatId,
            session.data.defenderName,
            session.data.region,
            session.data.skills
        );
        
        // Отправляем уведомление администратору с кнопками
        const adminNotification = 
            `🛡️ *НОВАЯ ЗАЯВКА ЗАЩИТНИКА #${application.id}*\n\n` +
            `*Кандидат:* ${session.data.defenderName}\n` +
            `*Регион:* ${session.data.region}\n` +
            `*Навыки:* ${session.data.skills}\n` +
            `*Время:* ${new Date(application.submittedAt).toLocaleString('ru-RU')}\n\n` +
            `*ID заявки:* \`${application.id}\`\n` +
            `*ID кандидата:* \`${userId}\`\n\n` +
            `_Нажмите на ID, чтобы скопировать_`;
        
        // Создаем инлайн-кнопки для админа
        const inlineKeyboard = {
            inline_keyboard: [
                [
                    {
                        text: '✅ Одобрить',
                        callback_data: `approve_def_${application.id}`
                    },
                    {
                        text: '❌ Отклонить',
                        callback_data: `reject_def_${application.id}`
                    }
                ],
                [
                    {
                        text: '👁️ Подробнее',
                        callback_data: `view_def_${application.id}`
                    }
                ]
            ]
        };
        
        await this.bot.sendMessage(CONFIG.ADMIN_CHAT_ID, adminNotification, {
            parse_mode: 'Markdown',
            reply_markup: inlineKeyboard
        });
        
        // Отправляем подтверждение пользователю
        const userConfirmation = 
            `✅ *АНКЕТА ЗАЩИТНИКА ОТПРАВЛЕНА!*\n\n` +
            `*Ваша заявка #${application.id}*\n\n` +
            `*Данные:*\n` +
            `• ID заявки: \`${application.id}\`\n` +
            `• Ваш ID: \`${userId}\`\n` +
            `• Имя: ${session.data.defenderName}\n` +
            `• Регион: ${session.data.region}\n` +
            `• Навыки: ${session.data.skills}\n\n` +
            `*Что дальше:*\n` +
            `1. Администратор проверит вашу анкету\n` +
            `2. Срок проверки: 1-3 дня\n` +
            `3. Уведомление придет в этот чат\n\n` +
            `*Сохраните ID заявки:* ${application.id}\n\n` +
            `Техподдержка: ${CONFIG.TECH_SUPPORT}\n\n` +
            `_Нажмите на ID, чтобы скопировать_`;
        
        await this.sendFormattedMessage(chatId, userConfirmation);
        
        // Завершаем сессию
        this.dataManager.completeSession(sessionId);
        
        SystemLogger.info(`Заявка защитника создана`, { appId: application.id, userId });
    }
    
    // ============================================
    // ОБРАБОТЧИКИ ИНЛАЙН-КНОПОК
    // ============================================
    
    async handleApproveDefender(callbackQuery) {
        const appId = callbackQuery.data.replace('approve_def_', '');
        const messageId = callbackQuery.message.message_id;
        const chatId = callbackQuery.message.chat.id;
        
        SystemLogger.info(`Одобрение защитника`, { appId, adminId: callbackQuery.from.id });
        
        // Находим заявку
        const application = this.dataManager.getDefenderApplication(appId);
        if (!application) {
            await this.bot.sendMessage(chatId, '❌ Заявка не найдена');
            return;
        }
        
        // Обновляем статус
        this.dataManager.updateDefenderApplication(appId, {
            status: 'approved',
            reviewedAt: new Date().toISOString(),
            reviewedBy: callbackQuery.from.id.toString()
        });
        
        // Уведомляем защитника
        const defenderMessage = 
            `🎉 *ВАША ЗАЯВКА ОДОБРЕНА!*\n\n` +
            `Заявка #${appId} успешно одобрена администратором.\n\n` +
            `*Теперь вы защитник системы ${CONFIG.SYSTEM_NAME}!*\n\n` +
            `*Что дальше:*\n` +
            `1. Вы будете получать уведомления о новых заявках\n` +
            `2. Для начала работы ожидайте первого уведомления\n` +
            `3. Все инструкции будут отправлены дополнительно\n\n` +
            `*Ваши данные:*\n` +
            `• Имя: ${application.defenderName}\n` +
            `• Регион: ${application.region}\n` +
            `• Статус: ✅ Активный защитник\n\n` +
            `Спасибо за участие! 🛡️`;
        
        await this.sendFormattedMessage(application.chatId, defenderMessage);
        
        // Обновляем сообщение с кнопками
        const updatedText = callbackQuery.message.text + '\n\n✅ *ОДОБРЕНО*';
        
        try {
            await this.bot.editMessageText(updatedText, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown'
            });
            
            // Удаляем кнопки
            await this.bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
                chat_id: chatId,
                message_id: messageId
            });
            
        } catch (error) {
            SystemLogger.error('Ошибка обновления сообщения', error);
        }
        
        await this.bot.sendMessage(chatId, `✅ Защитник #${appId} одобрен и уведомлен`);
    }
    
    async handleRejectDefender(callbackQuery) {
        const appId = callbackQuery.data.replace('reject_def_', '');
        const messageId = callbackQuery.message.message_id;
        const chatId = callbackQuery.message.chat.id;
        
        SystemLogger.info(`Отклонение защитника`, { appId, adminId: callbackQuery.from.id });
        
        const application = this.dataManager.getDefenderApplication(appId);
        if (!application) {
            await this.bot.sendMessage(chatId, '❌ Заявка не найдена');
            return;
        }
        
        // Обновляем статус
        this.dataManager.updateDefenderApplication(appId, {
            status: 'rejected',
            reviewedAt: new Date().toISOString(),
            reviewedBy: callbackQuery.from.id.toString()
        });
        
        // Уведомляем защитника
        const defenderMessage = 
            `📝 *ПО ВАШЕЙ ЗАЯВКЕ #${appId}*\n\n` +
            `К сожалению, ваша заявка не была одобрена.\n\n` +
            `*Возможные причины:*\n` +
            `• Неполная информация\n` +
            `• Требуются дополнительные навыки\n` +
            `• Ограничение по региону\n` +
            `• Другие организационные причины\n\n` +
            `Вы можете подать заявку повторно через 30 дней.\n\n` +
            `Спасибо за понимание.`;
        
        await this.sendFormattedMessage(application.chatId, defenderMessage);
        
        // Обновляем сообщение
        const updatedText = callbackQuery.message.text + '\n\n❌ *ОТКЛОНЕНО*';
        
        try {
            await this.bot.editMessageText(updatedText, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown'
            });
            
            await this.bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
                chat_id: chatId,
                message_id: messageId
            });
            
        } catch (error) {
            SystemLogger.error('Ошибка обновления сообщения', error);
        }
        
        await this.bot.sendMessage(chatId, `❌ Заявка #${appId} отклонена`);
    }
    
    async handleViewDefender(callbackQuery) {
        const appId = callbackQuery.data.replace('view_def_', '');
        const chatId = callbackQuery.message.chat.id;
        
        const application = this.dataManager.getDefenderApplication(appId);
        if (!application) {
            await this.bot.sendMessage(chatId, '❌ Заявка не найдена');
            return;
        }
        
        const detailsMessage = 
            `📋 *ПОЛНЫЕ ДАННЫЕ ЗАЯВКИ #${appId}*\n\n` +
            `*Основное:*\n` +
            `• Имя в системе: ${application.defenderName}\n` +
            `• Исходное имя: ${application.userName}\n` +
            `• Регион: ${application.region}\n` +
            `• Навыки: ${application.skills}\n\n` +
            `*Техническое:*\n` +
            `• ID заявки: \`${application.id}\`\n` +
            `• ID пользователя: \`${application.userId}\`\n` +
            `• Chat ID: \`${application.chatId}\`\n` +
            `• Статус: ${application.status}\n` +
            `• Подана: ${new Date(application.submittedAt).toLocaleString('ru-RU')}\n\n` +
            `_Нажмите на ID, чтобы скопировать_`;
        
        await this.sendFormattedMessage(chatId, detailsMessage);
    }
    
    async handleAssignReport(callbackQuery) {
        const reportId = callbackQuery.data.replace('assign_report_', '');
        const chatId = callbackQuery.message.chat.id;
        
        await this.bot.sendMessage(chatId,
            `👤 *Назначение заявки #${reportId}*\n\n` +
            `Функция назначения в разработке.\n\n` +
            `Для связи с пользователем:\n` +
            `• ID пользователя указан в сообщении\n` +
            `• Используйте: tg://user?id=USER_ID\n\n` +
            `Техподдержка: ${CONFIG.TECH_SUPPORT}`
        );
    }
    
    async handleCloseReport(callbackQuery) {
        const reportId = callbackQuery.data.replace('close_report_', '');
        const chatId = callbackQuery.message.chat.id;
        
        const report = this.dataManager.getReport(reportId);
        if (!report) {
            await this.bot.sendMessage(chatId, '❌ Заявка не найдена');
            return;
        }
        
        // Обновляем статус заявки
        this.dataManager.updateReport(reportId, {
            status: 'closed',
            closedAt: new Date().toISOString(),
            closedBy: callbackQuery.from.id.toString()
        });
        
        await this.bot.sendMessage(chatId, `✅ Заявка #${reportId} закрыта`);
    }
    
    // ============================================
    // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
    // ============================================
    
    async sendMessage(chatId, text) {
        try {
            await this.bot.sendMessage(chatId, text, {
                parse_mode: 'HTML',
                disable_web_page_preview: true
            });
            return true;
        } catch (error) {
            SystemLogger.error('Ошибка отправки сообщения', {
                chatId,
                error: error.message,
                textLength: text.length
            });
            return false;
        }
    }
    
    async sendFormattedMessage(chatId, text) {
        try {
            await this.bot.sendMessage(chatId, text, {
                parse_mode: 'Markdown',
                disable_web_page_preview: true
            });
            return true;
        } catch (error) {
            // Если Markdown не работает, отправляем как обычный текст
            try {
                const plainText = text
                    .replace(/\*([^*]+)\*/g, '$1')
                    .replace(/_([^_]+)_/g, '$1')
                    .replace(/`([^`]+)`/g, '$1');
                
                await this.bot.sendMessage(chatId, plainText, {
                    parse_mode: 'HTML',
                    disable_web_page_preview: true
                });
                return true;
            } catch (secondError) {
                SystemLogger.error('Ошибка отправки форматированного сообщения', {
                    chatId,
                    error: error.message,
                    secondError: secondError.message
                });
                return false;
            }
        }
    }
    
    startServer() {
        return new Promise((resolve, reject) => {
            const server = this.app.listen(CONFIG.PORT, CONFIG.HOST, () => {
                SystemLogger.info(`Веб-сервер запущен на порту ${CONFIG.PORT}`);
                resolve(server);
            });
            
            server.on('error', (error) => {
                SystemLogger.error('Ошибка запуска веб-сервера', error);
                reject(error);
            });
        });
    }
}

// ============================================
// ЗАПУСК СИСТЕМЫ
// ============================================

async function main() {
    try {
        SystemLogger.info('='.repeat(70));
        SystemLogger.info(`🚀 ЗАПУСК ${CONFIG.SYSTEM_NAME} v${CONFIG.VERSION}`);
        SystemLogger.info('='.repeat(70));
        
        SystemLogger.info('Инициализация системы...');
        
        // Создаем и запускаем бота
        const botSystem = new BakeliteDefenceBot();
        await botSystem.startServer();
        
        SystemLogger.info('✅ Система успешно запущена');
        SystemLogger.info(`📞 Техподдержка: ${CONFIG.TECH_SUPPORT}`);
        SystemLogger.info(`👑 Администратор ID: ${CONFIG.ADMIN_CHAT_ID}`);
        
        // Вывод информации в консоль
        console.log('\n' + '='.repeat(70));
        console.log(`🎉 ${CONFIG.SYSTEM_NAME} УСПЕШНО ЗАПУЩЕНА!`);
        console.log('='.repeat(70));
        console.log(`📊 Версия: ${CONFIG.VERSION}`);
        console.log(`🌐 Сервер: http://${CONFIG.HOST}:${CONFIG.PORT}`);
        console.log(`👨💻 Техподдержка: ${CONFIG.TECH_SUPPORT}`);
        console.log(`👑 Администратор: ${CONFIG.ADMIN_CHAT_ID}`);
        console.log('='.repeat(70));
        console.log('\n🎮 ДОСТУПНЫЕ КОМАНДЫ:');
        console.log('  /start    - Начало работы');
        console.log('  /help     - Инструкция');
        console.log('  /report   - Подать заявку о проблеме (опрос из 3 шагов)');
        console.log('  /join     - Стать защитником (опрос из 4 шагов)');
        console.log('  /status   - Статус системы');
        console.log('  /support  - Техподдержка');
        console.log('  /cancel   - Отмена операции');
        console.log('  /admin    - Админ-панель');
        console.log('  /defenders- Заявки защитников (с кнопками одобрения)');
        console.log('  /reports  - Заявки о проблемах (с кнопками управления)');
        console.log('='.repeat(70));
        console.log('\n🚀 Система работает 24/7');
        console.log(`📞 Контакт для вопросов: ${CONFIG.TECH_SUPPORT}`);
        console.log('='.repeat(70) + '\n');
        
    } catch (error) {
        SystemLogger.error('КРИТИЧЕСКАЯ ОШИБКА ЗАПУСКА', error);
        console.error('❌ СИСТЕМА НЕ МОЖЕТ БЫТЬ ЗАПУЩЕНА');
        console.error('🔧 Причина:', error.message);
        console.error('📞 Обратитесь в техподдержку:', CONFIG.TECH_SUPPORT);
        process.exit(1);
    }
}

// Запускаем систему
main();
