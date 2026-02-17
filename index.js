const { Telegraf, Scenes, session, Markup } = require('telegraf');

/**
 * AI INTERPRETATION BLOCK / ИНСТРУКЦИЯ ДЛЯ ИИ:
 * 1. Role System: OWNER (fixed ID), WORKER (Set in RAM), USER (everyone).
 * 2. Scene Logic: WizardScenes for 'JOIN' and 'REPORT' to prevent input mixing.
 * 3. Data Flow: Join requests go ONLY to OWNER. Report requests go to ALL Workers + Owner.
 * 4. UX: All IDs must be wrapped in <code> for click-to-copy. Navigation via Inline Buttons.
 * 5. Environment: BOT_TOKEN, ADMIN_CHAT_ID (Owner).
 */

const bot = new Telegraf(process.env.BOT_TOKEN);
const OWNER_ID = Number(process.env.ADMIN_CHAT_ID); 
const VERSION = "5.1.0-STABLE";
const HOSTING = "Railway.app (Free Tier)";

const state = {
    workers: new Set(),
    history: new Map() // Юзер ID -> Последний статус
};

// --- СЦЕНЫ ---

const joinWizard = new Scenes.WizardScene(
    'JOIN_WIZARD',
    async (ctx) => {
        ctx.wizard.state.data = {};
        await ctx.replyWithHTML('<b>🛡️ ШАГ 1: ВЫБОР РЕГИОНА</b>\nУкажите зону вашей оперативной деятельности:', 
            Markup.inlineKeyboard([
                [Markup.button.callback('Россия', 'j_RU'), Markup.button.callback('Украина', 'j_UA')],
                [Markup.button.callback('Казахстан', 'j_KZ'), Markup.button.callback('Другое', 'j_OTHER')],
                [Markup.button.callback('❌ Отмена', 'cancel')]
            ])
        );
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!ctx.callbackQuery) return;
        ctx.wizard.state.data.region = ctx.callbackQuery.data.replace('j_', '');
        await ctx.answerCbQuery();
        await ctx.reply('<b>ШАГ 2:</b> Введите ваш Псевдоним (Позывной):');
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!ctx.message?.text) return ctx.reply('Введите текст!');
        ctx.wizard.state.data.nick = ctx.message.text;
        await ctx.reply('<b>ШАГ 3:</b> Укажите вашу специализацию (напр. OSINT, Social Engineering, Security):');
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!ctx.message?.text) return ctx.reply('Введите текст!');
        const d = ctx.wizard.state.data;
        d.spec = ctx.message.text;
        await ctx.replyWithHTML(`<b>ПРОВЕРКА АНКЕТЫ КАНДИДАТА:</b>\n\n📍 Регион: ${d.region}\n👤 Ник: ${d.nick}\n🛠 Спец: ${d.spec}`, 
            Markup.inlineKeyboard([
                [Markup.button.callback('✅ Отправить Создателю', 'send')],
                [Markup.button.callback('❌ Сбросить', 'cancel')]
            ])
        );
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx.callbackQuery?.data === 'send') {
            const d = ctx.wizard.state.data;
            state.history.set(ctx.from.id, { type: 'Защитник', status: 'На рассмотрении у Создателя' });
            
            await bot.telegram.sendMessage(OWNER_ID, 
                `👨‍✈️ <b>НОВАЯ ЗАЯВКА В ЗАЩИТНИКИ</b>\n\n` +
                `👤 От: @${ctx.from.username || 'скрыто'}\n` +
                `🆔 ID: <code>${ctx.from.id}</code>\n` +
                `📍 Регион: ${d.region}\n` +
                `👤 Ник: ${d.nick}\n` +
                `🛠 Спец: ${d.spec}`, 
                {
                    parse_mode: 'HTML',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('✅ Принять', `adm_ok_${ctx.from.id}`)],
                        [Markup.button.callback('❌ Отклонить', `adm_no_${ctx.from.id}`)]
                    ])
                }
            );
            await ctx.reply('✅ Ваша анкета передана на верификацию Создателю.');
        }
        return ctx.scene.leave();
    }
);

const reportWizard = new Scenes.WizardScene(
    'REPORT_WIZARD',
    async (ctx) => {
        ctx.wizard.state.data = {};
        await ctx.replyWithHTML('<b>🆘 СЛУЖБА ПОДДЕРЖКИ: ШАГ 1</b>\nГде произошел инцидент?', 
            Markup.inlineKeyboard([
                [Markup.button.callback('РФ', 'r_RU'), Markup.button.callback('УА', 'r_UA'), Markup.button.callback('КЗ', 'r_KZ'), Markup.button.callback('Другое', 'r_MANUAL')]
            ])
        );
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!ctx.callbackQuery) return;
        const reg = ctx.callbackQuery.data.replace('r_', '');
        if (reg === 'MANUAL') {
            await ctx.reply('Укажите страну вручную:');
            return ctx.wizard.next();
        }
        ctx.wizard.state.data.region = reg;
        return askType(ctx);
    },
    async (ctx) => { ctx.wizard.state.data.region = ctx.message.text; return askType(ctx); },
    async (ctx) => {
        if (!ctx.callbackQuery) return;
        const type = ctx.callbackQuery.data.replace('t_', '');
        if (type === 'MANUAL') {
            await ctx.reply('Опишите вид угрозы кратко (1-2 слова):');
            return ctx.wizard.next();
        }
        ctx.wizard.state.data.type = type;
        return askDesc(ctx);
    },
    async (ctx) => { ctx.wizard.state.data.type = ctx.message.text; return askDesc(ctx); },
    async (ctx) => {
        if (!ctx.message?.text) return;
        ctx.wizard.state.data.desc = ctx.message.text;
        await ctx.reply('Подтвердите отправку экстренного сигнала команде защиты:', Markup.inlineKeyboard([
            [Markup.button.callback('🚀 ОТПРАВИТЬ', 'confirm')],
            [Markup.button.callback('❌ ОТМЕНА', 'cancel')]
        ]));
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx.callbackQuery?.data === 'confirm') {
            const d = ctx.wizard.state.data;
            const rid = Math.floor(Math.random() * 9000) + 1000;
            state.history.set(ctx.from.id, { type: 'Помощь', status: 'В очереди (поиск специалиста)', rid });

            const workersList = [OWNER_ID, ...Array.from(state.workers)];
            for (const wid of workersList) {
                await bot.telegram.sendMessage(wid, 
                    `⚠️ <b>SOS: ЗАПРОС ПОМОЩИ #${rid}</b>\n\n` +
                    `👤 Жертва: @${ctx.from.username || 'скрыто'}\n` +
                    `🆔 ID жертвы: <code>${ctx.from.id}</code>\n` +
                    `📍 Регион: ${d.region}\n` +
                    `📂 Тип: ${d.type}\n` +
                    `📝 Описание: ${d.desc}`, {
                    parse_mode: 'HTML',
                    ...Markup.inlineKeyboard([[Markup.button.callback('🛡️ Взять в работу', `w_take_${ctx.from.id}_${rid}`)]])
                }).catch(() => {});
            }
            await ctx.reply(`✅ Заявка #${rid} отправлена всем дежурным специалистам.`);
        }
        return ctx.scene.leave();
    }
);

function askType(ctx) {
    ctx.reply('Вид нарушения:', Markup.inlineKeyboard([
        [Markup.button.callback('Вымогательство', 't_EXT'), Markup.button.callback('Мошенничество', 't_SCAM')],
        [Markup.button.callback('Другое', 't_MANUAL')]
    ]));
    return ctx.wizard.selectStep(3);
}
function askDesc(ctx) {
    ctx.reply('Подробно опишите ситуацию (текстом):');
    return ctx.wizard.selectStep(5);
}

// --- ОСНОВНОЕ МЕНЮ ---

const stage = new Scenes.Stage([joinWizard, reportWizard]);
stage.action('cancel', (ctx) => {
    ctx.answerCbQuery();
    ctx.reply('Действие отменено пользователем.', menu);
    return ctx.scene.leave();
});

bot.use(session());
bot.use(stage.middleware());

const menu = Markup.inlineKeyboard([
    [Markup.button.callback('🛡️ Стать защитником', 'go_join')],
    [Markup.button.callback('🆘 Запросить помощь', 'go_report')],
    [Markup.button.callback('📊 Статус моей заявки', 'go_status')],
    [Markup.button.callback('ℹ️ Справка', 'go_help')]
]);

bot.start((ctx) => ctx.replyWithHTML(
    `<b>ДОБРО ПОЖАЛОВАТЬ В СИСТЕМУ BAKELITE</b>\n` +
    `--------------------------------------\n` +
    `Центр координации защитников и помощи жертвам киберпреступности. ` +
    `Если вы столкнулись с угрозой или хотите вступить в наши ряды — используйте кнопки управления ниже.\n\n` +
    `<b>Версия:</b> <code>${VERSION}</code>\n` +
    `<b>Хостинг:</b> <code>${HOSTING}</code>`, 
    menu
));

bot.command('menu', (ctx) => ctx.reply('Выберите действие:', menu));
bot.action('go_join', (ctx) => ctx.scene.enter('JOIN_WIZARD'));
bot.action('go_report', (ctx) => ctx.scene.enter('REPORT_WIZARD'));

// --- ЛОГИКА ВЗАИМОДЕЙСТВИЯ ---

bot.action(/^adm_(ok|no)_(.+)$/, async (ctx) => {
    if (ctx.from.id !== OWNER_ID) return ctx.answerCbQuery('Доступ только для Создателя.');
    const [_, act, uid] = ctx.match;
    const ok = act === 'ok';
    if (ok) state.workers.add(Number(uid));
    state.history.set(Number(uid), { type: 'Защитник', status: ok ? 'Одобрен (Активен)' : 'Отклонен' });
    
    await bot.telegram.sendMessage(uid, ok ? '✅ <b>Вы приняты в команду!</b> Теперь вы будете получать уведомления о запросах помощи.' : '❌ Ваша заявка в команду защитников отклонена.', { parse_mode: 'HTML' });
    ctx.editMessageText(ok ? '✅ КАНДИДАТ ПРИНЯТ' : '❌ КАНДИДАТ ОТКЛОНЕН');
});

bot.action(/^w_take_(.+)_(.+)$/, async (ctx) => {
    const [_, uid, rid] = ctx.match;
    if (ctx.from.id !== OWNER_ID && !state.workers.has(ctx.from.id)) return ctx.answerCbQuery('У вас нет прав защитника.');
    
    state.history.set(Number(uid), { type: 'Помощь', status: `Принята специалистом @${ctx.from.username || 'защитником'}`, rid });
    await bot.telegram.sendMessage(uid, `🛡️ <b>Ваша заявка #${rid} принята!</b> Специалист @${ctx.from.username} уже работает над ней.`, { parse_mode: 'HTML' });
    await bot.telegram.sendMessage(OWNER_ID, `📣 Защитник @${ctx.from.username} (ID: <code>${ctx.from.id}</code>) взял кейс #${rid}`, { parse_mode: 'HTML' });
    ctx.editMessageText(`✅ Вы взяли кейс #${rid} в работу.`);
});

bot.action('go_status', (ctx) => {
    const s = state.history.get(ctx.from.id);
    const text = s ? `<b>ВАША ТЕКУЩАЯ АКТИВНОСТЬ:</b>\n\nОбъект: ${s.type}\nСтатус: ${s.status}` : 'У вас нет активных или завершенных заявок.';
    ctx.replyWithHTML(text, Markup.inlineKeyboard([[Markup.button.callback('🔙 В меню', 'main')]]));
});

bot.action('main', (ctx) => ctx.editMessageText('Выберите действие:', menu));
bot.action('go_help', (ctx) => ctx.reply('Справка: Используйте меню для взаимодействия. Создатель: @kartochniy.', Markup.inlineKeyboard([[Markup.button.callback('🔙 В меню', 'main')]])));

bot.launch();
