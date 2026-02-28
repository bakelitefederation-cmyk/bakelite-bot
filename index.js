const http = require('http');
const { Telegraf, Scenes, session, Markup } = require('telegraf');

// 1. Простой сервер для Health Check
http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Bakelite Federation Bot is running!');
}).listen(process.env.PORT || 3000);

const bot = new Telegraf(process.env.BOT_TOKEN);

// --- КОНСТАНТЫ ---
const OWNER_ID = Number(process.env.ADMIN_CHAT_ID);
const state = {
    workers: new Map(), 
    history: new Map()
};

// --- МИДЛВЕЙРЫ ---
// ВАЖНО: Вызываем session() строго ОДИН раз и ПЕРЕД стейджем
bot.use(session());

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---
const getMainMenu = (ctx) => {
    const btns = [
        [Markup.button.callback('🛡️ Вступить в команду', 'go_join')],
        [Markup.button.callback('🆘 Мне нужна помощь', 'go_report')],
        [Markup.button.callback('📊 Мои заявки', 'go_status')],
        [Markup.button.callback('ℹ️ О системе', 'go_help')]
    ];
    if (ctx.from.id === OWNER_ID) btns.push([Markup.button.callback('👑 Админ-Панель', 'go_admin')]);
    return Markup.inlineKeyboard(btns);
};

const cancelBtn = [Markup.button.callback('↩️ Отмена', 'exit_scene')];

// --- СЦЕНЫ (WIZARDS) ---

// Сцена вступления (JOIN)
const joinWizard = new Scenes.WizardScene(
    'JOIN_WIZARD',
    async (ctx) => {
        ctx.wizard.state.data = {};
        await ctx.answerCbQuery().catch(() => {});
        await ctx.editMessageText('👋 <b>Регистрация защитника</b>\nВыберите ваш регион:', {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('Россия', 'j_RU'), Markup.button.callback('Украина', 'j_UA')],
                [Markup.button.callback('Казахстан', 'j_KZ'), Markup.button.callback('Другое', 'j_OTHER')],
                cancelBtn
            ])
        });
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!ctx.callbackQuery) return;
        ctx.wizard.state.data.region = ctx.callbackQuery.data.replace('j_', '');
        await ctx.answerCbQuery();
        await ctx.reply('Введите ваш <b>псевдоним</b>:', { parse_mode: 'HTML' });
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!ctx.message?.text) return ctx.reply('Пожалуйста, введите текст.');
        ctx.wizard.state.data.nick = ctx.message.text;
        await ctx.reply('Ваша <b>специализация</b> (например, OSINT, Юрист):', { parse_mode: 'HTML' });
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!ctx.message?.text) return ctx.reply('Введите специализацию...');
        const d = ctx.wizard.state.data;
        d.spec = ctx.message.text;
        await ctx.replyWithHTML(`<b>Проверка анкеты:</b>\n\n📍 Регион: ${d.region}\n👤 Ник: ${d.nick}\n🛠 Навыки: ${d.spec}`, 
            Markup.inlineKeyboard([[Markup.button.callback('✅ Отправить', 'send')], cancelBtn])
        );
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx.callbackQuery?.data === 'send') {
            const d = ctx.wizard.state.data;
            state.history.set(ctx.from.id, { type: 'Защитник', status: 'На проверке' });
            
            await bot.telegram.sendMessage(OWNER_ID, `👨‍✈️ <b>НОВАЯ АНКЕТА</b>\n@${ctx.from.username}\nID: ${ctx.from.id}\nРегион: ${d.region}\nСпец: ${d.spec}`, {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('✅ Принять', `adm_ok_${ctx.from.id}_${d.nick}_${d.spec}`)],
                    [Markup.button.callback('❌ Отклонить', `adm_no_${ctx.from.id}`)]
                ])
            }).catch(e => console.error("Admin notify error:", e));
            
            await ctx.answerCbQuery();
            await ctx.reply('Заявка отправлена! ✨');
        }
        return ctx.scene.leave();
    }
);

// (Тут может быть аналогично исправленная сцена REPORT_WIZARD...)
// Для краткости я пропущу её текст, но структура такая же.

// --- ИНИЦИАЛИЗАЦИЯ STAGE ---
const stage = new Scenes.Stage([joinWizard]); // Добавь сюда reportWizard

// Обработка глобальной кнопки отмены внутри сцен
stage.action('exit_scene', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.scene.leave();
    return ctx.reply('Возврат в главное меню:', getMainMenu(ctx));
});

bot.use(stage.middleware());

// --- ОБРАБОТЧИКИ КОМАНД ---

bot.start((ctx) => ctx.replyWithHTML(`👋 <b>Bakelite Federation</b>\nБезопасность начинается с тебя.`, getMainMenu(ctx)));

bot.action('go_join', (ctx) => ctx.scene.enter('JOIN_WIZARD'));
bot.action('main', (ctx) => ctx.editMessageText('Чем я могу помочь?', getMainMenu(ctx)));

// Пример обработки принятия (исправлен regex)
bot.action(/^adm_ok_(\d+)_([\wА-я]+)_(.+)$/, async (ctx) => {
    if (ctx.from.id !== OWNER_ID) return;
    const [_, uid, nick, spec] = ctx.match;
    state.workers.set(Number(uid), { nick, spec });
    
    await bot.telegram.sendMessage(uid, '✨ <b>Вы приняты в команду!</b>', { parse_mode: 'HTML' }).catch(() => {});
    await ctx.editMessageText(`✅ Специалист ${nick} добавлен.`);
});

// --- ЗАПУСК ---
bot.launch().then(() => console.log('Bot started!'));

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
