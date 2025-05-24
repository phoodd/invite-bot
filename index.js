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
      .setColor('#FF69B4') // Hot pink

      .addFields(
        {
          name: '❓ What is this agency?',
          value: 'We’re an OnlyFans chatting agency. We partner directly with top models, letting chatters handle fan interactions and sales.',
        },
        {
          name: '💬 What does a chatter do?',
          value: 'Your job is to build strong relationships with fans and sell an experience that keeps them spending.',
        },
        {
          name: '⌨️ Why do I need to type over 100 WPM?',
          value: 'We work with extremely high-traffic accounts in the top 0.0001% of accounts in OF — fast typing and thinking are essential.',
        },
        {
          name: '🕓 What are the work hours?',
          value: 'Shifts are flexible. Most people work 6–8 hours/day, 5–6 days a week. You choose your own schedule.',
        },
        {
          name: '🧭 What shift times can I choose from?',
          value:
            '**MAIN SHIFT:** 01:00 – 09:00 UK\n' +
            '**GRAVEYARD SHIFT:** 09:00 – 17:00 UK\n' +
            '**AFTERNOON SHIFT:** 17:00 – 01:00 UK',
        },
        {
          name: '💸 How do I get paid and how much?',
          value: 'Paid monthly via bank or crypto. Average chatter earns $3K/month.   top performers make $10K+',
        },
        {
          name: '📝 What’s the hiring process?',
          value: 'Open a ticket, if you are selected then you’ll go through 1–3 weeks of training before being assigned to an account.',
        },
        {
          name: '🎤 Why do I need to send a voice note?',
          value: 'It helps us hear your vibe, energy, and how confident you sound when speaking. Communication is key in our agency.',
        },
      );

    await message.channel.send({ embeds: [faqEmbed] });
  }
});
