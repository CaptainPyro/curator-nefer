// -------------------- KEEP ALIVE --------------------
const keepAlive = require('./keep_alive.js');
keepAlive();

// -------------------- DISCORD --------------------
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const Enmap = require('enmap').default;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// -------------------- CONFIG --------------------
const DASHBOARD_CHANNEL_ID = '1438801491052990556';
const DIRECTORY_CHANNEL_ID = '1426096588509548636';
const ABSTRACTED_ROLE_ID = '1438761961897852958';

const FOUR_HOURS = 4 * 60 * 60 * 1000;

const slots = [
    { name: "Anaxagoras", channelId: "1406663875855650977", roleId: "1426087099521830973", statusMessageId: "1426091781061214262" },
    { name: "Kantoku", channelId: "1424270783697518704", roleId: "1426087197668544523", statusMessageId: "1426092140131254366" },
    { name: "Blue Wolf", channelId: "1406667945698132028", roleId: "1426087159265362012", statusMessageId: "1426092280598757479" },
    { name: "The Claw", channelId: "1406841047950164060", roleId: "1426087223404662815", statusMessageId: "1426092551785545739" },
    { name: "Raptor", channelId: "1406849192747466842", roleId: "1426087270385057924", statusMessageId: "1426092759101476894" },
    { name: "Muffin", channelId: "1436611717462233199", roleId: "1436611514395136121", statusMessageId: "1437009694433738894" },
    { name: "Walnut", channelId: "1436655308104531989", roleId: "1436654744213917818", statusMessageId: "1437009605300326592" },
    { name: "Ying Hua", channelId: "1436655490129068124", roleId: "1436654621127872584", statusMessageId: "1437009499666907156" }
];

const slotDB = new Enmap({ name: "slots" });

// -------------------- HELPERS --------------------
function formatDate(ms) {
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function formatDuration(ms) {
    const total = Math.floor(ms / 1000);
    const h = String(Math.floor(total / 3600)).padStart(2,'0');
    const m = String(Math.floor((total % 3600) / 60)).padStart(2,'0');
    return `${h}:${m}`;
}

async function sendDashboardMessage(text) {
    const dash = await client.channels.fetch(DASHBOARD_CHANNEL_ID);
    return dash.send(text);
}

function startReminder(slotName) {
    return setTimeout(async () => {
        const data = slotDB.get(slotName);
        if (!data?.claimedUserId) return;

        const dash = await client.channels.fetch(DASHBOARD_CHANNEL_ID);
        dash.send(`⏰ Reminder: **${slotName}** is still occupied.`);
    }, FOUR_HOURS);
}

// -------------------- READY --------------------
client.once('clientReady', async () => {
    console.log(`Logged in as ${client.user.tag}`);

    for (const slot of slots) {
        const channel = await client.channels.fetch(slot.channelId);
        const msg = await channel.messages.fetch(slot.statusMessageId);

        if (!msg.reactions.cache.has('✅')) {
            await msg.react('✅');
        }
    }
});

// -------------------- REACTION ADD (LOGIN) --------------------
client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot) return;
    if (reaction.partial) await reaction.fetch();

    const slot = slots.find(
        s => s.channelId === reaction.message.channel.id &&
             s.statusMessageId === reaction.message.id &&
             reaction.emoji.name === '✅'
    );
    if (!slot) return;

    const existing = slotDB.get(slot.name);
    if (existing?.claimedUserId) {
        await reaction.users.remove(user.id);
        return;
    }

    const guild = reaction.message.guild;
    const member = guild.members.cache.get(user.id) || await guild.members.fetch(user.id);

    await member.roles.add(slot.roleId);

    const isAbstracted = member.roles.cache.has(ABSTRACTED_ROLE_ID);
    const text = isAbstracted
        ? `An **abstracted user** logged into **${slot.name}**`
        : `<@${user.id}> logged into **${slot.name}**`;

    const dashboardMsg = await sendDashboardMessage(text);

    const timer = startReminder(slot.name);

    slotDB.set(slot.name, {
        claimedUserId: user.id,
        loginAt: Date.now(),
        dashboardMessageId: dashboardMsg.id,
        timer
    });
});

// -------------------- REACTION REMOVE (LOGOUT) --------------------
client.on('messageReactionRemove', async (reaction, user) => {
    if (user.bot) return;
    if (reaction.partial) await reaction.fetch();

    const slot = slots.find(
        s => s.channelId === reaction.message.channel.id &&
             s.statusMessageId === reaction.message.id &&
             reaction.emoji.name === '✅'
    );
    if (!slot) return;

    const data = slotDB.get(slot.name);
    if (!data || data.claimedUserId !== user.id) return;

    const guild = reaction.message.guild;
    const member = guild.members.cache.get(user.id) || await guild.members.fetch(user.id);

    await member.roles.remove(slot.roleId);
    if (data.timer) clearTimeout(data.timer);

    // Delete dashboard login message
    try {
        const dash = await client.channels.fetch(DASHBOARD_CHANNEL_ID);
        const msg = await dash.messages.fetch(data.dashboardMessageId);
        await msg.delete();
    } catch {}

    // Directory log
    const dir = await client.channels.fetch(DIRECTORY_CHANNEL_ID);
    const login = data.loginAt;
    const logout = Date.now();

    await dir.send(
`Slot: ${slot.name}
User: <@${user.id}>
Login: ${formatDate(login)}
Logout: ${formatDate(logout)}
Total Time Played: ${formatDuration(logout - login)}`
    );

    // Free message
    const freeMsg1 = await reaction.message.channel.send(`**${slot.name}** slot is now free.`);
    const dash = await client.channels.fetch(DASHBOARD_CHANNEL_ID);
    const freeMsg2 = await dash.send(`**${slot.name}** slot is now free.`);

    setTimeout(() => {
        freeMsg1.delete().catch(() => {});
        freeMsg2.delete().catch(() => {});
    }, 10_000);

    slotDB.delete(slot.name);
});

// -------------------- LOGIN --------------------
client.login(process.env.DISCORD_TOKEN);
