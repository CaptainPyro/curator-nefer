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
const dashboardID = '1438801491052990556';
const directoryChannelId = '1426096588509548636';
const ABSTRACTED_ROLE = '1438761961897852958';

const slots = [
  { name: 'Anaxagoras', channelId: '1406663875855650977', roleId: '1426087099521830973', accessRoleId: '1406631086926069863', emoji: '✅', statusMessageId: '1426091781061214262', timer: null },
  { name: 'Kantoku', channelId: '1424270783697518704', roleId: '1426087197668544523', accessRoleId: '1424271027562872972', emoji: '✅', statusMessageId: '1426092140131254366', timer: null },
  { name: 'Blue Wolf', channelId: '1406667945698132028', roleId: '1426087159265362012', accessRoleId: '1406646812194111549', emoji: '✅', statusMessageId: '1426092280598757479', timer: null },
  { name: 'The Claw', channelId: '1406841047950164060', roleId: '1426087223404662815', accessRoleId: '1406838453047394364', emoji: '✅', statusMessageId: '1426092551785545739', timer: null },
  { name: 'Raptor', channelId: '1406849192747466842', roleId: '1426087270385057924', accessRoleId: '1406842481290772551', emoji: '✅', statusMessageId: '1426092759101476894', timer: null },
  { name: 'Muffin', channelId: '1436611717462233199', roleId: '1436611514395136121', accessRoleId: '1436611424570052721', emoji: '✅', statusMessageId: '1437009694433738894', timer: null },
  { name: 'Walnut', channelId: '1436655308104531989', roleId: '1436654744213917818', accessRoleId: '1436654662936821780', emoji: '✅', statusMessageId: '1437009605300326592', timer: null },
  { name: 'Ying Hua', channelId: '1436655490129068124', roleId: '1436654621127872584', accessRoleId: '1436654511388229633', emoji: '✅', statusMessageId: '1437009499666907156', timer: null }
];

const slotDB = new Enmap({ name: 'slots', autoFetch: true, fetchAll: false });

// -------------------- HELPERS --------------------
function formatDate(ms) {
  const d = new Date(ms);
  const offset = 5.5 * 60;
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

// Lock permissions
async function lockCategoryPermissions(guild, slot) {
  try {
    const channel = await guild.channels.fetch(slot.channelId).catch(() => null);
    if (!channel) return;
    await channel.permissionOverwrites.edit(slot.accessRoleId, { ViewChannel: false });
  } catch (err) {
    console.error(`Failed to lock permissions for ${slot.name}:`, err);
  }
}

// Unlock permissions
async function unlockCategoryPermissions(guild, slot) {
  try {
    const channel = await guild.channels.fetch(slot.channelId).catch(() => null);
    if (!channel) return;
    await channel.permissionOverwrites.edit(slot.accessRoleId, { ViewChannel: null });
  } catch (err) {
    console.error(`Failed to unlock permissions for ${slot.name}:`, err);
  }
}

// Send login message
async function sendLoginMessage(channel, member, slotName) {
  const isAbs = member.roles?.cache?.has(ABSTRACTED_ROLE);
  const msg = isAbs
    ? `An **abstracted user** is now logged into **${slotName}**!`
    : `<@${member.id}> is now logged into **${slotName}**!`;

  const sent = await channel.send(msg);

  try {
    const dash = await client.channels.fetch(dashboardID);
    await dash.send(msg);
  } catch {}

  return sent;
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

    const user = await client.users.fetch(stored.claimedUserId).catch(() => null);
    if (user) user.send(`Are you still logged into **${slot.name}**?`).catch(() => {});

    slot.timer = setInterval(async () => {
      const s = slotDB.get(slot.name);
      if (!s?.claimedUserId) { clearInterval(slot.timer); slot.timer = null; return; }
      const u = await client.users.fetch(s.claimedUserId).catch(() => null);
      if (u) u.send(`Reminder: Still logged into **${slot.name}**.`).catch(() => {});
    }, TWO_HOURS);
  }, remainingTime);
}

// -------------------- READY --------------------
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  for (const slot of slots) {
    const channel = await client.channels.fetch(slot.channelId).catch(() => null);
    if (!channel) continue;

    let statusMsg;
    try { statusMsg = await channel.messages.fetch(slot.statusMessageId); }
    catch { continue; }

    if (!statusMsg.reactions.cache.has(slot.emoji)) {
      await statusMsg.react(slot.emoji).catch(() => {});
    }

    const stored = slotDB.get(slot.name);
    if (stored?.claimedUserId) {
      const member = await channel.guild.members.fetch(stored.claimedUserId).catch(() => null);
      if (member && !member.roles.cache.has(slot.roleId)) {
        await member.roles.add(slot.roleId).catch(() => {});
      }

      try {
        await channel.messages.fetch(stored.loginMessageId);
      } catch {
        const loginMsg = await sendLoginMessage(channel, member || { id: stored.claimedUserId, roles: { cache: new Map() } }, slot.name);
        stored.loginMessageId = loginMsg.id;
        slotDB.set(slot.name, stored);
      }

      const elapsed = Date.now() - stored.claimedAt;
      const remaining = Math.max(0, 4 * 3600 * 1000 - elapsed);
      startTimer(slot, remaining);

      await lockCategoryPermissions(channel.guild, slot);
    }
  }
});

// -------------------- REACTION ADD --------------------
client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) await reaction.fetch().catch(() => {});

  const slot = slots.find(s => s.channelId === reaction.message.channel.id && s.emoji === reaction.emoji.name);
  if (!slot) return;

  const stored = slotDB.get(slot.name);

  if (!stored?.claimedUserId) {
    const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
    if (!member) return;

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
    reaction.users.remove(user.id).catch(() => {});
    const dm = await client.users.fetch(user.id).catch(() => null);
    if (dm) dm.send(`Someone else already logged into **${slot.name}**.`).catch(() => {});
  }
});

// -------------------- REACTION REMOVE --------------------
client.on('messageReactionRemove', async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) await reaction.fetch().catch(() => {});

  const slot = slots.find(s => s.channelId === reaction.message.channel.id && s.emoji === reaction.emoji.name);
  if (!
