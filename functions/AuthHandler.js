const bkfd2Password = require("pbkdf2-password");
const hash = bkfd2Password();
const Users = require('../schemas/users');




// Authenticate using our plain-object database of doom!
/**
 * 
 * @param {String} name 
 * @param {String} pass 
 * @param {Function} fn 
 */
function authenticate(name, pass, fn) {
  try{
  console.info('authenticating user', {user: name});
  Users.findOne({Username: name}).then((user) => {
  // query the db for the given username
  if (!user) return fn(null, null)

  
  // apply the same algorithm to the POSTed password, applying
  // the hash against the pass / salt, if there is a match we
  // found the user
  
  hash({ password: pass, salt: user.Salt }, function (err, pass, salt, hash) {
    if (err) return fn(err);
    if (hash === user.Hash) {
      return fn(null, user);
    }
    return fn(null, null);
  });
  }).catch(err => {
    console.error('issue with authenticating user', {msg: err});
    fn(err);
  });
  }catch(err){
 console.error('issue with authenticating user', {msg: err});
 fn(err);
}
};


async function register(username, password, email, role) {

   // check if user already exists by email or username
   const existingUser = await Users.findOne({ $or: [{ Username: username }, { Email: email }] });
    if (existingUser) {
       
        return "User with this username or email already exists";   
    }

    // hash the password
    return new Promise((resolve, reject) => {
        hash({ password: password }, async function (err, pass, salt, hash) {
            if (err) return reject(err);
            // create the user
            Users.create({
                Username: username,
                Hash: hash,
                Salt: salt,
                Email: email,
                Role: role
            }).then(user => {
                resolve(user);
            }).catch(err => {
                reject(err);
            });
        });
    });  
}


function AdminOnly(type) {
    return function(req, res, next) {
        type = type.toLowerCase();
        
        if (req.session.user && req.session.user.role.includes(type)|| req.session.user.role.includes("owner")|| req.session.user.role.includes("admin")) {
            return next();
        }
    const redirect = req.query.redirect ? `?redirect=${encodeURIComponent(req.query.redirect)}` : '';

        return res.redirect(`/login/${redirect}`);
    };
}


/**
 * @description checks if user is logged in
 * @param {*} req 
 * @param {*} res 
 * @param {*} next 
 */
function restrict(req, res, next) {
  if (req.session.user) {
    next();
  } else {
    req.session.error = 'Access denied!';
const url = req.originalUrl;
   const redirect = url.split("/").at(-1);
   

    return res.redirect(`/login/${redirect}`);
  }
}

function ATCOnly(req, res, next) {

    console.info('checking atc access for user', {user: req.session.user ? req.session.user.Username : 'unknown'});
    console.info('user roles', {roles: req.session.user ? req.session.user.role : 'unknown'});  
    if (req.session.user && req.session.user.role.includes('atc')) {
        return next();
    }

    //grabs the redirect query param if it exists and appends it to the login url so the user can be redirected back after login
    const url = req.originalUrl;
    
    
    const redirect = url.split("/").at(-1);

    return res.redirect(`/login/${redirect}`);
  

}

function EnforcerOnly(req, res, next) {
     console.info('checking enforcer access for user', {user: req.session.user ? req.session.user.Username : 'unknown'});
    console.info('user roles', {roles: req.session.user ? req.session.user.role : 'unknown'});  
    if (req.session.user && req.session.user.role.includes('enforcer')) {
        return next();
    }
   //grab the last part of the url to redirect back to after login

    return res.redirect(`/login/${redirect}`);

}
function hashPassword(password) {
    return new Promise((resolve, reject) => {
        hash({ password: password }, function (err, pass, salt, hash) {
            if (err) return reject(err);
            resolve({ hash, salt });
        }
        );
    }
    );
}




module.exports = {
    authenticate,
    register,
    AdminOnly,
    restrict,
    ATCOnly,
    EnforcerOnly,
    hashPassword

};