const express = require('express');
const rateLimit = require('express-rate-limit');
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production';

const Application = require('./schemas/application');
const Users = require('./schemas/users');
const Events = require('./schemas/events');
const authHandler = require('./functions/AuthHandler');
const discord = require('discord.js');
const { GatewayIntentBits, EmbedBuilder, Collection, ActionRowBuilder, ButtonStyle } = require('discord.js');

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
if (isProduction) {
  app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS) || 1);
}
const PORT = process.env.PORT || 3000;
const passwordResetRequests = new Map();

const IFR_FLIGHT_PLAN_CHANNEL_ID = '1471159799227088978';

function ifrText(v) {
  if (v === undefined || v === null) return '—';
  const s = String(v).trim();
  if (!s || s === 'undefined' || s === 'null') return '—';
  return s;
}

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

const LOGOUT_RETURN_QUERY_SAFE = /^[\w&=.%-]+$/;

function postLogoutRedirect(req) {
  const fromQuery = req.query.return;
  let pathname = null;
  let search = '';
  if (typeof fromQuery === 'string' && fromQuery.startsWith('/') && !fromQuery.startsWith('//')) {
    const qMark = fromQuery.indexOf('?');
    if (qMark === -1) {
      pathname = fromQuery.split('#')[0];
    } else {
      pathname = fromQuery.slice(0, qMark).split('#')[0];
      const rawSearch = fromQuery.slice(qMark).split('#')[0];
      if (rawSearch.length > 1 && LOGOUT_RETURN_QUERY_SAFE.test(rawSearch.slice(1))) {
        search = rawSearch;
      }
    }
  }
  if (!pathname) {
    const ref = req.get('referer');
    if (ref) {
      try {
        const u = new URL(ref);
        if (u.host === req.get('host')) {
          pathname = u.pathname || null;
          const s = u.search || '';
          if (s.length > 1 && LOGOUT_RETURN_QUERY_SAFE.test(s.slice(1))) {
            search = s;
          }
        }
      } catch (_) {}
    }
  }
  if (!pathname || pathname === '/logout') return '/';
  if (pathname.startsWith('/admin')) return '/';
  if (pathname === '/applications/admin' || pathname.startsWith('/applications/admin/')) return '/';
  if (pathname === '/atc/metar' || pathname.startsWith('/atc/metar/')) return '/';
  return pathname + search;
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

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use("/assets", express.static(path.join(__dirname, 'assets')));
app.use("/scripts", express.static(path.join(__dirname, 'scripts')));
app.use("/styles", express.static(path.join(__dirname, 'css')));
app.use(express.static(path.join(__dirname, 'public')));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const session = require('express-session');

if (isProduction && !process.env.SESSION_SECRET?.trim()) {
  console.error('FATAL: SESSION_SECRET must be set in production');
  process.exit(1);
}

const sessionSecret =
  process.env.SESSION_SECRET?.trim() || 'dev-only-session-secret-do-not-use-in-production';

app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProduction,
    httpOnly: true,
    maxAge: 1800000,
    sameSite: 'lax'
  }
}));

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.hasAtcPlusAccess = authHandler.hasAtcPlusRole(req.session.user);
  res.locals.isProduction = isProduction;
  const url = req.originalUrl.split('#')[0];
  res.locals.logoutReturn = req.path === '/logout' ? '/' : url;
  next();
});

function isLoopbackRemoteAddress(addr) {
  if (!addr || typeof addr !== 'string') return false;
  const normalized = addr.replace(/^::ffff:/i, '');
  return normalized === '127.0.0.1' || addr === '::1';
}

if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    if (req.query.test !== undefined && isLoopbackRemoteAddress(req.socket?.remoteAddress || '')) {
      const name = req.query.test || 'devuser';
      const mock = { id: 'dev', username: name, role: ['admin', 'owner', 'atc', 'enforcer'], flighthours: 999, Callsign: name.toUpperCase(), code: 'DEV', avatar: null, DiscordID: null };
      req.session.user = mock;
      res.locals.user = mock;
      res.locals.hasAtcPlusAccess = authHandler.hasAtcPlusRole(mock);
    }
    next();
  });
}

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

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 500 : 3000,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: isProduction },
  skip: (req) => req.method === 'OPTIONS',
  handler: (req, res) => {
    res.status(429).json({ error: 'Too many requests. Try again later.' });
  }
});

const rateLimitTrust = { trustProxy: isProduction };

const passwordResetIpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.PASSWORD_RESET_IP_MAX || 25),
  standardHeaders: true,
  legacyHeaders: false,
  validate: rateLimitTrust,
  skip: (req) => req.method === 'OPTIONS',
  keyGenerator: (req) => `pwreset:ip:${req.ip}`,
  handler: (req, res) => {
    res.status(429).json({ error: 'Too many password reset attempts from this network. Try again later.' });
  }
});

function passwordResetIpLimitIfEnabled(req, res, next) {
  if (process.env.PASSWORD_RESET_IP_LIMIT === 'true') {
    return passwordResetIpLimiter(req, res, next);
  }
  return next();
}

const passwordResetRequestPerEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.PASSWORD_RESET_EMAIL_REQUEST_MAX || 4),
  standardHeaders: true,
  legacyHeaders: false,
  validate: rateLimitTrust,
  skip: (req) => req.method === 'OPTIONS',
  keyGenerator: (req) => {
    const e = normalizeEmail(req.body?.email);
    return e ? `pwreset:email:req:${e}` : `pwreset:email:req:empty:${req.ip}`;
  },
  handler: (req, res) => {
    res.status(429).json({ error: 'Too many reset code requests for this email. Try again later.' });
  }
});

const passwordResetVerifyPerEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.PASSWORD_RESET_EMAIL_VERIFY_MAX || 40),
  standardHeaders: true,
  legacyHeaders: false,
  validate: rateLimitTrust,
  skip: (req) => req.method === 'OPTIONS',
  keyGenerator: (req) => {
    const e = normalizeEmail(req.body?.email);
    return e ? `pwreset:email:verify:${e}` : `pwreset:email:verify:empty:${req.ip}`;
  },
  handler: (req, res) => {
    res.status(429).json({ error: 'Too many verification attempts for this email. Try again later.' });
  }
});

const passwordResetCompletePerEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.PASSWORD_RESET_EMAIL_RESET_MAX || 8),
  standardHeaders: true,
  legacyHeaders: false,
  validate: rateLimitTrust,
  skip: (req) => req.method === 'OPTIONS',
  keyGenerator: (req) => {
    const e = normalizeEmail(req.body?.email);
    return e ? `pwreset:email:reset:${e}` : `pwreset:email:reset:empty:${req.ip}`;
  },
  handler: (req, res) => {
    res.status(429).json({ error: 'Too many password reset completions for this email. Try again later.' });
  }
});

const REGISTER_WINDOW_MS = 15 * 60 * 1000;
const REGISTER_GLOBAL_MAX = 5;

const registerGlobalLimiter = rateLimit({
  windowMs: REGISTER_WINDOW_MS,
  max: REGISTER_GLOBAL_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  validate: rateLimitTrust,
  skip: (req) => req.method === 'OPTIONS',
  keyGenerator: () => 'register:global',
  handler: (req, res) => {
    res.status(429).json({ error: 'Registration is temporarily limited. Try again later.' });
  }
});

const registerIpLimiter = rateLimit({
  windowMs: REGISTER_WINDOW_MS,
  max: Number(process.env.REGISTER_IP_MAX || 5),
  standardHeaders: true,
  legacyHeaders: false,
  validate: rateLimitTrust,
  skip: (req) => req.method === 'OPTIONS',
  keyGenerator: (req) => `register:ip:${req.ip}`,
  handler: (req, res) => {
    res.status(429).json({ error: 'Too many registration attempts from this network. Try again later.' });
  }
});

function applicationSubmitDiscordKey(req) {
  const raw = req.body?.discordId;
  const id = raw != null ? String(raw).trim() : '';
  if (/^\d{17,20}$/.test(id)) {
    return `appsubmit:discord:${id}`;
  }
  return `appsubmit:discord:invalid:${req.ip}`;
}

const applicationSubmitIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.APPLICATION_SUBMIT_IP_MAX || 10),
  standardHeaders: true,
  legacyHeaders: false,
  validate: rateLimitTrust,
  skip: (req) => req.method === 'OPTIONS',
  keyGenerator: (req) => `appsubmit:ip:${req.ip}`,
  handler: (req, res) => {
    res.status(429).json({ error: 'Too many application submissions from this network. Try again later.' });
  }
});

const applicationSubmitPerAccountLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: Number(process.env.APPLICATION_SUBMIT_DISCORD_MAX || 4),
  standardHeaders: true,
  legacyHeaders: false,
  validate: rateLimitTrust,
  skip: (req) => req.method === 'OPTIONS',
  keyGenerator: (req) => applicationSubmitDiscordKey(req),
  handler: (req, res) => {
    res.status(429).json({ error: 'Too many applications for this Discord account. Try again later.' });
  }
});

const LOGIN_IP_WINDOW_MS = Number(process.env.LOGIN_IP_WINDOW_MS || 15 * 60 * 1000);
const LOGIN_IP_MAX = Number(
  process.env.LOGIN_IP_MAX || (isProduction ? 60 : 500)
);

const loginIpLimiter = rateLimit({
  windowMs: LOGIN_IP_WINDOW_MS,
  max: LOGIN_IP_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  validate: rateLimitTrust,
  skip: (req) => req.method === 'OPTIONS',
  keyGenerator: (req) => `login:ip:${req.ip}`,
  handler: (req, res) => {
    res.status(429).json({ error: 'Too many sign-in attempts from this network. Try again later.' });
  }
});

const API_ROUTE_WINDOW_MS = 15 * 60 * 1000;
const API_ROUTE_MAX = Number(
  process.env.API_ROUTE_MAX || (isProduction ? 320 : 4000)
);

const apiPerRouteLimiter = rateLimit({
  windowMs: API_ROUTE_WINDOW_MS,
  max: API_ROUTE_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  validate: rateLimitTrust,
  skip: (req) => req.method === 'OPTIONS',
  keyGenerator: (req) => {
    const pathOnly = String(req.originalUrl || '').split('?')[0];
    return `api-route:${req.ip}:${req.method}:${pathOnly}`;
  },
  handler: (req, res) => {
    res.status(429).json({ error: 'Too many requests to this API. Try again later.' });
  }
});

const LOGIN_USERNAME_KEY_MAX = 128;
const LOGIN_FAIL_THRESHOLD = Math.max(1, Number(process.env.LOGIN_FAIL_THRESHOLD || 5));
const LOGIN_BACKOFF_BASE_MS = Number(process.env.LOGIN_BACKOFF_BASE_MS || 60 * 1000);
const LOGIN_BACKOFF_MAX_MS = Number(process.env.LOGIN_BACKOFF_MAX_MS || 15 * 60 * 1000);

const loginFailureByUsername = new Map();

function normalizeLoginUsernameKey(name) {
  const s = String(name ?? '').trim();
  if (!s) return '';
  return s.length > LOGIN_USERNAME_KEY_MAX ? s.slice(0, LOGIN_USERNAME_KEY_MAX) : s;
}

function loginUsernameBackoffGuard(req, res, next) {
  const key = normalizeLoginUsernameKey(req.body?.username);
  if (!key) return next();
  const entry = loginFailureByUsername.get(key);
  if (!entry || !entry.lockedUntil) return next();
  const now = Date.now();
  if (now >= entry.lockedUntil) {
    entry.lockedUntil = 0;
    return next();
  }
  const retrySec = Math.ceil((entry.lockedUntil - now) / 1000);
  res.set('Retry-After', String(retrySec));
  return res.status(429).json({
    error: 'Too many failed sign-in attempts for this username. Try again later.',
    retryAfterSeconds: retrySec
  });
}

function recordLoginFailureForUsername(name) {
  const key = normalizeLoginUsernameKey(name);
  if (!key) return;
  let entry = loginFailureByUsername.get(key);
  if (!entry) {
    entry = { failures: 0, lockedUntil: 0 };
  }
  entry.failures += 1;
  if (entry.failures >= LOGIN_FAIL_THRESHOLD) {
    const exp = entry.failures - LOGIN_FAIL_THRESHOLD;
    const duration = Math.min(LOGIN_BACKOFF_MAX_MS, LOGIN_BACKOFF_BASE_MS * 2 ** exp);
    entry.lockedUntil = Date.now() + duration;
  }
  loginFailureByUsername.set(key, entry);
}

function clearLoginFailureForUsername(name) {
  const key = normalizeLoginUsernameKey(name);
  if (!key) return;
  loginFailureByUsername.delete(key);
}

app.use(globalLimiter);
app.use('/api', apiPerRouteLimiter);

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



app.post('/api/ifr/submit', authHandler.restrictApi, async function (req, res) {
  let data = req.body;
  if (data.data != null && data.data !== undefined) {
    data = data.data;
  }

  const nav = data.navigationLog;
  const hasNav =
    nav !== undefined &&
    nav !== null &&
    String(nav).trim() !== '' &&
    String(nav).trim().toLowerCase() !== 'none';
  const mode = hasNav ? 'IFR' : 'VFR';
  const callsign = ifrText(data.flightName);
  const squawk = ifrText(data.squawkCode);

  const embed = new EmbedBuilder()
    .setColor(0xffb800)
    .setTitle(`${callsign} · ${mode}`)
    .setDescription(
      `**ID:** ${squawk}\n` +
        `**Session:** ${ifrText(data.sessionID)} · ${ifrText(data.sessionMap)}\n` +
        `**Aircraft:** ${ifrText(data.aircraftType)} · **Alt:** ${ifrText(data.altitude)}\n` +
        `**Route:** ${ifrText(data.departure)} → ${ifrText(data.destination)}`
    )
    .setTimestamp();

  try {
    if (!bot.isReady()) {
      return res.status(503).send('Discord bot is not ready. Try again in a moment.');
    }
    const channel = await bot.channels.fetch(IFR_FLIGHT_PLAN_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) {
      console.error('IFR submit: channel missing or not text-based', IFR_FLIGHT_PLAN_CHANNEL_ID);
      return res.status(500).send('Flight plan channel is not available.');
    }
    await channel.send({ embeds: [embed] });
    return res.send('Flight plan submitted successfully!');
  } catch (error) {
    console.error('IFR submit Discord error:', error);
    res.status(500).send('Error submitting flight plan: ' + error.message);
  }
});
  app.get("/builder", (req, res) => {
    res.render('builder', {
      title: 'Builder',
      message: 'GrapesJS Builder'
    });
  });
  

  app.post(
    "/api/applications/submit",
    applicationSubmitIpLimiter,
    applicationSubmitPerAccountLimiter,
    async (req, res) => {
    const data = req.body;
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
  }
  );


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
  app.get("/api/applications", authHandler.AdminOnly("Admin"), async (req, res) => {
    try {
      const applications = await Application.find();
      res.json({ data: applications });
    } catch (error) {
      console.error('Error fetching applications:', error);
      res.status(500).json({ error: 'Failed to fetch applications' });
    }
  });

  app.post("/api/applications/:id/approve", authHandler.AdminOnly("Admin"), async (req, res) => {
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
  app.post("/api/applications/:id/reject", authHandler.AdminOnly("Admin"), async (req, res) => {
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

app.get("/test", async (req, res) => {
  return res.status(404).send('Not found');
});
app.get("/test/*splat", async (req, res) => {
  return res.status(404).send('Not found');
});

app.get("/events", (req, res) => {
  res.render(
    "atc/events",
    {
      title: "Events",
      message: "View upcoming and past events here",
    },
    (err, html) => {
      if (err) {
        return res.status(500).send(String(err));
      }
      const inj =
        '<script src="/form-url-draft.js"></script>\n<script src="/events-form-draft.js"></script>\n';
      res.send(String(html).replace("</body>", `${inj}</body>`));
    }
  );
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

setInterval(() => {

  Events.find().then(events => {
    const now = new Date();
    events.forEach(event => {
      const eventStart = new Date(event.startTime);
      const eventEnd = new Date(event.endTime);
      if (eventStart <= now && eventEnd >= now) {
        if (event.status !== 'active') {
          event.status = 'active';

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

app.post("/api/events/create", authHandler.AtcPlusApiOnly, (req, res) => {
  const data = req.body;

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
      if (event.name.toLowerCase().includes("atc")) {
          var ping = "<@&1475600280308416523>"}
          else if (event.name.toLowerCase().includes("formation")){
             var ping = "<@&1475600053262356551>"
          }
          else {
            var ping = "no ping"
          }

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

app.post("/api/metar/submit", authHandler.MetarStaffApiOnly, (req, res) => {
  const data = req.body;
  metarSubmissions[data.sessionId] = data;
  res.json({ message: 'METAR submitted successfully' });
});

app.get("/api/metar/:sessionId", authHandler.MetarStaffApiOnly, (req, res) => {
  const sessionId = req.params.sessionId;
  const metarData = metarSubmissions[sessionId];
  if (metarData) {
    res.json({ data: metarData });
  } else {
    res.status(404).json({ error: 'METAR data not found for this session' });
  }
});
app.get("/atc/metar", authHandler.MetarStaffOnly, (req, res) => {
  res.render('atc/METAR', {
    title: 'METAR Submission',
    message: 'Submit METAR data for your current session'
  });
});
app.post("/api/metar/clear", authHandler.MetarStaffApiOnly, (req, res) => {
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

const ADMIN_PANEL_AUTOSAVE_INJECT = `
<style>
.admin-undo-toast {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 3000;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: #2a2a2a;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
  font-size: 0.85rem;
  color: #c8c8c8;
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
}
.admin-undo-toast[hidden] { display: none !important; }
.admin-undo-toast__btn {
  margin: 0;
  padding: 5px 12px;
  font-size: 0.78rem;
  font-weight: 600;
  border-radius: 5px;
  border: 1px solid rgba(255,255,255,0.18);
  background: rgba(255,255,255,0.07);
  color: #e8e8e8;
  cursor: pointer;
}
.admin-undo-toast__btn:hover { background: rgba(255,255,255,0.12); }
</style>
<div id="adminUndoToast" class="admin-undo-toast" role="status" aria-live="polite" hidden>
  <span class="admin-undo-toast__text">Saved changes.</span>
  <button type="button" class="admin-undo-toast__btn" id="adminUndoBtn">Undo</button>
</div>
<script src="/admin-panel-member-autosave.js"></script>
`;

app.get("/admin", authHandler.AdminOnly("mod"), (req, res) => {
  res.render(
    "admin/panel-admin",
    {
      title: "Admin Dashboard",
      message: "Welcome to the admin dashboard",
    },
    (err, html) => {
      if (err) {
        return res.status(500).send(String(err));
      }
      let h = String(html);
      h = h.replace("let allMembers = [];", "var allMembers = [];");
      h = h.replace("let filteredMembers = [];", "var filteredMembers = [];");
      h = h.replace("let currentEditingMemberId = null;", "var currentEditingMemberId = null;");
      h = h.replace("let currentEditingMemberRoles = [];", "var currentEditingMemberRoles = [];");
      h = h.replace(
        "if (event.target === modal) modal.classList.remove('show');",
        "if (event.target === modal) closeEditModal();"
      );
      h = h.replace("</body>", `${ADMIN_PANEL_AUTOSAVE_INJECT}</body>`);
      res.send(h);
    }
  );
});

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



app.get("/api/users", authHandler.AdminOnly("mod"), async (req, res) => {
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

app.get("/api/pilots", authHandler.restrict, async (req, res) => {
  try {
    const users = await Users.find();
    const list = users.map((user) => ({
      Username: user.Username,
      Flighthours: user.Flighthours,
      Role: user.Role,
      Callsign: user.Callsign,
      avatar: user.avatar
    }));
    res.json({ data: list });
  } catch (error) {
    console.error('Error fetching pilots directory:', error);
    res.status(500).json({ error: 'Failed to fetch pilots' });
  }
});


app.get("/pilots", authHandler.restrict, (req, res) => {
  res.render('pilots-directory', {
    title: 'Pilots',
    message: 'View all registered pilots here',
    user: req.session.user
  });
})

app.post("/api/admin/users/:id/updateRole", authHandler.AdminOnly("admin"), async (req, res) => {
  const userId = req.params.id;
  const { role } = req.body;
  const standardAssignableRoles = ['admin', 'atc', 'enforcer', 'user', 'mod'];
  if (role === 'owner') {
    if (!req.session.user.role.includes('owner')) {
      return res.status(403).json({ error: 'Only owners may assign the owner role.' });
    }
  } else if (!standardAssignableRoles.includes(role)) {
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

app.post("/api/admin/users/:id/removeRole", authHandler.AdminOnly("admin"), async (req, res) => {
  const userId = req.params.id;
  const { role } = req.body;
  const removableRoles = ['admin', 'atc', 'enforcer', 'user', 'mod', 'owner'];
  if (!removableRoles.includes(role)) {
    return res.status(400).json({ error: 'Invalid role specified' });
  }
  if (role === 'owner' && !req.session.user.role.includes('owner')) {
    return res.status(403).json({ error: 'Only owners may remove the owner role.' });
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
  

app.post("/api/auth/register", registerGlobalLimiter, registerIpLimiter, async (req, res) => {
  const { username, password, email } = req.body;
  try{
  const result = await authHandler.register(username, password, email);
  if (typeof result === 'string') {
    res.status(400).json({ error: result });
  } else {
    res.json({
      message: 'User registered successfully',
      user: authHandler.publicUserSummary(result)
    });
  }
}catch(err){
  console.error('Error registering user:', err);
  res.status(500).json({ error: 'Failed to register user' });
}
});



app.post(
  '/api/auth/login',
  loginIpLimiter,
  loginUsernameBackoffGuard,
  async (req, res) => {
    const { username, password } = req.body;

    try {
      await authHandler.authenticate(username, password, function (err, user) {
        if (err) {
          console.error('Error during login:', err);
          return res.status(500).json({ error: 'Failed to login' });
        }
        if (!user) {
          recordLoginFailureForUsername(username);
          return res.status(401).json({ error: 'Invalid username or password' });
        }
        clearLoginFailureForUsername(username);
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
        res.json({ message: 'Login successful', user: req.session.user });
      });
    } catch (err) {
      console.error('Error during login:', err);
      res.status(500).json({ error: 'Failed to login' });
    }
  }
);

app.get("/login", (req, res) => {
  const redirectUrl = req.query.redirect || '/';
  res.render('auth/login', { title: 'Login', message: 'Login to your account', redirect: redirectUrl });
});

app.get("/login/:redirect", (req, res) => {
  const redirectUrl = req.params.redirect === 'home' ? '/' : `/${req.params.redirect}`;
  res.redirect('/login?redirect=' + encodeURIComponent(redirectUrl));
});

app.get("/logout", (req, res) => {
  const target = postLogoutRedirect(req);
  req.session.destroy(err => {
    if (err) {
      console.error('Error during logout:', err);
      return res.status(500).json({ error: 'Failed to logout' });
    }
    res.redirect(target);
  });
});

  app.get("/register", (req, res) => {
    res.render('auth/register', {
      title: 'Register',
      message: 'Create a new account',
      redirect: req.query.redirect || ''
    });
   });

  app.get('/forgot-password', (req, res) => {
    res.render('auth/forgotPass', {
      title: 'Forgot Password',
      message: 'Reset your account password'
    });
  });

  app.post(
    '/api/auth/forgot-password/request-code',
    passwordResetIpLimitIfEnabled,
    passwordResetRequestPerEmailLimiter,
    async (req, res) => {
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
  }
  );

  app.post(
    '/api/auth/forgot-password/verify-code',
    passwordResetIpLimitIfEnabled,
    passwordResetVerifyPerEmailLimiter,
    async (req, res) => {
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
  }
  );

  app.post(
    '/api/auth/forgot-password/reset',
    passwordResetIpLimitIfEnabled,
    passwordResetCompletePerEmailLimiter,
    async (req, res) => {
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
  }
  );


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

const CHART_MAKER_GOOGLE_FONTS_CACHE_MS = 1000 * 60 * 60 * 24;
const CHART_MAKER_FONTS_FALLBACK = [
  'Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins', 'Source Sans 3',
  'Noto Sans', 'IBM Plex Sans', 'DM Sans', 'Barlow', 'Work Sans', 'Rubik', 'Oswald',
  'Raleway', 'Merriweather', 'Playfair Display', 'PT Sans', 'Ubuntu', 'Nunito'
];

let chartMakerGoogleFontsCache = { families: null, fetchedAt: 0 };

app.get('/api/chart-maker/google-fonts', async (req, res) => {
  try {
    const now = Date.now();
    if (
      chartMakerGoogleFontsCache.families &&
      now - chartMakerGoogleFontsCache.fetchedAt < CHART_MAKER_GOOGLE_FONTS_CACHE_MS
    ) {
      return res.json({ families: chartMakerGoogleFontsCache.families });
    }
    const upstream = await fetch('https://fonts.google.com/metadata/fonts');
    if (!upstream.ok) {
      throw new Error(`metadata ${upstream.status}`);
    }
    const raw = await upstream.text();
    const json = JSON.parse(raw.replace(/^\)\]\}'\s*/, ''));
    const list = json.familyMetadataList;
    if (!Array.isArray(list)) {
      throw new Error('missing familyMetadataList');
    }
    const families = list
      .map((x) => x && x.family)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    chartMakerGoogleFontsCache = { families, fetchedAt: now };
    res.json({ families });
  } catch (err) {
    console.error('[chart-maker] google-fonts catalog:', err.message || err);
    res.json({ families: CHART_MAKER_FONTS_FALLBACK });
  }
});

app.get("/chart-maker", (req, res) => {
  res.render('admin/chartMaker', {
    title: 'Chart Maker',
    message: 'Create custom charts for ATC Maps'
  });
});

app.listen(PORT, async () => {
 bot.login(process.env.Discord_TOKEN).then(() => {
  console.log('Discord bot logged in successfully');
}).catch(err => {
  console.error('Error logging in Discord bot:', err);
});

  console.log(`Server is running on http://localhost:${PORT}`);
});
