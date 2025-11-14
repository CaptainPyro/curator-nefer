// Keep-alive
const keepAlive = require('./keep_alive.js');
keepAlive();

// Discord + Enmap
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
const directoryChannelId = "1426096588509548636";
const dashboardID = "1438801491052990556";   // << send status here too
const ABSTRACTED_ROLE = "1438761961897852958";

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

// DB
const slotDB = new Enmap({ name: "slots", autoFetch: true, fetchAll: false });

// -------------------- HELPERS --------------------
function formatDate(ms) {
    const d = new Date(ms + (5.5 * 3600 * 1000)); // IST offset
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = d.getUTCFullYear();
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const min = String(d.getUTCMinutes()).padStart(2, '0');
    return `${dd}-${mm}-${yyyy}, ${hh}:${min}`;
}

function formatDuration(ms) {
    const s = Math.floor(ms / 1000);
    const h = String(Math.floor(s / 3600)).padStart(2, '0');
    const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    return `${h}:${m}`;
}

async function sendStatusToBothChannels(slotChannel, slotName, member, abstracted) {
    const dash = await client.channels.fetch(dashboardID);

    const msg = abstracted
        ? `An **abstracted user** is now logged into **${slotName}**!`
        : `<@${member.id}> is now logged into **${slotName}**!`;

    await slotChannel.send(msg);
    await dash.send(msg);

    return msg;
}

// -------------------- CHANNEL LOCKING --------------------
async function lockChannelPermissions(guild, slot, member) {
    const channel = await guild.channels.fetch(slot.channelId);
    const role = await guild.roles.fetch(slot.roleId);

    await channel.permissionOverwrites.edit(role, {
        ViewChannel: false
    });
}

async function unlockChannelPermissions(guild, slot) {
    const channel = await guild.channels.fetch(slot.channelId);
    const role = await guild.roles.fetch(slot.roleId);

    await channel.permissionOverwrites.edit(role, {
        ViewChannel: true
    });
}

// -------------------- TIMER --------------------
function startTimer(slot, remainingTime = 4 * 3600 * 1000) {
    if (slot.timer) {
        clearTimeout(slot.timer);
        clearInterval(slot.timer);
    }

    const TWO_HOURS = 2 * 3600 * 1000;

    slot.timer = setTimeout(async () => {
        const stored = slotDB.get(slot.name);
        if (!stored?.claimedUserId) return;

        const user = await client.users.fetch(stored.claimedUserId);
        await user.send(`Are you still logged into **${slot.name}**? If not, please unreact.`);

        slot.timer = setInterval(async () => {
            const repeat = slotDB.get(slot.name);
            if (!repeat?.claimedUserId) {
                clearInterval(slot.timer);
                slot.timer = null;
                return;
            }
            const usr = await client.users.fetch(repeat.claimedUserId);
            await usr.send(`Reminder: You are still logged into **${slot.name}**. Unreact if done.`);
        }, TWO_HOURS);

    }, remainingTime);
}

// -------------------- READY --------------------
client.once("ready", async () => {
    console.log(`Logged in as ${client.user.tag}`);

    for (const slot of slots) {
        const channel = await client.channels.fetch(slot.channelId);
        let message;

        try {
            message = await channel.messages.fetch(slot.statusMessageId);
        } catch {
            console.error(`Missing status message for ${slot.name}`);
            continue;
        }

        if (!message.reactions.cache.has(slot.emoji))
            await message.react(slot.emoji);

        const stored = slotDB.get(slot.name);

        if (stored?.claimedUserId) {
            try {
                const member = await channel.guild.members.fetch(stored.claimedUserId);

                if (!member.roles.cache.has(slot.roleId))
                    await member.roles.add(slot.roleId);

                await lockChannelPermissions(channel.guild, slot, member);

                const elapsed = Date.now() - stored.claimedAt;
                const remaining = Math.max(0, 4 * 3600 * 1000 - elapsed);

                startTimer(slot, remaining);
            } catch (err) {
                console.error(`Restore failed for ${slot.name}:`, err);
            }
        }
    }
});

// -------------------- REACTION ADD --------------------
client.on("messageReactionAdd", async (reaction, user) => {
    if (user.bot) return;
    if (reaction.partial) await reaction.fetch();

    const slot = slots.find(s =>
        s.channelId === reaction.message.channel.id &&
        s.emoji === reaction.emoji.name
    );

    if (!slot) return;

    const stored = slotDB.get(slot.name);
    const guild = reaction.message.guild;
    const member = await guild.members.fetch(user.id);

    if (!stored?.claimedUserId) {
        await member.roles.add(slot.roleId);
        await lockChannelPermissions(guild, slot, member);

        const abstracted = member.roles.cache.has(ABSTRACTED_ROLE);
        const sent = await sendStatusToBothChannels(
            reaction.message.channel,
            slot.name,
            member,
            abstracted
        );

        slotDB.set(slot.name, {
            statusMessageId: slot.statusMessageId,
            claimedUserId: user.id,
            loginMessageId: null,
            claimedAt: Date.now()
        });

        startTimer(slot);
    } else {
        await reaction.users.remove(user.id);
        user.send(`Someone is already logged into **${slot.name}**.`);
    }
});

// -------------------- REACTION REMOVE (LOG OUT) --------------------
client.on("messageReactionRemove", async (reaction, user) => {
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
    await unlockChannelPermissions(guild, slot);

    if (slot.timer) {
        clearTimeout(slot.timer);
        clearInterval(slot.timer);
        slot.timer = null;
    }

    const login = stored.claimedAt;
    const logout = Date.now();

    const abstracted = member.roles.cache.has(ABSTRACTED_ROLE);
    const hidden = `||<@${user.id}>||`;

    const log = await client.channels.fetch(directoryChannelId);
    await log.send(
        `Slot: ${slot.name}\nUser: ${abstracted ? `${hidden} (abstracted)` : `<@${user.id}>`}\nLogin: ${formatDate(login)}\nLogout: ${formatDate(logout)}\nPlayed: ${formatDuration(logout - login)}`
    );

    slotDB.set(slot.name, {
        statusMessageId: slot.statusMessageId,
        claimedUserId: null,
        loginMessageId: null,
        claimedAt: null
    });

    reaction.message.channel.send(`**${slot.name}** is now free.`)
        .then(m => setTimeout(() => m.delete(), 10000));
});

// -------------------- COMMANDS --------------------
client.on("messageCreate", async message => {
    if (!message.content.startsWith("!") || message.author.bot) return;

    const args = message.content.split(/ +/);
    const cmd = args.shift().toLowerCase();

    if (cmd === "!free") {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator))
            return message.reply("No permission.");

        const name = args[0];
        const slot = slots.find(s => s.name.toLowerCase() === name?.toLowerCase());
        if (!slot) return message.reply("Invalid slot.");

        const stored = slotDB.get(slot.name);
        if (!stored?.claimedUserId) return message.reply("Already free.");

        const guild = message.guild;
        const member = await guild.members.fetch(stored.claimedUserId);

        await member.roles.remove(slot.roleId);
        await unlockChannelPermissions(guild, slot);

        if (slot.timer) {
            clearTimeout(slot.timer);
            clearInterval(slot.timer);
            slot.timer = null;
        }

        const login = stored.claimedAt;
        const logout = Date.now();

        const abstracted = member.roles.cache.has(ABSTRACTED_ROLE);
        const hidden = `||<@${stored.claimedUserId}>||`;

        const log = await client.channels.fetch(directoryChannelId);
        await log.send(
            `Slot: ${slot.name}\nUser: ${abstracted ? `${hidden} (abstracted)` : `<@${member.id}>`}\nLogin: ${formatDate(login)}\nLogout: ${formatDate(logout)}\nPlayed: ${formatDuration(logout - login)}`
        );

        slotDB.set(slot.name, {
            statusMessageId: slot.statusMessageId,
            claimedUserId: null,
            loginMessageId: null,
            claimedAt: null
        });

        return message.reply(`${slot.name} force-freed.`);
    }

    if (cmd === "!slots") {
        let reply = "**Current Slots:**\n";

        for (const slot of slots) {
            const stored = slotDB.get(slot.name);

            if (stored?.claimedUserId) {
                const member = await message.guild.members.fetch(stored.claimedUserId);
                const abstracted = member.roles.cache.has(ABSTRACTED_ROLE);

                const shown = abstracted ? "||abstracted user||" : `<@${stored.claimedUserId}>`;

                const elapsed = Date.now() - stored.claimedAt;
                const next = Math.max(0, 4 * 3600 * 1000 - elapsed);

                reply += `**${slot.name}**: ${shown} | Login: ${formatDate(stored.claimedAt)} | Next DM: ${formatDuration(next)}\n`;
            } else {
                reply += `**${slot.name}**: Free\n`;
            }
        }

        message.channel.send(reply);
    }
});

client.login(process.env.DISCORD_TOKEN);
