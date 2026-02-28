const http = require('http');
const { Telegraf, Scenes, session, Markup } = require('telegraf');

// Health Check сервер
http.createServer((req, res) => { res.writeHead(200); res.end('Federation Core: Online'); }).listen(process.env.PORT || 3000);

const bot = new Telegraf(process.env.BOT_TOKEN);

// --- КОНСТАНТЫ И КОНФИГ ---
const OWNER_ID = Number(process.env.ADMIN_CHAT_ID);
const VERSION = "5.2.0-HUMANE";
const HOSTING = "Railway.app"; // или Render.com

// RAM-storage (объекты JavaScript по ТЗ)
const state = {
    workers: new Map(), 
    history: new Map()
};

const isWorker = (id) => state.workers.has(id) || id === OWNER_ID;

const getMainMenu = (ctx) => {
    const btns = [
        [Markup.button.callback('🛡️ Стать защитником', 'go_join')],
        [Markup.button.callback('🆘 Мне нужна помощь', 'go_report')],
        [Markup.button.callback('📊 Мои заявки', 'go_status')]
    ];
    if (ctx.from.id === OWNER_ID) btns.push([Markup.button.callback('👑 Админ-Центр', 'go_admin')]);
    return Markup.inlineKeyboard(btns);
};

const cancelBtn = [Markup.button.callback('↩️ Отмена', 'exit_scene')];

// --- СЦЕНА 1: ПОЛНАЯ АНКЕТА ЗАЩИТНИКА ---
const joinWizard = new Scenes.WizardScene(
    'JOIN_WIZARD',
    async (ctx) => {
        ctx.wizard.state.data = {};
        await ctx.answerCbQuery().catch(() => {});
        await ctx.editMessageText('👋 <b>Рады твоему желанию помочь!</b>\nДля начала, под каким <b>псевдонимом</b> тебя записать в реестр?', {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([cancelBtn])
        });
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!ctx.message?.text) return ctx.reply('Напиши свой ник текстом.');
        ctx.wizard.state.data.nick = ctx.message.text;
        await ctx.replyWithHTML('Какая твоя <b>основная специализация</b>?\n(Например: Этичный хакер, эксперт по OSINT или юрист)');
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!ctx.message?.text) return ctx.reply('Укажи свою специализацию.');
        ctx.wizard.state.data.spec = ctx.message.text;
        await ctx.replyWithHTML('Расскажи <b>подробнее о своих навыках</b>:\nКакие инструменты используешь и в чем твоя сильная сторона?');
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!ctx.message?.text) return ctx.reply('Нам важно знать детали твоего опыта.');
        const d = ctx.wizard.state.data;
        d.details = ctx.message.text;
        
        await ctx.replyWithHTML(
            `<b>Давай проверим анкету:</b>\n\n` +
            `👤 Ник: ${d.nick}\n` +
            `🛠 Спец: ${d.spec}\n` +
            `📝 Опыт: ${d.details}\n\n` +
            `Отправляем на проверку Создателю?`, 
            Markup.inlineKeyboard([[Markup.button.callback('✅ Всё верно, отправляй!', 'send_join')], cancelBtn])
        );
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx.callbackQuery?.data === 'send_join') {
            const d = ctx.wizard.state.data;
            // Push-уведомление Создателю
            await bot.telegram.sendMessage(OWNER_ID, 
                `👨‍✈️ <b>НОВАЯ АНКЕТА ЗАЩИТНИКА</b>\n` +
                `От: @${ctx.from.username || 'скрыто'}\n` +
                `🆔 ID: <code>${ctx.from.id}</code>\n` +
                `👤 Ник: ${d.nick}\n` +
                `🛠 Спец: ${d.spec}\n` +
                `📝 Опыт: ${d.details}`, 
                {
                    parse_mode: 'HTML',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('✅ Принять в семью', `adm_ok_${ctx.from.id}_${d.nick}_${d.spec}`)],
                        [Markup.button.callback('❌ Отклонить', `adm_no_${ctx.from.id}`)]
                    ])
                }
            );
            await ctx.answerCbQuery();
            await ctx.reply('Отлично! Твоя заявка уже на столе у Создателя. Скоро вернусь с ответом! ✨');
        }
        return ctx.scene.leave();
    }
);

// --- СЦЕНА 2: ЗАПРОС ПОМОЩИ (РЕГИОНЫ + СУТЬ) ---
const reportWizard = new Scenes.WizardScene(
    'REPORT_WIZARD',
    async (ctx) => {
        ctx.wizard.state.data = {};
        await ctx.answerCbQuery().catch(() => {});
        await ctx.editMessageText('<b>Мне очень жаль, что ты столкнулся с проблемой.</b>\nВ каком регионе это случилось?', {
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
        await ctx.reply('Пожалуйста, опиши ситуацию подробнее. Чем больше деталей, тем быстрее мы поможем:');
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!ctx.message?.text) return ctx.reply('Опиши проблему текстом.');
        ctx.wizard.state.data.desc = ctx.message.text;
        const tid = Math.floor(1000 + Math.random() * 9000);
        ctx.wizard.state.data.tid = tid;

        await ctx.replyWithHTML(`Я готов передать твой сигнал #<code>${tid}</code> команде защиты. Отправляем?`, 
            Markup.inlineKeyboard([[Markup.button.callback('🚀 Да, помогите!', 'confirm_sos')], cancelBtn])
        );
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx.callbackQuery?.data === 'confirm_sos') {
            const d = ctx.wizard.state.data;
            const sosMsg = `⚠️ <b>SOS: НУЖНА ПОМОЩЬ #<code>${d.tid}</code></b>\n` +
                           `📍 Регион: ${d.region}\n` +
                           `👤 Жертва: @${ctx.from.username || 'скрыто'}\n` +
                           `🆔 ID: <code>${ctx.from.id}</code>\n` +
                           `📝 Описание: ${d.desc}`;
            
            // Push-уведомление Команде
            const list = [OWNER_ID, ...Array.from(state.workers.keys())];
            list.forEach(id => {
                bot.telegram.sendMessage(id, sosMsg, {
                    parse_mode: 'HTML',
                    ...Markup.inlineKeyboard([[Markup.button.callback('🛡️ Взять в работу', `w_take_${ctx.from.id}_${d.tid}`)]])
                }).catch(() => {});
            });

            await ctx.answerCbQuery();
            await ctx.reply('Твой сигнал принят. Не паникуй, наши специалисты скоро свяжутся с тобой! 🙌');
        }
        return ctx.scene.leave();
    }
);

// --- STAGE ---
const stage = new Scenes.Stage([joinWizard, reportWizard]);
stage.action('exit_scene', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.scene.leave();
    return ctx.reply('Возвращаемся в главное меню:', getMainMenu(ctx));
});

bot.use(session());
bot.use(stage.middleware());

// --- ОБРАБОТЧИКИ ---

bot.start((ctx) => ctx.replyWithHTML(
    `👋 <b>Приветствую в Bakelite Federation!</b>\n\n` +
    `Я твой проводник в мире цифровой безопасности. Здесь мы помогаем друг другу и боремся с угрозами в сети.\n\n` +
    `Чем я могу быть полезен сегодня?\n\n` +
    `💠 <code>v${VERSION}</code> | ☁️ <code>${HOSTING}</code>`, 
    getMainMenu(ctx)
));

bot.action('go_join', (ctx) => ctx.scene.enter('JOIN_WIZARD'));
bot.action('go_report', (ctx) => ctx.scene.enter('REPORT_WIZARD'));

// Админ-логика
bot.action(/^adm_ok_(\d+)_(.+)_(.+)$/, async (ctx) => {
    if (ctx.from.id !== OWNER_ID) return;
    const [_, uid, nick, spec] = ctx.match;
    state.workers.set(Number(uid), { nick, spec });
    await bot.telegram.sendMessage(uid, '✨ <b>Добро пожаловать в команду!</b>\nТеперь ты будешь получать экстренные уведомления.', { parse_mode: 'HTML' });
    await ctx.editMessageText(`✅ Специалист <code>${nick}</code> одобрен.`);
});

// Работа с кейсом
bot.action(/^w_take_(\d+)_(\d+)$/, async (ctx) => {
    if (!isWorker(ctx.from.id)) return ctx.answerCbQuery('Доступ только для защитников.');
    const [_, vid, tid] = ctx.match;
    await bot.telegram.sendMessage(vid, `🛡️ <b>Хорошие новости!</b> Защитник @${ctx.from.username} взял твою заявку #<code>${tid}</code> в работу. Скоро всё наладится!`, { parse_mode: 'HTML' });
    await ctx.editMessageText(`✅ Вы взяли кейс #<code>${tid}</code>. Удачи!`);
    
    // Push уведомление Создателю
    if (ctx.from.id !== OWNER_ID) {
        await bot.telegram.sendMessage(OWNER_ID, `📑 <b>Кейс #<code>${tid}</code> взят в работу</b>\nЗащитник: @${ctx.from.username} (ID: <code>${ctx.from.id}</code>)`);
    }
});

bot.action('go_admin', async (ctx) => {
    if (ctx.from.id !== OWNER_ID) return;
    let list = `<b>👑 АДМИН-ПАНЕЛЬ</b>\nВсего защитников: ${state.workers.size}\n\n`;
    state.workers.forEach((v, k) => { list += `🔹 ${v.nick} [${v.spec}] | ID: <code>${k}</code>\n`; });
    await ctx.replyWithHTML(list || 'Пока в команде никого нет.');
});

bot.launch().then(() => console.log(`Federation v${VERSION} Online`));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
