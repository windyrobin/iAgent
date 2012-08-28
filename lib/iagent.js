var net  = require('net');
var util = require('util');
var EventEmitter = require('events').EventEmitter;

// New Agent code.
// The largest departure from the previous implementation is that
// an Agent instance holds connections for a variable number of host:ports.
// Surprisingly, this is still API compatible as far as third parties are
// concerned. The only code that really notices the difference is the
// request object.

// Another departure is that all code related to HTTP parsing is in
// ClientRequest.onSocket(). The Agent is now *strictly*
// concerned with managing a connection pool.

function Agent(options) {
  var self = this;
  self.options = options || {};
  self.requests = {};

  self.sockets = {};
  self.maxSockets = self.options.maxSockets || Agent.defaultMaxSockets;
  self.maxKeepAliveTime = self.options.maxKeepAliveTime || 15*1000;

  self.on('free', function(socket, host, port) {
    var name = host + ':' + port;
    if (self.requests[name] && self.requests[name].length) {
      self.requests[name].shift().onSocket(socket);
      if (self.requests[name].length === 0) {
        // don't leak
        delete self.requests[name];
      }
    } else {
      // If there are no pending requests just destroy the
      // socket and it will get removed from the pool. This
      // gets us out of timeout issues and allows us to
      // default to Connection:keep-alive.
      //socket.destroy();
      socket._used = false;
    }
  });
  self.createConnection = net.createConnection;
}

util.inherits(Agent, EventEmitter);
module.exports = Agent;

Agent.defaultMaxSockets = 5;

Agent.prototype.defaultPort = 80;
Agent.prototype.addRequest = function(req, host, port) {
  var name = host + ':' + port;
  if (!this.sockets[name]) {
    this.sockets[name] = [];
  }
  var sn = this.sockets[name];
  var found = false;
  for (var i = 0; i < sn.length; i++) {
    var s = sn[i];
    if (s._used !== true) {
      s._used = true;
      req.onSocket(s);
      found = true;
      break;
    }
  }
  if(found) return;

  if (sn.length < this.maxSockets) {
    // If we are under maxSockets create a new one.
    var s = this.createSocket(name, host, port);
    s._used = true;
    req.onSocket(s);
  } else {
    // We are over limit so we'll add it to the queue.
    if (!this.requests[name]) {
      this.requests[name] = [];
    }
    this.requests[name].push(req);
  }
};

Agent.prototype.createSocket = function(name, host, port) {
  var self = this;
  var s = self.createConnection(port, host, self.options);
  if (!self.sockets[name]) {
    self.sockets[name] = [];
  }
  s.setNoDelay(true);
  s.setTimeout(self.maxKeepAliveTime);
  s.addListener('timeout', function() {
    s.destroy();
  });

  this.sockets[name].push(s);
  var onFree = function() {
    self.emit('free', s, host, port);
  }
  s.on('free', onFree);
  var onClose = function(err) {
    // This is the only place where sockets get removed from the Agent.
    // If you want to remove a socket from the pool, just close it.
    // All socket errors end in a close event anyway.
    self.removeSocket(s, name, host, port);
  }
  s.on('close', onClose);
  var onRemove = function() {
    // We need this function for cases like HTTP "upgrade"
    // (defined by WebSockets) where we need to remove a socket from the pool
    //  because it'll be locked up indefinitely
    self.removeSocket(s, name, host, port);
    s.removeListener('close', onClose);
    s.removeListener('free', onFree);
    s.removeListener('agentRemove', onRemove);
  }
  s.on('agentRemove', onRemove);
  return s;
};

Agent.prototype.removeSocket = function(s, name, host, port) {
  if (this.sockets[name]) {
    var index = this.sockets[name].indexOf(s);
    if (index !== -1) {
      this.sockets[name].splice(index, 1);
      if (this.sockets[name].length === 0) {
        // don't leak
        delete this.sockets[name];
      }
    }
  }
  if (this.requests[name] && this.requests[name].length) {
    // If we have pending requests and a socket gets closed a new one
    // needs to be created to take over in the pool for the one that closed.
    this.createSocket(name, host, port).emit('free');
  }
};

Agent.prototype.destroy = function() {
  for (var name in this.sockets) {
    var sockets = this.sockets[name];
    if (Array.isArray(sockets)) {
      sockets.forEach(function(s){
        s.destroy();    
      })
    }
  }
}
