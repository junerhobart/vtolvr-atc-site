const { ActivityType } = require("discord.js");

module.exports = {
	name: "ready",
	once: true,
	async execute(client) {
		
		console.info(`[Discord bot]:Ready! Logged in as ${client.user.tag} on Node ${process.version}`);
		console.info(`[Discord bot]:Inside ${client.guilds.cache.size} servers!`);
		console.info(`[Discord bot]:Handling ${client.guilds.cache.reduce((acc, g) => acc + g.memberCount,0)} users`);
		
		const activities = [
			`and watching over ${client.guilds.cache.size} servers!`,
			`and monitoring ${client.guilds.cache.reduce((acc, g) => acc + g.memberCount,0)} users!`,
			`and keeping an eye on the skies!`,
			`and ensuring smooth ATC operations!`,
			`and ready to assist with ATC needs!`,
			'squawking 2000 and ready for instructions!',
			
		];
    
		setInterval(() => {
			const status = activities[Math.floor(Math.random() * activities.length)];
			client.user.setActivity(status, { type: ActivityType.Watching });
		}, 5000);
    
	},
};
