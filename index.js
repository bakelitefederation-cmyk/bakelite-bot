const http = require('http');
const { Telegraf, Scenes, session, Markup } = require('telegraf');

// --- СЕРВЕР ДЛЯ HEALTH CHECK (RENDER/RAILWAY) ---
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Bakelite Federation: System Online');
}).listen(PORT);

// --- ИНИЦИАЛИЗАЦИЯ ---
const bot = new Telegraf(process.env.BOT_TOKEN);
const OWNER_ID = Number(process.env.ADMIN_CHAT_ID);

/**
 * ХРАНЕНИЕ ДАННЫХ (RAM-storage согласно документации)
 * Сбрасывается при перезагрузке сервера.
 */
const state = {
    workers: new Map(), // ID -> { nick, spec }
    activeTickets: new Map() // ID жертвы -> информация о кейсе
};

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---
const isWorker = (id) => state.workers.has(id) || id === OWNER_ID;

const getMainMenu = (ctx) => {
    const buttons = [
        [Markup.button.callback('🛡️ Стать защитником', 'go_join')],
        [Markup.button.callback('🆘 Запросить помощь', 'go_report')],
        [Markup.button.callback('ℹ️ Инфо', 'go_info')]
    ];
    if (ctx.from.id === OWNER_ID) {
        buttons.push([Markup.button.callback('👑 Админ-Панель', 'go_admin')]);
    }
    return Markup.inlineKeyboard(buttons);
};

// --- КНОПКИ УПРАВЛЕНИЯ ---
const cancelBtn = [Markup.button.callback('↩️ Отмена', 'exit_scene')];

// --- СЦЕНА 1: РЕГИСТРАЦИЯ ЗАЩИТНИКА (JOIN_WIZARD) ---
const joinWizard = new Scenes.WizardScene(
    'JOIN_WIZARD',
    async (ctx) => {
        ctx.wizard.state.data = {};
        await ctx.answerCbQuery().catch(() => {});
        await ctx.editMessageText('👋 <b>Регистрация защитника</b>\nВведите ваш рабочий псевдоним:', {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([cancelBtn])
        });
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!ctx.message?.text) return ctx.reply('Используйте текст.');
        ctx.wizard.state.data.nick = ctx.message.text;
        await ctx.replyWithHTML('Ваша <b>специализация</b> (OSINT, IT-безопасность, право):');
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!ctx.message?.text) return ctx.reply('Жду описание навыков...');
        const d = ctx.wizard.state.data;
        d.spec = ctx.message.text;
        
        await ctx.replyWithHTML(`<b>Проверьте данные:</b>\nНик: ${d.nick}\nСпец: ${d.spec}`, 
            Markup.inlineKeyboard([[Markup.button.callback('✅ Отправить Создателю', 'send_request')], cancelBtn])
        );
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx.callbackQuery?.data === 'send_request') {
            const d = ctx.wizard.state.data;
            // Push-уведомление Создателю
            await bot.telegram.sendMessage(OWNER_ID, 
                `🔔 <b>НОВАЯ ЗАЯВКА (Worker)</b>\n` +
                `От: @${ctx.from.username || 'n/a'}\n` +
                `ID: <code>${ctx.from.id}</code>\n` +
                `Ник: ${d.nick}\n` +
                `Спец: ${d.spec}`, 
                {
                    parse_mode: 'HTML',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('✅ Одобрить', `adm_approve_${ctx.from.id}_${d.nick}_${d.spec}`)],
                        [Markup.button.callback('❌ Отклонить', `adm_decline_${ctx.from.id}`)]
                    ])
                }
            );
            await ctx.answerCbQuery();
            await ctx.reply('Заявка на рассмотрении. Ожидайте уведомления.');
        }
        return ctx.scene.leave();
    }
);

// --- СЦЕНА 2: ЗАПРОС ПОМОЩИ (REPORT_WIZARD) ---
const reportWizard = new Scenes.WizardScene(
    'REPORT_WIZARD',
    async (ctx) => {
        ctx.wizard.state.data = {};
        await ctx.answerCbQuery().catch(() => {});
        await ctx.editMessageText('🆘 <b>Опишите вашу ситуацию</b>\nЧто произошло? (Кратко)', {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([cancelBtn])
        });
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!ctx.message?.text) return ctx.reply('Опишите проблему текстом.');
        ctx.wizard.state.data.desc = ctx.message.text;
        const ticketId = Math.floor(1000 + Math.random() * 9000);
        ctx.wizard.state.data.tid = ticketId;

        await ctx.replyWithHTML(`<b>Сформирован тикет #<code>${ticketId}</code></b>\nОтправляем команде защиты?`, 
            Markup.inlineKeyboard([[Markup.button.callback('🚀 Отправить сигнал', 'confirm_report')], cancelBtn])
        );
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx.callbackQuery?.data === 'confirm_report') {
            const d = ctx.wizard.state.data;
            const message = `⚠️ <b>SOS: НОВЫЙ КЕЙС #<code>${d.tid}</code></b>\n` +
                            `Жертва: @${ctx.from.username || 'скрыто'}\n` +
                            `ID: <code>${ctx.from.id}</code>\n` +
                            `Суть: ${d.desc}`;
            
            // Push всем воркерам и админу
            const targets = [OWNER_ID, ...Array.from(state.workers.keys())];
            targets.forEach(id => {
                bot.telegram.sendMessage(id, message, {
                    parse_mode: 'HTML',
                    ...Markup.inlineKeyboard([[Markup.button.callback('🛡️ Взять в работу', `take_${ctx.from.id}_${d.tid}`)]])
                }).catch(() => {});
            });

            await ctx.answerCbQuery();
            await ctx.reply('Ваш сигнал принят. Защитники получили уведомление.');
        }
        return ctx.scene.leave();
    }
);

// --- СИСТЕМА УПРАВЛЕНИЯ ДИАЛОГАМИ (STAGE) ---
const stage = new Scenes.Stage([joinWizard, reportWizard]);
stage.action('exit_scene', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.scene.leave();
    return ctx.reply('Действие отменено.', getMainMenu(ctx));
});

// ПОРЯДОК: сначала сессия, потом стейдж
bot.use(session());
bot.use(stage.middleware());

// --- ОБРАБОТЧИКИ КОМАНД ---

bot.start((ctx) => ctx.replyWithHTML(
    `🛡️ <b>Bakelite Federation</b>\nСистема координации борьбы с киберпреступностью.\n\nВаш ID: <code>${ctx.from.id}</code>`, 
    getMainMenu(ctx)
));

bot.action('go_join', (ctx) => ctx.scene.enter('JOIN_WIZARD'));
bot.action('go_report', (ctx) => ctx.scene.enter('REPORT_WIZARD'));

// --- ADMIN & WORKER ACTIONS ---

// Одобрение воркера (Только Owner)
bot.action(/^adm_approve_(\d+)_(.+)_(.+)$/, async (ctx) => {
    if (ctx.from.id !== OWNER_ID) return;
    const [_, uid, nick, spec] = ctx.match;
    state.workers.set(Number(uid), { nick, spec });
    
    await bot.telegram.sendMessage(uid, '✅ <b>Ваша анкета одобрена!</b>\nТеперь вы получаете уведомления о новых кейсах.', { parse_mode: 'HTML' });
    await ctx.editMessageText(`✅ Пользователь <code>${uid}</code> стал защитником.`);
    // Push уведомление админу (обновление статуса)
    console.log(`System: New worker added - ${nick}`);
});

// Взятие кейса в работу (Owner или Workers)
bot.action(/^take_(\d+)_(\d+)$/, async (ctx) => {
    if (!isWorker(ctx.from.id)) return ctx.answerCbQuery('Доступ только для защитников.');
    const [_, victimId, tid] = ctx.match;
    
    await bot.telegram.sendMessage(victimId, `🛡️ <b>Защитник взял ваш кейс #<code>${tid}</code> в работу.</b>\nОжидайте личного сообщения.`);
    await ctx.editMessageText(`✅ Вы взяли кейс #<code>${tid}</code>. Свяжитесь с жертвой.`);
    
    // Push уведомление Создателю о начале работы
    if (ctx.from.id !== OWNER_ID) {
        await bot.telegram.sendMessage(OWNER_ID, `📑 <b>Кейс #<code>${tid}</code> взят в работу</b>\nЗащитник: @${ctx.from.username} (ID: <code>${ctx.from.id}</code>)`);
    }
});

bot.action('go_admin', async (ctx) => {
    if (ctx.from.id !== OWNER_ID) return;
    let list = `<b>👑 Список защитников (RAM):</b>\n\n`;
    state.workers.forEach((v, k) => {
        list += `👤 ${v.nick} | ID: <code>${k}</code>\n`;
    });
    if (state.workers.size === 0) list += "Список пуст.";
    await ctx.replyWithHTML(list);
});

bot.action('go_info', (ctx) => ctx.replyWithHTML('Система координации Bakelite.\nВсе ID и тикеты кликабельны (<code>copy-paste</code>).'));

// --- ЗАПУСК ---
bot.launch().then(() => console.log('>>> Federation Bot Started'));

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
