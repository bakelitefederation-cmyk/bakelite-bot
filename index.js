const { Telegraf, Scenes, session, Markup } = require('telegraf');
const mongoose = require('mongoose');
const http = require('http');

// --- КОНФИГУРАЦИЯ ---
const OWNER_ID = Number(process.env.ADMIN_CHAT_ID);
const MONGO_URI = process.env.MONGO_URI; 
const VERSION = "7.0.1-FIXED";

// --- БАЗА ДАННЫХ ---
mongoose.connect(MONGO_URI)
  .then(() => console.log('📦 База данных Federation подключена'))
  .catch(err => console.error('❌ Ошибка БД:', err));

const Worker = mongoose.model('Worker', {
    userId: { type: Number, unique: true },
    nick: String,
    spec: String,
    experience: String,
    regDate: { type: Date, default: Date.now }
});

const bot = new Telegraf(process.env.BOT_TOKEN);

// --- СЦЕНА РЕГИСТРАЦИИ (ЭТАПЫ) ---
const joinWizard = new Scenes.WizardScene('JOIN_WIZARD',
    (ctx) => {
        ctx.wizard.state.data = {};
        ctx.replyWithHTML('🤝 <b>Шаг 1: Имя в системе</b>\nКак нам к тебе обращаться? Напиши свой рабочий ник:', 
            Markup.inlineKeyboard([Markup.button.callback('↩️ Отмена', 'exit')]));
        return ctx.wizard.next();
    },
    (ctx) => {
        if (!ctx.message?.text) return ctx.reply('Жду твой ник текстом...');
        ctx.wizard.state.data.nick = ctx.message.text;
        ctx.replyWithHTML('🛠 <b>Шаг 2: Твоя специализация</b>\nВ чем ты силен? (OSINT, IT, Право, Психология...):');
        return ctx.wizard.next();
    },
    (ctx) => {
        if (!ctx.message?.text) return ctx.reply('Напиши свою специализацию...');
        ctx.wizard.state.data.spec = ctx.message.text;
        ctx.replyWithHTML('📖 <b>Шаг 3: Твой опыт</b>\nРасскажи немного о себе. Почему ты хочешь быть с нами?');
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!ctx.message?.text) return ctx.reply('Расскажи об опыте текстом...');
        const d = ctx.wizard.state.data;
        d.exp = ctx.message.text;
        await ctx.replyWithHTML(`<b>Проверь анкету:</b>\n\n<b>Ник:</b> ${d.nick}\n<b>Спец:</b> ${d.spec}\n<b>Опыт:</b> ${d.exp}`, 
            Markup.inlineKeyboard([
                [Markup.button.callback('✅ Отправить', 'send')],
                [Markup.button.callback('↩️ Отмена', 'exit')]
            ]));
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx.callbackQuery?.data === 'send') {
            const d = ctx.wizard.state.data;
            await bot.telegram.sendMessage(OWNER_ID, `🔥 <b>НОВАЯ ЗАЯВКА</b>\nID: <code>${ctx.from.id}</code>\nНик: ${d.nick}\nСпец: ${d.spec}\nОпыт: ${d.exp}`,
                { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('➕ Принять', `adm_ok_${ctx.from.id}_${d.nick}_${d.spec}`)]]) });
            await ctx.reply('Твоя анкета на столе у Создателя. Ожидай решения. ✨');
        }
        return ctx.scene.leave();
    }
);

// --- СЦЕНА ПОМОЩИ (ЭМПАТИЯ) ---
const reportWizard = new Scenes.WizardScene('REPORT_WIZARD',
    (ctx) => {
        ctx.reply('Мы тебя слышим. Выбери регион, чтобы мы знали, кто ближе всего к тебе:', Markup.inlineKeyboard([
            [Markup.button.callback('🇷🇺 Россия', 'r_RU'), Markup.button.callback('🇰🇿 Казахстан', 'r_KZ')],
            [Markup.button.callback('🇺🇦 Украина', 'r_UA'), Markup.button.callback('🌍 Другое', 'r_OTHER')],
            [Markup.button.callback('↩️ Отмена', 'exit')]
        ]));
        return ctx.wizard.next();
    },
    (ctx) => {
        if (!ctx.callbackQuery) return;
        ctx.wizard.state.region = ctx.callbackQuery.data;
        ctx.reply('Расскажи подробно, что случилось? Не волнуйся, мы постараемся помочь.');
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!ctx.message?.text) return ctx.reply('Опиши ситуацию текстом...');
        const tid = Math.floor(1000 + Math.random() * 9000);
        ctx.wizard.state.desc = ctx.message.text;
        await ctx.replyWithHTML(`Сигнал #<code>${tid}</code> готов. Отправляем защитникам?`, 
            Markup.inlineKeyboard([[Markup.button.callback('🚀 Да, отправляйте', `sos_${tid}`)], [Markup.button.callback('↩️ Отмена', 'exit')]]));
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx.callbackQuery?.data.startsWith('sos_')) {
            const ws = await Worker.find();
            const list = [OWNER_ID, ...ws.map(w => w.userId)];
            list.forEach(id => {
                bot.telegram.sendMessage(id, `⚠️ <b>ТРЕВОГА</b>\nРегион: ${ctx.wizard.state.region}\nСуть: ${ctx.wizard.state.desc}`,
                { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🛡️ Взять кейс', `w_take_${ctx.from.id}`)]]) }).catch(()=>{});
            });
            await ctx.reply('Твой голос услышан. Защитники получили уведомление. Сохраняй спокойствие.');
        }
        return ctx.scene.leave();
    }
);

const stage = new Scenes.Stage([joinWizard, reportWizard]);
stage.action('exit', (ctx) => ctx.scene.leave() || ctx.reply('Возвращаюсь в меню.'));

bot.use(session());
bot.use(stage.middleware());

// --- ОБРАБОТЧИКИ И АДМИНКА ---
bot.start((ctx) => ctx.replyWithHTML(`🛡️ <b>Bakelite Federation</b>\n💠 <code>v${VERSION}</code>\n\nМы здесь, чтобы защищать. Ты с нами или тебе нужна помощь?`, 
    Markup.inlineKeyboard([
        [Markup.button.callback('🛡️ Стать защитником', 'go_join')],
        [Markup.button.callback('🆘 Помощь', 'go_report')],
        ...(ctx.from.id === OWNER_ID ? [[Markup.button.callback('👑 Админ-Панель', 'go_admin')]] : [])
    ])));

bot.action('go_join', (ctx) => ctx.scene.enter('JOIN_WIZARD'));
bot.action('go_report', (ctx) => ctx.scene.enter('REPORT_WIZARD'));

bot.action('go_admin', async (ctx) => {
    if (ctx.from.id !== OWNER_ID) return;
    const ws = await Worker.find();
    let txt = `<b>👑 ЦЕНТР УПРАВЛЕНИЯ</b>\nЗащитников: ${ws.length}\n\n`;
    ws.forEach((w, i) => txt += `${i+1}. <code>${w.userId}</code> | ${w.nick}\n`);
    await ctx.replyWithHTML(txt || "База пуста.");
});

bot.action(/^adm_ok_(\d+)_(.+)_(.+)$/, async (ctx) => {
    if (ctx.from.id !== OWNER_ID) return;
    const [_, uid, nick, spec] = ctx.match;
    await Worker.findOneAndUpdate({ userId: Number(uid) }, { nick, spec }, { upsert: true });
    await bot.telegram.sendMessage(uid, '✨ <b>Добро пожаловать в Федерацию.</b> Ты принят.');
    await ctx.editMessageText(`✅ Специалист <b>${nick}</b> добавлен.`);
});

bot.action(/^w_take_(\d+)$/, async (ctx) => {
    const isW = await Worker.exists({ userId: ctx.from.id }) || ctx.from.id === OWNER_ID;
    if (!isW) return ctx.answerCbQuery('Доступ закрыт.');
    await bot.telegram.sendMessage(ctx.match[1], `🛡️ <b>На связи защитник.</b> Твой кейс взят в работу специалистом @${ctx.from.username}.`);
    await ctx.editMessageText('✅ Ты взял кейс. Действуй.');
});

http.createServer((req, res) => { res.writeHead(200); res.end('OK'); }).listen(process.env.PORT || 3000);
bot.launch();
