#!/var/www/vhosts/massaioli.it/cgi-bin/node/bin/node

var fcgi = require('../index.js');
var fs = require('fs');

var count = 0;

function s(obj) {
  return JSON.stringify(obj, null, 4);
}

fcgi.createServer(function(req, res) {
  count += 1;

  req.on('complete', function() {
    str = req.method + ' ' + req.url + ' HTTP/' + req.httpVersion + '\n' +
          s(req.socket) + '\n' + s(req.headers) + '\n\n' +
          s(req.params) + '\n\n' +
          'Should keep alive: ' + res.shouldKeepAlive + '\n\n' +
          "It's working! Request number " + count + '\n';

    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': str.length });
    res.end(str);
  });
}).listen();

process.on('uncaughtException', function(err) {
  fs.appendFileSync('test.log', err.stack + '\n\n');
  process.exit(1);
});

process.on('exit', function() {
  fs.appendFileSync('test.log', 'Exit - Uptime:' + process.uptime() + '\n\n');
});

process.on('SIGTERM', function() {
  fs.appendFileSync('test.log', 'SIGTERM\n');
  process.exit(0);
});

process.on('SIGINT', function() {
  fs.appendFileSync('test.log', 'SIGINT\n');
  process.exit(0);
});

process.on('SIGUSR1', function() {
  fs.appendFileSync('test.log', 'SIGUSR1\n');
});
