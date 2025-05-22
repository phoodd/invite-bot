const { Client, GatewayIntentBits, Partials, Events } = require('discord.js');
const { config } = require('dotenv');
config(); // Loads DISCORD_TOKEN and GUILD_ID from Railway env vars

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.GuildMember],
});

const invites = new Map();

client.once(Events.ClientReady, async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);

  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  const inviteList = await guild.invites.fetch();

  invites.set(guild.id, new Map(inviteList.map((invite) => [invite.code, invite.uses])));
});

// Invite tracking and assigning role
client.on(Events.GuildMemberAdd, async (member) => {
  const cachedInvites = invites.get(member.guild.id);
  const newInvites = await member.guild.invites.fetch();

  const usedInvite = newInvites.find((inv) => {
    const prev = cachedInvites.get(inv.code);
    return prev !== undefined && inv.uses > prev;
  });

  invites.set(member.guild.id, new Map(newInvites.map((inv) => [inv.code, inv.uses])));

  const inviter = usedInvite?.inviter;
  if (!inviter) return;

  let inviterRole = await member.guild.roles.cache.find(
    (role) => role.name === `Invited by ${inviter.username}`
  );

  if (!inviterRole) {
    inviterRole = await member.guild.roles.create({
      name: `Invited by ${inviter.username}`,
      color: 'Random',
      reason: 'Created invite role dynamically',
    });
  }

  await member.roles.add(inviterRole);
});

// ✅ Message when a new text channel is created
client.on(Events.ChannelCreate, async (channel) => {
  if (channel.type === 0) { // 0 = GuildText
    try {
      await channel.send(
        "**How to apply:**\n\n" +
        ":writing_hand: 1️⃣ ➜ Submit your https://monkeytype.com/ result (30 seconds). PC ONLY\n\n" +
        ":microphone: 2️⃣ ➜ send us a voice note explaining:\n" +
        "- Why you'd be a great fit,\n" +
        "- A little about your hobbies"
      );
    } catch (err) {
      console.error(`❌ Could not send message to channel ${channel.name}:`, err.message);
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
