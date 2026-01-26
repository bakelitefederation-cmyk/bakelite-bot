// ============================================
// 🛡️ BAKELITE DEFENCE BOT - ПРОМЫШЛЕННАЯ ВЕРСИЯ 6.0.0
// Версия: 6.0.0
// Разработчик: @kartochniy
// Статус: Улучшенная версия с расширенным функционалом
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
    
    VERSION: '6.0.0',
    SYSTEM_NAME: 'Bakelite Defence System Pro',
    
    // Новые настройки
    AUTO_BACKUP_INTERVAL: 3600000, // 1 час
    MAX_DEFENDERS_PER_REGION: 10,
    ENABLE_NOTIFICATIONS: true,
    
    // Уровни доступа
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
    
    static validateEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }
    
    static chunkArray(array, size) {
        const result = [];
        for (let i = 0; i < array.length; i += size) {
            result.push(array.slice(i, i + size));
        }
        return result;
    }
}

// ============================================
// СИСТЕМА ЛОГИРОВАНИЯ УЛУЧШЕННАЯ
// ============================================

class SystemLogger {
    static log(level, message, data = null) {
        const timestamp = new Date().toISOString();
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
        
        if (data && process.env.NODE_ENV !== 'production') {
            console.log(`${colors[level] || ''}   Данные: ${JSON.stringify(data, null, 2)}${reset}`);
        }
        
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
// МЕНЕДЖЕР ДАННЫХ УЛУЧШЕННЫЙ
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
                    profiles: this.userProfiles.size,
                    feedback: this.feedback.size
                });
            } else {
                SystemLogger.warn('Файл данных не найден, создаем новый');
                this.saveData();
            }
        } catch (error) {
            SystemLogger.error('Ошибка загрузки данных', error.message);
            this.createBackup();
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
            
            // Создаем резервную копию перед сохранением
            if (fs.existsSync(CONFIG.DATA_FILE)) {
                fs.copyFileSync(CONFIG.DATA_FILE, CONFIG.BACKUP_FILE);
            }
            
            fs.writeFileSync(CONFIG.DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
            SystemLogger.debug('Данные сохранены');
        } catch (error) {
            SystemLogger.error('Ошибка сохранения данных', error.message);
        }
    }
    
    createBackup() {
        try {
            const backupData = {
                reports: Array.from(this.reports.entries()),
                defenders: Array.from(this.defenders.entries()),
                userProfiles: Array.from(this.userProfiles.entries()),
                timestamp: new Date().toISOString()
            };
            
            const backupName = `backup_${Date.now()}.json`;
            fs.writeFileSync(backupName, JSON.stringify(backupData, null, 2), 'utf8');
            SystemLogger.info('Резервная копия создана', { file: backupName });
        } catch (error) {
            SystemLogger.error('Ошибка создания резервной копии', error.message);
        }
    }
    
    // Управление профилями пользователей
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
    
    // Управление заявками
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
            files: data.files || [],
            status: 'new',
            priority: this.calculatePriority(data.problemType),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            assignedTo: null,
            assignedDefender: null,
            updates: [],
            tags: [],
            urgency: data.urgency || 'medium',
            estimatedTime: data.estimatedTime || null
        };
        
        this.reports.set(reportId, report);
        userProfile.reportsCount++;
        this.statistics.reportsCreated++;
        this.saveData();
        
        SystemLogger.info('Создана заявка', { reportId, userId, problemType: report.problemType });
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
    
    getReportsByStatus(status) {
        const reports = [];
        for (const [id, report] of this.reports.entries()) {
            if (report.status === status) {
                reports.push(report);
            }
        }
        return reports;
    }
    
    // Управление защитниками
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
            notes: [],
            rating: 0,
            casesHandled: 0,
            specialization: data.specialization || [],
            contactInfo: data.contactInfo || {}
        };
        
        this.defenders.set(appId, application);
        this.statistics.defendersRegistered++;
        this.saveData();
        
        SystemLogger.info('Заявка защитника создана', { appId, userId });
        return application;
    }
    
    getDefendersByRegion(region) {
        const defenders = [];
        for (const [id, defender] of this.defenders.entries()) {
            if (defender.region.includes(region) && defender.status === 'approved') {
                defenders.push(defender);
            }
        }
        return defenders;
    }
    
    getDefendersBySpecialization(specialization) {
        const defenders = [];
        for (const [id, defender] of this.defenders.entries()) {
            if (defender.specialization.includes(specialization) && defender.status === 'approved') {
                defenders.push(defender);
            }
        }
        return defenders;
    }
    
    // Управление обратной связью
    createFeedback(userId, userName, type, message, rating = null) {
        const feedbackId = Utilities.generateId('FB');
        
        const feedback = {
            id: feedbackId,
            userId: userId.toString(),
            userName: userName,
            type: type, // 'bug', 'suggestion', 'compliment', 'question'
            message: message,
            rating: rating,
            status: 'new',
            createdAt: new Date().toISOString(),
            processed: false,
            processedBy: null,
            response: null
        };
        
        this.feedback.set(feedbackId, feedback);
        this.statistics.feedbackReceived++;
        this.saveData();
        
        SystemLogger.info('Получен отзыв', { feedbackId, type, userId });
        return feedback;
    }
    
    // Система уведомлений
    createNotification(userId, type, title, message, data = {}) {
        const notificationId = Utilities.generateId('NOTIF');
        
        const notification = {
            id: notificationId,
            userId: userId.toString(),
            type: type,
            title: title,
            message: message,
            data: data,
            read: false,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 дней
        };
        
        if (!this.notifications.has(userId.toString())) {
            this.notifications.set(userId.toString(), []);
        }
        
        this.notifications.get(userId.toString()).push(notification);
        return notification;
    }
    
    getUnreadNotifications(userId) {
        const userNotifications = this.notifications.get(userId.toString()) || [];
        return userNotifications.filter(n => !n.read);
    }
    
    // Статистика
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
            topRegions: this.getTopRegions(),
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
    
    getTopRegions() {
        const regions = {};
        for (const defender of this.defenders.values()) {
            if (defender.status === 'approved') {
                regions[defender.region] = (regions[defender.region] || 0) + 1;
            }
        }
        return Object.entries(regions)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5)
            .map(([region, count]) => ({ region, count }));
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
    
    // Очистка старых данных
    cleanup() {
        const now = Date.now();
        let cleaned = 0;
        
        // Очистка старых сессий
        for (const [sessionId, session] of this.userSessions.entries()) {
            if (!session.completed && (now - session.lastActivity > CONFIG.SESSION_TIMEOUT_MINUTES * 60 * 1000)) {
                this.userSessions.delete(sessionId);
                cleaned++;
            }
        }
        
        // Очистка прочитанных уведомлений старше 30 дней
        for (const [userId, notifications] of this.notifications.entries()) {
            const filtered = notifications.filter(n => 
                !n.read || new Date(n.expiresAt) > now
            );
            if (filtered.length !== notifications.length) {
                this.notifications.set(userId, filtered);
                cleaned += notifications.length - filtered.length;
            }
        }
        
        if (cleaned > 0) {
            SystemLogger.debug('Очистка данных выполнена', { cleaned });
        }
        
        return cleaned;
    }
}

// ============================================
// ИНТЕРФЕЙС ПОЛЬЗОВАТЕЛЯ
// ============================================

class UserInterface {
    static getMainMenu(userId, isAdmin = false) {
        const menu = {
            reply_markup: {
                keyboard: [
                    [{ text: '📝 Подать заявку' }, { text: '🛡️ Стать защитником' }],
                    [{ text: '📊 Мои заявки' }, { text: '🔔 Уведомления' }],
                    [{ text: '📚 Помощь' }, { text: '⭐ Оставить отзыв' }],
                    [{ text: '⚙️ Настройки' }, { text: '📞 Поддержка' }]
                ],
                resize_keyboard: true,
                one_time_keyboard: false
            }
        };
        
        if (isAdmin) {
            menu.reply_markup.keyboard.push([
                { text: '👑 Админ панель' }
            ]);
        }
        
        return menu;
    }
    
    static getAdminMenu() {
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
                        { text: '👤 Пользователи', callback_data: 'admin_users' },
                        { text: '⚙️ Настройки', callback_data: 'admin_settings' }
                    ],
                    [
                        { text: '📁 Экспорт данных', callback_data: 'admin_export' },
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
                    ],
                    [
                        { text: '⭐ Повысить', callback_data: `def_promote_${defenderId}` },
                        { text: '📊 Статистика', callback_data: `def_stats_${defenderId}` }
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
                        { text: '📋 Подробнее', callback_data: `report_details_${reportId}` }
                    ],
                    [
                        { text: '⚠️ Высокий приоритет', callback_data: `report_priority_${reportId}` },
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
                    ],
                    [
                        { text: '⭐ Важно', callback_data: `feedback_important_${feedbackId}` },
                        { text: '🗑️ Удалить', callback_data: `feedback_delete_${feedbackId}` }
                    ]
                ]
            }
        };
    }
    
    static getRegionSelection() {
        return {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '🇷🇺 Россия', callback_data: 'region_ru' },
                        { text: '🇺🇦 Украина', callback_data: 'region_ua' }
                    ],
                    [
                        { text: '🇰🇿 Казахстан', callback_data: 'region_kz' },
                        { text: '🇧🇾 Беларусь', callback_data: 'region_by' }
                    ],
                    [
                        { text: '🌍 Другое', callback_data: 'region_other' },
                        { text: '🌐 Онлайн', callback_data: 'region_online' }
                    ]
                ]
            }
        };
    }
    
    static getProblemTypeSelection() {
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
                        { text: '📧 Спам', callback_data: 'problem_spam' }
                    ],
                    [
                        { text: '🔞 Контент', callback_data: 'problem_content' },
                        { text: '❓ Другое', callback_data: 'problem_other' }
                    ]
                ]
            }
        };
    }
    
    static getUrgencySelection() {
        return {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '⚡ Срочно (24ч)', callback_data: 'urgency_critical' },
                        { text: '⚠️ Высокий (48ч)', callback_data: 'urgency_high' }
                    ],
                    [
                        { text: '🔄 Средний (72ч)', callback_data: 'urgency_medium' },
                        { text: '⏱️ Обычный (7д)', callback_data: 'urgency_low' }
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
                        { text: '✅ Подтвердить', callback_data: 'confirm_yes' },
                        { text: '❌ Отменить', callback_data: 'confirm_no' }
                    ]
                ]
            }
        };
    }
    
    static getRatingButtons() {
        return {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '⭐', callback_data: 'rating_1' },
                        { text: '⭐⭐', callback_data: 'rating_2' },
                        { text: '⭐⭐⭐', callback_data: 'rating_3' }
                    ],
                    [
                        { text: '⭐⭐⭐⭐', callback_data: 'rating_4' },
                        { text: '⭐⭐⭐⭐⭐', callback_data: 'rating_5' }
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
                        timeout: 10,
                        limit: 100
                    }
                },
                request: {
                    timeout: 60000
                }
            });
            
            this.setupErrorHandlers();
            this.setupCommandHandlers();
            this.setupMessageHandlers();
            this.setupCallbackHandlers();
            
            SystemLogger.success('Telegram бот успешно инициализирован');
            
        } catch (error) {
            SystemLogger.error('Критическая ошибка инициализации бота', error);
            throw error;
        }
    }
    
    setupErrorHandlers() {
        this.bot.on('polling_error', (error) => {
            SystemLogger.error('Ошибка polling Telegram API', error);
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
        this.bot.onText(/^\/start(?:\s|$)/i, (msg) => this.handleStart(msg));
        this.bot.onText(/^\/help(?:\s|$)/i, (msg) => this.handleHelp(msg));
        this.bot.onText(/^\/report(?:\s|$)/i, (msg) => this.handleReport(msg));
        this.bot.onText(/^\/join(?:\s|$)/i, (msg) => this.handleJoin(msg));
        this.bot.onText(/^\/status(?:\s|$)/i, (msg) => this.handleStatus(msg));
        this.bot.onText(/^\/cancel(?:\s|$)/i, (msg) => this.handleCancel(msg));
        this.bot.onText(/^\/support(?:\s|$)/i, (msg) => this.handleSupport(msg));
        this.bot.onText(/^\/feedback(?:\s|$)/i, (msg) => this.handleFeedback(msg));
        this.bot.onText(/^\/myreports(?:\s|$)/i, (msg) => this.handleMyReports(msg));
        this.bot.onText(/^\/notifications(?:\s|$)/i, (msg) => this.handleNotifications(msg));
        this.bot.onText(/^\/settings(?:\s|$)/i, (msg) => this.handleSettings(msg));
        this.bot.onText(/^\/profile(?:\s|$)/i, (msg) => this.handleProfile(msg));
        
        // Админские команды
        this.bot.onText(/^\/admin(?:\s|$)/i, (msg) => this.handleAdmin(msg));
        this.bot.onText(/^\/defenders(?:\s|$)/i, (msg) => this.handleDefenders(msg));
        this.bot.onText(/^\/reports(?:\s|$)/i, (msg) => this.handleReports(msg));
        this.bot.onText(/^\/users(?:\s|$)/i, (msg) => this.handleUsers(msg));
        this.bot.onText(/^\/stats(?:\s|$)/i, (msg) => this.handleStats(msg));
        this.bot.onText(/^\/backup(?:\s|$)/i, (msg) => this.handleBackup(msg));
        this.bot.onText(/^\/broadcast(?:\s|$)/i, (msg) => this.handleBroadcast(msg));
    }
    
    setupMessageHandlers() {
        this.bot.on('message', (msg) => {
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
                
                SystemLogger.debug('Callback получен', { userId, data });
                
                // Обработка основных действий
                if (data.startsWith('def_')) {
                    await this.handleDefenderCallback(callbackQuery);
                } else if (data.startsWith('report_')) {
                    await this.handleReportCallback(callbackQuery);
                } else if (data.startsWith('feedback_')) {
                    await this.handleFeedbackCallback(callbackQuery);
                } else if (data.startsWith('admin_')) {
                    await this.handleAdminCallback(callbackQuery);
                } else if (data.startsWith('region_')) {
                    await this.handleRegionCallback(callbackQuery);
                } else if (data.startsWith('problem_')) {
                    await this.handleProblemCallback(callbackQuery);
                } else if (data.startsWith('urgency_')) {
                    await this.handleUrgencyCallback(callbackQuery);
                } else if (data.startsWith('rating_')) {
                    await this.handleRatingCallback(callbackQuery);
                } else if (data.startsWith('confirm_')) {
                    await this.handleConfirmationCallback(callbackQuery);
                } else if (data === 'menu_main') {
                    await this.showMainMenu(chatId, userId);
                } else if (data === 'menu_admin') {
                    await this.showAdminMenu(chatId);
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
    
    setupWebServer() {
        this.app.use(express.json());
        
        this.app.get('/', (req, res) => {
            const stats = this.dataManager.getStatistics();
            res.json({
                system: CONFIG.SYSTEM_NAME,
                version: CONFIG.VERSION,
                status: 'online',
                timestamp: new Date().toISOString(),
                statistics: stats,
                endpoints: {
                    health: '/health',
                    stats: '/stats',
                    backup: '/backup'
                }
            });
        });
        
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                bot: !!this.bot,
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                connections: this.bot ? this.bot._polling.offset : 0
            });
        });
        
        this.app.get('/stats', (req, res) => {
            res.json(this.dataManager.getStatistics());
        });
        
        this.app.get('/backup', (req, res) => {
            this.dataManager.createBackup();
            res.json({ status: 'backup_created' });
        });
        
        this.app.post('/webhook', (req, res) => {
            // Для будущей интеграции
            res.json({ received: true });
        });
    }
    
    setupIntervals() {
        // Автосохранение каждые 5 минут
        setInterval(() => {
            this.dataManager.saveData();
        }, 5 * 60 * 1000);
        
        // Очистка старых данных каждые 30 минут
        setInterval(() => {
            this.dataManager.cleanup();
        }, 30 * 60 * 1000);
        
        // Резервное копирование каждые 6 часов
        setInterval(() => {
            this.dataManager.createBackup();
        }, 6 * 60 * 60 * 1000);
        
        // Проверка уведомлений каждую минуту
        setInterval(() => {
            this.checkNotifications();
        }, 60 * 1000);
    }
    
    // ============================================
    // ОСНОВНЫЕ ОБРАБОТЧИКИ
    // ============================================
    
    async handleStart(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const userName = msg.from.first_name || 'Пользователь';
        
        SystemLogger.info(`/start от ${userName} (${userId})`);
        
        // Создаем или обновляем профиль пользователя
        const userProfile = this.dataManager.getUserProfile(userId);
        this.dataManager.updateUserProfile(userId, {
            lastSeen: new Date().toISOString(),
            username: msg.from.username || null
        });
        
        const isAdmin = userId.toString() === CONFIG.ADMIN_CHAT_ID;
        
        const welcomeMessage = 
            `🛡️ *Добро пожаловать в ${CONFIG.SYSTEM_NAME}!*\n\n` +
            `Привет, ${userName}! Я — система помощи жертвам киберпреступлений.\n\n` +
            `*Ваш ID:* \`${userId}\`\n` +
            `*Рейтинг:* ${'⭐'.repeat(Math.min(5, userProfile.rating))}\n` +
            `*Статус:* ${this.getUserStatus(userProfile.accessLevel)}\n\n` +
            `*Что я могу:*\n` +
            `• Принять заявку о проблеме\n` +
            `• Зарегистрировать вас как защитника\n` +
            `• Показать ваши заявки\n` +
            `• Уведомлять о новых случаях\n` +
            `• Предоставить статистику\n\n` +
            `Используйте меню ниже или команды для навигации.`;
        
        await this.sendMessage(chatId, welcomeMessage, {
            parse_mode: 'Markdown',
            ...UserInterface.getMainMenu(userId, isAdmin)
        });
        
        // Отправляем обучающее сообщение
        setTimeout(async () => {
            await this.sendMessage(chatId,
                `📚 *Быстрый старт:*\n\n` +
                `1. Нажмите "📝 Подать заявку" для получения помощи\n` +
                `2. Нажмите "🛡️ Стать защитником" чтобы помогать другим\n` +
                `3. Используйте "📊 Мои заявки" для отслеживания\n` +
                `4. "⭐ Оставить отзыв" для обратной связи\n\n` +
                `Все данные защищены шифрованием.`
            );
        }, 1000);
    }
    
    async handleHelp(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        const helpMessage = 
            `📚 *РУКОВОДСТВО ПОЛЬЗОВАТЕЛЯ*\n\n` +
            `*👤 Ваш профиль:*\n` +
            `• ID: \`${userId}\`\n` +
            `• Для копирования ID нажмите на него\n\n` +
            `*🛡️ ДЛЯ ПОСТРАДАВШИХ:*\n` +
            `1. Нажмите "📝 Подать заявку"\n` +
            `2. Выберите тип проблемы\n` +
            `3. Укажите срочность\n` +
            `4. Опишите ситуацию подробно\n` +
            `5. Защитник свяжется в указанный срок\n\n` +
            `*🦸 ДЛЯ ЗАЩИТНИКОВ:*\n` +
            `1. Нажмите "🛡️ Стать защитником"\n` +
            `2. Заполните анкету\n` +
            `3. Пройдите проверку (1-3 дня)\n` +
            `4. Получайте уведомления о новых случаях\n` +
            `5. Помогайте людям в вашем регионе\n\n` +
            `*🔒 БЕЗОПАСНОСТЬ:*\n` +
            `• Не сообщайте пароли\n` +
            `• Не переводите деньги\n` +
            `• Используйте псевдонимы\n` +
            `• Сохраняйте доказательства\n` +
            `• Проверяйте личность защитника\n\n` +
            `*⚡ БЫСТРЫЕ КОМАНДЫ:*\n` +
            `/start - Главное меню\n` +
            `/report - Подать заявку\n` +
            `/join - Стать защитником\n` +
            `/myreports - Мои заявки\n` +
            `/notifications - Уведомления\n` +
            `/feedback - Отзыв о системе\n` +
            `/support - Техподдержка\n` +
            `/cancel - Отмена операции\n\n` +
            `📞 *Поддержка:* ${CONFIG.TECH_SUPPORT}`;
        
        await this.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
    }
    
    async handleReport(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const userName = msg.from.first_name || 'Пользователь';
        
        // Проверка лимита запросов
        if (!this.checkRateLimit(userId)) {
            await this.sendMessage(chatId,
                `🚫 *Превышен лимит запросов*\n\n` +
                `Вы можете отправить не более ${CONFIG.MAX_REQUESTS_PER_HOUR} запросов в час.\n` +
                `Попробуйте позже.\n\n` +
                `Поддержка: ${CONFIG.TECH_SUPPORT}`
            );
            return;
        }
        
        // Создаем сессию
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
            `*ID сессии:* ${sessionId}\n` +
            `*Шаг 1/5:* Выбор типа проблемы\n\n` +
            `Выберите тип проблемы из списка ниже:`;
        
        await this.sendMessage(chatId, reportMessage, {
            parse_mode: 'Markdown',
            ...UserInterface.getProblemTypeSelection()
        });
    }
    
    async handleJoin(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const userName = msg.from.first_name || 'Пользователь';
        
        // Проверяем, не подавал ли уже заявку
        const existingDefender = Array.from(this.dataManager.defenders.values())
            .find(d => d.userId === userId.toString() && d.status === 'pending');
        
        if (existingDefender) {
            await this.sendMessage(chatId,
                `🔄 *Заявка уже на рассмотрении*\n\n` +
                `Ваша заявка #${existingDefender.id} находится на проверке.\n` +
                `Ожидайте ответа в течение 1-3 дней.\n\n` +
                `Статус можно проверить через /status`
            );
            return;
        }
        
        // Проверяем, не является ли уже защитником
        const approvedDefender = Array.from(this.dataManager.defenders.values())
            .find(d => d.userId === userId.toString() && d.status === 'approved');
        
        if (approvedDefender) {
            await this.sendMessage(chatId,
                `✅ *Вы уже защитник!*\n\n` +
                `Ваш статус: 🛡️ Активный защитник\n` +
                `Регион: ${approvedDefender.region}\n` +
                `Рассмотрено дел: ${approvedDefender.casesHandled}\n\n` +
                `Используйте /profile для подробной информации.`
            );
            return;
        }
        
        // Создаем сессию
        const sessionId = this.dataManager.createUserSession(userId, 'join', {
            userName: userName,
            chatId: chatId,
            step: 1,
            data: {}
        });
        
        const joinMessage = 
            `🛡️ *РЕГИСТРАЦИЯ ЗАЩИТНИКА*\n\n` +
            `Спасибо за желание помогать людям!\n` +
            `Процесс регистрации состоит из 6 шагов.\n\n` +
            `*Требования:*\n` +
            `• Возраст от 18 лет\n` +
            `• Наличие опыта в IT/юриспруденции/психологии\n` +
            `• Готовность уделять время\n` +
            `• Следование правилам этики\n\n` +
            `*Шаг 1/6:* Выберите ваш регион работы:`;
        
        await this.sendMessage(chatId, joinMessage, {
            parse_mode: 'Markdown',
            ...UserInterface.getRegionSelection()
        });
    }
    
    async handleStatus(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const userProfile = this.dataManager.getUserProfile(userId);
        
        const stats = this.dataManager.getStatistics();
        
        // Получаем статусы пользователя
        const userReports = this.dataManager.getReportsByUser(userId);
        const pendingReports = userReports.filter(r => r.status === 'new' || r.status === 'in_progress');
        const resolvedReports = userReports.filter(r => r.status === 'resolved');
        
        const defenderApp = Array.from(this.dataManager.defenders.values())
            .find(d => d.userId === userId.toString());
        
        const statusMessage = 
            `📊 *ВАШ СТАТУС*\n\n` +
            `*👤 Профиль:*\n` +
            `• ID: \`${userId}\`\n` +
            `• Рейтинг: ${'⭐'.repeat(Math.min(5, userProfile.rating))}\n` +
            `• Заявок подано: ${userProfile.reportsCount}\n` +
            `• Помогли людям: ${userProfile.helpedCount}\n\n` +
            `*📝 Ваши заявки:*\n` +
            `• Активные: ${pendingReports.length}\n` +
            `• Решено: ${resolvedReports.length}\n` +
            `• Всего: ${userReports.length}\n\n`;
        
        let defenderStatus = '';
        if (defenderApp) {
            defenderStatus = 
                `*🛡️ Статус защитника:*\n` +
                `• Статус: ${this.getDefenderStatus(defenderApp.status)}\n` +
                `• Регион: ${defenderApp.region}\n` +
                `• Рассмотрено дел: ${defenderApp.casesHandled}\n` +
                `• Дата регистрации: ${Utilities.formatDate(defenderApp.submittedAt)}\n\n`;
        }
        
        const systemStatus = 
            `*🌐 СИСТЕМА:*\n` +
            `• Активных пользователей: ${stats.activeToday}\n` +
            `• Заявок за месяц: ${stats.monthlyReports}\n` +
            `• Защитников онлайн: ${stats.monthlyDefenders}\n` +
            `• Время работы: ${Math.floor(stats.systemUptime / 3600)}ч\n\n` +
            `_Обновлено: ${new Date().toLocaleTimeString('ru-RU')}_`;
        
        await this.sendMessage(chatId, statusMessage + defenderStatus + systemStatus, {
            parse_mode: 'Markdown'
        });
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
            `*Частые вопросы:*\n` +
            `❓ *Как отменить заявку?*\n` +
            `→ Используйте команду /cancel\n\n` +
            `❓ *Как узнать статус заявки?*\n` +
            `→ Используйте /myreports\n\n` +
            `❓ *Как стать защитником?*\n` +
            `→ Используйте команду /join\n\n` +
            `*Для срочной помощи напишите напрямую:* ${CONFIG.TECH_SUPPORT}`;
        
        await this.sendMessage(chatId, supportMessage, { parse_mode: 'Markdown' });
    }
    
    async handleFeedback(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const userName = msg.from.first_name || 'Пользователь';
        
        // Создаем сессию для обратной связи
        const sessionId = this.dataManager.createUserSession(userId, 'feedback', {
            userName: userName,
            chatId: chatId,
            step: 1,
            data: {}
        });
        
        const feedbackMessage = 
            `⭐ *ОБРАТНАЯ СВЯЗЬ*\n\n` +
            `Мы ценим ваше мнение! Пожалуйста, помогите нам стать лучше.\n\n` +
            `*Шаг 1/3:* Выберите тип обратной связи:\n\n` +
            `🎯 *Предложение* - идеи по улучшению\n` +
            `🐛 *Ошибка* - сообщить о проблеме\n` +
            `🌟 *Благодарность* - поделиться успехом\n` +
            `❓ *Вопрос* - задать вопрос\n` +
            `💡 *Идея* - новая функциональность`;
        
        const inlineKeyboard = {
            inline_keyboard: [
                [
                    { text: '🎯 Предложение', callback_data: 'feedback_type_suggestion' },
                    { text: '🐛 Ошибка', callback_data: 'feedback_type_bug' }
                ],
                [
                    { text: '🌟 Благодарность', callback_data: 'feedback_type_compliment' },
                    { text: '❓ Вопрос', callback_data: 'feedback_type_question' }
                ],
                [
                    { text: '💡 Идея', callback_data: 'feedback_type_idea' },
                    { text: '📝 Другое', callback_data: 'feedback_type_other' }
                ]
            ]
        };
        
        await this.sendMessage(chatId, feedbackMessage, {
            parse_mode: 'Markdown',
            reply_markup: inlineKeyboard
        });
    }
    
    async handleMyReports(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        const userReports = this.dataManager.getReportsByUser(userId);
        
        if (userReports.length === 0) {
            await this.sendMessage(chatId,
                `📭 *У вас нет заявок*\n\n` +
                `Вы еще не подавали заявок о проблемах.\n` +
                `Нажмите "📝 Подать заявку" в меню, чтобы создать первую заявку.`
            );
            return;
        }
        
        // Группируем по статусу
        const activeReports = userReports.filter(r => r.status === 'new' || r.status === 'in_progress');
        const resolvedReports = userReports.filter(r => r.status === 'resolved');
        const closedReports = userReports.filter(r => r.status === 'closed');
        
        let reportsMessage = 
            `📋 *ВАШИ ЗАЯВКИ*\n\n` +
            `*📊 Статистика:*\n` +
            `• Всего: ${userReports.length}\n` +
            `• Активные: ${activeReports.length}\n` +
            `• Решено: ${resolvedReports.length}\n` +
            `• Закрыто: ${closedReports.length}\n\n`;
        
        // Показываем активные заявки
        if (activeReports.length > 0) {
            reportsMessage += `*🔄 АКТИВНЫЕ ЗАЯВКИ:*\n`;
            activeReports.slice(0, 5).forEach(report => {
                reportsMessage += `\n📌 *${report.id}*\n`;
                reportsMessage += `Тип: ${report.problemType}\n`;
                reportsMessage += `Статус: ${this.getReportStatus(report.status)}\n`;
                reportsMessage += `Приоритет: ${report.priority}\n`;
                reportsMessage += `Создана: ${Utilities.formatDate(report.createdAt)}\n`;
                
                if (report.assignedDefender) {
                    reportsMessage += `Защитник: ${report.assignedDefender}\n`;
                }
            });
            
            if (activeReports.length > 5) {
                reportsMessage += `\n...и еще ${activeReports.length - 5} заявок\n`;
            }
            
            reportsMessage += `\n`;
        }
        
        // Кнопки для навигации
        const inlineKeyboard = {
            inline_keyboard: [
                [
                    { text: '🔄 Активные', callback_data: 'myreports_active' },
                    { text: '✅ Решенные', callback_data: 'myreports_resolved' }
                ],
                [
                    { text: '📊 Статистика', callback_data: 'myreports_stats' },
                    { text: '📝 Новая заявка', callback_data: 'command_report' }
                ],
                [
                    { text: '🔄 Обновить', callback_data: 'myreports_refresh' }
                ]
            ]
        };
        
        await this.sendMessage(chatId, reportsMessage, {
            parse_mode: 'Markdown',
            reply_markup: inlineKeyboard
        });
    }
    
    async handleNotifications(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        const unreadNotifications = this.dataManager.getUnreadNotifications(userId);
        
        if (unreadNotifications.length === 0) {
            await this.sendMessage(chatId,
                `🔕 *Нет новых уведомлений*\n\n` +
                `У вас нет непрочитанных уведомлений.\n` +
                `Все важные обновления будут приходить сюда.`
            );
            return;
        }
        
        let notificationsMessage = `🔔 *УВЕДОМЛЕНИЯ (${unreadNotifications.length})*\n\n`;
        
        unreadNotifications.slice(0, 10).forEach((notification, index) => {
            notificationsMessage += `*${index + 1}. ${notification.title}*\n`;
            notificationsMessage += `${notification.message}\n`;
            notificationsMessage += `_${Utilities.formatDate(notification.createdAt)}_\n\n`;
        });
        
        if (unreadNotifications.length > 10) {
            notificationsMessage += `...и еще ${unreadNotifications.length - 10} уведомлений\n`;
        }
        
        const inlineKeyboard = {
            inline_keyboard: [
                [
                    { text: '✅ Прочитать все', callback_data: 'notifications_read_all' },
                    { text: '🗑️ Очистить', callback_data: 'notifications_clear' }
                ],
                [
                    { text: '⚙️ Настройки', callback_data: 'notifications_settings' }
                ]
            ]
        };
        
        await this.sendMessage(chatId, notificationsMessage, {
            parse_mode: 'Markdown',
            reply_markup: inlineKeyboard
        });
    }
    
    async handleSettings(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const userProfile = this.dataManager.getUserProfile(userId);
        
        const settingsMessage = 
            `⚙️ *НАСТРОЙКИ*\n\n` +
            `*Текущие настройки:*\n` +
            `• Уведомления: ${userProfile.settings.notifications ? '✅ Вкл' : '❌ Выкл'}\n` +
            `• Язык: ${userProfile.settings.language}\n` +
            `• Тема: ${userProfile.settings.theme}\n\n` +
            `*Управление данными:*\n` +
            `• Вы можете запросить свои данные\n` +
            `• Отозвать согласие на обработку\n` +
            `• Удалить аккаунт\n\n` +
            `_Все данные шифруются и хранятся безопасно_`;
        
        const inlineKeyboard = {
            inline_keyboard: [
                [
                    { text: '🔔 Уведомления', callback_data: 'setting_notifications' },
                    { text: '🌐 Язык', callback_data: 'setting_language' }
                ],
                [
                    { text: '🎨 Тема', callback_data: 'setting_theme' },
                    { text: '📊 Данные', callback_data: 'setting_data' }
                ],
                [
                    { text: '🔒 Безопасность', callback_data: 'setting_security' },
                    { text: '📋 Справка', callback_data: 'setting_help' }
                ],
                [
                    { text: '✅ Сохранить', callback_data: 'setting_save' },
                    { text: '🔄 Сбросить', callback_data: 'setting_reset' }
                ]
            ]
        };
        
        await this.sendMessage(chatId, settingsMessage, {
            parse_mode: 'Markdown',
            reply_markup: inlineKeyboard
        });
    }
    
    async handleProfile(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const userProfile = this.dataManager.getUserProfile(userId);
        
        // Получаем дополнительную статистику
        const userReports = this.dataManager.getReportsByUser(userId);
        const defenderApp = Array.from(this.dataManager.defenders.values())
            .find(d => d.userId === userId.toString());
        
        const profileMessage = 
            `👤 *ВАШ ПРОФИЛЬ*\n\n` +
            `*Основное:*\n` +
            `• ID: \`${userId}\`\n` +
            `• Уровень доступа: ${this.getAccessLevel(userProfile.accessLevel)}\n` +
            `• Дата регистрации: ${Utilities.formatDate(userProfile.joinedAt)}\n` +
            `• Рейтинг: ${'⭐'.repeat(Math.min(5, Math.floor(userProfile.rating)))}\n\n` +
            `*Статистика:*\n` +
            `• Заявок подано: ${userProfile.reportsCount}\n` +
            `• Помогли людям: ${userProfile.helpedCount}\n` +
            `• Активных заявок: ${userReports.filter(r => r.status === 'new' || r.status === 'in_progress').length}\n\n`;
        
        let defenderInfo = '';
        if (defenderApp) {
            defenderInfo = 
                `*🛡️ Информация защитника:*\n` +
                `• Имя в системе: ${defenderApp.defenderName}\n` +
                `• Регион: ${defenderApp.region}\n` +
                `• Статус: ${this.getDefenderStatus(defenderApp.status)}\n` +
                `• Рассмотрено дел: ${defenderApp.casesHandled}\n` +
                `• Навыки: ${defenderApp.skills}\n` +
                `• Дата регистрации: ${Utilities.formatDate(defenderApp.submittedAt)}\n\n`;
        }
        
        const badgesInfo = 
            `*🏅 Значки:*\n` +
            `${userProfile.badges.length > 0 ? userProfile.badges.join(', ') : 'Пока нет значков'}\n\n` +
            `_Для получения значков помогайте людям и активно участвуйте в системе_`;
        
        const inlineKeyboard = {
            inline_keyboard: [
                [
                    { text: '📊 Статистика', callback_data: 'profile_stats' },
                    { text: '🏅 Значки', callback_data: 'profile_badges' }
                ],
                [
                    { text: '📝 Редактировать', callback_data: 'profile_edit' },
                    { text: '🔄 Обновить', callback_data: 'profile_refresh' }
                ],
                [
                    { text: '📤 Поделиться', callback_data: 'profile_share' }
                ]
            ]
        };
        
        await this.sendMessage(chatId, profileMessage + defenderInfo + badgesInfo, {
            parse_mode: 'Markdown',
            reply_markup: inlineKeyboard
        });
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
            `*📊 СИСТЕМНАЯ СТАТИСТИКА:*\n` +
            `• Пользователей: ${stats.totalUsers}\n` +
            `• Активных сегодня: ${stats.activeToday}\n` +
            `• Заявок всего: ${stats.totalReports}\n` +
            `• Защитников: ${stats.totalDefenders}\n` +
            `• Отзывов: ${stats.totalFeedback}\n\n` +
            `*📈 ЗА МЕСЯЦ:*\n` +
            `• Новых заявок: ${stats.monthlyReports}\n` +
            `• Новых защитников: ${stats.monthlyDefenders}\n\n` +
            `*🔧 СИСТЕМА:*\n` +
            `• Версия: ${CONFIG.VERSION}\n` +
            `• Время работы: ${Math.floor(stats.systemUptime / 3600)}ч\n` +
            `• Память: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB\n\n` +
            `_Используйте кнопки ниже для управления_`;
        
        await this.sendMessage(chatId, adminMessage, {
            parse_mode: 'Markdown',
            ...UserInterface.getAdminMenu()
        });
    }
    
    async handleDefenders(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        if (!this.isAdmin(userId)) {
            await this.sendMessage(chatId, '❌ Эта команда только для администратора');
            return;
        }
        
        const defenders = Array.from(this.dataManager.defenders.values());
        
        if (defenders.length === 0) {
            await this.sendMessage(chatId, '🛡️ *Нет зарегистрированных защитников*', { parse_mode: 'Markdown' });
            return;
        }
        
        // Группируем по статусу
        const pendingDefenders = defenders.filter(d => d.status === 'pending');
        const approvedDefenders = defenders.filter(d => d.status === 'approved');
        const rejectedDefenders = defenders.filter(d => d.status === 'rejected');
        
        let defendersMessage = 
            `🛡️ *УПРАВЛЕНИЕ ЗАЩИТНИКАМИ*\n\n` +
            `*📊 Статистика:*\n` +
            `• Всего: ${defenders.length}\n` +
            `• На проверке: ${pendingDefenders.length}\n` +
            `• Одобрено: ${approvedDefenders.length}\n` +
            `• Отклонено: ${rejectedDefenders.length}\n\n`;
        
        // Показываем заявки на проверке
        if (pendingDefenders.length > 0) {
            defendersMessage += `*🔄 НА ПРОВЕРКЕ:*\n`;
            pendingDefenders.slice(0, 3).forEach(defender => {
                defendersMessage += `\n📋 *${defender.id}*\n`;
                defendersMessage += `Имя: ${defender.defenderName}\n`;
                defendersMessage += `Исходное имя: ${defender.userName}\n`;
                defendersMessage += `Регион: ${defender.region}\n`;
                defendersMessage += `Навыки: ${defender.skills.substring(0, 50)}...\n`;
                defendersMessage += `Подана: ${Utilities.formatDate(defender.submittedAt)}\n`;
            });
            
            if (pendingDefenders.length > 3) {
                defendersMessage += `\n...и еще ${pendingDefenders.length - 3} заявок\n`;
            }
        }
        
        const inlineKeyboard = {
            inline_keyboard: [
                [
                    { text: '🔄 На проверке', callback_data: 'defenders_pending' },
                    { text: '✅ Одобренные', callback_data: 'defenders_approved' }
                ],
                [
                    { text: '❌ Отклоненные', callback_data: 'defenders_rejected' },
                    { text: '📊 Статистика', callback_data: 'defenders_stats' }
                ],
                [
                    { text: '👁️ Поиск', callback_data: 'defenders_search' },
                    { text: '📁 Экспорт', callback_data: 'defenders_export' }
                ],
                [
                    { text: '🔄 Обновить', callback_data: 'defenders_refresh' }
                ]
            ]
        };
        
        await this.sendMessage(chatId, defendersMessage, {
            parse_mode: 'Markdown',
            reply_markup: inlineKeyboard
        });
    }
    
    async handleReports(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        if (!this.isAdmin(userId)) {
            await this.sendMessage(chatId, '❌ Эта команда только для администратора');
            return;
        }
        
        const reports = Array.from(this.dataManager.reports.values());
        
        if (reports.length === 0) {
            await this.sendMessage(chatId, '📝 *Нет заявок*', { parse_mode: 'Markdown' });
            return;
        }
        
        const newReports = reports.filter(r => r.status === 'new');
        const inProgressReports = reports.filter(r => r.status === 'in_progress');
        const resolvedReports = reports.filter(r => r.status === 'resolved');
        
        let reportsMessage = 
            `📝 *УПРАВЛЕНИЕ ЗАЯВКАМИ*\n\n` +
            `*📊 Статистика:*\n` +
            `• Всего: ${reports.length}\n` +
            `• Новых: ${newReports.length}\n` +
            `• В работе: ${inProgressReports.length}\n` +
            `• Решено: ${resolvedReports.length}\n\n`;
        
        // Показываем новые заявки
        if (newReports.length > 0) {
            reportsMessage += `*🆕 НОВЫЕ ЗАЯВКИ:*\n`;
            newReports.slice(0, 3).forEach(report => {
                reportsMessage += `\n🚨 *${report.id}*\n`;
                reportsMessage += `Тип: ${report.problemType}\n`;
                reportsMessage += `Приоритет: ${report.priority}\n`;
                reportsMessage += `От: ${report.userName}\n`;
                reportsMessage += `Страна: ${report.country}\n`;
                reportsMessage += `Создана: ${Utilities.formatDate(report.createdAt)}\n`;
            });
            
            if (newReports.length > 3) {
                reportsMessage += `\n...и еще ${newReports.length - 3} заявок\n`;
            }
        }
        
        const inlineKeyboard = {
            inline_keyboard: [
                [
                    { text: '🆕 Новые', callback_data: 'reports_new' },
                    { text: '🔄 В работе', callback_data: 'reports_inprogress' }
                ],
                [
                    { text: '✅ Решенные', callback_data: 'reports_resolved' },
                    { text: '📊 Статистика', callback_data: 'reports_stats' }
                ],
                [
                    { text: '🔍 Поиск', callback_data: 'reports_search' },
                    { text: '📁 Экспорт', callback_data: 'reports_export' }
                ],
                [
                    { text: '🔄 Обновить', callback_data: 'reports_refresh' }
                ]
            ]
        };
        
        await this.sendMessage(chatId, reportsMessage, {
            parse_mode: 'Markdown',
            reply_markup: inlineKeyboard
        });
    }
    
    async handleUsers(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        if (!this.isAdmin(userId)) {
            await this.sendMessage(chatId, '❌ Эта команда только для администратора');
            return;
        }
        
        const users = Array.from(this.dataManager.userProfiles.values());
        
        let usersMessage = 
            `👥 *УПРАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯМИ*\n\n` +
            `*📊 Статистика:*\n` +
            `• Всего пользователей: ${users.length}\n` +
            `• Защитников: ${users.filter(u => u.accessLevel >= CONFIG.ACCESS_LEVELS.DEFENDER).length}\n` +
            `• Модераторов: ${users.filter(u => u.accessLevel >= CONFIG.ACCESS_LEVELS.MODERATOR).length}\n` +
            `• Админов: ${users.filter(u => u.accessLevel >= CONFIG.ACCESS_LEVELS.ADMIN).length}\n\n` +
            `*📈 Активность:*\n` +
            `• Активных сегодня: ${this.dataManager.getActiveUsersCount()}\n` +
            `• Новых за месяц: ${users.filter(u => new Date(u.joinedAt) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)).length}\n\n` +
            `_Используйте кнопки для управления пользователями_`;
        
        const inlineKeyboard = {
            inline_keyboard: [
                [
                    { text: '📊 Статистика', callback_data: 'users_stats' },
                    { text: '👁️ Просмотр', callback_data: 'users_view' }
                ],
                [
                    { text: '🔍 Поиск', callback_data: 'users_search' },
                    { text: '📧 Рассылка', callback_data: 'users_broadcast' }
                ],
                [
                    { text: '⚙️ Роли', callback_data: 'users_roles' },
                    { text: '🚫 Блокировка', callback_data: 'users_ban' }
                ],
                [
                    { text: '🔄 Обновить', callback_data: 'users_refresh' }
                ]
            ]
        };
        
        await this.sendMessage(chatId, usersMessage, {
            parse_mode: 'Markdown',
            reply_markup: inlineKeyboard
        });
    }
    
    async handleStats(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        if (!this.isAdmin(userId)) {
            await this.sendMessage(chatId, '❌ Эта команда только для администратора');
            return;
        }
        
        const stats = this.dataManager.getStatistics();
        
        let statsMessage = 
            `📊 *ДЕТАЛЬНАЯ СТАТИСТИКА*\n\n` +
            `*👥 ПОЛЬЗОВАТЕЛИ:*\n` +
            `• Всего: ${stats.totalUsers}\n` +
            `• Активных сегодня: ${stats.activeToday}\n` +
            `• Новых за месяц: ${stats.monthlyReports}\n\n` +
            `*📝 ЗАЯВКИ:*\n` +
            `• Всего: ${stats.totalReports}\n` +
            `• Новых: ${stats.reportsByStatus.new || 0}\n` +
            `• В работе: ${stats.reportsByStatus.in_progress || 0}\n` +
            `• Решено: ${stats.reportsByStatus.resolved || 0}\n` +
            `• Закрыто: ${stats.reportsByStatus.closed || 0}\n\n` +
            `*🛡️ ЗАЩИТНИКИ:*\n` +
            `• Всего: ${stats.totalDefenders}\n` +
            `• На проверке: ${stats.defendersByStatus.pending || 0}\n` +
            `• Одобрено: ${stats.defendersByStatus.approved || 0}\n` +
            `• Активных: ${stats.defendersByStatus.active || 0}\n` +
            `• Новых за месяц: ${stats.monthlyDefenders}\n\n`;
        
        if (stats.topRegions.length > 0) {
            statsMessage += `*🌍 ТОП РЕГИОНОВ:*\n`;
            stats.topRegions.forEach((region, index) => {
                statsMessage += `${index + 1}. ${region.region}: ${region.country}\n`;
            });
            statsMessage += `\n`;
        }
        
        statsMessage += 
            `*📈 СИСТЕМА:*\n` +
            `• Время работы: ${Math.floor(stats.systemUptime / 3600)}ч ${Math.floor((stats.systemUptime % 3600) / 60)}м\n` +
            `• Память: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB\n` +
            `• Отзывов получено: ${stats.totalFeedback}\n\n` +
            `_Статистика обновлена: ${new Date().toLocaleString('ru-RU')}_`;
        
        const inlineKeyboard = {
            inline_keyboard: [
                [
                    { text: '📈 Графики', callback_data: 'stats_charts' },
                    { text: '📁 Экспорт', callback_data: 'stats_export' }
                ],
                [
                    { text: '🔄 Обновить', callback_data: 'stats_refresh' },
                    { text: '📅 За период', callback_data: 'stats_period' }
                ]
            ]
        };
        
        await this.sendMessage(chatId, statsMessage, {
            parse_mode: 'Markdown',
            reply_markup: inlineKeyboard
        });
    }
    
    async handleBackup(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        if (!this.isAdmin(userId)) {
            await this.sendMessage(chatId, '❌ Эта команда только для администратора');
            return;
        }
        
        this.dataManager.createBackup();
        
        await this.sendMessage(chatId,
            `✅ *Резервная копия создана*\n\n` +
            `Все данные системы сохранены в резервную копию.\n` +
            `Резервные копии хранятся 7 дней.\n\n` +
            `_Рекомендуется создавать резервные копии перед обновлением системы_`
        );
    }
    
    async handleBroadcast(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        if (!this.isAdmin(userId)) {
            await this.sendMessage(chatId, '❌ Эта команда только для администратора');
            return;
        }
        
        const broadcastMessage = 
            `📢 *РАССЫЛКА СООБЩЕНИЙ*\n\n` +
            `Вы можете отправить сообщение всем пользователям системы.\n\n` +
            `*Варианты рассылки:*\n` +
            `• Всем пользователям\n` +
            `• Только защитникам\n` +
            `• Пользователям с активными заявками\n` +
            `• По регионам\n\n` +
            `_Для начала рассылки используйте команду:_\n` +
            `/broadcast_start [тип] [сообщение]`;
        
        const inlineKeyboard = {
            inline_keyboard: [
                [
                    { text: '👥 Всем', callback_data: 'broadcast_all' },
                    { text: '🛡️ Защитникам', callback_data: 'broadcast_defenders' }
                ],
                [
                    { text: '📝 С заявками', callback_data: 'broadcast_active' },
                    { text: '🌍 По регионам', callback_data: 'broadcast_regions' }
                ],
                [
                    { text: '⚙️ Настройки', callback_data: 'broadcast_settings' }
                ]
            ]
        };
        
        await this.sendMessage(chatId, broadcastMessage, {
            parse_mode: 'Markdown',
            reply_markup: inlineKeyboard
        });
    }
    
    // ============================================
    // ОБРАБОТЧИКИ CALLBACK
    // ============================================
    
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
        const defenderId = parts.slice(2).join('_');
        
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
                await this.approveDefender(defenderId, defender);
                break;
            case 'reject':
                await this.rejectDefender(defenderId, defender);
                break;
            case 'contact':
                await this.contactDefender(defenderId, defender);
                break;
            case 'details':
                await this.showDefenderDetails(defenderId, defender);
                break;
            case 'promote':
                await this.promoteDefender(defenderId, defender);
                break;
            case 'stats':
                await this.showDefenderStats(defenderId, defender);
                break;
        }
    }
    
    async approveDefender(defenderId, defender) {
        // Обновляем статус защитника
        defender.status = 'approved';
        defender.reviewedAt = new Date().toISOString();
        defender.reviewedBy = CONFIG.ADMIN_CHAT_ID;
        this.dataManager.defenders.set(defenderId, defender);
        
        // Обновляем профиль пользователя
        const userProfile = this.dataManager.getUserProfile(defender.userId);
        userProfile.accessLevel = CONFIG.ACCESS_LEVELS.DEFENDER;
        userProfile.badges.push('🛡️ Защитник');
        this.dataManager.userProfiles.set(defender.userId, userProfile);
        
        this.dataManager.saveData();
        
        // Отправляем уведомление защитнику
        await this.sendMessage(defender.chatId,
            `🎉 *ВАША ЗАЯВКА ОДОБРЕНА!*\n\n` +
            `Заявка #${defenderId} успешно одобрена.\n\n` +
            `*Теперь вы официальный защитник системы!*\n\n` +
            `*Ваши данные:*\n` +
            `• Имя в системе: ${defender.defenderName}\n` +
            `• Регион: ${defender.region}\n` +
            `• Статус: 🛡️ Активный защитник\n` +
            `• ID защитника: ${defenderId}\n\n` +
            `*Что дальше:*\n` +
            `1. Вы будете получать уведомления о новых заявках\n` +
            `2. Для начала работы ожидайте первого уведомления\n` +
            `3. Все инструкции будут отправлены дополнительно\n\n` +
            `*Правила защитника:*\n` +
            `• Соблюдайте конфиденциальность\n` +
            `• Отвечайте оперативно\n` +
            `• Вежливо общайтесь с пользователями\n` +
            `• Сообщайте о проблемах администрации\n\n` +
            `Спасибо за участие! 🛡️`
        );
        
        // Обновляем сообщение администратора
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
        
        SystemLogger.info(`Защитник одобрен`, { defenderId, userId: defender.userId });
    }
    
    async rejectDefender(defenderId, defender) {
        defender.status = 'rejected';
        defender.reviewedAt = new Date().toISOString();
        defender.reviewedBy = CONFIG.ADMIN_CHAT_ID;
        defender.notes.push({
            date: new Date().toISOString(),
            note: 'Заявка отклонена администратором'
        });
        
        this.dataManager.defenders.set(defenderId, defender);
        this.dataManager.saveData();
        
        // Уведомляем пользователя
        await this.sendMessage(defender.chatId,
            `📋 *ПО ВАШЕЙ ЗАЯВКЕ #${defenderId}*\n\n` +
            `К сожалению, ваша заявка не была одобрена.\n\n` +
            `*Возможные причины:*\n` +
            `• Неполная или неточная информация\n` +
            `• Недостаточный опыт или навыки\n` +
            `• Ограничение по региону\n` +
            `• Другие организационные причины\n\n` +
            `Вы можете подать заявку повторно через 30 дней,\n` +
            `исправив указанные недостатки.\n\n` +
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
        
        SystemLogger.info(`Заявка защитника отклонена`, { defenderId });
    }
    
    async contactDefender(defenderId, defender) {
        await this.bot.answerCallbackQuery(callbackQuery.id, {
            text: `Связь с защитником: tg://user?id=${defender.userId}`,
            show_alert: true
        });
    }
    
    async showDefenderDetails(defenderId, defender) {
        const detailsMessage = 
            `📋 *ДЕТАЛИ ЗАЩИТНИКА #${defenderId}*\n\n` +
            `*Основная информация:*\n` +
            `• Имя в системе: ${defender.defenderName}\n` +
            `• Исходное имя: ${defender.userName}\n` +
            `• ID пользователя: \`${defender.userId}\`\n` +
            `• Chat ID: \`${defender.chatId}\`\n\n` +
            `*Профессиональные данные:*\n` +
            `• Регион: ${defender.region}\n` +
            `• Навыки: ${defender.skills}\n` +
            `• Опыт: ${defender.experience}\n` +
            `• Языки: ${defender.languages.join(', ')}\n` +
            `• Доступность: ${defender.availability}\n\n` +
            `*Статистика:*\n` +
            `• Статус: ${defender.status}\n` +
            `• Рейтинг: ${defender.rating}/5\n` +
            `• Рассмотрено дел: ${defender.casesHandled}\n` +
            `• Подана: ${Utilities.formatDate(defender.submittedAt)}\n` +
            `• Рассмотрена: ${defender.reviewedAt ? Utilities.formatDate(defender.reviewedAt) : 'Не рассмотрена'}\n\n` +
            `*Специализация:*\n` +
            `${defender.specialization.length > 0 ? defender.specialization.join(', ') : 'Не указана'}\n\n` +
            `_Для связи: tg://user?id=${defender.userId}_`;
        
        await this.sendMessage(callbackQuery.message.chat.id, detailsMessage, {
            parse_mode: 'Markdown'
        });
    }
    
    async promoteDefender(defenderId, defender) {
        const userProfile = this.dataManager.getUserProfile(defender.userId);
        userProfile.accessLevel = CONFIG.ACCESS_LEVELS.MODERATOR;
        userProfile.badges.push('⭐ Модератор');
        this.dataManager.userProfiles.set(defender.userId, userProfile);
        this.dataManager.saveData();
        
        await this.sendMessage(defender.chatId,
            `⭐ *ВЫ ПОВЫШЕНЫ ДО МОДЕРАТОРА!*\n\n` +
            `Поздравляем! Вы получили новый уровень доступа.\n\n` +
            `*Новые возможности:*\n` +
            `• Просмотр статистики системы\n` +
            `• Помощь в проверке заявок\n` +
            `• Доступ к базе знаний\n` +
            `• Приоритет в уведомлениях\n\n` +
            `Спасибо за ваш вклад в развитие системы!`
        );
        
        await this.bot.answerCallbackQuery(callbackQuery.id, {
            text: '⭐ Защитник повышен до модератора',
            show_alert: true
        });
    }
    
    async showDefenderStats(defenderId, defender) {
        const userReports = this.dataManager.getReportsByUser(defender.userId);
        const helpedReports = userReports.filter(r => r.assignedTo === defender.userId && r.status === 'resolved');
        
        const statsMessage = 
            `📊 *СТАТИСТИКА ЗАЩИТНИКА #${defenderId}*\n\n` +
            `*Общая статистика:*\n` +
            `• Всего заявок подано: ${userReports.length}\n` +
            `• Помог решить: ${helpedReports.length}\n` +
            `• Текущий рейтинг: ${defender.rating}/5\n` +
            `• Активность: ${defender.availability}\n\n` +
            `*Эффективность:*\n` +
            `• Скорость ответа: ${defender.responseTime || 'Не измерялась'}\n` +
            `• Удовлетворенность: ${defender.satisfaction || 'Не измерялась'}\n` +
            `• Надежность: ${defender.reliability || 'Не измерялась'}\n\n` +
            `*Последние 5 решенных дел:*\n`;
        
        helpedReports.slice(0, 5).forEach((report, index) => {
            statsMessage += `${index + 1}. ${report.problemType} (${report.id})\n`;
        });
        
        if (helpedReports.length === 0) {
            statsMessage += `Пока нет решенных дел\n`;
        }
        
        statsMessage += `\n_Статистика обновлена: ${new Date().toLocaleString('ru-RU')}_`;
        
        await this.sendMessage(callbackQuery.message.chat.id, statsMessage, {
            parse_mode: 'Markdown'
        });
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
        const reportId = parts.slice(2).join('_');
        
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
                await this.assignReport(reportId, report);
                break;
            case 'complete':
                await this.completeReport(reportId, report);
                break;
            case 'contact':
                await this.contactReportUser(reportId, report);
                break;
            case 'details':
                await this.showReportDetails(reportId, report);
                break;
            case 'priority':
                await this.changeReportPriority(reportId, report);
                break;
            case 'close':
                await this.closeReport(reportId, report);
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
        
        const parts = data.split('_');
        const action = parts[1];
        const feedbackId = parts.slice(2).join('_');
        
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
                await this.processFeedback(feedbackId, feedback);
                break;
            case 'reply':
                await this.replyToFeedback(feedbackId, feedback);
                break;
            case 'important':
                await this.markFeedbackImportant(feedbackId, feedback);
                break;
            case 'delete':
                await this.deleteFeedback(feedbackId, feedback);
                break;
        }
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
        
        const parts = data.split('_');
        const section = parts[0];
        const action = parts[1];
        
        switch (section) {
            case 'admin':
                await this.handleAdminSection(action, callbackQuery);
                break;
            case 'defenders':
                await this.handleDefendersSection(action, callbackQuery);
                break;
            case 'reports':
                await this.handleReportsSection(action, callbackQuery);
                break;
            case 'users':
                await this.handleUsersSection(action, callbackQuery);
                break;
            case 'stats':
                await this.handleStatsSection(action, callbackQuery);
                break;
        }
    }
    
    async handleRegionCallback(callbackQuery) {
        const chatId = callbackQuery.message.chat.id;
        const userId = callbackQuery.from.id;
        const data = callbackQuery.data;
        
        // Находим активную сессию
        const session = this.findUserSession(userId);
        if (!session) {
            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: '❌ Сессия не найдена',
                show_alert: true
            });
            return;
        }
        
        const regionMap = {
            'region_ru': 'Россия',
            'region_ua': 'Украина',
            'region_kz': 'Казахстан',
            'region_by': 'Беларусь',
            'region_other': 'Другая страна',
            'region_online': 'Онлайн помощь'
        };
        
        const region = regionMap[data] || 'Не указано';
        
        if (session.type === 'report') {
            session.data.country = region;
            session.step = 2;
            this.updateSession(session);
            
            await this.sendMessage(chatId,
                `✅ *Страна выбрана: ${region}*\n\n` +
                `*Шаг 2/5:* Оцените срочность проблемы\n\n` +
                `Выберите, насколько срочно вам нужна помощь:`
            );
            
            await this.sendMessage(chatId, 'Выберите срочность:', {
                ...UserInterface.getUrgencySelection()
            });
            
        } else if (session.type === 'join') {
            session.data.region = region;
            session.step = 2;
            this.updateSession(session);
            
            await this.sendMessage(chatId,
                `✅ *Регион выбран: ${region}*\n\n` +
                `*Шаг 2/6:* Укажите ваше имя в системе\n\n` +
                `Как к вам обращаться в системе?\n` +
                `(Можно использовать псевдоним)`
            );
        }
        
        await this.bot.answerCallbackQuery(callbackQuery.id);
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
            'problem_spam': 'Спам',
            'problem_content': 'Незаконный контент',
            'problem_other': 'Другое'
        };
        
        const problemType = problemMap[data] || 'Другое';
        session.data.problemType = problemType;
        session.step = 2;
        this.updateSession(session);
        
        await this.sendMessage(chatId,
            `✅ *Тип проблемы: ${problemType}*\n\n` +
            `*Шаг 2/5:* Выберите вашу страну\n\n` +
            `В какой стране вы находитесь?`
        );
        
        await this.sendMessage(chatId, 'Выберите страну:', {
            ...UserInterface.getRegionSelection()
        });
        
        await this.bot.answerCallbackQuery(callbackQuery.id);
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
            'urgency_critical': { text: 'Срочно (24ч)', value: 'critical' },
            'urgency_high': { text: 'Высокий (48ч)', value: 'high' },
            'urgency_medium': { text: 'Средний (72ч)', value: 'medium' },
            'urgency_low': { text: 'Обычный (7д)', value: 'low' }
        };
        
        const urgency = urgencyMap[data] || urgencyMap['urgency_medium'];
        session.data.urgency = urgency.value;
        session.step = 3;
        this.updateSession(session);
        
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
        
        await this.bot.answerCallbackQuery(callbackQuery.id);
    }
    
    async handleRatingCallback(callbackQuery) {
        const chatId = callbackQuery.message.chat.id;
        const userId = callbackQuery.from.id;
        const data = callbackQuery.data;
        
        const session = this.findUserSession(userId);
        if (!session || session.type !== 'feedback') {
            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: '❌ Сессия не найдена',
                show_alert: true
            });
            return;
        }
        
        const rating = parseInt(data.split('_')[1]);
        session.data.rating = rating;
        session.step = 3;
        this.updateSession(session);
        
        await this.sendMessage(chatId,
            `✅ *Оценка: ${'⭐'.repeat(rating)}*\n\n` +
            `*Шаг 3/3:* Ваш отзыв\n\n` +
            `Напишите ваш отзыв, предложения или замечания.\n\n` +
            `Что вам понравилось или что можно улучшить?`
        );
        
        await this.bot.answerCallbackQuery(callbackQuery.id);
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
            // Подтверждение действия
            if (session.type === 'join' && session.step === 6) {
                // Завершаем регистрацию защитника
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
                    `*Навыки:* ${session.data.skills}\n` +
                    `*Опыт:* ${session.data.experience}\n\n` +
                    `ID: \`${application.id}\`\n` +
                    `User ID: \`${userId}\``,
                    {
                        parse_mode: 'Markdown',
                        ...UserInterface.getDefenderActions(application.id)
                    }
                );
                
                this.completeSession(session.id);
            }
        } else if (data === 'confirm_no') {
            await this.sendMessage(chatId, '❌ Действие отменено');
            this.completeSession(session.id);
        }
        
        await this.bot.answerCallbackQuery(callbackQuery.id);
    }
    
    // ============================================
    // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
    // ============================================
    
    isAdmin(userId) {
        return userId.toString() === CONFIG.ADMIN_CHAT_ID;
    }
    
    checkRateLimit(userId) {
        return this.dataManager.canMakeRequest(userId);
    }
    
    findUserSession(userId) {
        for (const session of this.dataManager.userSessions.values()) {
            if (session.userId === userId.toString() && !session.completed) {
                return session;
            }
        }
        return null;
    }
    
    updateSession(session) {
        session.lastActivity = Date.now();
        this.dataManager.userSessions.set(session.id, session);
    }
    
    completeSession(sessionId) {
        const session = this.dataManager.userSessions.get(sessionId);
        if (session) {
            session.completed = true;
            session.completedAt = Date.now();
            this.dataManager.userSessions.set(sessionId, session);
        }
    }
    
    getUserStatus(accessLevel) {
        const statuses = {
            1: '👤 Пользователь',
            2: '🛡️ Защитник',
            3: '⭐ Модератор',
            4: '👑 Администратор'
        };
        return statuses[accessLevel] || '👤 Пользователь';
    }
    
    getAccessLevel(level) {
        const levels = {
            1: 'Пользователь',
            2: 'Защитник',
            3: 'Модератор',
            4: 'Администратор'
        };
        return levels[level] || 'Пользователь';
    }
    
    getDefenderStatus(status) {
        const statuses = {
            'pending': '🔄 На проверке',
            'approved': '✅ Одобрен',
            'rejected': '❌ Отклонен',
            'active': '🟢 Активен',
            'inactive': '⚫ Неактивен'
        };
        return statuses[status] || status;
    }
    
    getReportStatus(status) {
        const statuses = {
            'new': '🆕 Новая',
            'in_progress': '🔄 В работе',
            'resolved': '✅ Решена',
            'closed': '🔒 Закрыта'
        };
        return statuses[status] || status;
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
                error: error.message,
                textLength: text.length
            });
            
            // Попытка отправить без форматирования
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
                SystemLogger.error('Вторая ошибка отправки сообщения', secondError.message);
                return false;
            }
        }
    }
    
    async showMainMenu(chatId, userId) {
        const isAdmin = this.isAdmin(userId);
        await this.sendMessage(chatId, 'Главное меню:', UserInterface.getMainMenu(userId, isAdmin));
    }
    
    async showAdminMenu(chatId) {
        await this.sendMessage(chatId, 'Админ панель:', UserInterface.getAdminMenu());
    }
    
    async checkNotifications() {
        try {
            const now = new Date();
            const users = Array.from(this.dataManager.userProfiles.values());
            
            for (const user of users) {
                // Проверяем непрочитанные уведомления
                const unread = this.dataManager.getUnreadNotifications(user.userId);
                if (unread.length > 0 && user.settings.notifications) {
                    // Можно добавить отправку напоминаний
                }
            }
        } catch (error) {
            SystemLogger.error('Ошибка проверки уведомлений', error);
        }
    }
    
    async handleUserMessage(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const userText = msg.text || '';
        
        // Находим активную сессию
        const session = this.findUserSession(userId);
        if (!session) {
            // Нет активной сессии, показываем главное меню
            const isAdmin = this.isAdmin(userId);
            await this.showMainMenu(chatId, userId);
            return;
        }
        
        // Обновляем время активности
        this.updateSession(session);
        
        // Обрабатываем в зависимости от типа сессии
        switch (session.type) {
            case 'report':
                await this.processReportStep(session, userText);
                break;
            case 'join':
                await this.processJoinStep(session, userText);
                break;
            case 'feedback':
                await this.processFeedbackStep(session, userText);
                break;
        }
    }
    
    async processReportStep(session, userText) {
        const { chatId, userId, step, data } = session;
        
        switch (step) {
            case 3: // Описание проблемы
                if (userText.length < CONFIG.MIN_DESCRIPTION_LENGTH) {
                    await this.sendMessage(chatId,
                        `❌ Описание слишком короткое. Минимум ${CONFIG.MIN_DESCRIPTION_LENGTH} символов.\n\n` +
                        `Пожалуйста, опишите подробнее.`
                    );
                    return;
                }
                
                if (userText.length > CONFIG.MAX_DESCRIPTION_LENGTH) {
                    await this.sendMessage(chatId,
                        `❌ Описание слишком длинное. Максимум ${CONFIG.MAX_DESCRIPTION_LENGTH} символов.\n\n` +
                        `Пожалуйста, сократите описание.`
                    );
                    return;
                }
                
                data.description = userText;
                session.step = 4;
                this.updateSession(session);
                
                await this.sendMessage(chatId,
                    `✅ *Описание принято*\n\n` +
                    `*Шаг 4/5:* Контактная информация\n\n` +
                    `Как с вами лучше связаться?\n` +
                    `Укажите предпочтительный способ связи:\n\n` +
                    `*Примеры:*\n` +
                    `• Telegram: @username\n` +
                    `• Email: example@email.com\n` +
                    `• Телефон: +79991234567\n` +
                    `• Другой способ\n\n` +
                    `_Эти данные видны только назначенному защитнику_`
                );
                break;
                
            case 4: // Контактная информация
                data.contact = userText;
                session.step = 5;
                this.updateSession(session);
                
                // Создаем предварительный просмотр
                const previewMessage = 
                    `📋 *ПРЕДВАРИТЕЛЬНЫЙ ПРОСМОТР ЗАЯВКИ*\n\n` +
                    `*Тип проблемы:* ${data.problemType}\n` +
                    `*Страна:* ${data.country}\n` +
                    `*Срочность:* ${data.urgency}\n` +
                    `*Описание:*\n${data.description.substring(0, 200)}${data.description.length > 200 ? '...' : ''}\n` +
                    `*Контакт:* ${data.contact}\n\n` +
                    `*Подтвердите отправку заявки:*`;
                
                await this.sendMessage(chatId, previewMessage, {
                    parse_mode: 'Markdown',
                    ...UserInterface.getConfirmationButtons()
                });
                break;
        }
    }
    
    async processJoinStep(session, userText) {
        const { chatId, userId, step, data } = session;
        
        switch (step) {
            case 2: // Имя защитника
                if (userText.length < 2 || userText.length > 50) {
                    await this.sendMessage(chatId,
                        '❌ Имя должно быть от 2 до 50 символов.\n\n' +
                        'Пример: Иван, Анна Петрова, Алексей (IT специалист)'
                    );
                    return;
                }
                
                data.defenderName = userText;
                session.step = 3;
                this.updateSession(session);
                
                await this.sendMessage(chatId,
                    `✅ *Имя принято: ${userText}*\n\n` +
                    `*Шаг 3/6:* Ваши навыки и опыт\n\n` +
                    `Опишите ваши профессиональные навыки и опыт:\n\n` +
                    `*Примеры:*\n` +
                    `• Юрист, опыт 5 лет\n` +
                    `• IT специалист, кибербезопасность\n` +
                    `• Психолог, поддержка жертв\n` +
                    `• Переводчик английского языка\n\n` +
                    `Чем подробнее, тем лучше.`
                );
                break;
                
            case 3: // Навыки
                if (userText.length < 10) {
                    await this.sendMessage(chatId,
                        '❌ Пожалуйста, опишите ваши навыки подробнее.\n' +
                        'Минимум 10 символов.'
                    );
                    return;
                }
                
                data.skills = userText;
                session.step = 4;
                this.updateSession(session);
                
                await this.sendMessage(chatId,
                    `✅ *Навыки приняты*\n\n` +
                    `*Шаг 4/6:* Опыт работы\n\n` +
                    `Опишите ваш опыт работы в этой области:\n\n` +
                    `• Сколько лет опыта?\n` +
                    `• Какие проекты реализовали?\n` +
                    `• Какие достижения?\n` +
                    `• Сертификаты, образование?`
                );
                break;
                
            case 4: // Опыт
                data.experience = userText;
                session.step = 5;
                this.updateSession(session);
                
                await this.sendMessage(chatId,
                    `✅ *Опыт принят*\n\n` +
                    `*Шаг 5/6:* Языки\n\n` +
                    `Какими языками вы владеете?\n\n` +
                    `Укажите через запятую:\n` +
                    `• Русский\n` +
                    `• Английский\n` +
                    `• Другие языки\n\n` +
                    `_Пример: Русский, Английский (Intermediate)_`
                );
                break;
                
            case 5: // Языки
                data.languages = userText.split(',').map(lang => lang.trim());
                session.step = 6;
                this.updateSession(session);
                
                // Создаем предварительный просмотр анкеты
                const previewMessage = 
                    `📋 *ПРЕДВАРИТЕЛЬНЫЙ ПРОСМОТР АНКЕТЫ*\n\n` +
                    `*Имя в системе:* ${data.defenderName}\n` +
                    `*Регион:* ${data.region}\n` +
                    `*Навыки:* ${data.skills.substring(0, 100)}${data.skills.length > 100 ? '...' : ''}\n` +
                    `*Опыт:* ${data.experience.substring(0, 100)}${data.experience.length > 100 ? '...' : ''}\n` +
                    `*Языки:* ${data.languages.join(', ')}\n\n` +
                    `*Подтвердите отправку анкеты:*`;
                
                await this.sendMessage(chatId, previewMessage, {
                    parse_mode: 'Markdown',
                    ...UserInterface.getConfirmationButtons()
                });
                break;
        }
    }
    
    async processFeedbackStep(session, userText) {
        const { chatId, userId, step, data } = session;
        
        if (step === 2 || step === 3) {
            if (userText.length < 10) {
                await this.sendMessage(chatId,
                    '❌ Пожалуйста, напишите более развернутый отзыв.\n' +
                    'Минимум 10 символов.'
                );
                return;
            }
            
            data.message = userText;
            
            // Создаем отзыв
            const feedback = this.dataManager.createFeedback(
                userId,
                session.data.userName,
                data.type,
                data.message,
                data.rating
            );
            
            // Подтверждение пользователю
            await this.sendMessage(chatId,
                `✅ *СПАСИБО ЗА ОТЗЫВ!*\n\n` +
                `Ваш отзыв #${feedback.id} успешно отправлен.\n` +
                `Мы ценим ваше мнение и обязательно его учтем.\n\n` +
                `*Тип:* ${data.type}\n` +
                `${data.rating ? `*Оценка:* ${'⭐'.repeat(data.rating)}\n` : ''}` +
                `*Сообщение:*\n${data.message.substring(0, 100)}${data.message.length > 100 ? '...' : ''}\n\n` +
                `Спасибо за помощь в улучшении системы!`
            );
            
            // Уведомление администратору
            await this.sendMessage(CONFIG.ADMIN_CHAT_ID,
                `📢 *НОВЫЙ ОТЗЫВ #${feedback.id}*\n\n` +
                `*Тип:* ${data.type}\n` +
                `*От:* ${session.data.userName}\n` +
                `${data.rating ? `*Оценка:* ${'⭐'.repeat(data.rating)}\n` : ''}` +
                `*Сообщение:*\n${data.message.substring(0, 200)}${data.message.length > 200 ? '...' : ''}\n\n` +
                `ID: \`${feedback.id}\`\n` +
                `User ID: \`${userId}\``,
                {
                    parse_mode: 'Markdown',
                    ...UserInterface.getFeedbackActions(feedback.id)
                }
            );
            
            this.completeSession(session.id);
        }
    }
    
    startServer() {
        return new Promise((resolve, reject) => {
            const server = this.app.listen(CONFIG.PORT, CONFIG.HOST, () => {
                SystemLogger.success(`Веб-сервер запущен на порту ${CONFIG.PORT}`);
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
        console.clear();
        console.log('='.repeat(80));
        console.log(`🚀 ${CONFIG.SYSTEM_NAME} v${CONFIG.VERSION}`);
        console.log('='.repeat(80));
        
        // Проверка конфигурации
        if (!CONFIG.BOT_TOKEN || CONFIG.BOT_TOKEN.length < 30) {
            console.error('❌ КРИТИЧЕСКАЯ ОШИБКА: BOT_TOKEN не установлен или неверный');
            console.error('   Получите токен у @BotFather в Telegram');
            console.error('   Добавьте в переменные окружения: BOT_TOKEN=ваш_токен');
            process.exit(1);
        }
        
        if (!CONFIG.ADMIN_CHAT_ID || isNaN(CONFIG.ADMIN_CHAT_ID)) {
            console.error('❌ КРИТИЧЕСКАЯ ОШИБКА: ADMIN_CHAT_ID не установлен');
            console.error('   Узнайте свой Chat ID через @userinfobot в Telegram');
            console.error('   Добавьте в переменные окружения: ADMIN_CHAT_ID=ваш_id');
            process.exit(1);
        }
        
        console.log('✅ Конфигурация проверена');
        console.log(`   Токен: ${CONFIG.BOT_TOKEN.substring(0, 15)}...`);
        console.log(`   Админ ID: ${CONFIG.ADMIN_CHAT_ID}`);
        console.log(`   Порт: ${CONFIG.PORT}`);
        console.log(`   Поддержка: ${CONFIG.TECH_SUPPORT}`);
        console.log('='.repeat(80));
        
        // Создаем и запускаем систему
        const botSystem = new BakeliteDefenceBot();
        await botSystem.startServer();
        
        console.log('\n' + '='.repeat(80));
        console.log('🎉 СИСТЕМА УСПЕШНО ЗАПУЩЕНА!');
        console.log('='.repeat(80));
        console.log('\n📱 ОСНОВНЫЕ КОМАНДЫ:');
        console.log('  /start       - Главное меню с кнопками');
        console.log('  /report      - Подать заявку (5 шагов)');
        console.log('  /join        - Стать защитником (6 шагов)');
        console.log('  /myreports   - Мои заявки');
        console.log('  /notifications - Уведомления');
        console.log('  /feedback    - Оставить отзыв');
        console.log('  /profile     - Мой профиль');
        console.log('  /settings    - Настройки');
        console.log('  /help        - Полная помощь');
        console.log('  /support     - Техподдержка');
        console.log('  /status      - Статус системы');
        console.log('  /admin       - Админ панель (только для админа)');
        console.log('\n👑 АДМИНСКИЕ КОМАНДЫ:');
        console.log('  /defenders   - Управление защитниками');
        console.log('  /reports     - Управление заявками');
        console.log('  /users       - Управление пользователями');
        console.log('  /stats       - Детальная статистика');
        console.log('  /backup      - Создать резервную копию');
        console.log('  /broadcast   - Рассылка сообщений');
        console.log('='.repeat(80));
        console.log(`\n📞 Контакт для вопросов: ${CONFIG.TECH_SUPPORT}`);
        console.log('🕒 Система работает 24/7');
        console.log('🔒 Все данные защищены шифрованием');
        console.log('='.repeat(80));
        
        SystemLogger.success('Система полностью запущена и готова к работе');
        
    } catch (error) {
        SystemLogger.error('КРИТИЧЕСКАЯ ОШИБКА ЗАПУСКА', error);
        console.error('\n❌ СИСТЕМА НЕ МОЖЕТ БЫТЬ ЗАПУЩЕНА');
        console.error('🔧 Причина:', error.message);
        console.error('📞 Обратитесь в техподдержку:', CONFIG.TECH_SUPPORT);
        process.exit(1);
    }
}

// Запускаем систему
if (require.main === module) {
    main();
}

module.exports = { BakeliteDefenceBot, DataManager, SystemLogger };
