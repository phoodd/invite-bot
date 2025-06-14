// Full Discord bot with invite tracking, ticket bumping, auto-deletion, and admin commands
const { Client, GatewayIntentBits, Partials, Events, EmbedBuilder, PermissionsBitField, AuditLogEvent } = require('discord.js');
const { config } = require('dotenv');
config(); // Load .env config

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
const activeTickets = new Map(); // Track activity in tickets
const inviterMap = new Map(); // NEW: Track who invited whom <inviterId, [invitedId, invitedId, ...]>
const ticketOwnerMap = new Map(); // NEW: Track who owns which ticket <channelId, ownerId>

// On bot ready
client.once(Events.ClientReady, async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
  // We need to wait a moment for the bot to be fully ready before fetching invites
  setTimeout(async () => {
    try {
        const guild = await client.guilds.fetch(process.env.GUILD_ID);
        const inviteList = await guild.invites.fetch();
        invites.set(guild.id, new Map(inviteList.map((inv) => [inv.code, inv.uses])));
        console.log('✉️ Invites cached successfully.');
    } catch (error) {
        console.error('Error fetching initial invites:', error);
    }
  }, 1000);
});

// Track who invited new members
client.on(Events.GuildMemberAdd, async (member) => {
  const cachedInvites = invites.get(member.guild.id);
  const newInvites = await member.guild.invites.fetch();

  const usedInvite = newInvites.find((inv) => (cachedInvites.get(inv.code) || 0) < inv.uses);

  invites.set(member.guild.id, new Map(newInvites.map((inv) => [inv.code, inv.uses])));

  let inviter = null;
  let inviterUsername = "vanity invite or unknown";
  if (usedInvite?.inviter) {
    inviter = usedInvite.inviter;
    inviterUsername = inviter.username;

    // NEW: Store the relationship between inviter and the new member
    const invitedBy = inviterMap.get(inviter.id) || [];
    invitedBy.push(member.id);
    inviterMap.set(inviter.id, invitedBy);
    console.log(`📊 ${member.user.username} was invited by ${inviter.username}. Stored in inviterMap.`);
  }

  let roleName = `Invited by ${inviterUsername}`;
  let inviterRole = member.guild.roles.cache.find(r => r.name === roleName);

  if (!inviterRole) {
    try {
        inviterRole = await member.guild.roles.create({
            name: roleName,
            color: 'Random',
            reason: 'Auto-created invite role',
        });
        console.log(`✨ Created new role: ${roleName}`);
    } catch (error) {
        console.error(`Failed to create role "${roleName}":`, error.message);
        return;
    }
  }

  try {
    await member.roles.add(inviterRole);
    console.log(`${member.user.username} joined — assigned role: ${roleName}`);
  } catch (error) {
    console.error(`Failed to assign role to ${member.user.username}:`, error.message);
  }
});


// When a new channel is created (used as a ticket system)
client.on(Events.ChannelCreate, async (channel) => {
  if (channel.type === 0) { // Text channel
    const guild = channel.guild;

    // NEW: Use Audit Logs to find out who created the channel
    // This requires the 'View Audit Log' permission for the bot
    try {
        const auditLogs = await guild.fetchAuditLogs({
            limit: 1,
            type: AuditLogEvent.ChannelCreate,
        });
        const channelLog = auditLogs.entries.first();
        if (channelLog) {
            const { executor, target } = channelLog;
            // Check if the log is for the channel that was just created
            if (target.id === channel.id) {
                ticketOwnerMap.set(channel.id, executor.id);
                console.log(`✅ Ticket channel "${channel.name}" created by ${executor.username}. Stored in ticketOwnerMap.`);
            }
        }
    } catch (error) {
        console.error("Could not fetch audit logs. Does the bot have 'View Audit Log' permissions?", error);
    }
    
    const prospectRole = guild.roles.cache.find(r => r.name.toLowerCase() === 'prospect');
    if (!prospectRole) return;

    activeTickets.set(channel.id, { prospectSpoke: false });

    // Auto-bump message after 4 hours
    setTimeout(async () => {
      if (!activeTickets.get(channel.id)?.prospectSpoke) {
        try {
          await channel.send(
            `Hey <@&${prospectRole.id}>!\n\nThis is just a quick bump reminding you to fill out the form and to send a voice note!\n\nFailing to do so within a 24hour period will have this ticket deleted!`
          );
        } catch (err) {
          console.error(`Failed to send bump message in ${channel.name}:`, err.message);
        }
      }
    }, 14400000); // 4 hours

    // Auto-delete after 24 hours
    setTimeout(async () => {
      if (!activeTickets.get(channel.id)?.prospectSpoke) {
        try {
          await channel.send("⏳ This ticket is now being closed due to inactivity.");
          setTimeout(() => {
            channel.delete().catch(err =>
              console.error(`Failed to delete channel ${channel.name}:`, err.message)
            );
          }, 3000);
        } catch (err) {
          console.error(`Failed to send auto-delete message in ${channel.name}:`, err.message);
        }
      }
    }, 86400000); // 24 hours

    // Intro message
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
        console.error(`Could not send intro message to ${channel.name}:`, err.message);
      }
    }, 6000);
  }
});

// NEW: When a channel is deleted, remove it from the ticket owner map
client.on(Events.ChannelDelete, (channel) => {
    if (ticketOwnerMap.has(channel.id)) {
        ticketOwnerMap.delete(channel.id);
        console.log(`🗑️ Ticket channel "${channel.name}" deleted. Removed from ticketOwnerMap.`);
    }
});


// On message, handle commands and track ticket activity
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.guild) return;

  const channelId = message.channel.id;
  const ticket = activeTickets.get(channelId);
  if (ticket) {
    const member = message.member;
    if (member?.roles.cache.some(r => r.name.toLowerCase() === 'prospect')) {
      ticket.prospectSpoke = true;
      activeTickets.set(channelId, ticket);
    }
  }

  // --- NEW COMMAND: x/tickets ---
  if (message.content.toLowerCase() === 'x/tickets') {
    const inviterId = message.author.id;
    const invitedUsers = inviterMap.get(inviterId) || [];

    if (invitedUsers.length === 0) {
        return message.reply({
            content: "You haven't invited anyone who has joined the server yet, or they haven't created any tickets.",
            ephemeral: true // Visible only to the command user
        });
    }

    const userTickets = [];
    // Iterate through all tickets the bot knows about
    for (const [ticketChannelId, ownerId] of ticketOwnerMap.entries()) {
        // Check if the ticket owner is one of the users invited by the command author
        if (invitedUsers.includes(ownerId)) {
            const ticketChannel = message.guild.channels.cache.get(ticketChannelId);
            if (ticketChannel) { // Ensure the channel still exists
                userTickets.push(ticketChannel.name);
            }
        }
    }
    
    if (userTickets.length === 0) {
        return message.reply({
            content: "None of the users you invited have created a ticket yet.",
            ephemeral: true
        });
    }

    const embed = new EmbedBuilder()
      .setTitle('Your Active Tickets')
      .setDescription('Here are the current active tickets from members you invited:')
      .setColor('#014bac')
      .addFields({ name: 'Ticket Names', value: userTickets.map(name => `\`${name}\``).join('\n') });

    return message.reply({
        embeds: [embed],
        ephemeral: true // Visible only to the command user
    });
  }
  // --- END of x/tickets command ---


  // Admin-only delete command
  if (message.content.toLowerCase() === 'x!delete') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply("❌ You don't have permission to use this command.");
    }
    try {
      await message.channel.send("⚠️ Deleting channel in 3 seconds...");
      setTimeout(() => message.channel.delete().catch(console.error), 3000);
    } catch (err) {
      console.error("Error during channel deletion:", err);
    }
    return;
  }

  // FAQ command
  if (message.content.toLowerCase() === '!faq') {
    const faqEmbed = new EmbedBuilder()
      .setTitle('📌 X RECRUITMENT – FAQ')
      .setColor('#014bac')
      .addFields(
        { name: '❓ What is this agency?', value: 'We’re an OnlyFans chatting agency. We partner directly with top models, letting chatters handle fan interactions and sales.' },
        { name: '💬 What does a chatter do?', value: 'Your job is to build strong relationships with fans and sell an experience that keeps them spending.' },
        { name: '⌨️ Why do I need to type over 100 WPM?', value: 'We work with extremely high-traffic accounts — fast typing and thinking are essential.' },
        { name: '🕓 What are the work hours?', value: 'Shifts are flexible. Most people work 8 hours/day, 6-7 days a week. You choose your schedule.' },
        { name: '🧭 What shift times can I choose from?', value: '**MAIN:** 01:00 – 09:00 UK\n**GRAVEYARD:** 09:00 – 17:00 UK\n**AFTERNOON:** 17:00 – 01:00 UK' },
        { name: '💸 How do I get paid and how much?', value: 'Paid monthly via bank or crypto. Average chatter earns $3K/month. Top performers earn $10K+.' },
        { name: '📝 What’s the hiring process?', value: 'Open a ticket. If selected, you’ll go through 1–3 weeks of training before assignment.' },
        { name: '🎤 Why do I need to send a voice note?', value: 'It helps us hear your vibe and confidence. Communication is key here.' },
      );
    await message.channel.send({ embeds: [faqEmbed] });
    return;
  }

  // Custom panel embed builder
  if (message.content.toLowerCase().startsWith('x!panel')) {
    const lines = message.content.split('\n').slice(1);
    const embed = new EmbedBuilder();
    const fields = [];
    let currentField = { name: '', value: '' };
    let color = '#00b0f4';

    for (const line of lines) {
      const [keyRaw, ...rest] = line.split(':');
      const key = keyRaw.trim().toLowerCase();
      const value = rest.join(':').trim();

      switch (key) {
        case 'title': embed.setTitle(value); break;
        case 'color': color = value.startsWith('#') ? value : `#${value}`; break;
        case 'name':
          if (currentField.name && currentField.value) fields.push({ ...currentField });
          currentField = { name: value, value: '' };
          break;
        case 'value': currentField.value += (currentField.value ? '\n' : '') + value; break;
        case 'enter': currentField.value += '\n'.repeat(parseInt(value) || 1); break;
      }
    }
    if (currentField.name && currentField.value) fields.push(currentField);
    if (fields.length > 0) embed.addFields(...fields);
    embed.setColor(color);

    const image = message.attachments.first();
    if (image?.contentType?.startsWith('image/')) {
      embed.setImage(image.url);
    }
    await message.channel.send({ embeds: [embed] });
  }

  // Rename ticket
  if (message.content.toLowerCase().startsWith('x!rename')) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
      return message.reply("❌ You don't have permission to rename channels.");
    }
    const newName = message.content.slice('x!rename'.length).trim();
    if (!newName) return message.reply("❌ Provide a new name. Example: `x!rename 100wpm-india-18yo`");
    if (newName.length > 100) return message.reply("❌ Name too long. Max 100 characters.");

    try {
      await message.channel.setName(newName);
      await message.reply(`✅ Channel renamed to **${newName}**`);
    } catch (err) {
      console.error(`Failed to rename channel:`, err);
      await message.reply("❌ Failed to rename. Check my permissions.");
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
