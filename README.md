node-fastcgi
============

This module is a replacement for node's http module (server only). It can be used to build FastCGI applications or to convert existing node applications to FastCGI.

The implementation is fully compliant with FastCGI 1.0 Specification (http://www.fastcgi.com/drupal/node/6?q=node/22)

Example
-------

```javascript
var fcgi = require('node-fastcgi');

fcgi.createServer(function(req, res) {
  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end("It's working");
  } else {
    res.writeHead(501);
    res.end();
  }
}).listen();
```

http module compatibility
-------------------------

The API is almost compatible with http module api v0.10.23

Differences:
  - A FastCGI server will never emit `'checkContinue'` and `'connect'` events because `CONNECT` method and `Expect: 100-continue` headers should be handled by the front-end http server
  - The `'upgrade'` event is not currently implemented. Typically upgrade/websocket requests won't work with FastCGI applications because of input/output buffering.
  - `server.listen()` can be called without arguments to listen on the default FastCGI socket `{ fd: 0 }`
  - `server.maxHeadersCount` is useless
  - `request.socket` is not a real socket. It's an object containing HTTP server and client address and port (localAddress, localPort, remoteAddress, remotePort properties)
  - `request.trailers` will always be empty: CGI scripts never receive trailers
  - `response.writeContinue()` works as expected but should not be used. See first item
