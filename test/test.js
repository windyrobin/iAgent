var http   = require('http');
var assert = require('assert');
var HAgent = require('../index');

var agent = new HAgent();
//var agent = new http.Agent();
var PORT = 3334;
var options = {
  host : '127.0.0.1',
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
    if (s._reqCount == null) {
      s._reqCount = 0;
      socketCount++;
    }
    s._reqCount++;
    //console.log(s._reqCount);
    //var name = '127.0.0.1:' + PORT 
    //console.log(agent.sockets[name].length);
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

function end(){
  server.close();
  if (agent.destroy) {
    agent.destroy();
  }
  //default, the maxSockets is 5
  assert.equal(socketCount, 5);
}

