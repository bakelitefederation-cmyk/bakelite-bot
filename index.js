const { Telegraf, Scenes, session, Markup } = require('telegraf');
const mongoose = require('mongoose');
const http = require('http');

const OWNER_ID = Number(process.env.ADMIN_CHAT_ID);
const MONGO_URI = process.env.MONGO_URI; 
const VERSION = "8.5.0-STABLE";

// --- БАЗА ДАННЫХ ---
mongoose.connect(MONGO_URI)
  .then(() => console.log('📦 DB Connected'))
  .catch(err => console.error('❌ DB Error:', err));

const Worker = mongoose.model('Worker', {
    userId: { type: Number, unique: true },
    region: String,
    nick: String,
    skills: String,
    details: String,
    status: { type: String, default: 'pending' },
    regDate: { type: Date, default: Date.now }
});

const bot = new Telegraf(process.env.BOT_TOKEN);

// --- ГЛОБАЛЬНЫЙ ОБРАБОТЧИК ОТМЕНЫ ---
const leaveScene = async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await ctx.reply('❌ Операция отменена. Возврат в главное меню.', getMenu(ctx));
    return ctx.scene.leave();
};

// --- СЦЕНА АНКЕТИРОВАНИЯ ЗАЩИТНИКА ---
const joinWizard = new Scenes.WizardScene('JOIN_WIZARD',
    (ctx) => {
        ctx.wizard.state.data = {};
        ctx.replyWithHTML('🌍 <b>Шаг 1: Регион</b>\nУкажи свою локацию (РФ, КЗ, мир...):', 
            Markup.inlineKeyboard([Markup.button.callback('❌ Отмена', 'cancel_scene')]));
        return ctx.wizard.next();
    },
    (ctx) => {
        if (ctx.callbackQuery?.data === 'cancel_scene') return leaveScene(ctx);
        if (!ctx.message?.text) return ctx.reply("Напиши текстом.");
        ctx.wizard.state.data.region = ctx.message.text;
        ctx.replyWithHTML('👤 <b>Шаг 2: Псевдоним</b>\nТвой позывной в системе:');
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.data.nick = ctx.message.text;
        ctx.replyWithHTML('🛡️ <b>Шаг 3: Навыки</b>\nЧто ты умеешь? (OSINT, IT, Право...):');
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.data.skills = ctx.message.text;
        ctx.replyWithHTML('📝 <b>Шаг 4: Подробности</b>\nИспользуй шаблон:\n- Опыт: ...\n- Доступность: ...\n- Почему мы?: ...');
        return ctx.wizard.next();
    },
    async (ctx) => {
        const d = ctx.wizard.state.data;
        d.details = ctx.message.text;
        await ctx.replyWithHTML(`<b>Проверка анкеты:</b>\n\n📍 ${d.region} | 👤 ${d.nick}\n🛠️ ${d.skills}\n📄 ${d.details}`, 
            Markup.inlineKeyboard([[Markup.button.callback('✅ Отправить', 'send_join')], [Markup.button.callback('❌ Отмена', 'cancel_scene')]]));
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx.callbackQuery?.data === 'send_join') {
            const d = ctx.wizard.state.data;
            await Worker.findOneAndUpdate({ userId: ctx.from.id }, { ...d, status: 'pending' }, { upsert: true });
            await bot.telegram.sendMessage(OWNER_ID, `🔥 <b>НОВАЯ АНКЕТА</b>\nID: <code>${ctx.from.id}</code>\nРегион: ${d.region}\nНик: ${d.nick}\nСпец: ${d.skills}\nДетали: ${d.details}`,
                { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('➕ Принять', `adm_ok_${ctx.from.id}`) ]]) });
            await ctx.reply('✨ Твоя анкета отправлена на рассмотрение.');
        }
        return ctx.scene.leave();
    }
);

// --- СЦЕНА ПОМОЩИ (ОБНОВЛЕННАЯ) ---
const reportWizard = new Scenes.WizardScene('REPORT_WIZARD',
    (ctx) => {
        ctx.wizard.state.data = {};
        ctx.replyWithHTML('🆘 <b>Запрос помощи: Шаг 1</b>\nГде ты находишься? (Город/Страна):', 
            Markup.inlineKeyboard([Markup.button.callback('❌ Отмена', 'cancel_scene')]));
        return ctx.wizard.next();
    },
    (ctx) => {
        if (ctx.callbackQuery?.data === 'cancel_scene') return leaveScene(ctx);
        if (!ctx.message?.text) return ctx.reply("Напиши локацию.");
        ctx.wizard.state.data.loc = ctx.message.text;
        ctx.replyWithHTML('🔍 <b>Шаг 2: Суть проблемы</b>\nОпиши максимально подробно, что случилось и какая помощь нужна:');
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.data.issue = ctx.message.text;
        ctx.replyWithHTML('📞 <b>Шаг 3: Связь</b>\nКак с тобой связаться? (Твой юзернейм или другой контакт):');
        return ctx.wizard.next();
    },
    async (ctx) => {
        ctx.wizard.state.data.contact = ctx.message.text;
        const d = ctx.wizard.state.data;
        await ctx.replyWithHTML(`<b>Подтверди сигнал SOS:</b>\n\n📍 Место: ${d.loc}\n❓ Проблема: ${d.issue}\n📱 Связь: ${d.contact}`, 
            Markup.inlineKeyboard([[Markup.button.callback('🚀 ОТПРАВИТЬ СИГНАЛ', 'send_report')], [Markup.button.callback('❌ Отмена', 'cancel_scene')]]));
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx.callbackQuery?.data === 'send_report') {
            const d = ctx.wizard.state.data;
            const ws = await Worker.find({ status: 'approved' });
            const targets = [OWNER_ID, ...ws.map(w => w.userId)];
            
            targets.forEach(id => {
                bot.telegram.sendMessage(id, `⚠️ <b>ТРЕВОГА: НУЖНА ПОМОЩЬ</b>\n📍 Локация: ${d.loc}\n🚨 Суть: ${d.issue}\n👤 Контакт: ${d.contact}`,
                { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🛡️ Взять кейс', `w_take_${ctx.from.id}`)]]) }).catch(()=>{});
            });
            await ctx.reply('🚀 Твой сигнал отправлен всем свободным защитникам. Сохраняй спокойствие.');
        }
        return ctx.scene.leave();
    }
);

const stage = new Scenes.Stage([joinWizard, reportWizard]);
stage.action('cancel_scene', leaveScene);

bot.use(session());
bot.use(stage.middleware());

// --- МЕНЮ ---
const getMenu = (ctx) => Markup.inlineKeyboard([
    [Markup.button.callback('🛡️ Стать защитником', 'go_join')],
    [Markup.button.callback('🔍 Статус моей заявки', 'check_status')],
    [Markup.button.callback('🆘 Нужна помощь', 'go_report')],
    ...(ctx.from.id === OWNER_ID ? [[Markup.button.callback('👑 Админ-Панель', 'go_admin')]] : [])
]);

bot.start((ctx) => ctx.replyWithHTML('<b>Bakelite Federation</b>\nДобро пожаловать в систему защиты и взаимопомощи.', getMenu(ctx)));

bot.action('go_join', (ctx) => ctx.scene.enter('JOIN_WIZARD'));
bot.action('go_report', (ctx) => ctx.scene.enter('REPORT_WIZARD'));

bot.action('check_status', async (ctx) => {
    const user = await Worker.findOne({ userId: ctx.from.id });
    if (!user) return ctx.answerCbQuery("Анкета не найдена.", { show_alert: true });
    const s = { 'pending': '⏳ В очереди', 'approved': '✅ Принят', 'rejected': '❌ Отклонено' };
    await ctx.replyWithHTML(`<b>Твой статус:</b> ${s[user.status] || 'Неизвестно'}`);
});

bot.action('go_admin', async (ctx) => {
    if (ctx.from.id !== OWNER_ID) return;
    const ws = await Worker.find();
    let txt = `<b>👑 АДМИН-ПАНЕЛЬ</b>\nВсего: ${ws.length}\n\n`;
    ws.forEach((w, i) => txt += `${i+1}. <code>${w.userId}</code> | ${w.nick} [${w.status}]\n`);
    await ctx.replyWithHTML(txt || "Пусто.");
});

bot.action(/^adm_ok_(\d+)$/, async (ctx) => {
    if (ctx.from.id !== OWNER_ID) return;
    await Worker.findOneAndUpdate({ userId: Number(ctx.match[1]) }, { status: 'approved' });
    await bot.telegram.sendMessage(ctx.match[1], '✨ <b>Поздравляем!</b> Ты принят в ряды Федерации.');
    await ctx.editMessageText(`✅ Юзер ${ctx.match[1]} активирован.`);
});

bot.action(/^w_take_(\d+)$/, async (ctx) => {
    const isW = await Worker.exists({ userId: ctx.from.id, status: 'approved' }) || ctx.from.id === OWNER_ID;
    if (!isW) return ctx.answerCbQuery('Доступ запрещен.');
    await bot.telegram.sendMessage(ctx.match[1], `🛡️ <b>Защитник взял твой запрос в работу.</b> Жди связи.`);
    await ctx.editMessageText('✅ Ты взял ответственность за этот запрос.');
});

http.createServer((req, res) => { res.writeHead(200); res.end('Federation Online'); }).listen(process.env.PORT || 3000);
bot.launch();
