// Keep-alive
const keepAlive = require('./keep_alive.js');
keepAlive();

// Discord & Enmap
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

// -------------------- CONFIG --------------------
const DIRECTORY_CHANNEL_ID = '1426096588509548636';
const DASHBOARD_CHANNEL_ID = '1438801491052990556';
const ABSTRACTED_ROLE = '1438761961897852958';

const slots = [
    { name: "Anaxagoras", channelId: "1406663875855650977", roleId: "1426087099521830973", emoji: "✅", statusMessageId: "1426091781061214262", timer: null },
    { name: "Kantoku", channelId: "1424270783697518704", roleId: "1426087197668544523", emoji: "✅", statusMessageId: "1426092140131254366", timer: null },
    { name: "Blue Wolf", channelId: "1406667945698132028", roleId: "1426087159265362012", emoji: "✅", statusMessageId: "1426092280598757479", timer: null },
    { name: "The Claw", channelId: "1406841047950164060", roleId: "1426087223404662815", emoji: "✅", statusMessageId: "1426092551785545739", timer: null },
    { name: "Raptor", channelId: "1406849192747466842", roleId: "1426087270385057924", emoji: "✅", statusMessageId: "1426092759101476894", timer: null },
    { name: "Muffin", channelId: "1436611717462233199", roleId: "1436611514395136121", emoji: "✅", statusMessageId: "1437009694433738894", timer: null },
    { name: "Walnut", channelId: "1436655308104531989", roleId: "1436654744213917818", emoji: "✅", statusMessageId: "1437009605300326592", timer: null },
    { name: "Ying Hua", channelId: "1436655490129068124", roleId: "1436654621127872584", emoji: "✅", statusMessageId: "1437009499666907156", timer: null }
];

const slotDB = new Enmap({ name: "slots" });

// -------------------- HELPERS --------------------
function formatDate(ms) {
    const d = new Date(ms + 5.5 * 60 * 60 * 1000);
    return d.toISOString().replace('T', ' ').slice(0, 16);
}

function formatDuration(ms) {
    const h = Math.floor(ms / 3600000).toString().padStart(2, '0');
    const m = Math.floor((ms % 3600000) / 60000).toString().padStart(2, '0');
    return `${h}:${m}`;
}

function loginText(member, slotName) {
    return member.roles.cache.has(ABSTRACTED_ROLE)
        ? `An **abstracted user** is now logged into **${slotName}**!`
        : `<@${member.id}> is now logged into **${slotName}**!`;
}

// -------------------- READY --------------------
client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);

    for (const slot of slots) {
        try {
            const channel = await client.channels.fetch(slot.channelId);
            const msg = await channel.messages.fetch(slot.statusMessageId);
            if (!msg.reactions.cache.has(slot.emoji)) await msg.react(slot.emoji);
        } catch {}

        const stored = slotDB.get(slot.name);
        if (stored?.claimedUserId) startTimer(slot);
    }
});

// -------------------- TIMER --------------------
function startTimer(slot) {
    if (slot.timer) clearInterval(slot.timer);

    slot.timer = setInterval(async () => {
        const stored = slotDB.get(slot.name);
        if (!stored?.claimedUserId) return;

        const channel = await client.channels.fetch(slot.channelId);
        channel.send(`⏰ Reminder: **${slot.name}** is still in use.`);
    }, 4 * 60 * 60 * 1000);
}

// -------------------- REACTIONS --------------------
client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot) return;
    if (reaction.partial) await reaction.fetch();

    const slot = slots.find(s => s.channelId === reaction.message.channel.id && s.emoji === reaction.emoji.name);
    if (!slot) return;

    const stored = slotDB.get(slot.name);
    if (stored?.claimedUserId) {
        await reaction.users.remove(user.id);
        return;
    }

    const guild = reaction.message.guild;
    const member = await guild.members.fetch(user.id);
    await member.roles.add(slot.roleId);

    const slotChannel = await client.channels.fetch(slot.channelId);
    const dashboard = await client.channels.fetch(DASHBOARD_CHANNEL_ID);

    const loginMsg = await slotChannel.send(loginText(member, slot.name));
    const dashboardMsg = await dashboard.send(loginText(member, slot.name));

    slotDB.set(slot.name, {
        claimedUserId: user.id,
        claimedAt: Date.now(),
        loginMessageId: loginMsg.id,
        dashboardLoginMessageId: dashboardMsg.id
    });

    startTimer(slot);
});

client.on('messageReactionRemove', async (reaction, user) => {
    if (user.bot) return;
    if (reaction.partial) await reaction.fetch();

    const slot = slots.find(s => s.channelId === reaction.message.channel.id && s.emoji === reaction.emoji.name);
    if (!slot) return;

    const stored = slotDB.get(slot.name);
    if (stored?.claimedUserId !== user.id) return;

    const guild = reaction.message.guild;
    const member = await guild.members.fetch(user.id);
    await member.roles.remove(slot.roleId);

    const slotChannel = await client.channels.fetch(slot.channelId);
    const dashboard = await client.channels.fetch(DASHBOARD_CHANNEL_ID);
    const directory = await client.channels.fetch(DIRECTORY_CHANNEL_ID);

    // delete login messages
    for (const [ch, id] of [
        [slotChannel, stored.loginMessageId],
        [dashboard, stored.dashboardLoginMessageId]
    ]) {
        if (id) ch.messages.fetch(id).then(m => m.delete()).catch(() => {});
    }

    // history log
    const hidden = member.roles.cache.has(ABSTRACTED_ROLE)
        ? `||<@${user.id}>|| (abstracted user)`
        : `<@${user.id}>`;

    directory.send(
        `Slot: ${slot.name}\nUser: ${hidden}\nLogin: ${formatDate(stored.claimedAt)}\nLogout: ${formatDate(Date.now())}\nTotal: ${formatDuration(Date.now() - stored.claimedAt)}`
    );

    // free message
    for (const ch of [slotChannel, dashboard]) {
        ch.send(`**${slot.name}** slot is now free.`)
            .then(m => setTimeout(() => m.delete(), 10000));
    }

    if (slot.timer) clearInterval(slot.timer);

    slotDB.delete(slot.name);
});

// -------------------- LOGIN --------------------
client.login(process.env.DISCORD_TOKEN);
