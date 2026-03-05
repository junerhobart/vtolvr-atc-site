const express = require('express');
const path = require('path');
require('dotenv').config();
const Mongo = require('./functions/MongoHandler');
const Application = require('./schemas/application');
const Users = require('./schemas/users');
const Events = require('./schemas/events');
const authHandler = require('./functions/AuthHandler');
const { render } = require('ejs');


const app = express();
const PORT = process.env.PORT || 3000;

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
  cookie: { secure: false, httpOnly: true }
}));

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

app.get("/ifr", (req, res) => {
  res.render('ifr', {
    title: 'IFR',
    message: 'IFR Flight Planning and Tracking',
    user: req.session.user
  });
});
app.get("/discord", (req, res) => {
  res.redirect("https://discord.gg/F3rh3FZ8cs");
});

app.get("/charts", (req, res) => {
  res.render('charts', {
    title: 'Charts',
    message: 'VTOL VR Maps and Charts',
    user: req.session.user
  });
});
app.get("/api/sessions", (req, res) => {
 const sessions = fetch(process.env.SESSIONS_API_URL)
  .then(response => response.json())
  .then(data => {
    res.json(data);
  }
  ).catch(error => {
    console.error('Error fetching sessions:', error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  });
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
      
      Application.create({
        name: data.Username,
        type: data.type,
        callsign: data.callsign,
        discordHandle: data.discord,
        discordId: data.discordId,
        experience: data.experience,
        whyJoin: data.whyJoin


      }).then(application => {
        console.log('Application submitted:', application);
        //send a DM to the applicant confirming receipt of their application
        sendDM(application.discordId, `Hello ${application.name}, thank you for submitting your application for the ${application.type} position. We have received your application and will review it shortly. You will receive a DM with the outcome of your application once it has been processed. We appreciate your interest in joining our team!`);
        //send a webhook to the admin channel notifying them of a new application
        const embedBody = {
          content: '<@&1462572777092546743> <@&1474154308873486528> New ATC Application Submitted', // Empty content field
          "embeds": [{

              title: `New Application for ${application.type} position`,
              description: `An application has been submitted by ${application.name} for the ${application.type} position. Please review the application in the [admin panel](https://atc-vtolvr.site/admin/applications/admin).`,
              color: 0x00FF00,
          }],
          timestamp: new Date().toISOString()
      };
      const body = JSON.stringify(embedBody);

      const webhookURL =process.env.DISCORD_WEBHOOK_URL_ADMIN;
      fetch(webhookURL, {
          method: 'POST',
          headers: {

              'Content-Type': 'application/json'
          },
          body:body
      }).then(response => {

          if (!response.ok) {
              return response.text().then(errorText => {
                  console.error('Error:', errorText);
                  throw new Error('Failed to send webhook notification');
              });
          }
        }).catch(error => {
          console.error('Error sending webhook notification:', error);
          // Don't throw an error here since the application was still created successfully
        });
        res.json({ message: 'Application submitted successfully' });
      }).catch(error => {
        console.error('Error creating application:', error);
        res.status(500).json({ error: 'Failed to submit application' });
        throw error;
      });
      
      
    }
      catch (error) {
        console.error('Error submitting application:', error);
        res.status(500).json({ error: 'Failed to submit application' });
      }
  });


app.get("/applications/admin", authHandler.AdminOnly, (req, res) => {
  res.render('admin/application-admin', {
    title: 'Admin Applications',
    message: 'Review and manage applications here'
  });
}
);
app.get ("/applications", (req, res) => {
  res.render('applications', {
    title: 'Application',
    message: 'Apply to become an ATC or Enforcer'
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
      //send a DM to the applicant notifying them of their acceptance and next steps
      sendDM(application.discordId, `Congratulations ${application.name}! Your application for the ${application.type} position has been approved. We will be in touch with you soon regarding the next steps. Welcome to the team!`);
      //send a webhook to the admin channel notifying them of the approved application
      const embedBody = {
        content: `<@&1462572777092546743> <@&1474154308873486528> Application Approved`, // Empty content field
        "embeds": [{

            title: `Application Approved for ${application.type} position`,
            description: `The application submitted by ${application.name} for the ${application.type} position has been approved. Please reach out to the applicant to coordinate next steps.`,
            color: 0x0000FF,
        }],
        timestamp: new Date().toISOString()
    };
    const body = JSON.stringify(embedBody);

    const webhookURL =process.env.DISCORD_WEBHOOK_URL_ADMIN;
    fetch(webhookURL, {
        method: 'POST',
        headers: {

            'Content-Type': 'application/json'
        },
        body:body
    }).then(response => {


        if (!response.ok) {
            return response.text().then(errorText => {
                console.error('Error:', errorText);
                throw new Error('Failed to send webhook notification');
            });
          }
    })
    
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
      //!SECTION send a DM to the applicant notifying them of their rejection
      sendDM(application.discordId, `Hello ${application.name}, we regret to inform you that your application for the ${application.type} position has been rejected. Thank you for your interest and we encourage you to apply again in the future.`);
      //send a webhook to the admin channel notifying them of the rejected application
      const embedBody = {
        content: `<@&1462572777092546743> <@&1474154308873486528> Application Rejected`, // Empty content field
        "embeds": [{

            title: `Application Rejected for ${application.type} position`,
            description: `The application submitted by ${application.name} for the ${application.type} position has been rejected. Please reach out to the applicant if you would like to provide feedback or encourage them to reapply in the future.`,
            color: 0xFF0000,
        }],
        timestamp: new Date().toISOString()
    };
    const body = JSON.stringify(embedBody);
    

    const webhookURL =process.env.DISCORD_WEBHOOK_URL_ADMIN;
    fetch(webhookURL, {
        method: 'POST',
        headers: {

            'Content-Type': 'application/json'
        },
        body:body
    }).then(response => {


        if (!response.ok) {
            return response.text().then(errorText => {
                console.error('Error:', errorText);
                throw new Error('Failed to send webhook notification');
            });
          }
    })
      res.json({ message: 'Application rejected successfully' });
    } catch (error) {
      console.error('Error rejecting application:', error);
      res.status(500).json({ error: 'Failed to reject application' });
    }
  });

function sendDM(userId, message) {
  return fetch(`${process.env.SESSIONS_API_URL}/api/send/dm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ userId, message })
  })
  .then(response => {
    if (!response.ok) {
      return response.text().then(errorText => {
        console.error('Error:', errorText);
        throw new Error('Failed to send DM');

      });
    }
    return response.json();
  })
  .catch(error => {
    console.error('Error sending DM:', error);
    throw error;
  });
}

  app.get("/test", async (req, res) => {
    res.render('test', {
      title: 'Test',
      message: 'This is a test page'
    });
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
          event.save();
        }
      } else if (eventEnd < now) {
        if (event.status !== 'completed') {
          event.status = 'completed';
          event.save();
          //delete the event 24 hours after it has ended
          setTimeout(() => {
            Events.findByIdAndDelete(event._id).then(() => {
              console.log('Deleted event:', event.name);
            }).catch(err => {
              console.error('Error deleting event:', err);
            }
            );}, 24 * 60 * 60 * 1000);
          
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

}, 60000);


// event creation endpoint for atcs
app.post("/api/events/create", authHandler.ATCOnly, (req, res) => {
  const data = req.body;
  Events.create({
    name: data.name,
    airport: data.airport,
    timezone: data.timezone,
    pilots: data.pilots,
    duration: data.duration,
    startTime: data.startTime,
    endTime: data.endTime,
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

          

        //send a webhook to the admin channel notifying them of the new event
        const embedBody = {
          content: `${ping} New Event Created`, // Empty content field
          "embeds": [{
              title: `New Event: ${event.name}`,
            description: `A new event has been created by ${req.session.user.username}. The event is scheduled to take place at ${event.airport} on <t:${Math.floor(new Date(event.startTime).getTime() / 1000)}:R> and will last for ${event.duration}hours. Please reach out to the event organizer if you would like to participate or need more information.`,
            color: 0x00FF00,
        }],
        timestamp: new Date().toISOString()
    };
    const body = JSON.stringify(embedBody);

    const webhookURL =process.env.DISCORD_WEBHOOK_URL_EVENTS;
    fetch(webhookURL, {
        method: 'POST',
        headers: {

            'Content-Type': 'application/json'
        },
        body:body
    }).then(response => {

        if (!response.ok) {
            return response.text().then(errorText => {
                console.error('Error:', errorText);
                throw new Error('Failed to send webhook notification');
            });
          }
      }).catch(error => {

        console.error('Error sending webhook notification:', error);  
        // Don't throw an error here since the event was still created successfully
      });
    }
    res.json({ message: 'Event created successfully', event });
  }).catch(error => {
    console.error('Error creating event:', error);
    res.status(500).json({ error: 'Failed to create event' });
  });
});



app.get("/profile", (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  res.render('profile', {
    title: 'Profile',
    message: 'View and edit your profile information here',
    user: req.session.user
  });
}
);

//admin routes

app.get("/admin", authHandler.AdminOnly, (req, res) => {
  res.render('admin/panel-admin', {
    title: 'Admin Dashboard',
    message: 'Welcome to the admin dashboard'
  });});

app.get("/api/admin/users", authHandler.AdminOnly, async (req, res) => {
  try {
    const users = await Users.find();
   
    res.json({ data: users });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
  
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
        Callsign: user.Callsign
       
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
app.post("/api/admin/users/:id/updateRole", authHandler.AdminOnly, async (req, res) => {
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
    res.json({ message: 'User role updated successfully' });
  } catch (error) {
    console.error('Error updating user role:', error);
    res.status(500).json({ error: 'Failed to update user role' });
  }
});
app.post("/api/admin/users/:id/updateCallsign", authHandler.AdminOnly, async (req, res) => {
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
    res.json({ message: 'User callsign updated successfully' });
  } catch (error) {
    console.error('Error updating user callsign:', error);
    res.status(500).json({ error: 'Failed to update user callsign' });
  }
});


//!SECTION Endpoint for removing a role from a user
app.post("/api/admin/users/:id/removeRole", authHandler.AdminOnly, async (req, res) => {
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
    res.json({ message: 'User role removed successfully' });
  } catch (error) {
    console.error('Error removing user role:', error);
    res.status(500).json({ error: 'Failed to remove user role' });
  }
});


app.post("/api/admin/users/:id/updateFlighthours", authHandler.AdminOnly, async (req, res) => {
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
      Callsign: user.Callsign
    };
    console.log('User logged in:', req.session.user);
    res.json({ message: 'Login successful', user: req.session.user });
  })
}catch(err){
  console.error('Error during login:', err);
  res.status(500).json({ error: 'Failed to login' });
}
 
});

app.get("/login", (req, res) => {
  res.render('auth/login', {
    title: 'Login',
    message: 'Login to your account'
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




// !SECTION Endpoint for user profile updates
app.post("/api/profile/update", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const userId = req.session.user.id;
  const { email,callsign,discordId } = req.body;
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
    if (discordId) {
      user.DiscordID = discordId.trim();
    }
    await user.save();
    res.json({ message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});


    
      

// Start the server
app.listen(PORT, async () => {
  await Mongo();
  console.log(`Server is running on http://localhost:${PORT}`);
});
