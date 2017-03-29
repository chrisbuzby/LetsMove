'use strict';
require('dotenv').config({
    silent: true
});

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const APIAI_TOKEN = process.env.APIAI_TOKEN;
const WEATHER_API_KEY = process.env.WEATHER_API_KEY;
const YELP_CLIENT_ID = process.env.YELP_CLIENT_ID;
const YELP_CLIENT_SECRET = process.env.YELP_CLIENT_SECRET;

const Yelp = require('yelp-fusion-v3');
const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');
const apiai = require('apiai');
const R = require('ramda');

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: true
}));

let messageType = "text"

const server = app.listen(process.env.PORT || 5000, () => {
    console.log('Express server listening on port %d in %s mode', server.address().port, app.settings.env);
});

/*Initialize APIAI */
const apiaiApp = apiai(APIAI_TOKEN);

/*Initialize YELP */
let yelp = new Yelp({
    client_id: YELP_CLIENT_ID,
    client_secret: YELP_CLIENT_SECRET
});


/* For Facebook Validation */
app.get('/webhook', (req, res) => {
    if (req.query['hub.mode'] && req.query['hub.verify_token'] === 'LetsMove2017') {
        res.status(200).send(req.query['hub.challenge']);
    } else {
        res.status(403).end();
    }
});

/* Handling all messenges */
app.post('/webhook', (req, res) => {
    console.log('Body to FB ', req.body);
    if (req.body.object === 'page') {
        req.body.entry.forEach((entry) => {
            entry.messaging.forEach((event) => {
                if (event.message && event.message.text) {
                    sendMessage(event);
                }
            });
        });
        res.status(200).end();
    }
});

// function sendMessage(event) {
//   let sender = event.sender.id;
//   let text = event.message.text;
//
//   console.log('*** RECEIVED ***');
//   console.log(event);
//
//   request({
//     url: 'https://graph.facebook.com/v2.6/me/messages',
//     qs: {access_token: PAGE_ACCESS_TOKEN},
//     method: 'POST',
//     json: {
//       recipient: {id: sender},
//       message: {text: text}
//     }
//   }, function (error, response) {
//     if (error) {
//         console.log('Error sending message: ', error);
//     } else if (response.body.error) {
//         console.log('Error: ', response.body.error);
//     }
//   });
// }


/* GET query from API.ai */

function sendMessage(event) {
    let sender = event.sender.id;
    let text = event.message.text;

    let apiai = apiaiApp.textRequest(text, {
        sessionId: 'tabby_cat'
    });

    apiai.on('response', (response) => {
        console.log('START OF response' + response + 'END OF response')
        let aiText = response.result.fulfillment.speech;
        console.log('START OF aiText' + aiText + 'END OF aiText')
        debugger
        if (messageType === "text") {
          var jsonText = {
                  recipient: {
                  id: sender
              },
                message: {
                  text: aiText
                }
          }
        }
        else{
          var jsonText = {
                  recipient: {
                  id: sender
              },
                message: aiText
          }
        }

        messageType = "text"

        request({
            url: 'https://graph.facebook.com/v2.6/me/messages',
            qs: {
                access_token: PAGE_ACCESS_TOKEN
            },
            method: 'POST',
            json: jsonText
        }, (error, response) => {
            if (error) {
                console.log('Error sending message: ', error);
            } else if (response.body.error) {
                console.log('Error: ', response.body.error);
            }
        });



    });


    apiai.on('error', (error) => {
        console.log(error);
    });

    apiai.end();
}

/* Webhook for API.ai to get response from the 3rd party API */
app.post('/ai', (req, res) => {
            console.log('*** Webhook for api.ai query ***');
            console.log(req.body.result);

            if (req.body.result.action === 'weather') {
                console.log('*** weather ***');
                let city = req.body.result.parameters['geo-city'];
                let restUrl = 'http://api.openweathermap.org/data/2.5/weather?APPID=' + WEATHER_API_KEY + '&q=' + city;

                request.get(restUrl, (err, response, body) => {
                    if (!err && response.statusCode == 200) {
                        let json = JSON.parse(body);
                        console.log(json);
                        let tempF = ~~(json.main.temp * 9 / 5 - 459.67);
                        let tempC = ~~(json.main.temp - 273.15);
                        let msg = 'The current condition in ' + json.name + ' is ' + json.weather[0].description + ' and the temperature is ' + tempF + ' ℉ (' + tempC + ' ℃).'
                        return res.json({
                            speech: msg,
                            displayText: msg,
                            source: 'weather'
                        });
                    } else {
                        let errorMessage = 'I failed to look up the city name.';
                        return res.status(400).json({
                            status: {
                                code: 400,
                                errorType: errorMessage
                            }
                        });
                    }
                })
            } else if (req.body.result.action === 'movers') {
                console.log('*** movers ***');
                let city = req.body.result.parameters['geo-city'];
                messageType = "Object"

                yelp.getToken()
                    .then(message => console.log(message))
                    .catch(e => console.error(e))

                yelp.getBusinesses({
                        term: 'movers',
                        location: city,
                        limit: 3
                    })

                    .then(function (data) {
                      var jsonBussObj = JSON.parse(data); // convert data to JSON string
                      console.log('data', jsonBussObj.businesses[0].name);
                      var l = jsonBussObj.length; // Print length
                      let msg = 'The top result on Yelp is ' + jsonBussObj.businesses[0].name;
                      console.log(msg + 'END OF MESSAGE')

                      function makeBusinessComponent(businessObj) {
                        return {
                          title: businessObj.name,
                          subtitle: businessObj.phone,
                          image_url: businessObj.image_url,
                          buttons: [{
                              type: "web_url",
                              url: businessObj.url,
                              title: "Yelp Review"
                          },{
                              type: "web_url",
                              url: businessObj.url,
                              title: "Request a Quote"
                        }],
                        }
                      }
                      let messageData = {
                          "attachment": {
                              "type": "template",
                              "payload": {
                                  "template_type": "generic",
                                  "elements": R.map(makeBusinessComponent, jsonBussObj.businesses),
                              }
                          }
                      };


                      return res.json({
                          speech: JSON.stringify(messageData),
                          displayText: msg,
                          source: 'movers'
                      });
                    })

                //                    .then(message => JSON.parse(message))
                    .catch(e => console.error(e))
                //    console.log(jsonBussObj.name);




            } else {
                let errorMessage = 'No Clue.';
                return res.status(400).json({
                        status: {
                            code: 400,
                            errorType: errorMessage
                          }
                      });
                  }

            })
