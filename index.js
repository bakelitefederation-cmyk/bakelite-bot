const { Telegraf, Scenes, session, Markup } = require('telegraf');
const mongoose = require('mongoose');
const http = require('http');

// --- КОНФИГУРАЦИЯ (Из Environment Variables на Render) ---
const OWNER_ID = Number(process.env.ADMIN_CHAT_ID);
const MONGO_URI = process.env.MONGO_URI; 
const PORT = process.env.PORT || 10000;
const VERSION = "8.6.0-ULTIMATE"; // Вернул на базу!

// --- ПОДКЛЮЧЕНИЕ К БАЗЕ BAKELITE ---
mongoose.connect(MONGO_URI)
  .then(() => console.log(`📦 DB Connected | Version: ${VERSION}`))
  .catch(err => console.error('❌ Ошибка подключения к БД:', err));

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

// --- КНОПКИ И МЕНЮ ---
const getMenu = (ctx) => Markup.inlineKeyboard([
    [Markup.button.callback('🛡️ Стать защитником', 'go_join')],
    [Markup.button.callback('🔍 Статус моей заявки', 'check_status')],
    [Markup.button.callback('🆘 Нужна помощь', 'go_report')],
    [Markup.button.callback('📖 О системе', 'go_info')],
    ...(ctx.from.id === OWNER_ID ? [[Markup.button.callback('👑 Админ-Панель', 'go_admin')]] : [])
]);

// Универсальный выход из любой сцены
const leaveScene = async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await ctx.reply('❌ Процесс прерван. Мы вернулись в начало.', getMenu(ctx));
    return ctx.scene.leave();
};

// --- СЦЕНА 1: РЕГИСТРАЦИЯ ЗАЩИТНИКА (ТВОЙ ШАБЛОН) ---
const joinWizard = new Scenes.WizardScene('JOIN_WIZARD',
    (ctx) => {
        ctx.wizard.state.data = {};
        ctx.replyWithHTML('🌍 <b>Этап 1: Регион</b>\nГде ты находишься? (Напр.: РФ, КЗ, ЕС...):', 
            Markup.inlineKeyboard([Markup.button.callback('❌ Отмена', 'cancel_scene')]));
        return ctx.wizard.next();
    },
    (ctx) => {
        if (ctx.callbackQuery?.data === 'cancel_scene') return leaveScene(ctx);
        if (!ctx.message?.text) return ctx.reply("Пожалуйста, напиши текстом.");
        ctx.wizard.state.data.region = ctx.message.text;
        ctx.replyWithHTML('👤 <b>Этап 2: Псевдоним</b>\nТвой позывной в системе Bakelite:');
        return ctx.wizard.next();
    },
    (ctx) => {
        if (!ctx.message?.text) return ctx.reply("Жду твой псевдоним...");
        ctx.wizard.state.data.nick = ctx.message.text;
        ctx.replyWithHTML('🛠️ <b>Этап 3: Навыки</b>\nВ чем твоя сила? (OSINT, IT, Право, СИ...):');
        return ctx.wizard.next();
    },
    (ctx) => {
        if (!ctx.message?.text) return ctx.reply("Опиши свои навыки.");
        ctx.wizard.state.data.skills = ctx.message.text;
        ctx.replyWithHTML('📝 <b>Этап 4: Подробности (По шаблону)</b>\nНапиши подробности:\n\n<i>- Опыт:\n- Доступность:\n- Почему хочешь к нам:</i>');
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!ctx.message?.text) return ctx.reply("Заполни подробности.");
        const d = ctx.wizard.state.data;
        d.details = ctx.message.text;
        await ctx.replyWithHTML(`<b>Проверка твоей карты:</b>\n\n📍 <b>Регион:</b> ${d.region}\n👤 <b>Ник:</b> ${d.nick}\n🛠️ <b>Навыки:</b> ${d.skills}\n📄 <b>Детали:</b>\n${d.details}`, 
            Markup.inlineKeyboard([[Markup.button.callback('✅ Отправить Создателю', 'send_join')], [Markup.button.callback('❌ Отмена', 'cancel_scene')]]));
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx.callbackQuery?.data === 'send_join') {
            const d = ctx.wizard.state.data;
            await Worker.findOneAndUpdate({ userId: ctx.from.id }, { ...d, status: 'pending' }, { upsert: true });
            await bot.telegram.sendMessage(OWNER_ID, `🔥 <b>НОВАЯ АНКЕТА</b>\nID: <code>${ctx.from.id}</code>\nРегион: ${d.region}\nНик: ${d.nick}\nСпец: ${d.skills}\nИнфо: ${d.details}`,
                { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('➕ Принять в ряды', `adm_ok_${ctx.from.id}`) ]]) });
            await ctx.reply('✨ Твоя душа в очереди. Создатель рассмотрит анкету в ближайшее время.');
        }
        return ctx.scene.leave();
    }
);

// --- СЦЕНА 2: АНКЕТИРОВАНИЕ ПОМОЩИ (ЭМПАТИЯ) ---
const reportWizard = new Scenes.WizardScene('REPORT_WIZARD',
    (ctx) => {
        ctx.wizard.state.data = {};
        ctx.replyWithHTML('🆘 <b>Запрос помощи: Шаг 1</b>\nГде случилась беда? (Город/Место):', Markup.inlineKeyboard([Markup.button.callback('❌ Отмена', 'cancel_scene')]));
        return ctx.wizard.next();
    },
    (ctx) => {
        if (ctx.callbackQuery?.data === 'cancel_scene') return leaveScene(ctx);
        if (!ctx.message?.text) return ctx.reply("Укажи локацию.");
        ctx.wizard.state.data.loc = ctx.message.text;
        ctx.replyWithHTML('🔍 <b>Шаг 2: Что произошло?</b>\nОпиши ситуацию максимально подробно. Мы тебя слушаем:');
        return ctx.wizard.next();
    },
    (ctx) => {
        if (!ctx.message?.text) return ctx.reply("Нам нужно описание проблемы.");
        ctx.wizard.state.data.issue = ctx.message.text;
        ctx.replyWithHTML('📱 <b>Шаг 3: Обратная связь</b>\nКак защитнику связаться с тобой? (Юзернейм или контакт):');
        return ctx.wizard.next();
    },
    async (ctx) => {
        ctx.wizard.state.data.contact = ctx.message.text;
        const d = ctx.wizard.state.data;
        await ctx.replyWithHTML(`<b>Подтверждаешь отправку SOS?</b>\n\n📍 Место: ${d.loc}\n❓ Суть: ${d.issue}\n📱 Связь: ${d.contact}`, 
            Markup.inlineKeyboard([[Markup.button.callback('🚀 ОТПРАВИТЬ СИГНАЛ', 'send_report')], [Markup.button.callback('❌ Отмена', 'cancel_scene')]]));
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx.callbackQuery?.data === 'send_report') {
            const d = ctx.wizard.state.data;
            const ws = await Worker.find({ status: 'approved' });
            const list = [OWNER_ID, ...ws.map(w => w.userId)];
            list.forEach(id => {
                bot.telegram.sendMessage(id, `⚠️ <b>SOS ТРЕВОГА</b>\nЛокация: ${d.loc}\nСуть: ${d.issue}\nКонтакт: ${d.contact}`,
                { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🛡️ Взять кейс', `w_take_${ctx.from.id}`)]]) }).catch(()=>{});
            });
            await ctx.reply('🚀 Твой голос услышан. Сигнал разослан защитникам.');
        }
        return ctx.scene.leave();
    }
);

// --- НАСТРОЙКА СЦЕН ---
const stage = new Scenes.Stage([joinWizard, reportWizard]);
stage.action('cancel_scene', leaveScene);

bot.use(session());
bot.use(stage.middleware());

// --- ОСНОВНЫЕ ОБРАБОТЧИКИ ---
bot.start((ctx) => ctx.replyWithHTML(`🛡️ <b>Bakelite Federation</b> v${VERSION}\n\nДобро пожаловать. Мы защищаем тех, кто в этом нуждается. Ты с нами?`, getMenu(ctx)));

bot.action('go_join', (ctx) => ctx.scene.enter('JOIN_WIZARD'));
bot.action('go_report', (ctx) => ctx.scene.enter('REPORT_WIZARD'));
bot.action('go_info', (ctx) => ctx.replyWithHTML('<b>Bakelite Federation</b> — это децентрализованный щит.\nВсе данные хранятся в защищенном облаке Стокгольма. Мы ценим правду и силу.', getMenu(ctx)));

// --- ОТДЕЛ СТАТУСА ---
bot.action('check_status', async (ctx) => {
    const user = await Worker.findOne({ userId: ctx.from.id });
    if (!user) return ctx.answerCbQuery("Анкеты нет в базе. Заполни её!", { show_alert: true });
    
    const statuses = {
        'pending': '⏳ <b>В очереди.</b> Твоя заявка на столе у Создателя. Жди.',
        'approved': '✅ <b>Принят!</b> Ты в основном составе Федерации.',
        'rejected': '❌ <b>Отклонено.</b> На данный момент мы не можем тебя принять.'
    };
    await ctx.replyWithHTML(`👤 Ник: ${user.nick}\n<b>Статус:</b> ${statuses[user.status] || 'Неизвестно'}`);
});

// --- АДМИН-ПАНЕЛЬ ---
bot.action('go_admin', async (ctx) => {
    if (ctx.from.id !== OWNER_ID) return;
    const all = await Worker.find();
    let txt = `<b>👑 ЦЕНТР УПРАВЛЕНИЯ</b>\nВерсия: ${VERSION}\n\n`;
    all.forEach((w, i) => txt += `${i+1}. <code>${w.userId}</code> | ${w.nick} [${w.status}]\n`);
    await ctx.replyWithHTML(txt || "База пуста.");
});

bot.action(/^adm_ok_(\d+)$/, async (ctx) => {
    if (ctx.from.id !== OWNER_ID) return;
    const uid = Number(ctx.match[1]);
    await Worker.findOneAndUpdate({ userId: uid }, { status: 'approved' });
    await bot.telegram.sendMessage(uid, '✨ <b>Поздравляем!</b> Твоя заявка одобрена. Теперь ты видишь SOS-сигналы.');
    await ctx.editMessageText(`✅ Юзер <code>${uid}</code> активирован.`);
});

bot.action(/^w_take_(\d+)$/, async (ctx) => {
    const isW = await Worker.exists({ userId: ctx.from.id, status: 'approved' }) || ctx.from.id === OWNER_ID;
    if (!isW) return ctx.answerCbQuery('Доступ только для защитников.');
    await bot.telegram.sendMessage(ctx.match[1], `🛡️ <b>На связи защитник.</b> Твой кейс взят в работу специалистом @${ctx.from.username}. Жди сообщения.`);
    await ctx.editMessageText('✅ Ты взял ответственность за этот кейс. Удачи.');
});

// --- ЕДИНЫЙ ЗАПУСК СЕРВЕРА (ФИКС EADDRINUSE) ---
const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Federation Heartbeat OK');
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`📡 Server running on port ${PORT}`);
    bot.launch()
        .then(() => console.log(`🚀 Federation Bot v${VERSION} Launched`))
        .catch(err => console.error('❌ Ошибка запуска бота:', err));
});

// Graceful Shutdown
process.once('SIGINT', () => { bot.stop('SIGINT'); server.close(); });
process.once('SIGTERM', () => { bot.stop('SIGTERM'); server.close(); });
