require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildInvites,
  ],
});

const invites = new Map();

client.once('ready', async () => {
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  const inviteList = await guild.invites.fetch();

  inviteList.forEach(inv => invites.set(inv.code, inv.uses));
  console.log(`✅ Bot is ready. Logged in as ${client.user.tag}`);
});

client.on('guildMemberAdd', async member => {
  const newInvites = await member.guild.invites.fetch();
  let usedInvite = null;

  for (const [code, invite] of newInvites) {
    const prevUses = invites.get(code) || 0;
    if (invite.uses > prevUses) {
      usedInvite = invite;
      break;
    }
  }

  invites.clear();
  newInvites.forEach(inv => invites.set(inv.code, inv.uses));

  const guild = member.guild;

  if (usedInvite && usedInvite.inviter) {
    // ✅ Create or get a role like: "Invited by Username"
    const inviterTag = usedInvite.inviter.username;
    const roleName = `${process.env.INVITED_ROLE_PREFIX} ${inviterTag}`;

    let role = guild.roles.cache.find(r => r.name === roleName);
    if (!role) {
      role = await guild.roles.create({
        name: roleName,
        color: 'Blue',
        reason: `Created by bot for invite tracking`,
      });
    }

    await member.roles.add(role);
    console.log(`${member.user.tag} joined using invite ${usedInvite.code} by ${inviterTag}`);
  } else {
    // 👻 If no invite detected → treat as vanity
    const vanityRoleName = process.env.VANITY_ROLE_NAME;
    let role = guild.roles.cache.find(r => r.name === vanityRoleName);
    if (!role) {
      role = await guild.roles.create({
        name: vanityRoleName,
        color: 'Green',
        reason: `Vanity invite role`,
      });
    }

    await member.roles.add(role);
    console.log(`${member.user.tag} joined via vanity link or unknown invite.`);
  }
});

client.login(process.env.DISCORD_TOKEN);
