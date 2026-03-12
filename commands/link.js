const {EmbedBuilder, SlashCommandBuilder} = require('discord.js');

const User = require("../schemas/user");
const authHandler = require("../functions/AuthHandler");
module.exports = {
  data: new SlashCommandBuilder()
    .setName('link')
    .setDescription('link your account to the system')
    .addStringOption(option =>
      option.setName('code')
        .setDescription('the code provided by the system')
        .setRequired(true)),
        
  async execute(interaction) {

    const code = interaction.options.getString('code');
    

    if (!code) {
        return interaction.reply({ content: 'Please provide a code to link your account found on the profile page.', ephemeral: true });

    }
    const user = await User.findOne({ code: code });
    if (!user) {
        return interaction.reply({ content: 'Invalid code. Please make sure you have entered the correct code from the profile page.', ephemeral: true });
    }
    if (user.DiscordID && user.DiscordID !== "") {
        return interaction.reply({ content: 'This code has already been used to link an account.', ephemeral: true });
    }
    user.DiscordID = interaction.user.id;
    await user.save();
    const embed = new EmbedBuilder()

        .setTitle('Account Linked Successfully')
        .setDescription('Your account has been successfully linked to the system. You can now use your linked account to access additional features and receive updates.')
        .setColor("Green")
        .setFooter({ text: "ARN Control Bot" })
        .setTimestamp().setColor("#87cefa");
    return interaction.reply({ embeds: [embed], ephemeral: true });
    





  }
}