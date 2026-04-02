const bkfd2Password = require('pbkdf2-password');
const hash = bkfd2Password();
const Users = require('../schemas/users');

function authenticate(name, pass, fn) {
  try {
    Users.findOne({ Username: name })
      .then((user) => {
        if (!user) return fn(null, null);

        hash({ password: pass, salt: user.Salt }, function (err, pass, salt, hashHex) {
          if (err) return fn(err);
          if (hashHex === user.Hash) {
            return fn(null, user);
          }
          return fn(null, null);
        });
      })
      .catch((err) => {
        fn(err);
      });
  } catch (err) {
    fn(err);
  }
}

const DEFAULT_SIGNUP_ROLE = ['user'];

function publicUserSummary(userDoc) {
  if (!userDoc) return null;
  const u = userDoc.toObject ? userDoc.toObject() : userDoc;
  return {
    id: u._id,
    username: u.Username,
    role: u.Role,
    flighthours: u.Flighthours,
    Callsign: u.Callsign,
    code: u.code,
    avatar: u.avatar,
    DiscordID: u.DiscordID || ''
  };
}

async function register(username, password, email, role) {
  const existingUser = await Users.findOne({ $or: [{ Username: username }, { Email: email }] });
  if (existingUser) {
    return 'User with this username or email already exists';
  }

  const roleToSet = role !== undefined && role !== null ? role : DEFAULT_SIGNUP_ROLE;

  return new Promise((resolve, reject) => {
    hash({ password: password }, function (err, pass, salt, hashHex) {
      if (err) return reject(err);
      Users.create({
        Username: username,
        Hash: hashHex,
        Salt: salt,
        Email: email,
        Role: roleToSet
      })
        .then((user) => resolve(user))
        .catch((err) => reject(err));
    });
  });
}

function AdminOnly(type) {
  return function (req, res, next) {
    const t = type.toLowerCase();
    if (
      req.session.user &&
      (req.session.user.role.includes(t) ||
        req.session.user.role.includes('owner') ||
        req.session.user.role.includes('admin'))
    ) {
      return next();
    }
    return res.redirect('/login?redirect=' + encodeURIComponent(req.originalUrl));
  };
}

function restrict(req, res, next) {
  if (req.session.user) return next();
  req.session.error = 'Access denied!';
  return res.redirect('/login?redirect=' + encodeURIComponent(req.originalUrl));
}

function restrictApi(req, res, next) {
  if (req.session.user) return next();
  return res.status(401).json({ error: 'Authentication required' });
}

function ATCOnly(req, res, next) {
  if (req.session.user && req.session.user.role.includes('atc')) return next();
  return res.redirect('/login?redirect=' + encodeURIComponent(req.originalUrl));
}

const ATC_PLUS_ROLES = ['atc', 'mod', 'admin', 'owner'];

function hasAtcPlusRole(user) {
  if (!user || !Array.isArray(user.role)) return false;
  return ATC_PLUS_ROLES.some((r) => user.role.includes(r));
}

const hasMetarStaffRole = hasAtcPlusRole;

function requireAtcPlusPage(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login?redirect=' + encodeURIComponent(req.originalUrl));
  }
  if (!hasAtcPlusRole(req.session.user)) {
    return res.status(403).send('Forbidden');
  }
  return next();
}

function requireAtcPlusApi(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (!hasAtcPlusRole(req.session.user)) {
    return res.status(403).json({ error: 'ATC staff access required' });
  }
  return next();
}

const MetarStaffOnly = requireAtcPlusPage;
const MetarStaffApiOnly = requireAtcPlusApi;
const AtcPlusOnly = requireAtcPlusPage;
const AtcPlusApiOnly = requireAtcPlusApi;

function EnforcerOnly(req, res, next) {
  if (req.session.user && req.session.user.role.includes('enforcer')) return next();
  return res.redirect('/login?redirect=' + encodeURIComponent(req.originalUrl));
}

function hashPassword(password) {
  return new Promise((resolve, reject) => {
    hash({ password: password }, function (err, pass, salt, hashHex) {
      if (err) return reject(err);
      resolve({ hash: hashHex, salt });
    });
  });
}

module.exports = {
  authenticate,
  register,
  publicUserSummary,
  AdminOnly,
  restrict,
  restrictApi,
  ATCOnly,
  hasAtcPlusRole,
  hasMetarStaffRole,
  MetarStaffOnly,
  MetarStaffApiOnly,
  AtcPlusOnly,
  AtcPlusApiOnly,
  EnforcerOnly,
  hashPassword
};
