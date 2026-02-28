const { Telegraf, Scenes, session, Markup } = require('telegraf');
const mongoose = require('mongoose');
const http = require('http');

// --- КОНФИГ И ГЛОБАЛКИ ---
const OWNER_ID = Number(process.env.ADMIN_CHAT_ID);
const MONGO_URI = process.env.MONGO_URI; 
const VERSION = "7.0.0-EMPATHY";

// --- БАЗА ДАННЫХ ---
mongoose.connect(MONGO_URI)
  .then(() => console.log('📦 Bakelite DB: Connected'))
  .catch(err => console.error('❌ DB Error:', err));

const Worker = mongoose.model('Worker', {
    userId: { type: Number, unique: true },
    nick: String,
    spec: String,
    experience: String,
    regDate: { type: Date, default: Date.now }
});

const bot = new Telegraf(process.env.BOT_TOKEN);

// --- ЭМПАТИЧНЫЕ ТЕКСТЫ ---
const TXT = {
    greet: "Приветствую. Ты попал в <b>Bakelite Federation</b>. Мы здесь, чтобы защищать тех, кто не может постоять за себя. Ты с нами или тебе нужна помощь?",
    help_info: "🆘 <b>Справка системы:</b>\n\n1. <b>Для пострадавших:</b> Нажми кнопку помощи, выбери регион и опиши ситуацию. Мы услышим тебя.\n2. <b>Для защитников:</b> Если ты профи в IT, праве или OSINT — подавай заявку. Мы строим щит вместе.\n3. <b>Безопасность:</b> Твои данные защищены в облаке BAKELITE.",
    wait_admin: "Твоя анкета уже на столе у Создателя. Пожалуйста, наберись терпения — мы проверяем каждого, чтобы сохранить безопасность системы.",
    no_access: "Извини, но этот раздел доступен только действующим защитникам Федерации. Подай заявку, если чувствуешь в себе силы."
};

// --- СЦЕНА 1: ЭТАПЫ РЕГИСТРАЦИИ (ЧЕЛОВЕЧНОСТЬ) ---
const joinWizard = new Scenes.WizardScene('JOIN_WIZARD',
    (ctx) => {
        ctx.wizard.state.data = {};
        ctx.replyWithHTML('🤝 <b>Шаг 1: Имя в системе</b>\nКак нам к тебе обращаться? Это может быть твой позывной или рабочий ник.', Markup.inlineKeyboard([Markup.button.callback('↩️ Отмена', 'exit')]));
        return ctx.wizard.next();
    },
    (ctx) => {
        if (!ctx.message?.text) return ctx.reply('Пожалуйста, напиши текстом.');
        ctx.wizard.state.data.nick = ctx.message.text;
        ctx.replyWithHTML('🛠 <b>Шаг 2: Твоё оружие</b>\nВ чем ты силен? (OSINT, Соц. инженерия, Программирование, Юриспруденция...)');
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.data.spec = ctx.message.text;
        ctx.replyWithHTML('📖 <b>Шаг 3: Твой путь</b>\nРасскажи немного о своем опыте. Почему ты хочешь быть частью Федерации? (Мы ценим искренность).');
        return ctx.wizard.next();
    },
    async (ctx) => {
        const d = ctx.wizard.state.data;
        d.exp = ctx.message.text;
        await ctx.replyWithHTML(`<b>Проверь свою карту:</b>\n\n<b>Ник:</b> ${d.nick}\n<b>Специализация:</b> ${d.spec}\n<b>Опыт:</b> ${d.exp}`, 
            Markup.inlineKeyboard([[Markup.button.callback('✅ Всё верно, отправить', 'send')], [Markup.button.callback('↩️ Изменить', 'exit')]]));
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx.callbackQuery?.data === 'send') {
            const d = ctx.wizard.state.data;
            await bot.telegram.sendMessage(OWNER_ID, `🔥 <b>НОВАЯ ДУША В СИСТЕМЕ</b>\nID: <code>${ctx.from.id}</code>\nНик: ${d.nick}\nСпец: ${d.spec}\nОпыт: ${d.exp}`,
                { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('➕ Принять в ряды', `adm_ok_${ctx.from.id}_${d.nick}_${d.spec}`)]]) });
            await ctx.reply(TXT.wait_admin);
        }
        return ctx.scene.leave();
    }
);

// --- СЦЕНА 2: ПОМОЩЬ (ЭМПАТИЯ) ---
const reportWizard = new Scenes.WizardScene('REPORT_WIZARD',
    (ctx) => {
        ctx.reply('Мы тебя слышим. Выбери свой регион, чтобы мы знали, кто ближе всего к тебе:', Markup.inlineKeyboard([
            [Markup.button.callback('🇷🇺 Россия', 'r_RU'), Markup.button.callback('🇰🇿 Казахстан', 'r_KZ')],
            [Markup.button.callback('🇺🇦 Украина', 'r_UA'), Markup.button.callback('🌍 Другое', 'r_OTHER')],
            [Markup.button.callback('↩️ Отмена', 'exit')]
        ]));
        return ctx.wizard.next();
    },
    (ctx) => {
        if (!ctx.callbackQuery) return;
        ctx.wizard.state.region = ctx.callbackQuery.data;
        ctx.reply('Расскажи, что случилось? Не волнуйся, здесь тебя поймут и постараются помочь. Опиши ситуацию подробно:');
        return ctx.wizard.next();
    },
    async (ctx) => {
        const tid = Math.floor(1000 + Math.random() * 9000);
        await ctx.replyWithHTML(`Твой сигнал #<code>${tid}</code> готов к отправке. Мы поднимем защитников по тревоге?`, 
            Markup.inlineKeyboard([[Markup.button.callback('🚀 Да, отправляйте сигнал', `sos_${tid}`)], [Markup.button.callback('↩️ Отмена', 'exit')]]));
        ctx.wizard.state.desc = ctx.message.text;
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
            await ctx.reply('Твой голос услышан. Защитники получили уведомление. Постарайся сохранять спокойствие.');
        }
        return ctx.scene.leave();
    }
);

const stage = new Scenes.Stage([joinWizard, reportWizard]);
stage.action('exit', (ctx) => ctx.scene.leave() || ctx.reply('Возвращаемся к началу.'));

bot.use(session());
bot.use(stage.middleware());

// --- МЕНЮ И УПРАВЛЕНИЕ ---
const getMenu = (ctx) => Markup.inlineKeyboard([
    [Markup.button.callback('🛡️ Стать защитником', 'go_join')],
    [Markup.button.callback('🆘 Нужна помощь', 'go_report')],
    [Markup.button.callback('📖 Справка', 'go_info')],
    ...(ctx.from.id === OWNER_ID ? [[Markup.button.callback('👑 Админ-Панель', 'go_admin')]] : [])
]);

bot.start((ctx) => ctx.replyWithHTML(TXT.greet, getMenu(ctx)));
bot.action('go_info', (ctx) => ctx.replyWithHTML(TXT.help_info, getMenu(ctx)));
bot.action('go_join', (ctx) => ctx.scene.enter('JOIN_WIZARD'));
bot.action('go_report', (ctx) => ctx.scene.enter('REPORT_WIZARD'));

// --- АДМИН-ПАНЕЛЬ (ФУНКЦИОНАЛ) ---
bot.action('go_admin', async (ctx) => {
    if (ctx.from.id !== OWNER_ID) return;
    const ws = await Worker.find();
    let txt = `<b>👑 ЦЕНТР УПРАВЛЕНИЯ</b>\n\n<b>Защитников в базе:</b> ${ws.length}\n\n`;
    ws.forEach((w, i) => txt += `${i+1}. <code>${w.userId}</code> | ${w.nick} (${w.spec})\n`);
    await ctx.replyWithHTML(txt || "База пока пуста.");
});

bot.action(/^adm_ok_(\d+)_(.+)_(.+)$/, async (ctx) => {
    if (ctx.from.id !== OWNER_ID) return;
    const [_, uid, nick, spec] = ctx.match;
    await Worker.findOneAndUpdate({ userId: Number(uid) }, { nick, spec }, { upsert: true });
    await bot.telegram.sendMessage(uid, '✨ <b>Добро пожаловать в Федерацию.</b> Твоя заявка одобрена. Теперь ты видишь сигналы о помощи.');
    await ctx.editMessageText(`✅ Специалист <b>${nick}</b> активирован.`);
});

bot.action(/^w_take_(\d+)$/, async (ctx) => {
    const isW = await Worker.exists({ userId: ctx.from.id }) || ctx.from.id === OWNER_ID;
    if (!isW) return ctx.answerCbQuery(TXT.no_access);
    await bot.telegram.sendMessage(ctx.match
