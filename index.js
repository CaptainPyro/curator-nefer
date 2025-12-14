// -------------------- KEEP ALIVE --------------------
const keepAlive = require('./keep_alive.js');
keepAlive();

// -------------------- DISCORD SETUP --------------------
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
const DASHBOARD_CHANNEL_ID = "1438801491052990556";
const DIRECTORY_CHANNEL_ID = "1426096588509548636";
const ABSTRACTED_ROLE = "1438761961897852958";

const SLOT_DURATION = 4 * 60 * 60 * 1000;

const slots = [
    { name: "Anaxagoras", channelId: "1406663875855650977", roleId: "1426087099521830973", statusMessageId: "1426091781061214262", emoji: "✅", timer: null },
    { name: "Kantoku", channelId: "1424270783697518704", roleId: "1426087197668544523", statusMessageId: "1426092140131254366", emoji: "✅", timer: null },
    { name: "Blue Wolf", channelId: "1406667945698132028", roleId: "1426087159265362012", statusMessageId: "1426092280598757479", emoji: "✅", timer: null },
    { name: "The Claw", channelId: "1406841047950164060", roleId: "1426087223404662815", statusMessageId: "1426092551785545739", emoji: "✅", timer: null },
    { name: "Raptor", channelId: "1406849192747466842", roleId: "1426087270385057924", statusMessageId: "1426092759101476894", emoji: "✅", timer: null },
    { name: "Muffin", channelId: "1436611717462233199", roleId: "1436611514395136121", statusMessageId: "1437009694433738894", emoji: "✅", timer: null },
    { name: "Walnut", channelId: "1436655308104531989", roleId: "1436654744213917818", statusMessageId: "1437009605300326592", emoji: "✅", timer: null },
    { name: "Ying Hua", channelId: "1436655490129068124", roleId: "1436654621127872584", statusMessageId: "1437009499666907156", emoji: "✅", timer: null }
];

const slotDB = new Enmap({ name: "slots" });

// -------------------- HELPERS --------------------
function formatDate(ms) {
    const d = new Date(ms + 5.5 * 60 * 60 * 1000);
    return d.toISOString().replace("T", " ").slice(0, 16);
}

function formatDuration(ms) {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}h ${m}m`;
}

async function sendStatusMessages(member, slot) {
    const isAbstracted = member.roles.cache.has(ABSTRACTED_ROLE);
    const text = isAbstracted
        ? `An **abstracted user** is now logged into **${slot.name}**!`
        : `<@${member.id}> is now logged into **${slot.name}**!`;

    const channel = await client.channels.fetch(slot.channelId);
    const dashboard = await client.channels.fetch(DASHBOARD_CHANNEL_ID);

    const msg1 = await channel.send(text);
    const msg2 = await dashboard.send(text);

    return { channelMsgId: msg1.id, dashboardMsgId: msg2.id };
}

// -------------------- TIMER --------------------
function startTimer(slot) {
    if (slot.timer) clearTimeout(slot.timer);

    slot.timer = setTimeout(async () => {
        const stored = slotDB.get(slot.name);
        if (!stored?.claimedUserId) return;

        const channel = await client.channels.fetch(slot.channelId);
        channel.send(`⏰ Reminder: **${slot.name}** slot is still in use.`);
    }, SLOT_DURATION);
}

// -------------------- READY --------------------
client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);

    for (const slot of slots) {
        try {
            const channel = await client.channels.fetch(slot.channelId);
            const msg = await channel.messages.fetch(slot.statusMessageId);
            if (!msg.reactions.cache.has(slot.emoji)) {
                await msg.react(slot.emoji);
            }
        } catch {}

        const stored = slotDB.get(slot.name);
        if (stored?.claimedUserId) startTimer(slot);
    }
});

// -------------------- REACTION ADD --------------------
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

    const msgs = await sendStatusMessages(member, slot);

    slotDB.set(slot.name, {
        claimedUserId: user.id,
        claimedAt: Date.now(),
        ...msgs
    });

    startTimer(slot);
});

// -------------------- REACTION REMOVE --------------------
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

    const guild = reaction.message.guild;
    const member = await guild.members.fetch(user.id);
    await member.roles.remove(slot.roleId);

    const channel = await client.channels.fetch(slot.channelId);
    const dashboard = await client.channels.fetch(DASHBOARD_CHANNEL_ID);
    const directory = await client.channels.fetch(DIRECTORY_CHANNEL_ID);

    try {
        await channel.messages.delete(stored.channelMsgId);
        await dashboard.messages.delete(stored.dashboardMsgId);
    } catch {}

    const isAbstracted = member.roles.cache.has(ABSTRACTED_ROLE);
    const userText = isAbstracted
        ? `||<@${user.id}>|| (abstracted user)`
        : `<@${user.id}>`;

    await directory.send(
        `Slot: ${slot.name}\nUser: ${userText}\nLogin: ${formatDate(stored.claimedAt)}\nLogout: ${formatDate(Date.now())}\nDuration: ${formatDuration(Date.now() - stored.claimedAt)}`
    );

    const freeMsg1 = await channel.send(`**${slot.name}** slot is now free.`);
    const freeMsg2 = await dashboard.send(`**${slot.name}** slot is now free.`);

    setTimeout(() => {
        freeMsg1.delete().catch(() => {});
        freeMsg2.delete().catch(() => {});
    }, 10000);

    slotDB.delete(slot.name);
    if (slot.timer) clearTimeout(slot.timer);
});

// -------------------- LOGIN --------------------
client.login(process.env.DISCORD_TOKEN);
