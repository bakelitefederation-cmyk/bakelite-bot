const http = require('http');
http.createServer((req, res) => res.end('Bot is alive!')).listen(process.env.PORT || 3000);

const { Telegraf } = require('telegraf');
const bot = new Telegraf(process.env.BOT_TOKEN);

// Твой основной код бота дальше...
const { Telegraf, Scenes, session, Markup } = require('telegraf');

/**
 * AI INTERPRETATION BLOCK:
 * 1. Admin Panel: accessible via OWNER_ID only. Shows list of workers (Name, Role, ID).
 * 2. Cancelation: 'exit_scene' button on every step of WizardScenes.
 * 3. Tone: Friendly, empathetic, supportive AI assistant.
 */

const bot = new Telegraf(process.env.BOT_TOKEN);
const OWNER_ID = Number(process.env.ADMIN_CHAT_ID); 
const VERSION = "5.2.0-HUMANE";
const HOSTING = "Railway.app";

// Расширенная память для админ-панели
const state = {
    workers: new Map(), // ID -> { nick, spec }
    history: new Map()
};

// --- КНОПКА ОТМЕНЫ (ДЛЯ ВСЕХ СЦЕН) ---
const cancelBtn = [Markup.button.callback('↩️ Я передумал', 'exit_scene')];

// --- СЦЕНА 1: СТАТЬ ЗАЩИТНИКОМ ---
const joinWizard = new Scenes.WizardScene(
    'JOIN_WIZARD',
    async (ctx) => {
        ctx.wizard.state.data = {};
        await ctx.editMessageText('👋 <b>Рад твоему желанию помочь!</b>\nДля начала скажи, в каком регионе ты сможешь работать?', {
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
        await ctx.reply('Приятно познакомиться! Под каким <b>псевдонимом</b> тебя записать в реестр?', { parse_mode: 'HTML' });
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!ctx.message?.text) return ctx.reply('Напиши, пожалуйста, текстом.');
        ctx.wizard.state.data.nick = ctx.message.text;
        await ctx.reply('И последний штрих: какая твоя <b>специализация</b>? (Например: Этичный хакер, эксперт по OSINT или юрист)', { parse_mode: 'HTML' });
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!ctx.message?.text) return ctx.reply('Жду твою специализацию...');
        const d = ctx.wizard.state.data;
        d.spec = ctx.message.text;
        await ctx.replyWithHTML(`<b>Давай проверим твою анкету:</b>\n\n📍 Регион: ${d.region}\n👤 Твой ник: ${d.nick}\n🛠 Твои навыки: ${d.spec}\n\nВсё верно? Отправляем Создателю?`, 
            Markup.inlineKeyboard([
                [Markup.button.callback('✅ Всё верно, отправляй!', 'send')],
                cancelBtn
            ])
        );
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx.callbackQuery?.data === 'send') {
            const d = ctx.wizard.state.data;
            state.history.set(ctx.from.id, { type: 'Защитник', status: 'На проверке у @kartochniy' });
            
            await bot.telegram.sendMessage(OWNER_ID, 
                `👨‍✈️ <b>НОВАЯ АНКЕТА ЗАЩИТНИКА</b>\n\n` +
                `От: @${ctx.from.username || 'скрыто'}\n` +
                `🆔 ID: <code>${ctx.from.id}</code>\n` +
                `📍 Регион: ${d.region}\n` +
                `👤 Ник: ${d.nick}\n` +
                `🛠 Спец: ${d.spec}`, 
                {
                    parse_mode: 'HTML',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('✅ Принять в семью', `adm_ok_${ctx.from.id}_${d.nick}_${d.spec}`)],
                        [Markup.button.callback('❌ Отклонить', `adm_no_${ctx.from.id}`)]
                    ])
                }
            );
            await ctx.reply('Отлично! Твоя заявка уже на столе у Создателя. Скоро вернусь с ответом! ✨');
        }
        return ctx.scene.leave();
    }
);

// --- СЦЕНА 2: ЗАПРОС ПОМОЩИ ---
const reportWizard = new Scenes.WizardScene(
    'REPORT_WIZARD',
    async (ctx) => {
        ctx.wizard.state.data = {};
        await ctx.editMessageText('<b>Мне очень жаль, что ты столкнулся с проблемой.</b>\nДавай попробуем разобраться. Где это случилось?', {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('РФ', 'r_RU'), Markup.button.callback('УА', 'r_UA'), Markup.button.callback('КЗ', 'r_KZ'), Markup.button.callback('Другое', 'r_MANUAL')],
                cancelBtn
            ])
        });
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!ctx.callbackQuery) return;
        ctx.wizard.state.data.region = ctx.callbackQuery.data.replace('r_', '');
        await ctx.answerCbQuery();
        await ctx.reply('С чем именно ты столкнулся? (Вымогательство, шантаж, взлом...)', Markup.inlineKeyboard([
            [Markup.button.callback('Вымогательство', 't_EXT'), Markup.button.callback('Шантаж/Буллинг', 't_BULLY')],
            [Markup.button.callback('Другое', 't_OTHER')],
            cancelBtn
        ]));
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!ctx.callbackQuery) return;
        ctx.wizard.state.data.type = ctx.callbackQuery.data.replace('t_', '');
        await ctx.answerCbQuery();
        await ctx.reply('Пожалуйста, опиши ситуацию подробнее. Чем больше деталей, тем быстрее мы поможем:');
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!ctx.message?.text) return;
        ctx.wizard.state.data.desc = ctx.message.text;
        await ctx.reply('Я готов передать твой сигнал команде защиты. Отправляем?', Markup.inlineKeyboard([
            [Markup.button.callback('🚀 Да, помогите!', 'confirm')],
            cancelBtn
        ]));
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx.callbackQuery?.data === 'confirm') {
            const d = ctx.wizard.state.data;
            const rid = Math.floor(Math.random() * 9000) + 1000;
            state.history.set(ctx.from.id, { type: 'Помощь', status: 'Поиск свободного защитника', rid });

            const workersList = [OWNER_ID, ...Array.from(state.workers.keys())];
            for (const wid of workersList) {
                await bot.telegram.sendMessage(wid, 
                    `⚠️ <b>НУЖНА ПОМОЩЬ #${rid}</b>\n\n` +
                    `👤 Жертва: @${ctx.from.username || 'скрыто'}\n` +
                    `🆔 ID: <code>${ctx.from.id}</code>\n` +
                    `📁 Тип: ${d.type}\n` +
                    `📝 Описание: ${d.desc}`, {
                    parse_mode: 'HTML',
                    ...Markup.inlineKeyboard([[Markup.button.callback('🛡️ Взять в работу', `w_take_${ctx.from.id}_${rid}`)]])
                }).catch(() => {});
            }
            await ctx.reply('Твой сигнал принят. Не паникуй, наши специалисты скоро свяжутся с тобой! 🙌');
        }
        return ctx.scene.leave();
    }
);

// --- ГЛАВНОЕ МЕНЮ И СЕРВИСНЫЕ КОМАНДЫ ---

const stage = new Scenes.Stage([joinWizard, reportWizard]);
stage.action('exit_scene', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('Без проблем! Если что, я всегда здесь, в главном меню. 👇');
    await ctx.scene.leave();
    return ctx.reply('Главное меню:', getMainMenu(ctx));
});

bot.use(session());
bot.use(stage.middleware());

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

bot.start((ctx) => ctx.replyWithHTML(
    `👋 <b>Приветствую в Bakelite Federation!</b>\n\n` +
    `Я твой проводник в мире цифровой безопасности. Здесь мы помогаем друг другу и боремся с угрозами в сети.\n\n` +
    `Чем я могу быть полезен сегодня?\n\n` +
    `💠 <code>v${VERSION}</code> | ☁️ <code>${HOSTING}</code>`, 
    getMainMenu(ctx)
));

bot.action('go_join', (ctx) => ctx.scene.enter('JOIN_WIZARD'));
bot.action('go_report', (ctx) => ctx.scene.enter('REPORT_WIZARD'));

// --- ЛОГИКА АДМИН-ПАНЕЛИ ---

bot.action('go_admin', async (ctx) => {
    if (ctx.from.id !== OWNER_ID) return;
    let list = `<b>👑 АДМИН-ПАНЕЛЬ</b>\n\n` +
               `👥 Всего защитников: <b>${state.workers.size}</b>\n` +
               `--------------------------\n`;
    
    if (state.workers.size === 0) list += "Список пуст...";
    
    for (const [id, info] of state.workers) {
        list += `🔹 ${info.nick} [${info.spec}]\n🆔 <code>${id}</code>\n\n`;
    }

    await ctx.editMessageText(list, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('🔙 В меню', 'main')]])
    });
});

// --- ПРИНЯТИЕ / ОТКЛОНЕНИЕ ---

bot.action(/^adm_ok_(.+)_(.+)_(.+)$/, async (ctx) => {
    if (ctx.from.id !== OWNER_ID) return;
    const [_, uid, nick, spec] = ctx.match;
    state.workers.set(Number(uid), { nick, spec });
    state.history.set(Number(uid), { type: 'Защитник', status: 'Активен' });
    
    await bot.telegram.sendMessage(uid, '✨ <b>Добро пожаловать в команду!</b>\nТеперь ты будешь получать экстренные уведомления. Рады тебе!', { parse_mode: 'HTML' });
    ctx.editMessageText(`✅ Специалист ${nick} успешно добавлен в команду.`);
});

bot.action(/^adm_no_(.+)$/, async (ctx) => {
    const uid = Number(ctx.match[1]);
    await bot.telegram.sendMessage(uid, 'К сожалению, твоя анкета была отклонена. Но ты всегда можешь попробовать позже!');
    ctx.editMessageText('❌ Заявка отклонена.');
});

// --- ОБЩИЕ ФУНКЦИИ ---

bot.action(/^w_take_(.+)_(.+)$/, async (ctx) => {
    const [_, uid, rid] = ctx.match;
    state.history.set(Number(uid), { type: 'Помощь', status: `В работе у @${ctx.from.username}`, rid });
    await bot.telegram.sendMessage(uid, `🛡️ <b>Хорошие новости!</b> Защитник @${ctx.from.username} взял твою заявку #${rid}. Скоро всё наладится!`, { parse_mode: 'HTML' });
    ctx.editMessageText(`✅ Вы взяли кейс #${rid}. Удачи!`);
});

bot.action('go_status', (ctx) => {
    const s = state.history.get(ctx.from.id);
    const text = s ? `<b>Твой текущий статус:</b>\n\n${s.type}: <b>${s.status}</b>` : 'Пока здесь пусто. Как только ты оставишь заявку, она появится тут!';
    ctx.replyWithHTML(text, Markup.inlineKeyboard([[Markup.button.callback('🔙 В меню', 'main')]]));
});

bot.action('main', (ctx) => ctx.editMessageText('Чем я могу помочь?', getMainMenu(ctx)));
bot.action('go_help', (ctx) => ctx.reply('Я — официальный бот Bakelite Federation. Моя цель — связь между жертвами и защитниками. Создатель: @kartochniy', Markup.inlineKeyboard([[Markup.button.callback('🔙 В меню', 'main')]])));

bot.launch();
