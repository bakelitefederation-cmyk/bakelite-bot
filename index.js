const { Telegraf, Scenes, session, Markup } = require('telegraf');
const mongoose = require('mongoose');
const http = require('http');

const OWNER_ID = Number(process.env.ADMIN_CHAT_ID);
const MONGO_URI = process.env.MONGO_URI; 
const VERSION = "8.0.0-LEGACY-BACK";

// --- БАЗА ДАННЫХ (BAKELITE) ---
mongoose.connect(MONGO_URI)
  .then(() => console.log('📦 DB Connected: Federation Memory Active'))
  .catch(err => console.error('❌ DB Error:', err));

const Worker = mongoose.model('Worker', {
    userId: { type: Number, unique: true },
    region: String,
    nick: String,
    skills: String,
    details: String,
    status: { type: String, default: 'pending' }, // pending, approved, rejected
    regDate: { type: Date, default: Date.now }
});

const bot = new Telegraf(process.env.BOT_TOKEN);

// --- ДУШЕВНЫЕ ТЕКСТЫ ---
const STRINGS = {
    welcome: "<b>Приветствуем в Bakelite Federation.</b>\n\nМы — не просто бот. Мы — цифровая крепость и объединение людей, которые верят в справедливость там, где её сложно найти. Здесь каждый голос имеет значение, а каждый защитник — это щит для тех, кто попал в беду. \n\nВыбери свой путь ниже. Мы ждали тебя.",
    about: "<b>О системе Bakelite:</b>\n\nНаша миссия — создание безопасной среды и оперативная помощь в кризисных ситуациях. \n\n• <b>Защитники:</b> Специалисты, прошедшие отбор. \n• <b>Помощь:</b> Прямая связь с теми, кто готов действовать. \n• <b>Технологии:</b> Данные шифруются и хранятся в облаке BAKELITE.",
    join_intro: "🤝 <b>Путь защитника</b>\nСтать частью Федерации — это ответственность. Мы проверим твою анкету вручную. Приготовься честно ответить на вопросы."
};

// --- СЦЕНА АНКЕТИРОВАНИЯ (ТВОЙ ШАБЛОН) ---
const joinWizard = new Scenes.WizardScene('JOIN_WIZARD',
    (ctx) => {
        ctx.wizard.state.data = {};
        ctx.replyWithHTML('🌍 <b>Этап 1: Регион</b>\nУкажи свою локацию или зону покрытия (например: РФ, КЗ, Европа, Весь мир):', 
            Markup.inlineKeyboard([Markup.button.callback('↩️ Отмена', 'exit')]));
        return ctx.wizard.next();
    },
    (ctx) => {
        if (!ctx.message?.text) return ctx.reply("Пожалуйста, напиши свой регион.");
        ctx.wizard.state.data.region = ctx.message.text;
        ctx.replyWithHTML('👤 <b>Этап 2: Псевдоним</b>\nПод каким именем тебя будут знать в системе? (Твой позывной):');
        return ctx.wizard.next();
    },
    (ctx) => {
        if (!ctx.message?.text) return ctx.reply("Нужен твой псевдоним.");
        ctx.wizard.state.data.nick = ctx.message.text;
        ctx.replyWithHTML('🛡️ <b>Этап 3: Навыки</b>\nЧто ты умеешь? (OSINT, IT, Психология, Право, СИ...). Опиши через запятую:');
        return ctx.wizard.next();
    },
    (ctx) => {
        if (!ctx.message?.text) return ctx.reply("Опиши свои навыки.");
        ctx.wizard.state.data.skills = ctx.message.text;
        ctx.replyWithHTML('📝 <b>Этап 4: Подробности (По шаблону)</b>\n\nЗаполни по этому примеру:\n<i>- Опыт работы: 3 года\n- Доступность: 24/7\n- Твой основной инструмент: ...\n- Почему мы?: ...</i>');
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!ctx.message?.text) return ctx.reply("Заполни подробности.");
        const d = ctx.wizard.state.data;
        d.details = ctx.message.text;
        
        await ctx.replyWithHTML(`<b>Проверь свою анкету:</b>\n\n📍 <b>Регион:</b> ${d.region}\n👤 <b>Псевдоним:</b> ${d.nick}\n🛠️ <b>Навыки:</b> ${d.skills}\n📄 <b>Подробности:</b>\n${d.details}`, 
            Markup.inlineKeyboard([[Markup.button.callback('✅ Отправить Создателю', 'send')], [Markup.button.callback('↩️ Сброс', 'exit')]]));
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx.callbackQuery?.data === 'send') {
            const d = ctx.wizard.state.data;
            await Worker.findOneAndUpdate({ userId: ctx.from.id }, { ...d, status: 'pending' }, { upsert: true });
            
            await bot.telegram.sendMessage(OWNER_ID, `🔥 <b>НОВАЯ ЗАЯВКА</b>\nID: <code>${ctx.from.id}</code>\nРегион: ${d.region}\nНик: ${d.nick}\nСпец: ${d.skills}\nДетали: ${d.details}`,
                { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('➕ Принять', `adm_ok_${ctx.from.id}`) ]]) });
            
            await ctx.reply('Твоя анкета ушла в архив Федерации. Ожидай проверки статуса. ✨');
        }
        return ctx.scene.leave();
    }
);

// --- СЦЕНА ПОМОЩИ ---
const reportWizard = new Scenes.WizardScene('REPORT_WIZARD',
    (ctx) => {
        ctx.reply('Мы тебя слышим. Опиши ситуацию максимально подробно, и защитники получат сигнал:', Markup.inlineKeyboard([Markup.button.callback('↩️ Отмена', 'exit')]));
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!ctx.message?.text) return ctx.reply("Опиши проблему текстом.");
        const tid = Math.floor(1000 + Math.random() * 9000);
        await ctx.replyWithHTML(`Сигнал #<code>${tid}</code> готов. Отправляем в эфир?`, 
            Markup.inlineKeyboard([[Markup.button.callback('🚀 Да, отправляйте', `sos_${tid}`)], [Markup.button.callback('↩️ Отмена', 'exit')]]));
        ctx.wizard.state.desc = ctx.message.text;
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx.callbackQuery?.data.startsWith('sos_')) {
            const ws = await Worker.find({ status: 'approved' });
            const list = [OWNER_ID, ...ws.map(w => w.userId)];
            list.forEach(id => {
                bot.telegram.sendMessage(id, `⚠️ <b>SOS ТРЕВОГА</b>\nСуть: ${ctx.wizard.state.desc}`,
                { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🛡️ Взять кейс', `w_take_${ctx.from.id}`)]]) }).catch(()=>{});
            });
            await ctx.reply('Сигнал разослан. Постарайся сохранять спокойствие, мы рядом.');
        }
        return ctx.scene.leave();
    }
);

const stage = new Scenes.Stage([joinWizard, reportWizard]);
stage.action('exit', (ctx) => ctx.scene.leave() || ctx.reply('Возврат в главное меню.'));

bot.use(session());
bot.use(stage.middleware());

// --- МЕНЮ ---
const getMenu = (ctx) => Markup.inlineKeyboard([
    [Markup.button.callback('🛡️ Стать защитником', 'go_join')],
    [Markup.button.callback('🔍 Статус моей заявки', 'check_status')],
    [Markup.button.callback('🆘 Помощь', 'go_report')],
    [Markup.button.callback('📖 О системе', 'go_info')],
    ...(ctx.from.id === OWNER_ID ? [[Markup.button.callback('👑 Админ-Панель', 'go_admin')]] : [])
]);

bot.start((ctx) => ctx.replyWithHTML(STRINGS.welcome, getMenu(ctx)));
bot.action('go_info', (ctx) => ctx.replyWithHTML(STRINGS.about, getMenu(ctx)));
bot.action('go_join', (ctx) => ctx.replyWithHTML(STRINGS.join_intro) && ctx.scene.enter('JOIN_WIZARD'));
bot.action('go_report', (ctx) => ctx.scene.enter('REPORT_WIZARD'));

// --- ПРОВЕРКА СТАТУСА (ТОТ САМЫЙ ОТДЕЛ) ---
bot.action('check_status', async (ctx) => {
    const user = await Worker.findOne({ userId: ctx.from.id });
    if (!user) return ctx.answerCbQuery("Анкета не найдена. Нажми 'Стать защитником'.", { show_alert: true });

    const statusMap = {
        'pending': '⏳ <b>В очереди.</b> Твои данные на столе у Создателя. Проверка требует времени.',
        'approved': '✅ <b>Принят!</b> Ты в основном составе. Теперь ты получаешь алерты системы.',
        'rejected': '❌ <b>Отклонено.</b> На данный момент мы не готовы принять тебя в ряды.'
    };
    await ctx.replyWithHTML(`<b>Твоя карта:</b>\n👤 Ник: ${user.nick}\n\n<b>Статус:</b> ${statusMap[user.status] || 'Неизвестно'}`);
});

// --- АДМИНКА ---
bot.action('go_admin', async (ctx) => {
    if (ctx.from.id !== OWNER_ID) return;
    const ws = await Worker.find();
    let txt = `<b>👑 ЦЕНТР УПРАВЛЕНИЯ</b>\nВсего в базе: ${ws.length}\n\n`;
    ws.forEach((w, i) => txt += `${i+1}. <code>${w.userId}</code> | ${w.nick} [${w.status}]\n`);
    await ctx.replyWithHTML(txt || "Пусто.");
});

bot.action(/^adm_ok_(\d+)$/, async (ctx) => {
    if (ctx.from.id !== OWNER_ID) return;
    await Worker.findOneAndUpdate({ userId: Number(ctx.match[1]) }, { status: 'approved' });
    await bot.telegram.sendMessage(ctx.match[1], '✨ <b>Поздравляем!</b> Твоя заявка одобрена. Добро пожаловать в Федерацию.');
    await ctx.editMessageText(`✅ Юзер <code>${ctx.match[1]}</code> активирован.`);
});

bot.action(/^w_take_(\d+)$/, async (ctx) => {
    const isW = await Worker.exists({ userId: ctx.from.id, status: 'approved' }) || ctx.from.id === OWNER_ID;
    if (!isW) return ctx.answerCbQuery('Доступ только для защитников.');
    await bot.telegram.sendMessage(ctx.match[1], `🛡️ <b>Защитник @${ctx.from.username} взял твой кейс.</b>`);
    await ctx.editMessageText('✅ Ты взял ответственность за кейс.');
});

http.createServer((req, res) => { res.writeHead(200); res.end('Federation Online'); }).listen(process.env.PORT || 3000);
bot.launch();
