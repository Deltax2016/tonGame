var PORT = 8033;
var MAX_ROOM_USERS = 2;

var fs = require('fs');
var log = console.log.bind(console);
var io = require('socket.io')(PORT);

var rooms = {};
var lastUserId = 0;
var lastRoomId = 0;

var MessageType = {
  // A messages you send to server, when want to join or leave etc.
  JOIN: 'join',
  DISCONNECT: 'disconnect',

  // You receive room info as a response for join command. It contains information about
  // the room you joined, and it's users
  ROOM: 'room',

  // A messages you receive from server when another user want to join or leave etc.
  USER_JOIN: 'user_join',
  USER_READY: 'user_ready',
  USER_LEAVE: 'user_leave',
  USER_SIGNED_CHANNEL_CLOSE: 'user_signed_channel_close',
  USER_EDIT_PAYMENT_CHANNEL: 'user_edit_payment_channel',
  USER_TOPUP: 'user_topup',
  USER_CLOSED_CHANNEL: 'user_closed_channel',

  // WebRtc signalling info, session and ice-framework related
  SDP: 'sdp',
  ICE_CANDIDATE: 'ice_candidate',

  // Errors... shit happens
  ERROR_ROOM_IS_FULL: 'error_room_is_full',
  ERROR_USER_INITIALIZED: 'error_user_initialized'
};

function User(walletAddress, publicKey) {
  this.userId = ++lastUserId;
  this.walletAddress = walletAddress;
  this.publicKey = publicKey;
}
User.prototype = {
  getId: function() {
    return this.userId;
  },
  getWalletAddress: function() {
    return this.walletAddress;
  },
  getPublicKey: function() {
    return this.publicKey;
  }
};

function Room(name) {
  this.roomName = name;
  this.users = [];
  this.sockets = {};
}
Room.prototype = {
  getName: function() {
    return this.roomName;
  },
  getUsers: function() {
    return this.users;
  },
  getUserById: function(id) {
    return this.users.find(function(user) {
      return user.getId() === id;
    });
  },
  numUsers: function() {
    return this.users.length;
  },
  isEmpty: function() {
    return this.users.length === 0;
  },
  addUser: function(user, socket) {
    this.users.push(user);
    this.sockets[user.getId()] = socket;
  },
  removeUser: function(id) {
    this.users = this.users.filter(function(user) {
      return user.getId() !== id;
    });
    delete this.sockets[id];
  },
  sendTo: function(user, message, data) {
    var socket = this.sockets[user.getId()];
    socket.emit(message, data);
  },
  sendToId: function(userId, message, data) {
    return this.sendTo(this.getUserById(userId), message, data);
  },
  broadcastFrom: function(fromUser, message, data) {
    this.users.forEach(function(user) {
      if (user.getId() !== fromUser.getId()) {
        this.sendTo(user, message, data);
      }
    }, this);
  }
};

// socket
function handleSocket(socket) {

  var user = null;
  var room = null;

  socket.on(MessageType.JOIN, onJoin);
  socket.on(MessageType.USER_SIGNED_CHANNEL_CLOSE, onUserSignedChannelClose);
  socket.on(MessageType.USER_EDIT_PAYMENT_CHANNEL, onUserEditPaymentChannel);
  socket.on(MessageType.USER_TOPUP, onUserTopup);
  socket.on(MessageType.USER_CLOSED_CHANNEL, onUserClosedChannel);
  socket.on(MessageType.SDP, onSdp);
  socket.on(MessageType.ICE_CANDIDATE, onIceCandidate);
  socket.on(MessageType.DISCONNECT, onLeave);

  function onJoin(joinData) {
    // Somehow sent join request twice?
    if (user !== null || room !== null) {
      room.sendTo(user, MessageType.ERROR_USER_INITIALIZED);
      return;
    }

    // Let's get a room, or create if none still exists
    room = getOrCreateRoom(joinData.roomName);
    if (room.numUsers() >= MAX_ROOM_USERS) {
      room.sendTo(user, MessageType.ERROR_ROOM_IS_FULL);
      return;
    }

    // Add a new user
    room.addUser(user = new User(joinData.walletAddress, joinData.publicKey), socket);

    // Send room info to new user
    room.sendTo(user, MessageType.ROOM, {
      userId: user.getId(),
      roomName: room.getName(),
      users: room.getUsers()
    });
    // Notify others of a new user joined
    room.broadcastFrom(user, MessageType.USER_JOIN, {
      userId: user.getId(),
      user: user
    });
    log('User %s joined room %s. Users in room: %d',
      user.getId(), room.getName(), room.numUsers());
    log(`User ${user.getId()} wallet address: ${user.getWalletAddress()}, public key: ${user.getPublicKey()}`);
  }

  function onUserSignedChannelClose(data) {
    log(`User ${user.getId()} signed channel close`);
    room.broadcastFrom(user, MessageType.USER_SIGNED_CHANNEL_CLOSE, data);
  }
  function onUserEditPaymentChannel(data) {
    log(`User ${user.getId()} edit payment channel`);
    room.broadcastFrom(user, MessageType.USER_EDIT_PAYMENT_CHANNEL, data);
  }

  function onUserClosedChannel(data) {
    log(`User ${user.getId()} closed the channel`);
    room.broadcastFrom(user, MessageType.USER_CLOSED_CHANNEL, data);
  }

  function onUserTopup() {
    log(`User ${user.getId()} closed the channel`);
    room.broadcastFrom(user, MessageType.USER_TOPUP);
  }

  function getOrCreateRoom(name) {
    var room;
    if (!name) {
      name =  ++lastRoomId + '_room';
    }
    if (!rooms[name]) {
      room = new Room(name);
      rooms[name] = room;
    }
    return rooms[name];
  }

  function onLeave() {
    if (room === null) {
      return;
    }
    room.removeUser(user.getId());
    log('User %d left room %s. Users in room: %d',
      user.getId(), room.getName(), room.numUsers());
    if (room.isEmpty()) {
      log('Room is empty - dropping room %s', room.getName());
      delete rooms[room.getName()];
    }
    room.broadcastFrom(user, MessageType.USER_LEAVE, {
      userId: user.getId()
    });
  }

  function onSdp(message) {
    room.sendToId(message.userId, MessageType.SDP, {
      userId: user.getId(),
      sdp: message.sdp
    });
  }

  function onIceCandidate(message) {
    room.sendToId(message.userId, MessageType.ICE_CANDIDATE, {
      userId: user.getId(),
      candidate: message.candidate
    });
  }
}

io.on('connection', handleSocket);
log('Running room server on port %d', PORT);
