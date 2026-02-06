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
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// -------------------- CONFIG --------------------
const DASHBOARD_CHANNEL_ID = '1438801491052990556';
const DIRECTORY_CHANNEL_ID = '1426096588509548636';
const REMINDER_LOG_CHANNEL_ID = '1450317266339102750';
const ABSTRACTED_ROLE = '1438761961897852958';

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

// -------------------- DATABASE --------------------
const slotDB = new Enmap({ name: "slots" });

// timers NEVER go into Enmap
const reminderTimers = new Map();

// -------------------- TIME HELPERS --------------------
function formatIST(ms) {
    const d = new Date(ms + 5.5 * 60 * 60 * 1000);
    return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth()+1).padStart(2, '0')}-${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function formatDuration(ms) {
    const h = String(Math.floor(ms / 3600000)).padStart(2,'0');
    const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2,'0');
    return `${h}:${m}`;
}

// -------------------- REMINDERS --------------------
function startReminder(slotName, userId) {
    stopReminder(slotName);

    const interval = setInterval(async () => {
        try {
            const user = await client.users.fetch(userId);
            await user.send(`Reminder: You are still logged into **${slotName}**.`);
            const log = await client.channels.fetch(REMINDER_LOG_CHANNEL_ID);
            log.send(`Reminder sent to <@${userId}> for **${slotName}**`);
        } catch {}
    }, 4 * 60 * 60 * 1000);

    reminderTimers.set(slotName, interval);
}

function stopReminder(slotName) {
    const t = reminderTimers.get(slotName);
    if (t) clearInterval(t);
    reminderTimers.delete(slotName);
}

// -------------------- READY --------------------
client.once('clientReady', async () => {
    console.log(`Logged in as ${client.user.tag}`);

    for (const slot of slots) {
        try {
            const channel = await client.channels.fetch(slot.channelId);
            const msg = await channel.messages.fetch(slot.statusMessageId);
            if (!msg.reactions.cache.has(slot.emoji)) await msg.react(slot.emoji);
        } catch (error) {
            console.error(`Failed to fetch/react to slot ${slot.name}:`, error.message);
        }
    }
});

// -------------------- LOGIN LOGIC --------------------
client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot) return;
    if (reaction.partial) await reaction.fetch();

    const slot = slots.find(s =>
        s.channelId === reaction.message.channel.id &&
        s.emoji === reaction.emoji.name
    );
    if (!slot) return;

    const existing = slotDB.get(slot.name);
    if (existing?.userId) {
        reaction.users.remove(user.id);
        return;
    }

    const member = await reaction.message.guild.members.fetch(user.id);
    await member.roles.add(slot.roleId);

    const dashboard = await client.channels.fetch(DASHBOARD_CHANNEL_ID);

    const text = member.roles.cache.has(ABSTRACTED_ROLE)
        ? `An **abstracted user** logged into **${slot.name}**`
        : `<@${user.id}> logged into **${slot.name}**`;

    const msg1 = await reaction.message.channel.send(text);
    const msg2 = await dashboard.send(text);

    slotDB.set(slot.name, {
        userId: user.id,
        loginAt: Date.now(),
        msg1: msg1.id,
        msg2: msg2.id
    });

    startReminder(slot.name, user.id);
});

// -------------------- LOGOUT LOGIC --------------------
client.on('messageReactionRemove', async (reaction, user) => {
    if (user.bot) return;
    if (reaction.partial) await reaction.fetch();

    const slot = slots.find(s =>
        s.channelId === reaction.message.channel.id &&
        s.emoji === reaction.emoji.name
    );
    if (!slot) return;

    const data = slotDB.get(slot.name);
    if (!data || data.userId !== user.id) return;

    stopReminder(slot.name);

    const guild = reaction.message.guild;
    const member = await guild.members.fetch(user.id);
    await member.roles.remove(slot.roleId);

    const channel = reaction.message.channel;
    const dashboard = await client.channels.fetch(DASHBOARD_CHANNEL_ID);

    try { await channel.messages.delete(data.msg1); } catch {}
    try { await dashboard.messages.delete(data.msg2); } catch {}

    const free1 = await channel.send(`**${slot.name}** slot is now free.`);
    const free2 = await dashboard.send(`**${slot.name}** slot is now free.`);
    setTimeout(() => { free1.delete(); free2.delete(); }, 10000);

    const dir = await client.channels.fetch(DIRECTORY_CHANNEL_ID);
    const now = Date.now();

    await dir.send(
`Slot: ${slot.name}
User: <@${user.id}>
Login: ${formatIST(data.loginAt)}
Logout: ${formatIST(now)}
Total Time Played: ${formatDuration(now - data.loginAt)}`
    );

    slotDB.delete(slot.name);
});

// -------------------- DEBUG & CONNECT --------------------

// Debug listener for detailed connection steps
client.on("debug", (e) => console.log(e));

console.log("Attempting to log in...");

// THE SANITY CHECK: Prints the first 5 chars of the token if it exists
console.log("Token Check:", process.env.DISCORD_TOKEN ? `Loaded (${process.env.DISCORD_TOKEN.substring(0, 5)}...)` : "❌ NO TOKEN FOUND");

client.login(process.env.DISCORD_TOKEN)
    .catch(err => console.error("🚨 LOGIN ERROR:", err));
