/**
 * Copyright Robert Groh and other contributors
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the 'Software'), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

'use strict';
/*global describe, it, before, after */ //, xit, beforeEach, afterEach */
/*jshint node: true */
/*jshint expr: true*/

var expect = require('chai').expect
  , request = require('request')
  , path = require('path');

var fcgiFramework = require('../../../index.js'); //this we want to test

function randomInt(low, high) {
    return Math.floor(Math.random() * (high - low + 1) + low);
}


describe('echo Server', function setup() {
    var port = 0
      , socketPath = path.join(__dirname, 'echoServer_Socket' + randomInt(1000, 2000));

    before(function startFastCgiApplication(done) {
        function answerWithError(res, err) {
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': err.stack.length });
            res.end(err.stack + '\n');
        }

        fcgiFramework.createServer(
            function echo(req, res) {
                var requestData;

                req.on('data', function (data) {
                    requestData = requestData + data;
                });

                req.on('complete', function writeReqAsJson() {
                    var echoData
                      , size
                      , strippedRequest = require('lodash').omit(req, 'connection', 'buffer', 'socket', '_events', '_readableState', 'data');

                    strippedRequest.data = requestData;

                    try {
                        echoData = JSON.stringify(strippedRequest, null, 4); //hopefully only here will an error be thrown
                        size = Buffer.byteLength(echoData, 'utf8');
                        res.writeHead(
                            200,
                            {
                                'Content-Type': 'application/json; charset=utf-8',
                                'Content-Length': size
                            }
                        );
                        res.end(echoData);
                    } catch (err) {
                        answerWithError(res, err);
                    }
                });

                req.on('error', answerWithError.bind(undefined, res));
            }
        ).listen(socketPath, function cgiStarted(err) {
            if (err) {
                done(err);
            } else {
                console.log('cgi app listen on socket:' + socketPath);

                var http = require('http');
                var fcgiHandler = require('fcgi-handler');

                var server = http.createServer(function (req, res) {
                    fcgiHandler.connect({path: socketPath}, function (err, fcgiProcess) {
                        if (err) {
                            answerWithError(res, err);
                        } else {
                            //route all request to fcgi application
                            fcgiProcess.handle(req, res, {/*empty Options*/});
                        }
                    });
                });
                server.listen(port, function httpServerStarted(err) {
                    port = server.address().port;
                    done(err);
                });
            }
        });
    });

    it('should answer with the request', function checkResponse(done) {
        request({
            uri: 'http://localhost:' + port,
            method: 'GET'
        }, function (err, res, body) {
            expect(res.statusCode).to.be.equal(200);
            expect(res.headers['content-type']).to.be.equal('application/json; charset=utf-8');
            expect(res.headers['content-length']).to.be.equal('812');

            var echo = JSON.parse(body);
            expect(echo.cgiParams).to.be.deep.equal({
                'PATH_INFO': '/',
                'SERVER_PROTOCOL': 'HTTP/1.1',
                'SERVER_SOFTWARE': 'Node/' + process.version,
                'REQUEST_METHOD': 'GET',
                'QUERY_STRING': '',
                'HTTP_HOST': 'localhost:' + port,
                'HTTP_CONNECTION': 'keep-alive'
            });

            done(err);
        });
    });

    after(function removeSocketPath(done) {
        require('fs').unlink(socketPath, done);
    });
});