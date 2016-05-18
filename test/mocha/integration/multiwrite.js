/**
 * Copyright (c) 2016 Fabio Massaioli, Robert Groh and other contributors
 *
 * Code from Node http module:
 *   Copyright Joyent, Inc. and other Node contributors
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
/*global describe, it, before, after */
/*jshint node: true */
/*jshint expr: true*/

var expect = require('chai').expect,
    request = require('request'),
    path = require('path');

var fcgiFramework = require('../../../index.js'); //this we want to test

function randomInt(low, high) {
    return Math.floor(Math.random() * (high - low + 1) + low);
}


describe('multiwrite Server', function setup() {
    var port = 0, //will choose a random (and hopefully free) port
        socketPath = path.join(__dirname, 'multiwriteServer_Socket' + randomInt(1000, 2000));

    before(function startFastCgiApplication(done) {
        function answerWithError(res, err) {
            res.writeHead(500, {
                'Content-Type': 'text/plain; charset=utf-8',
                'Content-Length': err.stack.length + 1
            });
            res.end(err.stack + '\n');
        }

        fcgiFramework.createServer(function multiwrite(req, res) {
            req.resume();
            req.on('end', function () {
                try {
                    res.writeHead(200, {
                        'Content-Type': 'text/plain; charset=utf-8',
                        'Content-Length': 4
                    });

                    res.write("a");
                    res.write("b");
                    res.end("c");
                } catch (err) {
                    answerWithError(res, err);
                }
            });

            req.on('error', answerWithError.bind(undefined, res));
        }).listen(socketPath, function cgiStarted(err) {
            if (err) {
                done(err);
            } else {
                console.log('cgi app listen on socket:' + socketPath);

                var http = require('http');
                var fcgiHandler = require('fcgi-handler');

                var server = http.createServer(function (req, res) {
                    fcgiHandler.connect({
                        path: socketPath
                    }, function (err, fcgiProcess) {
                        if (err) {
                            answerWithError(res, err);
                        } else {
                            //route all request to fcgi application
                            fcgiProcess.handle(req, res, { /*empty Options*/ });
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

    it('should answer with the expected response', function checkResponse(done) {
        request({
            uri: 'http://localhost:' + port,
            method: 'GET'
        }, function (err, res, body) {
            expect(res.statusCode).to.be.equal(200);
            expect(body).to.be.equal("abc");
            done(err);
        });
    });

    after(function removeSocketPath(done) {
        require('fs').unlink(socketPath, done);
    });
});
