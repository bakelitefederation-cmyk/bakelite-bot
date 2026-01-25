// ============================================
// BAKELITE DEFENCE BOT - ПРОИЗВОДСТВЕННАЯ ВЕРСИЯ
// Версия: 3.0.0
// Дата: 2024
// ============================================

const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const fs = require('fs');
const path = require('path');

// ============================================
// КОНФИГУРАЦИЯ
// ============================================

const CONFIG = {
    BOT_TOKEN: process.env.BOT_TOKEN || '',
    ADMIN_CHAT_ID: process.env.ADMIN_CHAT_ID || '',
    PORT: process.env.PORT || 3000,
    MAX_REQUESTS_PER_USER: 5,
    REQUEST_TIMEOUT_MINUTES: 10,
    LOG_FILE: 'bot_activity.log'
};

// ============================================
// ВАЛИДАЦИЯ КОНФИГУРАЦИИ
// ============================================

console.log('='.repeat(60));
console.log('ЗАПУСК СИСТЕМЫ BAKELITE DEFENCE');
console.log('='.repeat(60));

// Проверка обязательных переменных
const REQUIRED_ENV = ['BOT_TOKEN', 'ADMIN_CHAT_ID'];
let configValid = true;

REQUIRED_ENV.forEach(env => {
    if (!process.env[env] || process.env[env].trim() === '') {
        console.error(`ОШИБКА: Переменная окружения ${env} не установлена`);
        console.error(`Перейдите в Railway -> Variables -> Добавить ${env}`);
        configValid = false;
    }
});

if (!configValid) {
    console.error('КРИТИЧЕСКАЯ ОШИБКА: Не все обязательные переменные установлены');
    process.exit(1);
}

console.log('ПРОВЕРКА КОНФИГУРАЦИИ:');
console.log(`- BOT_TOKEN: ${CONFIG.BOT_TOKEN.substring(0, 10)}... (${CONFIG.BOT_TOKEN.length} символов)`);
console.log(`- ADMIN_CHAT_ID: ${CONFIG.ADMIN_CHAT_ID}`);
console.log(`- PORT: ${CONFIG.PORT}`);
console.log('КОНФИГУРАЦИЯ ПРОЙДЕНА');

// ============================================
// СИСТЕМА ЛОГИРОВАНИЯ
// ============================================

class Logger {
    static log(level, message, data = null) {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] [${level}] ${message}`;
        
        console.log(logEntry);
        
        if (data) {
            console.log('Данные:', JSON.stringify(data, null, 2));
        }
        
        this.writeToFile(logEntry);
    }
    
    static writeToFile(message) {
        try {
            fs.appendFileSync(CONFIG.LOG_FILE, message + '\n', 'utf8');
        } catch (error) {
            console.error('Ошибка записи в лог-файл:', error.message);
        }
    }
    
    static info(message, data = null) {
        this.log('INFO', message, data);
    }
    
    static error(message, data = null) {
        this.log('ERROR', message, data);
    }
    
    static warn(message, data = null) {
        this.log('WARN', message, data);
    }
}

// ============================================
// СИСТЕМА УПРАВЛЕНИЯ СОСТОЯНИЯМИ
// ============================================

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
        
        Logger.info(`Установлено состояние для пользователя ${userId}`, { state, data });
    }
    
    getState(userId) {
        return this.userStates.get(userId);
    }
    
    clearState(userId) {
        this.userStates.delete(userId);
        Logger.info(`Очищено состояние пользователя ${userId}`);
    }
    
    trackRequest(userId) {
        const now = Date.now();
        const userRequests = this.userRequests.get(userId) || [];
        
        // Очищаем старые запросы (старше 1 часа)
        const recentRequests = userRequests.filter(time => now - time < 3600000);
        
        if (recentRequests.length >= CONFIG.MAX_REQUESTS_PER_USER) {
            Logger.warn(`Превышен лимит запросов для пользователя ${userId}`);
            return false;
        }
        
        recentRequests.push(now);
        this.userRequests.set(userId, recentRequests);
        return true;
    }
    
    cleanup() {
        const now = Date.now();
        const timeout = CONFIG.REQUEST_TIMEOUT_MINUTES * 60000;
        
        for (const [userId, state] of this.userStates.entries()) {
            if (now - state.timestamp > timeout) {
                this.userStates.delete(userId);
                Logger.info(`Автоочистка состояния пользователя ${userId} (таймаут)`);
            }
        }
    }
}

// ============================================
// ОСНОВНОЙ КЛАСС БОТА
// ============================================

class BakeliteBot {
    constructor() {
        this.stateManager = new UserStateManager();
        this.bot = null;
        this.app = express();
        this.setupBot();
        this.setupWebServer();
        this.setupCleanupInterval();
    }
    
    setupBot() {
        try {
            Logger.info('Инициализация Telegram бота');
            
            this.bot = new TelegramBot(CONFIG.BOT_TOKEN, {
                polling: {
                    interval: 1000,
                    autoStart: true,
                    params: {
                        timeout: 30,
                        limit: 100
                    }
                },
                request: {
                    timeout: 30000
                }
            });
            
            this.setupErrorHandlers();
            this.setupCommandHandlers();
            
            Logger.info('Бот успешно инициализирован');
        } catch (error) {
            Logger.error('Ошибка инициализации бота', error);
            throw error;
        }
    }
    
    setupErrorHandlers() {
        this.bot.on('polling_error', (error) => {
            Logger.error('Ошибка polling Telegram API', {
                code: error.code,
                message: error.message,
                response: error.response
            });
        });
        
        this.bot.on('webhook_error', (error) => {
            Logger.error('Ошибка webhook', error);
        });
        
        this.bot.on('error', (error) => {
            Logger.error('Общая ошибка бота', error);
        });
    }
    
    setupCommandHandlers() {
        // Команда: /start
        this.bot.onText(/^\/start(?:\s|$)/, (msg) => {
            this.handleStartCommand(msg);
        });
        
        // Команда: /help
        this.bot.onText(/^\/help(?:\s|$)/, (msg) => {
            this.handleHelpCommand(msg);
        });
        
        // Команда: /report
        this.bot.onText(/^\/report(?:\s|$)/, (msg) => {
            this.handleReportCommand(msg);
        });
        
        // Команда: /status
        this.bot.onText(/^\/status(?:\s|$)/, (msg) => {
            this.handleStatusCommand(msg);
        });
        
        // Команда: /cancel
        this.bot.onText(/^\/cancel(?:\s|$)/, (msg) => {
            this.handleCancelCommand(msg);
        });
        
        // Обработка текстовых сообщений (для диалогов)
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
                version: '3.0.0',
                uptime: process.uptime()
            });
        });
        
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                bot_online: !!this.bot,
                admin_id: CONFIG.ADMIN_CHAT_ID,
                active_states: this.stateManager.userStates.size
            });
        });
        
        this.app.get('/stats', (req, res) => {
            res.json({
                active_users: this.stateManager.userStates.size,
                total_requests: this.stateManager.userRequests.size,
                config: {
                    max_requests: CONFIG.MAX_REQUESTS_PER_USER,
                    request_timeout: CONFIG.REQUEST_TIMEOUT_MINUTES
                }
            });
        });
    }
    
    setupCleanupInterval() {
        setInterval(() => {
            this.stateManager.cleanup();
        }, 60000); // Каждую минуту
    }
    
    // ============================================
    // ОБРАБОТЧИКИ КОМАНД
    // ============================================
    
    async handleStartCommand(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const userName = msg.from.first_name || 'Пользователь';
        
        Logger.info(`Команда /start от пользователя ${userName} (ID: ${userId})`);
        
        if (!this.stateManager.trackRequest(userId)) {
            this.sendMessage(chatId, 
                'Превышен лимит запросов. Пожалуйста, подождите 1 час перед следующим запросом.'
            );
            return;
        }
        
        const welcomeMessage = 
            `Добро пожаловать в систему Bakelite Defence, ${userName}.\n\n` +
            `Я - автоматизированная система помощи жертвам киберпреступлений.\n\n` +
            `Доступные команды:\n` +
            `/report - Подать заявку о проблеме\n` +
            `/help - Получить инструкцию\n` +
            `/status - Проверить статус системы\n` +
            `/cancel - Отменить текущую операцию\n\n` +
            `Для начала работы используйте команду /report\n\n` +
            `Внимание: Данная система не заменяет официальные правоохранительные органы. ` +
            `Для экстренных случаев обращайтесь в полицию.`;
        
        await this.sendMessage(chatId, welcomeMessage);
    }
    
    async handleHelpCommand(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        Logger.info(`Команда /help от пользователя ${userId}`);
        
        const helpMessage = 
            `РУКОВОДСТВО ПОЛЬЗОВАТЕЛЯ BAKELITE DEFENCE\n\n` +
            `1. ПОДАЧА ЗАЯВКИ:\n` +
            `   Используйте команду /report\n` +
            `   Следуйте инструкциям шаг за шагом\n` +
            `   Укажите страну, тип проблемы и описание\n\n` +
            `2. ПРОЦЕСС ОБРАБОТКИ:\n` +
            `   Ваша заявка поступает в систему\n` +
            `   Назначается ответственный защитник из вашего региона\n` +
            `   Защитник связывается с вами в течение 24 часов\n\n` +
            `3. ТРЕБОВАНИЯ К ДАННЫМ:\n` +
            `   Запрещено передавать пароли и PIN-коды\n` +
            `   Запрещено передавать данные банковских карт\n` +
            `   Запрещено передавать паспортные данные\n` +
            `   Используйте псевдонимы для конфиденциальности\n\n` +
            `4. БЕЗОПАСНОСТЬ:\n` +
            `   Все данные шифруются\n` +
            `   Защитники проходят проверку\n` +
            `   История сообщений сохраняется\n\n` +
            `5. КОНТАКТЫ:\n` +
            `   Администратор: @[ваш_никнейм]\n` +
            `   Экстренная связь: @[ваш_никнейм]\n\n` +
            `Время работы системы: 24/7\n` +
            `Среднее время ответа: 12-24 часа`;
        
        await this.sendMessage(chatId, helpMessage);
    }
    
    async handleReportCommand(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const userName = msg.from.first_name || 'Пользователь';
        
        Logger.info(`Начало подачи заявки от пользователя ${userName} (ID: ${userId})`);
        
        if (!this.stateManager.trackRequest(userId)) {
            this.sendMessage(chatId, 
                'Превышен лимит запросов. Пожалуйста, подождите 1 час перед следующим запросом.'
            );
            return;
        }
        
        // Устанавливаем состояние "ожидание страны"
        this.stateManager.setState(userId, 'AWAITING_COUNTRY', {
            userName: userName,
            chatId: chatId,
            startTime: Date.now()
        });
        
        const countryPrompt = 
            `ШАГ 1 ИЗ 3: УКАЖИТЕ СТРАНУ\n\n` +
            `В какой стране вы находитесь?\n` +
            `Укажите полное название страны на русском языке.\n\n` +
            `Примеры: Россия, Украина, Германия, Казахстан\n\n` +
            `Для отмены используйте /cancel`;
        
        await this.sendMessage(chatId, countryPrompt);
    }
    
    async handleStatusCommand(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        Logger.info(`Запрос статуса от пользователя ${userId}`);
        
        const statusMessage = 
            `СТАТУС СИСТЕМЫ BAKELITE DEFENCE\n\n` +
            `Состояние: Активно\n` +
            `Платформа: Railway\n` +
            `Время: ${new Date().toLocaleString('ru-RU')}\n` +
            `Ваш ID: ${userId}\n\n` +
            `Активных пользователей: ${this.stateManager.userStates.size}\n` +
            `Система работает: ${Math.floor(process.uptime() / 3600)} ч. ${Math.floor((process.uptime() % 3600) / 60)} мин.\n\n` +
            `Для подачи заявки: /report\n` +
            `Для помощи: /help`;
        
        await this.sendMessage(chatId, statusMessage);
    }
    
    async handleCancelCommand(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        const state = this.stateManager.getState(userId);
        if (state) {
            this.stateManager.clearState(userId);
            Logger.info(`Пользователь ${userId} отменил операцию`, { state: state.state });
            
            await this.sendMessage(chatId, 
                'Операция отменена. Все временные данные удалены.\n\n' +
                'Для начала новой операции используйте /report'
            );
        } else {
            await this.sendMessage(chatId, 
                'Нет активных операций для отмены.\n\n' +
                'Для начала работы используйте /report'
            );
        }
    }
    
    async handleMessage(msg) {
        if (msg.text && msg.text.startsWith('/')) {
            return; // Команды обрабатываются отдельно
        }
        
        const userId = msg.from.id;
        const chatId = msg.chat.id;
        const state = this.stateManager.getState(userId);
        
        if (!state) {
            return; // Нет активного состояния
        }
        
        const userText = msg.text || '';
        
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
        }
    }
    
    // ============================================
    // ОБРАБОТЧИКИ ШАГОВ ДИАЛОГА
    // ============================================
    
    async processCountryStep(userId, chatId, country, stateData) {
        if (country.length < 2 || country.length > 50) {
            await this.sendMessage(chatId,
                'Некорректное название страны. Пожалуйста, укажите полное название страны.\n\n' +
                'Пример: Россия, Украина, Германия\n\n' +
                'Для отмены: /cancel'
            );
            return;
        }
        
        // Обновляем состояние
        stateData.data.country = country.trim();
        stateData.data.progress = '1/3';
        this.stateManager.setState(userId, 'AWAITING_PROBLEM_TYPE', stateData.data);
        
        const problemTypePrompt = 
            `ШАГ 2 ИЗ 3: ТИП ПРОБЛЕМЫ\n\n` +
            `Выберите тип проблемы:\n\n` +
            `1. Мошенничество (фишинг, обман в интернете)\n` +
            `2. Кибербуллинг (травля, угрозы)\n` +
            `3. Взлом аккаунта (соцсети, почта)\n` +
            `4. Вымогательство (шантаж, угрозы)\n` +
            `5. Другое (опишите в следующем шаге)\n\n` +
            `Ответьте цифрой от 1 до 5\n\n` +
            `Для отмены: /cancel`;
        
        await this.sendMessage(chatId, problemTypePrompt);
        
        Logger.info(`Пользователь ${userId} указал страну: ${country}`, stateData.data);
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
        stateData.data.problemTypeCode = problemTypeNum;
        stateData.data.progress = '2/3';
        this.stateManager.setState(userId, 'AWAITING_DESCRIPTION', stateData.data);
        
        const descriptionPrompt = 
            `ШАГ 3 ИЗ 3: ОПИСАНИЕ ПРОБЛЕМЫ\n\n` +
            `Опишите подробно:\n` +
            `• Что произошло?\n` +
            `• Когда произошло (дата и время)?\n` +
            `• Какие есть доказательства (скриншоты, ссылки)?\n` +
            `• Как с вами можно связаться (@никнейм или email)?\n\n` +
            `Опишите всё в одном сообщении.\n` +
            `Минимальная длина: 50 символов\n\n` +
            `Для отмены: /cancel`;
        
        await this.sendMessage(chatId, descriptionPrompt);
        
        Logger.info(`Пользователь ${userId} выбрал тип проблемы: ${problemTypes[problemTypeNum - 1]}`, stateData.data);
    }
    
    async processDescriptionStep(userId, chatId, description, stateData) {
        if (description.length < 50) {
            await this.sendMessage(chatId,
                'Описание слишком короткое. Пожалуйста, опишите проблему подробнее (минимум 50 символов).\n\n' +
                'Что произошло? Когда? Какие есть доказательства? Как связаться?\n\n' +
                'Для отмены: /cancel'
            );
            return;
        }
        
        if (description.length > 2000) {
            await this.sendMessage(chatId,
                'Описание слишком длинное. Пожалуйста, сократите до 2000 символов.\n\n' +
                'Для отмены: /cancel'
            );
            return;
        }
        
        // Генерация ID заявки
        const reportId = 'RPT-' + Date.now().toString().slice(-8);
        const reportTime = new Date().toISOString();
        
        // Подготовка данных заявки
        const reportData = {
            reportId: reportId,
            userId: userId,
            userName: stateData.data.userName,
            chatId: chatId,
            country: stateData.data.country,
            problemType: stateData.data.problemType,
            description: description,
            timestamp: reportTime,
            processingTime: Date.now() - stateData.data.startTime
        };
        
        // Уведомление администратору
        const adminMessage = 
            `НОВАЯ ЗАЯВКА #${reportId}\n\n` +
            `Пользователь: ${stateData.data.userName}\n` +
            `ID пользователя: ${userId}\n` +
            `Страна: ${stateData.data.country}\n` +
            `Тип проблемы: ${stateData.data.problemType}\n` +
            `Время подачи: ${new Date(reportTime).toLocaleString('ru-RU')}\n\n` +
            `ОПИСАНИЕ:\n` +
            `${description.substring(0, 500)}${description.length > 500 ? '...' : ''}\n\n` +
            `Ответить: tg://user?id=${userId}`;
        
        try {
            await this.sendMessage(CONFIG.ADMIN_CHAT_ID, adminMessage);
            Logger.info(`Отправлено уведомление администратору о заявке ${reportId}`, reportData);
        } catch (error) {
            Logger.error(`Ошибка отправки уведомления администратору`, { error: error.message, reportId });
        }
        
        // Ответ пользователю
        const userMessage = 
            `ЗАЯВКА #${reportId} ПРИНЯТА\n\n` +
            `Данные заявки:\n` +
            `• ID: ${reportId}\n` +
            `• Страна: ${stateData.data.country}\n` +
            `• Тип: ${stateData.data.problemType}\n` +
            `• Время подачи: ${new Date().toLocaleString('ru-RU')}\n\n` +
            `СТАТУС: Заявка зарегистрирована\n\n` +
            `Дальнейшие действия:\n` +
            `1. Защитники из вашего региона получили уведомление\n` +
            `2. С вами свяжутся в течение 24 часов\n` +
            `3. Для связи используйте тот же Telegram аккаунт\n\n` +
            `Сохраните ID заявки: ${reportId}\n` +
            `Для проверки статуса обращайтесь к администратору\n\n` +
            `Контакты администратора: @[ваш_никнейм]\n\n` +
            `Внимание: Не передавайте никому пароли, PIN-коды или данные банковских карт.`;
        
        await this.sendMessage(chatId, userMessage);
        
        // Очистка состояния
        this.stateManager.clearState(userId);
        
        Logger.info(`Заявка ${reportId} успешно создана`, reportData);
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
            Logger.error(`Ошибка отправки сообщения пользователю ${chatId}`, {
                error: error.message,
                text_length: text.length
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
                Logger.error(`Ошибка запуска веб-сервера`, error);
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
        Logger.info('Запуск системы Bakelite Defence');
        
        const bot = new BakeliteBot();
        await bot.startServer();
        
        Logger.info('Система успешно запущена и готова к работе');
        
        // Обработка завершения работы
        process.on('SIGTERM', () => {
            Logger.info('Получен сигнал SIGTERM, завершение работы');
            process.exit(0);
        });
        
        process.on('SIGINT', () => {
            Logger.info('Получен сигнал SIGINT, завершение работы');
            process.exit(0);
        });
        
        process.on('uncaughtException', (error) => {
            Logger.error('Необработанное исключение', error);
        });
        
        process.on('unhandledRejection', (reason, promise) => {
            Logger.error('Необработанный промис', { reason, promise });
        });
        
    } catch (error) {
        Logger.error('Критическая ошибка при запуске системы', error);
        process.exit(1);
    }
}

// Запуск приложения
main();
