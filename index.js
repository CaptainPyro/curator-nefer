// Keep-alive
const keepAlive = require('./keep_alive.js');
keepAlive();

// Discord and Enmap
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
const directoryChannelId = '1426096588509548636'; // Directory channel for login/logout logs

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

// Persistent storage
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
            const repeatStored = slotDB.get(slot.name);
            if (!repeatStored?.claimedUserId) {
                clearInterval(slot.timer);
                slot.timer = null;
                return;
            }
            const userRepeat = await client.users.fetch(repeatStored.claimedUserId);
            await userRepeat.send(`Reminder: You are still logged into **${slot.name}**. Please unreact if done.`);
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
        catch { console.error(`Status message not found for ${slot.name}`); continue; }

        if (!message.reactions.cache.has(slot.emoji)) await message.react(slot.emoji);

        const stored = slotDB.get(slot.name);
        if (stored?.claimedUserId) {
            try {
                const member = await channel.guild.members.fetch(stored.claimedUserId);
                if (!member.roles.cache.has(slot.roleId)) await member.roles.add(slot.roleId);

                let loginMsg;
                try { loginMsg = await channel.messages.fetch(stored.loginMessageId); }
                catch { loginMsg = await channel.send(`<@${stored.claimedUserId}> is logged into **${slot.name}**!`); stored.loginMessageId = loginMsg.id; slotDB.set(slot.name, stored); }

                const elapsed = Date.now() - stored.claimedAt;
                const remaining = Math.max(0, 4*3600*1000 - elapsed);
                startTimer(slot, remaining);

            } catch (err) { console.error(`Failed to restore slot ${slot.name}:`, err); }
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
        const loginMsg = await reaction.message.channel.send(`<@${user.id}> is now logged into **${slot.name}**!`);

        slotDB.set(slot.name, {
            statusMessageId: slot.statusMessageId,
            claimedUserId: user.id,
            loginMessageId: loginMsg.id,
            claimedAt: Date.now()
        });

        startTimer(slot);
    } else {
        reaction.users.remove(user.id);
        const dmUser = await client.users.fetch(user.id);
        await dmUser.send(`Someone else is already logged into **${slot.name}**. Please wait until they log out.`);
    }
});

client.on('messageReactionRemove', async (reaction, user) => {
    if (user.bot) return;
    if (reaction.partial) await reaction.fetch();

    const slot = slots.find(s => s.channelId === reaction.message.channel.id && s.emoji === reaction.emoji.name);
    if (!slot) return;

    const stored = slotDB.get(slot.name);
    if (stored?.claimedUserId !== user.id) return;

    const member = await reaction.message.guild.members.fetch(user.id);
    await member.roles.remove(slot.roleId);

    if (stored.loginMessageId) {
        try { 
            const loginMsg = await reaction.message.channel.messages.fetch(stored.loginMessageId);
            if (loginMsg) await loginMsg.delete();
        } catch {}
    }

    if (slot.timer) { clearTimeout(slot.timer); clearInterval(slot.timer); slot.timer = null; }

    const logChannel = await client.channels.fetch(directoryChannelId);
    const loginTime = stored.claimedAt;
    const logoutTime = Date.now();
    await logChannel.send(
        `Slot: ${slot.name}\nUser: <@${stored.claimedUserId}>\nLogin Time: ${formatDate(loginTime)}\nLogout Time: ${formatDate(logoutTime)}\nTotal Time Played: ${formatDuration(logoutTime-loginTime)}`
    );

    slotDB.set(slot.name, { statusMessageId: slot.statusMessageId, claimedUserId: null, loginMessageId: null, claimedAt: null });
    reaction.message.channel.send(`**${slot.name}** slot is now free.`).then(msg => setTimeout(() => msg.delete(), 10000));
});

// -------------------- COMMANDS --------------------
client.on('messageCreate', async message => {
    if (!message.content.startsWith('!') || message.author.bot) return;
    const args = message.content.trim().split(/ +/);
    const cmd = args.shift().toLowerCase();

    if (cmd === '!free') {
        if (!message.member.permissions.has('Administrator')) return message.reply("You don't have permission.");
        const slotName = args[0];
        const slot = slots.find(s => s.name.toLowerCase() === slotName?.toLowerCase());
        if (!slot) return message.reply("Invalid slot name.");

        const stored = slotDB.get(slot.name);
        if (!stored?.claimedUserId) return message.reply(`${slot.name} is already free.`);

        const member = await message.guild.members.fetch(stored.claimedUserId);
        await member.roles.remove(slot.roleId);

        if (stored.loginMessageId) {
            try { const loginMsg = await message.channel.messages.fetch(stored.loginMessageId); if (loginMsg) await loginMsg.delete(); } catch {}
        }

        if (slot.timer) { clearTimeout(slot.timer); clearInterval(slot.timer); slot.timer = null; }

        const logChannel = await client.channels.fetch(directoryChannelId);
        const loginTime = stored.claimedAt;
        const logoutTime = Date.now();
        await logChannel.send(
            `Slot: ${slot.name}\nUser: <@${stored.claimedUserId}>\nLogin Time: ${formatDate(loginTime)}\nLogout Time: ${formatDate(logoutTime)}\nTotal Time Played: ${formatDuration(logoutTime-loginTime)}`
        );

        slotDB.set(slot.name, { statusMessageId: slot.statusMessageId, claimedUserId: null, loginMessageId: null, claimedAt: null });
        return message.reply(`${slot.name} slot has been force freed.`);
    }

    if (cmd === '!slots') {
        let reply = "**Current Slots:**\n";
        for (const slot of slots) {
            const stored = slotDB.get(slot.name);
            if (stored?.claimedUserId) {
                const elapsed = Date.now() - stored.claimedAt;
                const nextReminder = Math.max(0, 4*3600*1000 - elapsed);
                reply += `**${slot.name}**: <@${stored.claimedUserId}> | Login: ${formatDate(stored.claimedAt)} | Next DM: ${formatDuration(nextReminder)}\n`;
            } else reply += `**${slot.name}**: Free\n`;
        }
        message.channel.send(reply);
    }
});

client.login(process.env.DISCORD_TOKEN); // <-- use environment variable
