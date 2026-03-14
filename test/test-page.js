var login = require('../index.js');
var fs = require('fs');
var assert = require('assert');

var conf = JSON.parse(process.env.testconfig || fs.readFileSync('test/test-config.json', 'utf8'));
var credentials = {
  email: conf.user.email,
  password: conf.user.password,
};

var userIDs = conf.userIDs;

var options = {
  selfListen: true,
  listenEvents: true,
  logLevel: "silent",
  pageID: conf.pageID
};
var getType = require('../utils').getType;

var userID = conf.user.id;

var groupChatID;
var groupChatName;

function checkErr(done){
  return function(err) {
    if (err) {
      console.error('fca-azadx69x', 'Error:', err);
      done(err);
    }
  };
}

// describe('Login As Page:', function() {
//   var api = null;
//   process.on('SIGINT', () => api && !api.logout() && console.log("fca-azadx69x", "Logged out :)"));
//   var tests = [];
//   var stopListening;
//   this.timeout(20000);

//   function listen(done, matcher) {
//     tests.push({matcher:matcher, done:done});
//   }

//   before(function(done) {
//     console.log('fca-azadx69x', 'Starting page login test...');
//     login(credentials, options, function (err, localAPI) {
//       if(err) {
//         console.error('fca-azadx69x', 'Login failed:', err);
//         return done(err);
//       }

//       assert(localAPI);
//       api = localAPI;
//       console.log('fca-azadx69x', 'Page API initialized successfully');
      
//       stopListening = api.listen(function (err, msg) {
//         if (err) {
//           console.error('fca-azadx69x', 'Listen error:', err);
//           throw err;
//         }
//         // Removes matching function and calls corresponding done
//         tests = tests.filter(function(test) {
//           return !(test.matcher(msg) && (test.done() || true));
//         });
//       });

//       done();
//     });
//   });

//   it('should login without error', function (){
//     console.log('fca-azadx69x', 'Login test passed');
//     assert(api);
//   });

//   it('should get the right user ID', function (){
//     var currentUserID = api.getCurrentUserID();
//     console.log('fca-azadx69x', 'Current user ID:', currentUserID);
//     assert(userID == currentUserID);
//   });

//   it('should send text message object (user)', function (done){
//     var body = "text-msg-obj-" + Date.now();
//     console.log('fca-azadx69x', 'Sending text message:', body);
//     listen(done, msg =>
//       msg.type === 'message' &&
//       msg.body === body &&
//       msg.isGroup === false
//     );
//     api.sendMessage({body: body}, userID, checkErr(done));
//   });

//   it('should send sticker message object (user)', function (done){
//     var stickerID = '767334526626290';
//     console.log('fca-azadx69x', 'Sending sticker:', stickerID);
//     listen(done, msg =>
//       msg.type === 'message' &&
//       msg.attachments.length > 0 &&
//       msg.attachments[0].type === 'sticker' &&
//       msg.attachments[0].stickerID === stickerID &&
//       msg.isGroup === false
//     );
//     api.sendMessage({sticker: stickerID}, userID, checkErr(done));
//   });

//   it('should send basic string (user)', function (done){
//     var body = "basic-str-" + Date.now();
//     console.log('fca-azadx69x', 'Sending basic string:', body);
//     listen(done, msg =>
//       msg.type === 'message' &&
//       msg.body === body &&
//       msg.isGroup === false
//     );
//     api.sendMessage(body, userID, checkErr(done));
//   });

//   it('should send typing indicator', function (done) {
//     console.log('fca-azadx69x', 'Sending typing indicator');
//     var stopType = api.sendTypingIndicator(userID, function(err) {
//       checkErr(done)(err);
//       stopType();
//       console.log('fca-azadx69x', 'Typing indicator sent');
//       done();
//     });
//   });

//   it('should get the right user info', function (done) {
//     console.log('fca-azadx69x', 'Getting user info:', userID);
//     api.getUserInfo(userID, function(err, data) {
//       checkErr(done)(err);
//       var user = data[userID];
//       assert(user.name);
//       assert(user.firstName);
//       assert(user.vanity !== null);
//       assert(user.profileUrl);
//       assert(user.gender);
//       assert(user.type);
//       assert(!user.isFriend);
//       console.log('fca-azadx69x', 'User info retrieved:', user.name);
//       done();
//     });
//   });

//   it('should get the list of friends', function (done) {
//     console.log('fca-azadx69x', 'Getting friends list');
//     api.getFriendsList(function(err, data) {
//       checkErr(done)(err);
//       assert(getType(data) === "Array");
//       data.map(function(v) {parseInt(v);});
//       console.log('fca-azadx69x', 'Friends list retrieved, count:', data.length);
//       done();
//     });
//   });

//   it('should log out', function (done) {
//     console.log('fca-azadx69x', 'Logging out...');
//     api.logout(function(err) {
//       if (err) {
//         console.error('fca-azadx69x', 'Logout failed:', err);
//         done(err);
//       } else {
//         console.log('fca-azadx69x', 'Logout successful');
//         done();
//       }
//     });
//   });

//   after(function (){
//     console.log('fca-azadx69x', 'Tests completed, cleaning up');
//     if (stopListening) stopListening();
//   });
// });
