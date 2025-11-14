// Keep-alive
const keepAlive = require('./keep_alive.js');
keepAlive();

// Discord and Enmap
const { Client, GatewayIntentBits, Partials, PermissionsBitField } = require('discord.js');
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

const slotDB = new Enmap({ name: "slots", autoFetch: true, fetchAll: false });

// -------------------- HELPERS --------------------
function formatDate(ms) {
    const d = new Date(ms);
    const offset = 5.5 * 60;
    const local = new Date(d.getTime() + offset*60*1000);
    return `${String(local.getDate()).padStart(2,'0')}-${String(local.getMonth()+1).padStart(2,'0')}-${local.getFullYear()}, ${String(local.getHours()).padStart(2,'0')}:${String(local.getMinutes()).padStart(2,'0')}`;
}

function formatDuration(ms) {
    const totalSeconds = Math.floor(ms/1000);
    return `${String(Math.floor(totalSeconds/3600)).padStart(2,'0')}:${String(Math.floor((totalSeconds % 3600)/60)).padStart(2,'0')}`;
}

async function sendLoginMessage(channel, dashboard, member, slotName) {
    const isAbstracted = member.roles.cache.has(ABSTRACTED_ROLE);

    const userText = isAbstracted ? "An **abstracted user**" : `<@${member.id}>`;
    const msgText = `${userText} is now logged into **${slotName}**!`;

    const slotMsg = await channel.send(msgText);
    const dashMsg = await dashboard.send(msgText);

    return { slotMsg, dashMsg };
}

// -------------------- TIMER --------------------
function startTimer(slot, remainingTime = 4*60*60*1000) {
    if (slot.timer) { clearTimeout(slot.timer); clearInterval(slot.timer); }

    const TWO_HOURS = 2*60*60*1000;

    slot.timer = setTimeout(async () => {
        const stored = slotDB.get(slot.name);
        if (!stored?.claimedUserId) return;

        const user = await client.users.fetch(stored.claimedUserId);
        await user.send(`Are you still logged into **${slot.name}**? If not, please unreact.`);

        slot.timer = setInterval(async () => {
            const stored2 = slotDB.get(slot.name);
            if (!stored2?.claimedUserId) { clearInterval(slot.timer); slot.timer = null; return; }

            const usr = await client.users.fetch(stored2.claimedUserId);
            await usr.send(`Reminder: You are still logged into **${slot.name}**. Please unreact if done.`);
        }, TWO_HOURS);
    }, remainingTime);
}

// -------------------- READY --------------------
client.once('clientReady', async () => {
    console.log(`Logged in as ${client.user.tag}`);

    for (const slot of slots) {
        const channel = await client.channels.fetch(slot.channelId);
        const dashboard = await client.channels.fetch(dashboardID);

        let message;
        try { message = await channel.messages.fetch(slot.statusMessageId); }
        catch { console.error(`Status message missing for ${slot.name}`); continue; }

        if (!message.reactions.cache.has(slot.emoji)) await message.react(slot.emoji);

        const stored = slotDB.get(slot.name);
        if (stored?.claimedUserId) {
            try {
                const member = await channel.guild.members.fetch(stored.claimedUserId);
                if (!member.roles.cache.has(slot.roleId)) await member.roles.add(slot.roleId);

                if (!stored.loginMessageId || !stored.dashboardMessageId) {
                    const { slotMsg, dashMsg } = await sendLoginMessage(channel, dashboard, member, slot.name);

                    stored.loginMessageId = slotMsg.id;
                    stored.dashboardMessageId = dashMsg.id;
                    slotDB.set(slot.name, stored);
                }

                const elapsed = Date.now() - stored.claimedAt;
                const remaining = Math.max(0, 4*3600*1000 - elapsed);
                startTimer(slot, remaining);

            } catch (err) {
                console.error(`Failed to restore slot ${slot.name}:`, err);
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
        const member = await reaction.message.guild.members.fetch(user.id);
        await member.roles.add(slot.roleId);

        const dashboard = await client.channels.fetch(dashboardID);

        const { slotMsg, dashMsg } = await sendLoginMessage(reaction.message.channel, dashboard, member, slot.name);

        slotDB.set(slot.name, {
            statusMessageId: slot.statusMessageId,
            claimedUserId: user.id,
            loginMessageId: slotMsg.id,
            dashboardMessageId: dashMsg.id,
            claimedAt: Date.now()
        });

        startTimer(slot);
    } else {
        reaction.users.remove(user.id);
        const dm = await client.users.fetch(user.id);
        dm.send(`Someone else is already logged into **${slot.name}**.`);
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

    await member.roles.remove(slot.roleId);

    const slotChannel = reaction.message.channel;
    const dashboard = await client.channels.fetch(dashboardID);

    // Delete slot + dashboard login messages
    if (stored.loginMessageId) {
        try { (await slotChannel.messages.fetch(stored.loginMessageId)).delete(); } catch {}
    }
    if (stored.dashboardMessageId) {
        try { (await dashboard.messages.fetch(stored.dashboardMessageId)).delete(); } catch {}
    }

    if (slot.timer) { clearInterval(slot.timer); clearTimeout(slot.timer); slot.timer = null; }

    // Log to directory channel
    const log = await client.channels.fetch(directoryChannelId);

    const login = stored.claimedAt;
    const logout = Date.now();

    const isAbstracted = member.roles.cache.has(ABSTRACTED_ROLE);
    const hidden = `||<@${stored.claimedUserId}>||`;

    await log.send(
        `Slot: ${slot.name}\nUser: ${isAbstracted ? `${hidden} (abstracted user)` : `<@${stored.claimedUserId}>`}\nLogin Time: ${formatDate(login)}\nLogout Time: ${formatDate(logout)}\nTotal Time Played: ${formatDuration(logout-login)}`
    );

    slotDB.set(slot.name, {
        statusMessageId: slot.statusMessageId,
        claimedUserId: null,
        loginMessageId: null,
        dashboardMessageId: null,
        claimedAt: null
    });

    // Send free message to both channels
    const msg1 = await slotChannel.send(`**${slot.name}** slot is now free.`);
    const msg2 = await dashboard.send(`**${slot.name}** slot is now free.`);
    setTimeout(() => { msg1.delete().catch(()=>{}); msg2.delete().catch(()=>{}); }, 10000);
});

// -------------------- COMMANDS --------------------
client.on('messageCreate', async message => {
    if (!message.content.startsWith('!') || message.author.bot) return;
    const args = message.content.split(/ +/);
    const cmd = args.shift().toLowerCase();

    if (cmd === '!free') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator))
            return message.reply("You don't have permission.");

        const slotName = args[0];
        const slot = slots.find(s => s.name.toLowerCase() === slotName?.toLowerCase());
        if (!slot) return message.reply("Invalid slot.");

        const stored = slotDB.get(slot.name);
        if (!stored?.claimedUserId) return message.reply(`${slot.name} is already free.`);

        const member = await message.guild.members.fetch(stored.claimedUserId);
        await member.roles.remove(slot.roleId);

        const slotChannel = await client.channels.fetch(slot.channelId);
        const dashboard = await client.channels.fetch(dashboardID);

        if (stored.loginMessageId) {
            try { (await slotChannel.messages.fetch(stored.loginMessageId)).delete(); } catch {}
        }
        if (stored.dashboardMessageId) {
            try { (await dashboard.messages.fetch(stored.dashboardMessageId)).delete(); } catch {}
        }

        if (slot.timer) { clearInterval(slot.timer); clearTimeout(slot.timer); slot.timer = null; }

        const log = await client.channels.fetch(directoryChannelId);
        const login = stored.claimedAt;
        const logout = Date.now();

        const isAbstracted = member.roles.cache.has(ABSTRACTED_ROLE);
        const hidden = `||<@${stored.claimedUserId}>||`;

        await log.send(
            `Slot: ${slot.name}\nUser: ${isAbstracted ? `${hidden} (abstracted user)` : `<@${stored.claimedUserId}>`}\nLogin Time: ${formatDate(login)}\nLogout Time: ${formatDate(logout)}\nTotal Time Played: ${formatDuration(logout-login)}`
        );

        slotDB.set(slot.name, {
            statusMessageId: slot.statusMessageId,
            claimedUserId: null,
            loginMessageId: null,
            dashboardMessageId: null,
            claimedAt: null
        });

        const msg1 = await slotChannel.send(`**${slot.name}** slot has been force freed.`);
        const msg2 = await dashboard.send(`**${slot.name}** slot has been force freed.`);
        setTimeout(() => { msg1.delete().catch(()=>{}); msg2.delete().catch(()=>{}); }, 10000);
    }
});

client.login(process.env.DISCORD_TOKEN);
