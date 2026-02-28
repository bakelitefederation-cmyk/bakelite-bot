const http = require('http');
const { Telegraf, Scenes, session, Markup } = require('telegraf');

// Health Check для стабильности на хостинге
http.createServer((req, res) => { res.writeHead(200); res.end('Federation Heartbeat: OK'); }).listen(process.env.PORT || 3000);

const bot = new Telegraf(process.env.BOT_TOKEN);
const OWNER_ID = Number(process.env.ADMIN_CHAT_ID);

// RAM-storage по ТЗ (сбрасывается при перезагрузке)
const state = {
    workers: new Map(), 
    history: new Map()
};

// Проверка прав доступа
const isWorker = (id) => state.workers.has(id) || id === OWNER_ID;

const getMainMenu = (ctx) => {
    const btns = [
        [Markup.button.callback('🛡️ Стать защитником', 'go_join')],
        [Markup.button.callback('🆘 Мне нужна помощь', 'go_report')],
        [Markup.button.callback('📊 Статус заявок', 'go_status')]
    ];
    if (ctx.from.id === OWNER_ID) btns.push([Markup.button.callback('👑 Админ-Центр', 'go_admin')]);
    return Markup.inlineKeyboard(btns);
};

const cancelBtn = [Markup.button.callback('↩️ Вернуться назад', 'exit_scene')];

// --- СЦЕНА 1: РЕГИСТРАЦИЯ ЗАЩИТНИКА ---
const joinWizard = new Scenes.WizardScene(
    'JOIN_WIZARD',
    async (ctx) => {
        ctx.wizard.state.data = {};
        await ctx.answerCbQuery().catch(() => {});
        await ctx.editMessageText('👋 <b>Рады видеть тебя в наших рядах!</b>\nЧтобы Создатель мог рассмотреть твою кандидатуру, напиши свой рабочий <b>псевдоним</b>:', {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([cancelBtn])
        });
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!ctx.message?.text) return ctx.reply('Пожалуйста, напиши текстом.');
        ctx.wizard.state.data.nick = ctx.message.text;
        await ctx.replyWithHTML('Кратко расскажи о своей <b>специализации</b>? (Например: OSINT, пентест, юрист или поиск пропавших)');
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!ctx.message?.text) return ctx.reply('Жду твой ответ...');
        const d = ctx.wizard.state.data;
        d.spec = ctx.message.text;
        await ctx.replyWithHTML(`<b>Давай проверим анкету:</b>\n\n👤 Ник: ${d.nick}\n🛠 Специализация: ${d.spec}\n\nОтправляем на проверку?`, 
            Markup.inlineKeyboard([[Markup.button.callback('✅ Всё верно!', 'send_join')], cancelBtn])
        );
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx.callbackQuery?.data === 'send_join') {
            const d = ctx.wizard.state.data;
            await bot.telegram.sendMessage(OWNER_ID, 
                `👨‍✈️ <b>НОВЫЙ ЗАЩИТНИК ХОЧЕТ В КОМАНДУ</b>\n` +
                `От: @${ctx.from.username || 'n/a'}\n` +
                `ID: <code>${ctx.from.id}</code>\n` +
                `Ник: ${d.nick}\n` +
                `Спец: ${d.spec}`, 
                {
                    parse_mode: 'HTML',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('✅ Принять', `adm_ok_${ctx.from.id}_${d.nick}_${d.spec}`)],
                        [Markup.button.callback('❌ Отклонить', `adm_no_${ctx.from.id}`)]
                    ])
                }
            );
            await ctx.answerCbQuery();
            await ctx.reply('Твоя заявка улетела к Создателю. ✨ Постараемся рассмотреть её как можно скорее!');
        }
        return ctx.scene.leave();
    }
);

// --- СЦЕНА 2: ЗАПРОС ПОМОЩИ (С РЕГИОНАМИ) ---
const reportWizard = new Scenes.WizardScene(
    'REPORT_WIZARD',
    async (ctx) => {
        ctx.wizard.state.data = {};
        await ctx.answerCbQuery().catch(() => {});
        await ctx.editMessageText('<b>Мне жаль, что ты столкнулся с проблемой.</b>\nДавай попробуем разобраться. В каком ты <b>регионе</b>?', {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('🇷🇺 Россия', 'r_RU'), Markup.button.callback('🇰🇿 Казахстан', 'r_KZ')],
                [Markup.button.callback('🇺🇦 Украина', 'r_UA'), Markup.button.callback('🌍 Другое', 'r_OTHER')],
                cancelBtn
            ])
        });
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!ctx.callbackQuery) return;
        ctx.wizard.state.data.region = ctx.callbackQuery.data.replace('r_', '');
        await ctx.answerCbQuery();
        await ctx.reply('Понимаю. Теперь опиши <b>суть проблемы</b>. Чем больше деталей ты дашь, тем быстрее мы сможем помочь:');
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!ctx.message?.text) return ctx.reply('Пожалуйста, опиши ситуацию текстом.');
        ctx.wizard.state.data.desc = ctx.message.text;
        const tid = Math.floor(1000 + Math.random() * 9000);
        ctx.wizard.state.data.tid = tid;

        await ctx.replyWithHTML(`Сформирован запрос #<code>${tid}</code>.\n\nГотов передать сигнал нашим специалистам? Мы сделаем всё возможное.`, 
            Markup.inlineKeyboard([[Markup.button.callback('🚀 Да, помогите!', 'confirm_sos')], cancelBtn])
        );
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx.callbackQuery?.data === 'confirm_sos') {
            const d = ctx.wizard.state.data;
            const sosMsg = `⚠️ <b>SOS: ТРЕБУЕТСЯ ПОМОЩЬ #<code>${d.tid}</code></b>\n` +
                           `📍 Регион: ${d.region}\n` +
                           `👤 Жертва: @${ctx.from.username || 'скрыто'}\n` +
                           `🆔 ID: <code>${ctx.from.id}</code>\n` +
                           `📝 Проблема: ${d.desc}`;
            
            // Push-уведомление всем (Owner + Workers)
            const list = [OWNER_ID, ...Array.from(state.workers.keys())];
            list.forEach(id => {
                bot.telegram.sendMessage(id, sosMsg, {
                    parse_mode: 'HTML',
                    ...Markup.inlineKeyboard([[Markup.button.callback('🛡️ Взять кейс', `w_take_${ctx.from.id}_${d.tid}`)]])
                }).catch(() => {});
            });

            await ctx.answerCbQuery();
            await ctx.reply('Сигнал отправлен! 📡 Оставайся на связи, кто-то из наших защитников скоро напишет тебе.');
        }
        return ctx.scene.leave();
    }
);

// --- STAGE ---
const stage = new Scenes.Stage([joinWizard, reportWizard]);
stage.action('exit_scene', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.scene.leave();
    return ctx.reply('Без проблем, возвращаемся в меню.', getMainMenu(ctx));
});

bot.use(session());
bot.use(stage.middleware());

// --- ОБРАБОТЧИКИ ---

bot.start((ctx) => ctx.replyWithHTML(
    `👋 Привет! Я — координатор <b>Bakelite Federation</b>.\n\n` +
    `Мы объединяем людей для борьбы с цифровыми угрозами. Если ты в беде или хочешь защищать других — ты в правильном месте.\n\n` +
    `Твой ID: <code>${ctx.from.id}</code>`, 
    getMainMenu(ctx)
));

// Админ-панель (по ТЗ: проверка через OWNER_ID)
bot.action('go_admin', async (ctx) => {
    if (ctx.from.id !== OWNER_ID) return;
    let txt = `<b>👑 Центр управления</b>\nАктивных защитников: ${state.workers.size}\n\n`;
    state.workers.forEach((v, k) => {
        txt += `🔹 ${v.nick} (ID: <code>${k}</code>)\n`;
    });
    await ctx.replyWithHTML(txt || 'Команда пока пуста.');
});

// Логика кнопок
bot.action('go_join', (ctx) => ctx.scene.enter('JOIN_WIZARD'));
bot.action('go_report', (ctx) => ctx.scene.enter('REPORT_WIZARD'));

// Одобрение (Owner only)
bot.action(/^adm_ok_(\d+)_(.+)_(.+)$/, async (ctx) => {
    if (ctx.from.id !== OWNER_ID) return;
    const [_, uid, nick, spec] = ctx.match;
    state.workers.set(Number(uid), { nick, spec });
    await bot.telegram.sendMessage(uid, '✨ <b>Поздравляю!</b> Ты принят в Bakelite Federation. Теперь тебе будут приходить уведомления о тех, кому нужна помощь.', { parse_mode: 'HTML' });
    await ctx.editMessageText(`✅ Специалист <code>${nick}</code> добавлен в реестр.`);
});

// Взятие в работу
bot.action(/^w_take_(\d+)_(\d+)$/, async (ctx) => {
    if (!isWorker(ctx.from.id)) return ctx.answerCbQuery('Доступ запрещен.');
    const [_, vid, tid] = ctx.match;
    await bot.telegram.sendMessage(vid, `🛡️ <b>Хорошие новости!</b> Защитник взял твою заявку #<code>${tid}</code> в работу. Скоро он свяжется с тобой.`);
    await ctx.editMessageText(`✅ Вы взяли кейс #<code>${tid}</code>. Пожалуйста, помогите человеку.`);
    
    // Push уведомление админу (согласно ТЗ)
    if (ctx.from.id !== OWNER_ID) {
        await bot.telegram.sendMessage(OWNER_ID, `📑 <b>Кейс #<code>${tid}</code> в работе</b>\nЗащитник: @${ctx.from.username} (ID: <code>${ctx.from.id}</code>)`);
    }
});

bot.launch().then(() => console.log('Federation System: Online'));

// Graceful Stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
