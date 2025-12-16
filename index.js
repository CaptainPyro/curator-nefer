// Keep-alive
const keepAlive = require('./keep_alive.js');
keepAlive();

const { Client, GatewayIntentBits, Partials } = require('discord.js');
const Enmap = require('enmap').default;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// ---------------- CONFIG ----------------
const DASHBOARD_CHANNEL_ID = '1438801491052990556';
const DIRECTORY_CHANNEL_ID = '1426096588509548636';
const REMINDER_LOG_CHANNEL_ID = '1450317266339102750';
const ABSTRACTED_ROLE = '1438761961897852958';

const REMINDER_INTERVAL = 4 * 60 * 60 * 1000; // 4 hours

const slots = [
    { name: "Anaxagoras", channelId: "1406663875855650977", roleId: "1426087099521830973", emoji: "✅", statusMessageId: "1426091781061214262" },
    { name: "Kantoku", channelId: "1424270783697518704", roleId: "1426087197668544523", emoji: "✅", statusMessageId: "1426092140131254366" },
    { name: "Blue Wolf", channelId: "1406667945698132028", roleId: "1426087159265362012", emoji: "✅", statusMessageId: "1426092280598757479" },
    { name: "The Claw", channelId: "1406841047950164060", roleId: "1426087223404662815", emoji: "✅", statusMessageId: "1426092551785545739" },
    { name: "Raptor", channelId: "1406849192747466842", roleId: "1426087270385057924", emoji: "✅", statusMessageId: "1426092759101476894" },
    { name: "Muffin", channelId: "1436611717462233199", roleId: "1436611514395136121", emoji: "✅", statusMessageId: "1437009694433738894" },
    { name: "Walnut", channelId: "1436655308104531989", roleId: "1436654744213917818", emoji: "✅", statusMessageId: "1437009605300326592" },
    { name: "Ying Hua", channelId: "1436655490129068124", roleId: "1436654621127872584", emoji: "✅", statusMessageId: "1437009499666907156" }
];

// ---------------- STORAGE ----------------
const slotDB = new Enmap({ name: "slots" });
const reminderTimers = new Map(); // slotName -> interval

// ---------------- HELPERS ----------------
function formatIST(ms) {
    const d = new Date(ms + 5.5 * 60 * 60 * 1000);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function formatDuration(ms) {
    const total = Math.floor(ms / 1000);
    const h = String(Math.floor(total / 3600)).padStart(2, '0');
    const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
    return `${h}:${m}`;
}

// ---------------- REMINDER ----------------
function startReminder(slot, userId) {
    stopReminder(slot.name);

    const interval = setInterval(async () => {
        try {
            const user = await client.users.fetch(userId);
            await user.send(`⏰ Reminder: You are still logged into **${slot.name}**.`);

            const log = await client.channels.fetch(REMINDER_LOG_CHANNEL_ID);
            log.send(`Reminder sent to <@${userId}> for **${slot.name}**`);
        } catch {}
    }, REMINDER_INTERVAL);

    reminderTimers.set(slot.name, interval);
}

function stopReminder(slotName) {
    if (reminderTimers.has(slotName)) {
        clearInterval(reminderTimers.get(slotName));
        reminderTimers.delete(slotName);
    }
}

// ---------------- READY ----------------
client.once('clientReady', async () => {
    console.log(`Logged in as ${client.user.tag}`);

    for (const slot of slots) {
        const channel = await client.channels.fetch(slot.channelId);
        const msg = await channel.messages.fetch(slot.statusMessageId);

        if (!msg.reactions.cache.has(slot.emoji)) {
            await msg.react(slot.emoji);
        }
    }
});

// ---------------- REACTIONS ----------------
client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot) return;
    if (reaction.partial) await reaction.fetch();

    const slot = slots.find(s =>
        s.channelId === reaction.message.channel.id &&
        s.emoji === reaction.emoji.name
    );
    if (!slot) return;

    const stored = slotDB.get(slot.name);
    if (stored?.claimedUserId) {
        reaction.users.remove(user.id);
        return;
    }

    const member = await reaction.message.guild.members.fetch(user.id);
    await member.roles.add(slot.roleId);

    const isAbstracted = member.roles.cache.has(ABSTRACTED_ROLE);
    const text = isAbstracted
        ? `An **abstracted user** logged into **${slot.name}**`
        : `<@${user.id}> is logged into **${slot.name}**`;

    const statusMsg = await reaction.message.channel.send(text);
    const dashMsg = await client.channels.fetch(DASHBOARD_CHANNEL_ID).then(c => c.send(text));

    slotDB.set(slot.name, {
        claimedUserId: user.id,
        claimedAt: Date.now(),
        statusMessageId: statusMsg.id,
        dashboardMessageId: dashMsg.id
    });

    startReminder(slot, user.id);
});

client.on('messageReactionRemove', async (reaction, user) => {
    if (user.bot) return;
    if (reaction.partial) await reaction.fetch();

    const slot = slots.find(s =>
        s.channelId === reaction.message.channel.id &&
        s.emoji === reaction.emoji.name
    );
    if (!slot) return;

    const stored = slotDB.get(slot.name);
    if (stored?.claimedUserId !== user.id) return;

    stopReminder(slot.name);

    const guild = reaction.message.guild;
    const member = await guild.members.fetch(user.id);
    await member.roles.remove(slot.roleId);

    const login = stored.claimedAt;
    const logout = Date.now();

    const log = await client.channels.fetch(DIRECTORY_CHANNEL_ID);
    log.send(
`Slot: ${slot.name}
User: <@${user.id}>
Login: ${formatIST(login)}
Logout: ${formatIST(logout)}
Total Time Played: ${formatDuration(logout - login)}`
    );

    slotDB.delete(slot.name);

    const freeMsg = `**${slot.name}** slot is now free.`;
    const chMsg = await reaction.message.channel.send(freeMsg);
    const dashMsg = await client.channels.fetch(DASHBOARD_CHANNEL_ID).then(c => c.send(freeMsg));

    setTimeout(() => {
        chMsg.delete().catch(()=>{});
        dashMsg.delete().catch(()=>{});
    }, 10000);
});

client.login(process.env.DISCORD_TOKEN);
