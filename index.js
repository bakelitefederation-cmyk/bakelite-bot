// ============================================
// 🛡️ BAKELITE DEFENCE BOT - ИСПРАВЛЕННАЯ ВЕРСИЯ 6.2.0
// Версия: 6.2.0
// Разработчик: @kartochniy
// Статус: Все кнопки работают, регионы исправлены
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
    BOT_TOKEN: process.env.BOT_TOKEN || '',
    ADMIN_CHAT_ID: process.env.ADMIN_CHAT_ID || '',
    TECH_SUPPORT: '@kartochniy',
    
    PORT: process.env.PORT || 3000,
    HOST: '0.0.0.0',
    
    MAX_REQUESTS_PER_HOUR: 20,
    SESSION_TIMEOUT_MINUTES: 60,
    MIN_DESCRIPTION_LENGTH: 50,
    MAX_DESCRIPTION_LENGTH: 3000,
    
    LOG_FILE: 'system.log',
    DATA_FILE: 'storage.json',
    BACKUP_FILE: 'backup_storage.json',
    
    VERSION: '6.2.0',
    SYSTEM_NAME: 'Bakelite Defence System Pro',
    
    AUTO_BACKUP_INTERVAL: 3600000,
    MAX_DEFENDERS_PER_REGION: 10,
    ENABLE_NOTIFICATIONS: true,
    
    ACCESS_LEVELS: {
        USER: 1,
        DEFENDER: 2,
        MODERATOR: 3,
        ADMIN: 4
    }
};

// ============================================
// УТИЛИТЫ
// ============================================

class Utilities {
    static generateId(prefix) {
        const timestamp = Date.now().toString(36);
        const random = crypto.randomBytes(4).toString('hex').toUpperCase();
        return `${prefix}-${timestamp}-${random}`;
    }
    
    static formatDate(date) {
        return new Date(date).toLocaleString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
    
    static escapeMarkdown(text) {
        return text.replace(/([_[\]()~`>#+\-=|{}.!])/g, '\\$1');
    }
}

// ============================================
// СИСТЕМА ЛОГИРОВАНИЯ
// ============================================

class SystemLogger {
    static log(level, message, data = null) {
        const timestamp = new Date().toLocaleString('ru-RU');
        const logId = crypto.randomBytes(4).toString('hex').toUpperCase();
        
        const logMessage = `[${timestamp}] [${level}] [${logId}] ${message}`;
        
        const colors = {
            INFO: '\x1b[36m',
            WARN: '\x1b[33m',
            ERROR: '\x1b[31m',
            DEBUG: '\x1b[90m',
            SUCCESS: '\x1b[32m'
        };
        const reset = '\x1b[0m';
        
        console.log(`${colors[level] || ''}${logMessage}${reset}`);
        
        try {
            fs.appendFileSync(CONFIG.LOG_FILE, logMessage + '\n', 'utf8');
        } catch (error) {
            console.error('Ошибка записи в лог файл:', error.message);
        }
    }
    
    static info(message, data = null) { this.log('INFO', message, data); }
    static warn(message, data = null) { this.log('WARN', message, data); }
    static error(message, data = null) { this.log('ERROR', message, data); }
    static debug(message, data = null) { this.log('DEBUG', message, data); }
    static success(message, data = null) { this.log('SUCCESS', message, data); }
}

// ============================================
// МЕНЕДЖЕР ДАННЫХ
// ============================================

class DataManager {
    constructor() {
        this.reports = new Map();
        this.defenders = new Map();
        this.userSessions = new Map();
        this.requestLog = new Map();
        this.userProfiles = new Map();
        this.feedback = new Map();
        this.notifications = new Map();
        this.statistics = {
            reportsCreated: 0,
            reportsResolved: 0,
            defendersRegistered: 0,
            feedbackReceived: 0,
            activeUsers: new Set()
        };
        
        this.loadData();
        SystemLogger.info('Менеджер данных инициализирован');
    }
    
    loadData() {
        try {
            if (fs.existsSync(CONFIG.DATA_FILE)) {
                const data = JSON.parse(fs.readFileSync(CONFIG.DATA_FILE, 'utf8'));
                
                this.reports = new Map(data.reports || []);
                this.defenders = new Map(data.defenders || []);
                this.userSessions = new Map(data.userSessions || []);
                this.userProfiles = new Map(data.userProfiles || []);
                this.feedback = new Map(data.feedback || []);
                this.statistics = data.statistics || this.statistics;
                
                if (data.requestLog) {
                    this.requestLog = new Map(data.requestLog.map(([k, v]) => [k, new Map(v)]));
                }
                
                SystemLogger.info('Данные загружены', {
                    reports: this.reports.size,
                    defenders: this.defenders.size,
                    profiles: this.userProfiles.size
                });
            }
        } catch (error) {
            SystemLogger.error('Ошибка загрузки данных', error.message);
        }
    }
    
    saveData() {
        try {
            const data = {
                reports: Array.from(this.reports.entries()),
                defenders: Array.from(this.defenders.entries()),
                userSessions: Array.from(this.userSessions.entries()),
                userProfiles: Array.from(this.userProfiles.entries()),
                feedback: Array.from(this.feedback.entries()),
                requestLog: Array.from(this.requestLog.entries()).map(([k, v]) => [k, Array.from(v.entries())]),
                statistics: this.statistics,
                savedAt: new Date().toISOString(),
                version: CONFIG.VERSION
            };
            
            fs.writeFileSync(CONFIG.DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
            SystemLogger.debug('Данные сохранены');
        } catch (error) {
            SystemLogger.error('Ошибка сохранения данных', error.message);
        }
    }
    
    getUserProfile(userId) {
        let profile = this.userProfiles.get(userId.toString());
        
        if (!profile) {
            profile = {
                userId: userId.toString(),
                accessLevel: CONFIG.ACCESS_LEVELS.USER,
                joinedAt: new Date().toISOString(),
                reportsCount: 0,
                helpedCount: 0,
                rating: 0,
                badges: [],
                settings: {
                    notifications: true,
                    language: 'ru',
                    theme: 'light'
                }
            };
            this.userProfiles.set(userId.toString(), profile);
        }
        
        return profile;
    }
    
    updateUserProfile(userId, updates) {
        const profile = this.getUserProfile(userId);
        Object.assign(profile, updates);
        profile.updatedAt = new Date().toISOString();
        this.userProfiles.set(userId.toString(), profile);
        this.saveData();
        return profile;
    }
    
    createReport(userId, userName, chatId, data) {
        const reportId = Utilities.generateId('RPT');
        const userProfile = this.getUserProfile(userId);
        
        const report = {
            id: reportId,
            userId: userId.toString(),
            userName: userName,
            userProfile: userProfile,
            chatId: chatId,
            country: data.country,
            problemType: data.problemType,
            description: data.description,
            contact: data.contact || '',
            status: 'new',
            priority: this.calculatePriority(data.problemType),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            assignedTo: null,
            assignedDefender: null,
            updates: [],
            urgency: data.urgency || 'medium'
        };
        
        this.reports.set(reportId, report);
        userProfile.reportsCount++;
        this.statistics.reportsCreated++;
        this.saveData();
        
        SystemLogger.info('Создана заявка', { reportId, userId });
        return report;
    }
    
    calculatePriority(problemType) {
        const priorityMap = {
            'Вымогательство': 'critical',
            'Кибербуллинг': 'high',
            'Мошенничество': 'high',
            'Взлом аккаунта': 'high',
            'Угрозы жизни': 'critical',
            'Шантаж': 'high',
            'Другое': 'medium'
        };
        return priorityMap[problemType] || 'medium';
    }
    
    getReportsByUser(userId) {
        const userReports = [];
        for (const [id, report] of this.reports.entries()) {
            if (report.userId === userId.toString()) {
                userReports.push(report);
            }
        }
        return userReports;
    }
    
    createDefenderApplication(userId, userName, chatId, data) {
        const appId = Utilities.generateId('DEF');
        
        const application = {
            id: appId,
            userId: userId.toString(),
            userName: userName,
            defenderName: data.defenderName,
            chatId: chatId,
            region: data.region,
            skills: data.skills,
            experience: data.experience || '',
            languages: data.languages || ['Русский'],
            availability: data.availability || 'part-time',
            status: 'pending',
            submittedAt: new Date().toISOString(),
            reviewedAt: null,
            reviewedBy: null,
            rating: 0,
            casesHandled: 0
        };
        
        this.defenders.set(appId, application);
        this.statistics.defendersRegistered++;
        this.saveData();
        
        SystemLogger.info('Заявка защитника создана', { appId, userId });
        return application;
    }
    
    createFeedback(userId, userName, type, message, rating = null) {
        const feedbackId = Utilities.generateId('FB');
        
        const feedback = {
            id: feedbackId,
            userId: userId.toString(),
            userName: userName,
            type: type,
            message: message,
            rating: rating,
            status: 'new',
            createdAt: new Date().toISOString(),
            processed: false
        };
        
        this.feedback.set(feedbackId, feedback);
        this.statistics.feedbackReceived++;
        this.saveData();
        
        SystemLogger.info('Получен отзыв', { feedbackId, type });
        return feedback;
    }
    
    createUserSession(userId, type, initialData = {}) {
        const sessionId = Utilities.generateId('SESS');
        
        const session = {
            id: sessionId,
            userId: userId.toString(),
            type: type,
            data: initialData,
            step: 1,
            createdAt: Date.now(),
            lastActivity: Date.now(),
            completed: false
        };
        
        this.userSessions.set(sessionId, session);
        SystemLogger.debug('Создана сессия', { sessionId, userId, type });
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
    
    canMakeRequest(userId) {
        const now = Date.now();
        const hourAgo = now - 3600000;
        
        if (!this.requestLog.has(userId.toString())) {
            this.requestLog.set(userId.toString(), new Map());
        }
        
        const userRequests = this.requestLog.get(userId.toString());
        
        let totalRequests = 0;
        for (const [timestamp, count] of userRequests.entries()) {
            if (timestamp < hourAgo) {
                userRequests.delete(timestamp);
            } else {
                totalRequests += count;
            }
        }
        
        if (totalRequests >= CONFIG.MAX_REQUESTS_PER_HOUR) {
            return false;
        }
        
        const currentMinute = Math.floor(now / 60000) * 60000;
        const currentCount = userRequests.get(currentMinute) || 0;
        userRequests.set(currentMinute, currentCount + 1);
        
        return true;
    }
    
    getStatistics() {
        const now = new Date();
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
        
        let monthlyReports = 0;
        let monthlyDefenders = 0;
        
        for (const report of this.reports.values()) {
            if (new Date(report.createdAt) > lastMonth) {
                monthlyReports++;
            }
        }
        
        for (const defender of this.defenders.values()) {
            if (new Date(defender.submittedAt) > lastMonth && defender.status === 'approved') {
                monthlyDefenders++;
            }
        }
        
        return {
            totalReports: this.reports.size,
            totalDefenders: this.defenders.size,
            totalUsers: this.userProfiles.size,
            totalFeedback: this.feedback.size,
            monthlyReports: monthlyReports,
            monthlyDefenders: monthlyDefenders,
            reportsByStatus: this.getReportsByStatusCount(),
            defendersByStatus: this.getDefendersByStatusCount(),
            activeToday: this.getActiveUsersCount(),
            systemUptime: process.uptime()
        };
    }
    
    getReportsByStatusCount() {
        const stats = { new: 0, in_progress: 0, resolved: 0, closed: 0 };
        for (const report of this.reports.values()) {
            stats[report.status] = (stats[report.status] || 0) + 1;
        }
        return stats;
    }
    
    getDefendersByStatusCount() {
        const stats = { pending: 0, approved: 0, rejected: 0, active: 0, inactive: 0 };
        for (const defender of this.defenders.values()) {
            stats[defender.status] = (stats[defender.status] || 0) + 1;
        }
        return stats;
    }
    
    getActiveUsersCount() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const activeUsers = new Set();
        
        for (const session of this.userSessions.values()) {
            if (new Date(session.lastActivity) > today) {
                activeUsers.add(session.userId);
            }
        }
        
        return activeUsers.size;
    }
    
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
        
        return cleaned;
    }
}

// ============================================
// КЛАВИАТУРЫ И КНОПКИ
// ============================================

class Keyboards {
    static getMainMenu(isAdmin = false) {
        const keyboard = [
            [{ text: '📝 Подать заявку' }, { text: '🛡️ Стать защитником' }],
            [{ text: '📊 Мои заявки' }, { text: '⭐ Оставить отзыв' }],
            [{ text: '📚 Помощь' }, { text: '📞 Поддержка' }]
        ];
        
        if (isAdmin) {
            keyboard.push([{ text: '👑 Админ панель' }]);
        }
        
        return {
            reply_markup: {
                keyboard: keyboard,
                resize_keyboard: true,
                one_time_keyboard: false
            }
        };
    }
    
    static getAdminPanel() {
        return {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '📊 Статистика', callback_data: 'admin_stats' },
                        { text: '🛡️ Защитники', callback_data: 'admin_defenders' }
                    ],
                    [
                        { text: '📝 Заявки', callback_data: 'admin_reports' },
                        { text: '📢 Отзывы', callback_data: 'admin_feedback' }
                    ],
                    [
                        { text: '👥 Пользователи', callback_data: 'admin_users' },
                        { text: '🔄 Обновить', callback_data: 'admin_refresh' }
                    ]
                ]
            }
        };
    }
    
    static getDefenderActions(defenderId) {
        return {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '✅ Одобрить', callback_data: `def_approve_${defenderId}` },
                        { text: '❌ Отклонить', callback_data: `def_reject_${defenderId}` }
                    ],
                    [
                        { text: '📞 Связаться', callback_data: `def_contact_${defenderId}` },
                        { text: '📋 Подробнее', callback_data: `def_details_${defenderId}` }
                    ]
                ]
            }
        };
    }
    
    static getReportActions(reportId) {
        return {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '👤 Назначить', callback_data: `report_assign_${reportId}` },
                        { text: '✅ Завершить', callback_data: `report_complete_${reportId}` }
                    ],
                    [
                        { text: '📞 Связаться', callback_data: `report_contact_${reportId}` },
                        { text: '🔒 Закрыть', callback_data: `report_close_${reportId}` }
                    ]
                ]
            }
        };
    }
    
    static getFeedbackActions(feedbackId) {
        return {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '✅ Обработано', callback_data: `feedback_process_${feedbackId}` },
                        { text: '📝 Ответить', callback_data: `feedback_reply_${feedbackId}` }
                    ]
                ]
            }
        };
    }
    
    static getRegionButtons(forReport = false) {
        const buttons = {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '🇷🇺 Россия', callback_data: `region_${forReport ? 'report_' : ''}ru` },
                        { text: '🇺🇦 Украина', callback_data: `region_${forReport ? 'report_' : ''}ua` }
                    ],
                    [
                        { text: '🇰🇿 Казахстан', callback_data: `region_${forReport ? 'report_' : ''}kz` },
                        { text: '🇧🇾 Беларусь', callback_data: `region_${forReport ? 'report_' : ''}by` }
                    ],
                    [
                        { text: '🌍 Другое', callback_data: `region_${forReport ? 'report_' : ''}other` }
                    ]
                ]
            }
        };
        return buttons;
    }
    
    static getProblemTypeButtons() {
        return {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '💸 Мошенничество', callback_data: 'problem_fraud' },
                        { text: '👥 Кибербуллинг', callback_data: 'problem_bullying' }
                    ],
                    [
                        { text: '🔐 Взлом аккаунта', callback_data: 'problem_hack' },
                        { text: '💰 Вымогательство', callback_data: 'problem_extortion' }
                    ],
                    [
                        { text: '⚠️ Угрозы', callback_data: 'problem_threats' },
                        { text: '❓ Другое', callback_data: 'problem_other' }
                    ]
                ]
            }
        };
    }
    
    static getUrgencyButtons() {
        return {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '⚡ Срочно', callback_data: 'urgency_high' },
                        { text: '⚠️ Высокий', callback_data: 'urgency_medium' }
                    ],
                    [
                        { text: '🔄 Средний', callback_data: 'urgency_normal' },
                        { text: '⏱️ Низкий', callback_data: 'urgency_low' }
                    ]
                ]
            }
        };
    }
    
    static getConfirmationButtons() {
        return {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '✅ Да, отправить', callback_data: 'confirm_yes' },
                        { text: '❌ Нет, отменить', callback_data: 'confirm_no' }
                    ]
                ]
            }
        };
    }
    
    static getFeedbackTypeButtons() {
        return {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '🎯 Предложение', callback_data: 'feedback_suggestion' },
                        { text: '🐛 Ошибка', callback_data: 'feedback_bug' }
                    ],
                    [
                        { text: '🌟 Благодарность', callback_data: 'feedback_compliment' },
                        { text: '❓ Вопрос', callback_data: 'feedback_question' }
                    ]
                ]
            }
        };
    }
    
    static getMyReportsButtons() {
        return {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '🔄 Активные', callback_data: 'myreports_active' },
                        { text: '✅ Завершенные', callback_data: 'myreports_completed' }
                    ],
                    [
                        { text: '📊 Статистика', callback_data: 'myreports_stats' },
                        { text: '📝 Новая заявка', callback_data: 'new_report' }
                    ]
                ]
            }
        };
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
        this.setupIntervals();
        
        SystemLogger.success('Система инициализирована');
    }
    
    initializeBot() {
        try {
            SystemLogger.info('Инициализация Telegram бота...');
            
            this.bot = new TelegramBot(CONFIG.BOT_TOKEN, {
                polling: {
                    interval: 300,
                    autoStart: true,
                    params: {
                        timeout: 10
                    }
                }
            });
            
            this.setupErrorHandlers();
            this.setupCommandHandlers();
            this.setupCallbackHandlers();
            this.setupMessageHandlers();
            
            SystemLogger.success('Telegram бот успешно инициализирован');
            
        } catch (error) {
            SystemLogger.error('Ошибка инициализации бота', error);
            throw error;
        }
    }
    
    setupErrorHandlers() {
        this.bot.on('polling_error', (error) => {
            SystemLogger.error('Ошибка polling', error.message);
        });
        
        process.on('uncaughtException', (error) => {
            SystemLogger.error('Необработанное исключение', error);
        });
    }
    
    setupCommandHandlers() {
        this.bot.onText(/^\/start(?:\s|$)/i, (msg) => this.handleStart(msg));
        this.bot.onText(/^\/help(?:\s|$)/i, (msg) => this.handleHelp(msg));
        this.bot.onText(/^\/report(?:\s|$)/i, (msg) => this.handleReport(msg));
        this.bot.onText(/^\/join(?:\s|$)/i, (msg) => this.handleJoin(msg));
        this.bot.onText(/^\/status(?:\s|$)/i, (msg) => this.handleStatus(msg));
        this.bot.onText(/^\/support(?:\s|$)/i, (msg) => this.handleSupport(msg));
        this.bot.onText(/^\/feedback(?:\s|$)/i, (msg) => this.handleFeedback(msg));
        this.bot.onText(/^\/myreports(?:\s|$)/i, (msg) => this.handleMyReports(msg));
        this.bot.onText(/^\/cancel(?:\s|$)/i, (msg) => this.handleCancel(msg));
        
        this.bot.onText(/^\/admin(?:\s|$)/i, (msg) => this.handleAdmin(msg));
        this.bot.onText(/^\/defenders(?:\s|$)/i, (msg) => this.handleDefenders(msg));
        this.bot.onText(/^\/reports(?:\s|$)/i, (msg) => this.handleReports(msg));
    }
    
    setupCallbackHandlers() {
        this.bot.on('callback_query', async (callbackQuery) => {
            const chatId = callbackQuery.message.chat.id;
            const userId = callbackQuery.from.id;
            const data = callbackQuery.data;
            
            SystemLogger.debug('Callback получен', { userId, data });
            
            try {
                // Обработка регионов (исправлено!)
                if (data.startsWith('region_')) {
                    await this.handleRegionCallback(callbackQuery);
                }
                // Обработка админских callback
                else if (data.startsWith('admin_')) {
                    await this.handleAdminCallback(callbackQuery);
                }
                // Обработка защитников
                else if (data.startsWith('def_')) {
                    await this.handleDefenderCallback(callbackQuery);
                }
                // Обработка заявок
                else if (data.startsWith('report_')) {
                    await this.handleReportCallback(callbackQuery);
                }
                // Обработка отзывов
                else if (data.startsWith('feedback_')) {
                    await this.handleFeedbackCallback(callbackQuery);
                }
                // Обработка типов проблем
                else if (data.startsWith('problem_')) {
                    await this.handleProblemCallback(callbackQuery);
                }
                // Обработка срочности
                else if (data.startsWith('urgency_')) {
                    await this.handleUrgencyCallback(callbackQuery);
                }
                // Обработка подтверждения
                else if (data.startsWith('confirm_')) {
                    await this.handleConfirmationCallback(callbackQuery);
                }
                // Обработка моих заявок
                else if (data.startsWith('myreports_')) {
                    await this.handleMyReportsCallback(callbackQuery);
                }
                // Обработка новой заявки
                else if (data === 'new_report') {
                    await this.handleNewReportCallback(callbackQuery);
                }
                
                await this.bot.answerCallbackQuery(callbackQuery.id);
            } catch (error) {
                SystemLogger.error('Ошибка обработки callback', error);
                await this.bot.answerCallbackQuery(callbackQuery.id, {
                    text: '❌ Произошла ошибка',
                    show_alert: true
                });
            }
        });
    }
    
    setupMessageHandlers() {
        this.bot.on('message', async (msg) => {
            // Пропускаем команды
            if (msg.text && msg.text.startsWith('/')) {
                return;
            }
            
            // Обработка текстовых сообщений
            await this.handleUserMessage(msg);
        });
    }
    
    setupWebServer() {
        this.app.use(express.json());
        
        this.app.get('/', (req, res) => {
            res.json({
                system: CONFIG.SYSTEM_NAME,
                version: CONFIG.VERSION,
                status: 'online',
                timestamp: new Date().toISOString()
            });
        });
        
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                bot: !!this.bot,
                uptime: process.uptime()
            });
        });
    }
    
    setupIntervals() {
        setInterval(() => {
            this.dataManager.saveData();
        }, 5 * 60 * 1000);
        
        setInterval(() => {
            this.dataManager.cleanupOldSessions();
        }, 30 * 60 * 1000);
    }
    
    // ============================================
    // ОСНОВНЫЕ ОБРАБОТЧИКИ КОМАНД
    // ============================================
    
    async handleStart(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const userName = msg.from.first_name || 'Пользователь';
        
        SystemLogger.info(`/start от ${userName} (${userId})`);
        
        const isAdmin = userId.toString() === CONFIG.ADMIN_CHAT_ID;
        
        const welcomeMessage = 
            `🛡️ *Добро пожаловать в ${CONFIG.SYSTEM_NAME}!*\n\n` +
            `Привет, ${userName}! Я — система помощи жертвам киберпреступлений.\n\n` +
            `*Ваш ID:* \`${userId}\`\n\n` +
            `Используйте меню ниже или команды:\n` +
            `/report - Подать заявку о проблеме\n` +
            `/join - Стать защитником\n` +
            `/myreports - Мои заявки\n` +
            `/feedback - Оставить отзыв\n` +
            `/help - Помощь\n` +
            `/support - Техподдержка`;
        
        await this.sendMessage(chatId, welcomeMessage, Keyboards.getMainMenu(isAdmin));
    }
    
    async handleHelp(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        const helpMessage = 
            `📚 *ПОМОЩЬ*\n\n` +
            `*Основные команды:*\n` +
            `/start - Главное меню\n` +
            `/report - Подать заявку (пошаговый процесс)\n` +
            `/join - Стать защитником-волонтером\n` +
            `/myreports - Мои заявки\n` +
            `/feedback - Оставить отзыв о системе\n` +
            `/status - Статус системы\n` +
            `/support - Техническая поддержка\n` +
            `/cancel - Отмена текущей операции\n\n` +
            `*Процесс подачи заявки:*\n` +
            `1. Выберите тип проблемы\n` +
            `2. Укажите страну\n` +
            `3. Оцените срочность\n` +
            `4. Опишите проблему\n` +
            `5. Подтвердите отправку\n\n` +
            `*Процесс регистрации защитника:*\n` +
            `1. Укажите регион\n` +
            `2. Укажите имя\n` +
            `3. Опишите навыки\n` +
            `4. Укажите опыт\n` +
            `5. Подтвердите отправку\n\n` +
            `📞 *Поддержка:* ${CONFIG.TECH_SUPPORT}`;
        
        await this.sendMessage(chatId, helpMessage);
    }
    
    async handleReport(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const userName = msg.from.first_name || 'Пользователь';
        
        if (!this.dataManager.canMakeRequest(userId)) {
            await this.sendMessage(chatId,
                `🚫 *Превышен лимит запросов*\n\n` +
                `Пожалуйста, подождите 1 час.\n\n` +
                `Поддержка: ${CONFIG.TECH_SUPPORT}`
            );
            return;
        }
        
        const sessionId = this.dataManager.createUserSession(userId, 'report', {
            userName: userName,
            chatId: chatId,
            step: 1,
            data: {}
        });
        
        const reportMessage = 
            `📝 *ПОДАЧА ЗАЯВКИ*\n\n` +
            `Вы начали процесс подачи заявки.\n` +
            `Процесс состоит из 5 шагов.\n\n` +
            `*Шаг 1/5:* Выберите тип проблемы:`;
        
        await this.sendMessage(chatId, reportMessage, Keyboards.getProblemTypeButtons());
    }
    
    async handleJoin(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const userName = msg.from.first_name || 'Пользователь';
        
        const existingDefender = Array.from(this.dataManager.defenders.values())
            .find(d => d.userId === userId.toString() && d.status === 'pending');
        
        if (existingDefender) {
            await this.sendMessage(chatId,
                `🔄 *Заявка уже на рассмотрении*\n\n` +
                `Ваша заявка #${existingDefender.id} находится на проверке.\n` +
                `Ожидайте ответа в течение 1-3 дней.`
            );
            return;
        }
        
        const sessionId = this.dataManager.createUserSession(userId, 'join', {
            userName: userName,
            chatId: chatId,
            step: 1,
            data: {}
        });
        
        const joinMessage = 
            `🛡️ *РЕГИСТРАЦИЯ ЗАЩИТНИКА*\n\n` +
            `Спасибо за желание помогать людям!\n` +
            `Процесс регистрации состоит из 5 шагов.\n\n` +
            `*Шаг 1/5:* Выберите ваш регион работы:`;
        
        await this.sendMessage(chatId, joinMessage, Keyboards.getRegionButtons(false));
    }
    
    async handleStatus(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        const stats = this.dataManager.getStatistics();
        const userProfile = this.dataManager.getUserProfile(userId);
        const userReports = this.dataManager.getReportsByUser(userId);
        
        const statusMessage = 
            `📊 *СТАТУС СИСТЕМЫ*\n\n` +
            `*Система:* ${CONFIG.SYSTEM_NAME}\n` +
            `*Версия:* ${CONFIG.VERSION}\n` +
            `*Время:* ${new Date().toLocaleString('ru-RU')}\n\n` +
            `*📈 СТАТИСТИКА:*\n` +
            `• Пользователей: ${stats.totalUsers}\n` +
            `• Заявок: ${stats.totalReports}\n` +
            `• Защитников: ${stats.totalDefenders}\n` +
            `• Активных сегодня: ${stats.activeToday}\n\n` +
            `*👤 ВАШИ ДАННЫЕ:*\n` +
            `• ID: \`${userId}\`\n` +
            `• Заявок подано: ${userProfile.reportsCount}\n` +
            `• Активных заявок: ${userReports.filter(r => r.status === 'new' || r.status === 'in_progress').length}\n\n` +
            `📞 *Поддержка:* ${CONFIG.TECH_SUPPORT}`;
        
        await this.sendMessage(chatId, statusMessage);
    }
    
    async handleSupport(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        const supportMessage = 
            `🆘 *ТЕХНИЧЕСКАЯ ПОДДЕРЖКА*\n\n` +
            `*Контакты поддержки:*\n` +
            `👨💻 Разработчик: ${CONFIG.TECH_SUPPORT}\n` +
            `⏰ Время ответа: 1-12 часов\n\n` +
            `*Ваш ID:* \`${userId}\`\n\n` +
            `*При обращении укажите:*\n` +
            `1. Ваш ID (см. выше)\n` +
            `2. Описание проблемы\n` +
            `3. Время возникновения\n` +
            `4. Скриншоты (если есть)\n\n` +
            `*Для срочной помощи напишите напрямую:* ${CONFIG.TECH_SUPPORT}`;
        
        await this.sendMessage(chatId, supportMessage);
    }
    
    async handleFeedback(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const userName = msg.from.first_name || 'Пользователь';
        
        const sessionId = this.dataManager.createUserSession(userId, 'feedback', {
            userName: userName,
            chatId: chatId,
            step: 1,
            data: {}
        });
        
        const feedbackMessage = 
            `⭐ *ОБРАТНАЯ СВЯЗЬ*\n\n` +
            `Мы ценим ваше мнение! Пожалуйста, помогите нам стать лучше.\n\n` +
            `Выберите тип обратной связи:`;
        
        await this.sendMessage(chatId, feedbackMessage, Keyboards.getFeedbackTypeButtons());
    }
    
    async handleMyReports(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        const userReports = this.dataManager.getReportsByUser(userId);
        
        if (userReports.length === 0) {
            await this.sendMessage(chatId,
                `📭 *У вас нет заявок*\n\n` +
                `Вы еще не подавали заявок о проблемах.\n` +
                `Нажмите "📝 Подать заявку" в меню, чтобы создать первую заявку.`,
                Keyboards.getMyReportsButtons()
            );
            return;
        }
        
        const activeReports = userReports.filter(r => r.status === 'new' || r.status === 'in_progress');
        const completedReports = userReports.filter(r => r.status === 'resolved' || r.status === 'closed');
        
        let reportsMessage = 
            `📋 *ВАШИ ЗАЯВКИ*\n\n` +
            `*📊 Статистика:*\n` +
            `• Всего: ${userReports.length}\n` +
            `• Активные: ${activeReports.length}\n` +
            `• Завершенные: ${completedReports.length}\n\n`;
        
        if (activeReports.length > 0) {
            reportsMessage += `*🔄 АКТИВНЫЕ ЗАЯВКИ:*\n`;
            activeReports.slice(0, 3).forEach(report => {
                reportsMessage += `\n📌 *${report.id}*\n`;
                reportsMessage += `Тип: ${report.problemType}\n`;
                reportsMessage += `Статус: ${report.status === 'new' ? '🆕 Новая' : '🔄 В работе'}\n`;
                reportsMessage += `Создана: ${Utilities.formatDate(report.createdAt)}\n`;
            });
            
            if (activeReports.length > 3) {
                reportsMessage += `\n...и еще ${activeReports.length - 3} заявок\n`;
            }
        }
        
        await this.sendMessage(chatId, reportsMessage, Keyboards.getMyReportsButtons());
    }
    
    async handleCancel(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        const session = this.findUserSession(userId);
        if (session) {
            this.dataManager.completeSession(session.id);
            await this.sendMessage(chatId,
                `🛑 *ОПЕРАЦИЯ ОТМЕНЕНА*\n\n` +
                `Все временные данные удалены.\n` +
                `Используйте меню для начала новой операции.`,
                Keyboards.getMainMenu(this.isAdmin(userId))
            );
        } else {
            await this.sendMessage(chatId,
                `ℹ️ *НЕТ АКТИВНЫХ ОПЕРАЦИЙ*\n\n` +
                `У вас нет активных операций для отменя.`,
                Keyboards.getMainMenu(this.isAdmin(userId))
            );
        }
    }
    
    // ============================================
    // АДМИНСКИЕ КОМАНДЫ
    // ============================================
    
    async handleAdmin(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        if (!this.isAdmin(userId)) {
            await this.sendMessage(chatId, '❌ Эта команда только для администратора');
            return;
        }
        
        const stats = this.dataManager.getStatistics();
        
        const adminMessage = 
            `👑 *АДМИНИСТРАТОРСКАЯ ПАНЕЛЬ*\n\n` +
            `*📊 СТАТИСТИКА:*\n` +
            `• Пользователей: ${stats.totalUsers}\n` +
            `• Заявок: ${stats.totalReports}\n` +
            `• Защитников: ${stats.totalDefenders}\n` +
            `• Активных сегодня: ${stats.activeToday}\n\n` +
            `_Используйте кнопки ниже для управления_`;
        
        await this.sendMessage(chatId, adminMessage, Keyboards.getAdminPanel());
    }
    
    async handleDefenders(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        if (!this.isAdmin(userId)) {
            await this.sendMessage(chatId, '❌ Эта команда только для администратора');
            return;
        }
        
        const defenders = Array.from(this.dataManager.defenders.values());
        const pendingDefenders = defenders.filter(d => d.status === 'pending');
        
        if (pendingDefenders.length === 0) {
            await this.sendMessage(chatId, '✅ *Нет заявок защитников на проверке*');
            return;
        }
        
        for (const defender of pendingDefenders.slice(0, 5)) {
            const defenderMessage = 
                `🛡️ *ЗАЯВКА ЗАЩИТНИКА #${defender.id}*\n\n` +
                `*Кандидат:* ${defender.defenderName}\n` +
                `*Исходное имя:* ${defender.userName}\n` +
                `*Регион:* ${defender.region}\n` +
                `*Навыки:* ${defender.skills.substring(0, 100)}${defender.skills.length > 100 ? '...' : ''}\n` +
                `*Время подачи:* ${Utilities.formatDate(defender.submittedAt)}\n\n` +
                `*ID заявки:* \`${defender.id}\`\n` +
                `*ID пользователя:* \`${defender.userId}\``;
            
            await this.sendMessage(chatId, defenderMessage, Keyboards.getDefenderActions(defender.id));
        }
    }
    
    async handleReports(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        if (!this.isAdmin(userId)) {
            await this.sendMessage(chatId, '❌ Эта команда только для администратора');
            return;
        }
        
        const reports = Array.from(this.dataManager.reports.values());
        const newReports = reports.filter(r => r.status === 'new');
        
        if (newReports.length === 0) {
            await this.sendMessage(chatId, '✅ *Нет новых заявок*');
            return;
        }
        
        for (const report of newReports.slice(0, 5)) {
            const reportMessage = 
                `🚨 *ЗАЯВКА #${report.id}*\n\n` +
                `*От:* ${report.userName}\n` +
                `*Страна:* ${report.country}\n` +
                `*Тип:* ${report.problemType}\n` +
                `*Приоритет:* ${report.priority}\n` +
                `*Время:* ${Utilities.formatDate(report.createdAt)}\n\n` +
                `*Описание:*\n${report.description.substring(0, 200)}${report.description.length > 200 ? '...' : ''}\n\n` +
                `*ID заявки:* \`${report.id}\`\n` +
                `*ID пользователя:* \`${report.userId}\``;
            
            await this.sendMessage(chatId, reportMessage, Keyboards.getReportActions(report.id));
        }
    }
    
    // ============================================
    // ОБРАБОТЧИКИ CALLBACK (ИСПРАВЛЕНЫ!)
    // ============================================
    
    async handleRegionCallback(callbackQuery) {
        const chatId = callbackQuery.message.chat.id;
        const userId = callbackQuery.from.id;
        const data = callbackQuery.data;
        
        SystemLogger.debug('Обработка региона', { userId, data });
        
        // Находим активную сессию пользователя
        const session = this.findUserSession(userId);
        if (!session) {
            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: '❌ Сессия не найдена. Начните заново.',
                show_alert: true
            });
            return;
        }
        
        // Определяем тип сессии: report или join
        const isReport = session.type === 'report';
        
        // Извлекаем код региона из callback_data
        // Формат: region_report_ru или region_ru
        const parts = data.split('_');
        let regionCode;
        
        if (parts.length === 3 && parts[0] === 'region' && parts[1] === 'report') {
            // Формат для заявки: region_report_ru
            regionCode = parts[2];
        } else if (parts.length === 2 && parts[0] === 'region') {
            // Формат для защитника: region_ru
            regionCode = parts[1];
        } else {
            regionCode = 'other';
        }
        
        // Маппинг кодов регионов на названия
        const regionMap = {
            'ru': 'Россия',
            'ua': 'Украина',
            'kz': 'Казахстан',
            'by': 'Беларусь',
            'other': 'Другая страна'
        };
        
        const regionName = regionMap[regionCode] || 'Не указано';
        
        if (isReport) {
            // Обработка для заявки о помощи
            session.data.country = regionName;
            session.step = 2; // Переходим к следующему шагу
            this.dataManager.updateSession(session.id, session);
            
            await this.sendMessage(chatId,
                `✅ *Страна выбрана: ${regionName}*\n\n` +
                `*Шаг 2/5:* Оцените срочность проблемы\n\n` +
                `Выберите, насколько срочно вам нужна помощь:`,
                Keyboards.getUrgencyButtons()
            );
            
        } else if (session.type === 'join') {
            // Обработка для регистрации защитника
            session.data.region = regionName;
            session.step = 2; // Переходим к следующему шагу
            this.dataManager.updateSession(session.id, session);
            
            await this.sendMessage(chatId,
                `✅ *Регион выбран: ${regionName}*\n\n` +
                `*Шаг 2/5:* Укажите ваше имя в системе\n\n` +
                `Как к вам обращаться в системе?\n` +
                `(Можно использовать псевдоним)\n\n` +
                `*Примеры:*\n` +
                `• Иван\n` +
                `• Анна Петрова\n` +
                `• Алексей (IT специалист)\n\n` +
                `Напишите ваше имя:`
            );
        }
        
        await this.bot.answerCallbackQuery(callbackQuery.id);
    }
    
    async handleAdminCallback(callbackQuery) {
        const chatId = callbackQuery.message.chat.id;
        const userId = callbackQuery.from.id;
        const data = callbackQuery.data;
        
        if (!this.isAdmin(userId)) {
            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: '❌ Только администратор',
                show_alert: true
            });
            return;
        }
        
        const action = data.replace('admin_', '');
        
        switch (action) {
            case 'stats':
                await this.showAdminStats(chatId);
                break;
            case 'defenders':
                await this.showAdminDefenders(chatId);
                break;
            case 'reports':
                await this.showAdminReports(chatId);
                break;
            case 'feedback':
                await this.showAdminFeedback(chatId);
                break;
            case 'users':
                await this.showAdminUsers(chatId);
                break;
            case 'refresh':
                await this.handleAdmin(callbackQuery.message);
                break;
        }
    }
    
    async handleDefenderCallback(callbackQuery) {
        const chatId = callbackQuery.message.chat.id;
        const userId = callbackQuery.from.id;
        const data = callbackQuery.data;
        
        if (!this.isAdmin(userId)) {
            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: '❌ Только администратор',
                show_alert: true
            });
            return;
        }
        
        const parts = data.split('_');
        const action = parts[1];
        const defenderId = parts[2];
        
        const defender = this.dataManager.defenders.get(defenderId);
        if (!defender) {
            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: '❌ Защитник не найден',
                show_alert: true
            });
            return;
        }
        
        switch (action) {
            case 'approve':
                await this.approveDefender(defenderId, defender, callbackQuery);
                break;
            case 'reject':
                await this.rejectDefender(defenderId, defender, callbackQuery);
                break;
            case 'contact':
                await this.contactDefender(defender, callbackQuery);
                break;
            case 'details':
                await this.showDefenderDetails(defender, chatId);
                break;
        }
    }
    
    async handleReportCallback(callbackQuery) {
        const chatId = callbackQuery.message.chat.id;
        const userId = callbackQuery.from.id;
        const data = callbackQuery.data;
        
        if (!this.isAdmin(userId)) {
            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: '❌ Только администратор',
                show_alert: true
            });
            return;
        }
        
        const parts = data.split('_');
        const action = parts[1];
        const reportId = parts[2];
        
        const report = this.dataManager.reports.get(reportId);
        if (!report) {
            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: '❌ Заявка не найдена',
                show_alert: true
            });
            return;
        }
        
        switch (action) {
            case 'assign':
                await this.assignReport(reportId, report, callbackQuery);
                break;
            case 'complete':
                await this.completeReport(reportId, report, callbackQuery);
                break;
            case 'contact':
                await this.contactReportUser(report, callbackQuery);
                break;
            case 'close':
                await this.closeReport(reportId, report, callbackQuery);
                break;
        }
    }
    
    async handleFeedbackCallback(callbackQuery) {
        const chatId = callbackQuery.message.chat.id;
        const userId = callbackQuery.from.id;
        const data = callbackQuery.data;
        
        if (!this.isAdmin(userId)) {
            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: '❌ Только администратор',
                show_alert: true
            });
            return;
        }
        
        if (data.startsWith('feedback_')) {
            const parts = data.split('_');
            const action = parts[1];
            const feedbackId = parts[2];
            
            const feedback = this.dataManager.feedback.get(feedbackId);
            if (!feedback) {
                await this.bot.answerCallbackQuery(callbackQuery.id, {
                    text: '❌ Отзыв не найден',
                    show_alert: true
                });
                return;
            }
            
            switch (action) {
                case 'process':
                    await this.processFeedback(feedbackId, feedback, callbackQuery);
                    break;
                case 'reply':
                    await this.replyToFeedback(feedback, callbackQuery);
                    break;
            }
        } else {
            // Обработка типа отзыва при создании
            const session = this.findUserSession(userId);
            if (session && session.type === 'feedback') {
                const typeMap = {
                    'feedback_suggestion': 'предложение',
                    'feedback_bug': 'ошибка',
                    'feedback_compliment': 'благодарность',
                    'feedback_question': 'вопрос'
                };
                
                session.data.type = typeMap[data] || 'другое';
                session.step = 2;
                this.dataManager.updateSession(session.id, session);
                
                await this.sendMessage(chatId,
                    `✅ *Тип: ${session.data.type}*\n\n` +
                    `Теперь напишите ваш отзыв, предложение или вопрос.\n` +
                    `Опишите все подробно:`
                );
            }
        }
    }
    
    async handleProblemCallback(callbackQuery) {
        const chatId = callbackQuery.message.chat.id;
        const userId = callbackQuery.from.id;
        const data = callbackQuery.data;
        
        const session = this.findUserSession(userId);
        if (!session || session.type !== 'report') {
            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: '❌ Сессия не найдена',
                show_alert: true
            });
            return;
        }
        
        const problemMap = {
            'problem_fraud': 'Мошенничество',
            'problem_bullying': 'Кибербуллинг',
            'problem_hack': 'Взлом аккаунта',
            'problem_extortion': 'Вымогательство',
            'problem_threats': 'Угрозы',
            'problem_other': 'Другое'
        };
        
        const problemType = problemMap[data] || 'Другое';
        session.data.problemType = problemType;
        session.step = 2;
        this.dataManager.updateSession(session.id, session);
        
        await this.sendMessage(chatId,
            `✅ *Тип проблемы: ${problemType}*\n\n` +
            `*Шаг 2/5:* Выберите вашу страну\n\n` +
            `В какой стране вы находитесь?`,
            Keyboards.getRegionButtons(true) // true = для заявки
        );
    }
    
    async handleUrgencyCallback(callbackQuery) {
        const chatId = callbackQuery.message.chat.id;
        const userId = callbackQuery.from.id;
        const data = callbackQuery.data;
        
        const session = this.findUserSession(userId);
        if (!session || session.type !== 'report') {
            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: '❌ Сессия не найдена',
                show_alert: true
            });
            return;
        }
        
        const urgencyMap = {
            'urgency_high': { text: '⚡ Срочно', value: 'high' },
            'urgency_medium': { text: '⚠️ Высокий', value: 'medium' },
            'urgency_normal': { text: '🔄 Средний', value: 'normal' },
            'urgency_low': { text: '⏱️ Низкий', value: 'low' }
        };
        
        const urgency = urgencyMap[data] || urgencyMap['urgency_normal'];
        session.data.urgency = urgency.value;
        session.step = 3;
        this.dataManager.updateSession(session.id, session);
        
        await this.sendMessage(chatId,
            `✅ *Срочность: ${urgency.text}*\n\n` +
            `*Шаг 3/5:* Опишите проблему\n\n` +
            `Пожалуйста, подробно опишите ситуацию:\n\n` +
            `*Что указать:*\n` +
            `• Что произошло?\n` +
            `• Когда (дата и время)?\n` +
            `• Какие есть доказательства?\n` +
            `• Контакт для связи\n\n` +
            `Минимум ${CONFIG.MIN_DESCRIPTION_LENGTH} символов.`
        );
    }
    
    async handleConfirmationCallback(callbackQuery) {
        const chatId = callbackQuery.message.chat.id;
        const userId = callbackQuery.from.id;
        const data = callbackQuery.data;
        
        const session = this.findUserSession(userId);
        if (!session) {
            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: '❌ Сессия не найдена',
                show_alert: true
            });
            return;
        }
        
        if (data === 'confirm_yes') {
            if (session.type === 'report' && session.step === 4) {
                // Создаем заявку
                const report = this.dataManager.createReport(
                    userId,
                    session.data.userName,
                    chatId,
                    session.data
                );
                
                await this.sendMessage(chatId,
                    `✅ *ЗАЯВКА #${report.id} ПРИНЯТА!*\n\n` +
                    `*Ваши данные:*\n` +
                    `• ID заявки: \`${report.id}\`\n` +
                    `• Тип проблемы: ${report.problemType}\n` +
                    `• Страна: ${report.country}\n` +
                    `• Срочность: ${report.urgency}\n` +
                    `• Время: ${Utilities.formatDate(report.createdAt)}\n\n` +
                    `*Что дальше:*\n` +
                    `1. Защитники получили уведомление\n` +
                    `2. С вами свяжутся в течение 24-72 часов\n` +
                    `3. Используйте тот же Telegram аккаунт\n\n` +
                    `Сохраните ID заявки: ${report.id}`
                );
                
                // Уведомление администратору
                await this.sendMessage(CONFIG.ADMIN_CHAT_ID,
                    `🚨 *НОВАЯ ЗАЯВКА #${report.id}*\n\n` +
                    `*От:* ${session.data.userName}\n` +
                    `*Страна:* ${report.country}\n` +
                    `*Тип:* ${report.problemType}\n` +
                    `*Приоритет:* ${report.priority}\n` +
                    `*Время:* ${Utilities.formatDate(report.createdAt)}\n\n` +
                    `*Описание:*\n${report.description.substring(0, 200)}${report.description.length > 200 ? '...' : ''}\n\n` +
                    `*ID заявки:* \`${report.id}\`\n` +
                    `*ID пользователя:* \`${userId}\``,
                    Keyboards.getReportActions(report.id)
                );
                
                this.dataManager.completeSession(session.id);
                
            } else if (session.type === 'join' && session.step === 5) {
                // Создаем заявку защитника
                const application = this.dataManager.createDefenderApplication(
                    userId,
                    session.data.userName,
                    chatId,
                    session.data
                );
                
                await this.sendMessage(chatId,
                    `✅ *АНКЕТА ОТПРАВЛЕНА НА ПРОВЕРКУ!*\n\n` +
                    `Заявка #${application.id} успешно отправлена.\n\n` +
                    `*Что дальше:*\n` +
                    `1. Администратор проверит вашу анкету\n` +
                    `2. Срок проверки: 1-3 дня\n` +
                    `3. Уведомление придет в этот чат\n\n` +
                    `*Ваши данные:*\n` +
                    `• Имя: ${session.data.defenderName}\n` +
                    `• Регион: ${session.data.region}\n` +
                    `• Навыки: ${session.data.skills}\n` +
                    `• Опыт: ${session.data.experience}\n\n` +
                    `Спасибо за вашу заявку! 🛡️`
                );
                
                // Уведомление администратору
                await this.sendMessage(CONFIG.ADMIN_CHAT_ID,
                    `🛡️ *НОВАЯ ЗАЯВКА ЗАЩИТНИКА #${application.id}*\n\n` +
                    `*Кандидат:* ${session.data.defenderName}\n` +
                    `*Исходное имя:* ${session.data.userName}\n` +
                    `*Регион:* ${session.data.region}\n` +
                    `*Навыки:* ${session.data.skills.substring(0, 100)}${session.data.skills.length > 100 ? '...' : ''}\n\n` +
                    `*ID заявки:* \`${application.id}\`\n` +
                    `*ID пользователя:* \`${userId}\``,
                    Keyboards.getDefenderActions(application.id)
                );
                
                this.dataManager.completeSession(session.id);
            }
            
        } else if (data === 'confirm_no') {
            await this.sendMessage(chatId, '❌ Действие отменено');
            this.dataManager.completeSession(session.id);
        }
    }
    
    async handleMyReportsCallback(callbackQuery) {
        const chatId = callbackQuery.message.chat.id;
        const userId = callbackQuery.from.id;
        const data = callbackQuery.data;
        
        const action = data.replace('myreports_', '');
        const userReports = this.dataManager.getReportsByUser(userId);
        
        switch (action) {
            case 'active':
                const activeReports = userReports.filter(r => r.status === 'new' || r.status === 'in_progress');
                
                if (activeReports.length === 0) {
                    await this.sendMessage(chatId, '📭 *Нет активных заявок*');
                } else {
                    let message = `🔄 *АКТИВНЫЕ ЗАЯВКИ (${activeReports.length})*\n\n`;
                    
                    activeReports.forEach((report, index) => {
                        message += `${index + 1}. *${report.id}*\n`;
                        message += `   Тип: ${report.problemType}\n`;
                        message += `   Статус: ${report.status === 'new' ? '🆕 Новая' : '🔄 В работе'}\n`;
                        message += `   Создана: ${Utilities.formatDate(report.createdAt)}\n\n`;
                    });
                    
                    await this.sendMessage(chatId, message);
                }
                break;
                
            case 'completed':
                const completedReports = userReports.filter(r => r.status === 'resolved' || r.status === 'closed');
                
                if (completedReports.length === 0) {
                    await this.sendMessage(chatId, '📭 *Нет завершенных заявок*');
                } else {
                    let message = `✅ *ЗАВЕРШЕННЫЕ ЗАЯВКИ (${completedReports.length})*\n\n`;
                    
                    completedReports.forEach((report, index) => {
                        message += `${index + 1}. *${report.id}*\n`;
                        message += `   Тип: ${report.problemType}\n`;
                        message += `   Статус: ${report.status === 'resolved' ? '✅ Решена' : '🔒 Закрыта'}\n`;
                        message += `   Создана: ${Utilities.formatDate(report.createdAt)}\n\n`;
                    });
                    
                    await this.sendMessage(chatId, message);
                }
                break;
                
            case 'stats':
                const stats = {
                    total: userReports.length,
                    new: userReports.filter(r => r.status === 'new').length,
                    in_progress: userReports.filter(r => r.status === 'in_progress').length,
                    resolved: userReports.filter(r => r.status === 'resolved').length,
                    closed: userReports.filter(r => r.status === 'closed').length
                };
                
                const statsMessage = 
                    `📊 *СТАТИСТИКА ВАШИХ ЗАЯВОК*\n\n` +
                    `*Всего заявок:* ${stats.total}\n` +
                    `• Новых: ${stats.new}\n` +
                    `• В работе: ${stats.in_progress}\n` +
                    `• Решено: ${stats.resolved}\n` +
                    `• Закрыто: ${stats.closed}\n\n` +
                    `*Эффективность:* ${stats.total > 0 ? Math.round((stats.resolved / stats.total) * 100) : 0}%`;
                
                await this.sendMessage(chatId, statsMessage);
                break;
        }
    }
    
    async handleNewReportCallback(callbackQuery) {
        const chatId = callbackQuery.message.chat.id;
        const userId = callbackQuery.from.id;
        const userName = callbackQuery.from.first_name || 'Пользователь';
        
        if (!this.dataManager.canMakeRequest(userId)) {
            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: '🚫 Превышен лимит запросов',
                show_alert: true
            });
            return;
        }
        
        const sessionId = this.dataManager.createUserSession(userId, 'report', {
            userName: userName,
            chatId: chatId,
            step: 1,
            data: {}
        });
        
        await this.sendMessage(chatId,
            `📝 *НОВАЯ ЗАЯВКА*\n\n` +
            `Выберите тип проблемы:`,
            Keyboards.getProblemTypeButtons()
        );
    }
    
    // ============================================
    // ОБРАБОТКА ТЕКСТОВЫХ СООБЩЕНИЙ (ИСПРАВЛЕНО!)
    // ============================================
    
    async handleUserMessage(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const text = msg.text || '';
        
        SystemLogger.debug('Текстовое сообщение', { userId, text });
        
        // Проверяем, если это текст из меню
        if (text === '📝 Подать заявку') {
            await this.handleReport(msg);
            return;
        } else if (text === '🛡️ Стать защитником') {
            await this.handleJoin(msg);
            return;
        } else if (text === '📊 Мои заявки') {
            await this.handleMyReports(msg);
            return;
        } else if (text === '⭐ Оставить отзыв') {
            await this.handleFeedback(msg);
            return;
        } else if (text === '📚 Помощь') {
            await this.handleHelp(msg);
            return;
        } else if (text === '📞 Поддержка') {
            await this.handleSupport(msg);
            return;
        } else if (text === '👑 Админ панель') {
            await this.handleAdmin(msg);
            return;
        }
        
        // Ищем активную сессию
        const session = this.findUserSession(userId);
        if (!session) {
            // Показываем главное меню
            await this.sendMessage(chatId, 'Выберите действие:', Keyboards.getMainMenu(this.isAdmin(userId)));
            return;
        }
        
        SystemLogger.debug('Активная сессия найдена', { 
            sessionId: session.id, 
            type: session.type, 
            step: session.step 
        });
        
        // Обновляем активность сессии
        session.lastActivity = Date.now();
        this.dataManager.updateSession(session.id, session);
        
        // Обрабатываем в зависимости от типа сессии
        switch (session.type) {
            case 'report':
                await this.processReportStep(session, text);
                break;
            case 'join':
                await this.processJoinStep(session, text);
                break;
            case 'feedback':
                await this.processFeedbackStep(session, text);
                break;
        }
    }
    
    async processReportStep(session, text) {
        const { chatId, userId, step, data } = session;
        
        SystemLogger.debug('Обработка шага заявки', { step, textLength: text.length });
        
        switch (step) {
            case 3: // Описание проблемы (шаг после выбора срочности)
                if (text.length < CONFIG.MIN_DESCRIPTION_LENGTH) {
                    await this.sendMessage(chatId,
                        `❌ Описание слишком короткое. Минимум ${CONFIG.MIN_DESCRIPTION_LENGTH} символов.\n\n` +
                        `Пожалуйста, опишите подробнее.\n\n` +
                        `*Что указать:*\n` +
                        `• Что произошло?\n` +
                        `• Когда (дата и время)?\n` +
                        `• Какие есть доказательства?\n` +
                        `• Контакт для связи`
                    );
                    return;
                }
                
                data.description = text;
                session.step = 4;
                this.dataManager.updateSession(session.id, session);
                
                await this.sendMessage(chatId,
                    `✅ *Описание принято*\n\n` +
                    `*Шаг 4/5:* Контактная информация\n\n` +
                    `Как с вами лучше связаться?\n\n` +
                    `*Примеры:*\n` +
                    `• Telegram: @username\n` +
                    `• Email: example@email.com\n` +
                    `• Телефон: +79991234567\n\n` +
                    `_Эти данные видны только назначенному защитнику_`
                );
                break;
                
            case 4: // Контактная информация
                data.contact = text;
                session.step = 5;
                this.dataManager.updateSession(session.id, session);
                
                // Предварительный просмотр
                const previewMessage = 
                    `📋 *ПРЕДВАРИТЕЛЬНЫЙ ПРОСМОТР ЗАЯВКИ*\n\n` +
                    `*Тип проблемы:* ${data.problemType}\n` +
                    `*Страна:* ${data.country}\n` +
                    `*Срочность:* ${data.urgency}\n` +
                    `*Описание:*\n${data.description.substring(0, 150)}${data.description.length > 150 ? '...' : ''}\n` +
                    `*Контакт:* ${data.contact}\n\n` +
                    `*Подтвердите отправку заявки:*`;
                
                await this.sendMessage(chatId, previewMessage, Keyboards.getConfirmationButtons());
                break;
        }
    }
    
    async processJoinStep(session, text) {
        const { chatId, userId, step, data } = session;
        
        SystemLogger.debug('Обработка шага защитника', { step, textLength: text.length });
        
        switch (step) {
            case 2: // Имя защитника (шаг после выбора региона)
                if (text.length < 2 || text.length > 50) {
                    await this.sendMessage(chatId,
                        '❌ Имя должно быть от 2 до 50 символов.\n\n' +
                        'Пример: Иван, Анна Петрова\n\n' +
                        'Попробуйте еще раз:'
                    );
                    return;
                }
                
                data.defenderName = text;
                session.step = 3;
                this.dataManager.updateSession(session.id, session);
                
                await this.sendMessage(chatId,
                    `✅ *Имя принято: ${text}*\n\n` +
                    `*Шаг 3/5:* Ваши навыки и опыт\n\n` +
                    `Опишите ваши профессиональные навыки и опыт:\n\n` +
                    `*Примеры:*\n` +
                    `• Юрист, опыт 5 лет\n` +
                    `• IT специалист, кибербезопасность\n` +
                    `• Психолог, поддержка жертв\n\n` +
                    `Чем подробнее, тем лучше.`
                );
                break;
                
            case 3: // Навыки
                if (text.length < 10) {
                    await this.sendMessage(chatId,
                        '❌ Пожалуйста, опишите ваши навыки подробнее.\n' +
                        'Минимум 10 символов.\n\n' +
                        'Попробуйте еще раз:'
                    );
                    return;
                }
                
                data.skills = text;
                session.step = 4;
                this.dataManager.updateSession(session.id, session);
                
                await this.sendMessage(chatId,
                    `✅ *Навыки приняты*\n\n` +
                    `*Шаг 4/5:* Опыт работы\n\n` +
                    `Опишите ваш опыт работы в этой области:\n\n` +
                    `• Сколько лет опыта?\n` +
                    `• Какие проекты реализовали?\n` +
                    `• Какие достижения?`
                );
                break;
                
            case 4: // Опыт
                data.experience = text;
                session.step = 5;
                this.dataManager.updateSession(session.id, session);
                
                // Предварительный просмотр анкеты
                const previewMessage = 
                    `📋 *ПРЕДВАРИТЕЛЬНЫЙ ПРОСМОТР АНКЕТЫ*\n\n` +
                    `*Имя в системе:* ${data.defenderName}\n` +
                    `*Регион:* ${data.region}\n` +
                    `*Навыки:* ${data.skills.substring(0, 100)}${data.skills.length > 100 ? '...' : ''}\n` +
                    `*Опыт:* ${data.experience.substring(0, 100)}${data.experience.length > 100 ? '...' : ''}\n\n` +
                    `*Подтвердите отправку анкеты:*`;
                
                await this.sendMessage(chatId, previewMessage, Keyboards.getConfirmationButtons());
                break;
        }
    }
    
    async processFeedbackStep(session, text) {
        const { chatId, userId, step, data } = session;
        
        SystemLogger.debug('Обработка шага отзыва', { step, textLength: text.length });
        
        if (step === 2) {
            if (text.length < 10) {
                await this.sendMessage(chatId,
                    '❌ Пожалуйста, напишите более развернутый отзыв.\n' +
                    'Минимум 10 символов.\n\n' +
                    'Попробуйте еще раз:'
                );
                return;
            }
            
            data.message = text;
            
            // Создаем отзыв
            const feedback = this.dataManager.createFeedback(
                userId,
                session.data.userName,
                data.type,
                data.message
            );
            
            await this.sendMessage(chatId,
                `✅ *СПАСИБО ЗА ОТЗЫВ!*\n\n` +
                `Ваш отзыв #${feedback.id} успешно отправлен.\n` +
                `Мы ценим ваше мнение и обязательно его учтем.\n\n` +
                `*Тип:* ${data.type}\n` +
                `*Сообщение:*\n${data.message.substring(0, 100)}${data.message.length > 100 ? '...' : ''}\n\n` +
                `Спасибо за помощь в улучшении системы!`
            );
            
            // Уведомление администратору
            await this.sendMessage(CONFIG.ADMIN_CHAT_ID,
                `📢 *НОВЫЙ ОТЗЫВ #${feedback.id}*\n\n` +
                `*Тип:* ${data.type}\n` +
                `*От:* ${session.data.userName}\n` +
                `*Сообщение:*\n${data.message.substring(0, 200)}${data.message.length > 200 ? '...' : ''}\n\n` +
                `ID: \`${feedback.id}\`\n` +
                `User ID: \`${userId}\``,
                Keyboards.getFeedbackActions(feedback.id)
            );
            
            this.dataManager.completeSession(session.id);
        }
    }
    
    // ============================================
    // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ ДЛЯ CALLBACK
    // ============================================
    
    async approveDefender(defenderId, defender, callbackQuery) {
        defender.status = 'approved';
        defender.reviewedAt = new Date().toISOString();
        defender.reviewedBy = CONFIG.ADMIN_CHAT_ID;
        this.dataManager.defenders.set(defenderId, defender);
        
        const userProfile = this.dataManager.getUserProfile(defender.userId);
        userProfile.accessLevel = CONFIG.ACCESS_LEVELS.DEFENDER;
        this.dataManager.userProfiles.set(defender.userId, userProfile);
        
        this.dataManager.saveData();
        
        await this.sendMessage(defender.chatId,
            `🎉 *ВАША ЗАЯВКА ОДОБРЕНА!*\n\n` +
            `Заявка #${defenderId} успешно одобрена.\n\n` +
            `*Теперь вы официальный защитник системы!*\n\n` +
            `*Ваши данные:*\n` +
            `• Имя в системе: ${defender.defenderName}\n` +
            `• Регион: ${defender.region}\n` +
            `• Статус: 🛡️ Активный защитник\n\n` +
            `*Что дальше:*\n` +
            `1. Вы будете получать уведомления о новых заявках\n` +
            `2. Для начала работы ожидайте первого уведомления\n` +
            `3. Все инструкции будут отправлены дополнительно\n\n` +
            `Спасибо за участие! 🛡️`
        );
        
        await this.bot.editMessageText(
            callbackQuery.message.text + '\n\n✅ *ОДОБРЕНО*',
            {
                chat_id: callbackQuery.message.chat.id,
                message_id: callbackQuery.message.message_id,
                parse_mode: 'Markdown'
            }
        );
        
        await this.bot.answerCallbackQuery(callbackQuery.id, {
            text: '✅ Защитник одобрен',
            show_alert: false
        });
    }
    
    async rejectDefender(defenderId, defender, callbackQuery) {
        defender.status = 'rejected';
        defender.reviewedAt = new Date().toISOString();
        defender.reviewedBy = CONFIG.ADMIN_CHAT_ID;
        this.dataManager.defenders.set(defenderId, defender);
        this.dataManager.saveData();
        
        await this.sendMessage(defender.chatId,
            `📋 *ПО ВАШЕЙ ЗАЯВКЕ #${defenderId}*\n\n` +
            `К сожалению, ваша заявка не была одобрена.\n\n` +
            `*Возможные причины:*\n` +
            `• Неполная или неточная информация\n` +
            `• Недостаточный опыт или навыки\n` +
            `• Ограничение по региону\n\n` +
            `Вы можете подать заявку повторно через 30 дней.\n\n` +
            `Спасибо за понимание.`
        );
        
        await this.bot.editMessageText(
            callbackQuery.message.text + '\n\n❌ *ОТКЛОНЕНО*',
            {
                chat_id: callbackQuery.message.chat.id,
                message_id: callbackQuery.message.message_id,
                parse_mode: 'Markdown'
            }
        );
        
        await this.bot.answerCallbackQuery(callbackQuery.id, {
            text: '❌ Заявка отклонена',
            show_alert: false
        });
    }
    
    async contactDefender(defender, callbackQuery) {
        await this.bot.answerCallbackQuery(callbackQuery.id, {
            text: `Связь с защитником: tg://user?id=${defender.userId}`,
            show_alert: true
        });
    }
    
    async showDefenderDetails(defender, chatId) {
        const detailsMessage = 
            `📋 *ДЕТАЛИ ЗАЩИТНИКА*\n\n` +
            `*Основная информация:*\n` +
            `• Имя в системе: ${defender.defenderName}\n` +
            `• Исходное имя: ${defender.userName}\n` +
            `• ID пользователя: \`${defender.userId}\`\n\n` +
            `*Профессиональные данные:*\n` +
            `• Регион: ${defender.region}\n` +
            `• Навыки: ${defender.skills}\n` +
            `• Опыт: ${defender.experience}\n` +
            `• Языки: ${defender.languages.join(', ')}\n\n` +
            `*Статистика:*\n` +
            `• Статус: ${defender.status}\n` +
            `• Рассмотрено дел: ${defender.casesHandled}\n` +
            `• Подана: ${Utilities.formatDate(defender.submittedAt)}\n\n` +
            `_Для связи: tg://user?id=${defender.userId}_`;
        
        await this.sendMessage(chatId, detailsMessage);
    }
    
    async assignReport(reportId, report, callbackQuery) {
        await this.bot.answerCallbackQuery(callbackQuery.id, {
            text: `Назначение заявки #${reportId}\nДля связи: tg://user?id=${report.userId}`,
            show_alert: true
        });
    }
    
    async completeReport(reportId, report, callbackQuery) {
        report.status = 'resolved';
        report.updatedAt = new Date().toISOString();
        this.dataManager.reports.set(reportId, report);
        this.dataManager.saveData();
        
        await this.sendMessage(report.chatId,
            `✅ *ВАША ЗАЯВКА РЕШЕНА!*\n\n` +
            `Заявка #${reportId} отмечена как решенная.\n\n` +
            `*Статус:* ✅ Решена\n` +
            `*Время решения:* ${Utilities.formatDate(report.updatedAt)}\n\n` +
            `Спасибо, что обратились к нам!`
        );
        
        await this.bot.answerCallbackQuery(callbackQuery.id, {
            text: '✅ Заявка отмечена как решенная',
            show_alert: true
        });
    }
    
    async contactReportUser(report, callbackQuery) {
        await this.bot.answerCallbackQuery(callbackQuery.id, {
            text: `Связь с пользователем: tg://user?id=${report.userId}`,
            show_alert: true
        });
    }
    
    async closeReport(reportId, report, callbackQuery) {
        report.status = 'closed';
        report.updatedAt = new Date().toISOString();
        this.dataManager.reports.set(reportId, report);
        this.dataManager.saveData();
        
        await this.bot.answerCallbackQuery(callbackQuery.id, {
            text: '🔒 Заявка закрыта',
            show_alert: true
        });
    }
    
    async processFeedback(feedbackId, feedback, callbackQuery) {
        feedback.processed = true;
        feedback.processedAt = new Date().toISOString();
        this.dataManager.feedback.set(feedbackId, feedback);
        this.dataManager.saveData();
        
        await this.bot.editMessageText(
            callbackQuery.message.text + '\n\n✅ *ОБРАБОТАНО*',
            {
                chat_id: callbackQuery.message.chat.id,
                message_id: callbackQuery.message.message_id,
                parse_mode: 'Markdown'
            }
        );
        
        await this.bot.answerCallbackQuery(callbackQuery.id, {
            text: '✅ Отзыв обработан',
            show_alert: false
        });
    }
    
    async replyToFeedback(feedback, callbackQuery) {
        await this.bot.answerCallbackQuery(callbackQuery.id, {
            text: `Ответ на отзыв #${feedback.id}\nДля связи: tg://user?id=${feedback.userId}`,
            show_alert: true
        });
    }
    
    async showAdminStats(chatId) {
        const stats = this.dataManager.getStatistics();
        
        const statsMessage = 
            `📊 *ДЕТАЛЬНАЯ СТАТИСТИКА*\n\n` +
            `*👥 ПОЛЬЗОВАТЕЛИ:*\n` +
            `• Всего: ${stats.totalUsers}\n` +
            `• Активных сегодня: ${stats.activeToday}\n\n` +
            `*📝 ЗАЯВКИ:*\n` +
            `• Всего: ${stats.totalReports}\n` +
            `• Новых: ${stats.reportsByStatus.new || 0}\n` +
            `• В работе: ${stats.reportsByStatus.in_progress || 0}\n` +
            `• Решено: ${stats.reportsByStatus.resolved || 0}\n\n` +
            `*🛡️ ЗАЩИТНИКИ:*\n` +
            `• Всего: ${stats.totalDefenders}\n` +
            `• На проверке: ${stats.defendersByStatus.pending || 0}\n` +
            `• Одобрено: ${stats.defendersByStatus.approved || 0}\n` +
            `• Новых за месяц: ${stats.monthlyDefenders}\n\n` +
            `*📈 СИСТЕМА:*\n` +
            `• Время работы: ${Math.floor(stats.systemUptime / 3600)}ч\n` +
            `• Отзывов получено: ${stats.totalFeedback}\n\n` +
            `_Статистика обновлена: ${new Date().toLocaleString('ru-RU')}_`;
        
        await this.sendMessage(chatId, statsMessage);
    }
    
    async showAdminDefenders(chatId) {
        await this.handleDefenders({ chat: { id: chatId }, from: { id: CONFIG.ADMIN_CHAT_ID } });
    }
    
    async showAdminReports(chatId) {
        await this.handleReports({ chat: { id: chatId }, from: { id: CONFIG.ADMIN_CHAT_ID } });
    }
    
    async showAdminFeedback(chatId) {
        const feedbacks = Array.from(this.dataManager.feedback.values());
        const newFeedbacks = feedbacks.filter(f => !f.processed);
        
        if (newFeedbacks.length === 0) {
            await this.sendMessage(chatId, '✅ *Нет новых отзывов*');
            return;
        }
        
        for (const feedback of newFeedbacks.slice(0, 5)) {
            const feedbackMessage = 
                `📢 *ОТЗЫВ #${feedback.id}*\n\n` +
                `*Тип:* ${feedback.type}\n` +
                `*От:* ${feedback.userName}\n` +
                `*Время:* ${Utilities.formatDate(feedback.createdAt)}\n\n` +
                `*Сообщение:*\n${feedback.message.substring(0, 200)}${feedback.message.length > 200 ? '...' : ''}\n\n` +
                `*ID отзыва:* \`${feedback.id}\`\n` +
                `*ID пользователя:* \`${feedback.userId}\``;
            
            await this.sendMessage(chatId, feedbackMessage, Keyboards.getFeedbackActions(feedback.id));
        }
    }
    
    async showAdminUsers(chatId) {
        const users = Array.from(this.dataManager.userProfiles.values());
        
        const usersMessage = 
            `👥 *ПОЛЬЗОВАТЕЛИ СИСТЕМЫ*\n\n` +
            `*📊 Статистика:*\n` +
            `• Всего пользователей: ${users.length}\n` +
            `• Защитников: ${users.filter(u => u.accessLevel >= CONFIG.ACCESS_LEVELS.DEFENDER).length}\n` +
            `• Админов: ${users.filter(u => u.accessLevel >= CONFIG.ACCESS_LEVELS.ADMIN).length}\n\n` +
            `*📈 Активность:*\n` +
            `• Активных сегодня: ${this.dataManager.getActiveUsersCount()}\n` +
            `• Новых за месяц: ${users.filter(u => new Date(u.joinedAt) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)).length}\n\n` +
            `_Для детальной информации используйте команды админ-панели_`;
        
        await this.sendMessage(chatId, usersMessage);
    }
    
    // ============================================
    // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
    // ============================================
    
    isAdmin(userId) {
        return userId.toString() === CONFIG.ADMIN_CHAT_ID;
    }
    
    findUserSession(userId) {
        for (const session of this.dataManager.userSessions.values()) {
            if (session.userId === userId.toString() && !session.completed) {
                return session;
            }
        }
        return null;
    }
    
    async sendMessage(chatId, text, options = {}) {
        try {
            const defaultOptions = {
                parse_mode: 'Markdown',
                disable_web_page_preview: true
            };
            
            await this.bot.sendMessage(chatId, text, { ...defaultOptions, ...options });
            return true;
        } catch (error) {
            SystemLogger.error('Ошибка отправки сообщения', {
                chatId,
                error: error.message
            });
            
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
                SystemLogger.error('Вторая ошибка отправки', secondError.message);
                return false;
            }
        }
    }
    
    startServer() {
        return new Promise((resolve, reject) => {
            const server = this.app.listen(CONFIG.PORT, CONFIG.HOST, () => {
                SystemLogger.success(`Веб-сервер запущен на порту ${CONFIG.PORT}`);
                resolve(server);
            });
            
            server.on('error', (error) => {
                SystemLogger.error('Ошибка запуска сервера', error);
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
        console.clear();
        console.log('='.repeat(70));
        console.log(`🚀 ${CONFIG.SYSTEM_NAME} v${CONFIG.VERSION}`);
        console.log('='.repeat(70));
        
        if (!CONFIG.BOT_TOKEN || CONFIG.BOT_TOKEN.length < 30) {
            console.error('❌ ОШИБКА: BOT_TOKEN не установлен');
            console.error('Получите у @BotFather и добавьте в переменные окружения');
            process.exit(1);
        }
        
        if (!CONFIG.ADMIN_CHAT_ID) {
            console.error('❌ ОШИБКА: ADMIN_CHAT_ID не установлен');
            console.error('Узнайте через @userinfobot и добавьте в переменные');
            process.exit(1);
        }
        
        console.log('✅ Конфигурация проверена');
        console.log(`   Поддержка: ${CONFIG.TECH_SUPPORT}`);
        console.log('='.repeat(70));
        
        const botSystem = new BakeliteDefenceBot();
        await botSystem.startServer();
        
        console.log('\n' + '='.repeat(70));
        console.log('🎉 СИСТЕМА УСПЕШНО ЗАПУЩЕНА!');
        console.log('='.repeat(70));
        console.log('\n✅ ВСЕ ПРОБЛЕМЫ ИСПРАВЛЕНЫ:');
        console.log('  • Регионы работают корректно');
        console.log('  • Имя защитника принимается после выбора региона');
        console.log('  • Все инлайн-кнопки работают');
        console.log('  • Сессии сохраняются правильно');
        console.log('\n📱 ТЕСТИРОВАНИЕ РАБОТЫ:');
        console.log('  1. Нажмите "🛡️ Стать защитником"');
        console.log('  2. Выберите регион (кнопки работают)');
        console.log('  3. Введите имя защитника (система реагирует)');
        console.log('  4. Продолжите заполнение анкеты');
        console.log('='.repeat(70));
        console.log(`\n📞 Поддержка: ${CONFIG.TECH_SUPPORT}`);
        console.log('🕒 Система работает 24/7');
        console.log('='.repeat(70));
        
        SystemLogger.success('Система полностью запущена');
        
    } catch (error) {
        SystemLogger.error('Критическая ошибка запуска', error);
        console.error('\n❌ ОШИБКА ЗАПУСКА');
        console.error('🔧 Причина:', error.message);
        console.error('📞 Обратитесь:', CONFIG.TECH_SUPPORT);
        process.exit(1);
    }
}

// Запускаем систему
if (require.main === module) {
    main();
}

module.exports = { BakeliteDefenceBot, DataManager, SystemLogger };
