const express = require('express');
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
require('dotenv').config();

const Application = require('./schemas/application');
const Users = require('./schemas/users');
const Events = require('./schemas/events');
const authHandler = require('./functions/AuthHandler');
const discord = require('discord.js');
const { GatewayIntentBits, EmbedBuilder, Collection, ActionRowBuilder, ButtonStyle } = require('discord.js');



//Discord bot setup
const botIntents = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMembers,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.DirectMessages,
];
if (process.env.ENABLE_MESSAGE_CONTENT_INTENT === 'true') {
  botIntents.push(GatewayIntentBits.MessageContent);
}
const bot = new discord.Client({ intents: botIntents });

bot.on("userUpdate", async (oldMember, newMember) => {
  const user = await Users.findOne({ DiscordID: newMember.id });
  if (user && user.avatar === newMember.avatarURL()) {
    
        console.log("User didn't changed avatar");
    } else if (user && user.avatar !== newMember.avatarURL()) {
        
      
          user.avatar = newMember.avatarURL() || "✈️";
          user.save();
          console.log(`Updated avatar for user ${user.Username} to ${user.avatar}`);
        } else {
          console.log(`No user found with DiscordID ${newMember.id} to update avatar`);
        

    };
});

const fs = require('fs');
for (const file of fs.readdirSync(path.join(__dirname, './functions'))) {
    if (file.endsWith('.js')) {
        const functionName = file.split('.')[0];
        const functionPath = path.join(__dirname, './functions', file);

        const loadedModule = require(functionPath);
        if (typeof loadedModule === 'function') {
          loadedModule(bot);
          console.log(`[Discord bot]: Loaded [${functionName}] successfully.`);
        } else {
          console.log(`[Discord bot]: Skipped [${functionName}] - module does not export an initializer function.`);
        }
    }
}
bot.commands = new Collection();

const commandFiles = fs.readdirSync(path.join(__dirname, './commands')).filter(file => file.endsWith('.js'));
const eventFiles = fs.readdirSync(path.join(__dirname, './events')).filter(file => file.endsWith('.js'));

bot.commandFiles = commandFiles;

bot.handleCommands(commandFiles, path.join(__dirname, './commands'));
bot.handleEvents(eventFiles, path.join(__dirname, './events'));


const app = express();
const PORT = process.env.PORT || 3000;
const passwordResetRequests = new Map();

// SendGrid Configuration (Primary Email Provider)
const sendgridApiKey = process.env.SENDGRID_API_KEY;
const sendgridConfigured = Boolean(sendgridApiKey && sendgridApiKey.trim());

const mailTransporter = sendgridConfigured ? nodemailer.createTransport({
  host: 'smtp.sendgrid.net',
  port: 587,
  secure: false,
  auth: {
    user: 'apikey',
    pass: sendgridApiKey
  },
  connectionTimeout: 5000,
  socketTimeout: 5000
}) : null;

if (mailTransporter && process.env.NODE_ENV !== 'production') {
  mailTransporter.verify((error, success) => {
    if (error) {
      console.error('[Email] SendGrid connection test failed:', error.message);
    } else {
      console.log('[Email] SendGrid connection test successful');
    }
  });
}

function generateResetCode() {
  return crypto.randomInt(100000, 1000000).toString();
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function sendPasswordResetEmail(email, code) {
  if (!mailTransporter) {
    return Promise.reject(new Error('SendGrid is not configured'));
  }

  const smtpTimeoutMs = 8000;
  const fromAddress = process.env.SMTP_FROM;
  const fromDisplay = process.env.SMTP_FROM_NAME || 'Aviation Realism Network';
  const plainText = [
    'Aviation Realism Network password reset',
    '',
    `Your verification code is: ${code}`,
    'This code expires in 10 minutes.',
    '',
    'If you did not request this code, you can ignore this email.'
  ].join('\n');

  const mailOptions = {
    from: `"${fromDisplay}" <${fromAddress}>`,
    replyTo: fromAddress,
    to: email,
    subject: 'Aviation Realism Network password reset code',
    text: plainText,
    html: `
      <div style="font-family: Arial, sans-serif; color: #222;">
        <h2 style="margin-bottom: 8px;">Aviation Realism Network password reset</h2>
        <p>Your verification code is:</p>
        <div style="font-size: 28px; font-weight: bold; letter-spacing: 4px; margin: 12px 0;">${code}</div>
        <p>This code expires in <strong>10 minutes</strong>.</p>
        <p style="margin-top: 18px; color: #666;">If you did not request this code, you can ignore this email.</p>
      </div>
    `
  };

  return Promise.race([
    mailTransporter.sendMail(mailOptions).then(result => {
      console.log('[Email] Password reset code sent via SendGrid:', {
        messageId: result?.messageId,
        accepted: result?.accepted,
        provider: 'SendGrid'
      });
      return result;
    }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('SendGrid send timeout')), smtpTimeoutMs)
    )
  ]);
}

async function postDiscordWebhook(webhookUrl, payload, errorLabel) {
  if (!webhookUrl) {
    throw new Error('Webhook URL is not configured');
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${errorLabel}: ${errorText || response.status}`);
  }
}

async function sendDM(userId, message) {
  const user = await bot.users.fetch(userId);
  await user.send(message);
}

// Set EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use("/assets", express.static(path.join(__dirname, 'assets')));
app.use("/scripts", express.static(path.join(__dirname, 'scripts')));
app.use("/styles", express.static(path.join(__dirname, 'css')));
// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Parse JSON and URL-encoded data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session middleware
const session = require('express-session');
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false, httpOnly: true, maxAge: 1800000 } // 30 minutes
}));

// Make session user available in all templates automatically
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// Fast-fail common internet scanner probes to reduce noise and prevent unnecessary route work.
app.use((req, res, next) => {
  const pathLower = req.path.toLowerCase();
  const isLikelyProbe =
    pathLower.includes('.env') ||
    pathLower.endsWith('.php') ||
    pathLower.includes('phpinfo') ||
    pathLower.includes('/wp-') ||
    pathLower.includes('wordpress') ||
    pathLower.includes('sendgrid_keys.json') ||
    pathLower.endsWith('webpack.config.js') ||
    pathLower.endsWith('vite.config.ts');

  if (isLikelyProbe) {
    return res.status(404).send('Not found');
  }

  return next();
});

// Routes
app.get('/', (req, res) => {
  res.render('index', { 
    title: 'Aviation Realism Network',
    message: 'Welcome to the Aviation Realism Network Website',
    user: req.session.user
  });
});

app.get('/sessions', (req, res) => {
  res.render('sessions', { 
    title: 'Sessions',
    message: 'Manage your VTOL VR sessions here',
    user: req.session.user  
  });
});

app.get("/ifr", authHandler.restrict, (req, res) => {
  res.render('ifr', {
    title: 'IFR',
    message: 'IFR Flight Planning and Tracking',
    user: req.session.user
  });
});
app.get("/discord", (req, res) => {
  res.redirect("https://discord.gg/F3rh3FZ8cs");
});
app.get("/information", authHandler.restrict, (req, res) => { 
  res.render('infomation', {
    title: 'Information',
    message: 'Access guides, manuals, and documentation for ATC and Enforcer roles',
    user: req.session.user
  });
});

app.get("/charts", (req, res) => {
  res.render('charts', {
    title: 'Charts',
    message: 'VTOL VR Maps and Charts',
    user: req.session.user
  });
});
app.get("/api/sessions", async (req, res) => {
  try {
    if (!process.env.SESSIONS_API_URL) {
      throw new Error('SESSIONS_API_URL is not configured');
    }

    const response = await fetch(process.env.SESSIONS_API_URL);
    if (!response.ok) {
      throw new Error(`Sessions API returned ${response.status}`);
    }

    const sessions = await response.json();
    res.json(sessions);
  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});



app.post('/api/ifr/submit', async function(req,res){

const data= req.body
var title = "Flight Plan for " + data.flightName
console.log(data)
if(data.data !=null && data.data != undefined){

  data = data.data
  console.log(data)
}
if (data.navigationLog === undefined || data.navigationLog === null || data.navigationLog === 'None') {
  title += " VFR";
}else {
  title += " IFR";
}


  const embedBody = {
        content: '<@&1474153893872009339> incoming ATC Flight Plan', // Empty content field
        "embeds": [{
            title: title,
            description: `Here is the flight plan for callsign ${data.flightName || '(Not specified)'} || Flight ID: ${data.squawkCode}`,
            color: 0xFFA500,
            fields: [
                { name: 'SessionID', value: data.sessionID || '(Not specified)' },
                { name: 'Session Map', value: data.sessionMap || '(Not specified)' },
                { name: 'Flight Callsign', value: data.flightName || '(Not specified)' },
                { name: 'Aircraft Type', value: data.aircraftType || '(Not specified)' },
                { name: 'Cruising Altitude', value: data.altitude || '(Not specified)' },
                { name: 'Departure Location', value: data.departure || '(Not specified)' },
                { name: 'Destination', value: data.destination || '(Not specified)' },
                { name: 'Total Fuel Onboard', value: data.totalFuel || '(Not specified)' },
                { name: 'Bingo Fuel Level', value: data.bingoFuel || '(Not specified)' },
                { name: 'Weather Briefing', value: data.weatherBriefing || '(Not specified)' },
                { name: 'Navigation Log', value: data.navigationLog !== undefined && data.navigationLog !== null ? data.navigationLog.toString() : 'None' },
                { name: 'Pilot in Command', value: data.pic + " " + data["role"] || '(Not specified)' },
                { name: 'Co-Pilot', value: data.copilot + " " + data["co-role"] || 'None' },
                { name: 'Radio Frequencies', value: data.radioFrequencies || '(Not specified)' },
                { name: 'Additional Notes', value: data.additionalNotes || '(Not specified)' }
            ],
            
            timestamp: new Date().toISOString()
        }]
    };
 
    try{
        const body = JSON.stringify(embedBody);
        const webhookURL =process.env.DISCORD_WEBHOOK_URL;
        const response = await fetch(webhookURL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body:body
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Error:', errorText);
            throw new Error(`HTTP error! status: ${response.status}`);
            }
            return res.send("Flight plan submitted successfully!")
            
            } catch(error){
              console.log(error)
              res.status(500).send("Error submitting flight plan: " + error.message)
              }
        
  
  
  })
  app.get("/builder", (req, res) => {
    res.render('builder', {
      title: 'Builder',
      message: 'GrapesJS Builder'
    });
  });
  

//application endpoints
  app.post("/api/applications/submit", async (req, res) => {
    const data = req.body;
    console.log('Received application data:', data);
    // check if application is for ATC or Enforcer and validate required fields make a new application object based on the schema
    if (data.type === 'atc') {
      if (!data.callsign) {
        return res.status(400).json({ error: 'Callsign is required for ATC applications' });
      }
    } else if (data.type === 'enforcer') {
      if (!data.discord) {
        return res.status(400).json({ error: 'Discord handle is required for Enforcer applications' });
      }
    } else if(data.discordId === undefined || data.discordId === null){
      return res.status(400).json({ error: 'Discord ID is required for all applications' });
    }
    
    else {
      return res.status(400).json({ error: 'Invalid application type' });
    }

    

    try {
      
      const application = await Application.create({
        name: data.Username,
        type: data.type,
        callsign: data.callsign,
        discordHandle: data.discord,
        discordId: data.discordId,
        experience: data.experience,
        whyJoin: data.whyJoin
      });

      sendDM(application.discordId, `Hello ${application.name}, thank you for submitting your application for the ${application.type} position. We have received your application and will review it shortly. You will receive a DM with the outcome of your application once it has been processed. We appreciate your interest in joining our team!`)
        .catch(error => {
          console.error('Error sending application receipt DM:', error);
        });

      const embedBody = {
        content: '<@&1462572777092546743> <@&1474154308873486528> New ATC Application Submitted',
        embeds: [{
          title: `New Application for ${application.type} position`,
          description: `An application has been submitted by ${application.name} for the ${application.type} position. Please review the application in the [admin panel](https://atc-vtolvr.site/applications/admin).`,
          color: 0x00FF00,
        }],
        timestamp: new Date().toISOString()
      };

      postDiscordWebhook(process.env.DISCORD_WEBHOOK_URL_ADMIN, embedBody, 'Failed to send application notification')
        .catch(error => {
          console.error('Error sending webhook notification:', error);
        });

      res.json({ message: 'Application submitted successfully' });
    } catch (error) {
      console.error('Error submitting application:', error);
      res.status(500).json({ error: 'Failed to submit application' });
    }
  });


app.get("/applications/admin", authHandler.AdminOnly("Admin"), (req, res) => {
  res.render('admin/application-admin', {
    title: 'Admin Applications',
    message: 'Review and manage applications here'
  });
}
);
app.get("/applications",authHandler.restrict, (req, res) => {
  res.render('applications', {
    title: 'Application',
    message: 'Apply to become an ATC or Enforcer',
    user: req.session.user
  });
});
  app.get("/api/applications", async (req, res) => {
    try {
      const applications = await Application.find();
      res.json({ data: applications });
    } catch (error) {
      console.error('Error fetching applications:', error);
      res.status(500).json({ error: 'Failed to fetch applications' });
    }
  });

  //endpoints for approving/rejecting applications
  app.post("/api/applications/:id/approve", async (req, res) => {
    const applicationId = req.params.id;
    try {
      const application = await Application.findById(applicationId);
      if (!application) {
        return res.status(404).json({ error: 'Application not found' });
      }
      application.status = 'approved';
      await application.save();
      sendDM(application.discordId, `Congratulations ${application.name}! Your application for the ${application.type} position has been approved. We will be in touch with you soon regarding the next steps. Welcome to the team!`)
        .catch(error => {
          console.error('Error sending approval DM:', error);
        });

      const embedBody = {
        content: `<@&1462572777092546743> <@&1474154308873486528> Application Approved`,
        embeds: [{
            title: `Application Approved for ${application.type} position`,
            description: `The application submitted by ${application.name} for the ${application.type} position has been approved. Please reach out to the applicant to coordinate next steps.`,
            color: 0x0000FF,
        }],
        timestamp: new Date().toISOString()
      };

      postDiscordWebhook(process.env.DISCORD_WEBHOOK_URL_ADMIN, embedBody, 'Failed to send approval notification')
        .catch(error => {
          console.error('Error sending webhook notification:', error);
        });

      res.json({ message: 'Application approved successfully' });
    } catch (error) {
      console.error('Error approving application:', error);
      res.status(500).json({ error: 'Failed to approve application' });
    }
  });
  app.post("/api/applications/:id/reject", async (req, res) => {
    const applicationId = req.params.id;
    try {
      const application = await Application.findById(applicationId);
      if (!application) {
        return res.status(404).json({ error: 'Application not found' });
      }
      application.status = 'rejected';
      await application.save();
      sendDM(application.discordId, `Hello ${application.name}, we regret to inform you that your application for the ${application.type} position has been rejected. Thank you for your interest and we encourage you to apply again in the future.`)
        .catch(error => {
          console.error('Error sending rejection DM:', error);
        });

      const embedBody = {
        content: `<@&1462572777092546743> <@&1474154308873486528> Application Rejected`,
        embeds: [{
            title: `Application Rejected for ${application.type} position`,
            description: `The application submitted by ${application.name} for the ${application.type} position has been rejected. Please reach out to the applicant if you would like to provide feedback or encourage them to reapply in the future.`,
            color: 0xFF0000,
        }],
        timestamp: new Date().toISOString()
      };

      postDiscordWebhook(process.env.DISCORD_WEBHOOK_URL_ADMIN, embedBody, 'Failed to send rejection notification')
        .catch(error => {
          console.error('Error sending webhook notification:', error);
        });

      res.json({ message: 'Application rejected successfully' });
    } catch (error) {
      console.error('Error rejecting application:', error);
      res.status(500).json({ error: 'Failed to reject application' });
    }
  });

// Intentionally return 404 for scanner probe routes hitting /test and /test/*.
app.get("/test", async (req, res) => {
  return res.status(404).send('Not found');
});
app.get("/test/*splat", async (req, res) => {
  return res.status(404).send('Not found');
});
//events endpoints 

app.get("/events", (req, res) => {
  res.render('atc/events', {
    title: 'Events',
    message: 'View upcoming and past events here'
  });
});
app.get("/api/events", (req, res) => {

  Events.find().then(events => {
    res.json({ data: events });
  }).catch(error => {
    console.error('Error fetching events:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  });
});

const EVENT_DELETE_DELAY_MS = 60 * 60 * 1000;

// a interval checks every minute for events that have a start time in the past and an end time in the future and updates their status to active, and if the end time is in the past it updates their status to completed
setInterval(() => {

  //ajust event statuses based on current time and time zones
  Events.find().then(events => {
    const now = new Date();
    events.forEach(event => {
      const eventStart = new Date(event.startTime);
      const eventEnd = new Date(event.endTime);
      if (eventStart <= now && eventEnd >= now) {
        if (event.status !== 'active') {
          event.status = 'active';

          //open a thread in the events channel for this event and post the event details in the thread while mentioning the attendees
            bot.channels.fetch("1462570082793160867").then(channel => {
              channel.threads.create({
                name: `Event: ${event.name}`,
                autoArchiveDuration: 60,
                reason: `Thread for event ${event.name}`
              }).then(thread => {
                const embed = new EmbedBuilder()

                  .setTitle(event.name)
                  .setDescription(event.description || 'No description provided')
                  .addFields(
                    { name: 'Airport', value: event.airport, inline: true },
                    { name: 'Start Time', value: `<t:${Math.floor(new Date(event.startTime).getTime() / 1000)}:f>`, inline: true },
                    { name: 'Duration', value: event.duration, inline: true },
                    { name: 'Map', value: event.map || 'No map provided', inline: false },
                    { name: 'Host', value: event.hostName || 'No host provided', inline: true },
                    { name: 'Attendees', value: event.attendees.map(a => a.username).join("\n") || "No attendees yet", inline: false }
                  )
                  .setFooter({ text: "VTOL VR ATC Bot" })
                  .setColor("#87cefa")
                  .setTimestamp();

                  var ping = ""
                  for (const attendee of event.attendees) {
                    ping += `<@${attendee.id}> `
                  }
                  if (ping === "") {
                    ping = "No attendees yet"
                  }
                  thread.send({ content: `Event is now active! ${ping}`, embeds: [embed] });
                  event.save();
                
              }).catch(err => {
                console.error('Error creating thread:', err);
              });
            });
          
        }
      } else if (eventEnd < now) {
        if (event.status !== 'completed') {
          event.status = 'completed';
          event.save();
        }

        if (now.getTime() - eventEnd.getTime() >= EVENT_DELETE_DELAY_MS) {
          Events.findByIdAndDelete(event._id).then(() => {
            console.log('Deleted completed event after 1 hour:', event.name);
          }).catch(err => {
            console.error('Error deleting event:', err);
          });
        }
      } else if (eventStart > now) {
        if (event.status !== 'upcoming') {
          event.status = 'upcoming';
          event.save();
        }
      }
    });
  }).catch(error => {
    console.error('Error updating event statuses:', error);
  });

}, 10000);


// event creation endpoint for atcs
app.post("/api/events/create", authHandler.ATCOnly, (req, res) => {
  const data = req.body;

  // create local dates for the server to reference when updating event statuses based on time zones
  const startTime = new Date(data.startTime);
  const endTime = new Date(data.endTime);
  
 
  
  Events.create({
    name: data.name,
    airport: data.airport,
    timezone: data.timezone,
    pilots: data.pilots,
    duration: data.duration,
    startTime: startTime,
    endTime: endTime,
    description: data.description,
    map: data.map,
    hostName: data.hostName

  }).then(event => {

    if (data.alertServer != null && data.alertServer != undefined && data.alertServer === true) {
      //check if event contains the word "atc"
      if (event.name.toLowerCase().includes("atc")) {
          var ping = "<@&1475600280308416523>"}
          else if (event.name.toLowerCase().includes("formation")){
             var ping = "<@&1475600053262356551>"
          }
          else {
            var ping = "no ping"
          }

          //convert time in to discord timestamp format

          

        //send a message to the events channel with the event details and a ping for the appropriate role based on the event name containing certain keywords like "atc" or "formation"
        // also add buttons to the message for users to sign up for the event as attendees, and when they click the button it adds them to the attendees list in the database and updates the message with the new list of attendees and pings them in the thread
        const embed = new EmbedBuilder()
          .setTitle(event.name)
          .setDescription(event.description || 'No description provided')
          .addFields(
            { name: 'Airport', value: event.airport, inline: false },
            { name: 'Start Time', value: `<t:${Math.floor(new Date(event.startTime).getTime() / 1000)}:f> | <t:${Math.floor(new Date(event.endTime).getTime() / 1000)}:t>`, inline: true },
            {name: ":countdown:", value: `<t:${Math.floor(new Date(event.startTime).getTime() / 1000)}:R>`, inline: true},
            
            { name: 'Map', value: event.map || 'No map provided', inline: false },
            { name: 'Host', value: event.hostName || 'No host provided', inline: true },
            { name: 'Attendees', value: event.attendees.map(a => a.username).join("\n") || "No attendees yet", inline: false }
          )
          .setFooter({ text: "ARN Control Bot" })
          .setColor("#87cefa")

          .setTimestamp();
          //add buttons for users to sign up for the event as attendees, and when they click the button it adds them to the attendees list in the database and updates the message with the new list of attendees and pings them in the thread
          const row = new ActionRowBuilder()
            .addComponents(
              new discord.ButtonBuilder()
                .setCustomId(`join_${event._id}`)
                .setLabel('Join Event')
                .setStyle(ButtonStyle.Success),
              new discord.ButtonBuilder()
                .setCustomId(`leave_${event._id}`)
                .setLabel('Leave Event')
                .setStyle(ButtonStyle.Danger)
            );
          bot.channels.fetch("1462570082793160867").then(channel => {
            channel.send({ content: `New event created! ${ping}`, embeds: [embed], components: [row] }).then(message => {
              event.messageId = message.id;
              event.save();
            }).catch(err => {
              console.error('Error sending event message:', err);
            });
          });
    }
    res.json({ message: 'Event created successfully' });
  }).catch(error => {
    console.error('Error creating event:', error);
    res.status(500).json({ error: 'Failed to create event' });
  });
    
});
var metarSubmissions = {}

app.post("/api/metar/submit", authHandler.ATCOnly, (req, res) => {
  const data = req.body;
  console.log('Received METAR data:', data);
  //store the metar submission in an array with the session id and the metar data
  metarSubmissions[data.sessionId] = data;
  res.json({ message: 'METAR submitted successfully' });
});

app.get("/api/metar/:sessionId", (req, res) => {
  const sessionId = req.params.sessionId;
  console.log('Received request for METAR data for session:', sessionId);
  const metarData = metarSubmissions[sessionId];
  console.log('METAR data for session:', metarData);
  if (metarData) {
    res.json({ data: metarData });
  } else {
    res.status(404).json({ error: 'METAR data not found for this session' });
  }
});
app.get("/atc/metar", authHandler.ATCOnly, (req, res) => {
  res.render('atc/METAR', {
    title: 'METAR Submission',
    message: 'Submit METAR data for your current session'
  });
});
app.post("/api/metar/clear", (req, res) => {
  const { sessionId } = req.body;
  if (sessionId && metarSubmissions[sessionId]) {
    delete metarSubmissions[sessionId];
    res.json({ message: 'METAR data cleared successfully' });
  } else {
    res.status(404).json({ error: 'METAR data not found for this session' });
  }
});

app.get("/profile", authHandler.restrict, (req, res) => {
  
  res.render('profile', {
    title: 'Profile',
    message: 'View and edit your profile information here',
    user: req.session.user
  });
}
);

//admin routes

app.get("/admin", authHandler.AdminOnly("mod"), (req, res) => {
  res.render('admin/panel-admin', {
    title: 'Admin Dashboard',
    message: 'Welcome to the admin dashboard'
  });});

app.get("/api/admin/users", authHandler.AdminOnly("mod"), async (req, res) => {
  try {
    const users = await Users.find();
   
    res.json({ data: users });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
  
});

app.get("/api/users/discord",authHandler.AdminOnly("mod"), async (req, res) => {

  //grabs all the users from the discord server and returns their username, discriminator, id, and avatar url
  try {
    if (!bot.isReady()) {
      return res.status(503).json({ error: 'Discord bot is not ready yet' });
    }

    const guildId = process.env.DISCORD_GUILD_ID || "1462567359792283691";
    const guild = await bot.guilds.fetch(guildId);

    const members = await guild.members.fetch();
    const users = members.map(member => {
      return {
        username: member.user.username,
        discriminator: member.user.discriminator,
        id: member.user.id,
        avatar: member.user.avatarURL(),
        roles: member.roles.cache.map(role => role.name)

      };
    });
    res.json({ data: users });
  } catch (error) {
    console.error('Error fetching users from Discord:', error);
    res.status(500).json({ error: 'Failed to fetch users from Discord' });
  }

});


app.get("/admin/discord", authHandler.AdminOnly("mod"), (req, res) => {
  res.render('admin/discordUsers', {
    title: 'Discord Users',
    message: 'View all users in the Discord server here',
    user: req.session.user
  });
});



app.get("/api/users", async (req, res) => {
  try {
    const users = await Users.find();
    var userList = []
    for (let user of users) {
      userList.push({
        id: user._id,
        Username: user.Username,
        Flighthours: user.Flighthours,
        Role: user.Role,
        Callsign: user.Callsign,
        avatar: user.avatar

       
      });
    }
    res.json({ data: userList });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
  
});


app.get("/pilots", (req, res) => {
  res.render('pilots', {
    title: 'Pilots',
    message: 'View all registered pilots here',
    user: req.session.user
  });
})

//!SECTION Endpoint for updating a user's role
app.post("/api/admin/users/:id/updateRole", authHandler.AdminOnly("admin"), async (req, res) => {
  const userId = req.params.id;
  const { role } = req.body;
  if (!['admin', 'atc', 'enforcer', 'user', 'mod', "owner"].includes(role)) {
    return res.status(400).json({ error: 'Invalid role specified' });
  }
  try {
    const user = await Users.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (user.Role.includes(role)) {
      return res.status(400).json({ error: 'User already has this role' });
    }
    user.Role.push(role);
    await user.save();
    bot.guilds.fetch("1462567359792283691").then(guild => {
      guild.channels.fetch("1462571415361294387").then(channel => {

        var embed = new EmbedBuilder()

          .setTitle("Role Updated")
          .setDescription(`User ${user.Username}\nNew role: ${role}\nUpdated by: ${req.session.user.username}`)
          .setColor("#87cefa")
          .setTimestamp();
        channel.send({ embeds: [embed] });
      });
    });
    res.json({ message: 'User role updated successfully' });
  } catch (error) {
    console.error('Error updating user role:', error);
    res.status(500).json({ error: 'Failed to update user role' });
  }
});
app.post("/api/admin/users/:id/updateCallsign", authHandler.AdminOnly("admin"), async (req, res) => {
  const userId = req.params.id;
  const { callsign } = req.body;
  if (typeof callsign !== 'string' || callsign.trim() === '') {
    return res.status(400).json({ error: 'Invalid callsign specified' });
  }
  try {
    const user = await Users.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    user.Callsign = callsign.trim().toUpperCase();
    await user.save();
    bot.guilds.fetch("1462567359792283691").then(guild => {
      guild.channels.fetch("1462571415361294387").then(channel => {

        var embed = new EmbedBuilder()

          .setTitle("Callsign Updated")
          .setDescription(`User ${user.Username}\nNew Callsign: ${user.Callsign}\nUpdated by: ${req.session.user.username}`)
          .setColor("#87cefa")
          .setTimestamp();
        channel.send({ embeds: [embed] });
      });
    });
    res.json({ message: 'User callsign updated successfully' });
  } catch (error) {
    console.error('Error updating user callsign:', error);
    res.status(500).json({ error: 'Failed to update user callsign' });
  }
});


//!SECTION Endpoint for removing a role from a user
app.post("/api/admin/users/:id/removeRole", authHandler.AdminOnly("admin"), async (req, res) => {
  const userId = req.params.id;
  const { role } = req.body;
  if (!['admin', 'atc', 'enforcer', 'user', 'mod', "owner"].includes(role)) {
    return res.status(400).json({ error: 'Invalid role specified' });
  }
  try {
    const user = await Users.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (!user.Role.includes(role)) {
      return res.status(400).json({ error: 'User does not have this role' });
    }
    user.Role = user.Role.filter(r => r !== role);
    await user.save();
    bot.guilds.fetch("1462567359792283691").then(guild => {
      guild.channels.fetch("1462571415361294387").then(channel => {

        var embed = new EmbedBuilder()

          .setTitle("Role Removed")
          .setDescription(`User ${user.Username}\nRemoved Role: ${role}\nUpdated by: ${req.session.user.username}`)
          .setColor("#87cefa")
          .setTimestamp();
        channel.send({ embeds: [embed] });
      });
    });
    res.json({ message: 'User role removed successfully' });
  } catch (error) {
    console.error('Error removing user role:', error);
    res.status(500).json({ error: 'Failed to remove user role' });
  }
});


app.post("/api/admin/users/:id/updateFlighthours", authHandler.AdminOnly("mod"), async (req, res) => {
  const userId = req.params.id;
  const { flighthours } = req.body;
  if (isNaN(flighthours) || flighthours < 0) {
    return res.status(400).json({ error: 'Invalid flighthours specified' });
  }
  try {
    const user = await Users.findById(userId);
    if (!user) { return res.status(404).json({ error: 'User not found' }); }

    user.Flighthours = flighthours;
    await user.save();
    bot.guilds.fetch("1462567359792283691").then(guild => {
      guild.channels.fetch("1462571415361294387").then(channel => {

        var embed = new EmbedBuilder()

          .setTitle("Flighthours Updated")
          .setDescription(`User ${user.Username}\nNew Flighthours: ${user.Flighthours}\nUpdated by: ${req.session.user.username}`)
          .setColor("#87cefa")
          .setTimestamp();
        channel.send({ embeds: [embed] });
      });
    });
    res.json({ message: 'User flighthours updated successfully' });
  } catch (error) {
    console.error('Error updating user flighthours:', error);
    res.status(500).json({ error: 'Failed to update user flighthours' });
  }
});
  

//auth endpoints
app.post("/api/auth/register", async (req, res) => {
  const { username, password, email, role } = req.body;
  try{
  const result = await authHandler.register(username, password, email, role);
  if (typeof result === 'string') {
    res.status(400).json({ error: result });
  } else {
    res.json({ message: 'User registered successfully', user: result });  
  }
}catch(err){
  console.error('Error registering user:', err);
  res.status(500).json({ error: 'Failed to register user' });
}
});



app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body;

  try{
 await authHandler.authenticate(username, password, function(err, user){
  
    if (err) {
      console.error('Error during login:', err);
      return res.status(500).json({ error: 'Failed to login' });
    }
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    // Set user session
    req.session.user = {
      id: user._id,
      username: user.Username,
      role: user.Role,
      flighthours: user.Flighthours,
      Callsign: user.Callsign,
      code: user.code,
      avatar: user.avatar,
      DiscordID: user.DiscordID
    };
    console.log('User logged in:', req.session.user);
    res.json({ message: 'Login successful', user: req.session.user });
  })
}catch(err){
  console.error('Error during login:', err);
  res.status(500).json({ error: 'Failed to login' });
}
 
});

app.get("/login/:redirect", (req, res) => {

  if (req.params.redirect ==="home") {
    var redirectUrl = "/"
  }
  else{
    var redirectUrl = `/${req.params.redirect}`;
  }
  res.render('auth/login', {
    title: 'Login',
    message: 'Login to your account',
    redirect: redirectUrl
   });
});

app.get("/logout", (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Error during logout:', err);
      return res.status(500).json({ error: 'Failed to logout' });
    }
    res.redirect('/');

  });});

  app.get("/register", (req, res) => {
    res.render('auth/register', {
      title: 'Register',
      message: 'Create a new account'
     });
   });

  app.get('/forgot-password', (req, res) => {
    res.render('auth/forgotPass', {
      title: 'Forgot Password',
      message: 'Reset your account password'
    });
  });

  app.post('/api/auth/forgot-password/request-code', async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    if (!email) {
      return res.status(400).json({ error: 'Email is required.' });
    }

    if (!mailTransporter) {
      console.error('SendGrid is not configured. Missing SENDGRID_API_KEY.');
      return res.status(500).json({ error: 'Email service is not configured on the server.' });
    }

    try {
      const user = await Users.findOne({ Email: email });
      if (user) {
        const code = generateResetCode();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

        passwordResetRequests.set(email, {
          code,
          userId: user._id.toString(),
          expiresAt,
          verified: false,
          attempts: 0
        });

        await sendPasswordResetEmail(email, code);
      }

      return res.json({ message: 'If an account exists, a verification code has been sent.' });
    } catch (error) {
      console.error('Error generating password reset code:', error);
      return res.status(500).json({ error: 'Failed to process password reset request.' });
    }
  });

  app.post('/api/auth/forgot-password/verify-code', async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const code = String(req.body?.code || '').trim();

    if (!email || !code) {
      return res.status(400).json({ error: 'Email and code are required.' });
    }

    const entry = passwordResetRequests.get(email);
    if (!entry) {
      return res.status(400).json({ error: 'No reset request found for that email.' });
    }

    if (entry.expiresAt.getTime() < Date.now()) {
      passwordResetRequests.delete(email);
      return res.status(400).json({ error: 'Verification code expired. Request a new code.' });
    }

    if (entry.attempts >= 5) {
      passwordResetRequests.delete(email);
      return res.status(429).json({ error: 'Too many attempts. Request a new code.' });
    }

    if (entry.code !== code) {
      entry.attempts += 1;
      passwordResetRequests.set(email, entry);
      return res.status(400).json({ error: 'Invalid verification code.' });
    }

    entry.verified = true;
    entry.attempts = 0;
    passwordResetRequests.set(email, entry);
    return res.json({ message: 'Code verified successfully.' });
  });

  app.post('/api/auth/forgot-password/reset', async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const code = String(req.body?.code || '').trim();
    const newPassword = String(req.body?.newPassword || '');

    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: 'Email, code, and new password are required.' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    }

    const entry = passwordResetRequests.get(email);
    if (!entry) {
      return res.status(400).json({ error: 'No reset request found. Request a new code.' });
    }

    if (entry.expiresAt.getTime() < Date.now()) {
      passwordResetRequests.delete(email);
      return res.status(400).json({ error: 'Verification code expired. Request a new code.' });
    }

    if (!entry.verified || entry.code !== code) {
      return res.status(400).json({ error: 'Please verify your code before resetting the password.' });
    }

    try {
      const user = await Users.findById(entry.userId);
      if (!user) {
        passwordResetRequests.delete(email);
        return res.status(404).json({ error: 'User account not found.' });
      }

      const hashedPassword = await authHandler.hashPassword(newPassword);
      user.Hash = hashedPassword.hash;
      user.Salt = hashedPassword.salt;
      await user.save();

      passwordResetRequests.delete(email);
      return res.json({ message: 'Password reset successful.' });
    } catch (error) {
      console.error('Error resetting password:', error);
      return res.status(500).json({ error: 'Failed to reset password.' });
    }
  });




// !SECTION Endpoint for user profile updates
app.post("/api/profile/update", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const userId = req.session.user.id;
  const { email,callsign} = req.body;
  try {
    const user = await Users.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (email) {
      user.Email = email;
    }
   
    if (callsign) {
      user.Callsign = callsign.trim().toUpperCase();
    }
    await user.save();
    res.json({ message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

app.get("/chart-maker", (req, res) => {
  res.render('admin/chartMaker', {
    title: 'Chart Maker',
    message: 'Create custom charts for ATC Maps'
  });
});



// Start the server
app.listen(PORT, async () => {
 
 bot.login(process.env.Discord_TOKEN).then(() => {
  console.log('Discord bot logged in successfully');
}).catch(err => {
  console.error('Error logging in Discord bot:', err);
});

  console.log(`Server is running on http://localhost:${PORT}`);
});

/*Users.find().then(users => {
 
  users.forEach(user => { 
    if (user.DiscordID){

      bot.guilds.fetch("1462567359792283691").then(guild => {
        guild.members.fetch(user.DiscordID).then(member => {
          if (member) {   
            user.avatar = member.user.avatarURL();
            user.save().then(() => {
              console.log(`Updated avatar for user ${user.Username}`);
            }
            ).catch(err => {
              console.error(`Error saving user ${user.Username}:`, err);
            }
            );
          } else {
            console.warn(`User ${user.Username} with Discord ID ${user.DiscordID} not found in guild`);
          }
        }).catch(err => {
          console.error(`Error fetching member for user ${user.Username}:`, err);
        }
        );
      }
      ).catch(err => {
        console.error(`Error fetching guild for user ${user.Username}:`, err);
        


    }
  )
}

  });
})*/
