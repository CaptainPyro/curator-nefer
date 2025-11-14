// Keep-alive
const keepAlive = require('./keep_alive.js');
keepAlive();

// Discord and Enmap
const { Client, GatewayIntentBits, Partials, PermissionFlagsBits } = require('discord.js');
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
const directoryChannelId = '1426096588509548636';
const dashboardID = '1438801491052990556';
const ABSTRACTED_ROLE = "1438761961897852958"; // Abstracted role ID

// Slot list
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

const slotDB = new Enmap({ name: "slots", autoFetch: true, fetchAll: false });

// -------------------- HELPERS --------------------
function formatDate(ms) {
    const d = new Date(ms + 5.5 * 60 * 60 * 1000);
    return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}, ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function formatDuration(ms) {
    const total = Math.floor(ms / 1000);
    return `${String(Math.floor(total / 3600)).padStart(2, '0')}:${String(Math.floor((total % 3600) / 60)).padStart(2, '0')}`;
}

async function sendLoginMessage(channel, dashboard, member, slotName) {
    const isAbstracted = member.roles.cache.has(ABSTRACTED_ROLE);
    const msg = isAbstracted
        ? `An **abstracted user** is now logged into **${slotName}**!`
        : `<@${member.id}> is now logged into **${slotName}**!`;

    const chMsg = await channel.send(msg);
    await dashboard.send(msg);
    return chMsg;
}

// -------------------- PERMISSION LOCK/UNLOCK --------------------
async function lockChannelPermissions(guild, slot, accessRoleId) {
    const channel = await guild.channels.fetch(slot.channelId);
    if (!channel) return;

    await channel.permissionOverwrites.edit(accessRoleId, {
        ViewChannel: false
    });
}

async function unlockChannelPermissions(guild, slot, accessRoleId) {
    const channel = await guild.channels.fetch(slot.channelId);
    if (!channel) return;

    await channel.permissionOverwrites.edit(accessRoleId, {
        ViewChannel: true
    });
}

// -------------------- TIMER --------------------
function startTimer(slot, remainingTime = 4 * 60 * 60 * 1000) {
    if (slot.timer) {
        clearTimeout(slot.timer);
        clearInterval(slot.timer);
    }

    const TWO_HOURS = 2 * 60 * 60 * 1000;

    slot.timer = setTimeout(async () => {
        const stored = slotDB.get(slot.name);
        if (!stored?.claimedUserId) return;

        const user = await client.users.fetch(stored.claimedUserId);
        await user.send(`Are you still logged into **${slot.name}**? If not, please unreact.`);

        slot.timer = setInterval(async () => {
            const r = slotDB.get(slot.name);
            if (!r?.claimedUserId) {
                clearInterval(slot.timer);
                slot.timer = null;
                return;
            }

            const u = await client.users.fetch(r.claimedUserId);
            await u.send(`Reminder: You are still logged into **${slot.name}**.`);
        }, TWO_HOURS);
    }, remainingTime);
}

// -------------------- READY --------------------
client.once('clientReady', async () => {
    console.log(`Logged in as ${client.user.tag}`);

    for (const slot of slots) {
        const channel = await client.channels.fetch(slot.channelId);
        let msg;

        try { msg = await channel.messages.fetch(slot.statusMessageId); }
        catch { console.error(`Missing status message for ${slot.name}`); continue; }

        if (!msg.reactions.cache.has(slot.emoji)) await msg.react(slot.emoji);

        const stored = slotDB.get(slot.name);
        if (stored?.claimedUserId) {
            try {
                const member = await channel.guild.members.fetch(stored.claimedUserId);
                await member.roles.add(slot.roleId);

                let loginMsg;
                try {
                    loginMsg = await channel.messages.fetch(stored.loginMessageId);
                } catch {
                    const dashboard = await client.channels.fetch(dashboardID);
                    loginMsg = await sendLoginMessage(channel, dashboard, member, slot.name);

                    stored.loginMessageId = loginMsg.id;
                    slotDB.set(slot.name, stored);
                }

                const elapsed = Date.now() - stored.claimedAt;
                startTimer(slot, Math.max(0, 4 * 3600 * 1000 - elapsed));
            } catch (err) {
                console.error(`Restoring slot failed for ${slot.name}`, err);
            }
        }
    }
});

// -------------------- REACTIONS --------------------
client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot) return;
    if (reaction.partial) await reaction.fetch();

    const slot = slots.find(s => s.channelId === reaction.message.channel.id && s.emoji === reaction.emoji.name);
    if (!slot) return;

    const stored = slotDB.get(slot.name);

    if (!stored?.claimedUserId) {
        const guild = reaction.message.guild;
        const member = await guild.members.fetch(user.id);

        await member.roles.add(slot.roleId);

        await lockChannelPermissions(guild, slot, slot.roleId);

        const dashboard = await client.channels.fetch(dashboardID);
        const loginMsg = await sendLoginMessage(reaction.message.channel, dashboard, member, slot.name);

        slotDB.set(slot.name, {
            statusMessageId: slot.statusMessageId,
            claimedUserId: user.id,
            loginMessageId: loginMsg.id,
            claimedAt: Date.now()
        });

        startTimer(slot);
    } else {
        reaction.users.remove(user.id);
        const dm = await client.users.fetch(user.id);
        await dm.send(`Someone is already logged into **${slot.name}**.`);
    }
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

    await unlockChannelPermissions(guild, slot, slot.roleId);
    await member.roles.remove(slot.roleId);

    if (stored.loginMessageId) {
        try {
            const m = await reaction.message.channel.messages.fetch(stored.loginMessageId);
            await m.delete().catch(() => {});
        } catch {}
    }

    if (slot.timer) {
        clearTimeout(slot.timer);
        clearInterval(slot.timer);
        slot.timer = null;
    }

    const log = await client.channels.fetch(directoryChannelId);

    const login = stored.claimedAt;
    const logout = Date.now();

    const isAbstracted = member.roles.cache.has(ABSTRACTED_ROLE);
    const userText = isAbstracted ? `||<@${stored.claimedUserId}>|| (abstracted user)` : `<@${stored.claimedUserId}>`;

    await log.send(
        `**Slot:** ${slot.name}\n` +
        `**User:** ${userText}\n` +
        `**Login:** ${formatDate(login)}\n` +
        `**Logout:** ${formatDate(logout)}\n` +
        `**Played:** ${formatDuration(logout - login)}`
    );

    slotDB.set(slot.name, {
        statusMessageId: slot.statusMessageId,
        claimedUserId: null,
        loginMessageId: null,
        claimedAt: null
    });

    reaction.message.channel.send(`**${slot.name}** slot is now free.`)
        .then(m => setTimeout(() => m.delete(), 10000));
});

// -------------------- COMMANDS --------------------
client.on('messageCreate', async message => {
    if (!message.content.startsWith('!') || message.author.bot) return;
    const args = message.content.split(/ +/);
    const cmd = args.shift().toLowerCase();

    if (cmd === '!slots') {
        let reply = "**Current Slots:**\n";

        for (const slot of slots) {
            const stored = slotDB.get(slot.name);

            if (stored?.claimedUserId) {
                const member = await message.guild.members.fetch(stored.claimedUserId);
                const isAbstracted = member.roles.cache.has(ABSTRACTED_ROLE);

                reply += `**${slot.name}**: ${isAbstracted ? "||abstracted user||" : `<@${stored.claimedUserId}>`} | Login: ${formatDate(stored.claimedAt)}\n`;
            } else {
                reply += `**${slot.name}**: Free\n`;
            }
        }

        return message.channel.send(reply);
    }
});

client.login(process.env.DISCORD_TOKEN);
