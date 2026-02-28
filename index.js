const { Telegraf, Scenes, session, Markup } = require('telegraf');
const mongoose = require('mongoose');
const http = require('http');

// Настройки из Render
const OWNER_ID = Number(process.env.ADMIN_CHAT_ID);
const MONGO_URI = process.env.MONGO_URI; 
const VERSION = "6.2.0-FINAL";

// Подключение к твоей базе
mongoose.connect(MONGO_URI)
  .then(() => console.log('📦 DB Connected'))
  .catch(err => console.error('❌ DB Error:', err));

// Схема защитника
const Worker = mongoose.model('Worker', {
    userId: { type: Number, unique: true },
    nick: String,
    spec: String,
    details: String
});

const bot = new Telegraf(process.env.BOT_TOKEN);

// Проверка прав через БД
async function isWorker(id) {
    if (id === OWNER_ID) return true;
    return await Worker.exists({ userId: id });
}

// --- СЦЕНА: РЕГИСТРАЦИЯ ---
const joinWizard = new Scenes.WizardScene('JOIN_WIZARD',
    (ctx) => {
        ctx.wizard.state.data = {};
        ctx.replyWithHTML('👋 <b>Регистрация защитника</b>\nТвой рабочий ник:', Markup.inlineKeyboard([Markup.button.callback('↩️ Отмена', 'exit')]));
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.data.nick = ctx.message.text;
        ctx.reply('Твоя специализация (OSINT, IT...):');
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.data.spec = ctx.message.text;
        ctx.reply('Расскажи подробно об опыте:');
        return ctx.wizard.next();
    },
    async (ctx) => {
        const d = ctx.wizard.state.data;
        d.details = ctx.message.text;
        await ctx.replyWithHTML(`<b>Проверь анкету:</b>\nНик: ${d.nick}\nСпец: ${d.spec}\nОпыт: ${d.details}`, 
            Markup.inlineKeyboard([[Markup.button.callback('✅ Отправить', 'send')], [Markup.button.callback('↩️ Отмена', 'exit')]]));
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx.callbackQuery?.data === 'send') {
            const d = ctx.wizard.state.data;
            // ID в <code> для копирования
            await bot.telegram.sendMessage(OWNER_ID, `👨‍✈️ <b>НОВАЯ ЗАЯВКА</b>\nID: <code>${ctx.from.id}</code>\nНик: ${d.nick}\nСпец: ${d.spec}\nОпыт: ${d.details}`,
                { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('✅ Принять', `adm_ok_${ctx.from.id}_${d.nick}_${d.spec}`)]]) });
            await ctx.reply('Анкета у Создателя!');
        }
        return ctx.scene.leave();
    }
);

// --- СЦЕНА: ПОМОЩЬ ---
const reportWizard = new Scenes.WizardScene('REPORT_WIZARD',
    (ctx) => {
        ctx.wizard.state.data = {};
        ctx.reply('Выбери регион:', Markup.inlineKeyboard([
            [Markup.button.callback('🇷🇺 РФ', 'r_RU'), Markup.button.callback('🇰🇿 КЗ', 'r_KZ')],
            [Markup.button.callback('🇺🇦 УА', 'r_UA'), Markup.button.callback('🌍 Другое', 'r_OTHER')],
            [Markup.button.callback('↩️ Отмена', 'exit')]
        ]));
        return ctx.wizard.next();
    },
    (ctx) => {
        if (!ctx.callbackQuery) return;
        ctx.wizard.state.data.region = ctx.callbackQuery.data;
        ctx.reply('Опиши проблему подробно:');
        return ctx.wizard.next();
    },
    async (ctx) => {
        ctx.wizard.state.data.desc = ctx.message.text;
        const tid = Math.floor(1000 + Math.random() * 9000);
        await ctx.replyWithHTML(`Отправить сигнал #<code>${tid}</code>?`, 
            Markup.inlineKeyboard([[Markup.button.callback('🚀 Да!', `sos_${tid}`)], [Markup.button.callback('↩️ Отмена', 'exit')]]));
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx.callbackQuery?.data.startsWith('sos_')) {
            const d = ctx.wizard.state.data;
            const workers = await Worker.find();
            const list = [OWNER_ID, ...workers.map(w => w.userId)];
            list.forEach(id => {
                bot.telegram.sendMessage(id, `⚠️ <b>SOS</b>\nРегион: ${d.region}\nСуть: ${d.desc}`,
                { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🛡️ Взять кейс', `w_take_${ctx.from.id}`)]]) }).catch(()=>{});
            });
            await ctx.reply('Сигнал отправлен! 🙌');
        }
        return ctx.scene.leave();
    }
);

const stage = new Scenes.Stage([joinWizard, reportWizard]);
stage.action('exit', (ctx) => ctx.scene.leave() || ctx.reply('Меню заново: /start'));

bot.use(session());
bot.use(stage.middleware());

bot.start((ctx) => ctx.replyWithHTML(`👋 <b>Bakelite Federation</b>\n💠 <code>v${VERSION}</code> | ☁️ Render`, 
    Markup.inlineKeyboard([[Markup.button.callback('🛡️ Регистрация', 'go_join')], [Markup.button.callback('🆘 Помощь', 'go_report')]])));

bot.action('go_join', (ctx) => ctx.scene.enter('JOIN_WIZARD'));
bot.action('go_report', (ctx) => ctx.scene.enter('REPORT_WIZARD'));

bot.action(/^adm_ok_(\d+)_(.+)_(.+)$/, async (ctx) => {
    if (ctx.from.id !== OWNER_ID) return;
    const [_, uid, nick, spec] = ctx.match;
    await Worker.findOneAndUpdate({ userId: Number(uid) }, { nick, spec }, { upsert: true });
    await bot.telegram.sendMessage(uid, '✅ <b>Принят!</b>');
    await ctx.editMessageText(`✅ ${nick} в базе.`);
});

bot.action(/^w_take_(\d+)$/, async (ctx) => {
    if (!(await isWorker(ctx.from.id))) return ctx.answerCbQuery('Нет прав.');
    await bot.telegram.sendMessage(ctx.match[1], `🛡️ Защитник взял кейс!`);
    await ctx.editMessageText('✅ Ты взял кейс.');
});

// Пинговалка для Render
http.createServer((req, res) => { res.writeHead(200); res.end('OK'); }).listen(process.env.PORT || 3000);
bot.launch();
