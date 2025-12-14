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

// -------------------- HELPERS --------------------
async function getMember(guild, userId) {
    return guild.members.cache.get(userId) || guild.members.fetch(userId);
}

function isAbstracted(member) {
    return member.roles.cache.has(ABSTRACTED_ROLE);
}

// -------------------- READY (FIXED) --------------------
client.once('clientReady', async () => {
    console.log(`Logged in as ${client.user.tag}`);

    for (const slot of slots) {
        try {
            const channel = await client.channels.fetch(slot.channelId);
            const msg = await channel.messages.fetch(slot.statusMessageId);

            if (!msg.reactions.cache.has(slot.emoji)) {
                await msg.react(slot.emoji);
            }
        } catch (err) {
            console.error(`Failed init for ${slot.name}`, err);
        }
    }
});

// -------------------- LOGIN --------------------
client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot) return;
    if (reaction.partial) await reaction.fetch();

    const slot = slots.find(
        s => s.channelId === reaction.message.channel.id &&
             s.emoji === reaction.emoji.name
    );
    if (!slot) return;

    const stored = slotDB.get(slot.name);
    if (stored?.userId) {
        await reaction.users.remove(user.id);
        return;
    }

    const guild = reaction.message.guild;
    const member = await getMember(guild, user.id);

    await member.roles.add(slot.roleId);

    const text = isAbstracted(member)
        ? `An **abstracted user** logged into **${slot.name}**`
        : `<@${user.id}> logged into **${slot.name}**`;

    const slotMsg = await reaction.message.channel.send(text);
    const dashMsg = await client.channels.fetch(DASHBOARD_CHANNEL_ID)
        .then(ch => ch.send(text));

    slotDB.set(slot.name, {
        userId: user.id,
        slotMsgId: slotMsg.id,
        dashMsgId: dashMsg.id
    });
});

// -------------------- LOGOUT --------------------
client.on('messageReactionRemove', async (reaction, user) => {
    if (user.bot) return;
    if (reaction.partial) await reaction.fetch();

    const slot = slots.find(
        s => s.channelId === reaction.message.channel.id &&
             s.emoji === reaction.emoji.name
    );
    if (!slot) return;

    const stored = slotDB.get(slot.name);
    if (!stored || stored.userId !== user.id) return;

    const guild = reaction.message.guild;
    const member = await getMember(guild, user.id);

    await member.roles.remove(slot.roleId);

    const freeText = `**${slot.name}** slot is now free`;

    const slotChannel = reaction.message.channel;
    const dashChannel = await client.channels.fetch(DASHBOARD_CHANNEL_ID);

    const free1 = await slotChannel.send(freeText);
    const free2 = await dashChannel.send(freeText);

    setTimeout(() => {
        free1.delete().catch(() => {});
        free2.delete().catch(() => {});
    }, 10_000);

    // cleanup old login messages
    slotChannel.messages.fetch(stored.slotMsgId).then(m => m.delete()).catch(() => {});
    dashChannel.messages.fetch(stored.dashMsgId).then(m => m.delete()).catch(() => {});

    // directory log (history)
    const logChannel = await client.channels.fetch(DIRECTORY_CHANNEL_ID);
    await logChannel.send(
        `Slot: ${slot.name}\nUser: <@${user.id}>\nStatus: Logged out`
    );

    slotDB.delete(slot.name);
});

// -------------------- LOGIN --------------------
client.login(process.env.DISCORD_TOKEN);
