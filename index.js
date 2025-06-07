const { Client, GatewayIntentBits, Partials, Events, EmbedBuilder, PermissionsBitField } = require('discord.js');
const { config } = require('dotenv');
config(); // Load DISCORD_TOKEN and GUILD_ID from .env

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

// When bot is ready
client.once(Events.ClientReady, async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  const inviteList = await guild.invites.fetch();
  invites.set(guild.id, new Map(inviteList.map((inv) => [inv.code, inv.uses])));
});

// When a new member joins
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

// Send auto-message on new channel
client.on(Events.ChannelCreate, async (channel) => {
  if (channel.type === 0) {
    setTimeout(async () => {
      try {
        await channel.send(
          "**# How to apply:**\n\n" +
          ":writing_hand: 1️⃣ ➜ Submit your https://forms.gle/hdiNdsbEbykjgTaVA form (takes 60 seconds)\n\n" +
          ":microphone: 2️⃣ ➜ send us a voice note explaining:\n" +
          "- Why you'd be a great fit,\n" +
          "- A little about your hobbies"
        );
      } catch (err) {
        console.error(`Could not send message to ${channel.name}:`, err.message);
      }
    }, 6000);
  }
});

// Handle all message commands
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  // Delete channel command (admins only)
  if (message.content.toLowerCase() === 'x!delete') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply("❌ You don't have permission to use this command.");
    }

    try {
      await message.channel.send("⚠️ Deleting channel in 3 seconds...");
      setTimeout(() => {
        message.channel.delete().catch(err =>
          console.error("Failed to delete channel:", err)
        );
      }, 3000);
    } catch (err) {
      console.error("Error during channel deletion:", err);
      message.reply("❌ Failed to delete the channel.");
    }
    return;
  }

  // FAQ command
  if (message.content.toLowerCase() === '!faq') {
    const faqEmbed = new EmbedBuilder()
      .setTitle('📌 X RECRUITMENT – FAQ')
      .setColor('#014bac')
      .addFields(
        {
          name: '❓ What is this agency?',
          value: 'We’re an OnlyFans chatting agency. We partner directly with top models, letting chatters handle fan interactions and sales.',
        },
        { name: '\u200B', value: '\u200B' },
        {
          name: '💬 What does a chatter do?',
          value: 'Your job is to build strong relationships with fans and sell an experience that keeps them spending.',
        },
        { name: '\u200B', value: '\u200B' },
        {
          name: '⌨️ Why do I need to type over 100 WPM?',
          value: 'We work with extremely high-traffic accounts in the top 0.0001% of accounts in OF — fast typing and thinking are essential.',
        },
        { name: '\u200B', value: '\u200B' },
        {
          name: '🕓 What are the work hours?',
          value: 'Shifts are flexible. Most people work 8 hours/day, 6-7 days a week. You choose your own schedule.',
        },
        { name: '\u200B', value: '\u200B' },
        {
          name: '🧭 What shift times can I choose from?',
          value:
            '**MAIN SHIFT:** 01:00 – 09:00 UK\n' +
            '**GRAVEYARD SHIFT:** 09:00 – 17:00 UK\n' +
            '**AFTERNOON SHIFT:** 17:00 – 01:00 UK',
        },
        { name: '\u200B', value: '\u200B' },
        {
          name: '💸 How do I get paid and how much?',
          value: 'Paid monthly via bank or crypto. Average chatter earns $3K/month.   top performers make $10K+',
        },
        { name: '\u200B', value: '\u200B' },
        {
          name: '📝 What’s the hiring process?',
          value: 'Open a ticket, if you are selected then you’ll go through 1–3 weeks of training before being assigned to an account.',
        },
        { name: '\u200B', value: '\u200B' },
        {
          name: '🎤 Why do I need to send a voice note?',
          value: 'It helps us hear your vibe, energy, and how confident you sound when speaking. Communication is key in our agency.',
        },
      );

    await message.channel.send({ embeds: [faqEmbed] });
    return;
  }

  // Panel builder command
  if (message.content.toLowerCase().startsWith('x!panel')) {
    const lines = message.content.split('\n').slice(1);
    const embed = new EmbedBuilder();
    const fields = [];
    let currentField = { name: '', value: '' };

    let color = '#00b0f4'; // default color

    for (const line of lines) {
      const [keyRaw, ...rest] = line.split(':');
      const key = keyRaw.trim().toLowerCase();
      const value = rest.join(':').trim();

      if (!key) continue;

      switch (key) {
        case 'title':
          embed.setTitle(value);
          break;
        case 'color':
          color = value.startsWith('#') ? value : `#${value}`;
          break;
        case 'name':
          if (currentField.name && currentField.value) {
            fields.push({ ...currentField });
          }
          currentField = { name: value, value: '' };
          break;
        case 'value':
          currentField.value += (currentField.value ? '\n' : '') + value;
          break;
        case 'enter':
          const linesToAdd = '\n'.repeat(parseInt(value, 10) || 1);
          currentField.value += linesToAdd;
          break;
      }
    }

    if (currentField.name && currentField.value) {
      fields.push(currentField);
    }

    if (fields.length > 0) {
      embed.addFields(...fields);
    }

    embed.setColor(color);

    const image = message.attachments.first();
    if (image && image.contentType?.startsWith('image/')) {
      embed.setImage(image.url);
    }

    await message.channel.send({ embeds: [embed] });
  }
});

client.login(process.env.DISCORD_TOKEN);
