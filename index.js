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
            `  
