const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioNumber = process.env.TWILIO_NUMBER;
const client = require('twilio')(accountSid, authToken);
const dynamoClient = require('./dynamo');
const AWS = require('aws-sdk');
const Constants = require('./constants');


module.exports.main = async event => {
  console.log(event);
  let message = event.body.Body;
  event.From = unescape(event.From);
  console.log('received twilio message ', message);
  message = unescape(decodeURI(message.replace(/\+/gi, ' ')).trim());
  console.log('after parsing ', message);
  if (message.toLowerCase().includes('balance')) {
    if (message.toLowerCase().includes('month')) {
      return getBalance(Constants.MONTH)
    } else if (message.toLowerCase().includes('week')) {
      return getBalance(Constants.WEEK)
    }
  } else {
    //Capital One Alert: A chrge or hold for $6.39 on 05/20/2020 was placed on your
    // credit card (6430) at VIDANGEL SUBSCRIPTION. Std carrier chrges apply
    let parsed = message.match(/for (\$[0-9.,]+).*card \(([0-9]{4})\) at (.*?)\./)
    let amount = parsed[1]
    amount = Number(amount.replace(/[^0-9.-]+/g,""));
    let card = parsed[2];
    let description = parsed[3];
    let category = 'UNKNOWN'
    if ( !amount || !category || !card || !description) {
      let message = `Error adding transaction with amount: ${amount} `
        + `category: ${category}, card: ${card}, desc: ${description}`;
      return sendSMS(process.env.HIS_NUMBER, message);
    }
    else return addTransaction(amount, category, card, description);
  }
  return sendSMS(process.env.HIS_NUMBER, 'Success');
  // return {
  //   statusCode: 200,
  //   body: JSON.stringify(
  //     {
  //       message: 'Go Serverless v1.0! Your function executed successfully!',
  //       input: event,
  //     },
  //     null,
  //     2
  //   ),
  // };
}

async function addTransaction(amount, category, card, description) {
  console.log('adding transaction');
  dynamoClient.putTransaction(amount, category, card, description)
  .then(transaction => {
    let message = `added transaction with amount: ${transaction.get('amount')} `
    + `category: ${transaction.get('category')}, card: ${card}, `
    + `desc: ${transaction.get('description')}`;
    console.log(message);
    return sendSMS(process.env.HIS_NUMBER, message)
  })
  .catch(err => {
    console.log(err);
    return sendSMS(process.env.HIS_NUMBER, err.toString())
  })
}

async function sendSMS(to, body) {
  console.log('in sms sending')
  return client.messages
    .create({ body: unescape(body), from: process.env.TWILIO_NUMBER, to })
    .then(message => {
      console.log('sent success ', message)
      return Promise.resolve(message)
    })
    .catch(err => {
      console.log(err);
      return Promise.reject(err)
    })
}

async function response(event) {
  // TODO: visibility on queue affects when messages come in. in FIFO, all other messages blocked....
  //  so, it says game has begun. I text response. Hit's messages. 5 minutes later hit's poller. That's with 5 min
  //  visibility timeout and 1 minute lambda timeout.
  // TODO: do something with a response between NEW GAME and READY
  console.log('in response')
  // TODO: restrict response character length in case of copy-paste abuse and polly costs
  let { Body, From } = event;
  let message = unescape(decodeURI(Body)).trim();
  const player = await dynamoClient.getPlayer({ number: From });
  let roomCode = player.get('currentRoom').toUpperCase();
  let room = await dynamoClient.getRoom(roomCode);
  let charLimit = room.get('charLimit');
  if (!message || !message.length || message.replace(' ', '').length === 0) {
    return sendSMS(player.get('number'), `🤔 There was no text in that message, try again with some actual text. (No pictures!)`);
  }
  if (message.length > charLimit) {
    return sendSMS(player.get('number'), `😋Oops! Your response was longer than the rules specified. You have ${Body.length} ` +
      `characters. The limit for this game is ${charLimit}. Please re-submit a shorter message.`)
  } else return sendSQS({
    Body: message, From, roomCode, type: 'response'
  }, false)

}