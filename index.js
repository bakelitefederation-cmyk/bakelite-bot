const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const fs = require('fs');

const CONFIG = {
    BOT_TOKEN: process.env.BOT_TOKEN || '',
    ADMIN_CHAT_ID: process.env.ADMIN_CHAT_ID || '',
    PORT: process.env.PORT || 3000,
    MAX_REQUESTS_PER_USER: 5,
    REQUEST_TIMEOUT_MINUTES: 10,
    LOG_FILE: 'bot_activity.log'
};

console.log('='.repeat(60));
console.log('ЗАПУСК СИСТЕМЫ BAKELITE DEFENCE');
console.log('='.repeat(60));

const REQUIRED_ENV = ['BOT_TOKEN', 'ADMIN_CHAT_ID'];
let configValid = true;

REQUIRED_ENV.forEach(env => {
    if (!process.env[env] || process.env[env].trim() === '') {
        console.error(`ОШИБКА: Переменная ${env} не установлена`);
        console.error(`Railway -> Variables -> Добавить ${env}`);
        configValid = false;
    }
});

if (!configValid) {
    console.error('КРИТИЧЕСКАЯ ОШИБКА: Не все переменные установлены');
    process.exit(1);
}

console.log('ПРОВЕРКА КОНФИГУРАЦИИ:');
console.log(`- BOT_TOKEN: ${CONFIG.BOT_TOKEN.substring(0, 10)}...`);
console.log(`- ADMIN_CHAT_ID: ${CONFIG.ADMIN_CHAT_ID}`);
console.log(`- PORT: ${CONFIG.PORT}`);
console.log('КОНФИГУРАЦИЯ ПРОЙДЕНА');

class Logger {
    static log(level, message, data = null) {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] [${level}] ${message}`;
        
        console.log(logEntry);
        
        if (data) {
            console.log('Данные:', JSON.stringify(data, null, 2));
        }
        
        try {
            fs.appendFileSync(CONFIG.LOG_FILE, logEntry + '\n', 'utf8');
        } catch (error) {
            console.error('Ошибка записи в лог:', error.message);
        }
    }
    
    static info(message, data = null) {
        this.log('INFO', message, data);
    }
    
    static error(message, data = null) {
        this.log('ERROR', message, data);
    }
}

class UserStateManager {
    constructor() {
        this.userStates = new Map();
        this.userRequests = new Map();
    }
    
    setState(userId, state, data = {}) {
        this.userStates.set(userId, {
            state: state,
            data: data,
            timestamp: Date.now()
        });
        Logger.info(`Установлено состояние для ${userId}`, { state });
    }
    
    getState(userId) {
        return this.userStates.get(userId);
    }
    
    clearState(userId) {
        this.userStates.delete(userId);
        Logger.info(`Очищено состояние ${userId}`);
    }
    
    trackRequest(userId) {
        const now = Date.now();
        const userRequests = this.userRequests.get(userId) || [];
        
        const recentRequests = userRequests.filter(time => now - time < 3600000);
        
        if (recentRequests.length >= CONFIG.MAX_REQUESTS_PER_USER) {
            Logger.info(`Лимит запросов для ${userId}`);
            return false;
        }
        
        recentRequests.push(now);
        this.userRequests.set(userId, recentRequests);
        return true;
    }
}

class BakeliteBot {
    constructor() {
        this.stateManager = new UserStateManager();
        this.bot = null;
        this.app = express();
        this.setupBot();
        this.setupWebServer();
    }
    
    setupBot() {
        try {
            Logger.info('Инициализация бота');
            
            this.bot = new TelegramBot(CONFIG.BOT_TOKEN, {
                polling: {
                    interval: 1000,
                    autoStart: true
                }
            });
            
            this.setupErrorHandlers();
            this.setupCommandHandlers();
            
            Logger.info('Бот инициализирован');
        } catch (error) {
            Logger.error('Ошибка инициализации', error);
            throw error;
        }
    }
    
    setupErrorHandlers() {
        this.bot.on('polling_error', (error) => {
            Logger.error('Ошибка polling', {
                code: error.code,
                message: error.message
            });
        });
    }
    
    setupCommandHandlers() {
        // КОМАНДА /start
        this.bot.onText(/^\/start(?:\s|$)/, (msg) => {
            this.handleStartCommand(msg);
        });
        
        // КОМАНДА /help
        this.bot.onText(/^\/help(?:\s|$)/, (msg) => {
            this.handleHelpCommand(msg);
        });
        
        // КОМАНДА /report
        this.bot.onText(/^\/report(?:\s|$)/, (msg) => {
            this.handleReportCommand(msg);
        });
        
        // КОМАНДА /join - ДОБАВЛЕНА
        this.bot.onText(/^\/join(?:\s|$)/, (msg) => {
            this.handleJoinCommand(msg);
        });
        
        // КОМАНДА /status
        this.bot.onText(/^\/status(?:\s|$)/, (msg) => {
            this.handleStatusCommand(msg);
        });
        
        // КОМАНДА /cancel
        this.bot.onText(/^\/cancel(?:\s|$)/, (msg) => {
            this.handleCancelCommand(msg);
        });
        
        // Обработка сообщений
        this.bot.on('message', (msg) => {
            this.handleMessage(msg);
        });
    }
    
    setupWebServer() {
        this.app.use(express.json());
        
        this.app.get('/', (req, res) => {
            res.json({
                service: 'Bakelite Defence Bot',
                status: 'operational',
                timestamp: new Date().toISOString(),
                version: '3.1.0',
                commands: ['/start', '/help', '/report', '/join', '/status', '/cancel']
            });
        });
        
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                bot_online: !!this.bot,
                active_users: this.stateManager.userStates.size
            });
        });
    }
    
    // ====================
    // ОБРАБОТЧИКИ КОМАНД
    // ====================
    
    async handleStartCommand(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const userName = msg.from.first_name || 'Пользователь';
        
        Logger.info(`/start от ${userName} (${userId})`);
        
        if (!this.stateManager.trackRequest(userId)) {
            this.sendMessage(chatId, 
                'Превышен лимит запросов. Подождите 1 час.'
            );
            return;
        }
        
        const welcomeMessage = 
            `Добро пожаловать в Bakelite Defence, ${userName}.\n\n` +
            `Я - система помощи жертвам киберпреступлений.\n\n` +
            `Доступные команды:\n` +
            `/report - Подать заявку о проблеме\n` +
            `/join - Стать защитником\n` +
            `/help - Получить инструкцию\n` +
            `/status - Проверить статус системы\n` +
            `/cancel - Отменить операцию\n\n` +
            `Для жертв: используйте /report\n` +
            `Для волонтёров: используйте /join\n\n` +
            `Внимание: Мы не заменяем официальные правоохранительные органы.`;
        
        await this.sendMessage(chatId, welcomeMessage);
    }
    
    async handleHelpCommand(msg) {
        const chatId = msg.chat.id;
        
        const helpMessage = 
            `РУКОВОДСТВО ПОЛЬЗОВАТЕЛЯ BAKELITE DEFENCE\n\n` +
            `ДЛЯ ЖЕРТВ:\n` +
            `1. Используйте /report\n` +
            `2. Укажите страну, тип проблемы, описание\n` +
            `3. Защитник свяжется с вами в течение 24 часов\n\n` +
            `ДЛЯ ЗАЩИТНИКОВ:\n` +
            `1. Используйте /join для регистрации\n` +
            `2. Заполните анкету\n` +
            `3. После проверки будете получать уведомления\n\n` +
            `ОБЩИЕ ПРАВИЛА:\n` +
            `• Не передавайте пароли и данные карт\n` +
            `• Используйте псевдонимы\n` +
            `• Сохраняйте скриншоты\n` +
            `• Для срочной помощи: @[ваш_никнейм]\n\n` +
            `Время работы: 24/7`;
        
        await this.sendMessage(chatId, helpMessage);
    }
    
    async handleReportCommand(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const userName = msg.from.first_name || 'Пользователь';
        
        Logger.info(`Начало заявки от ${userName} (${userId})`);
        
        if (!this.stateManager.trackRequest(userId)) {
            this.sendMessage(chatId, 'Лимит запросов. Подождите 1 час.');
            return;
        }
        
        this.stateManager.setState(userId, 'AWAITING_COUNTRY', {
            userName: userName,
            chatId: chatId,
            startTime: Date.now(),
            type: 'report'
        });
        
        const countryPrompt = 
            `ШАГ 1 ИЗ 3: УКАЖИТЕ СТРАНУ\n\n` +
            `В какой стране вы находитесь?\n` +
            `Укажите полное название страны.\n\n` +
            `Пример: Россия, Украина, Германия, Казахстан\n\n` +
            `Для отмены: /cancel`;
        
        await this.sendMessage(chatId, countryPrompt);
    }
    
    async handleJoinCommand(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const userName = msg.from.first_name || 'Пользователь';
        
        Logger.info(`Команда /join от ${userName} (${userId})`);
        
        if (!this.stateManager.trackRequest(userId)) {
            this.sendMessage(chatId, 
                'Превышен лимит запросов. Подождите 1 час.'
            );
            return;
        }
        
        this.stateManager.setState(userId, 'AWAITING_JOIN_NAME', {
            userName: userName,
            chatId: chatId,
            startTime: Date.now(),
            type: 'join'
        });
        
        const joinMessage = 
            `РЕГИСТРАЦИЯ ЗАЩИТНИКА\n\n` +
            `ШАГ 1 ИЗ 4: ВАШЕ ИМЯ\n\n` +
            `Как к вам обращаться? (Имя или псевдоним)\n\n` +
            `Пример: Иван, Анна, Алексей\n\n` +
            `Для отмены: /cancel`;
        
        await this.sendMessage(chatId, joinMessage);
    }
    
    async handleStatusCommand(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        const statusMessage = 
            `СТАТУС СИСТЕМЫ\n\n` +
            `Состояние: Активно\n` +
            `Платформа: Railway\n` +
            `Время: ${new Date().toLocaleString('ru-RU')}\n` +
            `Ваш ID: ${userId}\n` +
            `Активных сессий: ${this.stateManager.userStates.size}\n\n` +
            `Версия: 3.1.0\n` +
            `Команды: /start /help /report /join /status /cancel\n\n` +
            `Техподдержка: @[ваш_никнейм]`;
        
        await this.sendMessage(chatId, statusMessage);
    }
    
    async handleCancelCommand(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        const state = this.stateManager.getState(userId);
        if (state) {
            this.stateManager.clearState(userId);
            Logger.info(`Отмена операции пользователем ${userId}`);
            
            await this.sendMessage(chatId, 
                'Операция отменена. Все временные данные удалены.\n\n' +
                'Для начала новой операции используйте /report или /join'
            );
        } else {
            await this.sendMessage(chatId, 
                'Нет активных операций для отмены.\n\n' +
                'Для начала работы используйте /report или /join'
            );
        }
    }
    
    async handleMessage(msg) {
        if (msg.text && msg.text.startsWith('/')) {
            return;
        }
        
        const userId = msg.from.id;
        const chatId = msg.chat.id;
        const userText = msg.text || '';
        const state = this.stateManager.getState(userId);
        
        if (!state) {
            return;
        }
        
        switch (state.state) {
            case 'AWAITING_COUNTRY':
                await this.processCountryStep(userId, chatId, userText, state);
                break;
                
            case 'AWAITING_PROBLEM_TYPE':
                await this.processProblemTypeStep(userId, chatId, userText, state);
                break;
                
            case 'AWAITING_DESCRIPTION':
                await this.processDescriptionStep(userId, chatId, userText, state);
                break;
                
            case 'AWAITING_JOIN_NAME':
                await this.processJoinNameStep(userId, chatId, userText, state);
                break;
                
            case 'AWAITING_JOIN_REGION':
                await this.processJoinRegionStep(userId, chatId, userText, state);
                break;
                
            case 'AWAITING_JOIN_SKILLS':
                await this.processJoinSkillsStep(userId, chatId, userText, state);
                break;
        }
    }
    
    // ====================
    // ОБРАБОТКА ШАГОВ /report
    // ====================
    
    async processCountryStep(userId, chatId, country, stateData) {
        if (country.length < 2 || country.length > 50) {
            await this.sendMessage(chatId,
                'Некорректное название страны. Укажите полное название.\n\n' +
                'Пример: Россия, Украина, Германия\n\n' +
                'Для отмены: /cancel'
            );
            return;
        }
        
        stateData.data.country = country.trim();
        stateData.data.progress = '1/3';
        this.stateManager.setState(userId, 'AWAITING_PROBLEM_TYPE', stateData.data);
        
        const problemTypePrompt = 
            `ШАГ 2 ИЗ 3: ТИП ПРОБЛЕМЫ\n\n` +
            `Выберите тип проблемы:\n\n` +
            `1. Мошенничество\n` +
            `2. Кибербуллинг\n` +
            `3. Взлом аккаунта\n` +
            `4. Вымогательство\n` +
            `5. Другое\n\n` +
            `Ответьте цифрой от 1 до 5\n\n` +
            `Для отмены: /cancel`;
        
        await this.sendMessage(chatId, problemTypePrompt);
        
        Logger.info(`Пользователь ${userId} указал страну: ${country}`);
    }
    
    async processProblemTypeStep(userId, chatId, problemType, stateData) {
        const problemTypeNum = parseInt(problemType);
        
        if (isNaN(problemTypeNum) || problemTypeNum < 1 || problemTypeNum > 5) {
            await this.sendMessage(chatId,
                'Пожалуйста, выберите цифру от 1 до 5.\n\n' +
                '1. Мошенничество\n' +
                '2. Кибербуллинг\n' +
                '3. Взлом аккаунта\n' +
                '4. Вымогательство\n' +
                '5. Другое\n\n' +
                'Для отмены: /cancel'
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
        
        stateData.data.problemType = problemTypes[problemTypeNum - 1];
        stateData.data.progress = '2/3';
        this.stateManager.setState(userId, 'AWAITING_DESCRIPTION', stateData.data);
        
        const descriptionPrompt = 
            `ШАГ 3 ИЗ 3: ОПИСАНИЕ ПРОБЛЕМЫ\n\n` +
            `Опишите подробно:\n` +
            `• Что произошло?\n` +
            `• Когда (дата и время)?\n` +
            `• Какие доказательства?\n` +
            `• Контакт (@никнейм или email)?\n\n` +
            `Минимум 50 символов.\n\n` +
            `Для отмены: /cancel`;
        
        await this.sendMessage(chatId, descriptionPrompt);
        
        Logger.info(`Пользователь ${userId} выбрал тип: ${problemTypes[problemTypeNum - 1]}`);
    }
    
    async processDescriptionStep(userId, chatId, description, stateData) {
        if (description.length < 50) {
            await this.sendMessage(chatId,
                'Описание слишком короткое. Минимум 50 символов.\n\n' +
                'Для отмены: /cancel'
            );
            return;
        }
        
        const reportId = 'RPT-' + Date.now().toString().slice(-8);
        const reportTime = new Date().toISOString();
        
        const reportData = {
            reportId: reportId,
            userId: userId,
            userName: stateData.data.userName,
            chatId: chatId,
            country: stateData.data.country,
            problemType: stateData.data.problemType,
            description: description,
            timestamp: reportTime
        };
        
        const adminMessage = 
            `НОВАЯ ЗАЯВКА #${reportId}\n\n` +
            `Пользователь: ${stateData.data.userName}\n` +
            `ID: ${userId}\n` +
            `Страна: ${stateData.data.country}\n` +
            `Тип: ${stateData.data.problemType}\n` +
            `Время: ${new Date(reportTime).toLocaleString('ru-RU')}\n\n` +
            `ОПИСАНИЕ:\n${description.substring(0, 500)}${description.length > 500 ? '...' : ''}\n\n` +
            `Ответить: tg://user?id=${userId}`;
        
        try {
            await this.sendMessage(CONFIG.ADMIN_CHAT_ID, adminMessage);
            Logger.info(`Уведомление администратору о заявке ${reportId}`);
        } catch (error) {
            Logger.error(`Ошибка уведомления администратора`, { error: error.message });
        }
        
        const userMessage = 
            `ЗАЯВКА #${reportId} ПРИНЯТА\n\n` +
            `Данные:\n` +
            `• ID: ${reportId}\n` +
            `• Страна: ${stateData.data.country}\n` +
            `• Тип: ${stateData.data.problemType}\n` +
            `• Время: ${new Date().toLocaleString('ru-RU')}\n\n` +
            `СТАТУС: Зарегистрирована\n\n` +
            `Защитники уведомлены. Свяжутся в течение 24 часов.\n\n` +
            `Сохраните ID: ${reportId}\n` +
            `Контакты: @[ваш_никнейм]\n\n` +
            `Внимание: Не передавайте пароли или данные карт.`;
        
        await this.sendMessage(chatId, userMessage);
        
        this.stateManager.clearState(userId);
        
        Logger.info(`Заявка ${reportId} создана`, reportData);
    }
    
    // ====================
    // ОБРАБОТКА ШАГОВ /join
    // ====================
    
    async processJoinNameStep(userId, chatId, name, stateData) {
        if (name.length < 2 || name.length > 50) {
            await this.sendMessage(chatId,
                'Имя слишком короткое или длинное. Укажите имя (2-50 символов).\n\n' +
                'Пример: Иван, Анна, Алексей\n\n' +
                'Для отмены: /cancel'
            );
            return;
        }
        
        stateData.data.defenderName = name.trim();
        stateData.data.progress = '1/4';
        this.stateManager.setState(userId, 'AWAITING_JOIN_REGION', stateData.data);
        
        const regionPrompt = 
            `ШАГ 2 ИЗ 4: РЕГИОН\n\n` +
            `В какой стране/регионе вы можете помогать?\n` +
            `Укажите страну или город.\n\n` +
            `Пример: Россия, Украина, Москва, Киев\n\n` +
            `Для отмены: /cancel`;
        
        await this.sendMessage(chatId, regionPrompt);
        
        Logger.info(`Защитник ${userId} указал имя: ${name}`);
    }
    
    async processJoinRegionStep(userId, chatId, region, stateData) {
        if (region.length < 2 || region.length > 50) {
            await this.sendMessage(chatId,
                'Некорректный регион. Укажите страну или город.\n\n' +
                'Для отмены: /cancel'
            );
            return;
        }
        
        stateData.data.region = region.trim();
        stateData.data.progress = '2/4';
        this.stateManager.setState(userId, 'AWAITING_JOIN_SKILLS', stateData.data);
        
        const skillsPrompt = 
            `ШАГ 3 ИЗ 4: НАВЫКИ\n\n` +
            `Какими навыками вы обладаете?\n\n` +
            `Примеры:\n` +
            `• Юрист\n` +
            `• Психолог\n` +
            `• IT-специалист\n` +
            `• Переводчик\n` +
            `• Опыт работы с жертвами\n` +
            `• Знание законов\n` +
            `• Другое (опишите)\n\n` +
            `Перечислите через запятую.\n\n` +
            `Для отмены: /cancel`;
        
        await this.sendMessage(chatId, skillsPrompt);
        
        Logger.info(`Защитник ${userId} указал регион: ${region}`);
    }
    
    async processJoinSkillsStep(userId, chatId, skills, stateData) {
        if (skills.length < 5) {
            await this.sendMessage(chatId,
                'Пожалуйста, опишите ваши навыки подробнее.\n\n' +
                'Для отмены: /cancel'
            );
            return;
        }
        
        const applicationId = 'DEF-' + Date.now().toString().slice(-8);
        const applicationTime = new Date().toISOString();
        
        const applicationData = {
            applicationId: applicationId,
            userId: userId,
            userName: stateData.data.defenderName,
            originalName: stateData.data.userName,
            chatId: chatId,
            region: stateData.data.region,
            skills: skills,
            timestamp: applicationTime,
            status: 'pending'
        };
        
        const adminMessage = 
            `НОВАЯ ЗАЯВКА НА ЗАЩИТНИКА #${applicationId}\n\n` +
            `Имя: ${stateData.data.defenderName}\n` +
            `Исходное имя: ${stateData.data.userName}\n` +
            `ID: ${userId}\n` +
            `Регион: ${stateData.data.region}\n` +
            `Навыки: ${skills}\n` +
            `Время: ${new Date(applicationTime).toLocaleString('ru-RU')}\n\n` +
            `Ответить: tg://user?id=${userId}`;
        
        try {
            await this.sendMessage(CONFIG.ADMIN_CHAT_ID, adminMessage);
            Logger.info(`Уведомление администратору о защитнике ${applicationId}`);
        } catch (error) {
            Logger.error(`Ошибка уведомления о защитнике`, { error: error.message });
        }
        
        const userMessage = 
            `ЗАЯВКА ЗАЩИТНИКА #${applicationId}\n\n` +
            `Ваши данные:\n` +
            `• ID: ${applicationId}\n` +
            `• Имя: ${stateData.data.defenderName}\n` +
            `• Регион: ${stateData.data.region}\n` +
            `• Навыки: ${skills}\n` +
            `• Время подачи: ${new Date().toLocaleString('ru-RU')}\n\n` +
            `СТАТУС: На проверке\n\n` +
            `Администратор проверит вашу анкету.\n` +
            `После одобрения вы будете получать уведомления о новых заявках в вашем регионе.\n\n` +
            `Срок проверки: 1-3 дня\n` +
            `Контакты: @[ваш_никнейм]\n\n` +
            `Сохраните ID заявки: ${applicationId}`;
        
        await this.sendMessage(chatId, userMessage);
        
        this.stateManager.clearState(userId);
        
        Logger.info(`Заявка защитника ${applicationId} создана`, applicationData);
    }
    
    // ====================
    // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
    // ====================
    
    async sendMessage(chatId, text) {
        try {
            await this.bot.sendMessage(chatId, text, {
                parse_mode: 'HTML',
                disable_web_page_preview: true
            });
            return true;
        } catch (error) {
            Logger.error(`Ошибка отправки сообщения ${chatId}`, {
                error: error.message
            });
            return false;
        }
    }
    
    startServer() {
        return new Promise((resolve, reject) => {
            this.app.listen(CONFIG.PORT, '0.0.0.0', () => {
                Logger.info(`Веб-сервер запущен на порту ${CONFIG.PORT}`);
                resolve();
            }).on('error', (error) => {
                Logger.error(`Ошибка запуска сервера`, error);
                reject(error);
            });
        });
    }
}

// ====================
// ЗАПУСК СИСТЕМЫ
// ====================

async function main() {
    try {
        Logger.info('Запуск системы Bakelite Defence');
        
        const bot = new BakeliteBot();
        await bot.startServer();
        
        Logger.info('Система успешно запущена');
        console.log('\n' + '='.repeat(60));
        console.log('✅ СИСТЕМА ЗАПУЩЕНА УСПЕШНО');
        console.log('📱 Доступные команды:');
        console.log('  /start - Начало работы');
        console.log('  /help - Помощь');
        console.log('  /report - Подать заявку');
        console.log('  /join - Стать защитником');
        console.log('  /status - Статус системы');
        console.log('  /cancel - Отмена операции');
        console.log('='.repeat(60) + '\n');
        
    } catch (error) {
        Logger.error('Критическая ошибка запуска', error);
        process.exit(1);
    }
}

main();
