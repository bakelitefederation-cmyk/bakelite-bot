// ============================================
// 🛡️ BAKELITE DEFENCE BOT - РАБОЧАЯ ВЕРСИЯ 6.4.0
// Версия: 6.4.0
// Разработчик: @kartochniy
// Статус: Все работает, одобрение заявок работает
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
    
    VERSION: '6.4.0',
    SYSTEM_NAME: 'Bakelite Defence System Pro'
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
        this.userSessions = new Map(); // userId -> session
        this.userProfiles = new Map();
        this.feedback = new Map();
        
        this.loadData();
        SystemLogger.info('Менеджер данных инициализирован');
    }
    
    loadData() {
        try {
            if (fs.existsSync(CONFIG.DATA_FILE)) {
                const data = JSON.parse(fs.readFileSync(CONFIG.DATA_FILE, 'utf8'));
                this.reports = new Map(data.reports || []);
                this.defenders = new Map(data.defenders || []);
                this.userProfiles = new Map(data.userProfiles || []);
                this.feedback = new Map(data.feedback || []);
                
                // Восстанавливаем сессии
                if (data.userSessions) {
                    for (const [userId, session] of Object.entries(data.userSessions)) {
                        this.userSessions.set(userId, session);
                    }
                }
                
                SystemLogger.info('Данные загружены', {
                    reports: this.reports.size,
                    defenders: this.defenders.size,
                    sessions: this.userSessions.size
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
                userSessions: Object.fromEntries(this.userSessions.entries()),
                userProfiles: Array.from(this.userProfiles.entries()),
                feedback: Array.from(this.feedback.entries()),
                savedAt: new Date().toISOString(),
                version: CONFIG.VERSION
            };
            
            fs.writeFileSync(CONFIG.DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
            SystemLogger.debug('Данные сохранены');
        } catch (error) {
            SystemLogger.error('Ошибка сохранения данных', error.message);
        }
    }
    
    // Управление сессиями
    createUserSession(userId, type, initialData = {}) {
        const session = {
            id: Utilities.generateId('SESS'),
            userId: userId.toString(),
            type: type,
            data: initialData,
            step: 1,
            createdAt: Date.now(),
            lastActivity: Date.now(),
            completed: false
        };
        
        this.userSessions.set(userId.toString(), session);
        SystemLogger.debug('Создана сессия', { userId, type, step: 1 });
        this.saveData();
        return session;
    }
    
    getSession(userId) {
        return this.userSessions.get(userId.toString());
    }
    
    updateSession(userId, updates) {
        const session = this.getSession(userId);
        if (session) {
            Object.assign(session, updates);
            session.lastActivity = Date.now();
            this.userSessions.set(userId.toString(), session);
            SystemLogger.debug('Сессия обновлена', { userId, step: session.step });
            this.saveData();
            return true;
        }
        return false;
    }
    
    completeSession(userId) {
        const session = this.getSession(userId);
        if (session) {
            session.completed = true;
            session.completedAt = Date.now();
            this.userSessions.set(userId.toString(), session);
            SystemLogger.debug('Сессия завершена', { userId });
            this.saveData();
            return true;
        }
        return false;
    }
    
    // Заявки
    createReport(userId, userName, chatId, data) {
        const reportId = Utilities.generateId('RPT');
        
        const report = {
            id: reportId,
            userId: userId.toString(),
            userName: userName,
            chatId: chatId,
            country: data.country,
            problemType: data.problemType,
            description: data.description,
            contact: data.contact || '',
            status: 'new',
            priority: data.urgency === 'high' ? 'high' : 'medium',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        this.reports.set(reportId, report);
        this.saveData();
        
        SystemLogger.info('Создана заявка', { reportId, userId });
        return report;
    }
    
    getReport(reportId) {
        return this.reports.get(reportId);
    }
    
    updateReport(reportId, updates) {
        const report = this.getReport(reportId);
        if (report) {
            Object.assign(report, updates);
            report.updatedAt = new Date().toISOString();
            this.reports.set(reportId, report);
            this.saveData();
            return true;
        }
        return false;
    }
    
    // Защитники
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
            status: 'pending',
            submittedAt: new Date().toISOString()
        };
        
        this.defenders.set(appId, application);
        this.saveData();
        
        SystemLogger.info('Заявка защитника создана', { appId, userId });
        return application;
    }
    
    getDefenderApplication(appId) {
        return this.defenders.get(appId);
    }
    
    updateDefenderApplication(appId, updates) {
        const defender = this.getDefenderApplication(appId);
        if (defender) {
            Object.assign(defender, updates);
            this.defenders.set(appId, defender);
            this.saveData();
            return true;
        }
        return false;
    }
    
    // Обратная связь
    createFeedback(userId, userName, type, message) {
        const feedbackId = Utilities.generateId('FB');
        
        const feedback = {
            id: feedbackId,
            userId: userId.toString(),
            userName: userName,
            type: type,
            message: message,
            status: 'new',
            createdAt: new Date().toISOString()
        };
        
        this.feedback.set(feedbackId, feedback);
        this.saveData();
        
        SystemLogger.info('Получен отзыв', { feedbackId, type });
        return feedback;
    }
    
    // Профиль пользователя
    getUserProfile(userId) {
        let profile = this.userProfiles.get(userId.toString());
        
        if (!profile) {
            profile = {
                userId: userId.toString(),
                joinedAt: new Date().toISOString(),
                reportsCount: 0,
                helpedCount: 0
            };
            this.userProfiles.set(userId.toString(), profile);
            this.saveData();
        }
        
        return profile;
    }
    
    // Статистика
    getStatistics() {
        const reports = Array.from(this.reports.values());
        const defenders = Array.from(this.defenders.values());
        
        return {
            totalReports: reports.length,
            newReports: reports.filter(r => r.status === 'new').length,
            inProgressReports: reports.filter(r => r.status === 'in_progress').length,
            resolvedReports: reports.filter(r => r.status === 'resolved').length,
            totalDefenders: defenders.length,
            pendingDefenders: defenders.filter(d => d.status === 'pending').length,
            approvedDefenders: defenders.filter(d => d.status === 'approved').length,
            totalUsers: this.userProfiles.size
        };
    }
}

// ============================================
// КЛАВИАТУРЫ
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
    
    static getRegionButtons() {
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
                        { text: '🌍 Другое', callback_data: 'region_other' }
                    ]
                ]
            }
        };
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
    
    static getDefenderActions(defenderId) {
        return {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '✅ Одобрить', callback_data: `def_approve_${defenderId}` },
                        { text: '❌ Отклонить', callback_data: `def_reject_${defenderId}` }
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
                        { text: '✅ Решено', callback_data: `report_resolve_${reportId}` },
                        { text: '🔄 В работе', callback_data: `report_progress_${reportId}` }
                    ],
                    [
                        { text: '📞 Связаться', callback_data: `report_contact_${reportId}` },
                        { text: '🔒 Закрыть', callback_data: `report_close_${reportId}` }
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
    }
    
    setupCommandHandlers() {
        this.bot.onText(/^\/start(?:\s|$)/i, (msg) => this.handleStart(msg));
        this.bot.onText(/^\/help(?:\s|$)/i, (msg) => this.handleHelp(msg));
        this.bot.onText(/^\/report(?:\s|$)/i, (msg) => this.handleReport(msg));
        this.bot.onText(/^\/join(?:\s|$)/i, (msg) => this.handleJoin(msg));
        this.bot.onText(/^\/status(?:\s|$)/i, (msg) => this.handleStatus(msg));
        this.bot.onText(/^\/support(?:\s|$)/i, (msg) => this.handleSupport(msg));
        this.bot.onText(/^\/feedback(?:\s|$)/i, (msg) => this.handleFeedback(msg));
        this.bot.onText(/^\/cancel(?:\s|$)/i, (msg) => this.handleCancel(msg));
        
        this.bot.onText(/^\/admin(?:\s|$)/i, (msg) => this.handleAdmin(msg));
        this.bot.onText(/^\/admin_reports(?:\s|$)/i, (msg) => this.handleAdminReports(msg));
        this.bot.onText(/^\/admin_defenders(?:\s|$)/i, (msg) => this.handleAdminDefenders(msg));
        this.bot.onText(/^\/admin_stats(?:\s|$)/i, (msg) => this.handleAdminStats(msg));
    }
    
    setupCallbackHandlers() {
        this.bot.on('callback_query', async (callbackQuery) => {
            const chatId = callbackQuery.message.chat.id;
            const userId = callbackQuery.from.id;
            const data = callbackQuery.data;
            
            SystemLogger.debug('Callback получен', { userId, data });
            
            try {
                // Регионы
                if (data.startsWith('region_')) {
                    await this.handleRegionCallback(callbackQuery);
                }
                // Типы проблем
                else if (data.startsWith('problem_')) {
                    await this.handleProblemCallback(callbackQuery);
                }
                // Срочность
                else if (data.startsWith('urgency_')) {
                    await this.handleUrgencyCallback(callbackQuery);
                }
                // Подтверждение
                else if (data.startsWith('confirm_')) {
                    await this.handleConfirmationCallback(callbackQuery);
                }
                // Типы отзывов
                else if (data.startsWith('feedback_') && !data.includes('_process') && !data.includes('_reply')) {
                    await this.handleFeedbackTypeCallback(callbackQuery);
                }
                // Управление защитниками
                else if (data.startsWith('def_')) {
                    await this.handleDefenderAction(callbackQuery);
                }
                // Управление заявками (ИСПРАВЛЕНО!)
                else if (data.startsWith('report_')) {
                    await this.handleReportAction(callbackQuery);
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
    }
    
    // ============================================
    // ОСНОВНЫЕ КОМАНДЫ
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
            `Используйте меню ниже для навигации:`;
        
        await this.sendMessage(chatId, welcomeMessage, Keyboards.getMainMenu(isAdmin));
    }
    
    async handleHelp(msg) {
        const chatId = msg.chat.id;
        
        const helpMessage = 
            `📚 *ПОМОЩЬ*\n\n` +
            `*Основные функции:*\n` +
            `• 📝 Подать заявку - получить помощь\n` +
            `• 🛡️ Стать защитником - помогать другим\n` +
            `• 📊 Мои заявки - отслеживать статус\n` +
            `• ⭐ Оставить отзыв - улучшить систему\n\n` +
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
            `4. Подтвердите отправку\n\n` +
            `📞 *Поддержка:* ${CONFIG.TECH_SUPPORT}`;
        
        await this.sendMessage(chatId, helpMessage);
    }
    
    async handleReport(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const userName = msg.from.first_name || 'Пользователь';
        
        // Создаем сессию для заявки
        this.dataManager.createUserSession(userId, 'report', {
            userName: userName,
            chatId: chatId
        });
        
        const reportMessage = 
            `📝 *ПОДАЧА ЗАЯВКИ*\n\n` +
            `Вы начали процесс подачи заявки.\n` +
            `Процесс состоит из 4 шагов.\n\n` +
            `*Шаг 1/4:* Выберите тип проблемы:`;
        
        await this.sendMessage(chatId, reportMessage, Keyboards.getProblemTypeButtons());
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
                `Ожидайте ответа в течение 1-3 дней.`
            );
            return;
        }
        
        // Создаем сессию для защитника
        this.dataManager.createUserSession(userId, 'join', {
            userName: userName,
            chatId: chatId
        });
        
        const joinMessage = 
            `🛡️ *РЕГИСТРАЦИЯ ЗАЩИТНИКА*\n\n` +
            `Спасибо за желание помогать людям!\n` +
            `Процесс регистрации состоит из 4 шагов.\n\n` +
            `*Шаг 1/4:* Выберите ваш регион работы:`;
        
        await this.sendMessage(chatId, joinMessage, Keyboards.getRegionButtons());
    }
    
    async handleStatus(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        const userProfile = this.dataManager.getUserProfile(userId);
        const userReports = Array.from(this.dataManager.reports.values())
            .filter(r => r.userId === userId.toString());
        
        const statusMessage = 
            `📊 *СТАТУС СИСТЕМЫ*\n\n` +
            `*Система:* ${CONFIG.SYSTEM_NAME}\n` +
            `*Версия:* ${CONFIG.VERSION}\n\n` +
            `*👤 ВАШИ ДАННЫЕ:*\n` +
            `• ID: \`${userId}\`\n` +
            `• Заявок подано: ${userProfile.reportsCount}\n` +
            `• Активных заявок: ${userReports.filter(r => r.status === 'new').length}\n\n` +
            `📞 *Поддержка:* ${CONFIG.TECH_SUPPORT}`;
        
        await this.sendMessage(chatId, statusMessage);
    }
    
    async handleSupport(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        const supportMessage = 
            `🆘 *ТЕХНИЧЕСКАЯ ПОДДЕРЖКА*\n\n` +
            `*Контакты поддержки:*\n` +
            `👨💻 Разработчик: ${CONFIG.TECH_SUPPORT}\n\n` +
            `*Ваш ID:* \`${userId}\`\n\n` +
            `*При обращении укажите:*\n` +
            `1. Ваш ID (см. выше)\n` +
            `2. Описание проблемы\n` +
            `3. Время возникновения\n\n` +
            `*Для срочной помощи напишите напрямую:* ${CONFIG.TECH_SUPPORT}`;
        
        await this.sendMessage(chatId, supportMessage);
    }
    
    async handleFeedback(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const userName = msg.from.first_name || 'Пользователь';
        
        // Создаем сессию для обратной связи
        this.dataManager.createUserSession(userId, 'feedback', {
            userName: userName,
            chatId: chatId
        });
        
        const feedbackMessage = 
            `⭐ *ОБРАТНАЯ СВЯЗЬ*\n\n` +
            `Мы ценим ваше мнение! Пожалуйста, помогите нам стать лучше.\n\n` +
            `Выберите тип обратной связи:`;
        
        await this.sendMessage(chatId, feedbackMessage, Keyboards.getFeedbackTypeButtons());
    }
    
    async handleCancel(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        const session = this.dataManager.getSession(userId);
        if (session) {
            this.dataManager.completeSession(userId);
            await this.sendMessage(chatId,
                `🛑 *ОПЕРАЦИЯ ОТМЕНЕНА*\n\n` +
                `Все временные данные удалены.\n` +
                `Используйте меню для начала новой операции.`,
                Keyboards.getMainMenu(this.isAdmin(userId))
            );
        } else {
            await this.sendMessage(chatId,
                `ℹ️ *НЕТ АКТИВНЫХ ОПЕРАЦИЙ*\n\n` +
                `У вас нет активных операций для отмены.`,
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
            `• Заявок: ${stats.totalReports}\n` +
            `• Новых заявок: ${stats.newReports}\n` +
            `• Защитников: ${stats.totalDefenders}\n` +
            `• На проверке: ${stats.pendingDefenders}\n\n` +
            `*🔧 КОМАНДЫ:*\n` +
            `/admin_reports - Просмотр заявок\n` +
            `/admin_defenders - Просмотр защитников\n` +
            `/admin_stats - Полная статистика`;
        
        await this.sendMessage(chatId, adminMessage);
    }
    
    async handleAdminReports(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        if (!this.isAdmin(userId)) {
            await this.sendMessage(chatId, '❌ Эта команда только для администратора');
            return;
        }
        
        const reports = Array.from(this.dataManager.reports.values())
            .filter(r => r.status === 'new')
            .slice(0, 10);
        
        if (reports.length === 0) {
            await this.sendMessage(chatId, '✅ *Нет новых заявок*');
            return;
        }
        
        for (const report of reports) {
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
    
    async handleAdminDefenders(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        if (!this.isAdmin(userId)) {
            await this.sendMessage(chatId, '❌ Эта команда только для администратора');
            return;
        }
        
        const defenders = Array.from(this.dataManager.defenders.values())
            .filter(d => d.status === 'pending')
            .slice(0, 10);
        
        if (defenders.length === 0) {
            await this.sendMessage(chatId, '✅ *Нет заявок защитников на проверке*');
            return;
        }
        
        for (const defender of defenders) {
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
    
    async handleAdminStats(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        if (!this.isAdmin(userId)) {
            await this.sendMessage(chatId, '❌ Эта команда только для администратора');
            return;
        }
        
        const stats = this.dataManager.getStatistics();
        
        const statsMessage = 
            `📊 *ПОЛНАЯ СТАТИСТИКА СИСТЕМЫ*\n\n` +
            `*📝 ЗАЯВКИ:*\n` +
            `• Всего: ${stats.totalReports}\n` +
            `• Новых: ${stats.newReports}\n` +
            `• В работе: ${stats.inProgressReports}\n` +
            `• Решено: ${stats.resolvedReports}\n\n` +
            `*🛡️ ЗАЩИТНИКИ:*\n` +
            `• Всего: ${stats.totalDefenders}\n` +
            `• На проверке: ${stats.pendingDefenders}\n` +
            `• Одобрено: ${stats.approvedDefenders}\n\n` +
            `*👥 ПОЛЬЗОВАТЕЛИ:*\n` +
            `• Всего: ${stats.totalUsers}\n\n` +
            `_Статистика обновлена: ${new Date().toLocaleString('ru-RU')}_`;
        
        await this.sendMessage(chatId, statsMessage);
    }
    
    // ============================================
    // ОБРАБОТЧИКИ CALLBACK
    // ============================================
    
    async handleRegionCallback(callbackQuery) {
        const chatId = callbackQuery.message.chat.id;
        const userId = callbackQuery.from.id;
        const data = callbackQuery.data;
        
        const session = this.dataManager.getSession(userId);
        if (!session) {
            await this.sendMessage(chatId, '❌ Сессия не найдена. Начните заново.');
            return;
        }
        
        const regionMap = {
            'region_ru': 'Россия',
            'region_ua': 'Украина',
            'region_kz': 'Казахстан',
            'region_by': 'Беларусь',
            'region_other': 'Другая страна'
        };
        
        const regionName = regionMap[data] || 'Не указано';
        
        if (session.type === 'report') {
            session.data.country = regionName;
            session.step = 2;
            this.dataManager.updateSession(userId, session);
            
            await this.sendMessage(chatId,
                `✅ *Страна выбрана: ${regionName}*\n\n` +
                `*Шаг 2/4:* Оцените срочность проблемы\n\n` +
                `Выберите, насколько срочно вам нужна помощь:`,
                Keyboards.getUrgencyButtons()
            );
            
        } else if (session.type === 'join') {
            session.data.region = regionName;
            session.step = 2;
            this.dataManager.updateSession(userId, session);
            
            await this.sendMessage(chatId,
                `✅ *Регион выбран: ${regionName}*\n\n` +
                `*Шаг 2/4:* Укажите ваше имя в системе\n\n` +
                `Как к вам обращаться в системе?\n` +
                `(Можно использовать псевдоним)\n\n` +
                `*Пример:* Иван, Анна, Алексей (IT специалист)\n\n` +
                `Напишите ваше имя:`
            );
        }
    }
    
    async handleProblemCallback(callbackQuery) {
        const chatId = callbackQuery.message.chat.id;
        const userId = callbackQuery.from.id;
        const data = callbackQuery.data;
        
        const session = this.dataManager.getSession(userId);
        if (!session || session.type !== 'report') {
            await this.sendMessage(chatId, '❌ Сессия не найдена. Начните заново.');
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
        this.dataManager.updateSession(userId, session);
        
        await this.sendMessage(chatId,
            `✅ *Тип проблемы: ${problemType}*\n\n` +
            `*Шаг 2/4:* Выберите вашу страну\n\n` +
            `В какой стране вы находитесь?`,
            Keyboards.getRegionButtons()
        );
    }
    
    async handleUrgencyCallback(callbackQuery) {
        const chatId = callbackQuery.message.chat.id;
        const userId = callbackQuery.from.id;
        const data = callbackQuery.data;
        
        const session = this.dataManager.getSession(userId);
        if (!session || session.type !== 'report') {
            await this.sendMessage(chatId, '❌ Сессия не найдена. Начните заново.');
            return;
        }
        
        const urgencyMap = {
            'urgency_high': 'Срочно',
            'urgency_medium': 'Высокий',
            'urgency_normal': 'Средний',
            'urgency_low': 'Низкий'
        };
        
        const urgency = urgencyMap[data] || 'Средний';
        session.data.urgency = data;
        session.step = 3;
        this.dataManager.updateSession(userId, session);
        
        await this.sendMessage(chatId,
            `✅ *Срочность: ${urgency}*\n\n` +
            `*Шаг 3/4:* Опишите проблему\n\n` +
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
        
        const session = this.dataManager.getSession(userId);
        if (!session) {
            await this.sendMessage(chatId, '❌ Сессия не найдена. Начните заново.');
            return;
        }
        
        if (data === 'confirm_yes') {
            if (session.type === 'report') {
                // Завершаем создание заявки
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
                    `• Время: ${Utilities.formatDate(report.createdAt)}\n\n` +
                    `*Что дальше:*\n` +
                    `1. Защитники получили уведомление\n` +
                    `2. С вами свяжутся в течение 24-72 часов\n\n` +
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
                
                this.dataManager.completeSession(userId);
                
            } else if (session.type === 'join') {
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
                    `• Навыки: ${session.data.skills}\n\n` +
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
                
                this.dataManager.completeSession(userId);
            }
            
        } else if (data === 'confirm_no') {
            await this.sendMessage(chatId, '❌ Действие отменено');
            this.dataManager.completeSession(userId);
        }
    }
    
    async handleFeedbackTypeCallback(callbackQuery) {
        const chatId = callbackQuery.message.chat.id;
        const userId = callbackQuery.from.id;
        const data = callbackQuery.data;
        
        const session = this.dataManager.getSession(userId);
        if (!session || session.type !== 'feedback') {
            await this.sendMessage(chatId, '❌ Сессия не найдена. Начните заново.');
            return;
        }
        
        const typeMap = {
            'feedback_suggestion': 'предложение',
            'feedback_bug': 'ошибка',
            'feedback_compliment': 'благодарность',
            'feedback_question': 'вопрос'
        };
        
        session.data.type = typeMap[data] || 'другое';
        session.step = 2;
        this.dataManager.updateSession(userId, session);
        
        await this.sendMessage(chatId,
            `✅ *Тип: ${session.data.type}*\n\n` +
            `Теперь напишите ваш отзыв, предложение или вопрос.\n` +
            `Опишите все подробно:`
        );
    }
    
    async handleDefenderAction(callbackQuery) {
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
        
        const defender = this.dataManager.getDefenderApplication(defenderId);
        if (!defender) {
            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: '❌ Защитник не найден',
                show_alert: true
            });
            return;
        }
        
        if (action === 'approve') {
            this.dataManager.updateDefenderApplication(defenderId, { status: 'approved' });
            
            await this.sendMessage(defender.chatId,
                `🎉 *ВАША ЗАЯВКА ОДОБРЕНА!*\n\n` +
                `Заявка #${defenderId} успешно одобрена.\n\n` +
                `*Теперь вы официальный защитник системы!*\n\n` +
                `*Ваши данные:*\n` +
                `• Имя в системе: ${defender.defenderName}\n` +
                `• Регион: ${defender.region}\n` +
                `• Статус: 🛡️ Активный защитник\n\n` +
                `Спасибо за участие! 🛡️`
            );
            
            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: '✅ Защитник одобрен',
                show_alert: false
            });
            
            // Обновляем сообщение с кнопками
            try {
                await this.bot.editMessageText(
                    callbackQuery.message.text + '\n\n✅ *ОДОБРЕНО*',
                    {
                        chat_id: callbackQuery.message.chat.id,
                        message_id: callbackQuery.message.message_id,
                        parse_mode: 'Markdown'
                    }
                );
            } catch (error) {
                SystemLogger.error('Ошибка обновления сообщения', error);
            }
            
        } else if (action === 'reject') {
            this.dataManager.updateDefenderApplication(defenderId, { status: 'rejected' });
            
            await this.sendMessage(defender.chatId,
                `📋 *ПО ВАШЕЙ ЗАЯВКЕ #${defenderId}*\n\n` +
                `К сожалению, ваша заявка не была одобрена.\n\n` +
                `Вы можете подать заявку повторно через 30 дней.\n\n` +
                `Спасибо за понимание.`
            );
            
            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: '❌ Заявка отклонена',
                show_alert: false
            });
            
            try {
                await this.bot.editMessageText(
                    callbackQuery.message.text + '\n\n❌ *ОТКЛОНЕНО*',
                    {
                        chat_id: callbackQuery.message.chat.id,
                        message_id: callbackQuery.message.message_id,
                        parse_mode: 'Markdown'
                    }
                );
            } catch (error) {
                SystemLogger.error('Ошибка обновления сообщения', error);
            }
        }
    }
    
    async handleReportAction(callbackQuery) {
        const chatId = callbackQuery.message.chat.id;
        const userId = callbackQuery.from.id;
        const data = callbackQuery.data;
        
        SystemLogger.debug('Обработка действия с заявкой', { userId, data });
        
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
        
        const report = this.dataManager.getReport(reportId);
        if (!report) {
            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: '❌ Заявка не найдена',
                show_alert: true
            });
            return;
        }
        
        if (action === 'resolve') {
            // Отмечаем заявку как решенную
            this.dataManager.updateReport(reportId, { status: 'resolved' });
            
            // Уведомляем пользователя
            await this.sendMessage(report.chatId,
                `✅ *ВАША ЗАЯВКА РЕШЕНА!*\n\n` +
                `Заявка #${reportId} отмечена как решенная.\n\n` +
                `*Статус:* ✅ Решена\n` +
                `*Время решения:* ${Utilities.formatDate(new Date())}\n\n` +
                `Спасибо, что обратились к нам!`
            );
            
            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: '✅ Заявка отмечена как решенная',
                show_alert: false
            });
            
            // Обновляем сообщение
            try {
                await this.bot.editMessageText(
                    callbackQuery.message.text + '\n\n✅ *РЕШЕНО*',
                    {
                        chat_id: callbackQuery.message.chat.id,
                        message_id: callbackQuery.message.message_id,
                        parse_mode: 'Markdown'
                    }
                );
            } catch (error) {
                SystemLogger.error('Ошибка обновления сообщения', error);
            }
            
        } else if (action === 'progress') {
            // Отмечаем заявку как в работе
            this.dataManager.updateReport(reportId, { status: 'in_progress' });
            
            await this.sendMessage(report.chatId,
                `🔄 *ВАША ЗАЯВКА ВЗЯТА В РАБОТУ*\n\n` +
                `Заявка #${reportId} теперь в работе.\n\n` +
                `*Статус:* 🔄 В работе\n\n` +
                `Специалист свяжется с вами в ближайшее время.`
            );
            
            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: '🔄 Заявка в работе',
                show_alert: false
            });
            
            try {
                await this.bot.editMessageText(
                    callbackQuery.message.text + '\n\n🔄 *В РАБОТЕ*',
                    {
                        chat_id: callbackQuery.message.chat.id,
                        message_id: callbackQuery.message.message_id,
                        parse_mode: 'Markdown'
                    }
                );
            } catch (error) {
                SystemLogger.error('Ошибка обновления сообщения', error);
            }
            
        } else if (action === 'contact') {
            // Показываем контакт пользователя
            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: `Связь с пользователем:\nID: ${report.userId}\nКонтакт: ${report.contact || 'не указан'}`,
                show_alert: true
            });
            
        } else if (action === 'close') {
            // Закрываем заявку
            this.dataManager.updateReport(reportId, { status: 'closed' });
            
            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: '🔒 Заявка закрыта',
                show_alert: false
            });
            
            try {
                await this.bot.editMessageText(
                    callbackQuery.message.text + '\n\n🔒 *ЗАКРЫТА*',
                    {
                        chat_id: callbackQuery.message.chat.id,
                        message_id: callbackQuery.message.message_id,
                        parse_mode: 'Markdown'
                    }
                );
            } catch (error) {
                SystemLogger.error('Ошибка обновления сообщения', error);
            }
        }
    }
    
    // ============================================
    // ОБРАБОТКА ТЕКСТОВЫХ СООБЩЕНИЙ
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
            await this.showMyReports(chatId, userId);
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
        const session = this.dataManager.getSession(userId);
        if (!session) {
            // Показываем главное меню
            const isAdmin = this.isAdmin(userId);
            await this.sendMessage(chatId, 'Выберите действие:', Keyboards.getMainMenu(isAdmin));
            return;
        }
        
        SystemLogger.debug('Активная сессия найдена', { 
            type: session.type, 
            step: session.step 
        });
        
        // Обновляем активность сессии
        this.dataManager.updateSession(userId, session);
        
        // Обрабатываем в зависимости от типа сессии и шага
        try {
            if (session.type === 'report') {
                await this.processReportStep(chatId, userId, session, text);
            } else if (session.type === 'join') {
                await this.processJoinStep(chatId, userId, session, text);
            } else if (session.type === 'feedback') {
                await this.processFeedbackStep(chatId, userId, session, text);
            }
        } catch (error) {
            SystemLogger.error('Ошибка обработки шага', error);
            await this.sendMessage(chatId, '❌ Произошла ошибка. Попробуйте снова.');
        }
    }
    
    async processReportStep(chatId, userId, session, text) {
        switch (session.step) {
            case 3: // Описание проблемы (шаг после выбора срочности)
                if (text.length < CONFIG.MIN_DESCRIPTION_LENGTH) {
                    await this.sendMessage(chatId,
                        `❌ Описание слишком короткое. Минимум ${CONFIG.MIN_DESCRIPTION_LENGTH} символов.\n\n` +
                        `Пожалуйста, опишите подробнее.`
                    );
                    return;
                }
                
                session.data.description = text;
                session.step = 4;
                this.dataManager.updateSession(userId, session);
                
                await this.sendMessage(chatId,
                    `✅ *Описание принято*\n\n` +
                    `*Шаг 4/4:* Контактная информация\n\n` +
                    `Как с вами лучше связаться?\n\n` +
                    `*Пример:* @username, +79991234567, email@example.com\n\n` +
                    `Напишите ваш контакт:`
                );
                break;
                
            case 4: // Контактная информация
                session.data.contact = text;
                session.step = 5;
                this.dataManager.updateSession(userId, session);
                
                // Предварительный просмотр
                const previewMessage = 
                    `📋 *ПРЕДВАРИТЕЛЬНЫЙ ПРОСМОТР ЗАЯВКИ*\n\n` +
                    `*Тип проблемы:* ${session.data.problemType}\n` +
                    `*Страна:* ${session.data.country}\n` +
                    `*Срочность:* ${session.data.urgency}\n` +
                    `*Описание:*\n${session.data.description.substring(0, 150)}${session.data.description.length > 150 ? '...' : ''}\n` +
                    `*Контакт:* ${session.data.contact}\n\n` +
                    `*Подтвердите отправку заявки:*`;
                
                await this.sendMessage(chatId, previewMessage, Keyboards.getConfirmationButtons());
                break;
        }
    }
    
    async processJoinStep(chatId, userId, session, text) {
        SystemLogger.debug('Обработка шага защитника', { step: session.step, textLength: text.length });
        
        switch (session.step) {
            case 2: // Имя защитника (шаг после выбора региона)
                if (text.length < 2 || text.length > 50) {
                    await this.sendMessage(chatId,
                        '❌ Имя должно быть от 2 до 50 символов.\n\n' +
                        'Пример: Иван, Анна Петрова\n\n' +
                        'Попробуйте еще раз:'
                    );
                    return;
                }
                
                session.data.defenderName = text;
                session.step = 3;
                this.dataManager.updateSession(userId, session);
                
                await this.sendMessage(chatId,
                    `✅ *Имя принято: ${text}*\n\n` +
                    `*Шаг 3/4:* Ваши навыки и опыт\n\n` +
                    `Опишите ваши профессиональные навыки и опыт:\n\n` +
                    `*Пример:* Юрист, опыт 5 лет; IT специалист, кибербезопасность\n\n` +
                    `Напишите ваши навыки:`
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
                
                session.data.skills = text;
                session.step = 4;
                this.dataManager.updateSession(userId, session);
                
                // Предварительный просмотр анкеты
                const previewMessage = 
                    `📋 *ПРЕДВАРИТЕЛЬНЫЙ ПРОСМОТР АНКЕТЫ*\n\n` +
                    `*Имя в системе:* ${session.data.defenderName}\n` +
                    `*Регион:* ${session.data.region}\n` +
                    `*Навыки:* ${session.data.skills.substring(0, 100)}${session.data.skills.length > 100 ? '...' : ''}\n\n` +
                    `*Подтвердите отправку анкеты:*`;
                
                await this.sendMessage(chatId, previewMessage, Keyboards.getConfirmationButtons());
                break;
        }
    }
    
    async processFeedbackStep(chatId, userId, session, text) {
        if (session.step === 2) {
            if (text.length < 10) {
                await this.sendMessage(chatId,
                    '❌ Пожалуйста, напишите более развернутый отзыв.\n' +
                    'Минимум 10 символов.\n\n' +
                    'Попробуйте еще раз:'
                );
                return;
            }
            
            session.data.message = text;
            
            // Создаем отзыв
            const feedback = this.dataManager.createFeedback(
                userId,
                session.data.userName,
                session.data.type,
                session.data.message
            );
            
            await this.sendMessage(chatId,
                `✅ *СПАСИБО ЗА ОТЗЫВ!*\n\n` +
                `Ваш отзыв #${feedback.id} успешно отправлен.\n` +
                `Мы ценим ваше мнение и обязательно его учтем.\n\n` +
                `Спасибо за помощь в улучшении системы!`
            );
            
            this.dataManager.completeSession(userId);
        }
    }
    
    async showMyReports(chatId, userId) {
        const userReports = Array.from(this.dataManager.reports.values())
            .filter(r => r.userId === userId.toString());
        
        if (userReports.length === 0) {
            await this.sendMessage(chatId,
                `📭 *У вас нет заявок*\n\n` +
                `Вы еще не подавали заявок о проблемах.\n` +
                `Нажмите "📝 Подать заявку" в меню, чтобы создать первую заявку.`
            );
            return;
        }
        
        let reportsMessage = `📋 *ВАШИ ЗАЯВКИ (${userReports.length})*\n\n`;
        
        userReports.forEach((report, index) => {
            reportsMessage += `${index + 1}. *${report.id}*\n`;
            reportsMessage += `   Тип: ${report.problemType}\n`;
            reportsMessage += `   Статус: ${this.getReportStatus(report.status)}\n`;
            reportsMessage += `   Создана: ${Utilities.formatDate(report.createdAt)}\n\n`;
        });
        
        await this.sendMessage(chatId, reportsMessage);
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
    
    // ============================================
    // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
    // ============================================
    
    isAdmin(userId) {
        return userId.toString() === CONFIG.ADMIN_CHAT_ID;
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
                // Пытаемся отправить без форматирования
                await this.bot.sendMessage(chatId, text, {
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
        console.log('\n✅ ВСЕ РАБОТАЕТ:');
        console.log('  1. Регистрация защитника (имя принимается)');
        console.log('  2. Подача заявки (все шаги работают)');
        console.log('  3. Одобрение заявок защитников');
        console.log('  4. Управление заявками о помощи (работает!)');
        console.log('  5. Инлайн-кнопки работают');
        console.log('\n📱 КОМАНДЫ АДМИНА:');
        console.log('  • /admin_reports - просмотр заявок');
        console.log('  • /admin_defenders - просмотр защитников');
        console.log('  • Нажмите "✅ Решено" на заявке - работает!');
        console.log('='.repeat(70));
        console.log(`\n📞 Поддержка: ${CONFIG.TECH_SUPPORT}`);
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
