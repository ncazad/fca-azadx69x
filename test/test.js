var login = require('../index.js');
var fs = require('fs');
var assert = require('assert');

var conf = JSON.parse(process.env.testconfig || fs.readFileSync('test/test-config.json', 'utf8')); 
console.debug('fca-azadx69x', {conf});
var appState = fs.existsSync('test/appstate.json') ? JSON.parse(fs.readFileSync('test/appstate.json', 'utf8')) : null;
var credentials = appState ? {appState } : {
  email: conf.user.email,
  password: conf.user.password,
};

var userIDs = conf.userIDs;

var options = { selfListen: true, listenEvents: true, logLevel: "silent"};
var pageOptions = {logLevel: 'silent', pageID: conf.pageID};
var getType = require('../utils').getType;
var formatDeltaMessage = require('../utils').formatDeltaMessage;
var shareAttachmentFixture = require('./data/shareAttach');

var userID = conf.user.id;

var groupChatID;
var groupChatName;

function checkErr(done){
  return function(err) {
    if (err) done(err);
  };
}

describe('Login:', function() {
  var api = null;
  process.on('SIGINT', () => api && !api.logout() && console.log("fca-azadx69x", "Logged out :)"));
  var tests = [];
  var stopListening;
  this.timeout(20000);

  function listen(done, matcher) {
    tests.push({matcher:matcher, done:done});
  }

  before(function(done) {
    console.debug('fca-azadx69x', {credentials});
    login(credentials, options, function (err, localAPI) {
      if(err) {
        console.error('fca-azadx69x', 'Login failed:', err);
        return done(err);
      }

      assert(localAPI);
      api = localAPI;
      console.log('fca-azadx69x', 'API initialized successfully');
      
      stopListening = api.listen(function (err, msg) {
        if (err) {
          console.error('fca-azadx69x', 'Listen error:', err);
          throw err;
        }
        if (msg.type === "message") {
          assert(msg.senderID && !isNaN(msg.senderID));
          assert(msg.threadID && !isNaN(msg.threadID));
          assert(msg.timestamp && !isNaN(msg.timestamp));
          assert(msg.messageID != null && msg.messageID.length > 0);
          assert(msg.body != null || msg.attachments.length > 0);
        }
        // Removes matching function and calls corresponding done
        tests = tests.filter(function(test) {
          return !(test.matcher(msg) && (test.done() || true));
        });
      });

      done();
    });
  });

  it('should login without error', function (){
    console.log('fca-azadx69x', 'Login test passed');
    assert(api);
  });

  it('should get the current user ID', function (){
    var currentUserID = api.getCurrentUserID();
    console.log('fca-azadx69x', 'Current user ID:', currentUserID);
    assert(userID === currentUserID);
  });

  it('should send text message object (user)', function (done){
    var body = "text-msg-obj-" + Date.now();
    console.log('fca-azadx69x', 'Sending text message:', body);
    listen(done, msg =>
      msg.type === 'message' &&
      msg.body === body &&
      msg.isGroup === false
    );
    api.sendMessage({body: body}, userID, checkErr(done));
  });

  it('should send sticker message object (user)', function (done){
    var stickerID = '767334526626290';
    console.log('fca-azadx69x', 'Sending sticker:', stickerID);
    listen(done, msg =>
      msg.type === 'message' &&
      msg.attachments.length > 0 &&
      msg.attachments[0].type === 'sticker' &&
      msg.attachments[0].stickerID === stickerID &&
      msg.isGroup === false
    );
    api.sendMessage({sticker: stickerID}, userID, checkErr(done));
  });

  it('should send basic string (user)', function (done){
    var body = "basic-str-" + Date.now();
    console.log('fca-azadx69x', 'Sending basic string:', body);
    listen(done, msg =>
      msg.type === 'message' &&
      msg.body === body &&
      msg.isGroup === false
    );
    api.sendMessage(body, userID, checkErr(done));
  });

  it('should get thread info (user)', function (done){
      console.log('fca-azadx69x', 'Getting thread info for user:', userID);
      api.getThreadInfo(userID, (err, info) => {
        if (err) {
          console.error('fca-azadx69x', 'Get thread info failed:', err);
          done(err);
        }

        assert(info.participantIDs != null && info.participantIDs.length > 0);
        assert(!info.participantIDs.some(isNaN));
        assert(!info.participantIDs.some(v => v.length == 0));
        assert(info.name != null);
        assert(info.messageCount != null && !isNaN(info.messageCount));
        assert(info.hasOwnProperty('emoji'));
        assert(info.hasOwnProperty('nicknames'));
        assert(info.hasOwnProperty('color'));
        console.log('fca-azadx69x', 'Thread info retrieved successfully');
        done();
      });
  });


  it('should get the history of the chat (user)', function (done) {
    console.log('fca-azadx69x', 'Getting thread history for user');
    api.getThreadHistory(userID, 5, null, function(err, data) {
      checkErr(done)(err);
      assert(getType(data) === "Array");
      assert(data.every(function(v) {return getType(v) == "Object";}));
      console.log('fca-azadx69x', 'Thread history retrieved, count:', data.length);
      done();
    });
  });
  
  it('should get the history of the chat (user) (graphql)', function (done) {
    console.log('fca-azadx69x', 'Getting thread history (GraphQL) for user');
    api.getThreadHistoryGraphQL(userID, 5, null, function(err, data) {
      checkErr(done)(err);
      assert(getType(data) === "Array");
      assert(data.every(function(v) {return getType(v) == "Object";}));
      console.log('fca-azadx69x', 'Thread history (GraphQL) retrieved, count:', data.length);
      done();
    });
  });

  it('should create a chat', function (done){
    var body = "new-chat-" + Date.now();
    var inc = 0;
    console.log('fca-azadx69x', 'Creating new chat with body:', body);

    function doneHack(){
      if (inc === 1) {
        console.log('fca-azadx69x', 'Chat created successfully, ID:', groupChatID);
        return done();
      }
      inc++;
    }

    listen(doneHack, msg =>
      msg.type === 'message' && msg.body === body
    );
    api.sendMessage(body, userIDs, function(err, info){
      checkErr(done)(err);
      groupChatID = info.threadID;
      doneHack();
    });
  });

  it('should send text message object (group)', function (done){
    var body = "text-msg-obj-" + Date.now();
    console.log('fca-azadx69x', 'Sending text to group:', groupChatID);
    listen(done, msg =>
      msg.type === 'message' &&
      msg.body === body &&
      msg.isGroup === true
    );
    api.sendMessage({body: body}, groupChatID, function(err, info){
      checkErr(done)(err);
      assert(groupChatID === info.threadID);
    });
  });

  it('should send basic string (group)', function (done){
    var body = "basic-str-" + Date.now();
    console.log('fca-azadx69x', 'Sending basic string to group:', groupChatID);
    listen(done, msg =>
      msg.type === 'message' &&
      msg.body === body &&
      msg.isGroup === true
    );
    api.sendMessage(body, groupChatID, function(err, info) {
      checkErr(done)(err);
      assert(groupChatID === info.threadID);
    });
  });

  it('should send sticker message object (group)', function (done){
    var stickerID = '767334526626290';
    console.log('fca-azadx69x', 'Sending sticker to group:', stickerID);
    listen(done, function (msg) {
      return msg.type === 'message' &&
        msg.attachments.length > 0 &&
        msg.attachments[0].type === 'sticker' &&
        msg.attachments[0].stickerID === stickerID;
    });
    api.sendMessage({sticker: stickerID}, groupChatID, function (err, info) {
      assert(groupChatID === info.threadID);
      checkErr(done)(err);
    });
  });

  it('should send an attachment with a body (group)', function (done){
    var body = "attach-" + Date.now();
    var attach = [];
    attach.push(fs.createReadStream("test/data/test.txt"));
    attach.push(fs.createReadStream("test/data/test.png"));
    console.log('fca-azadx69x', 'Sending attachment to group:', body);
    listen(done, function (msg) {
      return msg.type === 'message' && msg.body === body;
    });
    api.sendMessage({attachment: attach, body: body}, groupChatID, function(err, info){
      checkErr(done)(err);
      assert(groupChatID === info.threadID);
    });
  });

  it('should get the history of the chat (group)', function (done) {
    console.log('fca-azadx69x', 'Getting group thread history');
    api.getThreadHistory(groupChatID, 5, null, function(err, data) {
      checkErr(done)(err);
      assert(getType(data) === "Array");
      assert(data.every(function(v) {return getType(v) == "Object";}));
      console.log('fca-azadx69x', 'Group history retrieved, count:', data.length);
      done();
    });
  });
  
  it('should get the history of the chat (group) (graphql)', function (done) {
    console.log('fca-azadx69x', 'Getting group thread history (GraphQL)');
    api.getThreadHistoryGraphQL(groupChatID, 5, null, function(err, data) {
      checkErr(done)(err);
      assert(getType(data) === "Array");
      assert(data.every(function(v) {return getType(v) == "Object";}));
      console.log('fca-azadx69x', 'Group history (GraphQL) retrieved, count:', data.length);
      done();
    });
  });


  it('should change chat title', function (done){
    var title = 'test-chat-title-' + Date.now();
    console.log('fca-azadx69x', 'Changing chat title to:', title);
    listen(done, function (msg) {
      return msg.type === 'event' &&
        msg.logMessageType === 'log:thread-name' &&
        msg.logMessageData.name === title;
    });
    groupChatName = title;
    api.setTitle(title, groupChatID, checkErr(done));
  });

  it('should kick user', function (done) {
    var id = userIDs[0];
    console.log('fca-azadx69x', 'Kicking user:', id);
    listen(done, function (msg) {
      return msg.type === 'event' &&
        msg.logMessageType === 'log:unsubscribe' &&
        msg.logMessageData.leftParticipantFbId === id;
    });
    api.removeUserFromGroup(id, groupChatID, checkErr(done));
  });

  it('should add user', function (done) {
    var id = userIDs[0];
    console.log('fca-azadx69x', 'Adding user:', id);
    listen(done, function (msg) {
      return (msg.type === 'event' &&
        msg.logMessageType === 'log:subscribe' &&
        msg.logMessageData.addedParticipants.length > 0 &&
        msg.logMessageData.addedParticipants[0].userFbId === id);
    });
    // TODO: we don't check for errors inside this because FB changed and
    // returns an error, even though we receive the event that the user was
    // added
    api.addUserToGroup(id, groupChatID, function() {});
  });

  xit('should get thread info (group)', function (done){
      console.log('fca-azadx69x', 'Getting group thread info');
      api.getThreadInfo(groupChatID, (err, info) => {
        if (err) done(err);

        assert(info.participantIDs != null && info.participantIDs.length > 0);
        assert(!info.participantIDs.some(isNaN));
        assert(!info.participantIDs.some(v => v.length == 0));
        assert(info.name != null);
        assert(info.messageCount != null && !isNaN(info.messageCount));
        assert(info.hasOwnProperty('emoji'));
        assert(info.hasOwnProperty('nicknames'));
        assert(info.hasOwnProperty('color'));
        console.log('fca-azadx69x', 'Group thread info retrieved');
        done();
      });
  });

  it('should retrieve a list of threads', function (done) {
    console.log('fca-azadx69x', 'Retrieving thread list');
    api.getThreadList(0, 20, function(err, res) {
      checkErr(done)(err);

      // This checks to see if the group chat we just made
      // is in the list... it should be.
      assert(res.some(function (v) {
        return (
          v.threadID === groupChatID &&
          userIDs.every(function (val) {
            return v.participants.indexOf(val) > -1;
          }) &&
          v.name === groupChatName
        );
      }));
      console.log('fca-azadx69x', 'Thread list retrieved, found our chat:', groupChatName);
      done();
    });
  });

  it('should mark as read', function (done){
    console.log('fca-azadx69x', 'Marking as read:', groupChatID);
    api.markAsRead(groupChatID, done);
  });

  it('should send typing indicator', function (done) {
    console.log('fca-azadx69x', 'Sending typing indicator');
    var stopType = api.sendTypingIndicator(groupChatID, function(err) {
      checkErr(done)(err);
      stopType();
      console.log('fca-azadx69x', 'Typing indicator sent');
      done();
    });
  });


  it('should get the right user info', function (done) {
    console.log('fca-azadx69x', 'Getting user info:', userID);
    api.getUserInfo(userID, function(err, data) {
      checkErr(done)(err);
      var user = data[userID];
      assert(user.name);
      assert(user.firstName);
      assert(user.vanity !== null);
      assert(user.profileUrl);
      assert(user.gender);
      assert(user.type);
      assert(!user.isFriend);
      console.log('fca-azadx69x', 'User info retrieved:', user.name);
      done();
    });
  });

  it('should get the user ID', function(done) {
    console.log('fca-azadx69x', 'Getting user ID for:', userIDs[0]);
    api.getUserInfo(userIDs[0], function(err, data) {
      checkErr(done)(err);
      var user = data[userIDs[0]];
      api.getUserID(user.name, function(err, data) {
        checkErr(done)(err);
        assert(getType(data) === "Array");
        assert(data.some(function(val) {
          return val.userID === userIDs[0];
        }));
        console.log('fca-azadx69x', 'User ID retrieved successfully');
        done();
      });
    });
  });

  it('should get the list of friends', function (done) {
    console.log('fca-azadx69x', 'Getting friends list');
    api.getFriendsList(function(err, data) {
      try {
      checkErr(done)(err);
      assert(getType(data) === "Array");
      data.map(v => {
        assert(getType(v.firstName) === "String");
        assert(getType(v.gender) === "String");
        assert(getType(v.userID) === "String");
        assert(getType(v.isFriend) === "Boolean");
        assert(getType(v.fullName) === "String");
        assert(getType(v.profilePicture) === "String");
        assert(getType(v.type) === "String");
        assert(v.hasOwnProperty("profileUrl"));  // This can be null if the account is disabled
        assert(getType(v.isBirthday) === "Boolean");
      })
      console.log('fca-azadx69x', 'Friends list retrieved, count:', data.length);
      done();
    } catch(e){
      console.error('fca-azadx69x', 'Friends list test failed:', e);
      done(e);
    }
    });
  });

  it('should parse share attachment correctly', function () {
    console.log('fca-azadx69x', 'Parsing share attachment');
    var formatted = formatDeltaMessage(shareAttachmentFixture);
    assert(formatted.attachments[0].type === "share");
    assert(formatted.attachments[0].title === "search engines");
    assert(formatted.attachments[0].target.items[0].name === "search engines");
    assert(formatted.attachments[0].target.items[0].call_to_actions.length === 3);
    assert(formatted.attachments[0].target.items[0].call_to_actions[0].title === "Google");
    console.log('fca-azadx69x', 'Share attachment parsed correctly');
  });

  it('should log out', function (done) {
    console.log('fca-azadx69x', 'Logging out...');
    api.logout(function(err) {
      if (err) {
        console.error('fca-azadx69x', 'Logout failed:', err);
        done(err);
      } else {
        console.log('fca-azadx69x', 'Logout successful');
        done();
      }
    });
  });

  after(function (){
    console.log('fca-azadx69x', 'Tests completed, cleaning up');
    if (stopListening) stopListening();
  });
});
