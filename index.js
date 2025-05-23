const { Client, GatewayIntentBits, Partials, Events } = require('discord.js');
const { config } = require('dotenv');
config(); // Load DISCORD_TOKEN and GUILD_ID from env

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
  invites.set(guild.id, new Map(inviteList.map((inv) => [inv.code, inv.uses])));
});

client.on(Events.GuildMemberAdd, async (member) => {
  const cachedInvites = invites.get(member.guild.id);
  const newInvites = await member.guild.invites.fetch();

  const usedInvite = newInvites.find((inv) => {
    const prev = cachedInvites.get(inv.code);
    return prev !== undefined && inv.uses > prev;
  });

  invites.set(member.guild.id, new Map(newInvites.map((inv) => [inv.code, inv.uses])));

  let inviterUsername = "vanity invite or unknown";
  if (usedInvite?.inviter) {
    inviterUsername = usedInvite.inviter.username;
  }

  let roleName = `Invited by ${inviterUsername}`;

  let inviterRole = member.guild.roles.cache.find(r => r.name === roleName);
  if (!inviterRole) {
    inviterRole = await member.guild.roles.create({
      name: roleName,
      color: 'Random',
      reason: 'Auto-created invite role',
    });
  }

  try {
    await member.roles.add(inviterRole);
    console.log(`${member.user.username} joined — assigned role: ${roleName}`);
  } catch (error) {
    console.error(`Failed to assign role to ${member.user.username}:`, error.message);
  }
});

// New channel message with 6 second delay
client.on(Events.ChannelCreate, async (channel) => {
  if (channel.type === 0) { // Text channel
    setTimeout(async () => {
      try {
        await channel.send(
          "**How to apply:**\n\n" +
          ":writing_hand: 1️⃣ ➜ Submit your https://monkeytype.com/ result (30 seconds). PC ONLY\n\n" +
          ":microphone: 2️⃣ ➜ send us a voice note explaining:\n" +
          "- Why you'd be a great fit,\n" +
          "- A little about your hobbies"
        );
      } catch (err) {
        console.error(`Could not send message to ${channel.name}:`, err.message);
      }
    }, 6000); // 6 seconds delay
  }
});

client.login(process.env.DISCORD_TOKEN);


const { EmbedBuilder } = require('discord.js');

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  if (message.content.toLowerCase() === '!faq') {
    const faqEmbed = new EmbedBuilder()
      .setTitle('📌 ONLYFANS CHATTER AGENCY – FAQ')
      .setColor('#014AAD') // Hot pink color
      .addFields(
  { name: '❓ How do I apply?', value: 'Submit your monkeytype score + a voice note.' },
  { name: '📅 What are the work hours?', value: 'Flexible – you choose your shift.' }
);

    // Add empty fields for now; you can add them later with .addFields(...)
    // Example:
    // .addFields(
    //   { name: '❓ What do we do?', value: 'We manage chats for OF creators.' },
    //   { name: '💰 How much can I earn?', value: 'Up to €3,000/month depending on performance.' }
    // );

    await message.channel.send({ embeds: [faqEmbed] });
  }
});
