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

// ---------------- CONFIG ----------------
const DASHBOARD_ID = '1438801491052990556';
const DIRECTORY_ID = '1426096588509548636';
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

const slotDB = new Enmap({ name: "slots" });

// ---------------- HELPERS ----------------
function formatDate(ms) {
    const d = new Date(ms);
    return d.toISOString().replace('T', ' ').slice(0, 16);
}

function formatDuration(ms) {
    const s = Math.floor(ms / 1000);
    const h = String(Math.floor(s / 3600)).padStart(2, '0');
    const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    return `${h}:${m}`;
}

async function sendLogin(channel, dashboard, member, slot) {
    const abstracted = member.roles.cache.has(ABSTRACTED_ROLE);
    const text = abstracted
        ? `An **abstracted user** logged into **${slot.name}**`
        : `<@${member.id}> logged into **${slot.name}**`;

    const msg1 = await channel.send(text);
    const msg2 = await dashboard.send(text);

    return { slotMsgId: msg1.id, dashMsgId: msg2.id };
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
    if (stored?.userId) {
        await reaction.users.remove(user.id);
        return;
    }

    const member = await reaction.message.guild.members.fetch(user.id);
    await member.roles.add(slot.roleId);

    const dashboard = await client.channels.fetch(DASHBOARD_ID);
    const msgs = await sendLogin(reaction.message.channel, dashboard, member, slot);

    slotDB.set(slot.name, {
        userId: user.id,
        loginAt: Date.now(),
        ...msgs
    });
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
    if (!stored || stored.userId !== user.id) return;

    const guild = reaction.message.guild;
    const member = await guild.members.fetch(user.id);
    await member.roles.remove(slot.roleId);

    const channel = reaction.message.channel;
    const dashboard = await client.channels.fetch(DASHBOARD_ID);
    const directory = await client.channels.fetch(DIRECTORY_ID);

    // Delete login messages
    try { await channel.messages.delete(stored.slotMsgId); } catch {}
    try { await dashboard.messages.delete(stored.dashMsgId); } catch {}

    const login = stored.loginAt;
    const logout = Date.now();

    await directory.send(
        `Slot: ${slot.name}\n` +
        `User: <@${user.id}>\n` +
        `Login: ${formatDate(login)}\n` +
        `Logout: ${formatDate(logout)}\n` +
        `Total Time Played: ${formatDuration(logout - login)}`
    );

    const freeText = `**${slot.name}** slot is now free.`;
    const m1 = await channel.send(freeText);
    const m2 = await dashboard.send(freeText);
    setTimeout(() => {
        m1.delete().catch(() => {});
        m2.delete().catch(() => {});
    }, 10000);

    slotDB.delete(slot.name);
});

client.login(process.env.DISCORD_TOKEN);
