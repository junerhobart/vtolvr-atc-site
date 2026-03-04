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
      
      return fn(null, user) }
    fn(null, null)
  });
});}catch(err){
 console.error('issue with authenticating user', {msg: err});
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


function AdminOnly(req, res, next) {

    console.info('checking admin access for user', {user: req.session.user ? req.session.user.Username : 'unknown'});
    console.info('user roles', {roles: req.session.user ? req.session.user.role : 'unknown'});
    if (req.session.user && req.session.user.role.includes('admin')) {
        return next();
    }
    res.status(403).json({ message: 'Forbidden' });
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

    //redirect to login page if not authenticated
    return res.redirect('/login');
  }
}



module.exports = {
    authenticate,
    register,
    AdminOnly,
    restrict

};