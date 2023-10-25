const Telegraf = require('telegraf'); // Module to use Telegraf API.
const config = require('./config'); // Configuration file that holds telegraf_token API key.
const session = require('telegraf/session');
const Extra = require('telegraf/extra');
const Markup = require('telegraf/markup');
const rateLimit = require('telegraf-ratelimit');
var mongoose = require('mongoose');
const User = require('./user');
var ethereum_address = require('ethereum-address'); //used for verifying eth address

mongoose.connect(config.mongoURL, {
  socketTimeoutMS: 45000,
  keepAlive: true,
  poolSize: 10,
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
const db = mongoose.connection;

// CONNECTION EVENTS
// When successfully connected
mongoose.connection.on('connected', function () {
  console.log('Mongoose default connection open to ');
});

// If the connection throws an error
mongoose.connection.on('error', function (err) {
  console.log('Mongoose default connection error: ' + err);
});

// When the connection is disconnected
mongoose.connection.on('disconnected', function () {
  console.log('Mongoose default connection disconnected');
});

// If the Node process ends, close the Mongoose connection
process.on('SIGINT', function () {
  mongoose.connection.close(function () {
    console.log('Mongoose default connection disconnected through app termination');
    process.exit(0);
  });
});

const buttonsLimit = {
  //sets a limit for user clicks
  window: 1000,
  limit: 1,
  onLimitExceeded: (ctx, next) => {
    if ('callback_query' in ctx.update)
      ctx.answerCbQuery('You`ve pressed buttons too oftern, wait.', true).catch((err) => sendError(err, ctx));
  },
  keyGenerator: (ctx) => {
    return ctx.callbackQuery ? true : false;
  },
};

//check connection

db.once('open', function () {
  console.log('connected to mongodb');
});
db.on('error', function (err) {
  console.log(err);
});

var refByNameAsync = function (ctx) {
  //finds and returns the name of the referrer
  return new Promise(function (resolve, reject) {
    try {
      var refBy = ctx.session.refBy;
      var findquery = {
        refNumber: refBy,
      };
      User.findOne(findquery, function (err, result) {
        if (err) throw err;
        if (result == null) {
          //if user doesn't exist
          ctx.session.refByName = '';
          resolve('ref by no one');
          return false;
        } else {
          //if user exists, return it's data
          ctx.session.refByName = result.telegramUser;
          resolve('ref by', ctx.session.refByName);
          console.log('Found TG USER REFFER BY:', ctx.session.refByName);
        }
      });
    } catch (e) {
      reject(e);
      console.log(e);
    }
  });
};

var checkDataAsync = function (ctx) {
  //checks the inputed user data
  return new Promise(function (resolve, reject) {
    try {
      if (ethereum_address.isAddress(ctx.session.eth.toString())) {
        resolve(true);
        return true;
      } else {
        resolve(false);
        return false;
      }
    } catch (e) {
      reject('error');
      console.log(e);
    }
  });
};

var findExistingAsync = function (ctx) {
  //finds existing members in the database
  return new Promise(function (resolve, reject) {
    try {
      console.log('FINDING EXISTING');
      var userID = ctx.from.id.toString();
      var findquery = {
        refNumber: userID,
      };
      User.findOne(findquery, function (err, result) {
        if (err) throw err;
        // console.log('Finding result', result);
        if (result == null) {
          resolve("ref user doesn't exist");
          //if user doesn't exist
          return false;
        } else {
          //returns data if user exists in
          console.log('DATA found!');
          var refNumber = ctx.session.refNumber;
          console.log('REF number in finding exisit:', refNumber);
          User.countDocuments(
            {
              refBy: refNumber,
            },
            function (err, count) {
              ctx.session.count = count;
              console.log('count is:', count);
            }
          );
          // console.log('result ===========', result);
          ctx.session.eth = result.ethAddress;
          ctx.session.twitter = result.emailAddress;
          ctx.session.refBy = result.refBy;
          ctx.session.refNumber = result.refNumber;
          ctx.session.username = result.telegramUser;
          ctx.session.moma = result.moma;
          ctx.session.joinTele = result.joinTele;
          ctx.session.followed = result.followed;
          ctx.session.found = '1';
          resolve('User found, returning');
        }
      });
    } catch (e) {
      reject('error');
      console.log(e);
    }
  });
};

var saveDataAsync = function (ctx) {
  //saves data to Mongodb
  return new Promise(function (resolve, reject) {
    try {
      console.log('SAVING DATA');
      var creationDate = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, ''); //cleans up creation date
      var ethAddress = ctx.session.eth.toString();
      var emailAddress = ctx.session.twitter.toString();
      var telegramUser = ctx.session.username.toString();
      var refNumber = ctx.session.refNumber.toString();
      var refBy = '0';
      var moma = ctx.session.moma.toString();
      var joinTele = ctx.session.joinTele;
      var followed = ctx.session.followed;
      if (ctx.session.refBy != null) {
        refBy = ctx.session.refBy;
      } else {
        refBy = '0';
      }
      var findquery = {
        refNumber,
      };
      User.findOne(findquery, function (err, result) {
        console.log('FIND ONE');
        let myobj = new User({
          ethAddress,
          emailAddress,
          telegramUser,
          refNumber,
          refBy,
          creationDate,
          moma,
          joinTele,
          followed,
        });

        if (err) {
          reject('error');
        }
        // console.log('finding result', result);
        if (result == null) {
          //if it doesn't find an existing user, saves the current data
          myobj.save(function (err) {
            if (err) {
              reject('error saving');
              console.log('Error while saving:', err);
              return;
            } else {
              resolve('Saved data');
              console.log('1 document inserted');
            }
          });
        } else {
          //if it finds an existing user, it updates the data
          User.findOneAndUpdate(
            {
              refNumber,
            },
            {
              $set: {
                ethAddress,
                emailAddress,
                telegramUser,
                refNumber,
                refBy,
                creationDate,
                moma,
                joinTele,
                followed,
              },
            },
            {
              new: true,
            },
            (err, doc) => {
              if (err) {
                reject('error updating');
                console.log('error updating:', err);
              } else {
                resolve('Saved existing data');
                ctx.session.step = 6;
                // console.log(doc);
              }
            }
          );
        }
      });
    } catch (e) {
      reject('error');
      console.log(e);
    }
  });
};

//keyboard
const keyboard = Markup.inlineKeyboard([
  Markup.callbackButton('Yes, I want to register!', 'intro'),], {
  columns: 1,
});

function firstMessage(ctx) {
  var finalResult;

  finalResult = `👋Welcome @${ctx.session.username} to AntBot!`;
  finalResult += '\n';
  finalResult += '\n';
  finalResult += '📝By proceeding to use the bot, you confirm that you have read and agreed to our Terms and Service.';
  finalResult += '\n';
  finalResult += '🔏AntBot ensures that your information will be treated confidentially.';
  finalResult += '\n';
  finalResult += '\n';
  finalResult += '❗️Please register to continue using this bot';
  finalResult += '\n';
  finalResult += '\n';
  finalResult += 'v1.0.beta';
  finalResult += '\n';
  finalResult +=
    'ⓒ 2023 AntBot AI';
  // finalResult += '\n';
  // finalResult += '\n';
  // finalResult += '1.📌 Submit your receiver ETH address.';
  // finalResult += '\n';
  // finalResult += '\n';
  // finalResult += '2.📌 Submit your twitter username.';
  // finalResult += '\n';
  // finalResult += '\n';
  // finalResult += '3.📌 Submit your retweet link';
  // finalResult += '\n';
  // finalResult += '\n';

  return finalResult;
}

async function check(ctx) {
  var finalResult;
  finalResult = '1. Submitted ERC-20 address';
  if (ctx.session.eth) {
    finalResult += ' ✅';
  } else {
    finalResult += ' ❌';
  }
  finalResult += '\n';
  finalResult += '2. Submitted Email address';
  if (ctx.session.twitter) {
    finalResult += ' ✅';
  } else {
    finalResult += ' ❌';
  }
  finalResult += '\n';

  finalResult += '3. Complete Registration';
  if (ctx.session.moma) {
    finalResult += ' ✅';
  } else {
    finalResult += ' ✅';
  }
  finalResult += '\n';

  finalResult += '4. Share your referral link to get more benefit!';
  if (ctx.session.moma) {
    finalResult += ' 🔥';
  } else {
    finalResult += ' 🔥';
  }
  finalResult += '\n';

  return finalResult;
}

function makeMessage(ctx) {
  var finalResult;
  finalResult = '👤User ID: ';
  finalResult += ctx.from.id;
  finalResult += '\n';
  finalResult += '🎫 Account Name: ';
  finalResult += ctx.session.moma;
  finalResult += '\n';
  finalResult += '💲Wallet Address: ';
  finalResult += ctx.session.eth;
  finalResult += '\n';
  finalResult += '📧email address: ';
  finalResult += ctx.session.twitter;
  finalResult += '\n';
  finalResult += '👥Referral link: https://t.me/AI_AntBot?start=';
  finalResult += ctx.session.refNumber;
  finalResult += '\n';
  finalResult += '🔢Number of referrals: ';
  finalResult += ctx.session.count || '0';
  finalResult += '\n';
  finalResult += '🔗Referred by: ';
  finalResult += ctx.session.refByName || '';

  return finalResult;
}
async function balance(ctx) {
  var finalResult;
  finalResult = 'Funds in ANTBT Trading Pool: <b>$1200</b>';

  return finalResult;
}

function makeMessage(ctx) {
  var finalResult;
  finalResult = '👤User ID: ';
  finalResult += ctx.from.id;
  finalResult += '\n';
  finalResult += '🎫 Account Name: ';
  finalResult += ctx.session.moma;
  finalResult += '\n';
  finalResult += 'License Type: SIGMA';

  return finalResult;
}

async function op(ctx) {
  var finalResult;
  finalResult = 'ANTBT Current Position:';
  finalResult += '\n';
  finalResult += 'EURUSD ';
  finalResult += '🔴19.4';
  finalResult += '\n';
  finalResult += '🟢17.6';
  finalResult += '\n';
  finalResult += '🟢20.7';
  finalResult += '\n';
  finalResult += '\n';
  finalResult += 'JPYUSD';
  finalResult += '🟢9.5';
  finalResult += '\n';
  finalResult += '🔴15.3';

  return finalResult;
}

function makeMessage(ctx) {
  var finalResult;
  finalResult = '👤User ID: ';
  finalResult += ctx.from.id;
  finalResult += '\n';
  finalResult += '🎫 Account Name: ';
  finalResult += ctx.session.moma;
  finalResult += '\n';
  finalResult += 'License Type: SIGMA';

  return finalResult;
}

async function cek(ctx) {
  var finalResult;
  finalResult = 'Your Deposit Balance: <b>$5000</b>';
  finalResult += '\n';
  finalResult += 'Funds in ANTBT Trading Pool: <b>$1200</b>';
  finalResult += '\n';
  finalResult += 'Available Withdrawable Funds: <b>$3800</b>';

  return finalResult;
}

function makeMessage(ctx) {
  var finalResult;
  finalResult = '👤User ID: ';
  finalResult += ctx.from.id;
  finalResult += '\n';
  finalResult += '🎫 Account Name: ';
  finalResult += ctx.session.moma;
  finalResult += '\n';
  finalResult += 'License Type: SIGMA';

  return finalResult;
}

async function earn(ctx) {
  var finalResult;
  finalResult = 'Your Total Trading Profit: <b>$2101</b>';
  finalResult += '\n';
  finalResult += 'Your Current Referrals: ';
  finalResult += ctx.session.count || '0';
  finalResult += '\n';
  finalResult += 'Your Referral Earning: (5% x the total price of the license purchased by referred user)';
  finalResult += '\n';
  finalResult += 'Total Earnings: <b>$2101</b>';

  return finalResult;
}

function makeMessage(ctx) {
  var finalResult;
  finalResult = '👤User ID: ';
  finalResult += ctx.from.id;
  finalResult += '\n';
  finalResult += '🎫 Account Name: ';
  finalResult += ctx.session.moma;
  finalResult += '\n';
  finalResult += '👥 Your Referral link: https://t.me/AI_AntBot?start=';
  finalResult += ctx.session.refNumber;

  return finalResult;
}

async function initMessage(ctx) {
  if (ctx.session.found != '1') {
    ctx.session.eth = 'nil';
    ctx.session.twitter = 'nil';
    ctx.session.moma = 'nil';
    ctx.session.joinTele = '0';
    ctx.session.followed = '0';
  } else {
    //values already set
  }
}

async function stepCheck(ctx) {
  //step check
  if (ctx.session.step == 2) {
    ctx.session.twitter = ctx.message.text;
    ctx.session.step = 3;
    ctx.reply('Please input your ERC-20 Wallet Address');
  }
  else if (ctx.session.step == 3) {
    if (ethereum_address.isAddress(ctx.message.text.toString())) {
      ctx.session.eth = ctx.message.text.toString();
      var keyboard = Markup.inlineKeyboard([Markup.callbackButton('✅Next✅', 'moma')], {
        columns: 1,
      });
      ctx.telegram.sendMessage(
        ctx.from.id,
        'Hit the ✅Next✅ button to process your registration.',
        Extra.HTML().markup(keyboard)
      );}else 
        ctx.reply('Please input a valid ERC-20 wallet address❗️');
      }
    else if (ctx.session.step == 4) {
      ctx.session.moma = ctx.message.text.toString();
      var keyboard = Markup.inlineKeyboard([Markup.callbackButton('✅Submit✅', 'check')], {
        columns: 1,
      });
      ctx.telegram.sendMessage(
        ctx.from.id,
        'Hit the ✅Submit✅ button to submit your registration.',
        Extra.HTML().markup(keyboard)
      );}else {
        var msg = 'Please double-check it one more time. Once you submit this step, you can not go back.';
  msg += '\n';
  msg += '\n';
  msg +=
    'If the TXID is incorrect, the purchase will be assumed INVALID, and you should contact our Telegram representatives.';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('🔥 I’ve double check it. Let’s Go! 🔥', 'thanklicense'),
  Markup.callbackButton('Resubmit', 'tx'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
     }
    }

//bot init
const bot = new Telegraf(config.telegraf_token); // Let's instantiate a bot using our token.
bot.use(session());
// bot.use(Telegraf.log());

bot.start(async (ctx) => {
  //bot start
  //parameter parsing
  ctx.session.refByName = '';
  ctx.session.count = 0;

  findExistingAsync(ctx).then(function (uid) {
    var len = ctx.message.text.length;
    if (ctx.from.username == null) {
      //user must have a valid username set.
      var nousrmsg = 'Please set a username first then contact the bot again!';
      ctx.telegram.sendMessage(ctx.from.id, nousrmsg);
    } else {
      ctx.session.username = ctx.from.username;
      var ref = ctx.message.text.slice(7, len);
      ctx.session.refBy = ref;
      if (ref.length != 0) {
        var refmsg = 'Referred by: ' + ctx.session.refBy;

        ctx.session.refNumber = ctx.from.id.toString();
        ctx.telegram.sendMessage(ctx.from.id, refmsg);
        console.log('refer', ctx.session.refBy);
      } else {
        ctx.session.refNumber = ctx.from.id.toString();
        console.log('session ref number:', ctx.session.refNumber);
      }
      //save referer
      ctx.session.telegram = ctx.message.chat.username;
      ctx.session.language = ctx.message.from.language_code;

      initMessage(ctx);
      var msg = firstMessage(ctx);
      // var msg = makeMessage(ctx);

      ctx.telegram.sendMessage(ctx.from.id, msg, Extra.markup(keyboard));
    }
  });
});

bot.on('message', async (ctx) => {
  //bot listens to any message
  if (ctx.from.username == null) {
    var nousrmsg = 'Please set a username first then contact the bot again!!!!!';
    ctx.telegram.sendMessage(ctx.from.id, ctx.from);
    ctx.telegram.sendMessage(ctx.from.id, nousrmsg);
  } else {
    console.log('sesison found in message:', ctx.session.found);
    ctx.session.refNumber = ctx.from.id.toString();
    if (ctx.session.found != '1') {
      findExistingAsync(ctx).then(function (uid) {
        //wait for promise to complete.
      });
    }
    console.log('ref by name', ctx.session.refByName);
    if (ctx.session.refByName == null) {
      //checks if refbyname exists, speeds up concurrent calls.
      refByNameAsync(ctx).then(function (uid) {
        stepCheck(ctx).then(function (a) {
          // var msg = makeMessage(ctx);
          // ctx.telegram.sendMessage(ctx.from.id, msg, Extra.HTML().markup(keyboard));
        });
      });
    } else {
      stepCheck(ctx).then(function (a) {
        // var msg = makeMessage(ctx);
        // ctx.telegram.sendMessage(ctx.from.id, msg, Extra.HTML().markup(keyboard));
      });
    }
  }
});

bot.telegram.getMe().then((bot_informations) => {
  bot.options.username = bot_informations.username;
  console.log('Server has initialized bot nickname. Nick: ' + bot_informations.username);
});

bot.action('delete', ({ deleteMessage }) => deleteMessage());

bot.action('eth', (ctx) => {
  //button click ETH
  ctx.reply('Please send your wallet address here.');
  ctx.session.step = 3;
});

bot.action('intro', (ctx) => {
  ctx.session.step = 1;
  var msg = '<b>🤖Make sure you are followed our X/Twitter and joined our Telegram group to continuesly using this bot.</b>';
  msg += '\n';
  msg += '\n';
  msg += '✅Follow us on <a href="https://twitter.com/AntBotAi">X</a>';
  msg += '\n';
  msg += '✅Join our <a href="https://t.me/AntBotAi_official">Telegram</a> Group';
  msg += '\n';
  msg += '\n';
  msg += '🌐AntBot.tech';
  var keyboard = Markup.inlineKeyboard([Markup.callbackButton('I have done it!', 'twitter')], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});
//Journey
bot.action('Journey', (ctx) => {
  var msg = '<b>🔥Let’s make money!🔥</b>';
  msg += '\n';
  msg += '\n';
  msg += 'Please select the option';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('My Wallet', 'lock'),
    Markup.callbackButton('My Earnings', 'lock'),
    Markup.callbackButton('Withdrawl', 'lock'),
    Markup.callbackButton('Copy-Trade Influencer', 'influencer'),
    Markup.callbackButton('Copy-Trade ANTBT', 'lock'),
    Markup.callbackButton('More', 'comingsoon'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});
//newJourney
bot.action('newJourney', (ctx) => {
  var msg = '<b>🔥Let’s make money!🔥</b>';
  msg += '\n';
  msg += '\n';
  msg += 'Please select the option';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('My Wallet', 'unlockmw'),
    Markup.callbackButton('My Earnings', 'unlockme'),
    Markup.callbackButton('Withdrawl', 'unlockwd'),
    Markup.callbackButton('Copy-Trade Influencer', 'influencer'),
    Markup.callbackButton('Copy-Trade ANTBT', 'unlockct'),
    Markup.callbackButton('More', 'comingsoon'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});


bot.action('unlockct', (ctx) => {
  var msg = '🔥 Let’s make money! 🔥';
      msg += '\n'
      msg += '\n'
      msg += 'Please select the option'
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('Deposit to ANTBT', 'comingsoon'),
    Markup.callbackButton('My Current ANTBT Balance', 'antbtbalance'),
    Markup.callbackButton('ANTBT Current Open Position', 'antbtop'),
    Markup.callbackButton('Stop ANTBT Copy-Trade', 'stopct'),
    Markup.callbackButton('🔥Back to Home Menu🔥', 'newJourney'),], {
    columns: 2,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});

bot.action('stopct', (ctx) => {
  var msg = 'Are you certain you wish to discontinue the ANTBT Copy-Trade service?';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('Yes, I want to stop', 'stop'),
    Markup.callbackButton('🔥Back To Home Menu🔥', 'newJourney'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});

bot.action('stop', (ctx) => {
  var msg = 'Your funds are currently held within the ANTBT Trading Pool.';
  msg += '\n'
  msg += '\n'  
  msg += 'We will initiate the processing of your ANTBT Copy-Trade once all open positions have been closed.'
  msg += '\n'
  msg += '\n'
  msg += 'Please allow up to a maximum of 7x24 hours to receive your deposited funds and profits in your wallet.'
  msg += '\n'
  msg += '\n'
 msg += 'We appreciate your patience! Thank you!'
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('🔥Back To Home Menu🔥', 'newJourney'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});

bot.action('lock', (ctx) => {
  var msg = 'It appears you do not have an ANTBT License.';
      msg += '\n'
      msg += '\n'
      msg += 'You must possess an ANTBT License to proceed'
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('Get Gamma License ', 'gamma'),
    Markup.callbackButton('Get Delta License ', 'delta'),
    Markup.callbackButton('Get Sigma License ', 'sigma'),
    Markup.callbackButton('Get Alpha License ', 'alpha'),
    Markup.callbackButton('🔥 I will get the License Soon! 🔥', 'Journey'),], {
    columns: 2,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});

//buy alpha
bot.action('alpha', (ctx) => {
  var msg = 'You will purchase Alpha License';
      msg += '\n';
      msg += '\n';
      msg += 'Please send 0.1 ETH to AntBot ERC-20 wallet below';
      msg += '\n';
      msg += '0x6ed5ca050c106df566015ec59c14218941310c7c';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('I have sent 0.1 ETH', 'tx'),
    Markup.callbackButton('🔥Back to Home Menu🔥', 'Journey'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});
//buy Sigma
bot.action('sigma', (ctx) => {
  var msg = 'You will purchase Sigma License';
      msg += '\n';
      msg += '\n';
      msg += 'Please send 0.5 ETH to AntBot ERC-20 wallet below';
      msg += '\n';
      msg += '0x6ed5ca050c106df566015ec59c14218941310c7c';
   var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('I have sent 0.5 ETH', 'tx'),
   Markup.callbackButton('🔥Back to Home Menu🔥', 'Journey'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});
//buy delta
bot.action('delta', (ctx) => {
  var msg = 'You will purchase Delta License';
      msg += '\n';
      msg += '\n';
      msg += 'Please send 0.3 ETH to AntBot ERC-20 wallet below';
      msg += '\n';
      msg += '0x6ed5ca050c106df566015ec59c14218941310c7c';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('I have sent 0.3 ETH', 'tx'),
  Markup.callbackButton('🔥Back to Home Menu🔥', 'Journey'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});
//buy gamma
bot.action('gamma', (ctx) => {
  var msg = 'You will purchase Sigma License';
      msg += '\n';
      msg += '\n';
      msg += 'Please send 0.25 ETH to AntBot ERC-20 wallet below';
      msg += '\n';
      msg += '0x6ed5ca050c106df566015ec59c14218941310c7c';
   var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('I have sent 0.25 ETH', 'tx'),
   Markup.callbackButton('🔥Back to Home Menu🔥', 'Journey'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});
//deposit bnb 0.1
bot.action('bnb01', (ctx) => {
  var msg = 'Please send 0.1 BNB to the address below via the wallet you used to register here';
      msg += '\n';
      msg += '\n';
      msg += '0x6ed5ca050c106df566015ec59c14218941310c7c';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('✅Confirm', 'tx'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});
//deposit bnb 0.2
bot.action('bnb02', (ctx) => {
  var msg = 'Please send 0.2 BNB to the address below via the wallet you used to register here';
      msg += '\n';
      msg += '\n';
      msg += '0x6ed5ca050c106df566015ec59c14218941310c7c';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('✅Confirm', 'tx'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});
//deposit bnb 0.5
bot.action('bnb05', (ctx) => {
  var msg = 'Please send 0.5 BNB to the address below via the wallet you used to register here';
      msg += '\n';
      msg += '\n';
      msg += '0x6ed5ca050c106df566015ec59c14218941310c7c';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('✅Confirm', 'tx'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});
//deposit bnb 1
bot.action('bnb1', (ctx) => {
  var msg = 'Please send 1 BNB to the address below via the wallet you used to register here';
      msg += '\n';
      msg += '\n';
      msg += '0x6ed5ca050c106df566015ec59c14218941310c7c';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('✅Confirm', 'tx'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});
//deposit bnb 2
bot.action('bnb2', (ctx) => {
  var msg = 'Please send 2 BNB to the address below via the wallet you used to register here';
      msg += '\n';
      msg += '\n';
      msg += '0x6ed5ca050c106df566015ec59c14218941310c7c';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('✅Confirm', 'tx'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});
//deposit bnb 5
bot.action('bnb5', (ctx) => {
  var msg = 'Please send 5 BNB to the address below via the wallet you used to register here';
      msg += '\n';
      msg += '\n';
      msg += '0x6ed5ca050c106df566015ec59c14218941310c7c';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('✅Confirm', 'tx'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});
//deposit bnb 10
bot.action('bnb10', (ctx) => {
  var msg = 'Please send 10 BNB to the address below via the wallet you used to register here';
      msg += '\n';
      msg += '\n';
      msg += '0x6ed5ca050c106df566015ec59c14218941310c7c';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('✅Confirm', 'tx'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});
//deposit ether 0.05
bot.action('ether005', (ctx) => {
  var msg = 'Please send 0.05 ETH to the address below via the wallet you used to register here';
      msg += '\n';
      msg += '\n';
      msg += '0x6ed5ca050c106df566015ec59c14218941310c7c';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('✅Confirm', 'tx'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});
//deposit ether 0.1
bot.action('ether01', (ctx) => {
  var msg = 'You will purchase Alpha License';
      msg += '\n';
      msg += '\n';
      msg += 'Please send 0.1ETH to AntBot ERC-20 wallet below';
      msg += '0x6ed5ca050c106df566015ec59c14218941310c7c';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('I have sent 0.1 ETH', 'tx'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});
//deposit ether 0.2
bot.action('ether02', (ctx) => {
  var msg = 'Please send 0.2 ETH to the address below via the wallet you used to register here';
      msg += '\n';
      msg += '\n';
      msg += '0x6ed5ca050c106df566015ec59c14218941310c7c';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('✅Confirm', 'tx'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});
//deposit ether 0.5
bot.action('ether05', (ctx) => {
  var msg = 'You will purchase Sigma License';
      msg += '\n';
      msg += '\n';
      msg += 'Please send 0.5ETH to AntBot ERC-20 wallet below';
      msg += '\n';
      msg += '0x6ed5ca050c106df566015ec59c14218941310c7c';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('✅Confirm', 'tx'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});
//deposit ether 1
bot.action('ether1', (ctx) => {
  var msg = 'Please send 1 ETH to the address below via the wallet you used to register here';
      msg += '\n';
      msg += '\n';
      msg += '0x6ed5ca050c106df566015ec59c14218941310c7c';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('✅Confirm', 'tx'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});
//deposit ether 2
bot.action('ether2', (ctx) => {
  var msg = 'Please send 2 ETH to the address below via the wallet you used to register here';
      msg += '\n';
      msg += '\n';
      msg += '0x6ed5ca050c106df566015ec59c14218941310c7c';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('✅Confirm', 'tx'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});
//deposit ether 5
bot.action('ether5', (ctx) => {
  var msg = 'Please send 5 ETH to the address below via the wallet you used to register here';
      msg += '\n';
      msg += '\n';
      msg += '0x6ed5ca050c106df566015ec59c14218941310c7c';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('✅Confirm', 'tx'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});
//deposit ether 10
bot.action('ether10', (ctx) => {
  var msg = 'Please send 10 ETH to the address below via the wallet you used to register here';
      msg += '\n';
      msg += '\n';
      msg += '0x6ed5ca050c106df566015ec59c14218941310c7c';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('✅Confirm', 'tx'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});
//deposit 50
bot.action('deposit50', (ctx) => {
  var msg = 'Please send 50 USDT to the address below via the wallet you used to register here';
      msg += '\n';
      msg += '\n';
      msg += '0x6ed5ca050c106df566015ec59c14218941310c7c';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('✅Confirm', 'tx'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});

//deposit 100 
bot.action('deposit100', (ctx) => {
  var msg = 'Please send 100 USDT to the address below via the wallet you used to register here';
      msg += '\n';
      msg += '\n';
      msg += '0x6ed5ca050c106df566015ec59c14218941310c7c';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('✅Confirm', 'tx'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});
//deposit 150
bot.action('deposit150', (ctx) => {
  var msg = 'Please send 150 USDT to the address below via the wallet you used to register here';
      msg += '\n';
      msg += '\n';
      msg += '0x6ed5ca050c106df566015ec59c14218941310c7c';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('✅Confirm', 'tx'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});
//deposit 200
bot.action('deposit200', (ctx) => {
  var msg = 'Please send 200 USDT to the address below via the wallet you used to register here';
      msg += '\n';
      msg += '\n';
      msg += '0x6ed5ca050c106df566015ec59c14218941310c7c';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('✅Confirm', 'tx'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});
//deposit 500
bot.action('deposit500', (ctx) => {
  var msg = 'Please send 500 USDT to the address below via the wallet you used to register here';
      msg += '\n';
      msg += '\n';
      msg += '0x6ed5ca050c106df566015ec59c14218941310c7c';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('✅Confirm', 'tx'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});
//deposit 1000
bot.action('deposit1000', (ctx) => {
  var msg = 'Please send 1000 USDT to the address below via the wallet you used to register here';
      msg += '\n';
      msg += '\n';
      msg += '0x6ed5ca050c106df566015ec59c14218941310c7c';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('✅Confirm', 'tx'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});
//deposit 2000
bot.action('deposit2000', (ctx) => {
  var msg = 'Please send 2000 USDT to the address below via the wallet you used to register here';
      msg += '\n';
      msg += '\n';
      msg += '0x6ed5ca050c106df566015ec59c14218941310c7c';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('✅Confirm', 'tx'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});
//deposit 5000
bot.action('deposit5000', (ctx) => {
  var msg = 'Please send 5000 USDT to the address below via the wallet you used to register here';
      msg += '\n';
      msg += '\n';
      msg += '0x6ed5ca050c106df566015ec59c14218941310c7c';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('✅Confirm', 'tx'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});

//tx check
bot.action('tx', (ctx) => {
  //button click confirm tx
  ctx.reply('Please Submit your TXID');
});

bot.action('thanklicense', (ctx) => {
   var msg = 'Thank you for purchasing Our License.';
      msg += '\n'
      msg += '\n'
      msg += 'Please wait for our team to verify, which typically takes a maximum of 3x24 hours.'
      msg += '\n'
      msg += 'You will receive a notification once the verification is complete.'
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('🔥 Back to Home Menu 🔥', 'newJourney'),], {
    columns: 1,
    });
    ctx.reply(msg, Extra.HTML().markup(keyboard));
  });

//cexlist
bot.action('cexlist', (ctx) => {
  var msg = 'Select the CEX you want to get started';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('BINANCE', 'comingsoon'),
    Markup.callbackButton('OKX', 'comingsoon'),
    Markup.callbackButton('MEXC', 'comingsoon'),
    Markup.callbackButton('BYBIT', 'comingsoon'),
    Markup.callbackButton('KUCOIN', 'comingsoon'),
    Markup.callbackButton('BITGET', 'comingsoon'),
    Markup.callbackButton('BITMART', 'comingsoon'),
    Markup.callbackButton('GATE.IO', 'comingsoon'),
    Markup.callbackButton('DERIBIT', 'comingsoon'),
    Markup.callbackButton('KRAKEN', 'comingsoon'),
    Markup.callbackButton('BITMART', 'comingsoon'),
    Markup.callbackButton('BITFINEX', 'comingsoon'),
    Markup.callbackButton('HUOBI', 'comingsoon'),
    Markup.callbackButton('BITMEX', 'comingsoon'),
    Markup.callbackButton('More', 'comingsoon'),], {
    columns: 2,
    });
    ctx.reply(msg, Extra.HTML().markup(keyboard));
  });

  //dexlist
bot.action('influencer', (ctx) => {
  var msg = '👇Choose the influencer you wish to copy-trade in order to begin.👇';
      msg += '\n'
      msg += '✅ Available Copy Trade'
      msg += '\n'
      msg += '❌ Unavailable Copy Trade'
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('Nebula✅', 'nebula'),
    Markup.callbackButton('Nebula✅', 'nebula'),
    Markup.callbackButton('Nebula✅', 'nebula'),
    Markup.callbackButton('Nebula✅', 'nebula'),
    Markup.callbackButton('Nebula❌', 'unavailable'),
    Markup.callbackButton('Nebula❌', 'unavailable'),
    Markup.callbackButton('Nebula❌', 'unavailable'),
    Markup.callbackButton('Nebula❌', 'unavailable'),
    Markup.callbackButton('🔥Back to Home Menu🔥', 'Journey'), ], {
    columns: 2,
    });
    ctx.reply(msg, Extra.HTML().markup(keyboard));
  });

bot.action('nebula', (ctx) => {
  var msg = '🔥Here are upto date data from Nebula🔥';
      msg += '\n';
      msg += '\n';
      msg += '<b>TF: 5 MINUTES</b>';
      msg += '\n';
      msg += '📊CRYPTO IDX';
      msg += '\n';
      msg += '08.00	BUY🟢';
      msg += '\n';
      msg += '09.00	BUY🟢';
      msg += '\n';
      msg += '10.00	SELL🔴';
      msg += '\n';
      msg += '11.00	BUY🟢';
      msg += '\n';
      msg += '12.00	BUY🟢';
      msg += '\n';
      msg += '\n';
      msg += '<b>TF: 5 MINUTES</b>';
      msg += '\n';
      msg += '📊EUR USD';
      msg += '\n';
      msg += '08.00 SELL🔴';
      msg += '\n';
      msg += '09.00 BUY🟢';
      msg += '\n';
      msg += '10.00 SELL🔴';
      msg += '\n';
      msg += '11.00 BUY🟢';
      msg += '\n';
      msg += '12.00 BUY🟢';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('🔥Back to Home Menu🔥', 'Journey'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});


  bot.action('unavailable', (ctx) => {
    var msg = '<b>This Influencers is currently UNAVAILABLE!</b>';
        msg += '\n'
        msg += '\n'
        msg += 'Please select the available Influencers✅'
    var keyboard = Markup.inlineKeyboard([ Markup.callbackButton('🔥Back to Home Menu🔥', 'Journey'),], {
      columns: 1,
    });
    ctx.reply(msg, Extra.HTML().markup(keyboard));
  });

  bot.action('comingsoon', (ctx) => {
    var msg = '<b>Stay Tune with Us!</b>';
        msg += '\n'
        msg += '\n'
        msg += 'More Features are Coming Soon!';
        msg += '\n'
        msg += '\n'
        msg += 'Follow our socials to get our latest update.';
        msg += '\n'
        msg += '<a href="https://antbot.tech">Website</a>';
        msg += '\n'
        msg += '<a href="https://x.com/AntBotAi">Twitter</a>';
        msg += '\n'
        msg += '<a href="https://t.me/AntBotAI_Official">Telegram Group</a>';
        msg += '\n'
        msg += '<a href="https://t.me/AntBotAI_Ann">Telegram Announcement</a>'
    var keyboard = Markup.inlineKeyboard([ Markup.callbackButton('🔥Back to Home Menu🔥', 'Journey'),], {
      columns: 1,
    });
    ctx.reply(msg, Extra.HTML().markup(keyboard));
  });

  bot.action('wd', (ctx) => {
    var msg = '<b>To withdraw the entire balance in your account, please fill in the form on our website!!!</b>';
        msg += '\n'
        msg += '\n'
        msg += '<a href="https://AntBot.tech">Website</a>'
        msg += '\n'
        msg += '\n'
        msg += '<i>ⓒ 2023 AntBot, Tech.</i>'
    var keyboard = Markup.inlineKeyboard([ Markup.callbackButton('🔥Back To Journey🔥', 'Journey'),], {
      columns: 1,
    });
    ctx.reply(msg, Extra.HTML().markup(keyboard));
  });

  bot.action('profit', (ctx) => {
    var msg = '<b>We distribute all profits every week, but if you want to withdraw profits earlier, please submit via the form we provide on our website!</b>';
        msg += '\n'
        msg += '\n'
        msg += '<a href="https://Antbot.tech">Website</a>'
        msg += '\n'
        msg += '\n'
        msg += '<i>ⓒ 2023 AntBot, Tech.</i>'
    var keyboard = Markup.inlineKeyboard([ Markup.callbackButton('🔥Back To Journey🔥', 'Journey'),], {
      columns: 1,
    });
    ctx.reply(msg, Extra.HTML().markup(keyboard));
  });

bot.action('twitter', (ctx) => {
  //button click twitter
  ctx.session.step = 2;
  ctx.reply('📧Please type your Email Address');
});

bot.action('moma', (ctx) => {
  ctx.session.step = 4;
  ctx.reply('🤷‍♀️ What should I call you? Please input your name');
});

bot.action('refresh', (ctx) => {
  //button click refresh data
  var msg = makeMessage(ctx);
  refByNameAsync(ctx).then(function (uid) {
    findExistingAsync(ctx).then(function (uid) {
      ctx.telegram.sendMessage(ctx.from.id, msg, Extra.HTML().markup(keyboard));
      ctx.reply('Data has been refreshed!');
    });
  });
});

bot.action('check', async (ctx) => {
  try {
    let user = await ctx.getChatMember(ctx.from.id, '');
    if (user && !user.is_bot) {
      ctx.session.joinTele = '1';
    }
  } catch (e) {
    console.log(e);
  }
  var msg = await check(ctx);
  var info = makeMessage(ctx);
  var keyboard = Markup.inlineKeyboard([Markup.callbackButton('🔥Confirm🔥', 'confirm')], {
    columns: 1,
  });
  ctx.telegram.sendMessage(ctx.from.id, info + '\n \n' + msg, Extra.HTML().markup(keyboard));
});

bot.action('unlockmw', async (ctx) => {
  try {
    let user = await ctx.getChatMember(ctx.from.id, '');
    if (user && !user.is_bot) {
      ctx.session.joinTele = '1';
    }
  } catch (e) {
    console.log(e);
  }
  var msg = await cek(ctx);
  var info = makeMessage(ctx);
  var keyboard = Markup.inlineKeyboard([Markup.callbackButton('🔥Back to Home Menu🔥', 'newJourney')], {
    columns: 1,
  });
  ctx.telegram.sendMessage(ctx.from.id, info + '\n \n' + msg, Extra.HTML().markup(keyboard));
});

bot.action('unlockme', async (ctx) => {
  try {
    let user = await ctx.getChatMember(ctx.from.id, '');
    if (user && !user.is_bot) {
      ctx.session.joinTele = '1';
    }
  } catch (e) {
    console.log(e);
  }
  var msg = await earn(ctx);
  var info = makeMessage(ctx);
  var keyboard = Markup.inlineKeyboard([Markup.callbackButton('🔥Back to Home Menu🔥', 'newJourney')], {
    columns: 1,
  });
  ctx.telegram.sendMessage(ctx.from.id, info + '\n \n' + msg, Extra.HTML().markup(keyboard));
});

bot.action('antbtbalance', async (ctx) => {
  try {
    let user = await ctx.getChatMember(ctx.from.id, '');
    if (user && !user.is_bot) {
      ctx.session.joinTele = '1';
    }
  } catch (e) {
    console.log(e);
  }
  var msg = await balance(ctx);
  var info = makeMessage(ctx);
  var keyboard = Markup.inlineKeyboard([Markup.callbackButton('🔥Back to Home Menu🔥', 'newJourney')], {
    columns: 1,
  });
  ctx.telegram.sendMessage(ctx.from.id, info + '\n \n' + msg, Extra.HTML().markup(keyboard));
});

bot.action('antbtop', async (ctx) => {
  try {
    let user = await ctx.getChatMember(ctx.from.id, '');
    if (user && !user.is_bot) {
      ctx.session.joinTele = '1';
    }
  } catch (e) {
    console.log(e);
  }
  var msg = await op(ctx);
  var info = makeMessage(ctx);
  var keyboard = Markup.inlineKeyboard([Markup.callbackButton('🔥Back to Home Menu🔥', 'newJourney')], {
    columns: 1,
  });
  ctx.telegram.sendMessage(ctx.from.id, info + '\n \n' + msg, Extra.HTML().markup(keyboard));
});


bot.action('confirm', (ctx) => {
  //button click confirm
  checkDataAsync(ctx).then(function (uid) {
    var check = uid;
    console.log('CHECK', check);
    // refByNameAsync(ctx).then(function (uid) {
    //   if (check == true) {
    saveDataAsync(ctx).then(function (uid) {
      var msg;
      var msg = '<b>Congratulation! ✅Registration Succeeded✅</b>';
        msg += '\n'
        msg += '\n'
    var keyboard = Markup.inlineKeyboard([ Markup.callbackButton('🔥Awesome!🔥', 'Journey'),], {
      columns: 1,
    });
    ctx.reply(msg, Extra.HTML().markup(keyboard));
  });
    // } else {
    //   ctx.reply('Please input all data');
    // }
    // });
  });
});
bot.use(rateLimit(buttonsLimit));
bot.startPolling(); //MUST HAVE
