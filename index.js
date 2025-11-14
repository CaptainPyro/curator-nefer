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
const dashboardID = '1438801491052990556';
const directoryChannelId = '1426096588509548636';
const ABSTRACTED_ROLE = '1438761961897852958'; // role that requests privacy

// Each slot now contains accessRoleId and categoryId as requested
const slots = [
  { name: 'Anaxagoras', channelId: '1406663875855650977', roleId: '1426087099521830973', accessRoleId: '1406631086926069863',  emoji: '✅', statusMessageId: '1426091781061214262', timer: null },
  { name: 'Kantoku', channelId: '1424270783697518704', roleId: '1426087197668544523', accessRoleId: '1424271027562872972',  emoji: '✅', statusMessageId: '1426092140131254366', timer: null },
  { name: 'Blue Wolf', channelId: '1406667945698132028', roleId: '1426087159265362012', accessRoleId: '1406646812194111549',  emoji: '✅', statusMessageId: '1426092280598757479', timer: null },
  { name: 'The Claw', channelId: '1406841047950164060', roleId: '1426087223404662815', accessRoleId: '1406838453047394364',  emoji: '✅', statusMessageId: '1426092551785545739', timer: null },
  { name: 'Raptor', channelId: '1406849192747466842', roleId: '1426087270385057924', accessRoleId: '1406842481290772551',  emoji: '✅', statusMessageId: '1426092759101476894', timer: null },
  { name: 'Muffin', channelId: '1436611717462233199', roleId: '1436611514395136121', accessRoleId: '1436611424570052721',  emoji: '✅', statusMessageId: '1437009694433738894', timer: null },
  { name: 'Walnut', channelId: '1436655308104531989', roleId: '1436654744213917818', accessRoleId: '1436654662936821780',  emoji: '✅', statusMessageId: '1437009605300326592', timer: null },
  { name: 'Ying Hua', channelId: '1436655490129068124', roleId: '1436654621127872584', accessRoleId: '1436654511388229633',  emoji: '✅', statusMessageId: '1437009499666907156', timer: null }
];

// Persistent storage
const slotDB = new Enmap({ name: 'slots', autoFetch: true, fetchAll: false });

// -------------------- HELPERS --------------------
function formatDate(ms) {
  const d = new Date(ms);
  const offset = 5.5 * 60; // IST offset minutes
  const local = new Date(d.getTime() + offset * 60 * 1000);
  const dd = String(local.getDate()).padStart(2, '0');
  const mm = String(local.getMonth() + 1).padStart(2, '0');
  const yyyy = local.getFullYear();
  const hh = String(local.getHours()).padStart(2, '0');
  const min = String(local.getMinutes()).padStart(2, '0');
  return `${dd}-${mm}-${yyyy}, ${hh}:${min}`;
}

function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  return `${hours}:${minutes}`;
}

// Permission helpers: lock/unlock the category's view permission for the access role
async function lockCategoryPermissions(guild, slot) {
  try {
    let channel = guild.channels.cache.get(slot.channelId);
    if (!channel) channel = await guild.channels.fetch(slot.channelId).catch(() => null);
    if (!channel) return;
    await channel.permissionOverwrites.edit(slot.accessRoleId, { ViewChannel: false });
  } catch (err) {
    console.error(`Failed to lock permissions for ${slot.name}:`, err);
  }

asasync function unlockCategoryPermissions(guild, slot) {
  try {
    let channel = guild.channels.cache.get(slot.channelId);
    if (!channel) channel = await guild.channels.fetch(slot.channelId).catch(() => null);
    if (!channel) return;
    await channel.permissionOverwrites.edit(slot.accessRoleId, { ViewChannel: null });
  } catch (err) {
    console.error(`Failed to unlock permissions for ${slot.name}:`, err);
  }
}

// Send login messageif the user has the ABSTRACTED_ROLE, send the abstracted message
async function sendLoginMessage(channel, member, slotName) {
  const isAbstracted = member.roles?.cache?.has(ABSTRACTED_ROLE);
  const msg = isAbstracted
    ? `An **abstracted user** is now logged into **${slotName}**!`
    : `<@${member.id}> is now logged into **${slotName}**!`;

  // send to slot channel
  const sent = await channel.send(msg);

  // also send to dashboard
  try {
    const dash = await client.channels.fetch(dashboardID);
    await dash.send(msg);
  } catch {}

  return sent;
}**!`);
  } else {
    return channel.send(`<@${member.id}> is now logged into **${slotName}**!`);
  }
}

// -------------------- TIMER --------------------
function startTimer(slot, remainingTime = 4 * 60 * 60 * 1000) {
  if (slot.timer) { clearTimeout(slot.timer); clearInterval(slot.timer); }
  const TWO_HOURS = 2 * 60 * 60 * 1000;

  slot.timer = setTimeout(async () => {
    const stored = slotDB.get(slot.name);
    if (!stored?.claimedUserId) return;

    const user = await client.users.fetch(stored.claimedUserId).catch(() => null);
    if (user) await user.send(`Are you still logged into **${slot.name}**? If not, please unreact.`).catch(() => {});

    // Repeat reminders every TWO_HOURS
    slot.timer = setInterval(async () => {
      const repeat = slotDB.get(slot.name);
      if (!repeat?.claimedUserId) { clearInterval(slot.timer); slot.timer = null; return; }
      const usr = await client.users.fetch(repeat.claimedUserId).catch(() => null);
      if (usr) await usr.send(`Reminder: You are still logged into **${slot.name}**. Please unreact if done.`).catch(() => {});
    }, TWO_HOURS);
  }, remainingTime);
}

// -------------------- READY --------------------
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  // Recovery: ensure status messages have reaction and restore claimed slots
  for (const slot of slots) {
    const channel = await client.channels.fetch(slot.channelId).catch(() => null);
    if (!channel) { console.error(`Channel not found for ${slot.name}`); continue; }

    let statusMsg;
    try { statusMsg = await channel.messages.fetch(slot.statusMessageId); } catch (e) { console.error(`Status message missing for ${slot.name}`); continue; }

    if (!statusMsg.reactions.cache.has(slot.emoji)) await statusMsg.react(slot.emoji).catch(() => {});

    const stored = slotDB.get(slot.name);
    if (stored?.claimedUserId) {
      try {
        const member = await channel.guild.members.fetch(stored.claimedUserId).catch(() => null);
        if (member && !member.roles.cache.has(slot.roleId)) await member.roles.add(slot.roleId).catch(() => {});

        // re-create login message if missing
        try { await channel.messages.fetch(stored.loginMessageId); }
        catch {
          const loginMsg = await sendLoginMessage(channel, member || { id: stored.claimedUserId, roles: { cache: new Map() } }, slot.name);
          stored.loginMessageId = loginMsg.id;
          slotDB.set(slot.name, stored);
        }

        const elapsed = Date.now() - stored.claimedAt;
        const remaining = Math.max(0, 4 * 3600 * 1000 - elapsed);
        startTimer(slot, remaining);

        // ensure category is locked if slot is claimed
        if (channel.guild) await lockCategoryPermissions(channel.guild, slot);

      } catch (err) { console.error(`Failed to restore slot ${slot.name}:`, err); }
    }
  }
});

// -------------------- REACTIONS --------------------
client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) await reaction.fetch().catch(() => {});

  const slot = slots.find(s => s.channelId === reaction.message.channel.id && s.emoji === reaction.emoji.name);
  if (!slot) return;

  const stored = slotDB.get(slot.name);

  if (!stored?.claimedUserId) {
    const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
    if (!member) return;

    // Grant role and lock category access
    await member.roles.add(slot.roleId).catch(() => {});
    await lockCategoryPermissions(reaction.message.guild, slot);

    const loginMsg = await sendLoginMessage(reaction.message.channel, member, slot.name);

    slotDB.set(slot.name, {
      statusMessageId: slot.statusMessageId,
      claimedUserId: user.id,
      loginMessageId: loginMsg.id,
      claimedAt: Date.now()
    });

    startTimer(slot);
  } else {
    // Slot already claimed — remove the reaction and DM the user
    reaction.users.remove(user.id).catch(() => {});
    const dm = await client.users.fetch(user.id).catch(() => null);
    if (dm) dm.send(`Someone else is already logged into **${slot.name}**. Please wait until they log out.`).catch(() => {});
  }
});

client.on('messageReactionRemove', async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) await reaction.fetch().catch(() => {});

  const slot = slots.find(s => s.channelId === reaction.message.channel.id && s.emoji === reaction.emoji.name);
  if (!slot) return;

  const stored = slotDB.get(slot.name);
  if (stored?.claimedUserId !== user.id) return;

  const guild = reaction.message.guild;
  const member = await guild.members.fetch(user.id).catch(() => null);
  if (member) await member.roles.remove(slot.roleId).catch(() => {});

  // delete login message if exists
  if (stored.loginMessageId) {
    try {
      const chan = await client.channels.fetch(slot.channelId).catch(() => null);
      if (chan) {
        const loginMsg = await chan.messages.fetch(stored.loginMessageId).catch(() => null);
        if (loginMsg) await loginMsg.delete().catch(() => {});
      }
    } catch (e) {}
  }

  // clear timers
  if (slot.timer) { clearTimeout(slot.timer); clearInterval(slot.timer); slot.timer = null; }

  // send directory log — mention hidden with pipes if abstracted
  const log = await client.channels.fetch(directoryChannelId).catch(() => null);
  const login = stored.claimedAt;
  const logout = Date.now();
  const isAbstracted = member ? member.roles.cache.has(ABSTRACTED_ROLE) : false;
  const hiddenMention = `||<@${stored.claimedUserId}>||`;

  if (log) {
    await log.send(
      `Slot: ${slot.name}
User: ${isAbstracted ? `${hiddenMention} (abstracted user)` : `<@${stored.claimedUserId}>`}
Login Time: ${formatDate(login)}
Logout Time: ${formatDate(logout)}
Total Time Played: ${formatDuration(logout - login)}`
    ).catch(() => {});
  }

  // unlock category permissions now that slot is free
  await unlockCategoryPermissions(guild, slot);

  // persist free state
  slotDB.set(slot.name, { statusMessageId: slot.statusMessageId, claimedUserId: null, loginMessageId: null, claimedAt: null });

  // ephemeral announcement in channel
  const chan = await client.channels.fetch(slot.channelId).catch(() => null);
  if (chan) chan.send(`**${slot.name}** slot is now free.`).then(m => setTimeout(() => m.delete().catch(() => {}), 10000)).catch(() => {});

  // also send to dashboard
  try {
    const dash = await client.channels.fetch(dashboardID);
    await dash.send(`**${slot.name}** slot is now free.`);
  } catch {}
  ** slot is now free.`).then(m => setTimeout(() => m.delete().catch(() => {}), 10000)).catch(() => {});
});

// -------------------- COMMANDS --------------------
client.on('messageCreate', async message => {
  if (!message.content.startsWith('!') || message.author.bot) return;
  const args = message.content.trim().split(/ +/);
  const cmd = args.shift().toLowerCase();

  // Force free a slot (admin only)
  if (cmd === '!free') {
    if (!message.member.permissions.has('Administrator')) return message.reply("You don't have permission.");

    const slotName = args[0];
    const slot = slots.find(s => s.name.toLowerCase() === slotName?.toLowerCase());
    if (!slot) return message.reply('Invalid slot name.');

    const stored = slotDB.get(slot.name);
    if (!stored?.claimedUserId) return message.reply(`${slot.name} is already free.`);

    const member = await message.guild.members.fetch(stored.claimedUserId).catch(() => null);
    if (member) await member.roles.remove(slot.roleId).catch(() => {});

    // delete login message if present
    if (stored.loginMessageId) {
      try {
        const ch = await client.channels.fetch(slot.channelId).catch(() => null);
        if (ch) {
          const lm = await ch.messages.fetch(stored.loginMessageId).catch(() => null);
          if (lm) await lm.delete().catch(() => {});
        }
      } catch (e) {}
    }

    // clear timers and unlock category
    if (slot.timer) { clearTimeout(slot.timer); clearInterval(slot.timer); slot.timer = null; }
    await unlockCategoryPermissions(message.guild, slot);

    // log directory
    const log = await client.channels.fetch(directoryChannelId).catch(() => null);
    const login = stored.claimedAt;
    const logout = Date.now();
    const isAbstracted = member ? member.roles.cache.has(ABSTRACTED_ROLE) : false;
    const hiddenMention = `||<@${stored.claimedUserId}>||`;

    if (log) {
      await log.send(
        `Slot: ${slot.name}
User: ${isAbstracted ? `${hiddenMention} (abstracted user)` : `<@${stored.claimedUserId}>`}
Login Time: ${formatDate(login)}
Logout Time: ${formatDate(logout)}
Total Time Played: ${formatDuration(logout - login)}`
      ).catch(() => {});
    }

    slotDB.set(slot.name, { statusMessageId: slot.statusMessageId, claimedUserId: null, loginMessageId: null, claimedAt: null });
    // also send to dashboard
    try {
      const dash = await client.channels.fetch(dashboardID);
      await dash.send(`**${slot.name}** slot has been force freed.`);
    } catch {}

    return message.reply(`${slot.name} slot has been force freed`.`);
  }

  // List slots
  if (cmd === '!slots') {
    let reply = '**Current Slots:**
';

    for (const slot of slots) {
      const stored = slotDB.get(slot.name);

      if (stored?.claimedUserId) {
        const member = await message.guild.members.fetch(stored.claimedUserId).catch(() => null);
        const isAbstracted = member ? member.roles.cache.has(ABSTRACTED_ROLE) : false;
        const hidden = `||<@${stored.claimedUserId}>||`;
        const shown = isAbstracted ? hidden : `<@${stored.claimedUserId}>`;

        const elapsed = Date.now() - stored.claimedAt;
        const next = Math.max(0, 4 * 3600 * 1000 - elapsed);

        reply += `**${slot.name}**: ${shown} | Login: ${formatDate(stored.claimedAt)} | Next DM: ${formatDuration(next)}
`;
      } else {
        reply += `**${slot.name}**: Free
`;
      }
    }

    message.channel.send(reply).catch(() => {});
  }
});

client.login(process.env.DISCORD_TOKEN);
