node-fastcgi
============

[![Build Status](https://api.travis-ci.org/fbbdev/node-fastcgi.svg?branch=master)](https://travis-ci.org/fbbdev/node-fastcgi)
[![Coverage Status](https://coveralls.io/repos/fbbdev/node-fastcgi/badge.svg?branch=master)](https://coveralls.io/r/fbbdev/node-fastcgi?branch=master)
[![Dependency Status](https://gemnasium.com/fbbdev/node-fastcgi.svg)](https://gemnasium.com/fbbdev/node-fastcgi)
[![devDependency Status](https://david-dm.org/fbbdev/node-fastcgi/dev-status.svg)](https://david-dm.org/fbbdev/node-fastcgi#info=devDependencies)
[![MIT License](http://img.shields.io/badge/license-MIT-blue.svg?style=flat)](LICENSE)

[![NPM](https://nodei.co/npm/node-fastcgi.png?downloads=true)](https://nodei.co/npm/node-fastcgi/)

This module is a replacement for node's http module (server only). It can be used to build FastCGI applications or to convert existing node applications to FastCGI.

The implementation is fully compliant with [FastCGI 1.0 Specification](http://www.fastcgi.com/drupal/node/6?q=node/22).


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

The API is almost compatible with http module from node v0.12 all the way to v6.2 (the current version).

Differences:
  - A FastCGI server will never emit `'checkContinue'` and `'connect'` events because `CONNECT` method and `Expect: 100-continue` headers should be handled by the front-end http server
  - The `'upgrade'` event is not currently implemented. Typically upgrade/websocket requests won't work with FastCGI applications because of input/output buffering.
  - `server.listen()` can be called without arguments (or with a callback as the only argument) to listen on the default FastCGI socket `{ fd: 0 }`.
  - `server.maxHeadersCount` is useless
  - `request.socket` is not a real socket. Read the next section for more information.
  - `request.trailers` will always be empty: CGI scripts never receive trailers
  - `response.writeContinue()` works as expected but should not be used. See first item

The socket object
-----------------

The socket object exposed in requests and responses implements the `stream.Duplex` interface. It exposes the FastCGI stdin stream (request body)
and translates writes to stdout FastCGI records.
The object also emulates the public API of `net.Socket`. Address fields contain HTTP server and client address and port (`localAddress`, `localPort`, `remoteAddress`, `remotePort` properties and the `address` method).

The socket object exposes three additional properties:
  * `params` is a dictionary of raw CGI params.
  * `dataStream` implements `stream.Readable`, exposes the FastCGI data stream for the filter role.
  * `errorStream` implements `stream.Writable`, translates writes to stderr FastCGI Records.

License
=======

The MIT License (MIT)

Copyright (c) 2016 Fabio Massaioli and other contributors

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
