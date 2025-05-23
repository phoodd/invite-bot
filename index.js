const { Client, GatewayIntentBits, Partials, Events } = require('discord.js');
const { config } = require('dotenv');
config(); // Load DISCORD_TOKEN and GUILD_ID from Railway env vars

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.GuildMember],
});

const invites = new Map();

// Bot ready
client.once(Events.ClientReady, async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);

  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  const inviteList = await guild.invites.fetch();
  invites.set(guild.id, new Map(inviteList.map((invite) => [invite.code, invite.uses])));
});

// Member joins
client.on(Events.GuildMemberAdd, async (member) => {
  const cachedInvites = invites.get(member.guild.id);
  let newInvites;

  try {
    newInvites = await member.guild.invites.fetch();
  } catch (err) {
    console.error(`❌ Failed to fetch invites: ${err.message}`);
    return;
  }

  const usedInvite = newInvites.find((inv) => {
    const prev = cachedInvites.get(inv.code);
    return prev !== undefined && inv.uses > prev;
  });

  invites.set(member.guild.id, new Map(newInvites.map((inv) => [inv.code, inv.uses])));
  let inviter = usedInvite?.inviter;

  // Fallback to audit logs (not always reliable for vanity URLs)
  if (!inviter) {
    try {
      const logs = await member.guild.fetchAuditLogs({ type: 28, limit: 1 });
      inviter = logs.entries.first()?.executor;
    } catch (err) {
      console.warn(`⚠️ Could not fetch audit logs: ${err.message}`);
    }
  }

  const roleName = inviter ? `Invited by ${inviter.username}` : 'joined via vanity invite link';

  let role = member.guild.roles.cache.find((r) => r.name === roleName);

  if (!role) {
    try {
      role = await member.guild.roles.create({
        name: roleName,
        color: 'Random',
        reason: 'Auto-created by bot for invite tracking',
      });
    } catch (err) {
      console.error(`❌ Failed to create role "${roleName}": ${err.message}`);
      return;
    }
  }

  // Add delay before assigning role
  setTimeout(async () => {
    try {
      await member.roles.add(role);
      console.log(`✅ Gave role "${roleName}" to ${member.user.tag}`);
    } catch (err) {
      console.error(`❌ Failed to assign role: ${err.message}`);
    }
  }, 6000); // 6-second delay
});

// New text channel created
client.on(Events.ChannelCreate, async (channel) => {
  if (channel.type === 0) { // 0 = GUILD_TEXT
    try {
      await channel.send(
        "**How to apply:**\n\n" +
        ":writing_hand: 1️⃣ ➜ Submit your https://monkeytype.com/ result (30 seconds). PC ONLY\n\n" +
        ":microphone: 2️⃣ ➜ send us a voice note explaining:\n" +
        "- Why you'd be a great fit,\n" +
        "- A little about your hobbies"
      );
      console.log(`📨 Sent onboarding message to #${channel.name}`);
    } catch (err) {
      console.error(`❌ Could not send message to new channel #${channel.name}: ${err.message}`);
    }
  }
});

// Login
client.login(process.env.DISCORD_TOKEN);
