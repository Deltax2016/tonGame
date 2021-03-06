// jscs:disable validateIndentation
ig.module(
  'net.room-connection'
)
.requires(
  'game.events',
  'net.peer-connection',
  'ton.channels'
)
.defines(function() {
const TonWeb = window.TonWeb;
const toNano = TonWeb.utils.toNano;

RoomConnection = Events.Emitter.extend({
  peers: null,
  socket: null,
  roomName: null,
  roomInfo: null,
  pendingSdp: null,
  pendidateCandidates: null,
  paymentChannel: null,
  channelToppedUp: 0,

  init: function(roomName, socket) {
    this.parent();
    this.socket = socket;
    this.roomName = roomName;
    this.pendingSdp = {};
    this.pendingCandidates = {};

    this.socketHandlers = {
      'sdp': this.onSdp,
      'ice_candidate': this.onIceCandidate,
      'room': this.onJoinedRoom,
      'user_join': this.onUserJoin,
      'user_ready': this.onUserReady,
      'user_leave': this.onUserLeave,
      'channel_deployed': this.onChannelDeployed,
      'user_topped_up_channel': this.onUserToppedUpChannel,
      'user_inited_channel': this.onUserInitedChannel,
      'user_signed_channel_close': this.onUserSignedChannelClose,
      'user_edit_payment_channel':this.onEditPaymentChannel,
      'user_closed_channel': this.onUserClosedChannel,
      'error': this.onError
    };

    this.peerConnectionHandlers = {
      'open': this.onPeerChannelOpen,
      'close': this.onPeerChannelClose,
      'message': this.onPeerMessage
    };

    Events.on(this.socket, this.socketHandlers, this);
  },

  destroy: function() {
    this.parent();
    Events.off(this.socket, this.socketHandlers, this);
  },

  connect: function(walletAddress, publicKey) {
    this.sendJoin(this.roomName, walletAddress, publicKey);
  },

  initPeerConnection: function(user, isInitiator) {
    // Create connection
    var cnt = new PeerConnection(this.socket, user, isInitiator);
    Events.on(cnt, this.peerConnectionHandlers, this, cnt, user);

    // Sometimes sdp|candidates may arrive before we initialized
    // peer connection, so not to loose the, we save them as pending
    var userId = user.userId;
    var pendingSdp = this.pendingSdp[userId];
    if (pendingSdp) {
      cnt.setSdp(pendingSdp);
      delete this.pendingSdp[userId];
    }
    var pendingCandidates = this.pendingCandidates[userId];
    if (pendingCandidates) {
      pendingCandidates.forEach(cnt.addIceCandidate, cnt);
      delete this.pendingCandidates[userId];
    }
    return cnt;
  },

  startPaymentChannel: function(walletAddress, publicKey, isA) {
    (new TONChannel(walletAddress, publicKey, isA)).then((channel) => {
      this.paymentChannel = channel;
      return this.paymentChannel.create();
    }).then((r) => {
      if (r == 'deployed') {
        this.socket.emit('channel_deployed');
        console.log('Topping up...');
        return this.paymentChannel.topUp().then(() => {
          this.socket.emit('user_topped_up_channel');
          this.onUserToppedUpChannel();
        });
      }
    });
  },

  onChannelDeployed: async function() {
    window.document.getElementById("loadingStage").innerText = "Waiting payment channel creation..."    
    console.log('Other user deployed the channel, topping up...');
    await this.paymentChannel.topUp();
    this.socket.emit('user_topped_up_channel');
    this.onUserToppedUpChannel();
  },

  onUserToppedUpChannel: async function() {
    console.log('User has topped up the channel');
    this.channelToppedUp += 1;
    if (this.channelToppedUp >= 2) {
      if (await this.paymentChannel.init() == 'initialized') {
        console.log('Channel initialized');
        this.socket.emit('user_inited_channel');
      }
    }
  },

  onUserInitedChannel: async function() {
    if (window.document) {
      window.document.getElementById("canvasLoad").style.display = "none";
      window.document.getElementById("canvas").style.display = "inherit";
    }
    console.log('Other user initialized the channel');
  },

  signClosePaymentChannel: async function() {
    if (this.paymentChannel) {
      var signature = await this.paymentChannel.signClose();
      console.log('Signed channel close: ', signature);
      this.socket.emit('user_signed_channel_close', signature);
    }
  },

  onUserSignedChannelClose: async function(signature) {
    document.getElementById("finishGame").innerText = 'Finishing...'; // ?????????? ??????????????, ??????????
    var closeResult = await this.paymentChannel.closeSigned(signature);
    console.log('Closed channel: ', closeResult);
    this.socket.emit('user_closed_channel', closeResult);
    this.emit('channel_closed');
  },

  onUserClosedChannel: async function(closeResult) {
    console.log('The other player has closed the channel: ', closeResult);
    this.emit('user_closed_channel');
  },

  editPaymentChannel: async function() {
    if(this.paymentChannel.channelState.balanceA.eq(toNano("0"))||this.paymentChannel.channelState.balanceB.eq(toNano("0"))){
      await this.signClosePaymentChannel()
    }
    if (this.paymentChannel) {
      var signature = await this.paymentChannel.signState();
      console.log('Signed channel: ', signature);
      this.socket.emit('user_edit_payment_channel', signature);
    }
  },

  onEditPaymentChannel: async function(signature) {
  
    if (!(await this.paymentChannel.channel.verifyState(this.paymentChannel.channelState, TonWeb.utils.hexToBytes(signature)))) {
      alert("Invalid A signature")
      throw new Error('Invalid A signature');
    }else{
      console.log("all good :",this.paymentChannel.channelState);
      this.paymentChannel.lastSignature=signature;
    }
  },



  onSdp: function(message) {
    var userId = message.userId;
    if (!this.peers[userId]) {
      this.log('Adding pending sdp from another player. id = ' + userId, 'gray');
      this.pendingSdp[userId] = message.sdp;
      return;
    }
    this.peers[userId].setSdp(message.sdp);
  },

  onIceCandidate: function(message) {
    var userId = message.userId;
    if (!this.peers[userId]) {
      this.log('Adding pending candidate from another player. id =' + userId, 'gray');
      if (!this.pendingCandidates[userId]) {
        this.pendingCandidates[userId] = [];
      }
      this.pendingCandidates[userId].push(message.candidate);
      return;
    }
    this.peers[userId].addIceCandidate(message.candidate);
  },

  onJoinedRoom: function(roomInfo) {
    this.emit('joined', roomInfo);
    this.roomInfo = roomInfo;
    this.peers = {};
    for (var k in this.roomInfo.users) {
      var user = this.roomInfo.users[k];
      if (user.userId !== this.roomInfo.userId) {
        this.peers[user.userId] = this.initPeerConnection(this.roomInfo.users[k], true);
        this.startPaymentChannel(user.walletAddress, user.publicKey, false);
      }
    }
    console.log('Joined the room: ', roomInfo);
  },

  onError: function(error) {
    this.log('Error connecting to room' + error.message, 'red');
  },

  onUserJoin: function(user) {
    console.log('User joined: ', user.user);
    this.log('Another player joined. id = ' + user.userId, 'orange');
    var peerConnection = this.initPeerConnection(user, false);
    this.roomInfo.users.push(user);
    this.peers[user.userId] = peerConnection;
    this.startPaymentChannel(user.user.walletAddress, user.user.publicKey, true);
  },

  onUserReady: function(user) {
    this.log('Another player ready. id = ' + user.userId, 'orange');
    this.emit('user_ready', user);
  },

  onPeerChannelOpen: function(peer, user) {
    this.emit('peer_open', user, peer);
  },

  onPeerChannelClose: function(peer, user) {
    this.emit('peer_close', user, peer);
  },

  onPeerMessage: function(peer, user, message) {
    this.emit('peer_message', message, user, peer);
  },

  onUserLeave: function(goneUser) {
    if (!this.peers[goneUser.userId]) {
      return;
    }
    var cnt = this.peers[goneUser.userId];
    Events.off(cnt, this.peerConnectionHandlers, this);
    cnt.destroy();
    delete this.peers[goneUser.userId];
    delete this.roomInfo.users[goneUser.userId];
    this.emit('user_leave', goneUser);
  },

  sendJoin: function(roomName, walletAddress, publicKey) {
    this.socket.emit('join', {
      roomName: roomName,
      walletAddress: walletAddress,
      publicKey: publicKey
    });
  },

  sendLeave: function() {
    this.socket.emit(MessageType.LEAVE);
  },

  broadcastMessage: function(message) {
    this.broadcast(MessageBuilder.serialize(message));
  },

  sendMessageTo: function(userId, message) {
    var peer = this.peers[userId];
    this.peerSend(peer, MessageBuilder.serialize(message));
  },

  broadcast: function(arrayBuffer) {
    for (var p in this.peers) {
      this.peerSend(this.peers[p], arrayBuffer);
    }
  },

  peerSend: function(peer, data) {
    peer.sendMessage(data);
  },

  log: function(message, color) {
    console.log('%c%s', 'color:' + color, message);
  }
});

});
