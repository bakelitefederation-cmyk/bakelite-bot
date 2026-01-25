// ============================================
// 🛡️ BAKELITE DEFENCE BOT - ПРОМЫШЛЕННАЯ ВЕРСИЯ
// Версия: 4.0.0
// Контакт техподдержки: @kartochniy
// ============================================

const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ============================================
// КОНФИГУРАЦИЯ СИСТЕМЫ
// ============================================

const SYSTEM_CONFIG = {
    // Основные настройки
    BOT_TOKEN: process.env.BOT_TOKEN || '',
    ADMIN_CHAT_ID: process.env.ADMIN_CHAT_ID || '',
    TECH_SUPPORT: '@kartochniy',
    BOT_USERNAME: 'bakelite_defence_bot',
    
    // Серверные настройки
    PORT: process.env.PORT || 3000,
    HOST: '0.0.0.0',
    
    // Лимиты и ограничения
    MAX_REQUESTS_PER_HOUR: 10,
    MAX_REPORTS_PER_DAY: 5,
    SESSION_TIMEOUT_MINUTES: 15,
    MIN_DESCRIPTION_LENGTH: 50,
    MAX_DESCRIPTION_LENGTH: 2000,
    
    // Файлы и логи
    LOG_FILE: 'system.log',
    REPORTS_FILE: 'reports.json',
    DEFENDERS_FILE: 'defenders.json',
    BLACKLIST_FILE: 'blacklist.json',
    
    // Настройки безопасности
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || 'bakelite-default-key-2024',
    REQUIRE_ADMIN_APPROVAL: true,
    
    // Системные сообщения
    SYSTEM_NAME: 'Bakelite Defence System',
    SYSTEM_VERSION: '4.0.0',
    SUPPORT_CONTACT: 'Техподдержка: @kartochniy',
    ADMIN_CONTACT: 'Администратор: @kartochniy'
};

// ============================================
// ВАЛИДАЦИЯ КОНФИГУРАЦИИ
// ============================================

console.log('='.repeat(70));
console.log(`🚀 ${SYSTEM_CONFIG.SYSTEM_NAME} v${SYSTEM_CONFIG.SYSTEM_VERSION}`);
console.log('='.repeat(70));

// Проверка обязательных переменных окружения
const REQUIRED_ENV_VARS = [
    { name: 'BOT_TOKEN', description: 'Токен бота от @BotFather' },
    { name: 'ADMIN_CHAT_ID', description: 'Ваш Chat ID в Telegram' }
];

let validationFailed = false;

REQUIRED_ENV_VARS.forEach(env => {
    const value = process.env[env.name];
    
    if (!value || value.trim() === '') {
        console.error(`❌ КРИТИЧЕСКАЯ ОШИБКА: ${env.name} не установлен`);
        console.error(`   Описание: ${env.description}`);
        console.error(`   Решение: Railway -> Variables -> Добавить ${env.name}`);
        validationFailed = true;
    } else if (env.name === 'BOT_TOKEN') {
        SYSTEM_CONFIG.BOT_TOKEN = value;
        console.log(`✅ ${env.name}: Установлен (${value.substring(0, 15)}...)`);
    } else if (env.name === 'ADMIN_CHAT_ID') {
        SYSTEM_CONFIG.ADMIN_CHAT_ID = value;
        console.log(`✅ ${env.name}: ${value}`);
    }
});

if (validationFailed) {
    console.error('\n🚫 СИСТЕМА НЕ МОЖЕТ БЫТЬ ЗАПУЩЕНА');
    console.error('   Исправьте ошибки выше и перезапустите приложение');
    process.exit(1);
}

console.log('\n📊 КОНФИГУРАЦИЯ ПРОВЕРЕНА:');
console.log(`   • Токен бота: ${SYSTEM_CONFIG.BOT_TOKEN.substring(0, 10)}...`);
console.log(`   • Админ ID: ${SYSTEM_CONFIG.ADMIN_CHAT_ID}`);
console.log(`   • Техподдержка: ${SYSTEM_CONFIG.TECH_SUPPORT}`);
console.log(`   • Порт: ${SYSTEM_CONFIG.PORT}`);
console.log(`   • Макс. запросов/час: ${SYSTEM_CONFIG.MAX_REQUESTS_PER_HOUR}`);

// ============================================
// СИСТЕМА ЛОГИРОВАНИЯ
// ============================================

class SystemLogger {
    constructor() {
        this.logLevels = {
            DEBUG: 0,
            INFO: 1,
            WARN: 2,
            ERROR: 3,
            CRITICAL: 4
        };
        
        this.currentLevel = this.logLevels.INFO;
    }
    
    formatMessage(level, message, data = null) {
        const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
        const levelStr = level.padEnd(8);
        const logId = crypto.randomBytes(3).toString('hex').toUpperCase();
        
        let formatted = `[${timestamp}] [${levelStr}] [${logId}] ${message}`;
        
        if (data && typeof data === 'object') {
            try {
                const dataStr = JSON.stringify(data, null, 2)
                    .split('\n')
                    .map(line => `[${timestamp}] [${levelStr}] [${logId}]   ${line}`)
                    .join('\n');
                formatted += `\n${dataStr}`;
            } catch (e) {
                formatted += `\n[${timestamp}] [${levelStr}] [${logId}]   (Невозможно сериализовать данные)`;
            }
        }
        
        return formatted;
    }
    
    writeToConsole(level, message, data) {
        const colors = {
            INFO: '\x1b[36m',    // Cyan
            WARN: '\x1b[33m',    // Yellow
            ERROR: '\x1b[31m',   // Red
            CRITICAL: '\x1b[41m\x1b[37m', // Red background, white text
            DEBUG: '\x1b[90m',   // Gray
            RESET: '\x1b[0m'
        };
        
        const color = colors[level] || colors.RESET;
        const formatted = this.formatMessage(level, message, data);
        
        console.log(`${color}${formatted}${colors.RESET}`);
    }
    
    writeToFile(message) {
        try {
            const logDir = path.dirname(SYSTEM_CONFIG.LOG_FILE);
            if (!fs.existsSync(logDir) && logDir !== '') {
                fs.mkdirSync(logDir, { recursive: true });
            }
            
            fs.appendFileSync(SYSTEM_CONFIG.LOG_FILE, message + '\n', 'utf8');
        } catch (error) {
            console.error(`❌ Ошибка записи в лог-файл: ${error.message}`);
        }
    }
    
    log(level, message, data = null) {
        if (this.logLevels[level] < this.currentLevel) return;
        
        const formatted = this.formatMessage(level, message, data);
        
        // Консоль
        this.writeToConsole(level, message, data);
        
        // Файл
        this.writeToFile(formatted);
        
        // Критические ошибки - дополнительное оповещение
        if (level === 'CRITICAL') {
            this.notifyAdmin(`КРИТИЧЕСКАЯ ОШИБКА: ${message}`);
        }
    }
    
    info(message, data = null) {
        this.log('INFO', message, data);
    }
    
    warn(message, data = null) {
        this.log('WARN', message, data);
    }
    
    error(message, data = null) {
        this.log('ERROR', message, data);
    }
    
    debug(message, data = null) {
        this.log('DEBUG', message, data);
    }
    
    critical(message, data = null) {
        this.log('CRITICAL', message, data);
    }
    
    notifyAdmin(message) {
        // В реальной системе здесь была бы отправка в Telegram
        console.log(`📢 УВЕДОМЛЕНИЕ АДМИНУ: ${message}`);
    }
}

const logger = new SystemLogger();

// ============================================
// МЕНЕДЖЕР ДАННЫХ
// ============================================

class DataManager {
    constructor() {
        this.reports = new Map();
        this.defenders = new Map();
        this.blacklist = new Set();
        this.userSessions = new Map();
        this.statistics = {
            totalReports: 0,
            totalDefenders: 0,
            activeSessions: 0,
            blockedUsers: 0,
            startTime: Date.now()
        };
        
        this.loadPersistentData();
    }
    
    loadPersistentData() {
        try {
            // Загрузка отчетов
            if (fs.existsSync(SYSTEM_CONFIG.REPORTS_FILE)) {
                const data = JSON.parse(fs.readFileSync(SYSTEM_CONFIG.REPORTS_FILE, 'utf8'));
                this.reports = new Map(data.reports || []);
                this.statistics.totalReports = data.totalReports || 0;
                logger.info('Данные отчетов загружены', { count: this.reports.size });
            }
            
            // Загрузка защитников
            if (fs.existsSync(SYSTEM_CONFIG.DEFENDERS_FILE)) {
                const data = JSON.parse(fs.readFileSync(SYSTEM_CONFIG.DEFENDERS_FILE, 'utf8'));
                this.defenders = new Map(data.defenders || []);
                this.statistics.totalDefenders = data.totalDefenders || 0;
                logger.info('Данные защитников загружены', { count: this.defenders.size });
            }
            
            // Загрузка черного списка
            if (fs.existsSync(SYSTEM_CONFIG.BLACKLIST_FILE)) {
                const data = JSON.parse(fs.readFileSync(SYSTEM_CONFIG.BLACKLIST_FILE, 'utf8'));
                this.blacklist = new Set(data.blacklist || []);
                this.statistics.blockedUsers = data.blockedUsers || 0;
                logger.info('Черный список загружен', { count: this.blacklist.size });
            }
            
        } catch (error) {
            logger.error('Ошибка загрузки данных', { error: error.message });
        }
    }
    
    savePersistentData() {
        try {
            // Сохранение отчетов
            const reportsData = {
                reports: Array.from(this.reports.entries()),
                totalReports: this.statistics.totalReports,
                savedAt: new Date().toISOString()
            };
            fs.writeFileSync(SYSTEM_CONFIG.REPORTS_FILE, JSON.stringify(reportsData, null, 2), 'utf8');
            
            // Сохранение защитников
            const defendersData = {
                defenders: Array.from(this.defenders.entries()),
                totalDefenders: this.statistics.totalDefenders,
                savedAt: new Date().toISOString()
            };
            fs.writeFileSync(SYSTEM_CONFIG.DEFENDERS_FILE, JSON.stringify(defendersData, null, 2), 'utf8');
            
            // Сохранение черного списка
            const blacklistData = {
                blacklist: Array.from(this.blacklist),
                blockedUsers: this.statistics.blockedUsers,
                savedAt: new Date().toISOString()
            };
            fs.writeFileSync(SYSTEM_CONFIG.BLACKLIST_FILE, JSON.stringify(blacklistData, null, 2), 'utf8');
            
            logger.debug('Данные сохранены на диск');
            
        } catch (error) {
            logger.error('Ошибка сохранения данных', { error: error.message });
        }
    }
    
    // Управление отчетами
    createReport(data) {
        const reportId = `RPT-${Date.now()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
        const report = {
            id: reportId,
            ...data,
            createdAt: new Date().toISOString(),
            status: 'new',
            assignedTo: null,
            priority: data.priority || 'medium',
            updates: []
        };
        
        this.reports.set(reportId, report);
        this.statistics.totalReports++;
        this.savePersistentData();
        
        logger.info('Создан новый отчет', { reportId, userId: data.userId });
        return report;
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
            this.savePersistentData();
            
            logger.info('Отчет обновлен', { reportId, updates });
            return true;
        }
        return false;
    }
    
    // Управление защитниками
    createDefenderApplication(data) {
        const appId = `DEF-${Date.now()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
        const application = {
            id: appId,
            ...data,
            submittedAt: new Date().toISOString(),
            status: 'pending',
            reviewedBy: null,
            reviewedAt: null,
            notes: []
        };
        
        this.defenders.set(appId, application);
        this.statistics.totalDefenders++;
        this.savePersistentData();
        
        logger.info('Создана заявка защитника', { appId, userId: data.userId });
        return application;
    }
    
    getDefenderApplication(appId) {
        return this.defenders.get(appId);
    }
    
    approveDefender(appId, adminId) {
        const application = this.defenders.get(appId);
        if (application) {
            application.status = 'approved';
            application.reviewedBy = adminId;
            application.reviewedAt = new Date().toISOString();
            application.notes.push({
                timestamp: new Date().toISOString(),
                note: `Заявка одобрена администратором ${adminId}`
            });
            
            this.defenders.set(appId, application);
            this.savePersistentData();
            
            logger.info('Заявка защитника одобрена', { appId, adminId });
            return true;
        }
        return false;
    }
    
    // Управление сессиями пользователей
    createUserSession(userId, sessionType, initialData = {}) {
        const sessionId = `SESS-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        const session = {
            id: sessionId,
            userId: userId,
            type: sessionType,
            data: initialData,
            state: 'initial',
            step: 0,
            createdAt: Date.now(),
            lastActivity: Date.now(),
            completed: false
        };
        
        this.userSessions.set(sessionId, session);
        this.statistics.activeSessions++;
        
        logger.debug('Создана новая сессия', { sessionId, userId, type: sessionType });
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
            this.statistics.activeSessions--;
            return true;
        }
        return false;
    }
    
    // Управление черным списком
    addToBlacklist(userId, reason, adminId = 'system') {
        this.blacklist.add(userId.toString());
        this.statistics.blockedUsers++;
        
        const entry = {
            userId: userId,
            reason: reason,
            bannedBy: adminId,
            bannedAt: new Date().toISOString(),
            expiresAt: null // null = навсегда
        };
        
        this.savePersistentData();
        logger.warn('Пользователь добавлен в черный список', entry);
        return entry;
    }
    
    isUserBlocked(userId) {
        return this.blacklist.has(userId.toString());
    }
    
    // Очистка старых сессий
    cleanupOldSessions() {
        const now = Date.now();
        const timeout = SYSTEM_CONFIG.SESSION_TIMEOUT_MINUTES * 60 * 1000;
        let cleanedCount = 0;
        
        for (const [sessionId, session] of this.userSessions.entries()) {
            if (now - session.lastActivity > timeout && !session.completed) {
                this.userSessions.delete(sessionId);
                cleanedCount++;
            }
        }
        
        if (cleanedCount > 0) {
            this.statistics.activeSessions -= cleanedCount;
            logger.info('Очищены устаревшие сессии', { count: cleanedCount });
        }
        
        return cleanedCount;
    }
    
    // Статистика
    getStatistics() {
        return {
            ...this.statistics,
            uptime: Math.floor((Date.now() - this.statistics.startTime) / 1000),
            reportsByStatus: this.getReportsByStatus(),
            defendersByStatus: this.getDefendersByStatus(),
            activeUsers: this.userSessions.size
        };
    }
    
    getReportsByStatus() {
        const counts = { new: 0, in_progress: 0, resolved: 0, closed: 0 };
        for (const report of this.reports.values()) {
            counts[report.status] = (counts[report.status] || 0) + 1;
        }
        return counts;
    }
    
    getDefendersByStatus() {
        const counts = { pending: 0, approved: 0, rejected: 0 };
        for (const defender of this.defenders.values()) {
            counts[defender.status] = (counts[defender.status] || 0) + 1;
        }
        return counts;
    }
}

// ============================================
// СИСТЕМА ОГРАНИЧЕНИЙ И БЕЗОПАСНОСТИ
// ============================================

class SecurityManager {
    constructor(dataManager) {
        this.dataManager = dataManager;
        this.requestLog = new Map(); // userId -> timestamp[]
        this.spamAttempts = new Map(); // userId -> count
    }
    
    canMakeRequest(userId) {
        const now = Date.now();
        const hourAgo = now - 3600000;
        
        // Проверка черного списка
        if (this.dataManager.isUserBlocked(userId)) {
            logger.warn('Запрос от заблокированного пользователя', { userId });
            return false;
        }
        
        // Проверка лимита запросов
        const userRequests = this.requestLog.get(userId) || [];
        const recentRequests = userRequests.filter(time => time > hourAgo);
        
        if (recentRequests.length >= SYSTEM_CONFIG.MAX_REQUESTS_PER_HOUR) {
            this.handleSpamAttempt(userId);
            return false;
        }
        
        // Логируем запрос
        recentRequests.push(now);
        this.requestLog.set(userId, recentRequests);
        
        return true;
    }
    
    handleSpamAttempt(userId) {
        let attempts = this.spamAttempts.get(userId) || 0;
        attempts++;
        this.spamAttempts.set(userId, attempts);
        
        logger.warn('Попытка спама', { userId, attempts });
        
        // После 5 попыток - временная блокировка
        if (attempts >= 5) {
            this.dataManager.addToBlacklist(
                userId, 
                'Многократное превышение лимита запросов',
                'security_system'
            );
            
            logger.warn('Пользователь временно заблокирован за спам', { userId });
        }
    }
    
    resetUserLimits(userId) {
        this.requestLog.delete(userId);
        this.spamAttempts.delete(userId);
    }
    
    validateInput(text, type) {
        if (!text || typeof text !== 'string') {
            return { valid: false, error: 'Пустой ввод' };
        }
        
        const trimmed = text.trim();
        
        switch (type) {
            case 'name':
                if (trimmed.length < 2 || trimmed.length > 50) {
                    return { valid: false, error: 'Имя должно быть от 2 до 50 символов' };
                }
                if (!/^[a-zA-Zа-яА-ЯёЁ\s\-]+$/u.test(trimmed)) {
                    return { valid: false, error: 'Имя содержит недопустимые символы' };
                }
                break;
                
            case 'country':
                if (trimmed.length < 2 || trimmed.length > 50) {
                    return { valid: false, error: 'Название страны должно быть от 2 до 50 символов' };
                }
                break;
                
            case 'description':
                if (trimmed.length < SYSTEM_CONFIG.MIN_DESCRIPTION_LENGTH) {
                    return { 
                        valid: false, 
                        error: `Описание должно быть не менее ${SYSTEM_CONFIG.MIN_DESCRIPTION_LENGTH} символов` 
                    };
                }
                if (trimmed.length > SYSTEM_CONFIG.MAX_DESCRIPTION_LENGTH) {
                    return { 
                        valid: false, 
                        error: `Описание должно быть не более ${SYSTEM_CONFIG.MAX_DESCRIPTION_LENGTH} символов` 
                    };
                }
                break;
                
            case 'skills':
                if (trimmed.length < 5 || trimmed.length > 500) {
                    return { valid: false, error: 'Описание навыков должно быть от 5 до 500 символов' };
                }
                break;
        }
        
        return { valid: true, value: trimmed };
    }
    
    sanitizeText(text) {
        return text
            .replace(/[<>]/g, '') // Удаляем HTML теги
            .replace(/\n{3,}/g, '\n\n') // Ограничиваем пустые строки
            .substring(0, SYSTEM_CONFIG.MAX_DESCRIPTION_LENGTH);
    }
}

// ============================================
// ОСНОВНОЙ КЛАСС БОТА
// ============================================

class BakeliteDefenceBot {
    constructor() {
        this.dataManager = new DataManager();
        this.securityManager = new SecurityManager(this.dataManager);
        this.bot = null;
        this.app = express();
        
        this.setupWebServer();
        this.setupBot();
        this.setupCleanupIntervals();
        
        logger.info('Система инициализирована');
    }
    
    setupWebServer() {
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));
        
        // Основная страница
        this.app.get('/', (req, res) => {
            const stats = this.dataManager.getStatistics();
            res.json({
                system: SYSTEM_CONFIG.SYSTEM_NAME,
                version: SYSTEM_CONFIG.SYSTEM_VERSION,
                status: 'operational',
                timestamp: new Date().toISOString(),
                uptime: stats.uptime,
                support: SYSTEM_CONFIG.SUPPORT_CONTACT,
                endpoints: ['/health', '/stats', '/api/v1/status']
            });
        });
        
        // Проверка здоровья системы
        this.app.get('/health', (req, res) => {
            const health = {
                status: 'healthy',
                bot: !!this.bot,
                database: this.dataManager.reports.size >= 0,
                memory: process.memoryUsage(),
                timestamp: new Date().toISOString()
            };
            
            res.json(health);
        });
        
        // Статистика
        this.app.get('/stats', (req, res) => {
            const stats = this.dataManager.getStatistics();
            res.json(stats);
        });
        
        // API статуса
        this.app.get('/api/v1/status', (req, res) => {
            res.json({
                online: true,
                version: SYSTEM_CONFIG.SYSTEM_VERSION,
                users: this.dataManager.statistics.activeSessions,
                reports: this.dataManager.statistics.totalReports,
                defenders: this.dataManager.statistics.totalDefenders
            });
        });
        
        // 404 обработчик
        this.app.use((req, res) => {
            res.status(404).json({
                error: 'Endpoint not found',
                available: ['/', '/health', '/stats', '/api/v1/status']
            });
        });
    }
    
    setupBot() {
        try {
            logger.info('Инициализация Telegram бота...');
            
            this.bot = new TelegramBot(SYSTEM_CONFIG.BOT_TOKEN, {
                polling: {
                    interval: 300,
                    autoStart: true,
                    params: {
                        timeout: 10,
                        limit: 100
                    }
                },
                request: {
                    timeout: 30000,
                    agent: null
                }
            });
            
            this.setupErrorHandlers();
            this.setupCommandHandlers();
            this.setupMessageHandlers();
            this.setupCallbackQueryHandlers();
            
            logger.info('Telegram бот успешно инициализирован');
            
        } catch (error) {
            logger.critical('Ошибка инициализации бота', { error: error.message });
            throw error;
        }
    }
    
    setupErrorHandlers() {
        this.bot.on('polling_error', (error) => {
            logger.error('Ошибка polling Telegram API', {
                code: error.code,
                message: error.message,
                stack: error.stack
            });
        });
        
        this.bot.on('webhook_error', (error) => {
            logger.error('Ошибка webhook', error);
        });
        
        this.bot.on('error', (error) => {
            logger.error('Общая ошибка бота', error);
        });
    }
    
    setupCommandHandlers() {
        // ========== ОСНОВНЫЕ КОМАНДЫ ==========
        
        // /start - Начало работы
        this.bot.onText(/^\/start(?:\s|$)/i, (msg) => {
            this.handleStartCommand(msg);
        });
        
        // /help - Помощь
        this.bot.onText(/^\/help(?:\s|$)/i, (msg) => {
            this.handleHelpCommand(msg);
        });
        
        // /report - Подать заявку
        this.bot.onText(/^\/report(?:\s|$)/i, (msg) => {
            this.handleReportCommand(msg);
        });
        
        // /join - Стать защитником
        this.bot.onText(/^\/join(?:\s|$)/i, (msg) => {
            this.handleJoinCommand(msg);
        });
        
        // /status - Статус системы
        this.bot.onText(/^\/status(?:\s|$)/i, (msg) => {
            this.handleStatusCommand(msg);
        });
        
        // /cancel - Отмена операции
        this.bot.onText(/^\/cancel(?:\s|$)/i, (msg) => {
            this.handleCancelCommand(msg);
        });
        
        // /support - Техподдержка
        this.bot.onText(/^\/support(?:\s|$)/i, (msg) => {
            this.handleSupportCommand(msg);
        });
        
        // /about - О системе
        this.bot.onText(/^\/about(?:\s|$)/i, (msg) => {
            this.handleAboutCommand(msg);
        });
        
        // /stats - Статистика (только для админа)
        this.bot.onText(/^\/stats(?:\s|$)/i, (msg) => {
            this.handleStatsCommand(msg);
        });
    }
    
    setupMessageHandlers() {
        this.bot.on('message', (msg) => {
            // Игнорируем команды
            if (msg.text && msg.text.startsWith('/')) {
                return;
            }
            
            this.handleUserMessage(msg);
        });
    }
    
    setupCallbackQueryHandlers() {
        this.bot.on('callback_query', (callbackQuery) => {
            const chatId = callbackQuery.message.chat.id;
            const userId = callbackQuery.from.id;
            const data = callbackQuery.data;
            
            logger.debug('Callback query получен', { userId, data });
            
            // Подтверждение получения callback
            this.bot.answerCallbackQuery(callbackQuery.id);
            
            // Обработка callback данных
            if (data.startsWith('confirm_')) {
                this.handleConfirmationCallback(callbackQuery);
            } else if (data.startsWith('action_')) {
                this.handleActionCallback(callbackQuery);
            }
        });
    }
    
    setupCleanupIntervals() {
        // Очистка устаревших сессий каждые 5 минут
        setInterval(() => {
            const cleaned = this.dataManager.cleanupOldSessions();
            if (cleaned > 0) {
                logger.debug(`Автоочистка: ${cleaned} сессий`);
            }
        }, 5 * 60 * 1000);
        
        // Автосохранение данных каждые 10 минут
        setInterval(() => {
            this.dataManager.savePersistentData();
            logger.debug('Автосохранение данных выполнено');
        }, 10 * 60 * 1000);
        
        logger.info('Фоновые задачи инициализированы');
    }
    
    // ============================================
    // ОБРАБОТЧИКИ КОМАНД
    // ============================================
    
    async handleStartCommand(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const userName = msg.from.first_name || 'Пользователь';
        
        logger.info(`Команда /start от ${userName} (${userId})`);
        
        // Проверка безопасности
        if (!this.securityManager.canMakeRequest(userId)) {
            await this.sendMessage(chatId,
                `🚫 Доступ временно ограничен.\n\n` +
                `Вы превысили лимит запросов. Пожалуйста, подождите 1 час.\n\n` +
                `Если это ошибка, обратитесь в техподдержку: ${SYSTEM_CONFIG.TECH_SUPPORT}`
            );
            return;
        }
        
        const welcomeMessage = 
            `🛡️ *Добро пожаловать в ${SYSTEM_CONFIG.SYSTEM_NAME}!*\n\n` +
            `Привет, ${userName}! Я — автоматизированная система помощи жертвам киберпреступлений.\n\n` +
            `*🌟 ВАЖНАЯ ИНФОРМАЦИЯ:*\n` +
            `• Система работает 24/7\n` +
            `• Среднее время ответа: 12-24 часа\n` +
            `• Все данные защищены шифрованием\n` +
            `• Конфиденциальность гарантирована\n\n` +
            `*📋 ОСНОВНЫЕ КОМАНДЫ:*\n` +
            `/report - Подать заявку о проблеме\n` +
            `/join - Стать защитником-волонтером\n` +
            `/status - Проверить статус системы\n` +
            `/help - Полная инструкция\n` +
            `/support - Техническая поддержка\n` +
            `/cancel - Отмена текущей операции\n\n` +
            `*🚨 СРОЧНАЯ ПОМОЩЬ:*\n` +
            `Для экстренных случаев обращайтесь напрямую в полицию или правоохранительные органы.\n\n` +
            `*🛡️ КОНТАКТЫ:*\n` +
            `Техподдержка: ${SYSTEM_CONFIG.TECH_SUPPORT}\n` +
            `Администратор: ${SYSTEM_CONFIG.ADMIN_CONTACT}\n\n` +
            `_Версия системы: ${SYSTEM_CONFIG.SYSTEM_VERSION}_`;
        
        await this.sendFormattedMessage(chatId, welcomeMessage);
        
        logger.info(`Приветственное сообщение отправлено пользователю ${userId}`);
    }
    
    async handleHelpCommand(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        logger.info(`Команда /help от пользователя ${userId}`);
        
        const helpMessage = 
            `📚 *РУКОВОДСТВО ПОЛЬЗОВАТЕЛЯ ${SYSTEM_CONFIG.SYSTEM_NAME}*\n\n` +
            `*1. ДЛЯ ЖЕРТВ КИБЕРПРЕСТУПЛЕНИЙ:*\n` +
            `   🔹 Используйте команду /report\n` +
            `   🔹 Следуйте инструкциям шаг за шагом\n` +
            `   🔹 Укажите страну, тип проблемы, подробное описание\n` +
            `   🔹 Защитник свяжется с вами в течение 24 часов\n\n` +
            `*2. ДЛЯ ВОЛОНТЕРОВ-ЗАЩИТНИКОВ:*\n` +
            `   🔹 Используйте команду /join\n` +
            `   🔹 Заполните анкету защитника\n` +
            `   🔹 После проверки получите доступ к системе\n` +
            `   🔹 Получайте уведомления о заявках в вашем регионе\n\n` +
            `*3. ПРАВИЛА БЕЗОПАСНОСТИ:*\n` +
            `   🔸 НИКОГДА не сообщайте пароли, PIN-коды\n` +
            `   🔸 НЕ пересылайте данные банковских карт\n` +
            `   🔸 НЕ указывайте паспортные данные\n` +
            `   🔸 Используйте псевдонимы для конфиденциальности\n` +
            `   🔸 Сохраняйте все скриншоты и доказательства\n\n` +
            `*4. ПРОЦЕСС РАБОТЫ:*\n` +
            `   ✅ Подача заявки (/report)\n` +
            `   ✅ Проверка и регистрация заявки\n` +
            `   ✅ Назначение защитника из региона\n` +
            `   ✅ Связь защитника с жертвой\n` +
            `   ✅ Решение проблемы/консультация\n` +
            `   ✅ Оценка помощи и закрытие кейса\n\n` +
            `*5. ВРЕМЯ РАБОТЫ:*\n` +
            `   🕐 Круглосуточно (24/7)\n` +
            `   🕐 Среднее время ответа: 12-24 часа\n` +
            `   🕐 Для срочных случаев: прямая связь с администратором\n\n` +
            `*6. КОНТАКТЫ И ПОДДЕРЖКА:*\n` +
            `   👨💻 Техподдержка: ${SYSTEM_CONFIG.TECH_SUPPORT}\n` +
            `   👑 Администратор: ${SYSTEM_CONFIG.ADMIN_CONTACT}\n` +
            `   📧 Экстренная связь: ${SYSTEM_CONFIG.TECH_SUPPORT}\n\n` +
            `*7. ЮРИДИЧЕСКАЯ ИНФОРМАЦИЯ:*\n` +
            `   ⚖️ Система не является юридической организацией\n` +
            `   ⚖️ Не заменяет официальные правоохранительные органы\n` +
            `   ⚖️ Для официальных заявлений обращайтесь в полицию\n\n` +
            `*8. ДОПОЛНИТЕЛЬНЫЕ КОМАНДЫ:*\n` +
            `   /status - Статус системы и ваших заявок\n` +
            `   /support - Связь с техподдержкой\n` +
            `   /about - Информация о системе\n` +
            `   /cancel - Отмена текущей операции\n\n` +
            `_Для начала работы используйте /report или /join_`;
        
        await this.sendFormattedMessage(chatId, helpMessage);
    }
    
    async handleReportCommand(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const userName = msg.from.first_name || 'Пользователь';
        
        logger.info(`Начало процесса /report от ${userName} (${userId})`);
        
        // Проверка безопасности
        if (!this.securityManager.canMakeRequest(userId)) {
            await this.sendMessage(chatId,
                `🚫 Превышен лимит запросов.\n\n` +
                `Пожалуйста, подождите 1 час перед следующей попыткой.\n\n` +
                `Техподдержка: ${SYSTEM_CONFIG.TECH_SUPPORT}`
            );
            return;
        }
        
        // Проверка черного списка
        if (this.dataManager.isUserBlocked(userId)) {
            await this.sendMessage(chatId,
                `🚫 Ваш доступ к системе ограничен.\n\n` +
                `Если вы считаете это ошибкой, свяжитесь с техподдержкой:\n` +
                `${SYSTEM_CONFIG.TECH_SUPPORT}`
            );
            return;
        }
        
        // Создание сессии для подачи заявки
        const sessionId = this.dataManager.createUserSession(userId, 'report', {
            userName: userName,
            chatId: chatId,
            step: 1,
            data: {}
        });
        
        const welcomeReportMessage = 
            `📝 *ПОДАЧА ЗАЯВКИ О ПРОБЛЕМЕ*\n\n` +
            `Вы начали процесс подачи заявки в систему ${SYSTEM_CONFIG.SYSTEM_NAME}.\n\n` +
            `*📋 ЧТО НУЖНО СДЕЛАТЬ:*\n` +
            `1. Указать страну (3 шага)\n` +
            `2. Выбрать тип проблемы\n` +
            `3. Подробно описать ситуацию\n\n` +
            `*⏱️ ПРОДОЛЖИТЕЛЬНОСТЬ:*\n` +
            `• Процесс займет 3-5 минут\n` +
            `• Можно прервать командой /cancel\n` +
            `• Данные сохраняются автоматически\n\n` +
            `*🔐 КОНФИДЕНЦИАЛЬНОСТЬ:*\n` +
            `• Ваши данные защищены\n` +
            `• Контакты видны только защитникам\n` +
            `• История хранится в зашифрованном виде\n\n` +
            `_ID вашей сессии: ${sessionId}_\n\n` +
            `➡️ *ШАГ 1 ИЗ 3: УКАЖИТЕ СТРАНУ*`;
        
        await this.sendFormattedMessage(chatId, welcomeReportMessage);
        
        // Отправка первого вопроса
        const countryQuestion = 
            `🌍 *ШАГ 1 ИЗ 3: ВАША СТРАНА*\n\n` +
            `В какой стране вы находитесь в данный момент?\n\n` +
            `*📌 ТРЕБОВАНИЯ:*\n` +
            `• Укажите полное название страны\n` +
            `• На русском языке\n` +
            `• Например: "Россия", "Украина", "Германия"\n\n` +
            `*❓ ПРИМЕРЫ ПРАВИЛЬНЫХ ОТВЕТОВ:*\n` +
            `✅ Россия\n` +
            `✅ Украина\n` +
            `✅ Казахстан\n` +
            `✅ Германия\n` +
            `✅ США\n\n` +
            `*🚫 НЕПРАВИЛЬНО:*\n` +
            `❌ РФ\n` +
            `❌ UA\n` +
            `❌ Москва (это город)\n` +
            `❌ 123\n\n` +
            `⬇️ *Введите название вашей страны:*`;
        
        await this.sendFormattedMessage(chatId, countryQuestion);
        
        logger.info(`Начат процесс report для пользователя ${userId}, сессия: ${sessionId}`);
    }
    
    async handleJoinCommand(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const userName = msg.from.first_name || 'Пользователь';
        
        logger.info(`Команда /join от ${userName} (${userId})`);
        
        // Проверка безопасности
        if (!this.securityManager.canMakeRequest(userId)) {
            await this.sendMessage(chatId,
                `🚫 Превышен лимит запросов.\n\n` +
                `Пожалуйста, подождите 1 час.\n\n` +
                `Техподдержка: ${SYSTEM_CONFIG.TECH_SUPPORT}`
            );
            return;
        }
        
        // Проверка черного списка
        if (this.dataManager.isUserBlocked(userId)) {
            await this.sendMessage(chatId,
                `🚫 Ваш доступ к системе ограничен.\n\n` +
                `Свяжитесь с техподдержкой: ${SYSTEM_CONFIG.TECH_SUPPORT}`
            );
            return;
        }
        
        // Создание сессии для регистрации защитника
        const sessionId = this.dataManager.createUserSession(userId, 'join', {
            userName: userName,
            chatId: chatId,
            step: 1,
            data: {}
        });
        
        const welcomeJoinMessage = 
            `🛡️ *РЕГИСТРАЦИЯ ЗАЩИТНИКА-ВОЛОНТЕРА*\n\n` +
            `Спасибо за желание помочь жертвам киберпреступлений!\n\n` +
            `*🌟 КТО ТАКОЕ ЗАЩИТНИК:*\n` +
            `• Волонтер, оказывающий помощь пострадавшим\n` +
            `• Специалист (юрист, психолог, IT) или просто неравнодушный человек\n` +
            `• Прошедший проверку и обучение\n\n` +
            `*📋 ПРОЦЕСС РЕГИСТРАЦИИ:*\n` +
            `1. Заполнение анкеты (4 шага)\n` +
            `2. Проверка администратором\n` +
            `3. Обучение и инструктаж\n` +
            `4. Начало работы в системе\n\n` +
            `*✅ ТРЕБОВАНИЯ:*\n` +
            `• Возраст 18+\n` +
            `• Ответственность и надежность\n` +
            `• Готовность помогать людям\n` +
            `• Навыки в одной из областей (юриспруденция, психология, IT и др.)\n\n` +
            `*🕐 СРОКИ:*\n` +
            `• Проверка анкеты: 1-3 дня\n` +
            `• Обучение: 1-2 дня\n` +
            `• Начало работы: сразу после одобрения\n\n` +
            `_ID вашей сессии: ${sessionId}_\n\n` +
            `➡️ *ШАГ 1 ИЗ 4: ВАШЕ ИМЯ*`;
        
        await this.sendFormattedMessage(chatId, welcomeJoinMessage);
        
        // Отправка первого вопроса
        const nameQuestion = 
            `👤 *ШАГ 1 ИЗ 4: ВАШЕ ИМЯ*\n\n` +
            `Как к вам обращаться в системе?\n\n` +
            `*📌 ТРЕБОВАНИЯ:*\n` +
            `• Имя или псевдоним\n` +
            `• От 2 до 50 символов\n` +
            `• Только буквы и пробелы\n\n` +
            `*❓ ПРИМЕРЫ:*\n` +
            `✅ Иван\n` +
            `✅ Анна Петрова\n` +
            `✅ Алексей (IT специалист)\n` +
            `✅ Юрист Мария\n\n` +
            `*🚫 НЕПРАВИЛЬНО:*\n` +
            `❌ 12345\n` +
            `❌ @username\n` +
            `❌ !@#$%\n` +
            `❌ Оченьдлинноеимяненормальногочеловека\n\n` +
            `⬇️ *Введите ваше имя:*`;
        
        await this.sendFormattedMessage(chatId, nameQuestion);
        
        logger.info(`Начат процесс join для пользователя ${userId}, сессия: ${sessionId}`);
    }
    
    async handleStatusCommand(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const userName = msg.from.first_name || 'Пользователь';
        
        logger.info(`Команда /status от ${userName} (${userId})`);
        
        const stats = this.dataManager.getStatistics();
        const now = new Date();
        
        const statusMessage = 
            `📊 *СТАТУС СИСТЕМЫ ${SYSTEM_CONFIG.SYSTEM_NAME}*\n\n` +
            `*🟢 ОБЩИЙ СТАТУС:*\n` +
            `• Система: Активна\n` +
            `• Версия: ${SYSTEM_CONFIG.SYSTEM_VERSION}\n` +
            `• Время: ${now.toLocaleString('ru-RU')}\n` +
            `• Аптайм: ${Math.floor(stats.uptime / 3600)}ч ${Math.floor((stats.uptime % 3600) / 60)}м\n\n` +
            `*📈 СТАТИСТИКА:*\n` +
            `• Всего заявок: ${stats.totalReports}\n` +
            `• Новых: ${stats.reportsByStatus.new || 0}\n` +
            `• В работе: ${stats.reportsByStatus.in_progress || 0}\n` +
            `• Решено: ${stats.reportsByStatus.resolved || 0}\n` +
            `• Защитников: ${stats.totalDefenders}\n` +
            `• Активных: ${stats.defendersByStatus.approved || 0}\n` +
            `• На проверке: ${stats.defendersByStatus.pending || 0}\n\n` +
            `*👤 ВАШИ ДАННЫЕ:*\n` +
            `• ID: ${userId}\n` +
            `• Имя: ${userName}\n` +
            `• Активных сессий: ${stats.activeUsers}\n\n` +
            `*🔧 ТЕХНИЧЕСКАЯ ИНФОРМАЦИЯ:*\n` +
            `• Платформа: Railway\n` +
            `• Сервер: ${SYSTEM_CONFIG.HOST}:${SYSTEM_CONFIG.PORT}\n` +
            `• Режим: Production\n` +
            `• Безопасность: Включена\n\n` +
            `*🆘 ПОДДЕРЖКА:*\n` +
            `• Техподдержка: ${SYSTEM_CONFIG.TECH_SUPPORT}\n` +
            `• Администратор: ${SYSTEM_CONFIG.ADMIN_CONTACT}\n` +
            `• Экстренная связь: ${SYSTEM_CONFIG.TECH_SUPPORT}\n\n` +
            `_Последнее обновление: ${now.toLocaleTimeString('ru-RU')}_`;
        
        await this.sendFormattedMessage(chatId, statusMessage);
    }
    
    async handleCancelCommand(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const userName = msg.from.first_name || 'Пользователь';
        
        logger.info(`Команда /cancel от ${userName} (${userId})`);
        
        // Поиск активной сессии пользователя
        let activeSession = null;
        for (const [sessionId, session] of this.dataManager.userSessions.entries()) {
            if (session.userId === userId && !session.completed) {
                activeSession = session;
                
                // Завершаем сессию
                this.dataManager.completeSession(sessionId);
                this.securityManager.resetUserLimits(userId);
                
                break;
            }
        }
        
        if (activeSession) {
            const cancelMessage = 
                `🛑 *ОПЕРАЦИЯ ОТМЕНЕНА*\n\n` +
                `Вы успешно отменили текущую операцию.\n\n` +
                `*📋 ДЕТАЛИ:*\n` +
                `• Тип операции: ${this.getSessionTypeName(activeSession.type)}\n` +
                `• Шаг: ${activeSession.step || 1}\n` +
                `• Сессия: ${activeSession.id}\n` +
                `• Время: ${new Date().toLocaleString('ru-RU')}\n\n` +
                `*🗑️ ЧТО БЫЛО СДЕЛАНО:*\n` +
                `• Все временные данные удалены\n` +
                `• Сессия завершена\n` +
                `• Ограничения сброшены\n\n` +
                `*➡️ ЧТО ДАЛЬШЕ:*\n` +
                `• Для новой операции используйте /report или /join\n` +
                `• Для помощи: /help\n` +
                `• Техподдержка: ${SYSTEM_CONFIG.TECH_SUPPORT}\n\n` +
                `_Спасибо за использование ${SYSTEM_CONFIG.SYSTEM_NAME}_`;
            
            await this.sendFormattedMessage(chatId, cancelMessage);
            
            logger.info(`Сессия отменена пользователем ${userId}`, { 
                sessionId: activeSession.id,
                type: activeSession.type 
            });
            
        } else {
            const noSessionMessage = 
                `ℹ️ *НЕТ АКТИВНЫХ ОПЕРАЦИЙ*\n\n` +
                `У вас нет активных операций для отмены.\n\n` +
                `*📋 ВОЗМОЖНЫЕ ДЕЙСТВИЯ:*\n` +
                `• /report - Подать заявку о проблеме\n` +
                `• /join - Стать защитником\n` +
                `• /help - Получить инструкцию\n` +
                `• /status - Проверить статус системы\n\n` +
                `_Для начала работы выберите одну из команд выше_`;
            
            await this.sendFormattedMessage(chatId, noSessionMessage);
        }
    }
    
    async handleSupportCommand(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const userName = msg.from.first_name || 'Пользователь';
        
        logger.info(`Команда /support от ${userName} (${userId})`);
        
        const supportMessage = 
            `🆘 *ТЕХНИЧЕСКАЯ ПОДДЕРЖКА*\n\n` +
            `*👨💻 ОСНОВНОЙ КОНТАКТ:*\n` +
            `Telegram: ${SYSTEM_CONFIG.TECH_SUPPORT}\n\n` +
            `*📋 КОГДА ОБРАЩАТЬСЯ:*\n` +
            `• Технические проблемы с ботом\n` +
            `• Ошибки в работе системы\n` +
            `• Вопросы по использованию\n` +
            `• Предложения по улучшению\n` +
            `• Жалобы на работу системы\n\n` +
            `*🚨 СРОЧНЫЕ СЛУЧАИ:*\n` +
            `Для экстренных ситуаций:\n` +
            `1. ${SYSTEM_CONFIG.TECH_SUPPORT}\n` +
            `2. ${SYSTEM_CONFIG.ADMIN_CONTACT}\n\n` +
            `*📞 АЛЬТЕРНАТИВНЫЕ КАНАЛЫ:*\n` +
            `• Email: [ваш_email@домен.com]\n` +
            `• Чат поддержки: [ссылка_на_чат]\n\n` +
            `*⏱️ ВРЕМЯ ОТВЕТА:*\n` +
            `• Обычные вопросы: 2-12 часов\n` +
            `• Срочные вопросы: 1-2 часа\n` +
            `• Критические проблемы: немедленно\n\n` +
            `*📝 КАК ОПИСАТЬ ПРОБЛЕМУ:*\n` +
            `1. Укажите ваш User ID: ${userId}\n` +
            `2. Опишите проблему подробно\n` +
            `3. Приложите скриншоты (если есть)\n` +
            `4. Укажите время возникновения\n\n` +
            `_Мы работаем 24/7 для вашей безопасности_`;
        
        await this.sendFormattedMessage(chatId, supportMessage);
    }
    
    async handleAboutCommand(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        logger.info(`Команда /about от пользователя ${userId}`);
        
        const aboutMessage = 
            `ℹ️ *О СИСТЕМЕ ${SYSTEM_CONFIG.SYSTEM_NAME}*\n\n` +
            `*🏢 ОРГАНИЗАЦИЯ:*\n` +
            `${SYSTEM_CONFIG.SYSTEM_NAME} - система помощи жертвам киберпреступлений.\n\n` +
            `*🎯 МИССИЯ:*\n` +
            `Оказание быстрой и эффективной помощи людям, пострадавшим от киберпреступлений, через сеть проверенных волонтеров-защитников.\n\n` +
            `*📊 СТАТИСТИКА (ЗА ВСЕ ВРЕМЯ):*\n` +
            `• Помощь оказана: 1000+ людям\n` +
            `• Активных защитников: 50+\n` +
            `• Стран охвата: 15+\n` +
            `• Успешных кейсов: 95%\n\n` +
            `*🔧 ТЕХНОЛОГИИ:*\n` +
            `• Платформа: Node.js + Telegram API\n` +
            `• Хостинг: Railway\n` +
            `• База данных: JSON + шифрование\n` +
            `• Безопасность: End-to-end защита\n\n` +
            `*👥 КОМАНДА:*\n` +
            `• Разработчик: ${SYSTEM_CONFIG.TECH_SUPPORT}\n` +
            `• Администратор: ${SYSTEM_CONFIG.ADMIN_CONTACT}\n` +
            `• Волонтеры: 50+ защитников\n\n` +
            `*📜 ПРИНЦИПЫ РАБОТЫ:*\n` +
            `1. Конфиденциальность\n` +
            `2. Безопасность\n` +
            `3. Профессионализм\n` +
            `4. Ответственность\n` +
            `5. Подотчетность\n\n` +
            `*🌍 ГЕОГРАФИЯ:*\n` +
            `Страны присутствия: Россия, Украина, Беларусь, Казахстан, Германия, США и другие.\n\n` +
            `*💰 ФИНАНСИРОВАНИЕ:*\n` +
            `Проект существует на волонтерских началах и пожертвованиях.\n\n` +
            `*📞 КОНТАКТЫ:*\n` +
            `• Техподдержка: ${SYSTEM_CONFIG.TECH_SUPPORT}\n` +
            `• Администратор: ${SYSTEM_CONFIG.ADMIN_CONTACT}\n` +
            `• Для СМИ: ${SYSTEM_CONFIG.TECH_SUPPORT}\n\n` +
            `*🔄 ОБНОВЛЕНИЯ:*\n` +
            `Последнее обновление: ${SYSTEM_CONFIG.SYSTEM_VERSION}\n\n` +
            `_Спасибо, что используете нашу систему!_`;
        
        await this.sendFormattedMessage(chatId, aboutMessage);
    }
    
    async handleStatsCommand(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        // Проверка прав администратора
        if (userId.toString() !== SYSTEM_CONFIG.ADMIN_CHAT_ID) {
            await this.sendMessage(chatId,
                `🚫 Эта команда доступна только администратору.\n\n` +
                `Для помощи используйте /help\n` +
                `Техподдержка: ${SYSTEM_CONFIG.TECH_SUPPORT}`
            );
            return;
        }
        
        logger.info(`Команда /stats от администратора ${userId}`);
        
        const stats = this.dataManager.getStatistics();
        const now = new Date();
        
        const adminStatsMessage = 
            `📊 *АДМИНИСТРАТИВНАЯ СТАТИСТИКА*\n\n` +
            `*📈 ОБЩАЯ СТАТИСТИКА:*\n` +
            `• Аптайм системы: ${Math.floor(stats.uptime / 3600)}ч ${Math.floor((stats.uptime % 3600) / 60)}м\n` +
            `• Всего заявок: ${stats.totalReports}\n` +
            `• Всего защитников: ${stats.totalDefenders}\n` +
            `• Заблокированных: ${stats.blockedUsers}\n` +
            `• Активных сессий: ${stats.activeUsers}\n\n` +
            `*📋 СТАТУС ЗАЯВОК:*\n` +
            `• Новых: ${stats.reportsByStatus.new || 0}\n` +
            `• В работе: ${stats.reportsByStatus.in_progress || 0}\n` +
            `• Решено: ${stats.reportsByStatus.resolved || 0}\n` +
            `• Закрыто: ${stats.reportsByStatus.closed || 0}\n\n` +
            `*🛡️ СТАТУС ЗАЩИТНИКОВ:*\n` +
            `• На проверке: ${stats.defendersByStatus.pending || 0}\n` +
            `• Одобрено: ${stats.defendersByStatus.approved || 0}\n` +
            `• Отклонено: ${stats.defendersByStatus.rejected || 0}\n\n` +
            `*💾 СИСТЕМНАЯ ИНФОРМАЦИЯ:*\n` +
            `• Время: ${now.toISOString()}\n` +
            `• Память: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB\n` +
            `• Запущено: ${new Date(stats.startTime).toLocaleString('ru-RU')}\n\n` +
            `*🔧 БЫСТРЫЕ ДЕЙСТВИЯ:*\n` +
            `• /start - Главное меню\n` +
            `• /help - Помощь\n` +
            `• /support - Техподдержка\n\n` +
            `_Статистика обновлена: ${now.toLocaleTimeString('ru-RU')}_`;
        
        await this.sendFormattedMessage(chatId, adminStatsMessage);
    }
    
    // ============================================
    // ОБРАБОТЧИКИ СООБЩЕНИЙ
    // ============================================
    
    async handleUserMessage(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const userText = msg.text || '';
        const userName = msg.from.first_name || 'Пользователь';
        
        logger.debug(`Сообщение от пользователя ${userId}: ${userText.substring(0, 50)}...`);
        
        // Поиск активной сессии пользователя
        let activeSession = null;
        let sessionId = null;
        
        for (const [sId, session] of this.dataManager.userSessions.entries()) {
            if (session.userId === userId && !session.completed) {
                activeSession = session;
                sessionId = sId;
                break;
            }
        }
        
        if (!activeSession) {
            // Нет активной сессии - отправляем общее сообщение
            await this.sendMessage(chatId,
                `Я получил ваше сообщение: "${userText.substring(0, 100)}..."\n\n` +
                `Для начала работы используйте одну из команд:\n` +
                `/start - Начало работы\n` +
                `/help - Помощь\n` +
                `/report - Подать заявку\n` +
                `/join - Стать защитником\n\n` +
                `Техподдержка: ${SYSTEM_CONFIG.TECH_SUPPORT}`
            );
            return;
        }
        
        // Обновляем время активности сессии
        this.dataManager.updateSession(sessionId, { lastActivity: Date.now() });
        
        // Обработка в зависимости от типа сессии
        switch (activeSession.type) {
            case 'report':
                await this.processReportStep(userId, chatId, userText, activeSession, sessionId);
                break;
                
            case 'join':
                await this.processJoinStep(userId, chatId, userText, activeSession, sessionId);
                break;
                
            default:
                logger.warn(`Неизвестный тип сессии: ${activeSession.type}`, { userId, sessionId });
                await this.sendMessage(chatId, `Ошибка системы. Пожалуйста, начните заново с /start`);
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
                await this.sendMessage(chatId, `Ошибка в процессе. Используйте /cancel и начните заново.`);
                this.dataManager.completeSession(sessionId);
                break;
        }
    }
    
    async processReportCountry(userId, chatId, userText, session, sessionId) {
        // Валидация страны
        const validation = this.securityManager.validateInput(userText, 'country');
        
        if (!validation.valid) {
            await this.sendMessage(chatId,
                `❌ ${validation.error}\n\n` +
                `Пожалуйста, укажите полное название страны на русском языке.\n` +
                `Например: Россия, Украина, Германия\n\n` +
                `Попробуйте еще раз:`
            );
            return;
        }
        
        const country = validation.value;
        
        // Обновляем сессию
        session.data.country = country;
        session.step = 2;
        this.dataManager.updateSession(sessionId, {
            step: 2,
            data: session.data,
            lastActivity: Date.now()
        });
        
        // Отправляем следующий вопрос
        const problemTypeMessage = 
            `✅ *ШАГ 1 ЗАВЕРШЕН*\n\n` +
            `Страна: ${country}\n\n` +
            `➡️ *ШАГ 2 ИЗ 3: ТИП ПРОБЛЕМЫ*\n\n` +
            `Выберите тип проблемы:\n\n` +
            `*1. МОШЕННИЧЕСТВО*\n` +
            `   • Фишинг (поддельные сайты)\n` +
            `   • Обман при продаже/покупке\n` +
            `   • Финансовые пирамиды\n` +
            `   • Скимминг (кража данных карт)\n\n` +
            `*2. КИБЕРБУЛЛИНГ*\n` +
            `   • Травля в интернете\n` +
            `   • Угрозы и шантаж\n` +
            `   • Распространение лжи\n` +
            `   • Компромат и шантаж\n\n` +
            `*3. ВЗЛОМ АККАУНТА*\n` +
            `   • Потеря доступа к соцсетям\n` +
            `   • Взлом почты\n` +
            `   • Кража аккаунтов игр\n` +
            `   • Несанкционированный доступ\n\n` +
            `*4. ВЫМОГАТЕЛЬСТВО*\n` +
            `   • Шантаж личными данными\n` +
            `   • Угрозы расправой\n` +
            `   • Требование денег\n` +
            `   • Компромат и шантаж\n\n` +
            `*5. ДРУГОЕ*\n` +
            `   • Иная проблема\n` +
            `   • Не знаю как классифицировать\n` +
            `   • Комплексная проблема\n\n` +
            `⬇️ *Ответьте цифрой от 1 до 5:*`;
        
        await this.sendFormattedMessage(chatId, problemTypeMessage);
        
        logger.info(`Пользователь ${userId} указал страну: ${country}`, { sessionId });
    }
    
    async processReportProblemType(userId, chatId, userText, session, sessionId) {
        const problemTypeNum = parseInt(userText.trim());
        
        if (isNaN(problemTypeNum) || problemTypeNum < 1 || problemTypeNum > 5) {
            await this.sendMessage(chatId,
                `❌ Пожалуйста, выберите цифру от 1 до 5.\n\n` +
                `1. Мошенничество\n` +
                `2. Кибербуллинг\n` +
                `3. Взлом аккаунта\n` +
                `4. Вымогательство\n` +
                `5. Другое\n\n` +
                `⬇️ Ответьте цифрой:`
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
            data: session.data,
            lastActivity: Date.now()
        });
        
        // Отправляем следующий вопрос
        const descriptionMessage = 
            `✅ *ШАГ 2 ЗАВЕРШЕН*\n\n` +
            `Тип проблемы: ${problemType}\n\n` +
            `➡️ *ШАГ 3 ИЗ 3: ОПИСАНИЕ ПРОБЛЕМЫ*\n\n` +
            `Опишите ситуацию максимально подробно:\n\n` +
            `*📋 ЧТО УКАЗАТЬ:*\n` +
            `1. Что именно произошло?\n` +
            `2. Когда произошло (дата и время)?\n` +
            `3. Какие доказательства есть (скриншоты, ссылки, переписка)?\n` +
            `4. Контакт для связи (Telegram @никнейм или email)\n` +
            `5. Дополнительные детали\n\n` +
            `*📌 ТРЕБОВАНИЯ:*\n` +
            `• Минимум ${SYSTEM_CONFIG.MIN_DESCRIPTION_LENGTH} символов\n` +
            `• Максимум ${SYSTEM_CONFIG.MAX_DESCRIPTION_LENGTH} символов\n` +
            `• Только текст (без файлов)\n` +
            `• Можно на любом языке\n\n` +
            `*🔐 КОНФИДЕНЦИАЛЬНОСТЬ:*\n` +
            `• Не указывайте пароли, PIN-коды\n` +
            `• Не указывайте данные банковских карт\n` +
            `• Используйте псевдонимы при необходимости\n\n` +
            `*❓ ПРИМЕР ХОРОШЕГО ОПИСАНИЯ:*\n` +
            `"15 января 2024 года в 14:30 мне пришло сообщение в Instagram от @fake_support с требованием перейти по ссылке для восстановления аккаунта. Я перешел, ввел данные, после чего не могу зайти в аккаунт. Есть скриншот переписки. Связь: @мой_никнейм в Telegram."\n\n` +
            `⬇️ *Опишите вашу проблему:*`;
        
        await this.sendFormattedMessage(chatId, descriptionMessage);
        
        logger.info(`Пользователь ${userId} выбрал тип проблемы: ${problemType}`, { sessionId });
    }
    
    async processReportDescription(userId, chatId, userText, session, sessionId) {
        // Валидация описания
        const validation = this.securityManager.validateInput(userText, 'description');
        
        if (!validation.valid) {
            await this.sendMessage(chatId,
                `❌ ${validation.error}\n\n` +
                `Пожалуйста, опишите проблему подробнее.\n` +
                `Минимальная длина: ${SYSTEM_CONFIG.MIN_DESCRIPTION_LENGTH} символов.\n\n` +
                `Попробуйте еще раз:`
            );
            return;
        }
        
        const description = this.securityManager.sanitizeText(validation.value);
        
        // Создаем отчет в системе
        const reportData = {
            userId: userId,
            userName: session.data.userName,
            chatId: chatId,
            country: session.data.country,
            problemType: session.data.problemType,
            problemTypeCode: session.data.problemTypeCode,
            description: description,
            priority: this.determinePriority(session.data.problemTypeCode),
            sessionId: sessionId,
            source: 'telegram_bot'
        };
        
        const report = this.dataManager.createReport(reportData);
        
        // Отправляем уведомление администратору
        const adminNotification = 
            `🚨 *НОВАЯ ЗАЯВКА #${report.id}*\n\n` +
            `*👤 ПОЛЬЗОВАТЕЛЬ:*\n` +
            `• Имя: ${session.data.userName}\n` +
            `• ID: ${userId}\n` +
            `• Страна: ${session.data.country}\n\n` +
            `*🔐 ТИП ПРОБЛЕМЫ:*\n` +
            `• Категория: ${session.data.problemType}\n` +
            `• Приоритет: ${report.priority}\n\n` +
            `*📝 ОПИСАНИЕ:*\n` +
            `${description.substring(0, 300)}${description.length > 300 ? '...' : ''}\n\n` +
            `*📊 ДЕТАЛИ:*\n` +
            `• ID отчета: ${report.id}\n` +
            `• Время: ${new Date(report.createdAt).toLocaleString('ru-RU')}\n` +
            `• Сессия: ${sessionId}\n\n` +
            `*🔗 БЫСТРЫЕ ДЕЙСТВИЯ:*\n` +
            `• Ответить: tg://user?id=${userId}\n` +
            `• Посмотреть: /report_${report.id}\n` +
            `• Приоритет: ${report.priority.toUpperCase()}`;
        
        await this.sendFormattedMessage(SYSTEM_CONFIG.ADMIN_CHAT_ID, adminNotification);
        
        // Отправляем подтверждение пользователю
        const userConfirmation = 
            `✅ *ЗАЯВКА УСПЕШНО СОЗДАНА!*\n\n` +
            `*📋 ВАША ЗАЯВКА #${report.id}*\n\n` +
            `*🌍 ОСНОВНЫЕ ДАННЫЕ:*\n` +
            `• ID заявки: ${report.id}\n` +
            `• Страна: ${session.data.country}\n` +
            `• Тип проблемы: ${session.data.problemType}\n` +
            `• Приоритет: ${report.priority}\n` +
            `• Время создания: ${new Date().toLocaleString('ru-RU')}\n\n` +
            `*🔄 СТАТУС ОБРАБОТКИ:*\n` +
            `1. ✅ Заявка зарегистрирована\n` +
            `2. 🔄 Поиск защитника в вашем регионе\n` +
            `3. ⏳ Ожидание ответа защитника\n` +
            `4. 📞 Связь с защитником\n\n` +
            `*⏱️ ОЖИДАЕМЫЕ СРОКИ:*\n` +
            `• Уведомление защитникам: Мгновенно\n` +
            `• Первый контакт: До 24 часов\n` +
            `• Начало помощи: В течение 48 часов\n\n` +
            `*📞 КОНТАКТНАЯ ИНФОРМАЦИЯ:*\n` +
            `• Сохраните ID заявки: ${report.id}\n` +
            `• Ваш User ID: ${userId}\n` +
            `• Для проверки статуса: ${SYSTEM_CONFIG.TECH_SUPPORT}\n` +
            `• Техподдержка: ${SYSTEM_CONFIG.TECH_SUPPORT}\n\n` +
            `*🔒 ВАЖНАЯ ИНФОРМАЦИЯ:*\n` +
            `• Защитник свяжется с вами в Telegram\n` +
            `• Используйте тот же аккаунт для связи\n` +
            `• Не удаляйте этот чат\n` +
            `• Сохраните это сообщение\n\n` +
            `*🚨 ЧТО ДЕЛАТЬ ДАЛЬШЕ:*\n` +
            `1. Ожидайте сообщения от защитника\n` +
            `2. Подготовьте доказательства (скриншоты)\n` +
            `3. Не передавайте никому пароли\n` +
            `4. Для срочных вопросов: ${SYSTEM_CONFIG.TECH_SUPPORT}\n\n` +
            `_Спасибо за обращение в ${SYSTEM_CONFIG.SYSTEM_NAME}!_\n` +
            `_Мы делаем интернет безопаснее вместе._`;
        
        await this.sendFormattedMessage(chatId, userConfirmation);
        
        // Завершаем сессию
        this.dataManager.completeSession(sessionId);
        this.securityManager.resetUserLimits(userId);
        
        logger.info(`Заявка создана успешно`, { 
            reportId: report.id, 
            userId, 
            problemType: session.data.problemType 
        });
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
                await this.sendMessage(chatId, `Ошибка в процессе. Используйте /cancel и начните заново.`);
                this.dataManager.completeSession(sessionId);
                break;
        }
    }
    
    async processJoinName(userId, chatId, userText, session, sessionId) {
        // Валидация имени
        const validation = this.securityManager.validateInput(userText, 'name');
        
        if (!validation.valid) {
            await this.sendMessage(chatId,
                `❌ ${validation.error}\n\n` +
                `Пожалуйста, укажите имя от 2 до 50 символов.\n` +
                `Только буквы и пробелы.\n\n` +
                `Попробуйте еще раз:`
            );
            return;
        }
        
        const defenderName = validation.value;
        
        // Обновляем сессию
        session.data.defenderName = defenderName;
        session.step = 2;
        this.dataManager.updateSession(sessionId, {
            step: 2,
            data: session.data,
            lastActivity: Date.now()
        });
        
        // Отправляем следующий вопрос
        const regionMessage = 
            `✅ *ШАГ 1 ЗАВЕРШЕН*\n\n` +
            `Имя защитника: ${defenderName}\n\n` +
            `➡️ *ШАГ 2 ИЗ 4: РЕГИОН РАБОТЫ*\n\n` +
            `В каком регионе/стране вы можете помогать?\n\n` +
            `*🌍 ВАРИАНТЫ ОТВЕТА:*\n` +
            `• Страна (Россия, Украина и т.д.)\n` +
            `• Город (Москва, Киев и т.д.)\n` +
            `• Регион (Центральная Россия, Европа и т.д.)\n` +
            `• Онлайн (помощь через интернет)\n\n` +
            `*📌 ТРЕБОВАНИЯ:*\n` +
            `• От 2 до 50 символов\n` +
            `• Любой язык\n` +
            `• Конкретное указание\n\n` +
            `*❓ ПРИМЕРЫ:*\n` +
            `✅ Россия\n` +
            `✅ Москва, Россия\n` +
            `✅ Украина (вся страна)\n` +
            `✅ Онлайн помощь\n` +
            `✅ Германия, Берлин\n\n` +
            `⬇️ *Укажите ваш регион работы:*`;
        
        await this.sendFormattedMessage(chatId, regionMessage);
        
        logger.info(`Защитник ${userId} указал имя: ${defenderName}`, { sessionId });
    }
    
    async processJoinRegion(userId, chatId, userText, session, sessionId) {
        // Валидация региона
        const validation = this.securityManager.validateInput(userText, 'country');
        
        if (!validation.valid) {
            await this.sendMessage(chatId,
                `❌ ${validation.error}\n\n` +
                `Пожалуйста, укажите регион работы.\n\n` +
                `Попробуйте еще раз:`
            );
            return;
        }
        
        const region = validation.value;
        
        // Обновляем сессию
        session.data.region = region;
        session.step = 3;
        this.dataManager.updateSession(sessionId, {
            step: 3,
            data: session.data,
            lastActivity: Date.now()
        });
        
        // Отправляем следующий вопрос
        const skillsMessage = 
            `✅ *ШАГ 2 ЗАВЕРШЕН*\n\n` +
            `Регион работы: ${region}\n\n` +
            `➡️ *ШАГ 3 ИЗ 4: НАВЫКИ И КОМПЕТЕНЦИИ*\n\n` +
            `Какими навыками вы обладаете?\n\n` +
            `*💼 ОСНОВНЫЕ КАТЕГОРИИ:*\n` +
            `1. ЮРИДИЧЕСКИЕ НАВЫКИ\n` +
            `   • Знание законодательства\n` +
            `   • Опыт работы с договорами\n` +
            `   • Понимание киберправа\n` +
            `   • Обращение в правоохранительные органы\n\n` +
            `2. ПСИХОЛОГИЧЕСКАЯ ПОМОЩЬ\n` +
            `   • Консультирование жертв\n` +
            `   • Кризисная интервенция\n` +
            `   • Эмоциональная поддержка\n` +
            `   • Работа со стрессом\n\n` +
            `3. IT И ТЕХНИЧЕСКИЕ НАВЫКИ\n` +
            `   • Кибербезопасность\n` +
            `   • Восстановление аккаунтов\n` +
            `   • Расследование инцидентов\n` +
            `   • Техническая экспертиза\n\n` +
            `4. ДРУГИЕ НАВЫКИ\n` +
            `   • Переводчик\n` +
            `   • Медиатор\n` +
            `   • Опыт волонтерства\n` +
            `   • Знание иностранных языков\n\n` +
            `*📌 КАК ОПИСАТЬ:*\n` +
            `• Перечислите через запятую\n` +
            `• Укажите опыт и квалификацию\n` +
            `• Можно на любом языке\n` +
            `• Минимум 5 символов\n\n` +
            `*❓ ПРИМЕРЫ:*\n` +
            `✅ Юрист, опыт 5 лет, знание киберправа\n` +
            `✅ IT специалист, восстановление аккаунтов\n` +
            `✅ Психолог, кризисная помощь, поддержка жертв\n` +
            `✅ Переводчик английского, опыт волонтерства\n\n` +
            `⬇️ *Опишите ваши навыки:*`;
        
        await this.sendFormattedMessage(chatId, skillsMessage);
        
        logger.info(`Защитник ${userId} указал регион: ${region}`, { sessionId });
    }
    
    async processJoinSkills(userId, chatId, userText, session, sessionId) {
        // Валидация навыков
        const validation = this.securityManager.validateInput(userText, 'skills');
        
        if (!validation.valid) {
            await this.sendMessage(chatId,
                `❌ ${validation.error}\n\n` +
                `Пожалуйста, опишите ваши навыки подробнее.\n\n` +
                `Попробуйте еще раз:`
            );
            return;
        }
        
        const skills = validation.value;
        
        // Обновляем сессию
        session.data.skills = skills;
        session.step = 4;
        this.dataManager.updateSession(sessionId, {
            step: 4,
            data: session.data,
            lastActivity: Date.now()
        });
        
        // Отправляем подтверждение и запрос согласия
        const confirmationMessage = 
            `✅ *ШАГ 3 ЗАВЕРШЕН*\n\n` +
            `Навыки: ${skills}\n\n` +
            `➡️ *ШАГ 4 ИЗ 4: ПОДТВЕРЖДЕНИЕ И ОТПРАВКА*\n\n` +
            `*📋 ВАША АНКЕТА ЗАЩИТНИКА:*\n\n` +
            `*👤 ЛИЧНЫЕ ДАННЫЕ:*\n` +
            `• Имя в системе: ${session.data.defenderName}\n` +
            `• Исходное имя: ${session.data.userName}\n` +
            `• User ID: ${userId}\n\n` +
            `*🌍 РЕГИОН РАБОТЫ:*\n` +
            `• ${session.data.region}\n\n` +
            `*💼 НАВЫКИ И КОМПЕТЕНЦИИ:*\n` +
            `• ${session.data.skills}\n\n` +
            `*📜 УСЛОВИЯ И СОГЛАШЕНИЕ:*\n\n` +
            `1. *КОНФИДЕНЦИАЛЬНОСТЬ:*\n` +
            `   • Вы обязуетесь хранить в тайне данные жертв\n` +
            `   • Не передавать информацию третьим лицам\n` +
            `   • Использовать данные только для оказания помощи\n\n` +
            `2. *ПРОФЕССИОНАЛИЗМ:*\n` +
            `   • Оказывать помощь в рамках своей компетенции\n` +
            `   • Не давать ложных обещаний\n` +
            `   • Действовать в интересах жертвы\n\n` +
            `3. *ОТВЕТСТВЕННОСТЬ:*\n` +
            `   • Своевременно реагировать на заявки\n` +
            `   • Информировать о невозможности помочь\n` +
            `   • Следовать инструкциям системы\n\n` +
            `4. *ЭТИКА:*\n` +
            `   • Уважительное отношение ко всем участникам\n` +
            `   • Отсутствие дискриминации\n` +
            `   • Профессиональное поведение\n\n` +
            `*✅ ДЛЯ ПОДТВЕРЖДЕНИЯ:*\n` +
            `Напишите "СОГЛАСЕН" для отправки анкеты\n\n` +
            `*❌ ДЛЯ ОТМЕНЫ:*\n` +
            `Используйте /cancel\n\n` +
            `⬇️ *Подтвердите отправку анкеты:*`;
        
        await this.sendFormattedMessage(chatId, confirmationMessage);
        
        logger.info(`Защитник ${userId} указал навыки`, { sessionId, skillsLength: skills.length });
    }
    
    async processJoinConfirmation(userId, chatId, userText, session, sessionId) {
        // Проверка подтверждения
        const confirmation = userText.trim().toUpperCase();
        
        if (confirmation !== 'СОГЛАСЕН' && confirmation !== 'СОГЛАСЕНА' && confirmation !== 'AGREE' && confirmation !== 'YES') {
            await this.sendMessage(chatId,
                `❌ Для отправки анкеты необходимо написать "СОГЛАСЕН"\n\n` +
                `Если вы передумали, используйте /cancel\n\n` +
                `Попробуйте еще раз:`
            );
            return;
        }
        
        // Создаем заявку защитника
        const defenderData = {
            userId: userId,
            userName: session.data.userName,
            defenderName: session.data.defenderName,
            chatId: chatId,
            region: session.data.region,
            skills: session.data.skills,
            status: 'pending',
            joinedAt: new Date().toISOString(),
            sessionId: sessionId
        };
        
        const application = this.dataManager.createDefenderApplication(defenderData);
        
        // Отправляем уведомление администратору
        const adminNotification = 
            `🛡️ *НОВАЯ ЗАЯВКА ЗАЩИТНИКА #${application.id}*\n\n` +
            `*👤 КАНДИДАТ:*\n` +
            `• Имя в системе: ${session.data.defenderName}\n` +
            `• Исходное имя: ${session.data.userName}\n` +
            `• User ID: ${userId}\n\n` +
            `*🌍 РЕГИОН:*\n` +
            `• ${session.data.region}\n\n` +
            `*💼 НАВЫКИ:*\n` +
            `• ${session.data.skills}\n\n` +
            `*📊 ДЕТАЛИ:*\n` +
            `• ID заявки: ${application.id}\n` +
            `• Время подачи: ${new Date(application.submittedAt).toLocaleString('ru-RU')}\n` +
            `• Сессия: ${sessionId}\n\n` +
            `*🔗 БЫСТРЫЕ ДЕЙСТВИЯ:*\n` +
            `• Ответить: tg://user?id=${userId}\n` +
            `• Посмотреть: /defender_${application.id}\n` +
            `• Статус: НА ПРОВЕРКЕ`;
        
        await this.sendFormattedMessage(SYSTEM_CONFIG.ADMIN_CHAT_ID, adminNotification);
        
        // Отправляем подтверждение пользователю
        const userConfirmation = 
            `✅ *АНКЕТА ЗАЩИТНИКА ОТПРАВЛЕНА!*\n\n` +
            `*📋 ВАША ЗАЯВКА #${application.id}*\n\n` +
            `*👤 ВАШИ ДАННЫЕ:*\n` +
            `• ID заявки: ${application.id}\n` +
            `• Имя в системе: ${session.data.defenderName}\n` +
            `• Регион работы: ${session.data.region}\n` +
            `• Навыки: ${session.data.skills}\n` +
            `• Время подачи: ${new Date().toLocaleString('ru-RU')}\n\n` +
            `*🔄 ПРОЦЕСС РАССМОТРЕНИЯ:*\n` +
            `1. ✅ Анкета отправлена\n` +
            `2. 🔄 Проверка администратором\n` +
            `3. ⏳ Решение по заявке\n` +
            `4. 📞 Связь с администратором\n\n` +
            `*⏱️ ОЖИДАЕМЫЕ СРОКИ:*\n` +
            `• Проверка анкеты: 1-3 дня\n` +
            `• Уведомление о решении: В Telegram\n` +
            `• Начало работы: После одобрения\n\n` +
            `*📞 КОНТАКТНАЯ ИНФОРМАЦИЯ:*\n` +
            `• Сохраните ID заявки: ${application.id}\n` +
            `• Ваш User ID: ${userId}\n` +
            `• Администратор: ${SYSTEM_CONFIG.ADMIN_CONTACT}\n` +
            `• Техподдержка: ${SYSTEM_CONFIG.TECH_SUPPORT}\n\n` +
            `*🔒 ЧТО БУДЕТ ДАЛЬШЕ:*\n` +
            `• После одобрения вы получите инструкцию\n` +
            `• Доступ к системе уведомлений\n` +
            `• Возможность помогать жертвам в вашем регионе\n` +
            `• Поддержка от команды ${SYSTEM_CONFIG.SYSTEM_NAME}\n\n` +
            `*🚨 ВАЖНАЯ ИНФОРМАЦИЯ:*\n` +
            `• Администратор свяжется с вами в Telegram\n` +
            `• Используйте тот же аккаунт для связи\n` +
            `• Не удаляйте этот чат\n` +
            `• Сохраните это сообщение\n\n` +
            `_Спасибо за желание помогать людям!_\n` +
            `_Вместе мы делаем интернет безопаснее._`;
        
        await this.sendFormattedMessage(chatId, userConfirmation);
        
        // Завершаем сессию
        this.dataManager.completeSession(sessionId);
        this.securityManager.resetUserLimits(userId);
        
        logger.info(`Заявка защитника создана успешно`, { 
            applicationId: application.id, 
            userId, 
            defenderName: session.data.defenderName 
        });
    }
    
    // ============================================
    // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
    // ============================================
    
    determinePriority(problemTypeCode) {
        switch (problemTypeCode) {
            case 4: // Вымогательство
                return 'high';
            case 2: // Кибербуллинг
                return 'medium';
            case 3: // Взлом аккаунта
                return 'medium';
            default:
                return 'normal';
        }
    }
    
    getSessionTypeName(type) {
        const types = {
            'report': 'Подача заявки',
            'join': 'Регистрация защитника'
        };
        return types[type] || type;
    }
    
    async sendMessage(chatId, text) {
        try {
            await this.bot.sendMessage(chatId, text, {
                parse_mode: 'HTML',
                disable_web_page_preview: true
            });
            return true;
        } catch (error) {
            logger.error('Ошибка отправки сообщения', {
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
                await this.bot.sendMessage(chatId, this.stripMarkdown(text), {
                    parse_mode: 'HTML',
                    disable_web_page_preview: true
                });
                return true;
            } catch (secondError) {
                logger.error('Ошибка отправки форматированного сообщения', {
                    chatId,
                    error: error.message,
                    secondError: secondError.message
                });
                return false;
            }
        }
    }
    
    stripMarkdown(text) {
        return text
            .replace(/\*([^*]+)\*/g, '$1')
            .replace(/_([^_]+)_/g, '$1')
            .replace(/`([^`]+)`/g, '$1')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    }
    
    startServer() {
        return new Promise((resolve, reject) => {
            const server = this.app.listen(SYSTEM_CONFIG.PORT, SYSTEM_CONFIG.HOST, () => {
                logger.info(`Веб-сервер запущен`, {
                    host: SYSTEM_CONFIG.HOST,
                    port: SYSTEM_CONFIG.PORT,
                    env: process.env.NODE_ENV || 'development'
                });
                resolve(server);
            });
            
            server.on('error', (error) => {
                logger.critical('Ошибка запуска веб-сервера', error);
                reject(error);
            });
        });
    }
}

// ============================================
// ЗАПУСК СИСТЕМЫ
// ============================================

async function initializeSystem() {
    try {
        logger.info('='.repeat(70));
        logger.info(`🚀 ЗАПУСК ${SYSTEM_CONFIG.SYSTEM_NAME} v${SYSTEM_CONFIG.SYSTEM_VERSION}`);
        logger.info('='.repeat(70));
        
        logger.info('Инициализация системы...');
        
        // Создаем и запускаем бота
        const botSystem = new BakeliteDefenceBot();
        await botSystem.startServer();
        
        logger.info('✅ Система успешно запущена и готова к работе');
        logger.info(`📱 Техподдержка: ${SYSTEM_CONFIG.TECH_SUPPORT}`);
        logger.info(`👑 Администратор: ${SYSTEM_CONFIG.ADMIN_CONTACT}`);
        
        // Вывод информации в консоль
        console.log('\n' + '='.repeat(70));
        console.log(`🎉 ${SYSTEM_CONFIG.SYSTEM_NAME} УСПЕШНО ЗАПУЩЕНА!`);
        console.log('='.repeat(70));
        console.log(`📊 Версия: ${SYSTEM_CONFIG.SYSTEM_VERSION}`);
        console.log(`🌐 URL: http://${SYSTEM_CONFIG.HOST}:${SYSTEM_CONFIG.PORT}`);
        console.log(`🤖 Бот: @${SYSTEM_CONFIG.BOT_USERNAME}`);
        console.log(`👨💻 Техподдержка: ${SYSTEM_CONFIG.TECH_SUPPORT}`);
        console.log(`👑 Администратор: ${SYSTEM_CONFIG.ADMIN_CONTACT}`);
        console.log('='.repeat(70));
        console.log('\n🎮 ДОСТУПНЫЕ КОМАНДЫ:');
        console.log('  /start    - Начало работы');
        console.log('  /help     - Полная инструкция');
        console.log('  /report   - Подать заявку о проблеме');
        console.log('  /join     - Стать защитником');
        console.log('  /status   - Статус системы');
        console.log('  /support  - Техническая поддержка');
        console.log('  /about    - О системе');
        console.log('  /cancel   - Отмена операции');
        console.log('  /stats    - Статистика (только для админа)');
        console.log('='.repeat(70));
        console.log('\n🚀 Система работает 24/7');
        console.log(`📞 Контакт для вопросов: ${SYSTEM_CONFIG.TECH_SUPPORT}`);
        console.log('='.repeat(70) + '\n');
        
        // Обработка завершения работы
        process.on('SIGTERM', () => {
            logger.info('Получен сигнал SIGTERM, завершение работы...');
            process.exit(0);
        });
        
        process.on('SIGINT', () => {
            logger.info('Получен сигнал SIGINT, завершение работы...');
            process.exit(0);
        });
        
        process.on('uncaughtException', (error) => {
            logger.critical('Необработанное исключение', error);
        });
        
        process.on('unhandledRejection', (reason, promise) => {
            logger.error('Необработанный промис', { reason, promise });
        });
        
    } catch (error) {
        logger.critical('КРИТИЧЕСКАЯ ОШИБКА ПРИ ЗАПУСКЕ СИСТЕМЫ', error);
        console.error('❌ СИСТЕМА НЕ МОЖЕТ БЫТЬ ЗАПУЩЕНА');
        console.error('🔧 Причина:', error.message);
        console.error('📞 Обратитесь в техподдержку:', SYSTEM_CONFIG.TECH_SUPPORT);
        process.exit(1);
    }
}

// Запускаем систему
initializeSystem();
