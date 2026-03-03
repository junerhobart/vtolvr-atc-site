const express = require('express');
const path = require('path');
require('dotenv').config();
const Mongo = require('./functions/MongoHandler');
const Application = require('./schemas/application');
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

// Routes
app.get('/', (req, res) => {
  res.render('index', { 
    title: 'VTOL VR ATC Site',
    message: 'Welcome to the VTOL VR ATC  Site'
  });
});

app.get('/sessions', (req, res) => {
  res.render('sessions', { 
    title: 'Sessions',
    message: 'Manage your VTOL VR sessions here'
  });
});

app.get("/ifr", (req, res) => {
  res.render('ifr', {
    title: 'IFR',
    message: 'IFR Flight Planning and Tracking'
  });
});
app.get("/discord", (req, res) => {
  res.redirect("https://discord.gg/F3rh3FZ8cs");
});

app.get("/charts", (req, res) => {
  res.render('charts', {
    title: 'Charts',
    message: 'VTOL VR Maps and Charts'
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
  


  app.post("/api/applications/submit", async (req, res) => {
    const data = req.body;
    console.log('Received application data:', data);
    // check if application is for ATC or Enforcer and validate required fields make a new application object based on the schema
    if (data.type === 'atc') {
      if (!data.callsign) {
        return res.status(400).json({ error: 'Callsign is required for ATC applications' });
      }
    } else if (data.type === 'enforcer') {
      if (!data.discordHandle) {
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


app.get("/applications/admin", (req, res) => {
  res.render('application-admin', {
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
  


    
      

// Start the server
app.listen(PORT, async () => {
  await Mongo();
  console.log(`Server is running on http://localhost:${PORT}`);
});
