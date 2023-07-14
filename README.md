# node-fastcgi

[![Test Status](https://github.com/fbbdev/node-fastcgi/actions/workflows/test.yml/badge.svg)](https://github.com/fbbdev/node-fastcgi/actions/workflows/test.yml)
[![Coverage Status](https://coveralls.io/repos/github/fbbdev/node-fastcgi/badge.svg?branch=master)](https://coveralls.io/github/fbbdev/node-fastcgi?branch=master)
[![Published version](https://img.shields.io/npm/v/node-fastcgi)](https://www.npmjs.com/package/node-fastcgi)
[![MIT License](http://img.shields.io/badge/license-MIT-blue.svg?style=flat)](LICENSE)

This module is a drop-in replacement for node's standard http module (server only). Code written for a http server should work without changes with FastCGI. It can be used to build FastCGI applications or to convert existing node applications to FastCGI.

The implementation is fully compliant with the [FastCGI 1.0 Specification](https://fast-cgi.github.io/spec).

## Example

```javascript
var fcgi = require('node-fastcgi');

fcgi.createServer(function(req, res) {
  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end("It's working");
  } else if (req.method === 'POST') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    var body = "";

    req.on('data', function(data) { body += data.toString(); });
    req.on('end', function() {
      res.end("Received data:\n" + body);
    });
  } else {
    res.writeHead(501);
    res.end();
  }
}).listen();
```

## Server constructor

The `createServer` function takes four **optional** parameters:

  - `responder`: callback for FastCGI responder requests (normal HTTP requests, listener for the `'request'` event).
  - `authorizer`: callback for FastCGI authorizer requests (listener for the `'authorize'` event)
  - `filter`: callback for FastCGI filter requests (listener for the `'filter'` event)
  - `config`: server configuration

`config` is an object with the following defaults:

```js
{
  maxConns: 2000,
  maxReqs: 2000,
  multiplex: true,
  valueMap: {}
}
```

`maxConns` is the maximum number of connections accepted by the server. This limit is not enforced, it is only used to provide the FCGI_MAX_CONNS value when queried by a FCGI_GET_VALUES record.

`maxReqs` is the maximum number of total concurrent requests accepted by the server (over all connections). The limit is not enforced, but compliant clients should respect it, so do not set it too low. This setting is used to provide the FCGI_MAX_REQS value.

`multiplex` enables or disables request multiplexing on a single connection. This setting is used to provide the FCGI_MPXS_CONNS value.

`valueMap` maps FastCGI value names to keys in the `config` object. For more information read [the next section](#fastcgi-values)

## FastCGI values

FastCGI clients can query configuration values from applications with FCGI_GET_VALUES records. Those records contain a sequence of key-value pairs with empty values; the application must fetch the corresponding values for each key and send the data back to the client.

This module retrieves automatically values for standard keys (`FCGI_MAX_CONNS`, `FCGI_MAX_REQS`, `FCGI_MPXS_CONNS`) from server configuration.

To provide additional values, add them to the configuration object and add entries to the `valueMap` option mapping value names to keys in the config object. For example:

```js
fcgi.createServer(function (req, res) { /* ... */ }, {
    additionalValue: 1350,
    valueMap: {
        'ADDITIONAL_VALUE': 'additionalValue'
    }
});
```

**WARNING: The `valueMap` API is a bad design choice and is going to change in the future.**

## Listening for connections

When a FastCGI service is started, the stdin descriptor (fd 0) [is replaced by a bound socket](https://fast-cgi.github.io/spec#accepting-transport-connections). The service application can then start listening on that socket and accept connections.

This is done automatically when you call the `listen` method on the server object without arguments, or with a callback as the only argument.

The `isService` function is provided to check whether the listen method can be
called without arguments. **WARNING: The function always returns false on
windows.**

```js
if (fcgi.isService()) {
    fcgi.createServer(/* ... */).listen();
} else {
    console.log("This script must be run as a FastCGI service");
}
```

## Request URL components

The `url` property of the request object is taken from the `REQUEST_URI` CGI variable, which is non-standard. If `REQUEST_URI` is missing, the url is built by joining three CGI variables:

  - [`SCRIPT_NAME`](https://tools.ietf.org/html/rfc3875#section-4.1.13)
  - [`PATH_INFO`](https://tools.ietf.org/html/rfc3875#section-4.1.5)
  - [`QUERY_STRING`](https://tools.ietf.org/html/rfc3875#section-4.1.7)

For more information read [section 4.1](https://tools.ietf.org/html/rfc3875#section-4.1) of the CGI spec.

Raw CGI variables can be accessed through the `params` property of the socket object. More information [here](#the-socket-object).

## Authorizer and filter requests

Authorizer requests may have no url. Response objects for the authorizer role come with the `Content-Type` header already set to `text/plain` and expose three additional methods:

  - `setVariable(name, value)`: sets CGI variables to be passed to subsequent request handlers.
  - `allow()`: sends a 200 (OK) status code and closes the response
  - `deny()`: sends a 403 (Forbidden) status code and closes the response

Filter requests have an additional data stream exposed by the `dataStream` property of [the socket object](#the-socket-object) (`req.socket.dataStream`).

## The socket object

The socket object exposed in requests and responses implements the `stream.Duplex` interface. It exposes the FastCGI stdin stream (request body)
and translates writes to stdout FastCGI records.
The object also emulates the public API of `net.Socket`. Address fields contain HTTP server and client address and port (`localAddress`, `localPort`, `remoteAddress`, `remotePort` properties and the `address` method).

The socket object exposes three additional properties:
  - `params` is a dictionary of raw CGI params.
  - `dataStream` implements `stream.Readable`, exposes the FastCGI data stream for the filter role.
  - `errorStream` implements `stream.Writable`, translates writes to stderr FastCGI Records.

## http module compatibility

The API is almost compatible with the http module from node v0.12 all the way to v6.x (the current series). Only the server API is implemented.

Differences:
  - A FastCGI server will never emit `'checkContinue'` and `'connect'` events because `CONNECT` method and `Expect: 100-continue` headers should be handled by the front-end http server
  - The `'upgrade'` event is not currently implemented. Typically upgrade/websocket requests won't work with FastCGI applications because of input/output buffering.
  - `server.listen()` can be called without arguments (or with a callback as the only argument) to listen on the default FastCGI socket `{ fd: 0 }`.
  - `server.maxHeadersCount` is useless
  - `req.socket` [is not a real socket](#the-socket-object).
  - `req.trailers` will always be empty: CGI scripts never receive trailers
  - `res.writeContinue()` works as expected but should not be used. See first item

# License

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
