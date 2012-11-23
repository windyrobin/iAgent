var http   = require('http');
var assert = require('assert');
var HAgent = require('../index');

var KPTIME = 1000;
var agent = new HAgent({keepAliveTimeout : KPTIME});

//var agent = new http.Agent();
var HOST = '127.0.0.1';
var PORT = 3334;
var options = {
  host : HOST,
  port : PORT,
  path : '/',
  agent : agent
}

var server = http.createServer(function(req, res){
  res.writeHead(200);
  res.end('ok');
});

server.listen(PORT);

var count = 0;
var socketCount = 0;
function test(){
  var req = http.get(options, function(res){
    res.on('end', function(){
      //console.log('res end');  
      if (++count >= R_NUM * C_NUM) {
        process.nextTick(function(){
          end();
        }, 100);
      }
    })  
  });

  req.on('socket', function(s) {
    if (s.old == null) {
      s.old = true;
      socketCount++;
    }
  });
}

var C_NUM = 100;
var R_NUM = 10;
for(var i = 0; i < R_NUM; i++) {
  for(var j = 0; j < C_NUM; j++) {
    setTimeout(function(){
      test();
     }, i * 100);
  }
}

function debug(str) {
  //console.log(str);
}

function inspect(obj) {
  //console.log(require('util').inspect(obj, false, 10));
}

function end(){
  //server.close();
  //default, the maxSockets is 5
  //debug('end called');
  assert.equal(socketCount, 5);

  var name = HOST + ':' + PORT;
  assert.equal(agent.sockets[name].length, 5) 
  //inspect(agent);
  //after KPTIME, the sockets would be closed
  setTimeout(function() {
    //inspect(agent);
    assert.equal(agent.sockets[name], undefined); 

    server.close();

   }, KPTIME + 100);
}

