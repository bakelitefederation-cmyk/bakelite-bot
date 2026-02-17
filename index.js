/**
 * BAKELITE FEDERATION - ULTIMATE CORE v5.0
 * Специально для @kartochniy
 * Реализация: Сцены, Сессии, Глобальный трекинг, Ролевая модель
 */

const { Telegraf, Scenes, session, Markup } = require('telegraf');

// --- ИНИЦИАЛИЗАЦИЯ ---
const bot = new Telegraf(process.env.BOT_TOKEN);
const OWNER_ID = Number(process.env.ADMIN_CHAT_ID); 
const OWNER_HANDLE = '@kartochniy';
const VERSION = "5.0.1-STABLE";

// --- ГЛОБАЛЬНАЯ ПАМЯТЬ ---
const system = {
    workers: new Set(),      // ID одобренных защитников
    activeReports: new Map(), // Все жалобы в реальном времени
    userRegistry: new Map()   // История для /status
};

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ (ГВАРДЫ) ---
const isOwner = (id) => id === OWNER_ID;
const isWorker = (id) => system.workers.has(id) || id === OWNER_ID;

const getMainMenu = (ctx) => {
    const buttons = [
        [Markup.button.callback('🛡️ Стать защитником', 'start_join')],
        [Markup.button.callback('🆘 Запросить помощь', 'start_report')],
        [Markup.button.callback('📊 Статус моей заявки', 'check_status')],
        [Markup.button.callback('ℹ️ Справка', 'show_help')]
    ];
    return Markup.inlineKeyboard(buttons);
};

// --- СЦЕНА 1: JOIN (ПОДАЧА ЗАЯВКИ В ЗАЩИТНИКИ) ---
const joinWizard = new Scenes.WizardScene(
    'JOIN_WIZARD',
    // 1. Выбор региона
    async (ctx) => {
        ctx.wizard.state.formData = {};
        await ctx.replyWithHTML('<b>🛡️ ШАГ 1:</b> Выберите ваш регион деятельности:', 
            Markup.inlineKeyboard([
                [Markup.button.callback('Россия', 'jreg_RU'), Markup.button.callback('Украина', 'jreg_UA')],
                [Markup.button.callback('Казахстан', 'jreg_KZ'), Markup.button.callback('Другое', 'jreg_OTHER')],
                [Markup.button.callback('❌ Отмена', 'exit_scene')]
            ])
        );
        return ctx.wizard.next();
    },
    // 2. Псевдоним
    async (ctx) => {
        if (!ctx.callbackQuery) return ctx.reply('Используйте кнопки выше!');
        ctx.wizard.state.formData.region = ctx.callbackQuery.data.split('_')[1];
        await ctx.answerCbQuery();
        await ctx.reply('<b>ШАГ 2:</b> Введите ваш Псевдоним (Никнейм):', { parse_mode: 'HTML' });
        return ctx.wizard.next();
    },
    // 3. Специальность
    async (ctx) => {
        if (!ctx.message?.text) return ctx.reply('Нужно ввести текст!');
        ctx.wizard.state.formData.nick = ctx.message.text;
        await ctx.reply('<b>ШАГ 3:</b> Укажите вашу специальность (кем вы являетесь):', { parse_mode: 'HTML' });
        return ctx.wizard.next();
    },
    // 4. Подтверждение
    async (ctx) => {
        if (!ctx.message?.text) return ctx.reply('Нужно ввести текст!');
        const d = ctx.wizard.state.formData;
        d.spec = ctx.message.text;
        await ctx.replyWithHTML(`<b>ПРОВЕРКА АНКЕТЫ:</b>\n\nРегион: ${d.region}\nНик: ${d.nick}\nСпец: ${d.spec}`, 
            Markup.inlineKeyboard([
                [Markup.button.callback('✅ Отправить Создателю', 'send_join')],
                [Markup.button.callback('❌ Сбросить', 'exit_scene')]
            ])
        );
        return ctx.wizard.next();
    },
    // 5. Финал и уведомление Создателя
    async (ctx) => {
        if (ctx.callbackQuery?.data === 'send_join') {
            const d = ctx.wizard.state.formData;
            system.userRegistry.set(ctx.from.id, { type: 'Вступление', status: 'Ожидает одобрения @kartochniy' });
            
            await bot.telegram.sendMessage(OWNER_ID, 
                `👨‍⚖️ <b>НОВАЯ ЗАЯВКА В ЗАЩИТНИКИ</b>\n\n` +
                `Юзер: @${ctx.from.username || 'скрыто'}\n` +
                `ID: <code>${ctx.from.id}</code>\n` +
                `Регион: ${d.region}\n` +
                `Ник: ${d.nick}\n` +
                `Спец: ${d.spec}`, 
                {
                    parse_mode: 'HTML',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('✅ ПРИНЯТЬ', `adm_approve_${ctx.from.id}`)],
                        [Markup.button.callback('❌ ОТКЛОНИТЬ', `adm_decline_${ctx.from.id}`)]
                    ])
                }
            );
            await ctx.reply('✅ Ваша заявка передана @kartochniy. Ожидайте решения.');
        }
        return ctx.scene.leave();
    }
);

// --- СЦЕНА 2: REPORT (ЗАПРОС ПОМОЩИ) ---
const reportWizard = new Scenes.WizardScene(
    'REPORT_WIZARD',
    // 1. Регион
    async (ctx) => {
        ctx.wizard.state.rep = {};
        await ctx.replyWithHTML('<b>🆘 ПОМОЩЬ:</b> Выберите регион происшествия:', 
            Markup.inlineKeyboard([
                [Markup.button.callback('Россия', 'rreg_RU'), Markup.button.callback('Украина', 'rreg_UA')],
                [Markup.button.callback('Казахстан', 'rreg_KZ'), Markup.button.callback('Другое', 'rreg_MANUAL')],
                [Markup.button.callback('❌ Отмена', 'exit_scene')]
            ])
        );
        return ctx.wizard.next();
    },
    // 2. Обработка региона
    async (ctx) => {
        if (!ctx.callbackQuery) return;
        const choice = ctx.callbackQuery.data.split('_')[1];
        if (choice === 'MANUAL') {
            await ctx.reply('Напишите название страны вручную:');
            return ctx.wizard.next();
        }
        ctx.wizard.state.rep.region = choice;
        return askCrimeType(ctx);
    },
    // 3. Ручной ввод страны (если выбран MANUAL)
    async (ctx) => {
        ctx.wizard.state.rep.region = ctx.message.text;
        return askCrimeType(ctx);
    },
    // 4. Тип преступления
    async (ctx) => {
        if (!ctx.callbackQuery) return;
        const type = ctx.callbackQuery.data.split('_')[1];
        if (type === 'OTHER') {
            await ctx.reply('Напишите вид киберпреступности:');
            return ctx.wizard.next();
        }
        ctx.wizard.state.rep.type = type;
        return askDescription(ctx);
    },
    // 5. Ручной ввод типа
    async (ctx) => {
        ctx.wizard.state.rep.type = ctx.message.text;
        return askDescription(ctx);
    },
    // 6. Описание
    async (ctx) => {
        if (!ctx.message?.text) return ctx.reply('Опишите проблему подробно!');
        ctx.wizard.state.rep.desc = ctx.message.text;
        await ctx.reply('<b>Все верно?</b> Отправляем заявку защитникам?', {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('🚀 ОТПРАВИТЬ', 'rep_final_confirm')],
                [Markup.button.callback('❌ СБРОСИТЬ', 'exit_scene')]
            ])
        });
        return ctx.wizard.next();
    },
    // 7. Рассылка защитникам
    async (ctx) => {
        if (ctx.callbackQuery?.data === 'rep_final_confirm') {
            const d = ctx.wizard.state.rep;
            const rid = `ID-${Math.floor(Math.random()*9000)+1000}`;
            system.activeReports.set(ctx.from.id, { rid, status: 'Поиск защитника', data: d });
            system.userRegistry.set(ctx.from.id, { type: 'Помощь', status: 'В очереди', rid });

            // Оповещаем ВСЕХ одобренных защитников
            for (const workerId of system.workers) {
                await bot.telegram.sendMessage(workerId, 
                    `⚠️ <b>НОВЫЙ ЗАПРОС #${rid}</b>\n\n` +
                    `Регион: ${d.region}\nТип: ${d.type}\nОписание: ${d.desc}`, 
                    Markup.inlineKeyboard([
                        [Markup.button.callback('🛡️ ПРИНЯТЬ КЕЙС', `work_accept_${ctx.from.id}_${rid}`)],
                        [Markup.button.callback('🚫 ОТКЛОНИТЬ', `work_reject_${ctx.from.id}_${rid}`)]
                    ])
                ).catch(() => {});
            }
            await ctx.reply(`✅ Заявка #${rid} создана. Мы уведомили команду защиты.`);
        }
        return ctx.scene.leave();
    }
);

// Хелперы для Сцены Репорта
const askCrimeType = async (ctx) => {
    await ctx.reply('Выберите вид преступления:', Markup.inlineKeyboard([
        [Markup.button.callback('Вымогательство', 'rtype_EXT'), Markup.button.callback('Мошенничество', 'rtype_SCAM')],
        [Markup.button.callback('Другое', 'rtype_OTHER')]
    ]));
    return ctx.wizard.selectStep(3);
};
const askDescription = async (ctx) => {
    await ctx.reply('Подробно опишите вашу проблему:');
    return ctx.wizard.selectStep(5);
};

// --- МЕНЕДЖМЕНТ СЦЕН ---
const stage = new Scenes.Stage([joinWizard, reportWizard]);
stage.action('exit_scene', (ctx) => {
    ctx.answerCbQuery();
    ctx.reply('Действие отменено.', getMainMenu(ctx));
    return ctx.scene.leave();
});

bot.use(session());
bot.use(stage.middleware());

// --- ОБРАБОТКА ОСНОВНЫХ КОМАНД ---

bot.start((ctx) => {
    ctx.replyWithHTML(`<b>Bakelite Federation System</b>\nВерсия: ${VERSION}\n\nВыберите действие:`, getMainMenu(ctx));
});

bot.command('menu', (ctx) => ctx.reply('Главное меню:', getMainMenu(ctx)));
bot.action('start_join', (ctx) => ctx.scene.enter('JOIN_WIZARD'));
bot.action('start_report', (ctx) => ctx.scene.enter('REPORT_WIZARD'));

// --- ЛОГИКА АДМИНИСТРАТОРА (ТЕБЯ) ---

bot.action(/^adm_approve_(.+)$/, async (ctx) => {
    if (!isOwner(ctx.from.id)) return ctx.answerCbQuery('Доступ закрыт!');
    const targetId = Number(ctx.match[1]);
    system.workers.add(targetId);
    system.userRegistry.set(targetId, { type: 'Защитник', status: 'АКТИВЕН' });
    
    await bot.telegram.sendMessage(targetId, '🎉 <b>@kartochniy одобрил вашу заявку!</b>\nТеперь вы получаете запросы о помощи.', { parse_mode: 'HTML' });
    ctx.editMessageText(ctx.callbackQuery.message.text + '\n\n✅ <b>ОДОБРЕНО ВАМИ</b>');
});

bot.action(/^adm_decline_(.+)$/, async (ctx) => {
    if (!isOwner(ctx.from.id)) return;
    const targetId = Number(ctx.match[1]);
    system.userRegistry.set(targetId, { type: 'Защитник', status: 'ОТКЛОНЕН' });
    await bot.telegram.sendMessage(targetId, '❌ Ваша заявка в защитники была отклонена.');
    ctx.editMessageText(ctx.callbackQuery.message.text + '\n\n❌ <b>ОТКЛОНЕНО ВАМИ</b>');
});

// --- ЛОГИКА ЗАЩИТНИКОВ ---

bot.action(/^work_accept_(.+)_(.+)$/, async (ctx) => {
    const [_, victimId, rid] = ctx.match;
    if (!isWorker(ctx.from.id)) return ctx.answerCbQuery('Вы не защитник!');

    const report = system.activeReports.get(Number(victimId));
    if (!report || report.status !== 'Поиск защитника') return ctx.answerCbQuery('Уже в работе или удалено.');

    report.status = 'В работе';
    system.userRegistry.set(Number(victimId), { type: 'Помощь', status: `Принята защитником @${ctx.from.username}`, rid });

    await bot.telegram.sendMessage(victimId, `🛡️ <b>Защитник @${ctx.from.username} принял ваш запрос #${rid}!</b>\nОжидайте связи в ЛС.`, { parse_mode: 'HTML' });
    await bot.telegram.sendMessage(OWNER_ID, `📣 Защитник @${ctx.from.username} взял кейс #${rid}`);
    
    ctx.editMessageText(ctx.callbackQuery.message.text + `\n\n✅ <b>ПРИНЯТО ВАМИ (@${ctx.from.username})</b>`);
});

bot.action(/^work_reject_(.+)_(.+)$/, (ctx) => {
    if (!isWorker(ctx.from.id)) return;
    ctx.editMessageText('🚫 Вы отклонили этот запрос.');
});

// --- СТАТУС И ПОМОЩЬ ---

bot.action('check_status', (ctx) => {
    const s = system.userRegistry.get(ctx.from.id);
    const text = s ? `📊 <b>Ваш статус:</b>\n\nТип: ${s.type}\nСтатус: ${s.status}` : 'У вас нет активных заявок.';
    ctx.replyWithHTML(text, Markup.inlineKeyboard([[Markup.button.callback('🔙 В меню', 'main_menu')]]));
});

bot.action('show_help', (ctx) => {
    ctx.replyWithHTML('<b>Справка Bakelite Bot:</b>\n\n/start - Главное меню\n/menu - Вернуться к кнопкам\n\nСистема создана для борьбы с киберпреступностью.', Markup.inlineKeyboard([[Markup.button.callback('🔙 В меню', 'main_menu')]]));
});

bot.action('main_menu', (ctx) => {
    ctx.answerCbQuery();
    ctx.replyWithHTML('Главное меню:', getMainMenu(ctx));
});

// --- ЗАПУСК ---
bot.launch().then(() => console.log('>>> БОТ BAKELITE СТАРТОВАЛ БЕЗ ОШИБОК'));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
