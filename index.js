// ============================================
// 🛡️ BAKELITE-BOT v1.0.0
// Репозиторий: https://github.com/kartochniy/bakelite-bot
// Хостинг: Railway.com
// ============================================

const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const fs = require('fs').promises;
const path = require('path');

// ============================================
// КОНФИГУРАЦИЯ
// ============================================

const CONFIG = {
    BOT_TOKEN: process.env.BOT_TOKEN || '',
    ADMIN_ID: process.env.ADMIN_ID || '',
    VERSION: '1.0.0',
    
    // Регионы (фиксированные + "Другое")
    REGIONS: ['Россия', 'Украина', 'Казахстан', 'Другое'],
    
    // Типы киберпреступлений
    CRIME_TYPES: ['Вымогательство', 'Кибербуллинг', 'Мошенничество', 'Другое'],
    
    // Пути для хранения данных
    DATA_DIR: './data',
    REPORTS_FILE: './data/reports.json',
    DEFENDERS_FILE: './data/defenders.json',
    PENDING_DEFENDERS_FILE: './data/pending_defenders.json'
};

// ============================================
// УТИЛИТЫ
// ============================================

// Генерация уникального ID
function generateId(prefix) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `${prefix}_${timestamp}_${random}`;
}

// Форматирование даты
function formatDate(date) {
    return new Date(date).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// ============================================
// СИСТЕМА ХРАНЕНИЯ ДАННЫХ
// ============================================

class Storage {
    constructor() {
        this.reports = new Map();        // ID заявки -> данные заявки
        this.defenders = new Map();      // ID пользователя -> данные защитника
        this.pendingDefenders = new Map(); // ID заявки -> заявка защитника (ожидает одобрения)
        this.userSessions = new Map();   // ID пользователя -> сессия
        
        this.loadData();
    }
    
    // Загрузка данных из файлов
    async loadData() {
        try {
            // Создаем директорию, если её нет
            await fs.mkdir(CONFIG.DATA_DIR, { recursive: true });
            
            // Загрузка заявок
            try {
                const reportsData = await fs.readFile(CONFIG.REPORTS_FILE, 'utf8');
                const reports = JSON.parse(reportsData);
                reports.forEach(report => {
                    this.reports.set(report.id, report);
                });
                console.log(`Загружено ${reports.length} заявок`);
            } catch (error) {
                console.log('Файл заявок не найден, создаем новый');
                await fs.writeFile(CONFIG.REPORTS_FILE, '[]');
            }
            
            // Загрузка защитников
            try {
                const defendersData = await fs.readFile(CONFIG.DEFENDERS_FILE, 'utf8');
                const defenders = JSON.parse(defendersData);
                defenders.forEach(defender => {
                    this.defenders.set(defender.userId, defender);
                });
                console.log(`Загружено ${defenders.length} защитников`);
            } catch (error) {
                console.log('Файл защитников не найден, создаем новый');
                await fs.writeFile(CONFIG.DEFENDERS_FILE, '[]');
            }
            
            // Загрузка заявок на защитников
            try {
                const pendingData = await fs.readFile(CONFIG.PENDING_DEFENDERS_FILE, 'utf8');
                const pending = JSON.parse(pendingData);
                pending.forEach(defender => {
                    this.pendingDefenders.set(defender.id, defender);
                });
                console.log(`Загружено ${pending.length} заявок на защитников`);
            } catch (error) {
                console.log('Файл заявок защитников не найден, создаем новый');
                await fs.writeFile(CONFIG.PENDING_DEFENDERS_FILE, '[]');
            }
            
        } catch (error) {
            console.error('Ошибка загрузки данных:', error);
        }
    }
    
    // Сохранение данных в файлы
    async saveData() {
        try {
            // Сохраняем заявки
            const reportsArray = Array.from(this.reports.values());
            await fs.writeFile(CONFIG.REPORTS_FILE, JSON.stringify(reportsArray, null, 2));
            
            // Сохраняем защитников
            const defendersArray = Array.from(this.defenders.values());
            await fs.writeFile(CONFIG.DEFENDERS_FILE, JSON.stringify(defendersArray, null, 2));
            
            // Сохраняем заявки на защитников
            const pendingArray = Array.from(this.pendingDefenders.values());
            await fs.writeFile(CONFIG.PENDING_DEFENDERS_FILE, JSON.stringify(pendingArray, null, 2));
            
            console.log('Данные успешно сохранены');
        } catch (error) {
            console.error('Ошибка сохранения данных:', error);
        }
    }
    
    // Управление сессиями пользователей
    createSession(userId, type, data = {}) {
        const session = {
            id: generateId('session'),
            userId: userId.toString(),
            type: type,
            step: 1,
            data: data,
            createdAt: new Date().toISOString()
        };
        
        this.userSessions.set(userId.toString(), session);
        return session;
    }
    
    getSession(userId) {
        return this.userSessions.get(userId.toString());
    }
    
    updateSession(userId, updates) {
        const session = this.getSession(userId);
        if (session) {
            Object.assign(session, updates);
            this.userSessions.set(userId.toString(), session);
            return true;
        }
        return false;
    }
    
    deleteSession(userId) {
        return this.userSessions.delete(userId.toString());
    }
    
    // Работа с заявками на помощь
    createReport(data) {
        const reportId = generateId('report');
        const report = {
            id: reportId,
            userId: data.userId,
            userName: data.userName,
            userUsername: data.userUsername,
            region: data.region,
            crimeType: data.crimeType,
            description: data.description,
            status: 'pending', // pending, in_progress, completed, rejected
            assignedDefender: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        this.reports.set(reportId, report);
        this.saveData();
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
    
    getUserReports(userId) {
        return Array.from(this.reports.values())
            .filter(report => report.userId === userId.toString());
    }
    
    // Работа с защитниками
    createDefenderApplication(data) {
        const appId = generateId('def_app');
        const application = {
            id: appId,
            userId: data.userId,
            userName: data.userName,
            userUsername: data.userUsername,
            region: data.region,
            pseudonym: data.pseudonym,
            specialty: data.specialty,
            status: 'pending', // pending, approved, rejected
            createdAt: new Date().toISOString()
        };
        
        this.pendingDefenders.set(appId, application);
        this.saveData();
        return application;
    }
    
    approveDefenderApplication(appId) {
        const application = this.pendingDefenders.get(appId);
        if (!application) return false;
        
        // Переносим в список одобренных защитников
        const defender = {
            userId: application.userId,
            userName: application.userName,
            userUsername: application.userUsername,
            region: application.region,
            pseudonym: application.pseudonym,
            specialty: application.specialty,
            approvedAt: new Date().toISOString(),
            completedReports: 0,
            rating: 0
        };
        
        this.defenders.set(application.userId, defender);
        this.pendingDefenders.delete(appId);
        this.saveData();
        return defender;
    }
    
    rejectDefenderApplication(appId) {
        const application = this.pendingDefenders.get(appId);
        if (!application) return false;
        
        // Просто удаляем заявку
        this.pendingDefenders.delete(appId);
        this.saveData();
        return true;
    }
    
    getDefenderByUserId(userId) {
        return this.defenders.get(userId.toString());
    }
    
    getDefendersByRegion(region) {
        return Array.from(this.defenders.values())
            .filter(defender => defender.region === region);
    }
    
    getAllDefenders() {
        return Array.from(this.defenders.values());
    }
    
    getPendingApplications() {
        return Array.from(this.pendingDefenders.values());
    }
    
    // Уведомления
    async notifyDefendersAboutReport(report) {
        const defenders = this.getDefendersByRegion(report.region);
        return defenders;
    }
}

// ============================================
// ТЕКСТЫ СООБЩЕНИЙ
// ============================================

const Messages = {
    start: (userName, version) => `
🛡️ <b>Добро пожаловать в Bakelite Bot v${version}!</b>

👋 Привет, ${userName}! Я - бот помощи жертвам киберпреступлений.

✨ <b>Мои функции:</b>
• 🛡️ Стать защитником - помогать другим
• 🆘 Запросить помощь - если вы стали жертвой
• 📊 Статус заявки - отслеживать ваши обращения
• 📖 Справка - узнать подробности о функциях

👇 <b>Выберите действие:</b>
    `,
    
    help: () => `
📖 <b>СПРАВКА ПО КОМАНДАМ</b>

<b>Основные команды:</b>
/start - Главное меню
/join - Стать защитником
/report - Запросить помощь
/status - Статус моей заявки
/help - Эта справка
/menu - Вернуться в меню

<b>Процесс "Стать защитником":</b>
1️⃣ Выбор региона
2️⃣ Ввод псевдонима
3️⃣ Указание специальности
4️⃣ Отправка заявки на одобрение

<b>Процесс "Запросить помощь":</b>
1️⃣ Выбор региона
2️⃣ Выбор типа киберпреступности
3️⃣ Подробное описание проблемы
4️⃣ Отправка заявки

<b>Что дальше?</b>
• Заявки защитников проверяются администратором
• Заявки о помощи отправляются защитникам региона
• Защитник свяжется с вами в личных сообщениях

📞 <b>По всем вопросам:</b> Обращайтесь к администратору.
    `,
    
    joinStep1: () => `
🛡️ <b>СТАТЬ ЗАЩИТНИКОМ</b>

Вы начали процесс регистрации защитника.

<b>Шаг 1/3:</b> Выберите ваш регион:
    `,
    
    joinStep2: () => `
✅ <b>Регион выбран!</b>

<b>Шаг 2/3:</b> Введите ваш псевдоним (имя, под которым вас будут знать в системе):

<i>Пример: CyberHelper, SecurityPro, ITGuardian</i>
    `,
    
    joinStep3: (pseudonym) => `
✅ <b>Псевдоним принят: ${pseudonym}</b>

<b>Шаг 3/3:</b> Опишите вашу специальность (кем вы являетесь):

<i>Пример: "Юрист по киберправу", "IT специалист по безопасности", "Психолог, работаю с жертвами кибербуллинга"</i>
    `,
    
    joinConfirmation: (data) => `
📋 <b>ПОДТВЕРЖДЕНИЕ ЗАЯВКИ</b>

<b>Ваши данные:</b>
• Регион: ${data.region}
• Псевдоним: ${data.pseudonym}
• Специальность: ${data.specialty}

<b>Подтвердите отправку заявки:</b>
    `,
    
    joinSubmitted: (appId) => `
✅ <b>ЗАЯВКА ОТПРАВЛЕНА!</b>

Ваша заявка #${appId} отправлена на проверку администратору.

<b>Что дальше:</b>
• Администратор проверит вашу заявку
• Вы получите уведомление о результате
• Обычно проверка занимает 1-3 дня

Спасибо за желание помогать! 🛡️
    `,
    
    reportStep1: () => `
🆘 <b>ЗАПРОС ПОМОЩИ</b>

Вы начали процесс подачи заявки о помощи.

<b>Шаг 1/4:</b> Выберите регион, где произошел инцидент:
    `,
    
    reportStep2: () => `
✅ <b>Регион выбран!</b>

<b>Шаг 2/4:</b> Выберите вид киберпреступности:
    `,
    
    reportStep3: () => `
✅ <b>Тип преступления выбран!</b>

<b>Шаг 3/4:</b> Опишите подробно вашу проблему:

<i>Что указать:</i>
• Что именно произошло?
• Когда (дата и время)?
• Какие есть доказательства?
• Контактные данные для связи
    `,
    
    reportConfirmation: (data) => `
📋 <b>ПОДТВЕРЖДЕНИЕ ЗАЯВКИ</b>

<b>Ваши данные:</b>
• Регион: ${data.region}
• Тип преступления: ${data.crimeType}
• Описание: ${data.description.substring(0, 100)}${data.description.length > 100 ? '...' : ''}

<b>Подтвердите отправку заявки:</b>
    `,
    
    reportSubmitted: (reportId) => `
✅ <b>ЗАЯВКА #${reportId} ПРИНЯТА!</b>

Ваша заявка успешно отправлена защитникам региона.

<b>Что дальше:</b>
• Защитники получили уведомление
• Первый откликнувшийся возьмет вашу заявку
• Защитник свяжется с вами в личных сообщениях

<i>Сохраните ID заявки: ${reportId}</i>
    `,
    
    statusEmpty: () => `
📊 <b>СТАТУС ЗАЯВОК</b>

У вас пока нет заявок о помощи.

Используйте команду /report чтобы создать первую заявку.
    `,
    
    statusList: (reports) => `
📊 <b>СТАТУС ВАШИХ ЗАЯВОК</b>

<b>Всего заявок:</b> ${reports.length}

${reports.map((report, index) => `
<b>Заявка #${report.id}</b>
• Тип: ${report.crimeType}
• Регион: ${report.region}
• Статус: ${getStatusText(report.status)}
• Дата: ${formatDate(report.createdAt)}
`).join('\n')}

<b>Статусы:</b>
🟡 Pending - ожидает защитника
🟠 In Progress - в работе
🟢 Completed - завершена
🔴 Rejected - отклонена

<i>Защитник свяжется с вами когда возьмется за работу или завершит её.</i>
    `,
    
    defenderNotification: (report) => `
🆘 <b>НОВАЯ ЗАЯВКА О ПОМОЩИ</b>

<b>ID заявки:</b> ${report.id}
<b>Регион:</b> ${report.region}
<b>Тип:</b> ${report.crimeType}
<b>Описание:</b> ${report.description.substring(0, 150)}${report.description.length > 150 ? '...' : ''}

👇 <b>Хотите взять эту заявку?</b>
    `,
    
    adminDefenderNotification: (application) => `
🛡️ <b>НОВАЯ ЗАЯВКА ЗАЩИТНИКА</b>

<b>ID заявки:</b> ${application.id}
<b>Пользователь:</b> ${application.userName} (@${application.userUsername})
<b>Регион:</b> ${application.region}
<b>Псевдоним:</b> ${application.pseudonym}
<b>Специальность:</b> ${application.specialty}
<b>Дата:</b> ${formatDate(application.createdAt)}

👇 <b>Одобрить или отклонить?</b>
    `
};

// Вспомогательная функция для статусов
function getStatusText(status) {
    const statuses = {
        'pending': '🟡 Ожидает',
        'in_progress': '🟠 В работе',
        'completed': '🟢 Завершена',
        'rejected': '🔴 Отклонена'
    };
    return statuses[status] || status;
}

// ============================================
## ПРОДОЛЖЕНИЕ - КЛАВИАТУРЫ

// Клавиатуры для бота
const Keyboards = {
    // Главное меню
    mainMenu: {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🛡️ Стать защитником', callback_data: 'menu_join' }],
                [{ text: '🆘 Запросить помощь', callback_data: 'menu_report' }],
                [{ text: '📊 Статус моей заявки', callback_data: 'menu_status' }],
                [{ text: '📖 Справка', callback_data: 'menu_help' }]
            ]
        }
    },
    
    // Выбор региона
    regionsMenu: (currentStep, totalSteps) => ({
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '🇷🇺 Россия', callback_data: 'region_ru' },
                    { text: '🇺🇦 Украина', callback_data: 'region_ua' }
                ],
                [
                    { text: '🇰🇿 Казахстан', callback_data: 'region_kz' },
                    { text: '🌍 Другое', callback_data: 'region_other' }
                ],
                Keyboards.navigationButtons(currentStep, totalSteps)
            ]
        }
    }),
    
    // Выбор типа преступления
    crimeTypesMenu: (currentStep, totalSteps) => ({
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '💰 Вымогательство', callback_data: 'crime_extortion' },
                    { text: '👥 Кибербуллинг', callback_data: 'crime_bullying' }
                ],
                [
                    { text: '💸 Мошенничество', callback_data: 'crime_fraud' },
                    { text: '❓ Другое', callback_data: 'crime_other' }
                ],
                Keyboards.navigationButtons(currentStep, totalSteps)
            ]
        }
    }),
    
    // Кнопки подтверждения
    confirmationMenu: {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '✅ Да, отправить', callback_data: 'confirm_yes' },
                    { text: '❌ Нет, отменить', callback_data: 'confirm_no' }
                ]
            ]
        }
    },
    
    // Кнопки навигации
    navigationButtons: (currentStep, totalSteps) => {
        const buttons = [];
        
        if (currentStep > 1) {
            buttons.push({ text: '⬅️ Назад', callback_data: 'nav_back' });
        }
        
        if (currentStep < totalSteps) {
            buttons.push({ text: 'Продолжить ➡️', callback_data: 'nav_next' });
        }
        
        buttons.push({ text: '📋 Вернуться в меню', callback_data: 'nav_menu' });
        
        return buttons;
    },
    
    // Кнопки для защитника (взять/отказаться от заявки)
    defenderActionMenu: (reportId) => ({
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '✅ Взять заявку', callback_data: `def_take_${reportId}` },
                    { text: '❌ Отказаться', callback_data: `def_decline_${reportId}` }
                ]
            ]
        }
    }),
    
    // Кнопки для админа (одобрить/отклонить защитника)
    adminActionMenu: (appId) => ({
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '✅ Одобрить', callback_data: `admin_approve_${appId}` },
                    { text: '❌ Отклонить', callback_data: `admin_reject_${appId}` }
                ]
            ]
        }
    }),
    
    // Просто кнопка "Вернуться в меню"
    backToMenu: {
        reply_markup: {
            inline_keyboard: [
                [{ text: '📋 Вернуться в меню', callback_data: 'nav_menu' }]
            ]
        }
    }
};

// ============================================
## ПРОДОЛЖЕНИЕ - ОСНОВНОЙ КЛАСС БОТА

class BakeliteBot {
    constructor() {
        this.bot = null;
        this.storage = new Storage();
        this.app = express();
        
        this.initializeBot();
        this.setupWebServer();
        
        console.log('🤖 Bakelite Bot инициализирован');
    }
    
    initializeBot() {
        try {
            // Проверяем токен
            if (!CONFIG.BOT_TOKEN) {
                throw new Error('BOT_TOKEN не установлен. Получите у @BotFather');
            }
            
            // Создаем бота
            this.bot = new TelegramBot(CONFIG.BOT_TOKEN, {
                polling: {
                    interval: 300,
                    autoStart: true,
                    params: {
                        timeout: 10
                    }
                }
            });
            
            // Обработка ошибок
            this.bot.on('polling_error', (error) => {
                console.error('Polling error:', error.message);
            });
            
            // Регистрируем обработчики
            this.setupCommandHandlers();
            this.setupCallbackHandlers();
            this.setupMessageHandlers();
            
            console.log('✅ Бот успешно инициализирован');
            
        } catch (error) {
            console.error('❌ Ошибка инициализации бота:', error);
            process.exit(1);
        }
    }
    
    setupCommandHandlers() {
        // Команда /start
        this.bot.onText(/^\/start(?:\s|$)/i, (msg) => {
            const chatId = msg.chat.id;
            const userId = msg.from.id;
            const userName = msg.from.first_name || 'Пользователь';
            
            console.log(`/start от ${userName} (${userId})`);
            
            // Отправляем приветственное сообщение
            this.bot.sendMessage(chatId, Messages.start(userName, CONFIG.VERSION), {
                parse_mode: 'HTML',
                ...Keyboards.mainMenu
            });
        });
        
        // Команда /join
        this.bot.onText(/^\/join(?:\s|$)/i, (msg) => {
            this.handleJoinCommand(msg);
        });
        
        // Команда /report
        this.bot.onText(/^\/report(?:\s|$)/i, (msg) => {
            this.handleReportCommand(msg);
        });
        
        // Команда /status
        this.bot.onText(/^\/status(?:\s|$)/i, (msg) => {
            this.handleStatusCommand(msg);
        });
        
        // Команда /help
        this.bot.onText(/^\/help(?:\s|$)/i, (msg) => {
            const chatId = msg.chat.id;
            this.bot.sendMessage(chatId, Messages.help(), {
                parse_mode: 'HTML',
                ...Keyboards.backToMenu
            });
        });
        
        // Команда /menu
        this.bot.onText(/^\/menu(?:\s|$)/i, (msg) => {
            const chatId = msg.chat.id;
            const userName = msg.from.first_name || 'Пользователь';
            
            this.bot.sendMessage(chatId, Messages.start(userName, CONFIG.VERSION), {
                parse_mode: 'HTML',
                ...Keyboards.mainMenu
            });
        });
    }
    
    setupCallbackHandlers() {
        this.bot.on('callback_query', async (callbackQuery) => {
            const chatId = callbackQuery.message.chat.id;
            const userId = callbackQuery.from.id;
            const data = callbackQuery.data;
            const messageId = callbackQuery.message.message_id;
            
            console.log(`Callback от ${userId}: ${data}`);
            
            try {
                // Обработка меню
                if (data.startsWith('menu_')) {
                    await this.handleMenuCallback(callbackQuery);
                }
                // Обработка выбора региона
                else if (data.startsWith('region_')) {
                    await this.handleRegionCallback(callbackQuery);
                }
                // Обработка выбора типа преступления
                else if (data.startsWith('crime_')) {
                    await this.handleCrimeCallback(callbackQuery);
                }
                // Обработка подтверждения
                else if (data.startsWith('confirm_')) {
                    await this.handleConfirmationCallback(callbackQuery);
                }
                // Обработка навигации
                else if (data.startsWith('nav_')) {
                    await this.handleNavigationCallback(callbackQuery);
                }
                // Обработка действий защитника
                else if (data.startsWith('def_')) {
                    await this.handleDefenderActionCallback(callbackQuery);
                }
                // Обработка действий админа
                else if (data.startsWith('admin_')) {
                    await this.handleAdminActionCallback(callbackQuery);
                }
                
                // Подтверждаем получение callback
                await this.bot.answerCallbackQuery(callbackQuery.id);
                
            } catch (error) {
                console.error('Ошибка обработки callback:', error);
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
            
            const chatId = msg.chat.id;
            const userId = msg.from.id;
            const text = msg.text || '';
            
            // Получаем сессию пользователя
            const session = this.storage.getSession(userId);
            if (!session) {
                // Если нет сессии, показываем меню
                const userName = msg.from.first_name || 'Пользователь';
                this.bot.sendMessage(chatId, Messages.start(userName, CONFIG.VERSION), {
                    parse_mode: 'HTML',
                    ...Keyboards.mainMenu
                });
                return;
            }
            
            // Обрабатываем в зависимости от типа сессии
            if (session.type === 'join') {
                await this.handleJoinMessage(chatId, userId, text, session);
            } else if (session.type === 'report') {
                await this.handleReportMessage(chatId, userId, text, session);
            }
        });
    }
    
    setupWebServer() {
        // Базовый эндпоинт для Railway health checks
        this.app.get('/', (req, res) => {
            res.json({
                status: 'online',
                bot: 'Bakelite Bot',
                version: CONFIG.VERSION,
                uptime: process.uptime()
            });
        });
        
        // Запускаем сервер на порту, который предоставляет Railway
        const PORT = process.env.PORT || 3000;
        this.app.listen(PORT, () => {
            console.log(`🌐 Веб-сервер запущен на порту ${PORT}`);
        });
    }
    
    // ============================================
    // ОБРАБОТЧИКИ КОМАНД
    // ============================================
    
    async handleJoinCommand(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const userName = msg.from.first_name || 'Пользователь';
        const userUsername = msg.from.username || '';
        
        console.log(`/join от ${userName} (${userId})`);
        
        // Проверяем, не является ли уже защитником
        const existingDefender = this.storage.getDefenderByUserId(userId);
        if (existingDefender) {
            this.bot.sendMessage(chatId,
                `🛡️ <b>Вы уже защитник!</b>\n\n` +
                `Псевдоним: ${existingDefender.pseudonym}\n` +
                `Регион: ${existingDefender.region}\n` +
                `Специальность: ${existingDefender.specialty}\n\n` +
                `Вы можете помогать людям в вашем регионе.`,
                { parse_mode: 'HTML', ...Keyboards.backToMenu }
            );
            return;
        }
        
        // Проверяем, не подавал ли уже заявку
        const pendingApps = this.storage.getPendingApplications();
        const existingApp = pendingApps.find(app => app.userId === userId.toString());
        if (existingApp) {
            this.bot.sendMessage(chatId,
                `🔄 <b>Заявка уже на рассмотрении</b>\n\n` +
                `Ваша заявка #${existingApp.id} ожидает проверки администратором.\n` +
                `Обычно это занимает 1-3 дня.`,
                { parse_mode: 'HTML', ...Keyboards.backToMenu }
            );
            return;
        }
        
        // Создаем сессию
        this.storage.createSession(userId, 'join', {
            userName: userName,
            userUsername: userUsername,
            step: 1
        });
        
        // Отправляем первый шаг
        this.bot.sendMessage(chatId, Messages.joinStep1(), {
            parse_mode: 'HTML',
            ...Keyboards.regionsMenu(1, 3)
        });
    }
    
    async handleReportCommand(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const userName = msg.from.first_name || 'Пользователь';
        const userUsername = msg.from.username || '';
        
        console.log(`/report от ${userName} (${userId})`);
        
        // Создаем сессию
        this.storage.createSession(userId, 'report', {
            userName: userName,
            userUsername: userUsername,
            step: 1
        });
        
        // Отправляем первый шаг
        this.bot.sendMessage(chatId, Messages.reportStep1(), {
            parse_mode: 'HTML',
            ...Keyboards.regionsMenu(1, 4)
        });
    }
    
    async handleStatusCommand(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        console.log(`/status от ${userId}`);
        
        // Получаем заявки пользователя
        const userReports = this.storage.getUserReports(userId);
        
        if (userReports.length === 0) {
            this.bot.sendMessage(chatId, Messages.statusEmpty(), {
                parse_mode: 'HTML',
                ...Keyboards.backToMenu
            });
            return;
        }
        
        // Группируем по статусам
        const pendingCount = userReports.filter(r => r.status === 'pending').length;
        const inProgressCount = userReports.filter(r => r.status === 'in_progress').length;
        const completedCount = userReports.filter(r => r.status === 'completed').length;
        const rejectedCount = userReports.filter(r => r.status === 'rejected').length;
        
        let statusMessage = `
📊 <b>СТАТУС ВАШИХ ЗАЯВОК</b>

<b>Статистика:</b>
🟡 Ожидают: ${pendingCount}
🟠 В работе: ${inProgressCount}
🟢 Завершены: ${completedCount}
🔴 Отклонены: ${rejectedCount}

<b>Всего заявок:</b> ${userReports.length}

<b>Последние заявки:</b>
        `;
        
        // Показываем последние 5 заявок
        const recentReports = userReports
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 5);
        
        recentReports.forEach((report, index) => {
            statusMessage += `
${index + 1}. <b>Заявка #${report.id}</b>
   Тип: ${report.crimeType}
   Статус: ${getStatusText(report.status)}
   Дата: ${formatDate(report.createdAt)}
   ${report.assignedDefender ? `Защитник: ${report.assignedDefender}\n` : ''}
            `;
        });
        
        statusMessage += `
<i>Защитник свяжется с вами когда возьмется за работу или завершит её.</i>
        `;
        
        this.bot.sendMessage(chatId, statusMessage, {
            parse_mode: 'HTML',
            ...Keyboards.backToMenu
        });
    }
    
    // ============================================
    // ОБРАБОТЧИКИ CALLBACK
    // ============================================
    
    async handleMenuCallback(callbackQuery) {
        const chatId = callbackQuery.message.chat.id;
        const userId = callbackQuery.from.id;
        const data = callbackQuery.data;
        const userName = callbackQuery.from.first_name || 'Пользователь';
        
        switch (data) {
            case 'menu_join':
                await this.handleJoinCommand({
                    chat: { id: chatId },
                    from: { id: userId, first_name: userName }
                });
                break;
                
            case 'menu_report':
                await this.handleReportCommand({
                    chat: { id: chatId },
                    from: { id: userId, first_name: userName }
                });
                break;
                
            case 'menu_status':
                await this.handleStatusCommand({
                    chat: { id: chatId },
                    from: { id: userId }
                });
                break;
                
            case 'menu_help':
                this.bot.sendMessage(chatId, Messages.help(), {
                    parse_mode: 'HTML',
                    ...Keyboards.backToMenu
                });
                break;
        }
    }
    
    async handleRegionCallback(callbackQuery) {
        const chatId = callbackQuery.message.chat.id;
        const userId = callbackQuery.from.id;
        const data = callbackQuery.data;
        
        const session = this.storage.getSession(userId);
        if (!session) return;
        
        // Определяем регион
        let region;
        switch (data) {
            case 'region_ru':
                region = 'Россия';
                break;
            case 'region_ua':
                region = 'Украина';
                break;
            case 'region_kz':
                region = 'Казахстан';
                break;
            case 'region_other':
                region = 'Другое';
                break;
            default:
                region = 'Не указано';
        }
        
        // Сохраняем регион в сессии
        session.data.region = region;
        session.step = 2;
        this.storage.updateSession(userId, session);
        
        // Отправляем следующий шаг в зависимости от типа сессии
        if (session.type === 'join') {
            this.bot.editMessageText(Messages.joinStep2(), {
                chat_id: chatId,
                message_id: callbackQuery.message.message_id,
                parse_mode: 'HTML'
            });
        } else if (session.type === 'report') {
            this.bot.editMessageText(Messages.reportStep2(), {
                chat_id: chatId,
                message_id: callbackQuery.message.message_id,
                parse_mode: 'HTML',
                ...Keyboards.crimeTypesMenu(2, 4)
            });
        }
    }
    
    async handleCrimeCallback(callbackQuery) {
        const chatId = callbackQuery.message.chat.id;
        const userId = callbackQuery.from.id;
        const data = callbackQuery.data;
        
        const session = this.storage.getSession(userId);
        if (!session || session.type !== 'report') return;
        
        // Определяем тип преступления
        let crimeType;
        switch (data) {
            case 'crime_extortion':
                crimeType = 'Вымогательство';
                break;
            case 'crime_bullying':
                crimeType = 'Кибербуллинг';
                break;
            case 'crime_fraud':
                crimeType = 'Мошенничество';
                break;
            case 'crime_other':
                crimeType = 'Другое';
                break;
            default:
                crimeType = 'Не указано';
        }
        
        // Сохраняем тип преступления в сессии
        session.data.crimeType = crimeType;
        session.step = 3;
        this.storage.updateSession(userId, session);
        
        // Отправляем следующий шаг
        this.bot.editMessageText(Messages.reportStep3(), {
            chat_id: chatId,
            message_id: callbackQuery.message.message_id,
            parse_mode: 'HTML'
        });
    }
    
    async handleConfirmationCallback(callbackQuery) {
        const chatId = callbackQuery.message.chat.id;
        const userId = callbackQuery.from.id;
        const data = callbackQuery.data;
        
        const session = this.storage.getSession(userId);
        if (!session) return;
        
        if (data === 'confirm_yes') {
            if (session.type === 'join') {
                // Создаем заявку защитника
                const application = this.storage.createDefenderApplication({
                    userId: userId.toString(),
                    userName: session.data.userName,
                    userUsername: session.data.userUsername,
                    region: session.data.region,
                    pseudonym: session.data.pseudonym,
                    specialty: session.data.specialty
                });
                
                // Уведомляем пользователя
                this.bot.editMessageText(Messages.joinSubmitted(application.id), {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id,
                    parse_mode: 'HTML',
                    ...Keyboards.backToMenu
                });
                
                // Уведомляем админа
                await this.notifyAdminAboutDefenderApplication(application);
                
                // Удаляем сессию
                this.storage.deleteSession(userId);
                
            } else if (session.type === 'report') {
                // Создаем заявку о помощи
                const report = this.storage.createReport({
                    userId: userId.toString(),
                    userName: session.data.userName,
                    userUsername: session.data.userUsername,
                    region: session.data.region,
                    crimeType: session.data.crimeType,
                    description: session.data.description
                });
                
                // Уведомляем пользователя
                this.bot.editMessageText(Messages.reportSubmitted(report.id), {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id,
                    parse_mode: 'HTML',
                    ...Keyboards.backToMenu
                });
                
                // Уведомляем защитников
                await this.notifyDefendersAboutReport(report);
                
                // Удаляем сессию
                this.storage.deleteSession(userId);
            }
            
        } else if (data === 'confirm_no') {
            // Отмена
            const userName = callbackQuery.from.first_name || 'Пользователь';
            
            this.bot.editMessageText(`❌ Действие отменено.\n\n${Messages.start(userName, CONFIG.VERSION)}`, {
                chat_id: chatId,
                message_id: callbackQuery.message.message_id,
                parse_mode: 'HTML',
                ...Keyboards.mainMenu
            });
            
            // Удаляем сессию
            this.storage.deleteSession(userId);
        }
    }
    
    async handleNavigationCallback(callbackQuery) {
        const chatId = callbackQuery.message.chat.id;
        const userId = callbackQuery.from.id;
        const data = callbackQuery.data;
        
        const session = this.storage.getSession(userId);
        if (!session) return;
        
        if (data === 'nav_menu') {
            // Возврат в меню
            const userName = callbackQuery.from.first_name || 'Пользователь';
            
            this.bot.editMessageText(Messages.start(userName, CONFIG.VERSION), {
                chat_id: chatId,
                message_id: callbackQuery.message.message_id,
                parse_mode: 'HTML',
                ...Keyboards.mainMenu
            });
            
            // Удаляем сессию
            this.storage.deleteSession(userId);
            
        } else if (data === 'nav_back') {
            // Назад
            session.step = Math.max(1, session.step - 1);
            this.storage.updateSession(userId, session);
            
            // Показываем предыдущий шаг
            await this.showCurrentStep(chatId, userId, callbackQuery.message.message_id, session);
            
        } else if (data === 'nav_next') {
            // Вперед (только если текущий шаг заполнен)
            const canProceed = await this.validateCurrentStep(session);
            if (canProceed) {
                session.step += 1;
                this.storage.updateSession(userId, session);
                
                // Показываем следующий шаг
                await this.showCurrentStep(chatId, userId, callbackQuery.message.message_id, session);
            } else {
                // Показываем ошибку
                await this.bot.answerCallbackQuery(callbackQuery.id, {
                    text: '⚠️ Заполните текущее поле',
                    show_alert: true
                });
            }
        }
    }
    
    async handleDefenderActionCallback(callbackQuery) {
        const chatId = callbackQuery.message.chat.id;
        const userId = callbackQuery.from.id;
        const data = callbackQuery.data;
        
        // Проверяем, является ли пользователь защитником
        const defender = this.storage.getDefenderByUserId(userId);
        if (!defender) {
            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: '❌ Вы не являетесь защитником',
                show_alert: true
            });
            return;
        }
        
        const parts = data.split('_');
        const action = parts[1]; // take или decline
        const reportId = parts[2];
        
        const report = this.storage.getReport(reportId);
        if (!report) {
            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: '❌ Заявка не найдена',
                show_alert: true
            });
            return;
        }
        
        if (action === 'take') {
            // Защитник берет заявку
            this.storage.updateReport(reportId, {
                status: 'in_progress',
                assignedDefender: defender.pseudonym,
                updatedAt: new Date().toISOString()
            });
            
            // Уведомляем жертву
            await this.notifyVictimAboutDefender(report, defender);
            
            // Обновляем сообщение
            this.bot.editMessageText(
                `✅ <b>Вы взяли заявку #${reportId}</b>\n\n` +
                `Свяжитесь с пользователем и помогите решить проблему.\n` +
                `Когда работа будет завершена, уведомите пользователя в личных сообщениях.`,
                {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id,
                    parse_mode: 'HTML'
                }
            );
            
            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: '✅ Заявка принята! Свяжитесь с пользователем.',
                show_alert: true
            });
            
        } else if (action === 'decline') {
            // Защитник отказывается от заявки
            this.bot.editMessageText(
                `❌ <b>Вы отказались от заявки #${reportId}</b>\n\n` +
                `Заявка будет предложена другим защитникам.`,
                {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id,
                    parse_mode: 'HTML'
                }
            );
            
            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: 'Заявка отклонена',
                show_alert: false
            });
        }
    }
    
    async handleAdminActionCallback(callbackQuery) {
        const chatId = callbackQuery.message.chat.id;
        const userId = callbackQuery.from.id;
        const data = callbackQuery.data;
        
        // Проверяем, является ли пользователь админом
        if (userId.toString() !== CONFIG.ADMIN_ID) {
            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: '❌ Только администратор',
                show_alert: true
            });
            return;
        }
        
        const parts = data.split('_');
        const action = parts[1]; // approve или reject
        const appId = parts[2];
        
        if (action === 'approve') {
            // Одобряем заявку защитника
            const defender = this.storage.approveDefenderApplication(appId);
            if (defender) {
                // Уведомляем нового защитника
                await this.notifyDefenderAboutApproval(defender);
                
                // Обновляем сообщение
                this.bot.editMessageText(
                    `✅ <b>Заявка защитника одобрена!</b>\n\n` +
                    `Псевдоним: ${defender.pseudonym}\n` +
                    `Регион: ${defender.region}\n` +
                    `Специальность: ${defender.specialty}`,
                    {
                        chat_id: chatId,
                        message_id: callbackQuery.message.message_id,
                        parse_mode: 'HTML'
                    }
                );
                
                await this.bot.answerCallbackQuery(callbackQuery.id, {
                    text: '✅ Защитник одобрен',
                    show_alert: false
                });
            }
            
        } else if (action === 'reject') {
            // Отклоняем заявку защитника
            const success = this.storage.rejectDefenderApplication(appId);
            if (success) {
                // Обновляем сообщение
                this.bot.editMessageText(
                    `❌ <b>Заявка защитника отклонена</b>`,
                    {
                        chat_id: chatId,
                        message_id: callbackQuery.message.message_id,
                        parse_mode: 'HTML'
                    }
                );
                
                await this.bot.answerCallbackQuery(callbackQuery.id, {
                    text: '❌ Заявка отклонена',
                    show_alert: false
                });
            }
        }
    }
    
    // ============================================
    ## ПРОДОЛЖЕНИЕ - ОБРАБОТЧИКИ СООБЩЕНИЙ

    async handleJoinMessage(chatId, userId, text, session) {
        if (session.step === 2) {
            // Шаг 2: Псевдоним
            if (text.length < 2 || text.length > 50) {
                this.bot.sendMessage(chatId,
                    '❌ Псевдоним должен быть от 2 до 50 символов.\n\nПопробуйте еще раз:'
                );
                return;
            }
            
            session.data.pseudonym = text;
            session.step = 3;
            this.storage.updateSession(userId, session);
            
            this.bot.sendMessage(chatId, Messages.joinStep3(text), {
                parse_mode: 'HTML'
            });
            
        } else if (session.step === 3) {
            // Шаг 3: Специальность
            if (text.length < 10) {
                this.bot.sendMessage(chatId,
                    '❌ Пожалуйста, опишите вашу специальность подробнее (минимум 10 символов).\n\nПопробуйте еще раз:'
                );
                return;
            }
            
            session.data.specialty = text;
            session.step = 4; // Шаг подтверждения
            this.storage.updateSession(userId, session);
            
            this.bot.sendMessage(chatId, Messages.joinConfirmation(session.data), {
                parse_mode: 'HTML',
                ...Keyboards.confirmationMenu
            });
        }
    }
    
    async handleReportMessage(chatId, userId, text, session) {
        if (session.step === 3) {
            // Шаг 3: Описание проблемы
            if (text.length < 50) {
                this.bot.sendMessage(chatId,
                    '❌ Пожалуйста, опишите проблему подробнее (минимум 50 символов).\n\nЧто произошло, когда, какие есть доказательства?'
                );
                return;
            }
            
            session.data.description = text;
            session.step = 4; // Шаг подтверждения
            this.storage.updateSession(userId, session);
            
            this.bot.sendMessage(chatId, Messages.reportConfirmation(session.data), {
                parse_mode: 'HTML',
                ...Keyboards.confirmationMenu
            });
            
        } else if (session.step === 2 && session.data.crimeType === 'Другое') {
            // Если выбрано "Другое" на шаге 2
            if (text.length < 5) {
                this.bot.sendMessage(chatId,
                    '❌ Пожалуйста, укажите вид киберпреступности (минимум 5 символов).'
                );
                return;
            }
            
            session.data.crimeType = text;
            session.step = 3;
            this.storage.updateSession(userId, session);
            
            this.bot.sendMessage(chatId, Messages.reportStep3(), {
                parse_mode: 'HTML'
            });
            
        } else if (session.step === 1 && session.data.region === 'Другое') {
            // Если выбрано "Другое" на шаге 1
            if (text.length < 3) {
                this.bot.sendMessage(chatId,
                    '❌ Пожалуйста, укажите страну (минимум 3 символа).'
                );
                return;
            }
            
            session.data.region = text;
            session.step = 2;
            this.storage.updateSession(userId, session);
            
            this.bot.sendMessage(chatId, Messages.reportStep2(), {
                parse_mode: 'HTML',
                ...Keyboards.crimeTypesMenu(2, 4)
            });
        }
    }
    
    // ============================================
    // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
    // ============================================
    
    async showCurrentStep(chatId, userId, messageId, session) {
        if (session.type === 'join') {
            switch (session.step) {
                case 1:
                    this.bot.editMessageText(Messages.joinStep1(), {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'HTML',
                        ...Keyboards.regionsMenu(1, 3)
                    });
                    break;
                case 2:
                    this.bot.editMessageText(Messages.joinStep2(), {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'HTML'
                    });
                    break;
                case 3:
                    this.bot.editMessageText(Messages.joinStep3(session.data.pseudonym || ''), {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'HTML'
                    });
                    break;
            }
        } else if (session.type === 'report') {
            switch (session.step) {
                case 1:
                    this.bot.editMessageText(Messages.reportStep1(), {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'HTML',
                        ...Keyboards.regionsMenu(1, 4)
                    });
                    break;
                case 2:
                    this.bot.editMessageText(Messages.reportStep2(), {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'HTML',
                        ...Keyboards.crimeTypesMenu(2, 4)
                    });
                    break;
                case 3:
                    this.bot.editMessageText(Messages.reportStep3(), {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'HTML'
                    });
                    break;
            }
        }
    }
    
    async validateCurrentStep(session) {
        if (session.type === 'join') {
            switch (session.step) {
                case 2:
                    return !!session.data.pseudonym && session.data.pseudonym.length >= 2;
                case 3:
                    return !!session.data.specialty && session.data.specialty.length >= 10;
            }
        } else if (session.type === 'report') {
            switch (session.step) {
                case 3:
                    return !!session.data.description && session.data.description.length >= 50;
            }
        }
        return true;
    }
    
    // ============================================
    // УВЕДОМЛЕНИЯ
    // ============================================
    
    async notifyAdminAboutDefenderApplication(application) {
        if (!CONFIG.ADMIN_ID) {
            console.warn('ADMIN_ID не установлен, уведомления админу не отправляются');
            return;
        }
        
        try {
            await this.bot.sendMessage(CONFIG.ADMIN_ID, Messages.adminDefenderNotification(application), {
                parse_mode: 'HTML',
                ...Keyboards.adminActionMenu(application.id)
            });
            console.log(`Уведомление отправлено админу о заявке защитника #${application.id}`);
        } catch (error) {
            console.error('Ошибка отправки уведомления админу:', error);
        }
    }
    
    async notifyDefendersAboutReport(report) {
        try {
            // Получаем защитников региона
            const defenders = this.storage.getDefendersByRegion(report.region);
            
            if (defenders.length === 0) {
                console.log(`Нет защитников в регионе ${report.region} для заявки #${report.id}`);
                return;
            }
            
            console.log(`Отправляем уведомление ${defenders.length} защитникам о заявке #${report.id}`);
            
            // Отправляем уведомление каждому защитнику
            for (const defender of defenders) {
                try {
                    await this.bot.sendMessage(defender.userId, Messages.defenderNotification(report), {
                        parse_mode: 'HTML',
                        ...Keyboards.defenderActionMenu(report.id)
                    });
                } catch (error) {
                    // Если защитник заблокировал бота, пропускаем
                    if (error.response && error.response.statusCode === 403) {
                        console.log(`Защитник ${defender.userId} заблокировал бота`);
                        continue;
                    }
                    console.error(`Ошибка отправки защитнику ${defender.userId}:`, error.message);
                }
                
                // Небольшая задержка между сообщениями
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
        } catch (error) {
            console.error('Ошибка уведомления защитников:', error);
        }
    }
    
    async notifyVictimAboutDefender(report, defender) {
        try {
            await this.bot.sendMessage(report.userId,
                `🛡️ <b>Защитник назначен на вашу заявку!</b>\n\n` +
                `Ваша заявка #${report.id} взята в работу защитником.\n\n` +
                `<b>Защитник:</b> ${defender.pseudonym}\n` +
                `<b>Специальность:</b> ${defender.specialty}\n\n` +
                `Защитник свяжется с вами в ближайшее время для оказания помощи.`,
                { parse_mode: 'HTML' }
            );
            console.log(`Уведомление отправлено жертве ${report.userId} о защитнике`);
        } catch (error) {
            console.error('Ошибка отправки уведомления жертве:', error);
        }
    }
    
    async notifyDefenderAboutApproval(defender) {
        try {
            await this.bot.sendMessage(defender.userId,
                `🎉 <b>Поздравляем! Вы стали защитником!</b>\n\n` +
                `Ваша заявка на защитника была одобрена администратором.\n\n` +
                `<b>Ваши данные:</b>\n` +
                `• Псевдоним: ${defender.pseudonym}\n` +
                `• Регион: ${defender.region}\n` +
                `• Специальность: ${defender.specialty}\n\n` +
                `Теперь вы будете получать уведомления о новых заявках в вашем регионе.\n` +
                `Спасибо за готовность помогать людям! 🛡️`,
                { parse_mode: 'HTML' }
            );
            console.log(`Уведомление отправлено новому защитнику ${defender.userId}`);
        } catch (error) {
            console.error('Ошибка отправки уведомления защитнику:', error);
        }
    }
    
    // ============================================
    // ЗАПУСК БОТА
    // ============================================
    
    start() {
        console.log('🚀 Bakelite Bot запущен!');
        console.log('🤖 Версия:', CONFIG.VERSION);
        console.log('👑 Админ ID:', CONFIG.ADMIN_ID || 'не установлен');
        console.log('📁 Данные хранятся в:', CONFIG.DATA_DIR);
        console.log('=======================================');
    }
}

// ============================================
// ЗАПУСК СИСТЕМЫ
// ============================================

// Проверка обязательных переменных
if (!CONFIG.BOT_TOKEN) {
    console.error('❌ ОШИБКА: BOT_TOKEN не установлен');
    console.error('Получите у @BotFather и установите в переменные окружения:');
    console.error('BOT_TOKEN=ваш_токен_бота');
    process.exit(1);
}

if (!CONFIG.ADMIN_ID) {
    console.warn('⚠️  ВНИМАНИЕ: ADMIN_ID не установлен');
    console.warn('Уведомления админу не будут отправляться');
    console.warn('Узнайте ваш ID через @userinfobot и установите:');
    console.warn('ADMIN_ID=ваш_id_админа');
}

// Запускаем бота
const bot = new BakeliteBot();
bot.start();
