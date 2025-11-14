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
const dashboardChannelId = '1426096588509548636';
const ABSTRACTED_ROLE = "1438761961897852958"; // << abstracted role ID

const slots = [
    { name: "Anaxagoras", channelId: "1406663875855650977", roleId: "1426087099521830973", accessRoleId: "1406631086926069863", emoji: "✅", statusMessageId: "1426091781061214262", timer: null },
    { name: "Kantoku", channelId: "1424270783697518704", roleId: "1426087197668544523", accessRoleId: "1424271027562872972", emoji: "✅", statusMessageId: "1426092140131254366", timer: null },
    { name: "Blue Wolf", channelId: "1406667945698132028", roleId: "1426087159265362012", accessRoleId: "1406646812194111549", emoji: "✅", statusMessageId: "1426092280598757479", timer: null },
    { name: "The Claw", channelId: "1406841047950164060", roleId: "1426087223404662815", accessRoleId: "1406838453047394364", emoji: "✅", statusMessageId: "1426092551785545739", timer: null },
    { name: "Raptor", channelId: "1406849192747466842", roleId: "1426087270385057924", accessRoleId: "1406842481290772551", emoji: "✅", statusMessageId: "1426092759101476894", timer: null },
    { name: "Muffin", channelId: "1436611717462233199", roleId: "1436611514395136121", accessRoleId: "1436611424570052721", emoji: "✅", statusMessageId: "1437009694433738894", timer: null },
    { name: "Walnut", channelId: "1436655308104531989", roleId: "1436654744213917818", accessRoleId: "1436654662936821780", emoji: "✅", statusMessageId: "1437009605300326592", timer: null },
    { name: "Ying Hua", channelId: "1436655490129068124", roleId: "1436654621127872584", accessRoleId: "1436654511388229633", emoji: "✅", statusMessageId: "1437009499666907156", timer: null }
];

const slotDB = new Enmap({ name: "slots", autoFetch: true, fetchAll: false });

// -------------------- HELPERS --------------------
function formatDate(ms) {
    const d = new Date(ms);
    const offset = 5.5 * 60;
    const local = new Date(d.getTime() + offset*60*1000);
    const dd = String(local.getDate()).padStart(2,'0');
    const mm = String(local.getMonth()+1).padStart(2,'0');
    const yyyy = local.getFullYear();
    const hh = String(local.getHours()).padStart(2,'0');
    const min = String(local.getMinutes()).padStart(2,'0');
    return `${dd}-${mm}-${yyyy}, ${hh}:${min}`;
}

function formatDuration(ms) {
    const totalSeconds = Math.floor(ms/1000);
    const hours = String(Math.floor(totalSeconds/3600)).padStart(2,'0');
    const minutes = String(Math.floor((totalSeconds % 3600)/60)).padStart(2,'0');
    return `${hours}:${minutes}`;
}

async function sendLoginMessage(channel, member, slotName) {
    const isAbstracted = member.roles.cache.has(ABSTRACTED_ROLE);
    if (isAbstracted) {
        return channel.send(`An **abstracted user** is now logged into **${slotName}**!`);
    } else {
        return channel.send(`<@${member.id}> is now logged into **${slotName}**!`);
    }
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
            const repeat = slotDB.get(slot.name);
            if (!repeat?.claimedUserId) {
                clearInterval(slot.timer);
                slot.timer = null;
                return;
            }
            const usr = await client.users.fetch(repeat.claimedUserId);
            await usr.send(`Reminder: You are still logged into **${slot.name}**. Please unreact if done.`);
        }, TWO_HOURS);
    }, remainingTime);
}

// -------------------- READY --------------------
client.once('clientReady', async () => {
    console.log(`Logged in as ${client.user.tag}`);

    for (const slot of slots) {
        const channel = await client.channels.fetch(slot.channelId);
        let message;
        try { message = await channel.messages.fetch(slot.statusMessageId); } 
        catch { console.error(`Status message missing for ${slot.name}`); continue; }

        if (!message.reactions.cache.has(slot.emoji)) await message.react(slot.emoji);

        const stored = slotDB.get(slot.name);
        if (stored?.claimedUserId) {
            try {
                const member = await channel.guild.members.fetch(stored.claimedUserId);
                if (!member.roles.cache.has(slot.roleId)) await member.roles.add(slot.roleId);

                let loginMsgChannel, loginMsgDashboard;
                try {
                    loginMsgChannel = await channel.messages.fetch(stored.loginMessageIdChannel);
                    loginMsgDashboard = await (await client.channels.fetch(dashboardChannelId)).messages.fetch(stored.loginMessageIdDashboard);
                } catch {
                    loginMsgChannel = await sendLoginMessage(channel, member, slot.name);
                    const dashboardChannel = await client.channels.fetch(dashboardChannelId);
                    loginMsgDashboard = await sendLoginMessage(dashboardChannel, member, slot.name);
                    stored.loginMessageIdChannel = loginMsgChannel.id;
                    stored.loginMessageIdDashboard = loginMsgDashboard.id;
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

        // Change View Channel permission to DENY for accessRole
        const channel = await client.channels.fetch(slot.channelId);
        await channel.permissionOverwrites.edit(slot.accessRoleId, { ViewChannel: false });

        // Send login messages to both channels
        const loginMsgChannel = await sendLoginMessage(channel, member, slot.name);
        const dashboardChannel = await client.channels.fetch(dashboardChannelId);
        const loginMsgDashboard = await sendLoginMessage(dashboardChannel, member, slot.name);

        slotDB.set(slot.name, {
            statusMessageId: slot.statusMessageId,
            claimedUserId: user.id,
            loginMessageIdChannel: loginMsgChannel.id,
            loginMessageIdDashboard: loginMsgDashboard.id,
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

    // Undo View Channel deny permission
    const channel = await client.channels.fetch(slot.channelId);
    await channel.permissionOverwrites.edit(slot.accessRoleId, { ViewChannel: true });

    // Delete previous login messages from both channels
    if (stored.loginMessageIdChannel) {
        try {
            const msg = await channel.messages.fetch(stored.loginMessageIdChannel);
            if (msg) await msg.delete();
        } catch {}
    }
    if (stored.loginMessageIdDashboard) {
        try {
            const dashboardChannel = await client.channels.fetch(dashboardChannelId);
            const msg = await dashboardChannel.messages.fetch(stored.loginMessageIdDashboard);
            if (msg) await msg.delete();
        } catch {}
    }

    if (slot.timer) { clearTimeout(slot.timer); clearInterval(slot.timer); slot.timer = null; }

    const log = await client.channels.fetch(dashboardChannelId);

    const login = stored.claimedAt;
    const logout = Date.now();

    const isAbstracted = member.roles.cache.has(ABSTRACTED_ROLE);
    const hidden = `||<@${stored.claimedUserId}>||`;

    await log.send(
        `Slot: ${slot.name}\nUser: ${isAbstracted ? `${hidden} (abstracted user)` : `<@${stored.claimedUserId}>`}\nLogin Time: ${formatDate(login)}\nLogout Time: ${formatDate(logout)}\nTotal Time Played: ${formatDuration(logout-login)}`
    );

    // Send “slot free” to both channels, delete after 10s
    const freeMsgChannel = await channel.send(`**${slot.name}** slot is now free.`);
    const dashboardChannel = await client.channels.fetch(dashboardChannelId);
    const freeMsgDashboard = await dashboardChannel.send(`**${slot.name}** slot is now free.`);
    setTimeout(() => { freeMsgChannel.delete().catch(()=>{}); freeMsgDashboard.delete().catch(()=>{}); }, 10000);

    slotDB.set(slot.name, {
        statusMessageId: slot.statusMessageId,
        claimedUserId: null,
        loginMessageIdChannel: null,
        loginMessageIdDashboard: null,
        claimedAt: null
    });
});

// -------------------- COMMANDS --------------------
client.on('messageCreate', async message => {
    if (!message.content.startsWith('!') || message.author.bot) return;
    const args = message.content.split(/ +/);
    const cmd = args.shift().toLowerCase();

    if (cmd === '!free') {
        if (!message.member.permissions.has('Administrator'))
            return message.reply("You don't have permission.");

        const slotName = args[0];
        const slot = slots.find(s => s.name.toLowerCase() === slotName?.toLowerCase());
        if (!slot) return message.reply("Invalid slot name.");

        const stored = slotDB.get(slot.name);
        if (!stored?.claimedUserId) return message.reply(`${slot.name} is already free.`);

        const member = await message.guild.members.fetch(stored.claimedUserId);
        await member.roles.remove(slot.roleId);

        // Undo channel permission
        const channel = await client.channels.fetch(slot.channelId);
        await channel.permissionOverwrites.edit(slot.accessRoleId, { ViewChannel: true });

        // Delete login messages
        if (stored.loginMessageIdChannel) {
            try { const msg = await channel.messages.fetch(stored.loginMessageIdChannel); if(msg) await msg.delete(); } catch {}
        }
        if (stored.loginMessageIdDashboard) {
            try { const dashCh = await client.channels.fetch(dashboardChannelId); const msg = await dashCh.messages.fetch(stored.loginMessageIdDashboard); if(msg) await msg.delete(); } catch {}
        }

        if (slot.timer) { clearTimeout(slot.timer); clearInterval(slot.timer); slot.timer = null; }

        const log = await client.channels.fetch(dashboardChannelId);
        const login = stored.claimedAt;
        const logout = Date.now();
        const isAbstracted = member.roles.cache.has(ABSTRACTED_ROLE);
        const hidden = `||<@${stored.claimedUserId}>||`;

        await log.send(
            `Slot: ${slot.name}\nUser: ${isAbstracted ? `${hidden} (abstracted user)` : `<@${stored.claimedUserId}>`}\nLogin Time: ${formatDate(login)}\nLogout Time: ${formatDate(logout)}\nTotal Time Played: ${formatDuration(logout-login)}`
        );

        // Send slot free messages to both channels
        const freeMsgChannel = await channel.send(`**${slot.name}** slot is now free.`);
        const dashCh = await client.channels.fetch(dashboardChannelId);
        const freeMsgDashboard = await dashCh.send(`**${slot.name}** slot is now free.`);
        setTimeout(()=>{ freeMsgChannel.delete().catch(()=>{}); freeMsgDashboard.delete().catch(()=>{}); }, 10000);

        return message.reply(`${slot.name} slot has been force freed.`);
    }

    if (cmd === '!slots') {
        let reply = "**Current Slots:**\n";

        for (const slot of slots) {
            const stored = slotDB.get(slot.name);

            if (stored?.claimedUserId) {
                const member = await message.guild.members.fetch(stored.claimedUserId);
                const isAbstracted = member.roles.cache.has(ABSTRACTED_ROLE);
                const hidden = "||abstracted user||";

                const shown = isAbstracted ? hidden : `<@${stored.claimedUserId}>`;

                const elapsed = Date.now() - stored.claimedAt;
                const next = Math.max(0, 4*3600*1000 - elapsed);

                reply += `**${slot.name}**: ${shown} | Login: ${formatDate(stored.claimedAt)} | Next DM: ${formatDuration(next)}\n`;

            } else {
                reply += `**${slot.name}**: Free\n`;
            }
        }

        message.channel.send(reply);
    }
});

client.login(process.env.DISCORD_TOKEN);
